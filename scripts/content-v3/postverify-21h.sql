-- TAMKEEN CONTENT V3 / 21H / R1
-- Read-only post-apply assertions. This is a runtime candidate, not a
-- substitute for the operator's before/after visibility diff.

BEGIN;
SET TRANSACTION READ ONLY;

DO $$
DECLARE
  v_def text;
  v_count bigint;
  v_has_r5_evidence boolean;
BEGIN
  IF to_regclass('public.lesson_capability_lifecycle') IS NULL
     OR to_regclass('public.question_option_rationales') IS NULL
     OR to_regclass('public.official_question_answers') IS NULL
  THEN RAISE EXCEPTION 'ASSERT_FAIL: V3 objects missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='practice_attempts'
       AND column_name='lesson_assessment_id'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='practice_attempts'
       AND column_name='lesson_id'
  ) THEN
    RAISE EXCEPTION 'ASSERT_FAIL: canonical practice_attempts lesson path mismatch';
  END IF;

  IF to_regclass('public.lesson_assessments') IS NULL
     OR to_regclass('public.assessment_questions') IS NULL
  THEN RAISE EXCEPTION 'ASSERT_FAIL: canonical assessment membership tables missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='lesson_capability_lifecycle'
       AND column_name='applicability'
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: applicability missing'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.lesson_capability_lifecycle
     WHERE capability NOT IN ('officialBookContent','tamkeenExplanation','mindMap','simulation','supportingResources','quickReview','checkUnderstanding','lessonAssessment','originalBookPdf')
        OR capability = 'studentPerformance'
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: invalid lifecycle capability'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.lesson_capability_lifecycle x
     LEFT JOIN public.lessons l ON l.id=x.lesson_id
    WHERE l.id IS NULL
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: orphan lifecycle row'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.lesson_capability_lifecycle
    GROUP BY lesson_id, capability HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: duplicate lifecycle row'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.lesson_capability_lifecycle
     WHERE status NOT IN ('DRAFT','REVIEW','READY')
        OR applicability NOT IN ('REQUIRED','OPTIONAL','NA')
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: invalid lifecycle semantics'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='lesson_capability_lifecycle'
       AND column_name='evidence_origin'
  ) INTO v_has_r5_evidence;

  -- R5 evidence assertions apply to upgraded legacy installations. A clean
  -- 21H installation has no legacy lifecycle rows and legitimately has no R5
  -- provenance layer.
  IF v_has_r5_evidence THEN
      -- Approval evidence: snapshot + hash + timestamp are mandatory. ready_by is
      -- mandatory unless the row carries the documented R5 legacy provenance,
      -- which asserts a measured visible baseline and claims no human review.
      IF EXISTS (
        SELECT 1 FROM public.lesson_capability_lifecycle
         WHERE status='READY'
           AND (ready_at IS NULL OR ready_snapshot IS NULL OR ready_hash IS NULL)
      ) THEN RAISE EXCEPTION 'ASSERT_FAIL: READY row lacks snapshot evidence'; END IF;
    
      IF EXISTS (
        SELECT 1 FROM public.lesson_capability_lifecycle
         WHERE status='READY'
           AND ready_by IS NULL
           AND COALESCE(evidence_origin, '') <> 'LEGACY_20C_VISIBLE_BASELINE'
      ) THEN RAISE EXCEPTION 'ASSERT_FAIL: READY row lacks approval evidence'; END IF;
    
      IF EXISTS (
        SELECT 1 FROM public.lesson_capability_lifecycle
         WHERE capability IN ('originalBookPdf','supportingResources')
           AND (status='READY' OR COALESCE(retirement_origin,'') <> 'LEGACY_20C')
      ) THEN RAISE EXCEPTION 'ASSERT_FAIL: originalBookPdf retirement contract'; END IF;
    
      -- No READY snapshot may pin a question without a published revision.
      IF EXISTS (
        SELECT 1 FROM public.lesson_capability_lifecycle x,
             LATERAL jsonb_array_elements(COALESCE(x.ready_snapshot -> 'payload', '[]'::jsonb)) q
         WHERE x.status='READY' AND x.capability='checkUnderstanding'
           AND COALESCE(q ->> 'revisionId', '') = ''
      ) THEN RAISE EXCEPTION 'ASSERT_FAIL: PUBLISHED_REVISION_NULL in READY snapshot'; END IF;
    
      -- No READY row may carry an empty snapshot payload.
      IF EXISTS (
        SELECT 1 FROM public.lesson_capability_lifecycle
         WHERE status='READY'
           AND NOT public.v3_capability_snapshot_is_reconcilable(ready_snapshot)
      ) THEN RAISE EXCEPTION 'ASSERT_FAIL: EMPTY_READY_SNAPSHOT'; END IF;
    
      -- R5-R3: snapshot and hash must describe exactly the same content, and a
      -- stored hash without a stored snapshot has no provable provenance.
      IF EXISTS (
        SELECT 1 FROM public.lesson_capability_lifecycle
         WHERE status='READY' AND ready_snapshot IS NULL AND ready_hash IS NOT NULL
      ) THEN RAISE EXCEPTION 'ASSERT_FAIL: MISSING_SNAPSHOT_WITH_EXISTING_HASH'; END IF;
    
      IF EXISTS (
        SELECT 1 FROM public.lesson_capability_lifecycle
         WHERE status='READY'
           AND ready_hash IS DISTINCT FROM public.v3_capability_snapshot_hash(ready_snapshot)
      ) THEN RAISE EXCEPTION 'ASSERT_FAIL: READY_SNAPSHOT_HASH_MISMATCH'; END IF;
    
      -- R5-R3: AUDITED_APPROVAL rows must match their audit row exactly.
      IF EXISTS (
        SELECT 1 FROM public.lesson_capability_lifecycle x
         WHERE x.evidence_origin='AUDITED_APPROVAL'
           AND NOT EXISTS (
             SELECT 1 FROM public.v3_capability_audited_approval(x.lesson_id, x.capability) ap
              WHERE ap.actor_id = x.ready_by AND ap.approved_at = x.ready_at)
      ) THEN RAISE EXCEPTION 'ASSERT_FAIL: AUDITED_APPROVAL_ACTOR_MISMATCH'; END IF;
    
  ELSIF EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle) THEN
    RAISE EXCEPTION 'ASSERT_FAIL: R5 evidence layer missing for existing lifecycle rows';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.lesson_capability_lifecycle
     WHERE capability IN ('supportingResources','originalBookPdf')
       AND applicability <> 'NA'
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: legacy reference capability is final'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.lesson_capability_lifecycle
     WHERE status='READY' AND applicability='NA'
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: NA row is READY'; END IF;

  IF to_regprocedure('public.lesson_capability_transition(uuid,text,text,jsonb,text)') IS NULL
     OR to_regprocedure('public.get_lesson_official_questions(uuid)') IS NULL
     OR to_regprocedure('public.reveal_official_question_answer(uuid,uuid)') IS NULL
  THEN RAISE EXCEPTION 'ASSERT_FAIL: V3 RPC signature missing'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid IN (
       to_regprocedure('public.lesson_capability_transition(uuid,text,text,jsonb,text)'),
       to_regprocedure('public.get_lesson_official_questions(uuid)'),
       to_regprocedure('public.reveal_official_question_answer(uuid,uuid)'))
       AND (p.prosecdef IS NOT TRUE OR NOT (p.proconfig @> ARRAY['search_path=public, pg_temp']::text[]))
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: sensitive RPC security contract'; END IF;

  IF has_function_privilege('anon', to_regprocedure('public.get_lesson_official_questions(uuid)'), 'EXECUTE')
     OR has_function_privilege('public', to_regprocedure('public.get_lesson_official_questions(uuid)'), 'EXECUTE')
     OR has_function_privilege('anon', to_regprocedure('public.reveal_official_question_answer(uuid,uuid)'), 'EXECUTE')
     OR has_function_privilege('public', to_regprocedure('public.reveal_official_question_answer(uuid,uuid)'), 'EXECUTE')
  THEN RAISE EXCEPTION 'ASSERT_FAIL: public or anon RPC execute grant'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname IN ('trg_v3_rationales_immutable','trg_v3_official_answers_immutable')
       AND tgenabled <> 'O'
  ) OR (SELECT count(*) FROM pg_trigger WHERE tgname='trg_v3_rationales_immutable') <> 1
     OR (SELECT count(*) FROM pg_trigger WHERE tgname='trg_v3_official_answers_immutable') <> 1
  THEN RAISE EXCEPTION 'ASSERT_FAIL: answer immutability trigger contract'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname IN ('lesson_capability_lifecycle','question_option_rationales','official_question_answers')
       AND c.relrowsecurity IS NOT TRUE
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: V3 RLS missing'; END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges
     WHERE table_schema='public'
       AND table_name IN ('lesson_capability_lifecycle','question_option_rationales','official_question_answers')
       AND grantee IN ('PUBLIC','anon') AND privilege_type='SELECT'
  ) THEN RAISE EXCEPTION 'ASSERT_FAIL: anon/public table read grant'; END IF;

  SELECT pg_get_functiondef(oid) INTO v_def
    FROM pg_proc WHERE oid=to_regprocedure('public.get_lesson_official_questions(uuid)');
  IF lower(v_def) ~ '(correct_index|is_correct|model_answer|rationale|explanation|why_correct|why_wrong)' THEN
    RAISE EXCEPTION 'ASSERT_FAIL: initial payload answer or rationale leak';
  END IF;

  SELECT pg_get_functiondef(oid) INTO v_def
    FROM pg_proc WHERE oid=to_regprocedure('public.reveal_official_question_answer(uuid,uuid)');
  IF lower(v_def) NOT LIKE '%la.lesson_id%'
     OR lower(v_def) NOT LIKE '%la.id = pa.lesson_assessment_id%'
     OR lower(v_def) NOT LIKE '%aq.assessment_id = la.id%'
     OR lower(v_def) NOT LIKE '%paq.question_revision_id%'
     OR lower(v_def) NOT LIKE '%a.revision_id = v_revision%'
     OR lower(v_def) NOT LIKE '%pa.submitted_at is not null%'
     OR lower(v_def) NOT LIKE '%par.submitted_at is not null%'
  THEN RAISE EXCEPTION 'ASSERT_FAIL: reveal gate is not submitted and revision pinned'; END IF;

  SELECT count(*) INTO v_count FROM public.official_question_answers a
   WHERE NOT EXISTS (SELECT 1 FROM public.question_revisions r WHERE r.id=a.revision_id AND r.question_id=a.question_id);
  IF v_count > 0 THEN RAISE EXCEPTION 'ASSERT_FAIL: answer revision pin broken'; END IF;

  SELECT count(*) INTO v_count FROM public.question_option_rationales a
   WHERE NOT EXISTS (SELECT 1 FROM public.question_revisions r WHERE r.id=a.question_revision_id AND r.question_id=a.question_id);
  IF v_count > 0 THEN RAISE EXCEPTION 'ASSERT_FAIL: rationale revision pin broken'; END IF;

  SELECT pg_get_functiondef(oid) INTO v_def
    FROM pg_proc WHERE oid=to_regprocedure('public.lesson_capability_transition(uuid,text,text,jsonb,text)');
  IF lower(v_def) LIKE '%question_revisions%' OR lower(v_def) LIKE '%status = ''published''%' THEN
    RAISE EXCEPTION 'ASSERT_FAIL: lifecycle transition contains auto-publish behavior';
  END IF;
END $$;

SELECT 'answer_layer_counts' AS check_name,
       (SELECT count(*) FROM public.official_question_answers) AS official_answer_rows,
       (SELECT count(*) FROM public.question_option_rationales) AS rationale_rows;

SELECT 'visibility_runtime_gate' AS check_name,
       count(*) FILTER (WHERE status='READY' AND applicability<>'NA') AS ready_applicable_rows,
       count(*) FILTER (WHERE status IN ('DRAFT','REVIEW')) AS denied_lifecycle_rows,
       count(*) FILTER (WHERE applicability='NA') AS excluded_na_rows
  FROM public.lesson_capability_lifecycle;

SELECT 'golden_quran_preserved' AS check_name, count(*) AS value
  FROM public.lesson_book_contents
 WHERE lesson_id='16c10040-7a7b-4647-add2-4aa4d3f70583'::uuid
   AND COALESCE(btrim(content),'')<>'';

SELECT 'lesson_resources_preserved' AS check_name, count(*) AS value FROM public.lesson_resources
UNION ALL
SELECT 'subject_textbooks_preserved', count(*) FROM public.subject_textbooks
UNION ALL
SELECT 'originalBookPdf_data_preserved_excluded',
       (SELECT count(*) FROM public.lesson_resources WHERE COALESCE(is_primary,false) OR resource_type::text='pdf')
        + (SELECT count(*) FROM public.lesson_book_contents WHERE pdf_url IS NOT NULL)
        + (SELECT count(*) FROM public.lessons WHERE content_pdf_url IS NOT NULL);

SELECT 'rls_grants_expected' AS check_name, true AS value
 WHERE NOT EXISTS (
   SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema='public'
      AND table_name IN ('lesson_capability_lifecycle','question_option_rationales','official_question_answers')
      AND grantee IN ('PUBLIC','anon') AND privilege_type='SELECT'
 );

-- The semantic diff supplies independent UNEXPECTED_GAIN_COUNT and
-- UNEXPECTED_LOSS_COUNT gates. Its state remains READY_TO_VERIFY until an
-- operator records both read-only runs; this file does not claim PROVEN.

ROLLBACK;
