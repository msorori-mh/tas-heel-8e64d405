-- MINISTERIAL_QUESTION_MEDIA_V1 — runtime contract on disposable PG17 only.
--
-- Proves, against the real migration chain + the pending media migration:
--   * v1 packages (no media) still import; media inside v1 is refused
--   * v2 media validation fails closed (placement/mime/size/sha/duplicates)
--   * execute is atomic: a missing or mismatched storage object rolls back
--     the whole import (no model, no question, no media row survives)
--   * media rows land on the published revision and are frozen with it
--   * sessions pin media; state hides SOLUTION; reveal/result expose it
--   * ministerial_media_can_access() gates by session ownership + reveal
--   * admin editing is blocked while sessions exist, otherwise creates a NEW
--     revision (carry-over / replace / clear) and never mutates the old one
--   * privileges: no anon path, internal helpers are service_role-only
\set ON_ERROR_STOP on
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION pg_temp.chk(_name text, _expected text, _actual text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _expected IS NOT DISTINCT FROM _actual THEN
    RAISE NOTICE 'PASS  %', _name;
  ELSE
    RAISE EXCEPTION 'FAIL  % (expected=% actual=%)', _name, _expected, _actual;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.actor(_uid uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), false);
END;
$$;

-- Runs a statement and returns the SQLSTATE/message prefix it raised ('' when it succeeded).
CREATE OR REPLACE FUNCTION pg_temp.raised(_sql text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN '';
EXCEPTION WHEN OTHERS THEN
  RETURN split_part(SQLERRM, ':', 1);
END;
$$;

-- Local stand-in for an uploaded object (what the browser upload step produces).
CREATE OR REPLACE FUNCTION pg_temp.upload(_key text, _size bigint, _mime text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO storage.objects(bucket_id, name, metadata)
  VALUES ('question-media', _key, jsonb_build_object('size', _size, 'mimetype', _mime))
  ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata;
END;
$$;

DO $test$
DECLARE
  c_staff uuid := 'a2000000-0000-0000-0000-000000000001';
  c_admin uuid := 'a2000000-0000-0000-0000-000000000002';
  c_student uuid := 'a2000000-0000-0000-0000-000000000003';
  c_other_student uuid := 'a2000000-0000-0000-0000-000000000004';
  c_grade uuid := 'b2000000-0000-0000-0000-000000000001';
  c_subject uuid := 'b2000000-0000-0000-0000-000000000002';
  c_sha_q text := repeat('1', 64);
  c_sha_b text := repeat('2', 64);
  c_sha_s text := repeat('3', 64);
  c_sha_new text := repeat('4', 64);
  c_sha_aden text := repeat('5', 64);
  v_sanaa_track uuid;
  v_aden_track uuid;
  v_media_q jsonb;
  v_media_b jsonb;
  v_media_s jsonb;
  v_question_1 jsonb;
  v_question_2 jsonb;
  v_package jsonb;
  v_v1_package jsonb;
  v_aden_package jsonb;
  v_prepare jsonb;
  v_result jsonb;
  v_model uuid;
  v_model_2 uuid;
  v_question_id uuid;
  v_revision uuid;
  v_new_revision uuid;
  v_session uuid;
  v_esq uuid;
  v_state jsonb;
  v_reveal jsonb;
  v_rendered jsonb;
  v_question_media_id uuid;
  v_solution_media_id uuid;
  v_count integer;
  v_text text;
BEGIN
  SET session_replication_role = replica;
  INSERT INTO auth.users(id, email) VALUES
    (c_staff, 'media-staff@test.local'),
    (c_admin, 'media-admin@test.local'),
    (c_student, 'media-student@test.local'),
    (c_other_student, 'media-other@test.local')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles(user_id, role) VALUES
    (c_staff, 'content_manager'),
    (c_admin, 'admin')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.curriculum_tracks(track_code, track_name, is_active) VALUES
    ('sanaa', 'منهج صنعاء', true),
    ('aden', 'منهج عدن', true)
  ON CONFLICT (track_code) DO NOTHING;
  SELECT id INTO v_sanaa_track FROM public.curriculum_tracks WHERE track_code = 'sanaa';
  SELECT id INTO v_aden_track FROM public.curriculum_tracks WHERE track_code = 'aden';
  INSERT INTO public.grades(id, slug, name, category, sort_order, curriculum_track_id)
  VALUES (c_grade, 'grade-12', 'الثالث الثانوي', 'secondary', 12, NULL)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.subjects(id, grade_id, slug, name, code, curriculum_track_id)
  VALUES (c_subject, c_grade, 'physics-ministerial-media', 'الفيزياء', 'sub-g12-002', NULL)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.subject_curriculum_tracks(subject_id, curriculum_track_id, is_active) VALUES
    (c_subject, v_sanaa_track, true),
    (c_subject, v_aden_track, true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles(user_id, full_name, grade_id, grade_uuid, curriculum_track_id) VALUES
    (c_staff, 'مشغل المحتوى', c_grade::text, c_grade, v_sanaa_track),
    (c_admin, 'ناشر المحتوى', c_grade::text, c_grade, v_sanaa_track),
    (c_student, 'طالب', c_grade::text, c_grade, v_sanaa_track),
    (c_other_student, 'طالب آخر', c_grade::text, c_grade, v_sanaa_track)
  ON CONFLICT DO NOTHING;
  SET session_replication_role = origin;

  -- ------------------------------------------------------------------ helpers
  PERFORM pg_temp.chk('storage key mirrors the TS contract',
    'ministerial/11/' || c_sha_q || '.png',
    public.ministerial_media_storage_key(c_sha_q, 'image/png'));
  PERFORM pg_temp.chk('jpeg keys use .jpg', 'ministerial/22/' || c_sha_b || '.jpg',
    public.ministerial_media_storage_key(c_sha_b, 'image/jpeg'));
  PERFORM pg_temp.chk('placement is derived from media_code', 'OPTION_B',
    public.ministerial_media_placement('MEDIA-OPTION_B'));
  PERFORM pg_temp.chk('foreign media codes are not ministerial', NULL,
    public.ministerial_media_placement('MEDIA-STIMULUS'));

  v_media_q := jsonb_build_object('placement', 'QUESTION', 'file_name', 'q1.png', 'sha256', c_sha_q,
    'mime_type', 'image/png', 'file_size', 1200, 'alt_text_ar', 'شكل الدائرة');
  v_media_b := jsonb_build_object('placement', 'OPTION_B', 'file_name', 'b.jpg', 'sha256', c_sha_b,
    'mime_type', 'image/jpeg', 'file_size', 800, 'alt_text_ar', 'صورة الخيار ب');
  v_media_s := jsonb_build_object('placement', 'SOLUTION', 'file_name', 'sol.webp', 'sha256', c_sha_s,
    'mime_type', 'image/webp', 'file_size', 640, 'alt_text_ar', 'خطوات الحل');

  v_question_1 := jsonb_build_object(
    'question_text', 'ما قيمة التيار في الدائرة المبينة؟',
    'options', jsonb_build_array(
      jsonb_build_object('option_code', 'A', 'body', '1A'),
      jsonb_build_object('option_code', 'B', 'body', 'انظر الصورة'),
      jsonb_build_object('option_code', 'C', 'body', '3A'),
      jsonb_build_object('option_code', 'D', 'body', '4A')),
    'correct_option_code', 'B',
    'model_answer', 'انظر الصورة',
    'explanation', 'قانون أوم.',
    'display_order', 1, 'marks', 1,
    'media', jsonb_build_array(v_media_s, v_media_q, v_media_b));
  v_question_2 := jsonb_build_object(
    'question_text', 'وحدة قياس المقاومة هي؟',
    'options', jsonb_build_array(
      jsonb_build_object('option_code', 'A', 'body', 'أوم'),
      jsonb_build_object('option_code', 'B', 'body', 'فولت'),
      jsonb_build_object('option_code', 'C', 'body', 'أمبير'),
      jsonb_build_object('option_code', 'D', 'body', 'واط')),
    'correct_option_code', 'A', 'model_answer', 'أوم', 'explanation', '',
    'display_order', 2, 'marks', 1);

  v_package := jsonb_build_object(
    'contract_version', 'ministerial_track_package_v2',
    'track_code', 'sanaa', 'subject_code', 'sub-g12-002', 'subject_name', 'الفيزياء',
    'source_filename', 'sanaa-media.zip', 'source_sha256', repeat('c', 64),
    'models', jsonb_build_array(jsonb_build_object(
      'model_label', 'صنعاء 2025 — نموذج 1', 'academic_year', 2025, 'variant_code', 'm01',
      'worksheet_name', 'نموذج_1', 'declared_question_count', 2,
      'questions', jsonb_build_array(v_question_1, v_question_2))));

  -- ------------------------------------------------------------ authorization
  PERFORM pg_temp.actor(c_student);
  PERFORM pg_temp.chk('student cannot prepare a media package', 'forbidden',
    pg_temp.raised(format('SELECT public.ministerial_track_package_prepare(%L::jsonb)', v_package)));

  -- ------------------------------------------------------ v2 validation gates
  PERFORM pg_temp.actor(c_staff);
  v_v1_package := jsonb_set(v_package, '{contract_version}', to_jsonb('ministerial_track_package_v1'::text));
  PERFORM pg_temp.chk('media inside a v1 package is refused', 'MINISTERIAL_PACKAGE_MEDIA_REQUIRES_V2',
    pg_temp.raised(format('SELECT public.ministerial_track_package_prepare(%L::jsonb)', v_v1_package)));
  PERFORM pg_temp.chk('svg mime is refused', 'MINISTERIAL_MEDIA_MIME_INVALID',
    pg_temp.raised(format('SELECT public.ministerial_track_package_prepare(%L::jsonb)',
      jsonb_set(v_package, '{models,0,questions,0,media,1,mime_type}', to_jsonb('image/svg+xml'::text)))));
  PERFORM pg_temp.chk('images above 8MiB are refused', 'MINISTERIAL_MEDIA_SIZE_INVALID',
    pg_temp.raised(format('SELECT public.ministerial_track_package_prepare(%L::jsonb)',
      jsonb_set(v_package, '{models,0,questions,0,media,1,file_size}', to_jsonb(8388609)))));
  PERFORM pg_temp.chk('bad sha256 is refused', 'MINISTERIAL_MEDIA_SHA256_INVALID',
    pg_temp.raised(format('SELECT public.ministerial_track_package_prepare(%L::jsonb)',
      jsonb_set(v_package, '{models,0,questions,0,media,1,sha256}', to_jsonb('ZZ'::text)))));
  PERFORM pg_temp.chk('duplicate placement is refused', 'MINISTERIAL_MEDIA_PLACEMENT_DUPLICATE',
    pg_temp.raised(format('SELECT public.ministerial_track_package_prepare(%L::jsonb)',
      jsonb_set(v_package, '{models,0,questions,0,media,2,placement}', to_jsonb('QUESTION'::text)))));
  PERFORM pg_temp.chk('empty alt text is refused', 'MINISTERIAL_MEDIA_ALT_TEXT_INVALID',
    pg_temp.raised(format('SELECT public.ministerial_track_package_prepare(%L::jsonb)',
      jsonb_set(v_package, '{models,0,questions,0,media,1,alt_text_ar}', to_jsonb(' '::text)))));
  PERFORM pg_temp.chk('foreign storage_path is refused', 'MINISTERIAL_MEDIA_STORAGE_PATH_MISMATCH',
    pg_temp.raised(format('SELECT public.ministerial_track_package_prepare(%L::jsonb)',
      jsonb_set(v_package, '{models,0,questions,0,media,1,storage_path}', to_jsonb('lesson-files/x.png'::text)))));

  v_aden_package := jsonb_build_object(
    'contract_version', 'ministerial_track_package_v2',
    'track_code', 'aden', 'subject_code', 'sub-g12-002', 'subject_name', 'الفيزياء',
    'source_filename', 'aden-media.zip', 'source_sha256', repeat('d', 64),
    'models', jsonb_build_array(jsonb_build_object(
      'model_label', 'عدن 2025', 'academic_year', 2025, 'variant_code', 'm01',
      'worksheet_name', 'نموذج_1', 'declared_question_count', 1,
      'questions', jsonb_build_array(jsonb_build_object(
        'question_text', 'فسّر الشكل.', 'options', jsonb_build_array(), 'correct_option_code', NULL,
        'model_answer', 'يبين قانون أوم.', 'explanation', '', 'display_order', 1, 'marks', 1,
        'media', jsonb_build_array(jsonb_build_object('placement', 'OPTION_A', 'file_name', 'a.png',
          'sha256', c_sha_aden, 'mime_type', 'image/png', 'file_size', 500, 'alt_text_ar', 'خيار')))))));
  PERFORM pg_temp.chk('Aden refuses option images', 'MINISTERIAL_MEDIA_PLACEMENT_INVALID',
    pg_temp.raised(format('SELECT public.ministerial_track_package_prepare(%L::jsonb)', v_aden_package)));

  -- ------------------------------------------------------- prepare + atomicity
  v_prepare := public.ministerial_track_package_prepare(v_package);
  PERFORM pg_temp.chk('v2 prepare inserts one model', '1', v_prepare->'summary'->>'insert');
  PERFORM pg_temp.chk('v2 prepare counts three media refs', '3', v_prepare->'summary'->>'media_refs');
  PERFORM pg_temp.chk('v2 prepare counts three distinct files', '3', v_prepare->'summary'->>'media_files');
  PERFORM pg_temp.chk('v2 prepare sums media bytes', '2640', v_prepare->'summary'->>'media_bytes');
  SELECT kind INTO v_text FROM public.ministerial_import_prepares WHERE id = (v_prepare->>'prepare_id')::uuid;
  PERFORM pg_temp.chk('v2 prepare is stored under a v2 kind', 'SANA_PACKAGE_V2', v_text);

  v_text := pg_temp.raised(format('SELECT public.ministerial_track_package_execute(%L::uuid, %L)',
    v_prepare->>'prepare_id', v_prepare->>'prepare_fingerprint'));
  PERFORM pg_temp.chk('execute without uploaded objects is refused', 'MINISTERIAL_MEDIA_OBJECT_MISSING', v_text);
  SELECT count(*) INTO v_count FROM public.ministerial_exam_models;
  PERFORM pg_temp.chk('failed execute leaves no model behind', '0', v_count::text);
  SELECT count(*) INTO v_count FROM public.questions;
  PERFORM pg_temp.chk('failed execute leaves no question behind', '0', v_count::text);
  SELECT count(*) INTO v_count FROM public.question_media;
  PERFORM pg_temp.chk('failed execute leaves no media row behind', '0', v_count::text);

  -- Upload two of three, with the third carrying a wrong size → still atomic.
  PERFORM pg_temp.upload(public.ministerial_media_storage_key(c_sha_q, 'image/png'), 1200, 'image/png');
  PERFORM pg_temp.upload(public.ministerial_media_storage_key(c_sha_b, 'image/jpeg'), 800, 'image/jpeg');
  PERFORM pg_temp.upload(public.ministerial_media_storage_key(c_sha_s, 'image/webp'), 999, 'image/webp');
  v_text := pg_temp.raised(format('SELECT public.ministerial_track_package_execute(%L::uuid, %L)',
    v_prepare->>'prepare_id', v_prepare->>'prepare_fingerprint'));
  PERFORM pg_temp.chk('size mismatch with the uploaded object is refused', 'MINISTERIAL_MEDIA_OBJECT_MISSING', v_text);
  SELECT count(*) INTO v_count FROM public.question_media;
  PERFORM pg_temp.chk('size mismatch rolls back every media row', '0', v_count::text);

  PERFORM pg_temp.upload(public.ministerial_media_storage_key(c_sha_s, 'image/webp'), 640, 'image/webp');
  v_result := public.ministerial_track_package_execute(
    (v_prepare->>'prepare_id')::uuid, v_prepare->>'prepare_fingerprint');
  PERFORM pg_temp.chk('execute creates the model', '1', v_result->>'inserted_models');
  PERFORM pg_temp.chk('execute creates both questions', '2', v_result->>'inserted_questions');
  PERFORM pg_temp.chk('execute inserts three media rows', '3', v_result->>'inserted_media');
  PERFORM pg_temp.chk('execute never publishes models', 'draft', v_result->>'status');

  SELECT id INTO v_model FROM public.ministerial_exam_models WHERE curriculum_track_id = v_sanaa_track;
  SELECT meq.question_id, meq.published_revision_id INTO v_question_id, v_revision
  FROM public.ministerial_exam_questions meq WHERE meq.model_id = v_model AND meq.sort_order = 1;
  SELECT count(*) INTO v_count FROM public.question_media WHERE question_revision_id = v_revision;
  PERFORM pg_temp.chk('media rows sit on the pinned revision', '3', v_count::text);
  SELECT string_agg(media_code, ',' ORDER BY sort_order) INTO v_text
  FROM public.question_media WHERE question_revision_id = v_revision;
  PERFORM pg_temp.chk('media codes carry the placement in canonical order',
    'MEDIA-QUESTION,MEDIA-OPTION_B,MEDIA-SOLUTION', v_text);
  SELECT status || '|' || requires_media::text || '|' || (payload_hash IS NOT NULL)::text INTO v_text
  FROM public.question_revisions WHERE id = v_revision;
  PERFORM pg_temp.chk('revision is published, requires media, and hashed', 'PUBLISHED|true|true', v_text);
  SELECT count(*) INTO v_count FROM public.question_media qm
  WHERE qm.question_revision_id = v_revision AND qm.storage_path !~ '^ministerial/[0-9a-f]{2}/[0-9a-f]{64}\.(png|jpg|webp)$';
  PERFORM pg_temp.chk('every stored path is content-addressed', '0', v_count::text);
  PERFORM pg_temp.chk('published media rows are frozen', 'cannot UPDATE child rows of PUBLISHED revision (payload frozen)',
    pg_temp.raised(format('UPDATE public.question_media SET alt_text_ar = %L WHERE question_revision_id = %L',
      'تغيير', v_revision)));

  v_prepare := public.ministerial_track_package_prepare(v_package);
  PERFORM pg_temp.chk('exact v2 replay is SKIP', '1', v_prepare->'summary'->>'skip');

  -- A plain v1 package (no media) still imports after the migration.
  v_v1_package := jsonb_build_object(
    'contract_version', 'ministerial_track_package_v1',
    'track_code', 'sanaa', 'subject_code', 'sub-g12-002', 'subject_name', 'الفيزياء',
    'source_filename', 'sanaa.xlsx', 'source_sha256', repeat('e', 64),
    'models', jsonb_build_array(jsonb_build_object(
      'model_label', 'صنعاء 2025 — نموذج 2', 'academic_year', 2025, 'variant_code', 'm02',
      'worksheet_name', 'نموذج_2', 'declared_question_count', 1,
      'questions', jsonb_build_array(v_question_2))));
  v_prepare := public.ministerial_track_package_prepare(v_v1_package);
  PERFORM pg_temp.chk('v1 package still prepares', '1', v_prepare->'summary'->>'insert');
  PERFORM pg_temp.chk('v1 package reports zero media', '0', v_prepare->'summary'->>'media_refs');
  v_result := public.ministerial_track_package_execute(
    (v_prepare->>'prepare_id')::uuid, v_prepare->>'prepare_fingerprint');
  PERFORM pg_temp.chk('v1 package still executes', '1', v_result->>'inserted_questions');
  PERFORM pg_temp.chk('v1 package inserts no media', '0', v_result->>'inserted_media');
  SELECT id INTO v_model_2 FROM public.ministerial_exam_models WHERE variant_code = 'm02';

  -- ----------------------------------------------------------------- publish
  PERFORM pg_temp.actor(c_admin);
  PERFORM public.publish_ministerial_model(v_model);
  PERFORM public.publish_ministerial_model(v_model_2);

  -- ------------------------------------------------------ session + exposure
  PERFORM pg_temp.actor(c_student);
  v_session := public.create_ministerial_exam_session(v_model, 'training');
  SELECT id, rendered_media INTO v_esq, v_rendered FROM public.exam_session_questions
  WHERE exam_session_id = v_session AND question_order = 1;
  PERFORM pg_temp.chk('session pins three media items', '3', jsonb_array_length(v_rendered)::text);
  PERFORM pg_temp.chk('pinned media never carry storage paths', 'false',
    (v_rendered::text ILIKE '%storage_path%' OR v_rendered::text ILIKE '%ministerial/%')::text);
  PERFORM pg_temp.chk('pinned option media carry the option code', 'B',
    (SELECT m->>'option_code' FROM jsonb_array_elements(v_rendered) m WHERE m->>'placement' = 'OPTION_B'));
  SELECT rendered_media::text INTO v_text FROM public.exam_session_questions
  WHERE exam_session_id = v_session AND question_order = 2;
  PERFORM pg_temp.chk('questions without images pin an empty list', '[]', v_text);
  SELECT (m->>'media_id')::uuid INTO v_question_media_id FROM jsonb_array_elements(v_rendered) m WHERE m->>'placement' = 'QUESTION';
  SELECT (m->>'media_id')::uuid INTO v_solution_media_id FROM jsonb_array_elements(v_rendered) m WHERE m->>'placement' = 'SOLUTION';

  v_state := public.get_ministerial_session_state(v_session);
  PERFORM pg_temp.chk('state exposes only non-solution media', '2',
    jsonb_array_length(v_state->'questions'->0->'media')::text);
  PERFORM pg_temp.chk('state never mentions SOLUTION media or paths', 'false',
    (v_state::text ILIKE '%SOLUTION%' OR v_state::text ILIKE '%storage_path%')::text);

  PERFORM pg_temp.chk('owner can access question media', 'true',
    public.ministerial_media_can_access(v_question_media_id, v_session)::text);
  PERFORM pg_temp.chk('solution media is hidden before reveal', 'false',
    public.ministerial_media_can_access(v_solution_media_id, v_session)::text);
  PERFORM pg_temp.chk('student needs a session id', 'false',
    public.ministerial_media_can_access(v_question_media_id, NULL)::text);
  PERFORM pg_temp.actor(c_other_student);
  PERFORM pg_temp.chk('another student cannot borrow the session', 'false',
    public.ministerial_media_can_access(v_question_media_id, v_session)::text);
  PERFORM pg_temp.actor(NULL);
  PERFORM pg_temp.chk('anonymous never gets media', 'false',
    public.ministerial_media_can_access(v_question_media_id, v_session)::text);
  PERFORM pg_temp.actor(c_staff);
  PERFORM pg_temp.chk('content staff preview media without a session', 'true',
    public.ministerial_media_can_access(v_solution_media_id, NULL)::text);
  PERFORM pg_temp.chk('unknown media ids are refused for staff too', 'false',
    public.ministerial_media_can_access(gen_random_uuid(), NULL)::text);

  PERFORM pg_temp.actor(c_student);
  PERFORM public.answer_ministerial_exam_question(v_session, v_esq, 'B');
  v_reveal := public.reveal_ministerial_training_answer(v_session, v_esq);
  PERFORM pg_temp.chk('reveal grades the answer', 'correct', v_reveal->>'verdict');
  PERFORM pg_temp.chk('reveal returns the solution image', '1', jsonb_array_length(v_reveal->'solution_media')::text);
  PERFORM pg_temp.chk('solution media opens after reveal', 'true',
    public.ministerial_media_can_access(v_solution_media_id, v_session)::text);

  v_result := public.submit_ministerial_exam_session(v_session);
  v_result := public.get_ministerial_session_result(v_session);
  PERFORM pg_temp.chk('result exposes question media', '2',
    jsonb_array_length(v_result->'questions'->0->'media')::text);
  PERFORM pg_temp.chk('result exposes solution media', '1',
    jsonb_array_length(v_result->'questions'->0->'solution_media')::text);
  PERFORM pg_temp.chk('result never leaks storage paths', 'false', (v_result::text ILIKE '%storage_path%')::text);

  -- ------------------------------------------------------ admin management
  PERFORM pg_temp.actor(c_admin);
  v_result := public.ministerial_model_questions_admin_list(v_model);
  PERFORM pg_temp.chk('admin list returns media for the question', '3',
    jsonb_array_length(v_result->0->'media')::text);
  PERFORM pg_temp.chk('admin list flags sessions', 'true', v_result->0->>'has_sessions');
  PERFORM pg_temp.chk('editing is blocked while sessions exist', 'MINISTERIAL_EDIT_BLOCKED_SESSIONS_EXIST',
    pg_temp.raised(format(
      'SELECT public.ministerial_model_question_update(%L::uuid, %L::uuid, %L, %L::jsonb, %L, %L, %L, 1, 1, %L, NULL)',
      v_model, v_question_id, 'نص جديد', v_question_1->'options', 'B', 'انظر الصورة', 'شرح', 'سبب')));

  -- Model 2 (v1 import, no sessions): replace / carry-over / clear — each a NEW revision.
  SELECT meq.question_id, meq.published_revision_id INTO v_question_id, v_revision
  FROM public.ministerial_exam_questions meq WHERE meq.model_id = v_model_2;
  PERFORM pg_temp.chk('admin media attach requires the uploaded object', 'MINISTERIAL_MEDIA_OBJECT_MISSING',
    pg_temp.raised(format(
      'SELECT public.ministerial_model_question_update(%L::uuid, %L::uuid, %L, %L::jsonb, %L, %L, %L, 1, 1, %L, %L::jsonb)',
      v_model_2, v_question_id, 'وحدة قياس المقاومة الكهربائية هي؟', v_question_2->'options', 'A', 'أوم', 'شرح', 'إضافة صورة',
      jsonb_build_array(jsonb_build_object('placement', 'QUESTION', 'file_name', 'r.png', 'sha256', c_sha_new,
        'mime_type', 'image/png', 'file_size', 300, 'alt_text_ar', 'رمز المقاومة')))));
  SELECT status INTO v_text FROM public.question_revisions WHERE id = v_revision;
  PERFORM pg_temp.chk('failed admin update leaves the old revision published', 'PUBLISHED', v_text);

  -- (a) replace: attach an image through a NEW revision
  PERFORM pg_temp.upload(public.ministerial_media_storage_key(c_sha_new, 'image/png'), 300, 'image/png');
  v_result := public.ministerial_model_question_update(v_model_2, v_question_id, 'وحدة قياس المقاومة الكهربائية هي؟',
    v_question_2->'options', 'A', 'أوم', 'شرح', 1, 1, 'إضافة صورة',
    jsonb_build_array(jsonb_build_object('placement', 'QUESTION', 'file_name', 'r.png', 'sha256', c_sha_new,
      'mime_type', 'image/png', 'file_size', 300, 'alt_text_ar', 'رمز المقاومة')));
  v_new_revision := (v_result->>'published_revision_id')::uuid;
  PERFORM pg_temp.chk('admin update reports the attached media', '1', v_result->>'media_count');
  PERFORM pg_temp.chk('admin update mints a new revision', 'true', (v_new_revision <> v_revision)::text);
  SELECT status INTO v_text FROM public.question_revisions WHERE id = v_revision;
  PERFORM pg_temp.chk('old revision is superseded, not mutated', 'SUPERSEDED', v_text);
  SELECT count(*) INTO v_count FROM public.question_media WHERE question_revision_id = v_revision;
  PERFORM pg_temp.chk('old revision keeps its (empty) media set', '0', v_count::text);
  SELECT count(*) INTO v_count FROM public.question_media WHERE question_revision_id = v_new_revision;
  PERFORM pg_temp.chk('new revision carries the image', '1', v_count::text);
  SELECT status INTO v_text FROM public.ministerial_exam_models WHERE id = v_model_2;
  PERFORM pg_temp.chk('editing demotes the model to draft', 'draft', v_text);
  PERFORM pg_temp.chk('staff can preview the newly attached media', 'true',
    public.ministerial_media_can_access((SELECT id FROM public.question_media WHERE question_revision_id = v_new_revision), NULL)::text);

  -- (b) carry-over: _media NULL keeps the existing media on the next revision
  v_revision := v_new_revision;
  v_result := public.ministerial_model_question_update(v_model_2, v_question_id, 'وحدة قياس المقاومة الكهربائية هي؟ (2)',
    v_question_2->'options', 'A', 'أوم', 'شرح', 1, 1, 'تعديل نص فقط', NULL);
  v_new_revision := (v_result->>'published_revision_id')::uuid;
  PERFORM pg_temp.chk('text-only edit carries media over', '1', v_result->>'media_count');
  SELECT sha256 INTO v_text FROM public.question_media WHERE question_revision_id = v_new_revision;
  PERFORM pg_temp.chk('carried media keeps the same object', c_sha_new, v_text);

  -- (c) clear: _media [] removes the image on a new revision
  v_result := public.ministerial_model_question_update(v_model_2, v_question_id, 'وحدة قياس المقاومة الكهربائية هي؟ (3)',
    v_question_2->'options', 'A', 'أوم', 'شرح', 1, 1, 'حذف الصورة', '[]'::jsonb);
  v_new_revision := (v_result->>'published_revision_id')::uuid;
  PERFORM pg_temp.chk('clearing media reports zero', '0', v_result->>'media_count');
  SELECT count(*) INTO v_count FROM public.question_media WHERE question_revision_id = v_new_revision;
  PERFORM pg_temp.chk('cleared revision has no media rows', '0', v_count::text);
  SELECT requires_media::text INTO v_text FROM public.question_revisions WHERE id = v_new_revision;
  PERFORM pg_temp.chk('cleared revision no longer requires media', 'false', v_text);
  SELECT count(*) INTO v_count FROM public.question_media qm
  JOIN public.question_revisions qr ON qr.id = qm.question_revision_id
  WHERE qr.question_id = v_question_id;
  PERFORM pg_temp.chk('history keeps every past revision media row', '2', v_count::text);

  -- (d) an edited model must still pass the publish gate (targets + parity carried over)
  PERFORM pg_temp.chk('edited model passes the publish gate', 'true', public.can_publish_ministerial_model(v_model_2)::text);
  SELECT count(*) INTO v_count FROM public.question_targets WHERE revision_id = v_new_revision AND is_primary;
  PERFORM pg_temp.chk('new revision carries exactly one primary target', '1', v_count::text);
  PERFORM public.publish_ministerial_model(v_model_2);
  -- sessions pin whatever revision was live when they started
  PERFORM pg_temp.actor(c_student);
  v_session := public.create_ministerial_exam_session(v_model_2, 'training');
  SELECT rendered_media::text INTO v_text FROM public.exam_session_questions WHERE exam_session_id = v_session;
  PERFORM pg_temp.chk('new session pins the current (cleared) media set', '[]', v_text);
  PERFORM pg_temp.actor(c_admin);
  PERFORM pg_temp.chk('admin update is blocked once a session exists', 'MINISTERIAL_EDIT_BLOCKED_SESSIONS_EXIST',
    pg_temp.raised(format(
      'SELECT public.ministerial_model_question_update(%L::uuid, %L::uuid, %L, %L::jsonb, %L, %L, %L, 1, 1, %L, NULL)',
      v_model_2, v_question_id, 'نص', v_question_2->'options', 'A', 'أوم', 'شرح', 'سبب')));

  -- ------------------------------------------------------------ privileges
  PERFORM pg_temp.chk('anon cannot call the media gate', 'false',
    has_function_privilege('anon', 'public.ministerial_media_can_access(uuid,uuid)', 'EXECUTE')::text);
  PERFORM pg_temp.chk('anon cannot prepare packages', 'false',
    has_function_privilege('anon', 'public.ministerial_track_package_prepare(jsonb)', 'EXECUTE')::text);
  PERFORM pg_temp.chk('anon cannot update questions', 'false',
    has_function_privilege('anon', 'public.ministerial_model_question_update(uuid,uuid,text,jsonb,text,text,text,integer,numeric,text,jsonb)', 'EXECUTE')::text);
  PERFORM pg_temp.chk('authenticated cannot insert media rows through the helper', 'false',
    has_function_privilege('authenticated', 'public._ministerial_insert_revision_media(uuid,jsonb,uuid,boolean)', 'EXECUTE')::text);
  PERFORM pg_temp.chk('authenticated cannot probe storage through the helper', 'false',
    has_function_privilege('authenticated', 'public._ministerial_media_object_verified(text,bigint,text)', 'EXECUTE')::text);
  PERFORM pg_temp.chk('authenticated cannot render media through the helper', 'false',
    has_function_privilege('authenticated', 'public._ministerial_revision_rendered_media(uuid)', 'EXECUTE')::text);
  PERFORM pg_temp.chk('old 10-argument update signature is gone', '0',
    (SELECT count(*) FROM pg_proc WHERE proname = 'ministerial_model_question_update' AND pronargs = 10)::text);
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'question_media_%';
  PERFORM pg_temp.chk('four bucket policies exist', '4', v_count::text);
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'question_media_%'
    AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  PERFORM pg_temp.chk('no bucket policy targets anon', '0', v_count::text);
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'question_media_%'
    AND (coalesce(qual, '') || coalesce(with_check, '')) NOT LIKE '%question-media%';
  PERFORM pg_temp.chk('every bucket policy is scoped to question-media', '0', v_count::text);
  SELECT with_check INTO v_text FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'question_media_staff_insert';
  PERFORM pg_temp.chk('uploads are restricted to content-addressed keys', 'true',
    (v_text LIKE '%ministerial/[0-9a-f]{2}/[0-9a-f]{64}%')::text);
  SELECT public::text INTO v_text FROM storage.buckets WHERE id = 'question-media';
  PERFORM pg_temp.chk('bucket stays private', 'false', v_text);
  SELECT count(*) INTO v_count FROM public.audit_logs WHERE action IN ('ministerial_question_update', 'ministerial_track_package_execute', 'ministerial_track_package_import');
  PERFORM pg_temp.chk('audit trail recorded imports and edits', 'true', (v_count >= 4)::text);
END;
$test$;
