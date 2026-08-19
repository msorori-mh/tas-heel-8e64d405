-- TAMKEEN CONTENT V3 / 21H / R1
-- READ-ONLY production baseline. Run with a read-only operator role.
-- No PII, question text, answer fields, or secrets are selected.
-- This script reports the current 20C state and stops on incompatible state;
-- it never repairs, normalizes, or silently replaces pre-existing objects.

BEGIN;
SET TRANSACTION READ ONLY;

SELECT current_database() AS database_name,
       current_setting('server_version_num') AS server_version_num,
       current_user AS operator_role;

SELECT x.object_name,
       CASE WHEN x.kind = 'procedure'
            THEN to_regprocedure(x.object_name) IS NOT NULL
            ELSE to_regclass(x.object_name) IS NOT NULL END AS present
  FROM (VALUES
    ('public.lessons'::text, 'relation'::text),
    ('public.lesson_capability_lifecycle'::text, 'relation'::text),
    ('public.question_option_rationales'::text, 'relation'::text),
    ('public.official_question_answers'::text, 'relation'::text),
    ('public.get_lesson_official_questions(uuid)'::text, 'procedure'::text),
    ('public.reveal_official_question_answer(uuid,uuid)'::text, 'procedure'::text),
    ('public.lesson_capability_transition(uuid,text,text,jsonb,text)'::text, 'procedure'::text),
    ('public.touch_lesson_capability_lifecycle()'::text, 'procedure'::text)
  ) AS x(object_name, kind);

DO $$
DECLARE
  v_count bigint;
  v_bad bigint := 0;
  v_name text;
  v_sql text;
  v_has_lifecycle boolean := to_regclass('public.lesson_capability_lifecycle') IS NOT NULL;
  v_expected_columns constant text[] := ARRAY[
    'id','lesson_id','capability','status','ready_snapshot','ready_hash',
    'draft_hash','draft_updated_at','reviewed_by','reviewed_at','ready_by',
    'ready_at','created_at','updated_at','applicability',
    'evidence_origin','retirement_origin'
  ];
BEGIN
  IF v_has_lifecycle THEN
    RAISE NOTICE '20C_STATE=PRESENT';

    SELECT count(*) INTO v_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'lesson_capability_lifecycle'
       AND column_name = ANY (v_expected_columns);
    RAISE NOTICE '20C lifecycle known_column_count=% expected_max=%', v_count, cardinality(v_expected_columns);

    SELECT count(*) INTO v_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'lesson_capability_lifecycle'
       AND NOT (column_name = ANY (v_expected_columns));
    IF v_count > 0 THEN
      v_bad := v_bad + v_count;
      RAISE NOTICE 'STOP_PRODUCTION_STATE_INCOMPATIBLE unexpected_lifecycle_columns=%', v_count;
    END IF;

    EXECUTE 'SELECT count(*) FROM (SELECT lesson_id, capability FROM public.lesson_capability_lifecycle GROUP BY lesson_id, capability HAVING count(*) > 1) duplicate_keys'
      INTO v_count;
    IF v_count > 0 THEN
      v_bad := v_bad + v_count;
      RAISE NOTICE 'STOP_PRODUCTION_STATE_INCOMPATIBLE duplicate_lifecycle_keys=%', v_count;
    ELSE
      RAISE NOTICE '20C duplicate_lifecycle_keys=0';
    END IF;

    EXECUTE $q$
      SELECT count(*) FROM public.lesson_capability_lifecycle x
       LEFT JOIN public.lessons l ON l.id = x.lesson_id
       WHERE l.id IS NULL
          OR x.capability NOT IN (
            'officialBookContent','tamkeenExplanation','mindMap','simulation',
            'supportingResources','quickReview','checkUnderstanding',
            'lessonAssessment','originalBookPdf')
          OR x.capability = 'studentPerformance'
    $q$ INTO v_count;
    IF v_count > 0 THEN
      v_bad := v_bad + v_count;
      RAISE NOTICE 'STOP_PRODUCTION_STATE_INCOMPATIBLE orphan_or_invalid_lesson_capability_rows=%', v_count;
    ELSE
      RAISE NOTICE '20C orphan_or_invalid_lesson_capability_rows=0';
    END IF;

    EXECUTE $q$
      SELECT count(*) FROM public.lesson_capability_lifecycle x
       WHERE x.status = 'READY'
         AND (x.ready_at IS NULL OR x.ready_by IS NULL
           OR x.ready_snapshot IS NULL OR x.ready_hash IS NULL)
    $q$ INTO v_count;
    IF v_count > 0 THEN
      v_bad := v_bad + v_count;
      RAISE NOTICE 'STOP_PRODUCTION_STATE_INCOMPATIBLE READY_rows_without_current_evidence=%', v_count;
    ELSE
      RAISE NOTICE '20C READY_rows_without_current_evidence=0';
    END IF;

    EXECUTE $q$
      SELECT count(*) FROM public.lesson_capability_lifecycle x
       WHERE x.status = 'READY'
         AND (
           (x.capability = 'officialBookContent' AND NOT EXISTS (SELECT 1 FROM public.lesson_book_contents b WHERE b.lesson_id=x.lesson_id AND COALESCE(btrim(b.content),'')<>''))
        OR (x.capability = 'tamkeenExplanation' AND NOT EXISTS (SELECT 1 FROM public.lesson_explanations e WHERE e.lesson_id=x.lesson_id AND COALESCE(btrim(e.content),'')<>''))
        OR (x.capability = 'quickReview' AND NOT EXISTS (SELECT 1 FROM public.lesson_summaries s WHERE s.lesson_id=x.lesson_id AND COALESCE(btrim(s.summary),'')<>''))
        OR (x.capability = 'mindMap' AND NOT EXISTS (SELECT 1 FROM public.lesson_resources r WHERE r.lesson_id=x.lesson_id AND (r.resource_type::text='mindmap' OR r.html_resource_type::text='mindmap') AND COALESCE(btrim(r.url),'')<>''))
        OR (x.capability = 'simulation' AND NOT (EXISTS (SELECT 1 FROM public.lesson_simulations s WHERE s.lesson_id=x.lesson_id) OR EXISTS (SELECT 1 FROM public.lesson_resources r WHERE r.lesson_id=x.lesson_id AND (r.resource_type::text='experiment' OR r.html_resource_type::text='experiment') AND COALESCE(btrim(r.url),'')<>'')))
        OR (x.capability = 'checkUnderstanding' AND NOT EXISTS (SELECT 1 FROM public.questions q WHERE q.lesson_id=x.lesson_id))
        OR (x.capability = 'lessonAssessment' AND NOT (EXISTS (SELECT 1 FROM public.lesson_assessments a WHERE a.lesson_id=x.lesson_id) OR EXISTS (SELECT 1 FROM public.exam_templates e WHERE e.lesson_id=x.lesson_id)))
         )
    $q$ INTO v_count;
    IF v_count > 0 THEN
      v_bad := v_bad + v_count;
      RAISE NOTICE 'STOP_PRODUCTION_STATE_INCOMPATIBLE READY_rows_without_content=%', v_count;
    ELSE
      RAISE NOTICE '20C READY_rows_without_content=0';
    END IF;

    EXECUTE $q$SELECT count(*) FROM public.lesson_capability_lifecycle WHERE capability = 'originalBookPdf'$q$ INTO v_count;
    RAISE NOTICE '20C legacy_originalBookPdf_lifecycle_rows=% final_contract=EXCLUDED', v_count;
    IF v_count > 0 THEN
      v_bad := v_bad + v_count;
      RAISE NOTICE 'STOP_PRODUCTION_STATE_INCOMPATIBLE legacy_originalBookPdf_lifecycle_rows_present=%', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'lesson_capability_lifecycle';
    RAISE NOTICE '20C lifecycle_policy_count=%', v_count;

    IF EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'lesson_capability_lifecycle'
         AND policyname NOT IN ('students read ready lifecycle rows', 'content staff read all lifecycle rows')
    ) THEN
      v_bad := v_bad + 1;
      RAISE NOTICE 'STOP_PRODUCTION_STATE_INCOMPATIBLE unexpected_20C_lifecycle_policy=true';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.table_privileges
       WHERE table_schema = 'public'
         AND table_name = 'lesson_capability_lifecycle'
         AND grantee IN ('PUBLIC','anon')
         AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE')
    ) THEN
      v_bad := v_bad + 1;
      RAISE NOTICE 'STOP_PRODUCTION_STATE_INCOMPATIBLE public_or_anon_lifecycle_grant=true';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.table_privileges
       WHERE table_schema = 'public'
         AND table_name = 'lesson_capability_lifecycle'
         AND grantee = 'authenticated'
         AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
    ) THEN
      v_bad := v_bad + 1;
      RAISE NOTICE 'STOP_PRODUCTION_STATE_INCOMPATIBLE authenticated_lifecycle_write_grant=true';
    END IF;
  ELSE
    RAISE NOTICE '20C_STATE=ABSENT';
  END IF;

  SELECT count(*) INTO v_count
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r','p','v','m')
     AND (c.relname LIKE 'lesson_capability_lifecycle_%'
       OR c.relname LIKE 'lesson_capability_lifecycle20c%');
  IF v_count > 0 THEN
    v_bad := v_bad + v_count;
    RAISE NOTICE 'STOP_PRODUCTION_STATE_INCOMPATIBLE duplicate_or_overlapping_20C_relations=%', v_count;
  ELSE
    RAISE NOTICE '20C duplicate_or_overlapping_relations=0';
  END IF;

  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proname LIKE 'lesson_capability_transition_%'
       OR p.proname LIKE 'touch_lesson_capability_lifecycle_%');
  IF v_count > 0 THEN
    v_bad := v_bad + v_count;
    RAISE NOTICE 'STOP_PRODUCTION_STATE_INCOMPATIBLE duplicate_or_overlapping_20C_functions=%', v_count;
  ELSE
    RAISE NOTICE '20C duplicate_or_overlapping_functions=0';
  END IF;

  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*) FROM supabase_migrations.schema_migrations
       WHERE version IN ('20260817175640','20260822010000','20260822020000')
    $q$ INTO v_count;
    RAISE NOTICE '20C migration_history_variant_count=% expected_at_most=1', v_count;
    IF v_count > 1 THEN
      v_bad := v_bad + v_count;
      RAISE NOTICE 'STOP_PRODUCTION_STATE_INCOMPATIBLE duplicate_20C_migration_history=true';
    END IF;
  ELSE
    RAISE NOTICE '20C migration_history_variant_count=UNAVAILABLE';
  END IF;

  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'lesson_capability_transition';
  RAISE NOTICE '20C transition_function_overload_count=% expected=1_when_present', v_count;
  IF v_count > 1 THEN
    v_bad := v_bad + v_count;
    RAISE NOTICE 'STOP_PRODUCTION_STATE_INCOMPATIBLE transition_function_overloaded=true';
  END IF;

  IF to_regprocedure('public.lesson_capability_transition(uuid,text,text,jsonb,text)') IS NOT NULL THEN
    IF has_function_privilege('public', to_regprocedure('public.lesson_capability_transition(uuid,text,text,jsonb,text)'), 'EXECUTE')
       OR has_function_privilege('anon', to_regprocedure('public.lesson_capability_transition(uuid,text,text,jsonb,text)'), 'EXECUTE') THEN
      v_bad := v_bad + 1;
      RAISE NOTICE 'STOP_PRODUCTION_STATE_INCOMPATIBLE public_or_anon_transition_execute=true';
    END IF;
    IF has_function_privilege('service_role', to_regprocedure('public.lesson_capability_transition(uuid,text,text,jsonb,text)'), 'EXECUTE') THEN
      RAISE NOTICE '20C legacy_service_role_transition_execute=true final_contract=review_required';
    END IF;
    SELECT pg_get_functiondef(p.oid) INTO v_sql
      FROM pg_proc p
     WHERE p.oid = to_regprocedure('public.lesson_capability_transition(uuid,text,text,jsonb,text)');
    RAISE NOTICE '20C transition_definition=%', v_sql;
  END IF;

  IF to_regprocedure('public.touch_lesson_capability_lifecycle()') IS NOT NULL THEN
    SELECT pg_get_functiondef(p.oid) INTO v_sql
      FROM pg_proc p
     WHERE p.oid = to_regprocedure('public.touch_lesson_capability_lifecycle()');
    RAISE NOTICE '20C touch_definition=%', v_sql;
  END IF;

  IF to_regclass('public.lessons') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM public.lessons WHERE content_pdf_url IS NOT NULL$q$ INTO v_count;
    RAISE NOTICE 'LEGACY originalBookPdf_data_rows_from_lessons=% final_contract=EXCLUDED', v_count;
  END IF;
  IF to_regclass('public.lesson_book_contents') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM public.lesson_book_contents WHERE pdf_url IS NOT NULL$q$ INTO v_count;
    RAISE NOTICE 'LEGACY originalBookPdf_data_rows_from_book_contents=% final_contract=EXCLUDED', v_count;
  END IF;
  IF to_regclass('public.lesson_resources') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM public.lesson_resources WHERE COALESCE(is_primary,false) OR resource_type::text='pdf'$q$ INTO v_count;
    RAISE NOTICE 'LEGACY originalBookPdf_data_rows_from_resources=% final_contract=EXCLUDED', v_count;
  END IF;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'STOP_PRODUCTION_STATE_INCOMPATIBLE: % incompatible pre-existing 20C findings', v_bad;
  END IF;
END $$;

SELECT p.oid::regprocedure AS function_signature,
       p.prosecdef AS security_definer,
       p.proconfig AS configuration,
       pg_get_functiondef(p.oid) AS actual_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN (
     'lesson_capability_transition', 'touch_lesson_capability_lifecycle',
     'get_lesson_official_questions', 'reveal_official_question_answer'
   )
 ORDER BY p.proname, p.oid::regprocedure::text;

SELECT 'GOLDEN lesson_row_count' AS check_name, count(*) AS value
  FROM public.lessons
 WHERE id = '16c10040-7a7b-4647-add2-4aa4d3f70583'::uuid
UNION ALL
SELECT 'GOLDEN book_content_row_count', count(*)
  FROM public.lesson_book_contents
 WHERE lesson_id = '16c10040-7a7b-4647-add2-4aa4d3f70583'::uuid
UNION ALL
SELECT 'lesson_resources_preservation_baseline', count(*) FROM public.lesson_resources
UNION ALL
SELECT 'subject_textbooks_preservation_baseline', count(*) FROM public.subject_textbooks;

SELECT 'production_baseline_status' AS status,
       'READ_ONLY_PREFLIGHT_COMPLETED_OR_STOPPED' AS value;

ROLLBACK;
