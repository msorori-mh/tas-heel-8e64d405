\set ON_ERROR_STOP on

-- Create one unreviewed DRAFT as a content manager.
SET ROLE authenticated;
SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
SELECT public.golden_lesson_stage_manifest(public.cf04_manifest(''), repeat('1', 64));
SELECT id AS package_id
  FROM public.golden_lesson_packages
 WHERE package_code = 'QURAN-G10-L01-PKG' \gset

-- A full admin may correct routing-only metadata; the correction creates v2 and an audit row.
SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
SELECT public.golden_lesson_rebind_draft_identity(
  jsonb_set(
    jsonb_set(public.cf04_manifest(''), '{identity,unitCode}', '"UNIT-1"'::jsonb),
    '{identity,sortOrder}', '4'::jsonb
  ),
  repeat('2', 64),
  1,
  'PG17 routing correction rehearsal'
);
SELECT public.cf04_assert(
  (SELECT current_version = 2 AND review_status = 'DRAFT'
     AND identity->>'unitCode' = 'UNIT-1' AND identity->>'sortOrder' = '4'
     FROM public.golden_lesson_packages WHERE id = :'package_id'),
  'routing correction did not update the DRAFT package'
);
SELECT public.cf04_assert(
  (SELECT count(*) = 2 FROM public.golden_lesson_package_versions WHERE package_id = :'package_id'),
  'routing correction did not append package version 2'
);
SELECT public.cf04_assert(
  (SELECT count(*) = 1 AND min(from_version) = 1 AND max(to_version) = 2
     FROM public.golden_lesson_identity_rebindings WHERE package_id = :'package_id'),
  'routing correction audit ledger is incomplete'
);

-- Content managers cannot call the repair path.
SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  PERFORM public.golden_lesson_rebind_draft_identity(
    jsonb_set(public.cf04_manifest(''), '{identity,unitCode}', '"UNIT-2"'::jsonb),
    repeat('3', 64), 2, 'unauthorized correction attempt'
  );
  RAISE EXCEPTION 'content manager rebind unexpectedly succeeded';
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM <> 'DRAFT_IDENTITY_REBIND_ADMIN_REQUIRED' THEN RAISE; END IF;
END $$;

-- Even an admin cannot change the stable lesson key.
SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.golden_lesson_rebind_draft_identity(
    jsonb_set(
      jsonb_set(public.cf04_manifest(''), '{identity,unitCode}', '"UNIT-2"'::jsonb),
      '{identity,lessonCode}', '"QURAN-G10-L99"'::jsonb
    ),
    repeat('3', 64), 2, 'stable key mutation attempt'
  );
  RAISE EXCEPTION 'stable key rebind unexpectedly succeeded';
EXCEPTION WHEN check_violation THEN
  IF SQLERRM <> 'DRAFT_IDENTITY_REBIND_STABLE_KEY_FORBIDDEN' THEN RAISE; END IF;
END $$;

-- Existing review history blocks correction, even if the package row still says DRAFT.
RESET ROLE;
INSERT INTO public.golden_lesson_package_reviews(
  package_id, package_version, from_status, to_status, actor_id, actor_role, evidence, note
) VALUES (
  :'package_id', 2, 'DRAFT', 'SUBMITTED',
  '10000000-0000-0000-0000-000000000001', 'CONTENT_EDITOR', '{}', 'PG17 guard fixture'
);
SET ROLE authenticated;
SET request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.golden_lesson_rebind_draft_identity(
    jsonb_set(public.cf04_manifest(''), '{identity,unitCode}', '"UNIT-2"'::jsonb),
    repeat('3', 64), 2, 'reviewed draft correction attempt'
  );
  RAISE EXCEPTION 'reviewed draft rebind unexpectedly succeeded';
EXCEPTION WHEN check_violation THEN
  IF SQLERRM <> 'DRAFT_IDENTITY_REBIND_REVIEW_EXISTS' THEN RAISE; END IF;
END $$;

-- The append-only ledger cannot be written directly by an authenticated admin.
DO $$ BEGIN
  INSERT INTO public.golden_lesson_identity_rebindings(
    package_id, from_version, to_version, old_identity, new_identity, actor_id, reason
  ) VALUES (
    current_setting('app.never.package_id', true)::uuid, 1, 2, '{}', '{}',
    '10000000-0000-0000-0000-000000000003', 'direct ledger mutation attempt'
  );
  RAISE EXCEPTION 'direct ledger write unexpectedly succeeded';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

RESET ROLE;
SELECT public.cf04_assert(
  (SELECT count(*) = 1 FROM public.golden_lesson_identity_rebindings WHERE package_id = :'package_id'),
  'blocked attempts changed the append-only audit ledger'
);
SELECT 'PASS_GOLDEN_IDENTITY_REBIND_PG17' AS verdict;
