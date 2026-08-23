CREATE OR REPLACE FUNCTION public.golden_lesson_attest_direct_intake(
  _package_id uuid,
  _version integer,
  _actor_id uuid,
  _intake_id uuid,
  _intake_sha256 text,
  _manifest_sha256 text,
  _file_count integer,
  _total_bytes bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v public.golden_lesson_package_versions;
  was_attested boolean;
BEGIN
  SELECT * INTO v FROM public.golden_lesson_package_versions
    WHERE package_id = _package_id AND version = _version FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'PACKAGE_VERSION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v.created_by IS DISTINCT FROM _actor_id THEN
    RAISE EXCEPTION 'DIRECT_INTAKE_ACTOR_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF _intake_id IS NULL
     OR _intake_sha256 !~ '^[a-f0-9]{64}$'
     OR _manifest_sha256 !~ '^[a-f0-9]{64}$'
     OR _file_count NOT BETWEEN 1 AND 31
     OR _total_bytes NOT BETWEEN 1 AND 52428800 THEN
    RAISE EXCEPTION 'DIRECT_INTAKE_ATTESTATION_INVALID' USING ERRCODE = '22023';
  END IF;

  was_attested := v.verified_intake_id IS NOT NULL;
  IF was_attested THEN
    IF (v.verified_intake_id, v.verified_intake_sha256, v.verified_manifest_sha256,
        v.verified_direct_file_count, v.verified_direct_bytes)
       IS DISTINCT FROM (_intake_id, _intake_sha256, _manifest_sha256, _file_count, _total_bytes) THEN
      RAISE EXCEPTION 'DIRECT_INTAKE_ATTESTATION_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  ELSE
    UPDATE public.golden_lesson_package_versions SET
      verified_intake_id = _intake_id,
      verified_intake_sha256 = _intake_sha256,
      verified_manifest_sha256 = _manifest_sha256,
      verified_direct_file_count = _file_count,
      verified_direct_bytes = _total_bytes,
      direct_intake_verified_at = clock_timestamp()
    WHERE id = v.id;
  END IF;

  -- Direct intake is a first-class verified source: mirror the canonical verification
  -- columns so approval and domain staging accept it without a separate ZIP upload.
  UPDATE public.golden_lesson_package_versions SET
    verified_bundle_sha256 = _intake_sha256,
    verified_storage_path = 'direct-intake://' || _intake_id::text,
    verified_file_count = _file_count,
    verified_compressed_bytes = _total_bytes,
    verified_uncompressed_bytes = _total_bytes,
    bundle_verified_at = COALESCE(bundle_verified_at, clock_timestamp())
  WHERE id = v.id AND verified_bundle_sha256 IS NULL;

  RETURN jsonb_build_object(
    'intake_sha256', _intake_sha256,
    'file_count', _file_count,
    'idempotent', was_attested,
    'domain_writes_performed', 0
  );
END;
$$;

UPDATE public.golden_lesson_package_versions SET
  verified_bundle_sha256 = verified_intake_sha256,
  verified_storage_path = 'direct-intake://' || verified_intake_id::text,
  verified_file_count = verified_direct_file_count,
  verified_compressed_bytes = verified_direct_bytes,
  verified_uncompressed_bytes = verified_direct_bytes,
  bundle_verified_at = COALESCE(bundle_verified_at, direct_intake_verified_at)
WHERE verified_intake_id IS NOT NULL AND verified_bundle_sha256 IS NULL;