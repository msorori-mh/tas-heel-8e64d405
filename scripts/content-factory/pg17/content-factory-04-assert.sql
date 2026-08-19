\set ON_ERROR_STOP on

-- Student cannot stage.
SET ROLE authenticated;
SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
DO $$ BEGIN
  PERFORM public.golden_lesson_stage_manifest(public.cf04_manifest(''), repeat('1',64));
  RAISE EXCEPTION 'student stage unexpectedly succeeded';
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM <> 'NOT_AUTHORIZED' THEN RAISE; END IF;
END $$;

-- Content editor creates version 1; exact retry is a zero-write idempotent result.
SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
SELECT public.golden_lesson_stage_manifest(public.cf04_manifest(''), repeat('1',64));
SELECT public.golden_lesson_stage_manifest(public.cf04_manifest(''), repeat('1',64));
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.golden_lesson_packages),'one package expected');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.golden_lesson_package_versions),'idempotent retry wrote a version');
SELECT id AS package_id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L01-PKG' \gset
SELECT set_config('app.cf04.package_id', :'package_id', false);
SELECT public.golden_lesson_advance_review(:'package_id',1,'SUBMITTED','{"packageValidationPassed":true}'::jsonb,'editor submit');

-- Reviewer must supply both content evidence fields.
SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.golden_lesson_advance_review(current_setting('app.cf04.package_id')::uuid,1,'CONTENT_APPROVED','{}'::jsonb,NULL);
  RAISE EXCEPTION 'missing evidence unexpectedly succeeded';
EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM <> 'EVIDENCE_MISSING' THEN RAISE; END IF;
END $$;
SELECT public.golden_lesson_advance_review(:'package_id',1,'CONTENT_APPROVED',
  '{"officialProvenanceChecked":true,"answerSeparationChecked":true}'::jsonb,'content approved');

-- Reviewer cannot perform technical/admin approval.
DO $$ BEGIN
  PERFORM public.golden_lesson_advance_review(current_setting('app.cf04.package_id')::uuid,1,'APPROVED_FOR_STAGING','{"responsivePreviewChecked":true}'::jsonb,NULL);
  RAISE EXCEPTION 'reviewer final approval unexpectedly succeeded';
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM <> 'ROLE_FORBIDDEN' THEN RAISE; END IF;
END $$;

SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
SELECT public.golden_lesson_advance_review(:'package_id',1,'APPROVED_FOR_STAGING','{"responsivePreviewChecked":true}'::jsonb,'technical approval');
SELECT public.cf04_assert((SELECT review_status='APPROVED_FOR_STAGING' FROM public.golden_lesson_packages WHERE id=:'package_id'),'final staging approval missing');
SELECT public.cf04_assert((SELECT count(*)=3 FROM public.golden_lesson_package_reviews WHERE package_id=:'package_id'),'immutable review trail incomplete');

-- New bytes under the same immutable identity create version 2 and reset review.
SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
SELECT public.golden_lesson_stage_manifest(public.cf04_manifest('v2'), repeat('2',64));
SELECT public.cf04_assert((SELECT current_version=2 AND review_status='DRAFT' FROM public.golden_lesson_packages WHERE id=:'package_id'),'new version did not reset to DRAFT');
SELECT public.cf04_assert((SELECT count(*)=2 FROM public.golden_lesson_package_versions WHERE package_id=:'package_id'),'version 2 missing');
SELECT public.cf04_assert((SELECT count(*)=3 FROM public.golden_lesson_package_reviews WHERE package_id=:'package_id' AND package_version=1),'version 1 audit was changed');

-- Direct mutation remains denied to authenticated users.
DO $$ BEGIN
  UPDATE public.golden_lesson_packages SET review_status='APPROVED_FOR_STAGING' WHERE id=current_setting('app.cf04.package_id')::uuid;
  RAISE EXCEPTION 'direct update unexpectedly succeeded';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

RESET ROLE;
SELECT public.cf04_assert(NOT EXISTS (
  SELECT 1 FROM information_schema.routines
  WHERE routine_schema='public' AND routine_name LIKE 'golden_lesson%execute%'
),'execute function must not exist');
SELECT 'PASS_CONTENT_FACTORY_04_PG17' AS verdict;
