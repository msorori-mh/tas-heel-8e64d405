-- RAPID OWNER LAUNCH — narrow audited override for the MVP content rollout.
--
-- This does not write lesson/domain content. It only permits the real platform owner
-- (admin + content_manager) to move one already-verified package to APPROVED_FOR_STAGING
-- when the normal two-person editorial chain would block the imminent launch.
-- The ordinary review function and its separation-of-duties checks remain unchanged.

CREATE OR REPLACE FUNCTION public.golden_lesson_owner_approve_for_staging(
  _package_id uuid,
  _expected_version integer,
  _evidence jsonb,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor uuid := auth.uid();
  pkg public.golden_lesson_packages;
  verified_at timestamptz;
  original_status text;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.golden_lesson_has_role(actor, 'admin')
     OR NOT public.golden_lesson_has_role(actor, 'content_manager') THEN
    RAISE EXCEPTION 'OWNER_OVERRIDE_ROLE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 20 THEN
    RAISE EXCEPTION 'OWNER_OVERRIDE_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(_evidence, '{}'::jsonb)) <> 'object'
     OR COALESCE((_evidence->>'packageValidationPassed')::boolean, false) IS NOT TRUE
     OR COALESCE((_evidence->>'officialProvenanceChecked')::boolean, false) IS NOT TRUE
     OR COALESCE((_evidence->>'answerSeparationChecked')::boolean, false) IS NOT TRUE
     OR COALESCE((_evidence->>'responsivePreviewChecked')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'OWNER_OVERRIDE_EVIDENCE_MISSING' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO pkg
  FROM public.golden_lesson_packages
  WHERE id = _package_id
  FOR UPDATE;

  IF pkg.id IS NULL THEN
    RAISE EXCEPTION 'PACKAGE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF pkg.current_version <> _expected_version THEN
    RAISE EXCEPTION 'STALE_PACKAGE_VERSION' USING ERRCODE = '40001';
  END IF;
  IF pkg.review_status = 'APPROVED_FOR_STAGING' THEN
    RETURN jsonb_build_object(
      'package_id', pkg.id,
      'version', pkg.current_version,
      'status', pkg.review_status,
      'idempotent', true,
      'writes_performed', 0,
      'domain_writes_performed', 0
    );
  END IF;
  IF pkg.review_status NOT IN ('SUBMITTED', 'CONTENT_APPROVED') THEN
    RAISE EXCEPTION 'OWNER_OVERRIDE_TRANSITION_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT bundle_verified_at INTO verified_at
  FROM public.golden_lesson_package_versions
  WHERE package_id = pkg.id
    AND version = pkg.current_version
    AND verified_bundle_sha256 IS NOT NULL
    AND verified_storage_path IS NOT NULL
    AND verified_file_count > 0;

  IF verified_at IS NULL THEN
    RAISE EXCEPTION 'VERIFIED_BUNDLE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  original_status := pkg.review_status;
  UPDATE public.golden_lesson_packages
  SET review_status = 'APPROVED_FOR_STAGING', updated_at = now()
  WHERE id = pkg.id;

  INSERT INTO public.golden_lesson_package_reviews(
    package_id, package_version, from_status, to_status,
    actor_id, actor_role, evidence, note
  ) VALUES (
    pkg.id, pkg.current_version, original_status, 'APPROVED_FOR_STAGING',
    actor, 'TECHNICAL_REVIEWER',
    _evidence || jsonb_build_object(
      'ownerOverride', true,
      'verifiedBundleRequired', true,
      'domainWritesPerformed', 0
    ),
    'RAPID_LAUNCH_OWNER_APPROVAL: ' || btrim(_reason)
  );

  RETURN jsonb_build_object(
    'package_id', pkg.id,
    'version', pkg.current_version,
    'status', 'APPROVED_FOR_STAGING',
    'idempotent', false,
    'writes_performed', 2,
    'domain_writes_performed', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.golden_lesson_owner_approve_for_staging(uuid, integer, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golden_lesson_owner_approve_for_staging(uuid, integer, jsonb, text)
  TO authenticated;

COMMENT ON FUNCTION public.golden_lesson_owner_approve_for_staging(uuid, integer, jsonb, text) IS
  'Audited MVP owner override. Requires admin+content_manager, complete evidence and a server-verified bundle; performs zero lesson/domain writes.';
