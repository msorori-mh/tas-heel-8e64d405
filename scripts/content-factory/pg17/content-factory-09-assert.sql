SET ROLE service_role;
SELECT public.golden_lesson_bind_authoritative_identity(
  (SELECT id FROM public.golden_lesson_domain_stage_batches LIMIT 1),
  '10000000-0000-0000-0000-000000000003');
SELECT public.golden_lesson_bind_authoritative_identity(
  (SELECT id FROM public.golden_lesson_domain_stage_batches LIMIT 1),
  '10000000-0000-0000-0000-000000000003');
RESET ROLE;

SELECT public.cf04_assert((SELECT count(*)=1 FROM public.golden_lesson_identity_bindings),'one immutable identity binding');
SELECT public.cf04_assert((SELECT unit_id IS NULL FROM public.golden_lesson_identity_bindings),'null unit remains null');
SELECT public.cf04_assert((SELECT identity_sha256=encode(digest(convert_to(identity_snapshot::text,'UTF8'),'sha256'),'hex') FROM public.golden_lesson_identity_bindings),'snapshot hash pinned');
SELECT public.cf04_assert(NOT has_function_privilege('authenticated','public.golden_lesson_bind_authoritative_identity(uuid,uuid)','EXECUTE'),'authenticated cannot bind identity directly');

DO $$ DECLARE batch uuid; BEGIN
  SELECT id INTO batch FROM public.golden_lesson_domain_stage_batches LIMIT 1;
  DELETE FROM public.golden_lesson_identity_bindings WHERE batch_id=batch;
  RAISE EXCEPTION 'CF09_EXPECTED_IMMUTABILITY_REJECTION';
EXCEPTION WHEN check_violation THEN
  IF SQLERRM NOT LIKE '%GOLDEN_DOMAIN_STAGE_IMMUTABLE%' THEN RAISE; END IF;
END $$;

SELECT 'PASS_CONTENT_FACTORY_09_PG17' AS verdict;
