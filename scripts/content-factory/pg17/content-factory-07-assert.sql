SELECT public.cf04_assert(
  (SELECT NOT public AND file_size_limit = 52428800 AND allowed_mime_types = ARRAY['application/zip','application/x-zip-compressed']::text[]
   FROM storage.buckets WHERE id='golden-lesson-intake'),
  'private intake bucket contract');

SELECT public.cf04_assert(
  NOT has_function_privilege('authenticated','public.golden_lesson_attest_bundle(uuid,integer,uuid,text,text,integer,bigint,bigint)','EXECUTE'),
  'authenticated cannot forge bundle attestation');
SELECT public.cf04_assert(
  has_function_privilege('service_role','public.golden_lesson_attest_bundle(uuid,integer,uuid,text,text,integer,bigint,bigint)','EXECUTE'),
  'service role can record server-derived attestation');

SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SELECT public.golden_lesson_stage_manifest(
  jsonb_set(public.cf04_manifest('cf07'),'{packageCode}','"QURAN-G10-L02-PKG"'), repeat('7',64));
RESET ROLE;

DO $$
DECLARE pkg uuid;
BEGIN
  SELECT id INTO pkg FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L02-PKG';
  BEGIN
    PERFORM public.golden_lesson_advance_review(pkg,1,'SUBMITTED','{"packageValidationPassed":true}',NULL);
    RAISE EXCEPTION 'CF07_EXPECTED_VERIFIED_BUNDLE_REJECTION';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%VERIFIED_BUNDLE_REQUIRED%' THEN RAISE; END IF;
  END;
END $$;

SET ROLE service_role;
SELECT public.golden_lesson_attest_bundle(
  (SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L02-PKG'), 1,
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001.zip',
  repeat('8',64),7,2048,4096);
RESET ROLE;

SET ROLE authenticated;
SELECT public.golden_lesson_advance_review(
  (SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L02-PKG'),1,
  'SUBMITTED','{"packageValidationPassed":true}',NULL);
RESET ROLE;
RESET request.jwt.claim.sub;

SELECT public.cf04_assert(
  (SELECT review_status='SUBMITTED' FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L02-PKG'),
  'attested package can submit');
SELECT public.cf04_assert(
  (SELECT verified_bundle_sha256=repeat('8',64) AND bundle_verified_at IS NOT NULL
   FROM public.golden_lesson_package_versions v JOIN public.golden_lesson_packages p ON p.id=v.package_id
   WHERE p.package_code='QURAN-G10-L02-PKG' AND v.version=1),
  'bundle evidence persisted');
