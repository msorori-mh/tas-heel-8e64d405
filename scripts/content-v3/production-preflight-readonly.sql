-- TAMKEEN CONTENT V3 / 21H
-- READ-ONLY production baseline. Run only with a read-only operator role.
-- No PII, question text, answer fields, or secrets are selected.

BEGIN;
SET TRANSACTION READ ONLY;

SELECT current_database() AS database_name,
       current_setting('server_version_num') AS server_version_num,
       current_user AS operator_role;

DO $$
DECLARE
  v_name text;
  v_count bigint;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'lessons','lesson_capability_lifecycle','lesson_book_contents',
    'lesson_summaries','lesson_resources','questions','question_revisions',
    'question_targets','lesson_assessments','assessment_questions',
    'subject_textbooks','audit_logs'
  ] LOOP
    IF to_regclass('public.' || v_name) IS NULL THEN
      RAISE NOTICE 'BASELINE object=% status=MISSING', v_name;
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I', v_name) INTO v_count;
      RAISE NOTICE 'BASELINE object=% row_count=%', v_name, v_count;
    END IF;
  END LOOP;

  IF to_regclass('public.lessons') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM public.lessons
       WHERE id = '16c10040-7a7b-4647-add2-4aa4d3f70583'::uuid$q$ INTO v_count;
    RAISE NOTICE 'GOLDEN lesson_row_count=% expected=1', v_count;
  END IF;

  IF to_regclass('public.lesson_book_contents') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM public.lesson_book_contents
       WHERE lesson_id = '16c10040-7a7b-4647-add2-4aa4d3f70583'::uuid$q$ INTO v_count;
    RAISE NOTICE 'GOLDEN book_content_row_count=% expected_at_least=1', v_count;
    EXECUTE $q$SELECT count(*) FROM public.lesson_book_contents
       WHERE lesson_id = '16c10040-7a7b-4647-add2-4aa4d3f70583'::uuid
         AND COALESCE(btrim(content), '') <> ''$q$ INTO v_count;
    RAISE NOTICE 'GOLDEN nonempty_book_content_row_count=% expected_at_least=1', v_count;
  END IF;
END $$;

SELECT x.object_name,
       CASE WHEN x.kind = 'procedure'
            THEN to_regprocedure(x.object_name) IS NOT NULL
            ELSE to_regclass(x.object_name) IS NOT NULL END AS present
  FROM (VALUES
    ('public.lesson_capability_lifecycle'::text, 'relation'::text),
    ('public.question_option_rationales'::text, 'relation'::text),
    ('public.official_question_answers'::text, 'relation'::text),
    ('public.get_lesson_official_questions(uuid)'::text, 'procedure'::text),
    ('public.reveal_official_question_answer(uuid,uuid)'::text, 'procedure'::text)
  ) AS x(object_name, kind);

SELECT 'production_baseline_pending_operator' AS status, true AS value;

ROLLBACK;
