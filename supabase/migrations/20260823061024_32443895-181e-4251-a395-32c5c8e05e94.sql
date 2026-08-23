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
  pkg_status text;
  was_attested boolean;
  same_content boolean;
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

  SELECT review_status INTO pkg_status
  FROM public.golden_lesson_packages
  WHERE id = _package_id;

  was_attested := v.verified_intake_id IS NOT NULL;
  -- The intake UUID identifies an upload session, not the lesson content. A retry of
  -- identical bytes receives a fresh UUID and must remain resumable after approval.
  same_content := was_attested AND
    (v.verified_intake_sha256, v.verified_manifest_sha256,
     v.verified_direct_file_count, v.verified_direct_bytes)
    IS NOT DISTINCT FROM (_intake_sha256, _manifest_sha256, _file_count, _total_bytes);

  IF was_attested AND NOT same_content AND COALESCE(pkg_status, 'DRAFT') <> 'DRAFT' THEN
    RAISE EXCEPTION 'DIRECT_INTAKE_ATTESTATION_IMMUTABLE' USING ERRCODE = '23514';
  END IF;

  -- Rebind even identical content to the latest upload session so downstream reads
  -- never depend on an older, missing, or partially cleaned-up storage prefix.
  UPDATE public.golden_lesson_package_versions SET
    verified_intake_id = _intake_id,
    verified_intake_sha256 = _intake_sha256,
    verified_manifest_sha256 = _manifest_sha256,
    verified_direct_file_count = _file_count,
    verified_direct_bytes = _total_bytes,
    direct_intake_verified_at = CASE
      WHEN same_content THEN COALESCE(direct_intake_verified_at, clock_timestamp())
      ELSE clock_timestamp()
    END,
    verified_bundle_sha256 = _intake_sha256,
    verified_storage_path = 'direct-intake://' || _intake_id::text,
    verified_file_count = _file_count,
    verified_compressed_bytes = _total_bytes,
    verified_uncompressed_bytes = _total_bytes,
    bundle_verified_at = CASE
      WHEN same_content THEN COALESCE(bundle_verified_at, clock_timestamp())
      ELSE clock_timestamp()
    END
  WHERE id = v.id;

  RETURN jsonb_build_object(
    'intake_sha256', _intake_sha256,
    'file_count', _file_count,
    'idempotent', same_content,
    'domain_writes_performed', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.golden_lesson_attest_direct_intake(uuid,integer,uuid,uuid,text,text,integer,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golden_lesson_attest_direct_intake(uuid,integer,uuid,uuid,text,text,integer,bigint) TO service_role;