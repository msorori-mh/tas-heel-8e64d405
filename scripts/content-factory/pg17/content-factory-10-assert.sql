-- CF10 PG17 assertions: dry-run purity, gated execute, idempotent replay, DRAFT-only, zero answer leak.
CREATE OR REPLACE FUNCTION public.cf10_batch(code text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT b.id FROM public.golden_lesson_domain_stage_batches b
    JOIN public.golden_lesson_packages p ON p.id=b.package_id WHERE p.package_code=code $$;

SET ROLE service_role;

-- 1) DRY_RUN performs no writes and returns a deterministic plan hash.
SELECT set_config('cf10.plan',
  (public.golden_lesson_materialize_domain_batch(
     public.cf10_batch('QURAN-G10-L03-PKG'),
     '10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256'), false);
RESET ROLE;

SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_book_contents),'dry run wrote no book content');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.questions),'dry run wrote no questions');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_capability_lifecycle),'dry run wrote no lifecycle');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.golden_lesson_domain_materializations),'dry run wrote no ledger row');

-- 2) EXECUTE without the expected plan hash is rejected and rolls back completely.
DO $$ DECLARE b uuid; BEGIN
  b := public.cf10_batch('QURAN-G10-L03-PKG');
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(b,'10000000-0000-0000-0000-000000000003','EXECUTE',repeat('0',64),'cf10-key-0001');
    RAISE EXCEPTION 'CF10_EXPECTED_PLAN_HASH_REJECTION';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_WRITE_PLAN_HASH_MISMATCH%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert((SELECT count(*)=0 FROM public.golden_lesson_domain_materializations),'rejected execute rolled back');
  PERFORM public.cf04_assert((SELECT count(*)=0 FROM public.lesson_summaries),'rejected execute wrote no domain rows');
END $$;

-- 3) EXECUTE without idempotency key is rejected.
DO $$ DECLARE b uuid; BEGIN
  b := public.cf10_batch('QURAN-G10-L03-PKG');
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(b,'10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan'),NULL);
    RAISE EXCEPTION 'CF10_EXPECTED_IDEMPOTENCY_REJECTION';
  EXCEPTION WHEN invalid_parameter_value OR invalid_text_representation OR others THEN
    IF SQLERRM NOT LIKE '%CF10_IDEMPOTENCY_KEY_REQUIRED%' THEN RAISE; END IF;
  END;
END $$;

-- 4) Non-admin cannot materialize.
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      public.cf10_batch('QURAN-G10-L03-PKG'),
      '10000000-0000-0000-0000-000000000004','DRY_RUN');
    RAISE EXCEPTION 'CF10_EXPECTED_ROLE_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%CF10_ADMIN_REQUIRED%' THEN RAISE; END IF;
  END;
END $$;

-- 5) Authorized EXECUTE, then replay.
SET ROLE service_role;
SELECT public.golden_lesson_materialize_domain_batch(
  public.cf10_batch('QURAN-G10-L03-PKG'),
  '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan'),'cf10-key-0001');
SELECT public.cf04_assert(
  (public.golden_lesson_materialize_domain_batch(
     public.cf10_batch('QURAN-G10-L03-PKG'),
     '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan'),'cf10-key-0001')->>'idempotent')::boolean,
  'second execute replays idempotently');
RESET ROLE;

SELECT public.cf04_assert((SELECT count(*)=1 FROM public.golden_lesson_domain_materializations),'exactly one ledger row');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lesson_book_contents),'official book content written once');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lesson_explanations),'tamkeen explanation written once');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lesson_summaries),'lesson summary written once');
SELECT public.cf04_assert((SELECT count(*)=7 FROM public.lesson_capability_lifecycle),'seven lifecycle rows');
SELECT public.cf04_assert((SELECT count(*)=7 FROM public.lesson_capability_lifecycle WHERE status='DRAFT'),'lifecycle is DRAFT only');
-- CF10-R4: applicability is copied verbatim from the staged entries (REQUIRED/OPTIONAL/NA),
-- never hard-coded. The L03 package stages 4 REQUIRED, 2 OPTIONAL and 1 NA capability.
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.golden_lesson_domain_stage_entries e
   LEFT JOIN public.lesson_capability_lifecycle l
     ON l.capability = e.lifecycle_capability AND l.lesson_id = '43000000-0000-0000-0000-000000000001'
  WHERE e.batch_id = public.cf10_batch('QURAN-G10-L03-PKG')
    AND l.applicability::text IS DISTINCT FROM e.applicability),
  'lifecycle applicability mirrors the staged entries exactly');
SELECT public.cf04_assert((SELECT count(*)=4 FROM public.lesson_capability_lifecycle WHERE applicability='REQUIRED'),'staged REQUIRED capabilities are REQUIRED');
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.lesson_capability_lifecycle WHERE applicability='OPTIONAL'),'staged OPTIONAL capabilities stay OPTIONAL');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lesson_capability_lifecycle WHERE applicability='NA'),'staged NA capability stays NA');
SELECT public.cf04_assert((SELECT count(*)=7 FROM public.lesson_capability_lifecycle),'exact staged capability set = 7');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_capability_lifecycle WHERE ready_at IS NOT NULL OR ready_hash IS NOT NULL OR ready_snapshot IS NOT NULL),'no READY evidence invented');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.question_options WHERE is_correct),'zero answer leak in options');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.questions WHERE correct_index >= 0),'zero answer leak in question rows');
SELECT public.cf04_assert((SELECT lesson_created IS FALSE FROM public.golden_lesson_domain_materializations),'existing lesson reused, not duplicated');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lessons),'no duplicate lesson created');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.subjects),'no subject created by CF10');
SELECT public.cf04_assert(NOT has_function_privilege('authenticated','public.golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)','EXECUTE'),'authenticated cannot materialize');

-- 6) Rich batch: creates the missing lesson and materializes every capability.
SET ROLE service_role;
SELECT set_config('cf10.plan4',
  (public.golden_lesson_materialize_domain_batch(public.cf10_batch('QURAN-G10-L04-PKG'),
    '10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256'), false);
RESET ROLE;
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lessons),'rich dry run created no lesson');

SET ROLE service_role;
SELECT public.golden_lesson_materialize_domain_batch(public.cf10_batch('QURAN-G10-L04-PKG'),
  '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan4'),'cf10-key-0004');
RESET ROLE;

SELECT public.cf04_assert((SELECT count(*)=2 FROM public.lessons),'missing lesson created exactly once');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.subjects),'still no subject created');
SELECT public.cf04_assert((SELECT lesson_created FROM public.golden_lesson_domain_materializations m JOIN public.golden_lesson_packages p ON true WHERE m.batch_id=public.cf10_batch('QURAN-G10-L04-PKG') LIMIT 1),'ledger records lesson creation');
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.lesson_resources),'mindmap and experiment resources written');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_resources WHERE is_primary),'no primary resource promoted');
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.questions),'official and self-test questions written');
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.question_revisions),'one pinned revision per question');
-- CF10-R2: DRAFT-only revision contract.
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.question_revisions WHERE status='DRAFT'),'all revisions are DRAFT');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.question_revisions WHERE status='PUBLISHED'),'zero PUBLISHED revisions');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.question_revisions WHERE published_at IS NOT NULL OR published_by IS NOT NULL),'no publish metadata written');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.questions WHERE current_published_revision_id IS NOT NULL),'zero current_published_revision_id pointers');
SELECT public.cf04_assert((SELECT bool_and(payload_hash_version='canonical_payload_v1' AND payload_hash ~ '^[0-9a-f]{64}$') FROM public.question_revisions),'payload_hash follows canonical_payload_v1');
SELECT public.cf04_assert((SELECT bool_and(payload_hash = public._qb_compute_revision_payload_hash(id)) FROM public.question_revisions),'payload_hash matches the canonical QB contract');
SELECT public.cf04_assert((SELECT bool_and(source_payload_hash ~ '^[a-f0-9]{64}$') FROM public.question_revisions),'source_payload_hash carries the staged capability digest');
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.question_targets WHERE target_type='LESSON'),'each draft revision has a lesson target');
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.question_options),'self-test options written');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.question_options WHERE is_correct),'options carry no answer key');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.official_question_answers),'answer stored revision-pinned only');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.question_option_rationales),'rationale stored revision-pinned only');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lesson_assessments),'self-test assessment shell created');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.assessment_questions),'assessment membership deferred to the publish stage');
SELECT public.cf04_assert((SELECT count(*)=14 FROM public.lesson_capability_lifecycle WHERE status='DRAFT'),'all lifecycle rows DRAFT');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_capability_lifecycle WHERE status IN ('REVIEW','READY')),'no REVIEW or READY produced');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.questions q WHERE q.question_text ILIKE '%correct_option%' OR q.options::text ILIKE '%rationale%'),'student payload free of answers');

-- 6b) Negative tests against the real production contract.
DO $$ DECLARE q uuid; BEGIN
  SELECT id INTO q FROM public.questions LIMIT 1;
  BEGIN
    INSERT INTO public.question_revisions(question_id, revision_number, status, interaction_type, question_text)
    VALUES (q, 99, 'published', 'SHORT_ANSWER', 'x');
    RAISE EXCEPTION 'CF10_EXPECTED_LOWERCASE_STATUS_REJECTION';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%CF10_EXPECTED_LOWERCASE_STATUS_REJECTION%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.question_revisions(question_id, revision_number, status, interaction_type,
                                          question_text, payload_hash, published_at, published_by)
    VALUES (q, 98, 'PUBLISHED', 'SHORT_ANSWER', 'x', repeat('a',64), now(),
            '10000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'CF10_EXPECTED_PUBLISHED_INSERT_REJECTION';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%CF10_EXPECTED_PUBLISHED_INSERT_REJECTION%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.questions SET current_published_revision_id =
      (SELECT id FROM public.question_revisions WHERE question_id = q LIMIT 1) WHERE id = q;
    RAISE EXCEPTION 'CF10_EXPECTED_POINTER_REJECTION';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%CF10_EXPECTED_POINTER_REJECTION%' THEN RAISE; END IF;
  END;
END $$;
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.question_revisions),'negative tests wrote no revisions');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.questions WHERE current_published_revision_id IS NOT NULL),'negative tests left pointers NULL');


-- 7) Replay of the rich batch is a no-op; conflicting idempotency key is rejected.
SET ROLE service_role;
SELECT public.cf04_assert((public.golden_lesson_materialize_domain_batch(public.cf10_batch('QURAN-G10-L04-PKG'),
  '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan4'),'cf10-key-0004')->>'idempotent')::boolean,'rich replay is idempotent');
RESET ROLE;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(public.cf10_batch('QURAN-G10-L04-PKG'),
      '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan4'),'cf10-key-9999');
    RAISE EXCEPTION 'CF10_EXPECTED_REPLAY_CONFLICT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_REPLAY_CONFLICT%' THEN RAISE; END IF;
  END;
END $$;
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.golden_lesson_domain_materializations),'exactly two ledger rows after replays');

-- 8) Ledger is immutable.
DO $$ BEGIN
  DELETE FROM public.golden_lesson_domain_materializations;
  RAISE EXCEPTION 'CF10_EXPECTED_IMMUTABILITY_REJECTION';
EXCEPTION WHEN check_violation THEN
  IF SQLERRM NOT LIKE '%GOLDEN_DOMAIN_STAGE_IMMUTABLE%' THEN RAISE; END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 9) CF10-R3 — identity / lifecycle collision guards.
--    Each case rebuilds a divergent pre-state inside a transaction and rolls back,
--    so the asserted end-state of the rehearsal is unchanged.
-- ---------------------------------------------------------------------------

-- 9a) A question code that already belongs to another lesson is a hard conflict.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER golden_materialization_immutable;
DO $$
DECLARE b uuid; l4 uuid; other uuid; sha text;
BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  SELECT lesson_id INTO l4 FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  SELECT id INTO other FROM public.lessons WHERE id <> l4 LIMIT 1;
  DELETE FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  UPDATE public.questions SET lesson_id = other WHERE code LIKE '%-OFFQ-%';
  sha := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-r3-a');
    RAISE EXCEPTION 'CF10_EXPECTED_IDENTITY_CONFLICT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_IDENTITY_CONFLICT%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

-- 9b) A question code on the right lesson but the wrong subject is also a conflict.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER golden_materialization_immutable;
INSERT INTO public.subjects(id, code, grade_id)
SELECT '42000000-0000-0000-0000-0000000000ff', 'CF10-OTHER', grade_id FROM public.subjects LIMIT 1;
DO $$
DECLARE b uuid; sha text;
BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  DELETE FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  UPDATE public.questions SET subject_id = '42000000-0000-0000-0000-0000000000ff'
   WHERE code LIKE '%-OFFQ-%';
  sha := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-r3-b');
    RAISE EXCEPTION 'CF10_EXPECTED_SUBJECT_IDENTITY_CONFLICT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_IDENTITY_CONFLICT%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

-- 9c) A diverging selfTest question text is a content conflict, never an overwrite.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER golden_materialization_immutable;
DO $$
DECLARE b uuid; sha text;
BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  DELETE FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  UPDATE public.questions SET question_text = question_text || ' (tampered)' WHERE code LIKE '%-SELF-%';
  sha := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-r3-c');
    RAISE EXCEPTION 'CF10_EXPECTED_SELFTEST_TEXT_CONFLICT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_CONTENT_HASH_CONFLICT%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

-- 9d) A self-test assessment code owned by another lesson is a conflict.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER golden_materialization_immutable;
DO $$
DECLARE b uuid; l4 uuid; other uuid; sha text;
BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  SELECT lesson_id INTO l4 FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  SELECT id INTO other FROM public.lessons WHERE id <> l4 LIMIT 1;
  DELETE FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  UPDATE public.lesson_assessments SET lesson_id = other WHERE assessment_code LIKE '%-SELFTEST';
  sha := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-r3-d');
    RAISE EXCEPTION 'CF10_EXPECTED_ASSESSMENT_CONFLICT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_IDENTITY_CONFLICT%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

-- 9e) A diverging lifecycle row (hash / status / applicability) is a conflict.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER golden_materialization_immutable;
DO $$
DECLARE b uuid; l4 uuid; sha text;
BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  SELECT lesson_id INTO l4 FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  DELETE FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  UPDATE public.lesson_capability_lifecycle SET draft_hash = repeat('e',64)
   WHERE lesson_id = l4 AND capability = 'mindMap';
  sha := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-r3-e');
    RAISE EXCEPTION 'CF10_EXPECTED_LIFECYCLE_CONFLICT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_LIFECYCLE_CONFLICT%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;


-- 9f) Replaying an already-materialized batch writes nothing new (real ROW_COUNT).
SELECT public.cf04_assert(
  (public.golden_lesson_materialize_domain_batch(public.cf10_batch('QURAN-G10-L04-PKG'),
     '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan4'),
     'cf10-key-0004')->>'writes_performed')::int = 0,
  'idempotent replay performs zero writes');
SELECT public.cf04_assert(
  (public.golden_lesson_materialize_domain_batch(public.cf10_batch('QURAN-G10-L04-PKG'),
     '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan4'),
     'cf10-key-0004')->>'payload_hash_updates')::int = 0,
  'idempotent replay performs zero payload_hash updates');

-- 9g) CF10-R4: re-running against a fully pre-existing IDENTICAL domain state (ledger dropped)
--     writes zero domain rows; only the ledger row is (re)inserted, counted separately.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER golden_materialization_immutable;
DO $$
DECLARE b uuid; sha text; res jsonb;
BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  DELETE FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  sha := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  res := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-r4-identical');
  PERFORM public.cf04_assert((res->>'domain_writes_performed')::int = 0,
    'pre-existing identical state performs zero domain writes');
  PERFORM public.cf04_assert((res->>'payload_hash_updates')::int = 0,
    'pre-existing identical state performs zero payload_hash updates');
  PERFORM public.cf04_assert((res->>'ledger_writes')::int = 1,
    'ledger insert is counted separately from domain writes');
END $$;
ROLLBACK;

-- 9h) CF10-R4: an existing lesson whose identity diverges from the manifest is a hard conflict.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER golden_materialization_immutable;
DO $$
DECLARE b uuid; l4 uuid; sha text;
BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  SELECT lesson_id INTO l4 FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  DELETE FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  UPDATE public.lessons SET is_free = false WHERE id = l4;
  sha := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-r4-lesson');
    RAISE EXCEPTION 'CF10_EXPECTED_LESSON_IDENTITY_CONFLICT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_IDENTITY_CONFLICT: lessons%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

-- 9i) CF10-R4: a diverging lesson_resources column (not only the body) is a conflict.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER golden_materialization_immutable;
DO $$
DECLARE b uuid; sha text;
BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  DELETE FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  UPDATE public.lesson_resources SET sort_order = 9 WHERE resource_code LIKE '%-MINDMAP';
  sha := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-r4-res');
    RAISE EXCEPTION 'CF10_EXPECTED_RESOURCE_CONFLICT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_IDENTITY_CONFLICT: lesson_resources%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

-- 9j) CF10-R4: a diverging option body is a conflict (ON CONFLICT never means "accept").
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER golden_materialization_immutable;
DO $$
DECLARE b uuid; sha text;
BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  DELETE FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  UPDATE public.question_options SET body = body || '-tampered';
  sha := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-r4-opt');
    RAISE EXCEPTION 'CF10_EXPECTED_OPTION_CONFLICT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_IDENTITY_CONFLICT: question_options%'
       AND SQLERRM NOT LIKE '%CF10_CONTENT_HASH_CONFLICT: question_revisions%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

-- 9k) CF10-R4: a diverging companion answer is a conflict, never silently accepted.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER golden_materialization_immutable;
DO $$
DECLARE b uuid; sha text;
BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  DELETE FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  ALTER TABLE public.official_question_answers DISABLE TRIGGER trg_v3_official_answers_immutable;
  UPDATE public.official_question_answers SET model_answer = '(z)';
  ALTER TABLE public.official_question_answers ENABLE TRIGGER trg_v3_official_answers_immutable;
  sha := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-r4-ans');
    RAISE EXCEPTION 'CF10_EXPECTED_ANSWER_CONFLICT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_CONTENT_HASH_CONFLICT: official_question_answers%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

-- 9l) CF10-R4: a diverging rationale is a conflict.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER golden_materialization_immutable;
DO $$
DECLARE b uuid; sha text;
BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  DELETE FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  ALTER TABLE public.question_option_rationales DISABLE TRIGGER trg_v3_rationales_immutable;
  UPDATE public.question_option_rationales SET why_correct = 'tampered';
  ALTER TABLE public.question_option_rationales ENABLE TRIGGER trg_v3_rationales_immutable;
  sha := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-r4-rat');
    RAISE EXCEPTION 'CF10_EXPECTED_RATIONALE_CONFLICT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_CONTENT_HASH_CONFLICT: question_option_rationales%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

-- 9m) CF10-R4: a diverging assessment shell (title/sort_order) is a conflict.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER golden_materialization_immutable;
DO $$
DECLARE b uuid; sha text;
BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  DELETE FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  UPDATE public.lesson_assessments SET sort_order = 5 WHERE assessment_code LIKE '%-SELFTEST';
  sha := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-r4-asm');
    RAISE EXCEPTION 'CF10_EXPECTED_ASSESSMENT_FIELD_CONFLICT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_IDENTITY_CONFLICT: lesson_assessments%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 10) CF10-R4 — RLS student visibility gate: ALL REQUIRED capabilities must be READY.
--     (R3 was BLOCKED_PARTIAL_READY_LESSON_SCOPE_LEAK: one READY opened the whole
--      lesson scope, exposing the remaining DRAFT capabilities through the Data API.)
-- ---------------------------------------------------------------------------
INSERT INTO public.lessons(id, slug, subject_id)
VALUES ('43000000-0000-0000-0000-0000000000aa','legacy-unmanaged','42000000-0000-0000-0000-000000000001');

-- 10a) All DRAFT: the student sees nothing of the managed lessons, on every base table.
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000004'; SET ROLE authenticated;
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lessons),'all-DRAFT: only the unmanaged legacy lesson is visible');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_book_contents),'all-DRAFT: zero book content');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_summaries),'all-DRAFT: zero summaries');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_explanations),'all-DRAFT: zero explanations');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_resources),'all-DRAFT: zero resources');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.questions),'all-DRAFT: zero questions');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.question_revisions),'all-DRAFT: zero revisions');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_assessments),'all-DRAFT: zero assessments');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.official_question_answers),'all-DRAFT: zero answers');
SELECT public.cf04_assert((SELECT NOT visible AND managed FROM public.lesson_student_content_gate(
  '43000000-0000-0000-0000-000000000001')),'gate hides the all-DRAFT managed lesson');
SELECT public.cf04_assert((SELECT visible AND NOT managed FROM public.lesson_student_content_gate(
  '43000000-0000-0000-0000-0000000000aa')),'gate keeps unmanaged legacy lessons visible');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lessons_student_visible(
  ARRAY['43000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-0000000000aa']::uuid[])
  WHERE visible),'batch gate returns exactly the unmanaged lesson');
RESET ROLE; RESET request.jwt.claim.sub;

-- Content staff keep full DRAFT visibility.
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000003'; SET ROLE authenticated;
SELECT public.cf04_assert((SELECT count(*)=3 FROM public.lessons),'content staff still see every lesson');
SELECT public.cf04_assert((SELECT count(*)>0 FROM public.questions),'content staff still see DRAFT questions');
RESET ROLE; RESET request.jwt.claim.sub;

-- 10b) One READY + six DRAFT: still completely hidden (the R3 blocker).
UPDATE public.lesson_capability_lifecycle
   SET status='READY', ready_at=now(), ready_by='10000000-0000-0000-0000-000000000003',
       ready_hash=draft_hash
 WHERE ctid IN (SELECT ctid FROM public.lesson_capability_lifecycle
                 WHERE lesson_id='43000000-0000-0000-0000-000000000001' AND status='DRAFT'
                   AND applicability='REQUIRED' ORDER BY capability LIMIT 1);
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000004'; SET ROLE authenticated;
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lessons),'1/7 READY: lesson still hidden');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_book_contents),'1/7 READY: zero book content');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.questions),'1/7 READY: zero questions');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_assessments),'1/7 READY: zero assessments');
SELECT public.cf04_assert((SELECT NOT visible FROM public.lesson_student_content_gate(
  '43000000-0000-0000-0000-000000000001')),'1/7 READY: gate still closed');
RESET ROLE; RESET request.jwt.claim.sub;

-- 10c) Six READY + one DRAFT: still hidden.
UPDATE public.lesson_capability_lifecycle
   SET status='READY', ready_at=now(), ready_by='10000000-0000-0000-0000-000000000003',
       ready_hash=draft_hash
 WHERE ctid IN (SELECT ctid FROM public.lesson_capability_lifecycle
                 WHERE lesson_id='43000000-0000-0000-0000-000000000001' AND status='DRAFT'
                   AND ctid <> (SELECT ctid FROM public.lesson_capability_lifecycle
                                 WHERE lesson_id='43000000-0000-0000-0000-000000000001'
                                   AND status='DRAFT' AND applicability='REQUIRED'
                                 ORDER BY capability LIMIT 1));
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000004'; SET ROLE authenticated;
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lesson_capability_lifecycle
   WHERE lesson_id='43000000-0000-0000-0000-000000000001' AND status='DRAFT'
     AND applicability='REQUIRED'),'exactly one REQUIRED capability is left DRAFT');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lessons),'6/7 READY: lesson still hidden');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_book_contents),'6/7 READY: zero book content');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.questions),'6/7 READY: zero questions');
SELECT public.cf04_assert((SELECT NOT visible FROM public.lesson_student_content_gate(
  '43000000-0000-0000-0000-000000000001')),'6/7 READY: gate still closed');
RESET ROLE; RESET request.jwt.claim.sub;

-- 10d) All REQUIRED READY while OPTIONAL and NA stay DRAFT: the lesson opens.
--      OPTIONAL/NA capabilities must never gate the lesson, only REQUIRED ones do.
UPDATE public.lesson_capability_lifecycle
   SET status='DRAFT', ready_at=NULL, ready_by=NULL, ready_hash=NULL
 WHERE lesson_id='43000000-0000-0000-0000-000000000001'
   AND applicability IN ('OPTIONAL','NA');
UPDATE public.lesson_capability_lifecycle
   SET status='READY', ready_at=now(), ready_by='10000000-0000-0000-0000-000000000003',
       ready_hash=draft_hash
 WHERE lesson_id='43000000-0000-0000-0000-000000000001'
   AND applicability='REQUIRED' AND status='DRAFT';
SELECT public.cf04_assert((SELECT count(*)=3 FROM public.lesson_capability_lifecycle
   WHERE lesson_id='43000000-0000-0000-0000-000000000001' AND status='DRAFT'),
  'OPTIONAL and NA capabilities are still DRAFT while the gate opens');
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000004'; SET ROLE authenticated;
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.lessons),'all REQUIRED READY: the completed lesson appears');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lesson_book_contents),'all REQUIRED READY: book content exposed');
SELECT public.cf04_assert((SELECT visible FROM public.lesson_student_content_gate(
  '43000000-0000-0000-0000-000000000001')),'all REQUIRED READY: gate open');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lessons WHERE slug='quran-lesson-04'),
  'the still-DRAFT lesson stays hidden');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.question_options WHERE is_correct),
  'no answer key is ever readable');
RESET ROLE; RESET request.jwt.claim.sub;

-- 10e) NA capabilities never block visibility; a REQUIRED regression closes the gate again.
BEGIN;
UPDATE public.lesson_capability_lifecycle SET applicability='NA', status='DRAFT'
 WHERE ctid IN (SELECT ctid FROM public.lesson_capability_lifecycle
                 WHERE lesson_id='43000000-0000-0000-0000-000000000001' ORDER BY capability LIMIT 1);
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000004'; SET ROLE authenticated;
SELECT public.cf04_assert((SELECT visible FROM public.lesson_student_content_gate(
  '43000000-0000-0000-0000-000000000001')),'NA capability does not block visibility');
RESET ROLE; RESET request.jwt.claim.sub;
ROLLBACK;

BEGIN;
UPDATE public.lesson_capability_lifecycle SET status='REVIEW'
 WHERE ctid IN (SELECT ctid FROM public.lesson_capability_lifecycle
                 WHERE lesson_id='43000000-0000-0000-0000-000000000001'
                   AND applicability='REQUIRED' ORDER BY capability LIMIT 1);
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000004'; SET ROLE authenticated;
SELECT public.cf04_assert((SELECT NOT visible FROM public.lesson_student_content_gate(
  '43000000-0000-0000-0000-000000000001')),'a REQUIRED REVIEW capability closes the gate again');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_book_contents),
  'a REQUIRED regression hides the content again');
RESET ROLE; RESET request.jwt.claim.sub;
ROLLBACK;

-- 10f) An OPTIONAL capability that never reaches READY still does not block the lesson.
BEGIN;
UPDATE public.lesson_capability_lifecycle SET status='REVIEW'
 WHERE lesson_id='43000000-0000-0000-0000-000000000001' AND applicability='OPTIONAL';
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000004'; SET ROLE authenticated;
SELECT public.cf04_assert((SELECT visible FROM public.lesson_student_content_gate(
  '43000000-0000-0000-0000-000000000001')),'OPTIONAL capability never blocks visibility');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lesson_book_contents),
  'OPTIONAL non-READY keeps the REQUIRED content readable');
RESET ROLE; RESET request.jwt.claim.sub;
ROLLBACK;

-- 10g) A lesson whose capabilities are all OPTIONAL/NA has no REQUIRED row and stays hidden.
BEGIN;
UPDATE public.lesson_capability_lifecycle SET applicability='OPTIONAL'
 WHERE lesson_id='43000000-0000-0000-0000-000000000001' AND applicability='REQUIRED';
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000004'; SET ROLE authenticated;
SELECT public.cf04_assert((SELECT NOT visible FROM public.lesson_student_content_gate(
  '43000000-0000-0000-0000-000000000001')),'a managed lesson with zero REQUIRED rows stays hidden');
RESET ROLE; RESET request.jwt.claim.sub;
ROLLBACK;

-- ============================================================================
-- 11) CF10-R4b: replay attestation, identity ambiguity, inline HTML binding.
-- ============================================================================

-- 11a) Exact replay re-attests the live state and writes nothing new.
SET ROLE service_role;
SELECT public.cf04_assert(
  (public.golden_lesson_materialize_domain_batch(
     public.cf10_batch('QURAN-G10-L03-PKG'),
     '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan'),'cf10-key-0001')
   ->>'state_attested')::boolean, 'exact replay attests the live domain state');
RESET ROLE;
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.golden_lesson_domain_materializations
                            WHERE batch_id = public.cf10_batch('QURAN-G10-L03-PKG')),
  'exact replay wrote no extra ledger row');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lesson_book_contents
                            WHERE lesson_id='43000000-0000-0000-0000-000000000001'),
  'exact replay wrote no extra domain rows');

-- 11b) Tampering a materialized row makes replay fail instead of returning cached success.
BEGIN;
UPDATE public.lesson_summaries SET summary = summary || ' TAMPERED'
 WHERE lesson_id='43000000-0000-0000-0000-000000000001';
SET ROLE service_role;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      public.cf10_batch('QURAN-G10-L03-PKG'),
      '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan'),'cf10-key-0001');
    RAISE EXCEPTION 'CF10_EXPECTED_REPLAY_DRIFT_REJECTION';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_REPLAY_STATE_DRIFT%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
ROLLBACK;

-- 11c) Deleting a materialized row is drift too (not a silent cached success).
BEGIN;
DELETE FROM public.lesson_book_contents WHERE lesson_id='43000000-0000-0000-0000-000000000001';
SET ROLE service_role;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      public.cf10_batch('QURAN-G10-L03-PKG'),
      '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan'),'cf10-key-0001');
    RAISE EXCEPTION 'CF10_EXPECTED_REPLAY_DELETE_DRIFT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_REPLAY_STATE_DRIFT%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
ROLLBACK;

-- 11d) A ledger row without an attestation hash (e.g. a legacy pre-R4b row) cannot replay at all.
--      The ledger is immutable in normal operation, so the trigger is disabled only to forge
--      that legacy shape inside a rolled-back transaction.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER USER;
UPDATE public.golden_lesson_domain_materializations SET result = result - 'state_sha256'
 WHERE batch_id = public.cf10_batch('QURAN-G10-L03-PKG');
ALTER TABLE public.golden_lesson_domain_materializations ENABLE TRIGGER USER;
SET ROLE service_role;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      public.cf10_batch('QURAN-G10-L03-PKG'),
      '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan'),'cf10-key-0001');
    RAISE EXCEPTION 'CF10_EXPECTED_ATTESTATION_MISSING';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_REPLAY_ATTESTATION_MISSING%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
ROLLBACK;

-- 11e) Ambiguous (duplicated) pre-existing rows on non-unique lookup keys abort as identity
--      conflicts instead of silently binding to an arbitrary row.
CREATE OR REPLACE FUNCTION public.cf10_expect_identity_conflict(_pkg text, _label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE b uuid; sha text;
BEGIN
  b := public.cf10_batch(_pkg);
  sha := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-dup-'||md5(_label));
    RAISE EXCEPTION 'CF10_EXPECTED_IDENTITY_CONFLICT: %', _label;
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_IDENTITY_CONFLICT%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true, 'duplicate '||_label||' aborts as CF10_IDENTITY_CONFLICT');
END $$;

-- The other lookup keys the RPC binds on are protected by unique indexes, so ambiguity is
-- structurally impossible there; assert that protection instead of forging an unreachable state.
SELECT public.cf04_assert((SELECT count(*)=6 FROM pg_indexes
   WHERE schemaname='public' AND indexname IN (
     'lessons_subject_id_slug_key','questions_code_uniq','idx_lesson_resources_code_per_lesson',
     'lesson_explanations_code_lesson_uniq','lesson_assessments_code_uniq',
     'lesson_book_contents_lesson_id_key')),
  'every single-row lookup key the RPC binds on is uniquely indexed');

-- duplicate revisions for the same question
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER USER;
DELETE FROM public.golden_lesson_domain_materializations
 WHERE batch_id = public.cf10_batch('QURAN-G10-L03-PKG');
ALTER TABLE public.golden_lesson_domain_materializations ENABLE TRIGGER USER;
INSERT INTO public.question_revisions(question_id, revision_number, status, interaction_type,
                                      question_text, max_score, created_by)
  SELECT r.question_id, r.revision_number + 90, r.status, r.interaction_type,
         r.question_text, r.max_score, r.created_by
    FROM public.question_revisions r
   ORDER BY r.id LIMIT 1;
SET ROLE service_role;
SELECT public.cf10_expect_identity_conflict('QURAN-G10-L03-PKG','question_revisions');
RESET ROLE;
ROLLBACK;

-- 11f) Inline HTML delivery: mind map and lab experiment bind to the published in-app scheme,
--      keep a non-empty snapshot payload, and expose the exact body the UI renders.
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.lesson_resources r
   WHERE r.lesson_id='43000000-0000-0000-0000-000000000001'
     AND r.html_resource_type IS NOT NULL
     AND r.url LIKE 'lesson-internal://html/%'
     AND coalesce(r.description,'') <> ''),
  'mindMap and simulation are bound to non-empty inline HTML resources');

SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_resources r
   WHERE r.lesson_id='43000000-0000-0000-0000-000000000001'
     AND r.html_resource_type IS NOT NULL
     AND r.metadata->>'contentHash' IS DISTINCT FROM public.cf10_text_sha256(r.description)),
  'inline HTML metadata hash matches the stored body byte-for-byte');

SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lesson_resources r
   WHERE r.lesson_id='43000000-0000-0000-0000-000000000001'
     AND r.html_resource_type='STATIC' AND r.resource_type::text='mindmap'
     AND r.metadata->>'renderMode'='STATIC_NO_SCRIPT'),
  'the mind map renders JS-free (STATIC_NO_SCRIPT)');

SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lesson_resources r
   WHERE r.lesson_id='43000000-0000-0000-0000-000000000001'
     AND r.html_resource_type='INTERACTIVE' AND r.resource_type::text='experiment'
     AND r.metadata->>'renderMode'='SANDBOXED_NO_NETWORK'),
  'the lab experiment renders sandboxed with no network');

-- the body the student runtime reads is exactly the staged payload
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.lesson_resources r
   JOIN public.golden_lesson_domain_stage_entries e
     ON e.capability = CASE WHEN r.resource_type::text='mindmap' THEN 'mindMap' ELSE 'simulation' END
    AND e.batch_id = public.cf10_batch('QURAN-G10-L03-PKG')
   WHERE r.lesson_id='43000000-0000-0000-0000-000000000001'
     AND r.html_resource_type IS NOT NULL
     AND e.payload_sha256 = public.cf10_text_sha256(r.description)),
  'inline HTML body equals the staged payload the UI renders');

-- V3 snapshots for both capabilities are non-empty and reconcilable
SELECT public.cf04_assert(
  jsonb_array_length(coalesce(public.v3_capability_snapshot(
    '43000000-0000-0000-0000-000000000001','mindMap')->'resources','[]'::jsonb)) > 0,
  'mindMap snapshot is non-empty');
SELECT public.cf04_assert(
  jsonb_array_length(coalesce(public.v3_capability_snapshot(
    '43000000-0000-0000-0000-000000000001','simulation')->'resources','[]'::jsonb)) > 0,
  'simulation snapshot is non-empty');
SELECT public.cf04_assert(public.v3_capability_snapshot_is_reconcilable(
  public.v3_capability_snapshot('43000000-0000-0000-0000-000000000001','mindMap')),
  'mindMap snapshot is reconcilable');
SELECT public.cf04_assert(public.v3_capability_snapshot_is_reconcilable(
  public.v3_capability_snapshot('43000000-0000-0000-0000-000000000001','simulation')),
  'simulation snapshot is reconcilable');

SELECT 'PASS_CONTENT_FACTORY_10_PG17' AS verdict;
