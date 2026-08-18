-- TAMKEEN CONTENT V3 / 21H
-- Post-apply assertions. Read-only and safe to run as a production operator.

BEGIN;
SET TRANSACTION READ ONLY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'capability_applicability'
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: applicability enum missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'lesson_capability_lifecycle'
       AND column_name = 'applicability'
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: applicability column missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'get_lesson_official_questions'
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: public question RPC missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'reveal_official_question_answer'
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: reveal RPC missing'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('get_lesson_official_questions', 'reveal_official_question_answer')
       AND NOT (p.proconfig @> ARRAY['search_path=public, pg_temp']::text[])
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: sensitive RPC search_path not pinned'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = 'reveal_official_question_answer'
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: anon can execute reveal RPC'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = 'reveal_official_question_answer'
       AND has_function_privilege('public', p.oid, 'EXECUTE')
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: PUBLIC can execute reveal RPC'; END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges
     WHERE table_schema = 'public'
       AND table_name IN ('question_option_rationales', 'official_question_answers')
       AND grantee IN ('anon', 'PUBLIC')
       AND privilege_type = 'SELECT'
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: answer-layer read grant exists'; END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('lesson_capability_lifecycle',
                         'question_option_rationales',
                         'official_question_answers')
       AND c.relrowsecurity IS NOT TRUE
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: V3 RLS is not enabled'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.lesson_capability_lifecycle
   WHERE capability IN ('supportingResources', 'originalBookPdf')
     AND applicability <> 'NA'
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: legacy reference capability marked applicable'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.lesson_capability_lifecycle
   WHERE status = 'READY'
     AND ready_by IS NULL
     AND ready_snapshot IS NULL
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: unproven READY backfill detected'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'official_question_answers_revision_fk'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'question_option_rationales_revision_fk'
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: revision-pinned answer foreign keys missing'; END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('official_question_answers', 'question_option_rationales')
       AND column_name IN ('revision_id', 'question_revision_id')
       AND is_nullable <> 'NO'
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: answer revision pin is nullable'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.lesson_capability_lifecycle
   WHERE capability = 'studentPerformance'
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: derived performance has lifecycle row'; END IF;
END $$;

SELECT 'answer_layer_counts' AS check_name,
       (SELECT count(*) FROM public.official_question_answers) AS official_answer_rows,
       (SELECT count(*) FROM public.question_option_rationales) AS rationale_rows;

SELECT 'golden_lesson_book_rows' AS check_name, count(*) AS value
  FROM public.lesson_book_contents
 WHERE lesson_id = '16c10040-7a7b-4647-add2-4aa4d3f70583'::uuid;

ROLLBACK;
