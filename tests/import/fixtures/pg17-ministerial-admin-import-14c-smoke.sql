-- =============================================================================
-- 14C.2 runtime smoke — disposable PG17 cluster only.
-- Emits PASS/FAIL lines consumed by the rehearsal runner.
-- =============================================================================
\set ON_ERROR_STOP off
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION pg_temp.chk(_name text, _expected text, _actual text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _expected IS NOT DISTINCT FROM _actual THEN
    RAISE NOTICE 'PASS  %', _name;
  ELSE
    RAISE NOTICE 'FAIL  % (expected=% actual=%)', _name, _expected, _actual;
  END IF;
END; $$;

DO $outer$
DECLARE
  v_grade uuid; v_sanaa uuid; v_aden uuid; v_subject uuid;
  v_staff uuid := gen_random_uuid();
  v_publisher uuid := gen_random_uuid();
  v_q1 uuid; v_r3 uuid; v_r4 uuid;
  v_prepare uuid;
  v_res jsonb;
  v_model uuid;
  v_model_code text;
  v_err text;
  v_count int;
BEGIN
  -- ---------------------------------------------------------------- fixtures --
  SELECT id INTO v_sanaa FROM curriculum_tracks WHERE track_code = 'sanaa';
  SELECT id INTO v_aden  FROM curriculum_tracks WHERE track_code = 'aden';

  INSERT INTO grades (slug, name, category, sort_order)
  VALUES ('grade-12', 'الثاني عشر', 'secondary', 1)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_grade;

  INSERT INTO subjects (grade_id, slug, name, code)
  VALUES (v_grade, 'physics-14c', 'فيزياء', 'sub-g12-001')
  RETURNING id INTO v_subject;

  INSERT INTO subject_curriculum_tracks (subject_id, curriculum_track_id, is_active)
  VALUES (v_subject, v_sanaa, true), (v_subject, v_aden, true);

  -- ------------------------------------------------------------ M01 behaviour --
  PERFORM pg_temp.chk('mex code TCS-2 order', 'mex-g12-sanaa-001-2025-r1-main',
    ministerial_build_model_code('sub-g12-001', 'sanaa', 2025, 'r1', 'main'));

  BEGIN
    PERFORM ministerial_build_model_code('sub-g12-sanaa-001', 'sanaa', 2025, 'r1', 'main');
    PERFORM pg_temp.chk('TCS-1 subject code rejected', 'raised', 'not raised');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.chk('TCS-1 subject code rejected', 'raised', 'raised');
  END;

  PERFORM pg_temp.chk('sanaa model code <> aden model code', 'true',
    (ministerial_build_model_code('sub-g12-001','sanaa',2025,'r1','main')
     <> ministerial_build_model_code('sub-g12-001','aden',2025,'r1','main'))::text);

  -- --------------------------------------------------------------- hardening --
  PERFORM pg_temp.chk('anon cannot execute m01_prepare', 'false',
    has_function_privilege('anon', 'public.ministerial_m01_prepare(jsonb)', 'EXECUTE')::text);
  PERFORM pg_temp.chk('anon cannot execute m02_execute', 'false',
    has_function_privilege('anon', 'public.ministerial_m02_execute(uuid)', 'EXECUTE')::text);
  PERFORM pg_temp.chk('anon cannot execute publish', 'false',
    has_function_privilege('anon', 'public.publish_ministerial_model(uuid)', 'EXECUTE')::text);
  PERFORM pg_temp.chk('authenticated has no INSERT on models', 'false',
    has_table_privilege('authenticated', 'public.ministerial_exam_models', 'INSERT')::text);
  PERFORM pg_temp.chk('authenticated has no UPDATE on membership', 'false',
    has_table_privilege('authenticated', 'public.ministerial_exam_questions', 'UPDATE')::text);
  PERFORM pg_temp.chk('authenticated has no DELETE on membership', 'false',
    has_table_privilege('authenticated', 'public.ministerial_exam_questions', 'DELETE')::text);
  PERFORM pg_temp.chk('anon has no SELECT on membership', 'false',
    has_table_privilege('anon', 'public.ministerial_exam_questions', 'SELECT')::text);

  -- ------------------------------------------------------- capability wiring --
  SELECT count(*) INTO v_count FROM pg_constraint
   WHERE conname = 'question_bank_capability_grants_capability_check'
     AND pg_get_constraintdef(oid) LIKE '%PUBLISH_MINISTERIAL_MODEL%';
  PERFORM pg_temp.chk('PUBLISH_MINISTERIAL_MODEL capability registered', '1', v_count::text);

  SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'can_publish_ministerial_exams';
  PERFORM pg_temp.chk('can_publish_ministerial_exams exists', '1', v_count::text);

  PERFORM pg_temp.chk('publish body does not trust is_content_staff', 'false',
    (prosrc LIKE '%is_content_staff%')::text)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'publish_ministerial_model';

  -- ------------------------------------------------- prepare/pinning columns --
  SELECT count(*) INTO v_count FROM information_schema.columns
   WHERE table_schema='public' AND table_name='ministerial_import_prepares';
  PERFORM pg_temp.chk('prepare staging table exists', 'true', (v_count > 0)::text);

  SELECT count(*) INTO v_count FROM information_schema.columns
   WHERE table_schema='public' AND table_name='ministerial_exam_questions'
     AND column_name IN ('original_question_number','section_code','source_page','source_reference');
  PERFORM pg_temp.chk('M02 metadata columns present', '4', v_count::text);

  SELECT count(*) INTO v_count FROM information_schema.columns
   WHERE table_schema='public' AND table_name='ministerial_exam_models' AND column_name='model_label';
  PERFORM pg_temp.chk('model_label present', '1', v_count::text);

  SELECT count(*) INTO v_count FROM pg_indexes
   WHERE schemaname='public' AND indexname='ministerial_exam_questions_display_order_uidx';
  PERFORM pg_temp.chk('duplicate display order blocked by unique index', '1', v_count::text);

  SELECT count(*) INTO v_count FROM pg_constraint
   WHERE conname='ministerial_exam_models_status_check'
     AND pg_get_constraintdef(oid) LIKE '%archived%';
  PERFORM pg_temp.chk('archived status allowed', '1', v_count::text);
END
$outer$;
