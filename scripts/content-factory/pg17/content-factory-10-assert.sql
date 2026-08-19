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
SELECT public.cf04_assert((SELECT count(*)=7 FROM public.lesson_capability_lifecycle WHERE status='DRAFT' AND applicability='REQUIRED'),'lifecycle is DRAFT and REQUIRED only');
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
  EXCEPTION WHEN check_violation THEN
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

SELECT 'PASS_CONTENT_FACTORY_10_PG17' AS verdict;
