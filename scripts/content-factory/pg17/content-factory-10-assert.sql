-- CF10 PG17 assertions: dry-run purity, gated execute, idempotent replay, DRAFT-only, zero answer leak.
SET ROLE service_role;

-- 1) DRY_RUN performs no writes and returns a deterministic plan hash.
SELECT set_config('cf10.plan',
  (public.golden_lesson_materialize_domain_batch(
     (SELECT id FROM public.golden_lesson_domain_stage_batches LIMIT 1),
     '10000000-0000-0000-0000-000000000003','DRY_RUN')->>'write_plan_sha256'), false);
RESET ROLE;

SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_book_contents),'dry run wrote no book content');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.questions),'dry run wrote no questions');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.lesson_capability_lifecycle),'dry run wrote no lifecycle');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.golden_lesson_domain_materializations),'dry run wrote no ledger row');

-- 2) EXECUTE without the expected plan hash is rejected and rolls back completely.
DO $$ DECLARE b uuid; BEGIN
  SELECT id INTO b FROM public.golden_lesson_domain_stage_batches LIMIT 1;
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
  SELECT id INTO b FROM public.golden_lesson_domain_stage_batches LIMIT 1;
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
      (SELECT id FROM public.golden_lesson_domain_stage_batches LIMIT 1),
      '10000000-0000-0000-0000-000000000004','DRY_RUN');
    RAISE EXCEPTION 'CF10_EXPECTED_ROLE_REJECTION';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%CF10_ADMIN_REQUIRED%' THEN RAISE; END IF;
  END;
END $$;

-- 5) Authorized EXECUTE, then replay.
SET ROLE service_role;
SELECT public.golden_lesson_materialize_domain_batch(
  (SELECT id FROM public.golden_lesson_domain_stage_batches LIMIT 1),
  '10000000-0000-0000-0000-000000000003','EXECUTE',current_setting('cf10.plan'),'cf10-key-0001');
SELECT public.cf04_assert(
  (public.golden_lesson_materialize_domain_batch(
     (SELECT id FROM public.golden_lesson_domain_stage_batches LIMIT 1),
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

-- 6) Ledger is immutable.
DO $$ BEGIN
  DELETE FROM public.golden_lesson_domain_materializations;
  RAISE EXCEPTION 'CF10_EXPECTED_IMMUTABILITY_REJECTION';
EXCEPTION WHEN check_violation THEN
  IF SQLERRM NOT LIKE '%GOLDEN_DOMAIN_STAGE_IMMUTABLE%' THEN RAISE; END IF;
END $$;

SELECT 'PASS_CONTENT_FACTORY_10_PG17' AS verdict;
