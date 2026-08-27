-- CF10 PG17 assertions: dry-run purity, gated execute, idempotent replay, DRAFT-only, zero answer leak.
CREATE OR REPLACE FUNCTION public.cf10_batch(code text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT b.id FROM public.golden_lesson_domain_stage_batches b
    JOIN public.golden_lesson_packages p ON p.id=b.package_id WHERE p.package_code=code $$;

-- Simulate the production failure: this bound lesson already has legacy authored
-- content, while the verified package contains a different official-book payload.
INSERT INTO public.lesson_book_contents(lesson_id, content)
VALUES ('43000000-0000-0000-0000-000000000001', 'CF10_LEGACY_BOOK_CONTENT');

SET ROLE service_role;

-- 1) DRY_RUN performs no writes and returns a deterministic plan hash.
SELECT set_config('cf10.plan',
  (public.golden_lesson_materialize_domain_batch(
     public.cf10_batch('QURAN-G10-L03-PKG'),
     '10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256'), false);
RESET ROLE;

SELECT public.cf04_assert((SELECT count(*)=1 FROM public.lesson_book_contents),
  'dry run preserves the pre-existing book row');
SELECT public.cf04_assert((SELECT content='CF10_LEGACY_BOOK_CONTENT'
  FROM public.lesson_book_contents WHERE lesson_id='43000000-0000-0000-0000-000000000001'),
  'dry run leaves the pre-existing book bytes unchanged');
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
SELECT public.cf04_assert((SELECT public.cf10_text_sha256(b.content) = e.source_sha256
  FROM public.lesson_book_contents b
  JOIN public.golden_lesson_domain_stage_entries e
    ON e.batch_id=public.cf10_batch('QURAN-G10-L03-PKG')
   AND e.capability='officialBookContent'
 WHERE b.lesson_id='43000000-0000-0000-0000-000000000001'),
  'managed revision replaces legacy book content with the verified staged bytes');
SELECT public.cf04_assert((SELECT write_plan->'managedRevision'->>'policy' =
  'HASH_PINNED_COMPARE_AND_SWAP'
  FROM public.golden_lesson_domain_materializations
  WHERE batch_id=public.cf10_batch('QURAN-G10-L03-PKG')),
  'ledger records the reviewed managed-revision policy');
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
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.lessons),'no duplicate lesson created');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.subjects),'no subject created by CF10');
SELECT public.cf04_assert(NOT has_function_privilege('authenticated','public.golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)','EXECUTE'),'authenticated cannot materialize');

-- 6) Rich batch: bound (CF09) pre-existing lesson shell with an UNRESOLVED (PENDING) semester.
SET ROLE service_role;
SELECT set_config('cf10.plan4',
  (public.golden_lesson_materialize_domain_batch(public.cf10_batch('QURAN-G10-L04-PKG'),
    '10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256'), false);
RESET ROLE;
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.lessons),'rich dry run created no lesson');

SET ROLE service_role;
SELECT public.golden_lesson_materialize_domain_batch(public.cf10_batch('QURAN-G10-L04-PKG'),
  '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan4'),'cf10-key-0004');
RESET ROLE;

SELECT public.cf04_assert((SELECT count(*)=2 FROM public.lessons),'bound EXECUTE created no extra lesson');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.subjects),'still no subject created');
SELECT public.cf04_assert((SELECT NOT lesson_created FROM public.golden_lesson_domain_materializations m WHERE m.batch_id=public.cf10_batch('QURAN-G10-L04-PKG')),'bound EXECUTE never creates a lesson');
-- R5.1: PENDING/unresolved semester stays NULL and is never invented.
SELECT public.cf04_assert((SELECT semester IS NULL FROM public.lessons WHERE slug='quran-lesson-04'),'PENDING semester materializes as NULL');
SELECT public.cf04_assert((SELECT (write_plan->'semester') = 'null'::jsonb AND (write_plan->>'semesterResolved')='false'
  FROM public.golden_lesson_domain_materializations WHERE batch_id=public.cf10_batch('QURAN-G10-L04-PKG')),'write plan records the unresolved semester explicitly');
-- R5.2: the ledger never records a zero-binding EXECUTE.
SELECT public.cf04_assert((SELECT bool_and(binding_id IS NOT NULL) FROM public.golden_lesson_domain_materializations),'ledger binding_id is always non-null');
SELECT public.cf04_assert((SELECT m.binding_id = (SELECT id FROM public.golden_lesson_identity_bindings b WHERE b.batch_id=m.batch_id)
  FROM public.golden_lesson_domain_materializations m WHERE m.batch_id=public.cf10_batch('QURAN-G10-L04-PKG')),'ledger binding points at the CF09 binding');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_resources),'CF10-R6: no legacy resource rows written (HTML deferred to CF11)');
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

-- 9e) Lifecycle drift after DRY_RUN invalidates the reviewed plan before writes.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER golden_materialization_immutable;
DO $$
DECLARE b uuid; l4 uuid; sha text;
BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  SELECT lesson_id INTO l4 FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  DELETE FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  sha := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  UPDATE public.lesson_capability_lifecycle SET draft_hash = repeat('e',64)
   WHERE lesson_id = l4 AND capability = 'mindMap';
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-r3-e');
    RAISE EXCEPTION 'CF10_EXPECTED_LIFECYCLE_PLAN_DRIFT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_WRITE_PLAN_HASH_MISMATCH%' THEN RAISE; END IF;
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

-- 9h) CF10-R10: mutable lesson metadata does not invalidate an authoritative CF09 binding.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER golden_materialization_immutable;
DO $$
DECLARE b uuid; l4 uuid; sha text; res jsonb;
BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  SELECT lesson_id INTO l4 FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  DELETE FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  UPDATE public.lessons
     SET title = title || ' — تحرير', is_free = false, semester = 2, sort_order = sort_order + 10
   WHERE id = l4;
  sha := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  res := public.golden_lesson_materialize_domain_batch(
    b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-r10-metadata');
  PERFORM public.cf04_assert((res->>'domain_writes_performed')::int = 0,
    'bound lesson mutable metadata does not cause an identity conflict');
END $$;
ROLLBACK;

-- 9i) CF10-R6: a pre-existing legacy inline-HTML row for a deferred capability is forbidden.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER golden_materialization_immutable;
DO $$
DECLARE b uuid; sha text; l uuid;
BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  SELECT lesson_id INTO l FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  DELETE FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  INSERT INTO public.lesson_resources(lesson_id, resource_type, title, url, sort_order,
                                      resource_code, html_resource_type, description, metadata, is_primary)
  VALUES (l,'mindmap','legacy','',1,'LEGACY-MINDMAP','STATIC','<p>mindmap-04</p>','{}'::jsonb,false);
  sha := public.golden_lesson_materialize_domain_batch(
           b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-r6-res');
    RAISE EXCEPTION 'CF10_EXPECTED_LEGACY_HTML_REJECTION';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_HTML_LEGACY_ROW_FORBIDDEN%' THEN RAISE; END IF;
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

-- 10e) An NA capability with no payload never blocks visibility; a REQUIRED regression closes
--      the gate again. (An NA row that DOES carry a payload keeps blocking — see 11g.)
BEGIN;
UPDATE public.lesson_capability_lifecycle SET applicability='NA', status='DRAFT', draft_hash=NULL
 WHERE ctid IN (SELECT ctid FROM public.lesson_capability_lifecycle
                 WHERE lesson_id='43000000-0000-0000-0000-000000000001' ORDER BY capability LIMIT 1);
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000004'; SET ROLE authenticated;
SELECT public.cf04_assert((SELECT visible FROM public.lesson_student_content_gate(
  '43000000-0000-0000-0000-000000000001')),'payload-free NA capability does not block visibility');
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
   ->>'seed_attested')::boolean, 'exact replay attests the immutable seed');
SET ROLE service_role;
SELECT public.cf04_assert(
  NOT (public.golden_lesson_materialize_domain_batch(
     public.cf10_batch('QURAN-G10-L03-PKG'),
     '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan'),'cf10-key-0001')
   ->>'live_attested')::boolean, 'ledger shortcut never claims live-state attestation');
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
UPDATE public.golden_lesson_domain_materializations SET result = result - 'seed_sha256' - 'state_sha256'
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

-- duplicate revisions for the same question (question_id is not a unique key on
-- question_revisions, so ambiguity there must abort rather than pick a row)
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER USER;
DELETE FROM public.golden_lesson_domain_materializations
 WHERE batch_id = public.cf10_batch('QURAN-G10-L04-PKG');
ALTER TABLE public.golden_lesson_domain_materializations ENABLE TRIGGER USER;
INSERT INTO public.question_revisions(question_id, revision_number, status, interaction_type,
                                      question_text, max_score, created_by)
  SELECT r.question_id, r.revision_number + 90, r.status, r.interaction_type,
         r.question_text, r.max_score, r.created_by
    FROM public.question_revisions r ORDER BY r.id LIMIT 1;
SET ROLE service_role;
SELECT public.cf10_expect_identity_conflict('QURAN-G10-L04-PKG','question_revisions');
RESET ROLE;
ROLLBACK;

-- The rich (L04) batch is the one carrying the mindMap / lab-experiment capabilities.
CREATE OR REPLACE FUNCTION public.cf10_rich_lesson() RETURNS uuid LANGUAGE sql STABLE
  SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT lesson_id FROM public.golden_lesson_domain_materializations
   WHERE batch_id = public.cf10_batch('QURAN-G10-L04-PKG') $$;

-- 11f) CF10-R6: mindMap / labExperiment HTML is DEFERRED TO CF11. CF10 writes no legacy
--      lesson_resources row at all; the bytes stay staff-only in CF08 staging.
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_resources
   WHERE lesson_id=public.cf10_rich_lesson()),
  'CF10 wrote no legacy lesson_resources row for the HTML capabilities');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_resources
   WHERE coalesce(url,'')='' OR url LIKE 'lesson-internal://html/%'),
  'no empty-url inline HTML row exists anywhere');
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.golden_lesson_domain_stage_entries e
   WHERE e.batch_id=public.cf10_batch('QURAN-G10-L04-PKG')
     AND e.capability IN ('mindMapHtml','labExperimentHtml')
     AND e.source_payload IS NOT NULL AND e.source_sha256 ~ '^[a-f0-9]{64}$'),
  'the HTML bytes/hash/provenance stay in staff-only staging');
SELECT public.cf04_assert((SELECT (result->'html_deferred_to_cf11'->'mindMap'->>'deferred_to_cf11')::boolean
     AND (result->'html_deferred_to_cf11'->'simulation'->>'deferred_to_cf11')::boolean
     AND (result->'html_deferred_to_cf11'->'mindMap'->>'snapshot') IS NULL
   FROM public.golden_lesson_domain_materializations
   WHERE batch_id=public.cf10_batch('QURAN-G10-L04-PKG')),
  'the ledger records deferred_to_cf11 = true with no snapshot claim');
SELECT public.cf04_assert((SELECT bool_and((e->>'deferredToCf11')::boolean)
   FROM public.golden_lesson_domain_materializations m,
        jsonb_array_elements(m.write_plan->'entries') e
   WHERE m.batch_id=public.cf10_batch('QURAN-G10-L04-PKG')
     AND e->>'capability' IN ('mindMapHtml','labExperimentHtml')),
  'the write plan marks both HTML capabilities as deferred');

-- CF10 claims no publication and no READY for them.
SELECT public.cf04_assert(public.cf10_html_publication_pending(public.cf10_rich_lesson(),'mindMap'),
  'mindMap HTML stays pending CF11 publication after CF10');
SELECT public.cf04_assert(public.cf10_html_publication_pending(public.cf10_rich_lesson(),'simulation'),
  'simulation HTML stays pending CF11 publication after CF10');
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.lesson_capability_lifecycle
   WHERE lesson_id=public.cf10_rich_lesson()
     AND capability IN ('mindMap','simulation') AND status='DRAFT'),
  'CF10 leaves mindMap/simulation in DRAFT, never READY');
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000004'; SET ROLE authenticated;
SELECT public.cf04_assert((SELECT NOT visible FROM public.lesson_student_content_gate(
  public.cf10_rich_lesson())),'the CF10 lesson stays invisible to students');
RESET ROLE; RESET request.jwt.claim.sub;

-- Marking them READY inside the CF10 stage is rejected outright.
DO $$ BEGIN
  BEGIN
    UPDATE public.lesson_capability_lifecycle SET status='READY'
     WHERE lesson_id=public.cf10_rich_lesson() AND capability='mindMap';
    RAISE EXCEPTION 'CF10_EXPECTED_READY_TOO_EARLY';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_HTML_CAPABILITY_READY_TOO_EARLY%' THEN RAISE; END IF;
  END;
END $$;

-- 11g) CF10-R7: the HTML READY block is UNSPOOFABLE. A raw lesson_resources row that merely
--      claims `cf11_published_at` must NOT unlock READY, for REQUIRED or OPTIONAL alike.
--      (The old "simulate CF11 then READY is allowed" test is deleted: CF11 does not exist yet.)
BEGIN;
INSERT INTO public.lesson_resources(lesson_id, resource_type, title, url, sort_order,
                                    resource_code, html_resource_type, metadata, is_primary)
VALUES (public.cf10_rich_lesson(),'mindmap','spoof',
        'https://cdn.example.test/spoof/mindmap.html',1,'SPOOF-MINDMAP','STATIC',
        jsonb_build_object('contentFactory','CF11','cf11_published_at',now()),false),
       (public.cf10_rich_lesson(),'experiment','spoof',
        'https://cdn.example.test/spoof/lab.html',2,'SPOOF-EXPERIMENT','INTERACTIVE',
        jsonb_build_object('contentFactory','CF11','cf11_published_at',now()),false);
SELECT public.cf04_assert(public.cf10_html_publication_pending(public.cf10_rich_lesson(),'mindMap'),
  'a spoofed cf11_published_at row does not clear the pending flag');
DO $$
DECLARE cap text;
BEGIN
  FOREACH cap IN ARRAY ARRAY['mindMap','simulation'] LOOP
    BEGIN
      UPDATE public.lesson_capability_lifecycle SET status='READY', ready_at=now(),
             ready_by='10000000-0000-0000-0000-000000000003', ready_hash=draft_hash
       WHERE lesson_id=public.cf10_rich_lesson() AND capability=cap;
      RAISE EXCEPTION 'CF10_EXPECTED_SPOOFED_READY_REJECTION: %', cap;
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%CF10_HTML_CAPABILITY_READY_TOO_EARLY%' THEN RAISE; END IF;
    END;
  END LOOP;
END $$;
SELECT public.cf04_assert(NOT public.lesson_student_visible(public.cf10_rich_lesson()),
  'a spoofed CF11 row never opens the lesson to students');
ROLLBACK;

-- 11h) R6/R7 visibility: a payload-carrying capability keeps the lesson hidden while it is not
--      READY, OPTIONAL included. mindMap/simulation can never be READY before CF11, so the
--      rich lesson stays hidden by construction.
BEGIN;
UPDATE public.lesson_capability_lifecycle
   SET status='READY', ready_at=now(), ready_by='10000000-0000-0000-0000-000000000003',
       ready_hash=draft_hash
 WHERE lesson_id=public.cf10_rich_lesson()
   AND capability NOT IN ('mindMap','simulation');
SELECT public.cf04_assert((SELECT draft_hash IS NOT NULL AND status='DRAFT'
   FROM public.lesson_capability_lifecycle
  WHERE lesson_id=public.cf10_rich_lesson() AND capability='simulation'),
  'the OPTIONAL simulation capability carries a DRAFT payload');
SELECT public.cf04_assert(NOT public.lesson_student_visible(public.cf10_rich_lesson()),
  'OPTIONAL payload in DRAFT keeps the lesson hidden');
UPDATE public.lesson_capability_lifecycle SET status='REVIEW'
 WHERE lesson_id=public.cf10_rich_lesson() AND capability='simulation';
SELECT public.cf04_assert(NOT public.lesson_student_visible(public.cf10_rich_lesson()),
  'OPTIONAL payload in REVIEW keeps the lesson hidden');
SELECT public.cf04_assert(NOT public.lesson_student_visible(public.cf10_rich_lesson()),
  'the HTML capabilities keep the lesson closed until CF11 publishes them');
ROLLBACK;

-- 11i) CF10-R7: binding_id is NOT NULL in the DDL itself, not only via a runtime guard.
SELECT public.cf04_assert((SELECT a.attnotnull FROM pg_attribute a
   WHERE a.attrelid='public.golden_lesson_domain_materializations'::regclass
     AND a.attname='binding_id'),
  'ledger binding_id is NOT NULL in the DDL');
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER USER;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.golden_lesson_domain_materializations(
      batch_id, binding_id, subject_id, lesson_id, idempotency_key,
      write_plan, write_plan_sha256, result, materialized_by)
    VALUES (public.cf10_batch('QURAN-G10-L04-PKG'), NULL,
            '42000000-0000-0000-0000-000000000001', public.cf10_rich_lesson(),
            'cf10-key-notnull','{}'::jsonb, repeat('a',64), '{}'::jsonb,
            '10000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'CF10_EXPECTED_BINDING_NOT_NULL_VIOLATION';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
END $$;
ROLLBACK;



-- ============================================================================
-- 12) CF10-R4c: replay attests the immutable seed, not legitimate transitions.
-- ============================================================================

-- 12a) Legitimate downstream transitions do NOT break replay.
BEGIN;
UPDATE public.lesson_capability_lifecycle SET status='REVIEW'
 WHERE lesson_id='43000000-0000-0000-0000-000000000001' AND capability='officialBookContent';
UPDATE public.question_revisions r SET status='PUBLISHED'
  FROM public.questions q WHERE q.id=r.question_id
   AND q.lesson_id='43000000-0000-0000-0000-000000000001';
UPDATE public.questions SET current_published_revision_id=(
    SELECT id FROM public.question_revisions rv WHERE rv.question_id=questions.id
     ORDER BY revision_number DESC LIMIT 1)
 WHERE lesson_id='43000000-0000-0000-0000-000000000001';
-- R7: a legitimate CF11 resource addition must NOT break replay (lesson_resources is entirely
-- outside the immutable seed).
INSERT INTO public.lesson_resources(lesson_id, resource_type, title, url, sort_order,
                                    resource_code, html_resource_type, metadata, is_primary)
VALUES ('43000000-0000-0000-0000-000000000001','mindmap','CF11 mind map',
        'https://cdn.example.test/cf11/mindmap.html',1,'CF11-MINDMAP-L03','STATIC',
        jsonb_build_object('contentFactory','CF11','cf11_published_at',now()),true);
UPDATE public.lesson_resources SET is_primary = NOT is_primary, sort_order = sort_order + 10
 WHERE lesson_id='43000000-0000-0000-0000-000000000001';
UPDATE public.lessons SET is_free=false, sort_order=sort_order+5
 WHERE id='43000000-0000-0000-0000-000000000001';
SET ROLE service_role;
SELECT public.cf04_assert(
  (public.golden_lesson_materialize_domain_batch(
     public.cf10_batch('QURAN-G10-L03-PKG'),
     '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan'),'cf10-key-0001')
   ->>'seed_attested')::boolean,
  'replay still attests after legitimate lifecycle/publish transitions');
SELECT public.cf04_assert(
  (public.golden_lesson_materialize_domain_batch(
     public.cf10_batch('QURAN-G10-L03-PKG'),
     '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan'),'cf10-key-0001')
   ->>'idempotent')::boolean,
  'a CF11 resource addition does not break replay');
RESET ROLE;
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.golden_lesson_domain_materializations
                            WHERE batch_id = public.cf10_batch('QURAN-G10-L03-PKG')),
  'attested replay after transitions wrote no ledger row');
ROLLBACK;

-- 12b) Replay reports the attested scope explicitly (never an implicit "everything matches").
SET ROLE service_role;
SELECT public.cf04_assert(
  (public.golden_lesson_materialize_domain_batch(
     public.cf10_batch('QURAN-G10-L03-PKG'),
     '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan'),'cf10-key-0001')
   ->>'attested_scope') = 'immutable_seed',
  'replay declares attested_scope = immutable_seed');
SELECT public.cf04_assert(
  (public.golden_lesson_materialize_domain_batch(
     public.cf10_batch('QURAN-G10-L03-PKG'),
     '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan'),'cf10-key-0001')
   ->>'ledger_attested')::boolean, 'replay attests the ledger batch/plan/idempotency identity');
RESET ROLE;

-- 12c) Re-binding the identity under a valid ledger row aborts the replay.
BEGIN;
UPDATE public.lessons SET slug = slug || '-rebound'
 WHERE id='43000000-0000-0000-0000-000000000001';
SET ROLE service_role;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      public.cf10_batch('QURAN-G10-L03-PKG'),
      '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan'),'cf10-key-0001');
    RAISE EXCEPTION 'CF10_EXPECTED_IDENTITY_REBOUND';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_REPLAY_STATE_DRIFT%'
       AND SQLERRM NOT LIKE '%CF10_REPLAY_IDENTITY_REBOUND%'
       AND SQLERRM NOT LIKE '%CF10_IDENTITY_BINDING_LESSON_MISMATCH%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
ROLLBACK;

-- 13) CF10-R5 — semester contract and mandatory CF09 binding on EXECUTE.

-- 13a) A CF09-bound EXECUTE treats semester/sort/unit as lesson-shell operational metadata.
-- Later CF10 revisions deliberately stopped rejecting or overwriting these fields for a bound
-- lesson; identity remains pinned by binding.lesson_id + subject_id + slug. DRY_RUN must plan
-- successfully without mutating either the shell or the existing materialization ledger.
BEGIN;
UPDATE public.lessons SET semester = 2 WHERE slug = 'quran-lesson';
SET ROLE service_role;
DO $$ DECLARE b uuid; planned jsonb; ledger_before bigint; BEGIN
  b := public.cf10_batch('QURAN-G10-L03-PKG');
  SELECT count(*) INTO ledger_before
    FROM public.golden_lesson_domain_materializations WHERE batch_id = b;
  planned := public.golden_lesson_materialize_domain_batch(
    b,'10000000-0000-0000-0000-000000000003','DRY_RUN');
  PERFORM public.cf04_assert(planned->>'mode' = 'DRY_RUN',
    'bound lesson operational metadata blocked DRY_RUN');
  PERFORM public.cf04_assert((SELECT semester=2 FROM public.lessons WHERE slug='quran-lesson'),
    'CF10 overwrote the bound lesson semester');
  PERFORM public.cf04_assert((SELECT count(*) FROM public.golden_lesson_domain_materializations
    WHERE batch_id=b)=ledger_before,'DRY_RUN changed the materialization ledger');
END $$;
RESET ROLE;
ROLLBACK;

-- 13b) A manifest that declares a resolved semester without a value is rejected outright.
SET ROLE service_role;
DO $$ DECLARE b uuid; BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  UPDATE public.golden_lesson_package_versions
     SET manifest = jsonb_set(jsonb_set(manifest,'{identity,semester}','null'),'{identity,semesterStatus}','"RESOLVED"')
   WHERE id = (SELECT v.id FROM public.golden_lesson_package_versions v
                 JOIN public.golden_lesson_domain_stage_batches sb ON sb.package_id=v.package_id AND sb.package_version=v.version
                WHERE sb.id=b);
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(b,'10000000-0000-0000-0000-000000000003','DRY_RUN');
    RAISE EXCEPTION 'CF10_EXPECTED_SEMESTER_STATUS_CONFLICT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_IDENTITY_SEMESTER_CONFLICT%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'resolved semester status without a value is rejected');
  RAISE EXCEPTION 'CF10_R5_ROLLBACK_SENTINEL';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%CF10_R5_ROLLBACK_SENTINEL%' THEN RAISE; END IF;
END $$;
RESET ROLE;

-- 13c) EXECUTE with no CF09 binding is refused; nothing is written.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER USER;
ALTER TABLE public.golden_lesson_identity_bindings DISABLE TRIGGER USER;
DELETE FROM public.golden_lesson_domain_materializations
 WHERE batch_id = public.cf10_batch('QURAN-G10-L04-PKG');
DELETE FROM public.golden_lesson_identity_bindings
 WHERE batch_id = public.cf10_batch('QURAN-G10-L04-PKG');
ALTER TABLE public.golden_lesson_identity_bindings ENABLE TRIGGER USER;
ALTER TABLE public.golden_lesson_domain_materializations ENABLE TRIGGER USER;
SET ROLE service_role;
DO $$ DECLARE b uuid; sha text; BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  sha := public.golden_lesson_materialize_domain_batch(b,'10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256';
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(b,'10000000-0000-0000-0000-000000000003','EXECUTE',sha,'cf10-key-nobind');
    RAISE EXCEPTION 'CF10_EXPECTED_BINDING_REQUIRED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_IDENTITY_BINDING_REQUIRED%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert((SELECT count(*)=0 FROM public.golden_lesson_domain_materializations
    WHERE batch_id = public.cf10_batch('QURAN-G10-L04-PKG')),'zero-binding EXECUTE rolled back with no ledger row');
END $$;
RESET ROLE;
ROLLBACK;

-- 13d) Two bindings for one batch are never disambiguated heuristically.
BEGIN;
ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER USER;
DELETE FROM public.golden_lesson_domain_materializations
 WHERE batch_id = public.cf10_batch('QURAN-G10-L04-PKG');
ALTER TABLE public.golden_lesson_domain_materializations ENABLE TRIGGER USER;
ALTER TABLE public.golden_lesson_identity_bindings DROP CONSTRAINT golden_lesson_identity_bindings_batch_id_key;
INSERT INTO public.golden_lesson_identity_bindings(
  batch_id, grade_id, subject_id, lesson_id, unit_id, curriculum_track_ids,
  external_lesson_code, identity_snapshot, identity_sha256, bound_by)
SELECT batch_id, grade_id, subject_id, lesson_id, unit_id, curriculum_track_ids,
       external_lesson_code, identity_snapshot, identity_sha256, bound_by
  FROM public.golden_lesson_identity_bindings
 WHERE batch_id = public.cf10_batch('QURAN-G10-L04-PKG');
SET ROLE service_role;
DO $$ DECLARE b uuid; BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(b,'10000000-0000-0000-0000-000000000003','EXECUTE',repeat('0',64),'cf10-key-dupbind');
    RAISE EXCEPTION 'CF10_EXPECTED_BINDING_AMBIGUOUS';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF10_IDENTITY_BINDING_AMBIGUOUS%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert((SELECT count(*)=0 FROM public.golden_lesson_domain_materializations
    WHERE batch_id = public.cf10_batch('QURAN-G10-L04-PKG')),'duplicate binding rolled back with no ledger row');
END $$;
RESET ROLE;
ROLLBACK;

-- 13e) The subject is authoritative from the binding: a stale manifest subject code conflicts.
SET ROLE service_role;
DO $$ DECLARE b uuid; BEGIN
  b := public.cf10_batch('QURAN-G10-L04-PKG');
  BEGIN
    UPDATE public.golden_lesson_package_versions
       SET manifest = jsonb_set(manifest,'{identity,subjectCode}','"CHEM-G12"')
     WHERE id = (SELECT v.id FROM public.golden_lesson_package_versions v
                   JOIN public.golden_lesson_domain_stage_batches sb ON sb.package_id=v.package_id AND sb.package_version=v.version
                  WHERE sb.id=b);
    BEGIN
      PERFORM public.golden_lesson_materialize_domain_batch(b,'10000000-0000-0000-0000-000000000003','DRY_RUN');
      RAISE EXCEPTION 'CF10_EXPECTED_SUBJECT_MISMATCH';
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM NOT LIKE '%CF10_IDENTITY_BINDING_SUBJECT_MISMATCH%' THEN RAISE; END IF;
    END;
    PERFORM public.cf04_assert(true,'stale manifest subject code never remaps silently');
    RAISE EXCEPTION 'CF10_R5_ROLLBACK_SENTINEL';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%CF10_R5_ROLLBACK_SENTINEL%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

SELECT 'PASS_CONTENT_FACTORY_10_PG17' AS verdict;
