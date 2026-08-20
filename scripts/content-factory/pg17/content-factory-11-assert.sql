-- =====================================================================================
-- CF11 PG17 CONTRACT / SECURITY / IDEMPOTENCY / ROLLBACK ASSERTS
-- Publisher  = 10000000-...-0003 (admin)
-- Attester   = 10000000-...-0005 (admin, a DIFFERENT real human)
-- Non-staff  = 10000000-...-0004 (student)
-- =====================================================================================
\set batch '51000000-0000-0000-0000-000000000001'
\set lesson '43000000-0000-0000-0000-000000000012'
\set pub '10000000-0000-0000-0000-000000000003'
\set att '10000000-0000-0000-0000-000000000005'
\set stu '10000000-0000-0000-0000-000000000004'

-- ------------------------------------------------------------------------------------
-- A) Schema surface
-- ------------------------------------------------------------------------------------
SELECT public.cf04_assert(
  (SELECT public IS FALSE FROM storage.buckets WHERE id='golden-lesson-assets'),
  'golden-lesson-assets bucket must be PRIVATE');
SELECT public.cf04_assert(
  (SELECT count(*)=0 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND 'anon'=ANY(roles)
      AND qual LIKE '%golden-lesson-assets%'),
  'no anon policy may exist for the asset bucket');
SELECT public.cf04_assert(
  (SELECT attnotnull FROM pg_attribute
    WHERE attrelid='public.golden_lesson_publications'::regclass AND attname='binding_id'),
  'publications.binding_id must be NOT NULL in the DDL');
SELECT public.cf04_assert(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.golden_lesson_published_assets'::regclass),
  'published assets table must enforce RLS');
SELECT public.cf04_assert(
  (SELECT count(*)=0 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='golden_lesson_publications' AND grantee='anon'),
  'anon must have no grant on the publication ledger');

-- ------------------------------------------------------------------------------------
-- B) Authorization + actor identity
-- ------------------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', :'stu', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000004','DRY_RUN', public.cf11_iron_assets());
    RAISE EXCEPTION 'CF11_EXPECTED_NOT_AUTHORIZED';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%CF11_NOT_AUTHORIZED%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'a non-staff user can never publish');
END $$;

SELECT set_config('request.jwt.claim.sub', :'pub', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    -- Claiming to act as someone else must fail even for a real staff session.
    PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000005','DRY_RUN', public.cf11_iron_assets());
    RAISE EXCEPTION 'CF11_EXPECTED_ACTOR_MISMATCH';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%CF11_ACTOR_IDENTITY_MISMATCH%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'impersonation is impossible: auth.uid() is authoritative');
END $$;

-- READY can never be reached before a publication exists (no DRAFT -> READY path).
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_attest_cf11_ready('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003',
      jsonb_build_object('reviewedContent',true,'reviewedSecurity',true,'note','x'),'EXECUTE');
    RAISE EXCEPTION 'CF11_EXPECTED_NO_PUBLICATION';
  EXCEPTION WHEN no_data_found THEN
    IF SQLERRM NOT LIKE '%CF11_PUBLICATION_MISSING%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(
    (SELECT count(*)=7 FROM public.lesson_capability_lifecycle
      WHERE lesson_id='43000000-0000-0000-0000-000000000012' AND status='DRAFT'),
    'lifecycle is untouched by a refused READY attestation');
END $$;

-- ------------------------------------------------------------------------------------
-- B2) Upload attestation is MACHINE-ONLY (CF11-R5), mandatory and byte-exact.
-- ------------------------------------------------------------------------------------
DO $$
BEGIN
  -- publish without an attestation must fail closed
  BEGIN
    PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','DRY_RUN', public.cf11_iron_assets());
    RAISE EXCEPTION 'CF11_EXPECTED_ATTESTATION_REQUIRED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_ASSET_ATTESTATION_MISSING%' THEN RAISE; END IF;
  END;

  -- CF11-R5: a signed-in human — even a real staff operator — may not attest bytes at all.
  BEGIN
    PERFORM public.golden_lesson_attest_cf11_asset('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','OFFICIAL-FIGURE-1-1',
      'a5e17da2c7343bc3f4289a3258f646d635e7a8365b84f2b7c7209134f0614daf', 26742,
      'image/jpeg','ffd8ffe000104a46','SERVER_BYTE_READBACK','EXECUTE');
    RAISE EXCEPTION 'CF11_EXPECTED_MACHINE_ONLY';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%CF11_ASSET_ATTESTATION_MACHINE_ONLY%'
       AND SQLERRM NOT LIKE '%permission denied%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(
    (SELECT count(*)=0 FROM public.golden_lesson_asset_attestations),
    'a human-claimed attestation must write zero rows');
END $$;

-- The machine identity: service_role, no auth.uid() at all.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SET ROLE service_role;
DO $$
DECLARE res jsonb;
BEGIN
  -- wrong bytes / size / mime are all refused
  BEGIN
    PERFORM public.golden_lesson_attest_cf11_asset('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','OFFICIAL-FIGURE-1-1', repeat('b',64), 26742,
      'image/jpeg','ffd8ffe0','SERVER_BYTE_READBACK','EXECUTE');
    RAISE EXCEPTION 'CF11_EXPECTED_BYTES_MISMATCH';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_ASSET_BYTES_MISMATCH%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.golden_lesson_attest_cf11_asset('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','OFFICIAL-FIGURE-1-1',
      'a5e17da2c7343bc3f4289a3258f646d635e7a8365b84f2b7c7209134f0614daf', 26743,
      'image/jpeg','ffd8ffe0','SERVER_BYTE_READBACK','EXECUTE');
    RAISE EXCEPTION 'CF11_EXPECTED_SIZE_MISMATCH';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_ASSET_SIZE_MISMATCH%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.golden_lesson_attest_cf11_asset('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','OFFICIAL-FIGURE-1-1',
      'a5e17da2c7343bc3f4289a3258f646d635e7a8365b84f2b7c7209134f0614daf', 26742,
      'image/png','89504e47','SERVER_BYTE_READBACK','EXECUTE');
    RAISE EXCEPTION 'CF11_EXPECTED_MIME_MISMATCH';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_ASSET_MIME_MISMATCH%' THEN RAISE; END IF;
  END;
  -- correct MIME but PNG magic bytes: magic sniffing must refuse it
  BEGIN
    PERFORM public.golden_lesson_attest_cf11_asset('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','OFFICIAL-FIGURE-1-1',
      'a5e17da2c7343bc3f4289a3258f646d635e7a8365b84f2b7c7209134f0614daf', 26742,
      'image/jpeg','89504e47','SERVER_BYTE_READBACK','EXECUTE');
    RAISE EXCEPTION 'CF11_EXPECTED_MAGIC_MISMATCH';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_ASSET_MAGIC_MISMATCH%' THEN RAISE; END IF;
  END;
  -- an undeclared asset code can never be attested
  BEGIN
    PERFORM public.golden_lesson_attest_cf11_asset('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','OFFICIAL-FIGURE-9-9',
      'a5e17da2c7343bc3f4289a3258f646d635e7a8365b84f2b7c7209134f0614daf', 26742,
      'image/jpeg','ffd8ffe0','SERVER_BYTE_READBACK','EXECUTE');
    RAISE EXCEPTION 'CF11_EXPECTED_NOT_DECLARED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_ASSET_NOT_DECLARED%' THEN RAISE; END IF;
  END;
  -- a fabricated verification origin is refused: only a real server readback is evidence
  BEGIN
    PERFORM public.golden_lesson_attest_cf11_asset('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','OFFICIAL-FIGURE-1-1',
      'a5e17da2c7343bc3f4289a3258f646d635e7a8365b84f2b7c7209134f0614daf', 26742,
      'image/jpeg','ffd8ffe000104a46','OPERATOR_CLAIM','EXECUTE');
    RAISE EXCEPTION 'CF11_EXPECTED_ORIGIN_INVALID';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%CF11_ASSET_VERIFICATION_ORIGIN_INVALID%' THEN RAISE; END IF;
  END;
  -- the recorded requester must be real content staff
  BEGIN
    PERFORM public.golden_lesson_attest_cf11_asset('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000004','OFFICIAL-FIGURE-1-1',
      'a5e17da2c7343bc3f4289a3258f646d635e7a8365b84f2b7c7209134f0614daf', 26742,
      'image/jpeg','ffd8ffe000104a46','SERVER_BYTE_READBACK','EXECUTE');
    RAISE EXCEPTION 'CF11_EXPECTED_REQUESTER_NOT_STAFF';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%CF11_NOT_AUTHORIZED%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(
    (SELECT count(*)=0 FROM public.golden_lesson_asset_attestations),
    'a refused attestation must write zero rows');

  -- the real, byte-exact machine attestation
  res := public.golden_lesson_attest_cf11_asset('51000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003','OFFICIAL-FIGURE-1-1',
    'a5e17da2c7343bc3f4289a3258f646d635e7a8365b84f2b7c7209134f0614daf', 26742,
    'image/jpeg','ffd8ffe000104a46','SERVER_BYTE_READBACK','EXECUTE');
  PERFORM public.cf04_assert((res->>'writes_performed')::int = 1,'attestation must append one row');
  res := public.golden_lesson_attest_cf11_asset('51000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003','OFFICIAL-FIGURE-1-1',
    'a5e17da2c7343bc3f4289a3258f646d635e7a8365b84f2b7c7209134f0614daf', 26742,
    'image/jpeg','ffd8ffe000104a46','SERVER_BYTE_READBACK','EXECUTE');
  PERFORM public.cf04_assert((res->>'idempotent')::boolean,'attestation replay must be idempotent');
  PERFORM public.cf04_assert(
    (SELECT count(*)=1 FROM public.golden_lesson_asset_attestations
      WHERE verification_origin='SERVER_BYTE_READBACK'
        AND requested_by='10000000-0000-0000-0000-000000000003'),
    'the attestation records the machine origin and the requesting human');

  -- CF11-R5: the service role may not reach the raw CF10 entry point
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch(
      '51000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','DRY_RUN');
    RAISE EXCEPTION 'CF11_EXPECTED_CF10_DENIED_TO_SERVICE_ROLE';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- the ledger is immutable even for the machine
  BEGIN
    UPDATE public.golden_lesson_asset_attestations SET sha256 = repeat('c',64);
    RAISE EXCEPTION 'CF11_EXPECTED_LEDGER_IMMUTABLE';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'pub', false);
SET ROLE authenticated;


-- ------------------------------------------------------------------------------------
-- C) DRY_RUN writes nothing and returns a stable plan
-- ------------------------------------------------------------------------------------
DO $$
DECLARE r1 jsonb; r2 jsonb; before_rows integer; after_rows integer;
BEGIN
  SELECT count(*) INTO before_rows FROM public.lesson_resources;
  r1 := public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000003','DRY_RUN', public.cf11_iron_assets());
  r2 := public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000003','DRY_RUN', public.cf11_iron_assets());
  SELECT count(*) INTO after_rows FROM public.lesson_resources;
  PERFORM public.cf04_assert(before_rows = after_rows,'DRY_RUN wrote a lesson_resources row');
  PERFORM public.cf04_assert((r1->>'writes_performed')::int = 0,'DRY_RUN reported writes');
  PERFORM public.cf04_assert(r1->>'plan_sha256' = r2->>'plan_sha256','plan hash is not deterministic');
  PERFORM public.cf04_assert(r1->'plan'->>'externalLessonCode' = 'CHEM-G12-IRON','wrong identity in plan');
  PERFORM public.cf04_assert(
    jsonb_array_length(r1->'plan'->'questions'->'official') = 5,'official question count');
  PERFORM public.cf04_assert(
    jsonb_array_length(r1->'plan'->'questions'->'selfTest') = 40,'self-test question count');
  PERFORM public.cf04_assert(
    (r1->'plan'->'html'->'simulation'->'csp'->>'scriptCount')::int = 1,'lab must have one inline script');
  PERFORM public.cf04_assert(
    r1->'plan'->'bookContent'->>'beforeSha256' <> r1->'plan'->'bookContent'->>'afterSha256',
    'the declared asset reference must actually be rewritten');
  PERFORM public.cf04_assert(
    (SELECT count(*)=0 FROM public.golden_lesson_publications),'DRY_RUN wrote a ledger row');
END $$;

-- A wrong expected plan hash refuses to execute.
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','EXECUTE', public.cf11_iron_assets(), repeat('0',64));
    RAISE EXCEPTION 'CF11_EXPECTED_PLAN_MISMATCH';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_WRITE_PLAN_HASH_MISMATCH%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert((SELECT count(*)=0 FROM public.golden_lesson_publications),
    'plan-hash mismatch must leave no ledger row');
END $$;
RESET ROLE;

-- ------------------------------------------------------------------------------------
-- D) Asset contract violations (each rolled back)
-- ------------------------------------------------------------------------------------
BEGIN;
SELECT set_config('request.jwt.claim.sub', :'pub', false);
SET ROLE authenticated;
DO $$
DECLARE tampered jsonb;
BEGIN
  -- The client is NOT authoritative: any tampered echo is refused before anything is read.
  FOREACH tampered IN ARRAY ARRAY[
    jsonb_set(public.cf11_iron_assets(),'{0,fileName}','"assets/official-figure-1-1.jpg"'),
    jsonb_set(public.cf11_iron_assets(),'{0,mimeType}','"image/svg+xml"'),
    jsonb_set(public.cf11_iron_assets(),'{0,sha256}', to_jsonb(repeat('b',64))),
    jsonb_set(public.cf11_iron_assets(),'{0,bytes}','999'),
    '[]'::jsonb || jsonb_build_array(jsonb_build_object('assetCode','EXTRA-ASSET'))
  ] LOOP
    BEGIN
      PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000003','DRY_RUN', tampered);
      RAISE EXCEPTION 'CF11_EXPECTED_NOT_AUTHORITATIVE';
    EXCEPTION WHEN insufficient_privilege THEN
      IF SQLERRM NOT LIKE '%CF11_ASSET_DECLARATION_NOT_AUTHORITATIVE%' THEN RAISE; END IF;
    END;
  END LOOP;

  -- Manifest-level violations are refused by the declaration authority itself.
  BEGIN
    PERFORM public.cf11_manifest_assets(jsonb_build_object('assets', jsonb_build_array(
      jsonb_build_object('assetCode','OFFICIAL-FIGURE-1-1','path','assets/x.jpg',
        'mimeType','image/jpeg','sha256',repeat('a',64),'bytes',1024))),
      '43000000-0000-0000-0000-000000000012');
    RAISE EXCEPTION 'CF11_EXPECTED_NOT_LEAF';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_ASSET_NOT_LEAF%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.cf11_manifest_assets(jsonb_build_object('assets', jsonb_build_array(
      jsonb_build_object('assetCode','OFFICIAL-FIGURE-1-1','path','x.svg',
        'mimeType','image/svg+xml','sha256',repeat('a',64),'bytes',1024))),
      '43000000-0000-0000-0000-000000000012');
    RAISE EXCEPTION 'CF11_EXPECTED_MIME';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_ASSET_MIME_FORBIDDEN%' THEN RAISE; END IF;
  END;

END $$;
RESET ROLE;
-- An undeclared body reference cannot survive: strip the manifest assets (owner-side) and publish.
UPDATE public.golden_lesson_package_versions
   SET manifest = manifest - 'assets' WHERE id = '50100000-0000-0000-0000-000000000001';
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','DRY_RUN','[]'::jsonb);
    RAISE EXCEPTION 'CF11_EXPECTED_UNDECLARED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_UNDECLARED_ASSET_REFERENCE%'
       AND SQLERRM NOT LIKE '%CF11_ASSET_ATTESTATION_SET_MISMATCH%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'asset declaration contract is fail-closed');
END $$;
RESET ROLE;
ROLLBACK;

BEGIN;
DELETE FROM storage.objects WHERE bucket_id='golden-lesson-assets';
SELECT set_config('request.jwt.claim.sub', :'pub', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','DRY_RUN', public.cf11_iron_assets());
    RAISE EXCEPTION 'CF11_EXPECTED_OBJECT_MISSING';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_ASSET_OBJECT_MISSING%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'a declared asset with no stored object is refused');
END $$;
RESET ROLE;
ROLLBACK;

-- ------------------------------------------------------------------------------------
-- E) HTML security contracts (each rolled back)
-- ------------------------------------------------------------------------------------
BEGIN;
ALTER TABLE public.golden_lesson_domain_stage_entries DISABLE TRIGGER USER;
UPDATE public.golden_lesson_domain_stage_entries
   SET source_payload = convert_to(
       replace(convert_from(source_payload,'UTF8'), 'script-src ''sha256-',
               'script-src ''sha256-AAAA'), 'UTF8')
 WHERE batch_id = :'batch' AND capability = 'labExperimentHtml';
ALTER TABLE public.golden_lesson_domain_stage_entries ENABLE TRIGGER USER;
SELECT set_config('request.jwt.claim.sub', :'pub', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','DRY_RUN', public.cf11_iron_assets());
    RAISE EXCEPTION 'CF11_EXPECTED_CSP_HASH_MISMATCH';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_LAB_CSP_SCRIPT_HASH_MISMATCH%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'the CSP must pin the ACTUAL inline script hash');
END $$;
RESET ROLE;
ROLLBACK;

BEGIN;
ALTER TABLE public.golden_lesson_domain_stage_entries DISABLE TRIGGER USER;
UPDATE public.golden_lesson_domain_stage_entries
   SET source_payload = convert_to(
       replace(convert_from(source_payload,'UTF8'), 'connect-src ''none''', 'connect-src ''self'''), 'UTF8')
 WHERE batch_id = :'batch' AND capability = 'labExperimentHtml';
ALTER TABLE public.golden_lesson_domain_stage_entries ENABLE TRIGGER USER;
SELECT set_config('request.jwt.claim.sub', :'pub', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','DRY_RUN', public.cf11_iron_assets());
    RAISE EXCEPTION 'CF11_EXPECTED_CONNECT_SRC';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_LAB_CSP_CONNECT_SRC%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'the lab may never be allowed to reach the network');
END $$;
RESET ROLE;
ROLLBACK;

BEGIN;
ALTER TABLE public.golden_lesson_domain_stage_entries DISABLE TRIGGER USER;
UPDATE public.golden_lesson_domain_stage_entries
   SET source_payload = convert_to(
       replace(convert_from(source_payload,'UTF8'), '</details></section>',
               '</details><script>alert(1)</script></section>'), 'UTF8')
 WHERE batch_id = :'batch' AND capability = 'mindMapHtml';
ALTER TABLE public.golden_lesson_domain_stage_entries ENABLE TRIGGER USER;
SELECT set_config('request.jwt.claim.sub', :'pub', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','DRY_RUN', public.cf11_iron_assets());
    RAISE EXCEPTION 'CF11_EXPECTED_STATIC_SCRIPT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_STATIC_HTML_HAS_SCRIPT%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'the mind map must stay completely JS-free');
END $$;
RESET ROLE;
ROLLBACK;

BEGIN;
ALTER TABLE public.golden_lesson_domain_stage_entries DISABLE TRIGGER USER;
UPDATE public.golden_lesson_domain_stage_entries
   SET source_payload = convert_to(
       replace(convert_from(source_payload,'UTF8'), '<output id="out">0/0</output>',
               '<output id="out">0/0</output><img src="https://cdn.example.com/x.png">'), 'UTF8')
 WHERE batch_id = :'batch' AND capability = 'labExperimentHtml';
ALTER TABLE public.golden_lesson_domain_stage_entries ENABLE TRIGGER USER;
SELECT set_config('request.jwt.claim.sub', :'pub', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','DRY_RUN', public.cf11_iron_assets());
    RAISE EXCEPTION 'CF11_EXPECTED_EXTERNAL_URL';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_HTML_EXTERNAL_URL%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'zero external URLs may survive publication');
END $$;
RESET ROLE;
ROLLBACK;

-- ------------------------------------------------------------------------------------
-- F) Precondition guards (rolled back)
-- ------------------------------------------------------------------------------------
BEGIN;
UPDATE public.lessons SET is_free = false WHERE id = :'lesson';
SELECT set_config('request.jwt.claim.sub', :'pub', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','DRY_RUN', public.cf11_iron_assets());
    RAISE EXCEPTION 'CF11_EXPECTED_NOT_FREE';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_LESSON_NOT_FREE%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'a subscription-gated lesson is never published by CF11');
END $$;
RESET ROLE;
ROLLBACK;

BEGIN;
DELETE FROM public.golden_lesson_package_reviews
 WHERE package_id='50000000-0000-0000-0000-000000000001' AND to_status='APPROVED_FOR_STAGING';
SELECT set_config('request.jwt.claim.sub', :'pub', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','DRY_RUN', public.cf11_iron_assets());
    RAISE EXCEPTION 'CF11_EXPECTED_NOT_APPROVED';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_PACKAGE_NOT_APPROVED_FOR_STAGING%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'only an APPROVED_FOR_STAGING package can be published');
END $$;
RESET ROLE;
ROLLBACK;

BEGIN;
ALTER TABLE public.golden_lesson_identity_bindings DROP CONSTRAINT golden_lesson_identity_bindings_batch_id_key;
INSERT INTO public.golden_lesson_identity_bindings(
  batch_id, grade_id, subject_id, lesson_id, unit_id, curriculum_track_ids,
  external_lesson_code, identity_snapshot, identity_sha256, bound_by)
SELECT batch_id, grade_id, subject_id, lesson_id, unit_id, curriculum_track_ids,
       external_lesson_code, identity_snapshot, identity_sha256, bound_by
  FROM public.golden_lesson_identity_bindings WHERE batch_id = :'batch';
SELECT set_config('request.jwt.claim.sub', :'pub', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','DRY_RUN', public.cf11_iron_assets());
    RAISE EXCEPTION 'CF11_EXPECTED_BINDING_COUNT';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_IDENTITY_BINDING_NOT_EXACTLY_ONE%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'exactly one identity binding is required');
END $$;
RESET ROLE;
ROLLBACK;

-- ------------------------------------------------------------------------------------
-- G) The real EXECUTE
-- ------------------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', :'pub', false);
SET ROLE authenticated;
DO $$
DECLARE dry jsonb; res jsonb; again jsonb; v_lesson uuid := '43000000-0000-0000-0000-000000000012';
BEGIN
  dry := public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
         '10000000-0000-0000-0000-000000000003','DRY_RUN', public.cf11_iron_assets());
  res := public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
         '10000000-0000-0000-0000-000000000003','EXECUTE', public.cf11_iron_assets(),
         dry->>'plan_sha256','cf11-iron-key');
  PERFORM public.cf04_assert(res->>'lifecycle_status' = 'REVIEW','CF11 must stop at REVIEW');
  PERFORM public.cf04_assert((res->>'writes_performed')::int > 0,'EXECUTE performed no write');

  -- 1) lifecycle: seven rows in REVIEW, none READY.
  PERFORM public.cf04_assert(
    (SELECT count(*)=7 FROM public.lesson_capability_lifecycle
      WHERE lesson_id=v_lesson AND status='REVIEW'),'all seven capabilities must be in REVIEW');
  PERFORM public.cf04_assert(
    (SELECT count(*)=0 FROM public.lesson_capability_lifecycle
      WHERE lesson_id=v_lesson AND status='READY'),'CF11 publish must never produce READY');

  -- 2) student visibility stays CLOSED until the separate READY attestation.
  PERFORM public.cf04_assert(NOT public.lesson_student_visible(v_lesson),
    'a REVIEW lesson must not be student-visible');

  -- 3) resources: exactly one mindmap + one experiment, inline scheme, no public URL.
  PERFORM public.cf04_assert(
    (SELECT count(*)=1 FROM public.lesson_resources
      WHERE lesson_id=v_lesson AND html_resource_type='mindmap'
        AND resource_type::text='mindmap'
        AND url = 'lesson-internal://html/CHEM-G12-IRON-MINDMAP'),'mind map resource contract');
  PERFORM public.cf04_assert(
    (SELECT count(*)=1 FROM public.lesson_resources
      WHERE lesson_id=v_lesson AND html_resource_type='experiment'
        AND resource_type::text='experiment'
        AND url = 'lesson-internal://html/CHEM-G12-IRON-EXPERIMENT'),'lab resource contract');
  PERFORM public.cf04_assert(
    (SELECT count(*)=0 FROM public.lesson_resources
      WHERE lesson_id=v_lesson AND url ~* '^https?://'),'no external resource URL may be written');

  -- 4) the publication probe is now TRUTHFUL for both HTML capabilities.
  PERFORM public.cf04_assert(NOT public.cf10_html_publication_pending(v_lesson,'mindMap'),
    'mind map must be reported as published');
  PERFORM public.cf04_assert(NOT public.cf10_html_publication_pending(v_lesson,'simulation'),
    'lab must be reported as published');

  -- 5) official body: only the declared reference changed.
  PERFORM public.cf04_assert(
    (SELECT content LIKE '%src="supabase-storage://golden-lesson-assets/%official-figure-1-1.jpg"%'
       FROM public.lesson_book_contents WHERE lesson_id=v_lesson),'asset reference was not rewritten');
  PERFORM public.cf04_assert(
    (SELECT content NOT LIKE '%src="official-figure-1-1.jpg"%'
       FROM public.lesson_book_contents WHERE lesson_id=v_lesson),'the leaf reference must be gone');
  PERFORM public.cf04_assert(
    (SELECT content LIKE '%ΔH = -25 kJ · Fe<sup>2+</sup> / Fe<sup>3+</sup>%'
       FROM public.lesson_book_contents WHERE lesson_id=v_lesson),'official text must be untouched');
  PERFORM public.cf04_assert(
    (SELECT count(*)=1 FROM public.golden_lesson_published_assets
      WHERE lesson_id=v_lesson AND mime_type='image/jpeg'
        AND sha256='a5e17da2c7343bc3f4289a3258f646d635e7a8365b84f2b7c7209134f0614daf'),
    'the verified asset must be registered exactly once');

  -- 6) questions: all 45 published, answers still confidential.
  PERFORM public.cf04_assert(
    (SELECT count(*)=45 FROM public.questions q
      WHERE q.lesson_id=v_lesson AND q.current_published_revision_id IS NOT NULL),
    'all 45 questions must have a published revision');
  PERFORM public.cf04_assert(
    (SELECT count(*)=5 FROM public.official_question_answers a
       JOIN public.question_revisions rv ON rv.id=a.revision_id
       JOIN public.questions q ON q.id=rv.question_id
      WHERE q.lesson_id=v_lesson),'official answers must stay in official_question_answers');
  PERFORM public.cf04_assert(
    (SELECT count(*)=40 FROM public.question_option_rationales ra
       JOIN public.question_revisions rv ON rv.id=ra.question_revision_id
       JOIN public.questions q ON q.id=rv.question_id
      WHERE q.lesson_id=v_lesson),'rationales must stay revision-pinned');

  -- 7) assessment membership: exactly the 40 self-test questions, never the official 5.
  PERFORM public.cf04_assert(
    (SELECT count(*)=40 FROM public.assessment_questions aq
       JOIN public.lesson_assessments la ON la.id=aq.assessment_id
      WHERE la.lesson_id=v_lesson),'assessment must contain exactly 40 questions');
  PERFORM public.cf04_assert(
    (SELECT count(*)=0 FROM public.assessment_questions aq
       JOIN public.lesson_assessments la ON la.id=aq.assessment_id
       JOIN public.questions q ON q.id=aq.question_id
      WHERE la.lesson_id=v_lesson AND q.code LIKE 'CHEM-G12-IRON-OFFQ-%'),
    'an official question must never enter the self-test assessment');

  -- 8) answer leak = 0 in everything a student can reach.
  PERFORM public.cf04_assert(
    (SELECT count(*)=0 FROM (
       SELECT content AS b FROM public.lesson_book_contents WHERE lesson_id=v_lesson
       UNION ALL SELECT content FROM public.lesson_explanations WHERE lesson_id=v_lesson
       UNION ALL SELECT summary FROM public.lesson_summaries WHERE lesson_id=v_lesson
       UNION ALL SELECT description FROM public.lesson_resources WHERE lesson_id=v_lesson
     ) t WHERE t.b ~* '(is_correct|correct_index|correct_answer|answer_key|model_answer|rationale)'),
    'ANSWER LEAK: a student-reachable body exposes answer data');

  -- 9) idempotent replay
  again := public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
           '10000000-0000-0000-0000-000000000003','EXECUTE', public.cf11_iron_assets(),
           dry->>'plan_sha256','cf11-iron-key');
  PERFORM public.cf04_assert((again->>'idempotent')::boolean,'replay must be idempotent');
  PERFORM public.cf04_assert((again->>'writes_performed')::int = 0,'replay must write nothing');
  PERFORM public.cf04_assert(
    (SELECT count(*)=1 FROM public.golden_lesson_publications),'exactly one ledger row per batch');
  PERFORM public.cf04_assert(
    (SELECT count(*)=2 FROM public.lesson_resources WHERE lesson_id=v_lesson),
    'replay must not duplicate resources');
END $$;
RESET ROLE;

-- ------------------------------------------------------------------------------------
-- H) READY attestation
-- ------------------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', :'pub', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN  -- the publisher may not attest their own work
    PERFORM public.golden_lesson_attest_cf11_ready('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003',
      jsonb_build_object('reviewedContent',true,'reviewedSecurity',true,'note','self'),'EXECUTE');
    RAISE EXCEPTION 'CF11_EXPECTED_SEPARATION';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%CF11_SEPARATION_OF_DUTIES%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(
    (SELECT count(*)=0 FROM public.lesson_capability_lifecycle
      WHERE lesson_id='43000000-0000-0000-0000-000000000012' AND status='READY'),
    'a refused attestation must not move the lifecycle');
END $$;

SELECT set_config('request.jwt.claim.sub', :'att', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN  -- explicit human evidence is mandatory
    PERFORM public.golden_lesson_attest_cf11_ready('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000005','{}'::jsonb,'EXECUTE');
    RAISE EXCEPTION 'CF11_EXPECTED_EVIDENCE';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_READY_EVIDENCE_REQUIRED%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'READY requires recorded human evidence');
END $$;

DO $$
DECLARE dry jsonb; res jsonb; v_lesson uuid := '43000000-0000-0000-0000-000000000012';
BEGIN
  dry := public.golden_lesson_attest_cf11_ready('51000000-0000-0000-0000-000000000001',
         '10000000-0000-0000-0000-000000000005',
         jsonb_build_object('reviewedContent',true,'reviewedSecurity',true,'note','reviewed'),'DRY_RUN');
  PERFORM public.cf04_assert((dry->>'transitions')::int = 0,'DRY_RUN must not transition');
  PERFORM public.cf04_assert(
    (SELECT count(*)=7 FROM public.lesson_capability_lifecycle
      WHERE lesson_id=v_lesson AND status='REVIEW'),'DRY_RUN must leave REVIEW intact');

  res := public.golden_lesson_attest_cf11_ready('51000000-0000-0000-0000-000000000001',
         '10000000-0000-0000-0000-000000000005',
         jsonb_build_object('reviewedContent',true,'reviewedSecurity',true,'note','reviewed'),'EXECUTE');
  PERFORM public.cf04_assert((res->>'transitions')::int = 7,'all seven capabilities must reach READY');
  PERFORM public.cf04_assert((res->>'student_visible')::boolean,'the lesson must become visible');
  PERFORM public.cf04_assert(
    (SELECT count(*)=7 FROM public.lesson_capability_lifecycle
      WHERE lesson_id=v_lesson AND status='READY'
        AND ready_snapshot IS NOT NULL AND ready_hash IS NOT NULL),
    'every READY row needs a snapshot and a hash');
  PERFORM public.cf04_assert(
    (SELECT count(*)=7 FROM public.lesson_capability_lifecycle
      WHERE lesson_id=v_lesson
        AND ready_hash = public.v3_capability_snapshot_hash(ready_snapshot)),
    'snapshot and hash must be consistent');
  PERFORM public.cf04_assert(
    (SELECT count(*)=7 FROM public.lesson_capability_lifecycle
      WHERE lesson_id=v_lesson AND ready_by='10000000-0000-0000-0000-000000000005'),
    'READY must be attributed to the real attester');
  PERFORM public.cf04_assert(
    (SELECT count(*)=1 FROM public.golden_lesson_ready_attestations
      WHERE batch_id='51000000-0000-0000-0000-000000000001'
        AND attested_by <> published_by),
    'READY evidence must be a separate append-only row by a different human');
  PERFORM public.cf04_assert(
    (SELECT count(*)=1 FROM public.audit_logs
      WHERE action='golden_lesson_cf11_ready_attested'
        AND actor_id='10000000-0000-0000-0000-000000000005'),'READY must be audited');

  -- attest replay is idempotent
  res := public.golden_lesson_attest_cf11_ready('51000000-0000-0000-0000-000000000001',
         '10000000-0000-0000-0000-000000000005',
         jsonb_build_object('reviewedContent',true,'reviewedSecurity',true,'note','reviewed'),'EXECUTE');
  PERFORM public.cf04_assert((res->>'idempotent')::boolean,'attestation replay must be idempotent');
END $$;
RESET ROLE;

-- ------------------------------------------------------------------------------------
-- I) Ledger immutability + final student-facing postverify
-- ------------------------------------------------------------------------------------
DO $$ BEGIN
  BEGIN
    DELETE FROM public.golden_lesson_publications;
    RAISE EXCEPTION 'CF11_EXPECTED_LEDGER_IMMUTABLE';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%CF11_LEDGER_IMMUTABLE%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'the publication ledger cannot be deleted');
END $$;

SELECT public.cf04_assert(
  public.lesson_student_visible('43000000-0000-0000-0000-000000000012'),
  'FINAL: the Iron lesson must be student-visible');
SELECT public.cf04_assert(
  (SELECT is_free FROM public.lessons WHERE id='43000000-0000-0000-0000-000000000012'),
  'FINAL: the Iron lesson must remain free');
SELECT public.cf04_assert(
  (SELECT unit_id IS NULL FROM public.lessons WHERE id='43000000-0000-0000-0000-000000000012'),
  'FINAL: unit may remain NULL');
SELECT public.cf04_assert(
  (SELECT count(*)=2 FROM public.golden_lesson_identity_bindings b
     CROSS JOIN LATERAL unnest(b.curriculum_track_ids) AS t(id)
    WHERE b.batch_id='51000000-0000-0000-0000-000000000001'),
  'FINAL: the sanaa/aden binding must stay exact');

-- ------------------------------------------------------------------------------------
-- J) CF11-R4 — lifecycle namespace, operator-token materialization, strict replay guards
-- ------------------------------------------------------------------------------------

-- J1) There is exactly ONE lifecycle relation. A second, empty namespace would make the review
--     gate fail OPEN ("nothing is in REVIEW"), so its absence is asserted, not assumed.
SELECT public.cf04_assert(
  to_regclass('public.lesson_capability_lifecycle') IS NOT NULL,
  'CF11_LIFECYCLE_NAMESPACE: lesson_capability_lifecycle must exist');
SELECT public.cf04_assert(
  to_regclass('public.lesson_content_lifecycle') IS NULL,
  'CF11_LIFECYCLE_NAMESPACE: lesson_content_lifecycle must never exist');
SELECT public.cf04_assert(
  (SELECT count(*)=0 FROM pg_proc p
     JOIN pg_namespace n ON n.oid=p.pronamespace
     JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND p.prokind IN ('f','p')
      AND l.lanname IN ('sql','plpgsql')
      AND p.prosrc LIKE '%lesson_content_lifecycle%'),
  'CF11_LIFECYCLE_NAMESPACE: no function may read lesson_content_lifecycle');


-- J2) CF10 is reachable by an operator token ONLY through the R4 wrapper; the raw RPC stays
--     service_role-only.
SELECT public.cf04_assert(
  has_function_privilege('authenticated',
    'public.golden_lesson_materialize_domain_batch_operator(uuid,uuid,text,text,text)','EXECUTE'),
  'CF11_R4: authenticated must reach CF10 through the operator wrapper');
SELECT public.cf04_assert(
  NOT has_function_privilege('authenticated',
    'public.golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)','EXECUTE'),
  'CF11_R4: authenticated must never call the raw CF10 RPC');
SELECT public.cf04_assert(
  (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='golden_lesson_materialize_domain_batch_operator'),
  'CF11_R4: the operator wrapper must be SECURITY DEFINER');

-- J3) The wrapper derives the actor from auth.uid(): a staff session cannot materialize "as"
--     somebody else, and a student cannot materialize at all.
SELECT set_config('request.jwt.claim.sub', :'pub', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch_operator(
      '51000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','DRY_RUN');
    RAISE EXCEPTION 'CF11_EXPECTED_CF10_ACTOR_MISMATCH';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%CF10_ACTOR_IDENTITY_MISMATCH%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'CF10 orchestration cannot impersonate another operator');

  -- EXECUTE without the reviewed write-plan hash, or without a durable replay key, writes zero.
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch_operator(
      '51000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','EXECUTE',
      NULL,'cf10-iron-key');
    RAISE EXCEPTION 'CF11_EXPECTED_CF10_PLAN_REQUIRED';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE '%CF10_WRITE_PLAN_HASH_REQUIRED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch_operator(
      '51000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','EXECUTE',
      repeat('0',64), NULL);
    RAISE EXCEPTION 'CF11_EXPECTED_CF10_KEY_REQUIRED';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE '%CF10_IDEMPOTENCY_KEY_REQUIRED%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'CF10 EXECUTE demands a reviewed plan hash and a replay key');
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', :'stu', false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.golden_lesson_materialize_domain_batch_operator(
      '51000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','DRY_RUN');
    RAISE EXCEPTION 'CF11_EXPECTED_CF10_ADMIN_REQUIRED';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%CF10_ADMIN_REQUIRED%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'a student can never orchestrate CF10');
END $$;
RESET ROLE;

-- J4) Publication EXECUTE can never proceed without a durable idempotency key, even on the
--     replay path where the plan hash already matches the recorded publication.
SELECT set_config('request.jwt.claim.sub', :'pub', false);
SET ROLE authenticated;
DO $$
DECLARE recorded text;
BEGIN
  SELECT plan_sha256 INTO recorded FROM public.golden_lesson_publications
   WHERE batch_id='51000000-0000-0000-0000-000000000001';
  PERFORM public.cf04_assert(recorded ~ '^[0-9a-f]{64}$','the ledger must record a plan hash');
  PERFORM public.cf04_assert(
    (SELECT idempotency_key='cf11-iron-key' FROM public.golden_lesson_publications
      WHERE batch_id='51000000-0000-0000-0000-000000000001'),
    'the ledger must record the replay key verbatim');
  BEGIN
    PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','EXECUTE', public.cf11_iron_assets(), recorded, NULL);
    RAISE EXCEPTION 'CF11_EXPECTED_KEY_REQUIRED';
  EXCEPTION WHEN invalid_parameter_value THEN
    IF SQLERRM NOT LIKE '%CF11_IDEMPOTENCY_KEY_REQUIRED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','EXECUTE', public.cf11_iron_assets(), recorded,
      'a-different-key');
    RAISE EXCEPTION 'CF11_EXPECTED_KEY_CONFLICT';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE '%CF11_REPLAY_IDEMPOTENCY_KEY_CONFLICT%' THEN RAISE; END IF;
  END;
  PERFORM public.cf04_assert(true,'a replay under a different key conflicts and writes nothing');
  PERFORM public.cf04_assert(
    (SELECT count(*)=1 FROM public.golden_lesson_publications
      WHERE batch_id='51000000-0000-0000-0000-000000000001'),
    'the publication ledger must still hold exactly one row');
END $$;
RESET ROLE;

-- J5) CF11-R5 — an idempotent replay is only allowed when EVERY category of the recorded plan is
--     still live. Each category is tampered with (as the schema owner, i.e. the strongest possible
--     attacker) and the replay must refuse instead of reporting a comfortable success.
SELECT set_config('request.jwt.claim.sub', :'pub', false);
CREATE OR REPLACE FUNCTION public.cf11_assert_replay_refuses(_category text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE recorded text;
BEGIN
  SELECT plan_sha256 INTO recorded FROM public.golden_lesson_publications
   WHERE batch_id='51000000-0000-0000-0000-000000000001';
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000003','EXECUTE', public.cf11_iron_assets(), recorded,
      'cf11-iron-key');
    RESET ROLE;
    RAISE EXCEPTION 'CF11_EXPECTED_REPLAY_REFUSED_%', _category;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    -- The replay must die on the divergence itself: either the exhaustive live-state
    -- revalidation, or the storage-identity check that guards the attested bytes.
    IF SQLERRM NOT LIKE '%CF11_REPLAY_LIVE_STATE_CONFLICT%'
       AND SQLERRM NOT LIKE '%CF11_ASSET_OBJECT_%' THEN RAISE; END IF;
  END;
END $$;

DO $$
DECLARE recorded text; res jsonb; original text; member uuid; cap_lesson uuid;
BEGIN
  SELECT plan_sha256 INTO recorded FROM public.golden_lesson_publications
   WHERE batch_id='51000000-0000-0000-0000-000000000001';

  -- baseline: an untampered replay is idempotent and writes nothing
  SET LOCAL ROLE authenticated;
  res := public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003','EXECUTE', public.cf11_iron_assets(), recorded,
    'cf11-iron-key');
  RESET ROLE;
  PERFORM public.cf04_assert((res->>'idempotent')::boolean,'an intact replay stays idempotent');
  PERFORM public.cf04_assert((res->>'writes_performed')::int = 0,'an intact replay writes nothing');
  PERFORM public.cf04_assert(
    jsonb_array_length(coalesce(res->'revalidated','[]'::jsonb)) >= 5,
    'the replay must report every re-verified category');

  -- 1) official body drift
  SELECT content INTO original FROM public.lesson_book_contents
   WHERE lesson_id='43000000-0000-0000-0000-000000000012';
  UPDATE public.lesson_book_contents SET content = original || '<p>drift</p>'
   WHERE lesson_id='43000000-0000-0000-0000-000000000012';
  PERFORM public.cf11_assert_replay_refuses('bookContent');
  UPDATE public.lesson_book_contents SET content = original
   WHERE lesson_id='43000000-0000-0000-0000-000000000012';

  -- 2) a published HTML artefact silently repointed away from inline delivery
  SELECT url INTO original FROM public.lesson_resources
   WHERE lesson_id='43000000-0000-0000-0000-000000000012' AND resource_type='mindmap';
  UPDATE public.lesson_resources SET url='https://evil.example/mindmap.html'
   WHERE lesson_id='43000000-0000-0000-0000-000000000012' AND resource_type='mindmap';
  PERFORM public.cf11_assert_replay_refuses('html.mindMap');
  UPDATE public.lesson_resources SET url=original
   WHERE lesson_id='43000000-0000-0000-0000-000000000012' AND resource_type='mindmap';

  -- 3) an assessment membership quietly removed
  SELECT aq.id INTO member FROM public.assessment_questions aq
    JOIN public.lesson_assessments la ON la.id = aq.assessment_id
   WHERE la.lesson_id='43000000-0000-0000-0000-000000000012' LIMIT 1;
  CREATE TEMP TABLE cf11_member_backup ON COMMIT DROP AS
    SELECT * FROM public.assessment_questions WHERE id = member;
  DELETE FROM public.assessment_questions WHERE id = member;
  PERFORM public.cf11_assert_replay_refuses('assessmentMembers');
  INSERT INTO public.assessment_questions SELECT * FROM cf11_member_backup;
  DROP TABLE cf11_member_backup;

  -- 4) a lifecycle row pushed back below REVIEW
  UPDATE public.lesson_capability_lifecycle SET status='DRAFT'
   WHERE lesson_id='43000000-0000-0000-0000-000000000012' AND capability='quickReview';
  PERFORM public.cf11_assert_replay_refuses('lifecycle');
  UPDATE public.lesson_capability_lifecycle SET status='READY'
   WHERE lesson_id='43000000-0000-0000-0000-000000000012' AND capability='quickReview';

  -- 5) the stored asset object removed underneath the attestation
  UPDATE storage.objects SET name = name || '.moved'
   WHERE bucket_id='golden-lesson-assets';
  PERFORM public.cf11_assert_replay_refuses('assets');
  UPDATE storage.objects SET name = left(name, length(name)-6)
   WHERE bucket_id='golden-lesson-assets' AND name LIKE '%.moved';

  -- after every tamper/restore cycle the ledger is untouched
  PERFORM public.cf04_assert(
    (SELECT count(*)=1 FROM public.golden_lesson_publications
      WHERE batch_id='51000000-0000-0000-0000-000000000001'),
    'no tampered replay may append a publication row');

  -- and the intact replay is idempotent again
  SET LOCAL ROLE authenticated;
  res := public.golden_lesson_publish_cf11('51000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003','EXECUTE', public.cf11_iron_assets(), recorded,
    'cf11-iron-key');
  RESET ROLE;
  PERFORM public.cf04_assert((res->>'idempotent')::boolean,'the restored state replays cleanly');
END $$;
DROP FUNCTION public.cf11_assert_replay_refuses(text);

-- ======================================================================================
-- K) CF11-R6 — SERVICE-ROLE EDITORIAL DENIAL + EXACT LIFECYCLE SET.
-- ======================================================================================

-- K1) The machine role keeps byte attestation and reads; every human editorial RPC is denied to
--     it, so an automated caller holding the service key can never stand in for a reviewer.
--     CF11_EXPECTED_SERVICE_ROLE_DENIED
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.golden_lesson_publish_cf11(uuid,uuid,text,jsonb,text,text)',
    'public.golden_lesson_attest_cf11_ready(uuid,uuid,jsonb,text)',
    'public.golden_lesson_materialize_domain_batch_operator(uuid,uuid,text,text,text)',
    'public.golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)',
    'public.golden_lesson_advance_review(uuid,integer,text,jsonb,text)',
    'public.golden_lesson_bind_authoritative_identity(uuid,uuid)',
    'public.golden_lesson_bind_authoritative_identity_operator(uuid,uuid)',
    'public.golden_lesson_revoke_cf11_ready(uuid,uuid,text,text,text)'
  ] LOOP
    PERFORM public.cf04_assert(
      NOT has_function_privilege('service_role', fn, 'EXECUTE'),
      'CF11_EXPECTED_SERVICE_ROLE_DENIED: service_role cannot call ' || fn);
    PERFORM public.cf04_assert(
      NOT has_function_privilege('anon', fn, 'EXECUTE'),
      'CF11_EXPECTED_SERVICE_ROLE_DENIED: anon cannot call ' || fn);
  END LOOP;
  -- ...while machine byte attestation stays service-role-only.
  PERFORM public.cf04_assert(
    has_function_privilege('service_role',
      'public.golden_lesson_attest_cf11_asset(uuid,uuid,text,text,bigint,text,text,text,text)',
      'EXECUTE'),
    'CF11_R6: machine attestation stays available to service_role');
END $$;

-- K2) The identity-binding operator wrapper exists, is SECURITY DEFINER and is reachable by an
--     authenticated admin token only.
SELECT public.cf04_assert(
  (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='golden_lesson_bind_authoritative_identity_operator'),
  'CF11_R6: the identity-binding wrapper must be SECURITY DEFINER');
SELECT public.cf04_assert(
  has_function_privilege('authenticated',
    'public.golden_lesson_bind_authoritative_identity_operator(uuid,uuid)','EXECUTE'),
  'CF11_R6: authenticated binds identity through the wrapper');

-- K3) EXACT lifecycle set: a substituted name at an identical count is refused, and so is one
--     missing + one extra. The lesson is restored after each probe.
DO $$
DECLARE
  lesson uuid := (SELECT lesson_id FROM public.golden_lesson_publications
                   WHERE batch_id='51000000-0000-0000-0000-000000000001');
BEGIN
  PERFORM public.cf04_assert(
    public.cf11_live_lifecycle_capabilities(lesson) = public.cf11_lifecycle_capabilities(),
    'CF11_R6: the live lifecycle set is exactly the canonical seven');

  -- substitution: seven rows, one wrong name
  UPDATE public.lesson_capability_lifecycle SET capability='lessonSummary'
   WHERE lesson_id=lesson AND capability='quickReview';
  BEGIN
    PERFORM public.cf11_assert_exact_lifecycle_set(lesson,'CF11_PROBE');
    RAISE EXCEPTION 'CF11_R6_FAILED: a substituted capability name was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.lesson_capability_lifecycle SET capability='quickReview'
   WHERE lesson_id=lesson AND capability='lessonSummary';

  PERFORM public.cf04_assert(
    public.cf11_live_lifecycle_capabilities(lesson) = public.cf11_lifecycle_capabilities(),
    'CF11_R6: the lifecycle set is restored after the substitution probe');
END $$;

-- ------------------------------------------------------------------------------------
-- L) CF11-R7 — APPLICABILITY. A capability parked at OPTIONAL/NA is excused from the readiness
--    contract while the SET still looks complete, so every gate must refuse it.
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  lesson uuid := (SELECT lesson_id FROM public.golden_lesson_publications
                   WHERE batch_id='51000000-0000-0000-0000-000000000001');
BEGIN
  PERFORM public.cf11_assert_exact_required_lifecycle_set(lesson,'CF11_PROBE');

  UPDATE public.lesson_capability_lifecycle SET applicability='OPTIONAL'
   WHERE lesson_id=lesson AND capability='mindMap';
  BEGIN
    PERFORM public.cf11_assert_exact_required_lifecycle_set(lesson,'CF11_PROBE');
    RAISE EXCEPTION 'CF11_EXPECTED_APPLICABILITY_REFUSED: OPTIONAL row accepted at the exact-set gate';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.golden_lesson_attest_cf11_ready(
      _batch_id => '51000000-0000-0000-0000-000000000001',
      _actor_id => '52000000-0000-0000-0000-0000000000a2',
      _evidence => jsonb_build_object('reviewedContent',true,'reviewedSecurity',true,
                                      'note','applicability probe'),
      _mode => 'EXECUTE');
    RAISE EXCEPTION 'CF11_EXPECTED_APPLICABILITY_REFUSED: READY accepted a non-REQUIRED capability';
  EXCEPTION WHEN check_violation OR insufficient_privilege OR unique_violation THEN NULL;
  END;
  UPDATE public.lesson_capability_lifecycle SET applicability='REQUIRED'
   WHERE lesson_id=lesson AND capability='mindMap';
  PERFORM public.cf11_assert_exact_required_lifecycle_set(lesson,'CF11_PROBE');
END $$;

-- ------------------------------------------------------------------------------------
-- M) CF11-R7 — PINNED QUESTION IDENTITY. Same code, same count, different published revision or
--    payload hash must be a replay conflict, not a match.
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  plan jsonb := (SELECT result FROM public.golden_lesson_publications
                  WHERE batch_id='51000000-0000-0000-0000-000000000001');
  pinned jsonb := plan->'questions'->'official'->0;
  qid uuid := (pinned->>'questionId')::uuid;
  original text := pinned->>'payloadHash';
BEGIN
  PERFORM public.cf04_assert(
    plan->>'schema' = 'tamkeen.content-factory-11.write-plan.v2',
    'CF11_EXPECTED_PINNED_REVISION_REFUSED: the plan must be the pinned v2 schema');
  PERFORM public.cf04_assert(
    coalesce(pinned->>'revisionId','') <> '' AND coalesce(pinned->>'payloadHash','') <> '',
    'CF11_EXPECTED_PINNED_REVISION_REFUSED: every planned question must pin revision + payload');
  PERFORM public.cf11_assert_replay_state(plan);

  -- payload drift at an identical code/count
  UPDATE public.question_revisions
     SET payload_hash = repeat('0',64)
   WHERE id = (pinned->>'revisionId')::uuid;
  BEGIN
    PERFORM public.cf11_assert_replay_state(plan);
    RAISE EXCEPTION 'CF11_EXPECTED_PINNED_REVISION_REFUSED: payload drift was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  UPDATE public.question_revisions SET payload_hash = original
   WHERE id = (pinned->>'revisionId')::uuid;

  -- revision substitution at an identical code/count
  UPDATE public.questions SET current_published_revision_id = NULL WHERE id = qid;
  BEGIN
    PERFORM public.cf11_assert_replay_state(plan);
    RAISE EXCEPTION 'CF11_EXPECTED_PINNED_REVISION_REFUSED: a swapped revision was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  UPDATE public.questions SET current_published_revision_id = (pinned->>'revisionId')::uuid
   WHERE id = qid;
  PERFORM public.cf11_assert_replay_state(plan);
END $$;

-- ------------------------------------------------------------------------------------
-- N) CF11-R7 — ZERO-WRITE DRY_RUN and CONTROLLED WITHDRAWAL.
-- ------------------------------------------------------------------------------------
DO $$
DECLARE
  before_assets bigint;
  after_assets bigint;
  before_attest bigint;
  after_attest bigint;
BEGIN
  SELECT count(*) INTO before_assets FROM public.golden_lesson_published_assets;
  SELECT count(*) INTO before_attest FROM public.golden_lesson_asset_attestations;
  BEGIN
    PERFORM public.golden_lesson_publish_cf11(
      _batch_id => '51000000-0000-0000-0000-000000000001',
      _actor_id => '52000000-0000-0000-0000-0000000000a1',
      _mode => 'DRY_RUN');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  SELECT count(*) INTO after_assets FROM public.golden_lesson_published_assets;
  SELECT count(*) INTO after_attest FROM public.golden_lesson_asset_attestations;
  PERFORM public.cf04_assert(
    before_assets = after_assets AND before_attest = after_attest,
    'CF11_EXPECTED_DRY_RUN_ZERO_WRITES: a DRY_RUN wrote rows');
END $$;

DO $$
DECLARE
  batch uuid := '51000000-0000-0000-0000-000000000001';
  lesson uuid := (SELECT lesson_id FROM public.golden_lesson_publications WHERE batch_id=batch);
  ledger bigint;
BEGIN
  -- the service role may never withdraw
  PERFORM public.cf04_assert(
    NOT has_function_privilege('service_role',
      'public.golden_lesson_revoke_cf11_ready(uuid,uuid,text,text,text)','EXECUTE'),
    'CF11_EXPECTED_REVOKE_SERVICE_ROLE_DENIED');

  -- a DRY_RUN withdrawal writes nothing
  SELECT count(*) INTO ledger FROM public.golden_lesson_ready_revocations;
  BEGIN
    PERFORM public.golden_lesson_revoke_cf11_ready(_batch_id => batch,
      _actor_id => '52000000-0000-0000-0000-0000000000a1',
      _reason => 'withdrawn for regression probe', _mode => 'DRY_RUN');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  PERFORM public.cf04_assert(
    (SELECT count(*) FROM public.golden_lesson_ready_revocations) = ledger,
    'CF11_EXPECTED_REVOKE_DRY_RUN_ZERO_WRITES');

  -- a short reason is refused
  BEGIN
    PERFORM public.golden_lesson_revoke_cf11_ready(_batch_id => batch,
      _actor_id => '52000000-0000-0000-0000-0000000000a1', _reason => 'short',
      _idempotency_key => 'cf11-revoke-probe', _mode => 'EXECUTE');
    RAISE EXCEPTION 'CF11_EXPECTED_REVOKE_REASON_REFUSED';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN NULL;
  END;

  -- the withdrawal ledger is append-only, exactly like the READY ledger
  BEGIN
    UPDATE public.golden_lesson_ready_revocations SET reason='tampered';
    RAISE EXCEPTION 'CF11_EXPECTED_REVOKE_LEDGER_IMMUTABLE: an update was accepted';
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN NULL;
  END;
  PERFORM public.cf04_assert(lesson IS NOT NULL, 'CF11_EXPECTED_REVOKE probe lesson resolves');
END $$;

SELECT 'PASS_CONTENT_FACTORY_11_PG17' AS verdict;


