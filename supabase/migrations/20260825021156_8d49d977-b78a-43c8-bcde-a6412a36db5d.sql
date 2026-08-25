-- CF10 SELFTEST replay-idempotency fix (forward-only, no data writes).
-- Mirrors the already-deployed '-EXP' normalization: the BEFORE INSERT/UPDATE trigger
-- normalize_lesson_assessment_code() lowercases assessment_code via
-- public.normalize_content_code(), while CF10 looked up / inserted the UPPERCASE
-- (external_lesson_code || '-SELFTEST'), so replay missed the existing row and the
-- normalized INSERT violated lesson_assessments_code_uniq.
DO $mig$
DECLARE
  v_oid oid;
  v_def text;
  v_old_expr constant text := 'external_lesson_code || ''-SELFTEST''';
  v_new_expr constant text := 'public.normalize_content_code(external_lesson_code || ''-SELFTEST'')';
  v_count integer;
BEGIN
  SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'golden_lesson_materialize_domain_batch'
     AND pg_get_function_identity_arguments(p.oid) =
         '_batch_id uuid, _actor_id uuid, _mode text, _expected_plan_sha256 text, _idempotency_key text';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'CF10_SELFTEST_FIX_TARGET_FUNCTION_MISSING';
  END IF;
  IF to_regprocedure('public.normalize_content_code(text)') IS NULL THEN
    RAISE EXCEPTION 'CF10_SELFTEST_FIX_NORMALIZER_MISSING';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  SELECT count(*) INTO v_count
    FROM regexp_matches(v_def, 'external_lesson_code \|\| ''-SELFTEST''', 'g');
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'CF10_SELFTEST_FIX_UNEXPECTED_OCCURRENCES: %', v_count;
  END IF;
  IF position(v_new_expr in v_def) > 0 THEN
    RAISE EXCEPTION 'CF10_SELFTEST_FIX_ALREADY_APPLIED';
  END IF;

  -- Preserve the already-deployed EXP normalization.
  SELECT count(*) INTO v_count
    FROM regexp_matches(v_def, 'public\.normalize_content_code\(external_lesson_code \|\| ''-EXP''\)', 'g');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'CF10_SELFTEST_FIX_EXP_PRECONDITION: %', v_count;
  END IF;

  EXECUTE replace(v_def, v_old_expr, v_new_expr);

  -- Postconditions (same transaction).
  v_def := pg_get_functiondef(v_oid);
  SELECT count(*) INTO v_count
    FROM regexp_matches(v_def, 'public\.normalize_content_code\(external_lesson_code \|\| ''-SELFTEST''\)', 'g');
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'CF10_SELFTEST_FIX_POSTVERIFY_NORMALIZED_COUNT: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM regexp_matches(
           regexp_replace(v_def, 'public\.normalize_content_code\(external_lesson_code \|\| ''-SELFTEST''\)', '', 'g'),
           'external_lesson_code \|\| ''-SELFTEST''', 'g');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CF10_SELFTEST_FIX_POSTVERIFY_BARE_REMAINS: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM regexp_matches(v_def, 'public\.normalize_content_code\(external_lesson_code \|\| ''-EXP''\)', 'g');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'CF10_SELFTEST_FIX_POSTVERIFY_EXP_LOST: %', v_count;
  END IF;
END
$mig$;