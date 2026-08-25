-- CF10 RETRY-IDEMPOTENCY FIX (forward-only, no data writes)
--
-- Problem: public.golden_lesson_materialize_domain_batch() looked up and inserted
-- lesson_explanations.explanation_code as (external_lesson_code || '-EXP'), i.e. the
-- UPPERCASE identity code, while the BEFORE INSERT/UPDATE trigger
-- normalize_lesson_explanation_code() stores the code lowercased. On retry the lookup
-- missed the existing row, the INSERT was normalized by the trigger and then violated
-- lesson_explanations_code_lesson_uniq.
--
-- Fix: wrap the three explanation-code usages (duplicate count, existing-hash lookup,
-- insert value) in public.normalize_content_code(...), exactly what the trigger applies.
-- Everything else (security checks, hash-conflict behaviour, privileges, free-only
-- publication requirement) is preserved because the body is rewritten in place from its
-- current definition. No INSERT/UPDATE/DELETE on any lesson content.

DO $mig$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
  v_probe text;
  v_old_expr constant text := 'external_lesson_code || ''-EXP''';
  v_new_expr constant text := 'public.normalize_content_code(external_lesson_code || ''-EXP'')';
  v_count integer;
BEGIN
  SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'golden_lesson_materialize_domain_batch'
     AND pg_get_function_identity_arguments(p.oid) =
         '_batch_id uuid, _actor_id uuid, _mode text, _expected_plan_sha256 text, _idempotency_key text';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'CF10_FIX_TARGET_FUNCTION_MISSING';
  END IF;
  IF to_regprocedure('public.normalize_content_code(text)') IS NULL THEN
    RAISE EXCEPTION 'CF10_FIX_NORMALIZER_MISSING';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  -- '-EXPERIMENT' usages are untouched: the matched literal ends at the closing quote.
  SELECT count(*) INTO v_count
    FROM regexp_matches(v_def, 'external_lesson_code \|\| ''-EXP''', 'g');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'CF10_FIX_UNEXPECTED_OCCURRENCES: %', v_count;
  END IF;
  IF position(v_new_expr in v_def) > 0 THEN
    RAISE EXCEPTION 'CF10_FIX_ALREADY_APPLIED';
  END IF;

  v_new := replace(v_def, v_old_expr, v_new_expr);
  EXECUTE v_new;

  -- Postverify in the same transaction.
  v_def := pg_get_functiondef(v_oid);
  SELECT count(*) INTO v_count
    FROM regexp_matches(v_def, 'public\.normalize_content_code\(external_lesson_code \|\| ''-EXP''\)', 'g');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'CF10_FIX_POSTVERIFY_NORMALIZED_COUNT: %', v_count;
  END IF;
  v_probe := replace(v_def, v_new_expr, '');
  IF position(v_old_expr in v_probe) > 0 THEN
    RAISE EXCEPTION 'CF10_FIX_POSTVERIFY_UNNORMALIZED_REMAINS';
  END IF;
END
$mig$;