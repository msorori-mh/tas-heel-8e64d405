-- MINISTERIAL_TRACK_PACKAGE_IMPORT_V1 — runtime contract on disposable PG17 only.
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
  PERFORM set_config('request.jwt.claim.sub', _uid::text, false);
END;
$$;

DO $test$
DECLARE
  c_staff uuid := 'a1000000-0000-0000-0000-000000000001';
  c_admin uuid := 'a1000000-0000-0000-0000-000000000002';
  c_sanaa_student uuid := 'a1000000-0000-0000-0000-000000000003';
  c_aden_student uuid := 'a1000000-0000-0000-0000-000000000004';
  c_grade uuid := 'b1000000-0000-0000-0000-000000000001';
  c_subject uuid := 'b1000000-0000-0000-0000-000000000002';
  v_sanaa_track uuid;
  v_aden_track uuid;
  v_sanaa_package jsonb;
  v_aden_package jsonb;
  v_conflict_package jsonb;
  v_prepare jsonb;
  v_result jsonb;
  v_prepare_id uuid;
  v_prepare_fingerprint text;
  v_sanaa_model uuid;
  v_aden_model uuid;
  v_session uuid;
  v_session_question uuid;
  v_state jsonb;
  v_reveal jsonb;
  v_count integer;
  v_raised boolean;
BEGIN
  SET session_replication_role = replica;

  INSERT INTO auth.users(id, email) VALUES
    (c_staff, 'ministerial-staff@test.local'),
    (c_admin, 'ministerial-admin@test.local'),
    (c_sanaa_student, 'ministerial-sanaa@test.local'),
    (c_aden_student, 'ministerial-aden@test.local')
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
  VALUES (c_subject, c_grade, 'chemistry-ministerial', 'الكيمياء', 'sub-g12-001', NULL)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.subject_curriculum_tracks(subject_id, curriculum_track_id, is_active) VALUES
    (c_subject, v_sanaa_track, true),
    (c_subject, v_aden_track, true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles(user_id, full_name, grade_id, grade_uuid, curriculum_track_id) VALUES
    (c_staff, 'مشغل المحتوى', c_grade::text, c_grade, v_sanaa_track),
    (c_admin, 'ناشر المحتوى', c_grade::text, c_grade, v_sanaa_track),
    (c_sanaa_student, 'طالب صنعاء', c_grade::text, c_grade, v_sanaa_track),
    (c_aden_student, 'طالب عدن', c_grade::text, c_grade, v_aden_track)
  ON CONFLICT DO NOTHING;

  SET session_replication_role = origin;

  v_sanaa_package := jsonb_build_object(
    'contract_version', 'ministerial_track_package_v1',
    'track_code', 'sanaa',
    'subject_code', 'sub-g12-001',
    'subject_name', 'الكيمياء',
    'source_filename', 'sanaa.xlsx',
    'source_sha256', repeat('a', 64),
    'models', jsonb_build_array(
      jsonb_build_object(
        'model_label', 'صنعاء 2024 — نموذج 1',
        'academic_year', 2024,
        'variant_code', 'm01',
        'worksheet_name', 'نموذج_1',
        'declared_question_count', 1,
        'questions', jsonb_build_array(jsonb_build_object(
          'question_text', 'ما ناتج 2 + 2؟',
          'options', jsonb_build_array(
            jsonb_build_object('option_code', 'A', 'body', '3'),
            jsonb_build_object('option_code', 'B', 'body', '4'),
            jsonb_build_object('option_code', 'C', 'body', '5'),
            jsonb_build_object('option_code', 'D', 'body', '6')
          ),
          'correct_option_code', 'B',
          'model_answer', '4',
          'explanation', 'الجمع البسيط.',
          'display_order', 1,
          'marks', 1
        ))
      ),
      jsonb_build_object(
        'model_label', 'صنعاء 2024 — نموذج 2',
        'academic_year', 2024,
        'variant_code', 'm02',
        'worksheet_name', 'نموذج_2',
        'declared_question_count', 1,
        'questions', jsonb_build_array(jsonb_build_object(
          'question_text', 'أي العناصر الآتية فلز؟',
          'options', jsonb_build_array(
            jsonb_build_object('option_code', 'A', 'body', 'الحديد'),
            jsonb_build_object('option_code', 'B', 'body', 'الأكسجين'),
            jsonb_build_object('option_code', 'C', 'body', 'الكلور'),
            jsonb_build_object('option_code', 'D', 'body', 'الكبريت')
          ),
          'correct_option_code', 'A',
          'model_answer', 'الحديد',
          'explanation', 'الحديد من الفلزات.',
          'display_order', 1,
          'marks', 1
        ))
      )
    )
  );

  v_aden_package := jsonb_build_object(
    'contract_version', 'ministerial_track_package_v1',
    'track_code', 'aden',
    'subject_code', 'sub-g12-001',
    'subject_name', 'الكيمياء',
    'source_filename', 'aden.xlsx',
    'source_sha256', repeat('b', 64),
    'models', jsonb_build_array(jsonb_build_object(
      'model_label', 'عدن 2024',
      'academic_year', 2024,
      'variant_code', 'main',
      'worksheet_name', 'نموذج_1',
      'declared_question_count', 1,
      'questions', jsonb_build_array(jsonb_build_object(
        'question_text', 'علل: يستخدم الحديد في البناء.',
        'options', jsonb_build_array(),
        'correct_option_code', NULL,
        'model_answer', 'لقوته وقدرته على تحمل الأحمال.',
        'explanation', 'تُقبل الصياغة التي تؤدي المعنى.',
        'display_order', 1,
        'marks', 1
      ))
    ))
  );

  PERFORM pg_temp.actor(c_sanaa_student);
  v_raised := false;
  BEGIN
    PERFORM public.ministerial_track_package_prepare(v_sanaa_package);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  PERFORM pg_temp.chk('student cannot prepare packages', 'true', v_raised::text);

  PERFORM pg_temp.actor(c_staff);
  v_prepare := public.ministerial_track_package_prepare(v_sanaa_package);
  PERFORM pg_temp.chk('Sanaa prepare detects two models', '2', v_prepare->'summary'->>'models');
  PERFORM pg_temp.chk('Sanaa prepare detects two questions', '2', v_prepare->'summary'->>'questions');
  PERFORM pg_temp.chk('Sanaa prepare inserts both models', '2', v_prepare->'summary'->>'insert');
  PERFORM pg_temp.chk('Sanaa prepare has no blocked models', '0', v_prepare->'summary'->>'blocked');
  v_prepare_id := (v_prepare->>'prepare_id')::uuid;
  v_prepare_fingerprint := v_prepare->>'prepare_fingerprint';
  v_result := public.ministerial_track_package_execute(v_prepare_id, v_prepare_fingerprint);
  PERFORM pg_temp.chk('Sanaa execute creates two drafts', '2', v_result->>'inserted_models');
  PERFORM pg_temp.chk('Sanaa execute creates two pinned questions', '2', v_result->>'inserted_questions');

  v_result := public.ministerial_track_package_execute(v_prepare_id, v_prepare_fingerprint);
  PERFORM pg_temp.chk('same execute retry returns stored model count', '2', v_result->>'inserted_models');
  SELECT count(*) INTO v_count FROM public.ministerial_exam_models;
  PERFORM pg_temp.chk('same execute retry creates no duplicate model', '2', v_count::text);

  v_prepare := public.ministerial_track_package_prepare(v_sanaa_package);
  PERFORM pg_temp.chk('exact package replay is SKIP', '2', v_prepare->'summary'->>'skip');
  v_result := public.ministerial_track_package_execute(
    (v_prepare->>'prepare_id')::uuid,
    v_prepare->>'prepare_fingerprint'
  );
  PERFORM pg_temp.chk('exact replay executes as two skips', '2', v_result->>'skipped_models');
  SELECT count(*) INTO v_count FROM public.questions;
  PERFORM pg_temp.chk('exact replay creates no duplicate questions', '2', v_count::text);

  v_conflict_package := jsonb_set(
    v_sanaa_package,
    '{models,0,questions,0,question_text}',
    to_jsonb('محتوى متغير لهوية النموذج نفسها'::text)
  );
  v_prepare := public.ministerial_track_package_prepare(v_conflict_package);
  PERFORM pg_temp.chk('same model identity with changed content is blocked', '1', v_prepare->'summary'->>'blocked');
  v_raised := false;
  BEGIN
    PERFORM public.ministerial_track_package_execute(
      (v_prepare->>'prepare_id')::uuid,
      v_prepare->>'prepare_fingerprint'
    );
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  PERFORM pg_temp.chk('blocked package cannot execute', 'true', v_raised::text);

  v_prepare := public.ministerial_track_package_prepare(v_aden_package);
  PERFORM pg_temp.chk('Aden prepare creates one text model', '1', v_prepare->'summary'->>'insert');
  v_result := public.ministerial_track_package_execute(
    (v_prepare->>'prepare_id')::uuid,
    v_prepare->>'prepare_fingerprint'
  );
  PERFORM pg_temp.chk('Aden execute creates one text question', '1', v_result->>'inserted_questions');

  SELECT id INTO v_sanaa_model FROM public.ministerial_exam_models
  WHERE curriculum_track_id = v_sanaa_track AND variant_code = 'm01';
  SELECT id INTO v_aden_model FROM public.ministerial_exam_models
  WHERE curriculum_track_id = v_aden_track AND variant_code = 'main';
  SELECT count(*) INTO v_count
  FROM public.ministerial_exam_questions meq
  JOIN public.question_revisions qr ON qr.id = meq.published_revision_id
  WHERE qr.status = 'PUBLISHED';
  PERFORM pg_temp.chk('all memberships pin published revisions', '3', v_count::text);
  SELECT count(*) INTO v_count FROM public.ministerial_exam_models WHERE status = 'draft';
  PERFORM pg_temp.chk('package execution never auto-publishes models', '3', v_count::text);

  PERFORM pg_temp.actor(c_admin);
  PERFORM public.publish_ministerial_model(v_sanaa_model);
  PERFORM public.publish_ministerial_model((
    SELECT id FROM public.ministerial_exam_models
    WHERE curriculum_track_id = v_sanaa_track AND variant_code = 'm02'
  ));
  PERFORM public.publish_ministerial_model(v_aden_model);
  SELECT count(*) INTO v_count FROM public.ministerial_exam_models WHERE status = 'published';
  PERFORM pg_temp.chk('publisher separately publishes all three models', '3', v_count::text);

  PERFORM pg_temp.actor(c_sanaa_student);
  SELECT count(*) INTO v_count FROM public.list_ministerial_models(c_subject);
  PERFORM pg_temp.chk('Sanaa student sees both classified tracks', '3', v_count::text);
  SELECT count(*) INTO v_count FROM public.list_ministerial_track_models('sanaa');
  PERFORM pg_temp.chk('Sanaa choice lists Sanaa models only', '2', v_count::text);
  SELECT count(*) INTO v_count FROM public.list_ministerial_track_models('aden');
  PERFORM pg_temp.chk('Sanaa student can explicitly choose Aden models', '1', v_count::text);
  PERFORM pg_temp.actor(c_aden_student);
  SELECT count(*) INTO v_count FROM public.list_ministerial_models(c_subject);
  PERFORM pg_temp.chk('Aden student sees both classified tracks', '3', v_count::text);
  SELECT count(*) INTO v_count FROM public.list_ministerial_track_models('aden');
  PERFORM pg_temp.chk('Aden choice lists Aden models only', '1', v_count::text);
  SELECT count(*) INTO v_count FROM public.list_ministerial_track_models('sanaa');
  PERFORM pg_temp.chk('Aden student can explicitly choose Sanaa models', '2', v_count::text);
  SELECT count(*) INTO v_count FROM public.list_ministerial_track_models('other');
  PERFORM pg_temp.chk('unsupported track choice lists nothing', '0', v_count::text);

  v_session := public.create_ministerial_exam_session(v_aden_model, 'training');
  SELECT id INTO v_session_question FROM public.exam_session_questions
  WHERE exam_session_id = v_session AND question_order = 1;
  v_state := public.get_ministerial_session_state(v_session);
  PERFORM pg_temp.chk('open Aden session carries no model answer', 'false',
    (v_state::text ILIKE '%model_answer%' OR v_state::text ILIKE '%correct_option_code%')::text);

  v_raised := false;
  BEGIN
    PERFORM public.reveal_ministerial_training_answer(v_session, v_session_question);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  PERFORM pg_temp.chk('Aden reveal before writing is denied', 'true', v_raised::text);

  v_result := public.answer_ministerial_text_question(
    v_session,
    v_session_question,
    'لأنه قوي ويتحمل الأحمال.'
  );
  PERFORM pg_temp.chk('Aden text answer is saved', 'true', v_result->>'answered');
  v_state := public.get_ministerial_session_state(v_session);
  PERFORM pg_temp.chk('state returns only the student text', 'لأنه قوي ويتحمل الأحمال.',
    v_state->'answers'->0->>'response_text');
  PERFORM pg_temp.chk('state still carries no answer key', 'false',
    (v_state::text ILIKE '%model_answer%' OR v_state::text ILIKE '%correct_option_code%')::text);

  v_reveal := public.reveal_ministerial_training_answer(v_session, v_session_question);
  PERFORM pg_temp.chk('Aden reveal is comparison-only', 'manual_review', v_reveal->>'verdict');
  PERFORM pg_temp.chk('Aden reveal returns pinned model answer', 'لقوته وقدرته على تحمل الأحمال.',
    v_reveal->>'model_answer');
  v_raised := false;
  BEGIN
    PERFORM public.answer_ministerial_text_question(v_session, v_session_question, 'تغيير بعد الكشف');
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  PERFORM pg_temp.chk('Aden answer locks after reveal', 'true', v_raised::text);

  v_result := public.submit_ministerial_exam_session(v_session);
  PERFORM pg_temp.chk('Aden submit records self review', 'true', v_result->>'self_review');
  PERFORM pg_temp.chk('Aden submit does not invent a percentage', NULL, v_result->>'percentage');
  v_result := public.get_ministerial_session_result(v_session);
  PERFORM pg_temp.chk('completed review returns the model answer', 'لقوته وقدرته على تحمل الأحمال.',
    v_result->'questions'->0->>'model_answer');

  PERFORM pg_temp.chk('anonymous cannot execute package prepare', 'false',
    has_function_privilege('anon', 'public.ministerial_track_package_prepare(jsonb)', 'EXECUTE')::text);
  PERFORM pg_temp.chk('anonymous cannot save Aden answers', 'false',
    has_function_privilege('anon', 'public.answer_ministerial_text_question(uuid,uuid,text)', 'EXECUTE')::text);
  PERFORM pg_temp.chk('anonymous cannot list a ministerial track', 'false',
    has_function_privilege('anon', 'public.list_ministerial_track_models(text)', 'EXECUTE')::text);
END;
$test$;
