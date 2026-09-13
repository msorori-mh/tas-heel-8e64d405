-- Only run after the disposable CF11/V2 rehearsal and question-image migration.
RESET ROLE;
CREATE TEMP TABLE image_checks(label text);
CREATE FUNCTION pg_temp.image_check(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'IMAGE_CHECK_FAILED: %',label; END IF;
INSERT INTO image_checks VALUES(label); END $$;
GRANT ALL ON image_checks TO authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);

CREATE FUNCTION pg_temp.test_image() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('alt','دائرة كهربائية','src','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=')
$$;
SELECT pg_temp.image_check(lesson_question_private.valid_image(NULL),'optional image');
SELECT pg_temp.image_check(NOT EXISTS(SELECT 1 FROM question_image_old_hashes h WHERE h.canonical IS DISTINCT FROM public._qb_build_revision_canonical_jcs(h.id)),'all existing canonical hashes remain unchanged');
SELECT pg_temp.image_check(lesson_question_private.valid_image(pg_temp.test_image()),'valid embedded PNG');
SELECT pg_temp.image_check(NOT lesson_question_private.valid_image(jsonb_build_object('src','https://example.org/x.png','alt','رسم')),'reject external link in database');
SELECT pg_temp.image_check(NOT lesson_question_private.valid_image(pg_temp.test_image()||'{"alt":""}'),'require description');
SELECT pg_temp.image_check(NOT lesson_question_private.valid_image(pg_temp.test_image()||'{"answer":"secret"}'),'reject extra fields');
SELECT pg_temp.image_check(NOT lesson_question_private.valid_image(jsonb_build_object('src','data:image/png;base64,SGVsbG8=','alt','رسم')),'check actual raster signature');
SELECT pg_temp.image_check(NOT has_function_privilege('anon','public.get_lesson_questions_with_images(uuid,text)','execute'),'anonymous cannot read');
SELECT pg_temp.image_check(NOT has_function_privilege('anon','public.get_lesson_question_images(uuid[])','execute'),'anonymous cannot batch read');
SELECT pg_temp.image_check(has_table_privilege('authenticated','public.question_revisions','select')=(SELECT revision_select FROM image_baseline_privileges),'no new direct revision read privilege');

SELECT pg_temp.lcpv2_verified_intake('image-official','officialBookQuestions',
 jsonb_build_object('questions',jsonb_build_array(jsonb_build_object('id','O1','question_code','O1','question','حدد أجزاء الدائرة','question_text','حدد أجزاء الدائرة','interaction_type','LONG_TEXT','question_type','EXTENDED_RESPONSE','type','extended_response','options','[]'::jsonb,'question_image',pg_temp.test_image())))::text,
 '{"reveal":"SERVER_CONTROLLED_REVEAL_ONLY","answers":[{"capability":"officialBookQuestions","question_id":"O1","grading_mode":"MANUAL","model_answer":"إجابة سرية","explanation":"شرح سري"}]}'::jsonb);
SELECT pg_temp.lcpv2_verified_intake('image-self','selfTest',
 jsonb_build_object('questions',jsonb_build_array(jsonb_build_object('id','S1','question_code','S1','question','تأمل الدائرة ثم اختر','question_text','تأمل الدائرة ثم اختر','type','multiple_choice','options',jsonb_build_array('one','two','three','four'),'question_image',pg_temp.test_image())))::text,
 '{"reveal":"SERVER_CONTROLLED_REVEAL_ONLY","answers":[{"capability":"selfTest","question_id":"S1","correct_index":2,"correct_option":"(b)","explanation":"شرح سري","rationale":"شرح سري"}]}'::jsonb);

SET ROLE authenticated;
SELECT public.lesson_component_publish_v2((SELECT intake_id FROM lcpv2_proof_intakes WHERE label='image-official'),'image-official-publish');
SELECT public.lesson_component_publish_v2((SELECT intake_id FROM lcpv2_proof_intakes WHERE label='image-self'),'image-self-publish');
SELECT pg_temp.image_check((public.lesson_component_publish_v2((SELECT intake_id FROM lcpv2_proof_intakes WHERE label='image-self'),'image-self-publish')->>'writes_performed')::int=0,'exact replay writes zero rows');

RESET ROLE;
SELECT pg_temp.image_check((SELECT count(*)=2 FROM public.questions q JOIN public.question_revisions r ON r.id=q.current_published_revision_id WHERE q.lesson_id='43000000-0000-0000-0000-0000000000b2' AND r.question_image=pg_temp.test_image()),'both actual import paths persist the image');
SELECT pg_temp.image_check((SELECT bool_and(r.payload_hash=public._qb_compute_revision_payload_hash(r.id)) FROM public.question_revisions r WHERE r.question_image IS NOT NULL),'published hashes include images');
DO $$ DECLARE r uuid; BEGIN
 SELECT id INTO r FROM public.question_revisions WHERE question_image IS NOT NULL AND status='PUBLISHED' LIMIT 1;
 BEGIN UPDATE public.question_revisions SET question_image=question_image||'{"alt":"تغيير"}' WHERE id=r;
 RAISE EXCEPTION 'unexpected image mutation';
 EXCEPTION WHEN check_violation THEN PERFORM pg_temp.image_check(true,'published figure is immutable'); END;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',false);
SELECT pg_temp.image_check(jsonb_array_length(public.get_lesson_questions_with_images('43000000-0000-0000-0000-0000000000b2','official'))=1,'student receives official figure');
SELECT pg_temp.image_check(public.get_lesson_questions_with_images('43000000-0000-0000-0000-0000000000b2','official')->0->'question_image'=pg_temp.test_image(),'student image matches imported bytes');
SELECT pg_temp.image_check(public.get_lesson_questions_with_images('43000000-0000-0000-0000-0000000000b2','self_test')::text !~ '(model_answer|is_correct|explanation|rationale)','initial payload has no answers');
SELECT pg_temp.image_check((SELECT count(*)=1 FROM public.get_lesson_official_questions('43000000-0000-0000-0000-0000000000b2')),'old client RPC remains compatible');
SELECT pg_temp.image_check((SELECT count(*)=2 FROM jsonb_object_keys(public.get_lesson_question_images(ARRAY['43000000-0000-0000-0000-0000000000b2']::uuid[]))),'unit practice receives both figures');
SELECT pg_temp.image_check(public.get_lesson_questions_with_images('ffffffff-ffff-ffff-ffff-ffffffffffff','official')='[]','unknown lesson has no payload');
DO $$ BEGIN
 BEGIN PERFORM public.lesson_self_test_questions_admin_list('43000000-0000-0000-0000-0000000000b2');
 RAISE EXCEPTION 'unexpected staff read'; EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.image_check(true,'student cannot use admin listing'); END;
END $$;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT pg_temp.image_check(public.get_lesson_question_images(ARRAY['43000000-0000-0000-0000-0000000000b2']::uuid[])='{}','missing JWT cannot retrieve images');

RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
SELECT pg_temp.image_check(public.lesson_self_test_questions_admin_list('43000000-0000-0000-0000-0000000000b2')->0->'question_image'=pg_temp.test_image(),'admin preview retains figure');
SELECT public.lesson_self_test_question_update('43000000-0000-0000-0000-0000000000b2',
 (SELECT q.id FROM public.questions q JOIN public.question_revisions r ON r.id=q.current_published_revision_id WHERE q.lesson_id='43000000-0000-0000-0000-0000000000b2' AND r.educational_label='SELF_TEST'),
 'تأمل الدائرة ثم اختر الإجابة',
 '[{"option_code":"a","body":"one"},{"option_code":"b","body":"two"},{"option_code":"c","body":"three"},{"option_code":"d","body":"four"}]'::jsonb,'b','شرح جديد',1,'TEST_ONLY figure preservation');
SELECT pg_temp.image_check(public.lesson_self_test_questions_admin_list('43000000-0000-0000-0000-0000000000b2')->0->'question_image'=pg_temp.test_image(),'answer edit carries image to new revision');

-- A rejected image must roll back all earlier superseding/writes in the publication.
SELECT pg_temp.lcpv2_verified_intake('image-invalid','officialBookQuestions',
 '{"questions":[{"id":"O1","question":"bad replacement","question_type":"EXTENDED_RESPONSE","interaction_type":"LONG_TEXT","options":[],"question_image":{"src":"https://example.org/x.png","alt":"رسم"}}]}',
 '{"answers":[{"capability":"officialBookQuestions","question_id":"O1","grading_mode":"MANUAL","model_answer":"answer"}]}'::jsonb);
DO $$ DECLARE before_ids uuid[]; after_ids uuid[]; BEGIN
 SELECT array_agg(current_published_revision_id ORDER BY id) INTO before_ids FROM public.questions WHERE lesson_id='43000000-0000-0000-0000-0000000000b2';
 BEGIN
  PERFORM public.lesson_component_publish_v2((SELECT intake_id FROM lcpv2_proof_intakes WHERE label='image-invalid'),'image-invalid-publish');
  RAISE EXCEPTION 'invalid image published';
 EXCEPTION WHEN check_violation THEN PERFORM pg_temp.image_check(true,'invalid image rejected by actual publisher'); END;
 SELECT array_agg(current_published_revision_id ORDER BY id) INTO after_ids FROM public.questions WHERE lesson_id='43000000-0000-0000-0000-0000000000b2';
 PERFORM pg_temp.image_check(before_ids=after_ids,'failed image publication preserves existing questions');
END $$;

-- Reimport without a figure explicitly removes it from the new revision only.
SELECT pg_temp.lcpv2_verified_intake('image-removed','officialBookQuestions',
 '{"questions":[{"id":"O1","question":"سؤال نصي بعد حذف الصورة","question_type":"EXTENDED_RESPONSE","interaction_type":"LONG_TEXT","options":[]}]}',
 '{"answers":[{"capability":"officialBookQuestions","question_id":"O1","grading_mode":"MANUAL","model_answer":"answer"}]}'::jsonb);
SELECT public.lesson_component_publish_v2((SELECT intake_id FROM lcpv2_proof_intakes WHERE label='image-removed'),'image-removed-publish');
SELECT pg_temp.image_check(public.get_lesson_questions_with_images('43000000-0000-0000-0000-0000000000b2','official')->0->'question_image'='null','reimport can remove the figure');
SELECT pg_temp.image_check(EXISTS(SELECT 1 FROM public.question_revisions WHERE question_image=pg_temp.test_image() AND status='SUPERSEDED'),'previous revision keeps its original image');
SELECT count(*) AS passed_question_image_checks FROM image_checks;
