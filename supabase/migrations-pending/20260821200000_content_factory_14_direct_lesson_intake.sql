-- CONTENT_FACTORY_14_DIRECT_LESSON_INTAKE
-- Status: SOURCE-READY / NOT APPLIED TO PRODUCTION.
-- Scope: direct per-file private intake; no lesson ZIP, no domain-content writes, no READY/publish.

DO $$
DECLARE current_bucket storage.buckets%ROWTYPE;
BEGIN
  SELECT * INTO current_bucket FROM storage.buckets WHERE id = 'golden-lesson-intake-v2';
  IF current_bucket.id IS NULL THEN
    INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'golden-lesson-intake-v2',
      'golden-lesson-intake-v2',
      false,
      5242880,
      ARRAY['text/html','application/json','image/png','image/jpeg','image/webp']
    );
  ELSIF current_bucket.public IS DISTINCT FROM false
     OR current_bucket.file_size_limit IS DISTINCT FROM 5242880::bigint
     OR current_bucket.allowed_mime_types IS DISTINCT FROM
        ARRAY['text/html','application/json','image/png','image/jpeg','image/webp']::text[] THEN
    RAISE EXCEPTION 'GOLDEN_DIRECT_INTAKE_BUCKET_CONTRACT_MISMATCH' USING ERRCODE = '23514';
  END IF;
END $$;

CREATE POLICY "golden direct intake owner insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'golden-lesson-intake-v2'
    AND public.is_golden_lesson_content_staff(auth.uid())
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]{1,255}$'
  );

CREATE POLICY "golden direct intake owner read" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'golden-lesson-intake-v2'
    AND public.is_golden_lesson_content_staff(auth.uid())
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

ALTER TABLE public.golden_lesson_package_versions
  ADD COLUMN verified_intake_id uuid,
  ADD COLUMN verified_intake_sha256 text CHECK (verified_intake_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN verified_manifest_sha256 text CHECK (verified_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN verified_direct_file_count integer CHECK (verified_direct_file_count BETWEEN 1 AND 31),
  ADD COLUMN verified_direct_bytes bigint CHECK (verified_direct_bytes BETWEEN 1 AND 52428800),
  ADD COLUMN direct_intake_verified_at timestamptz;

ALTER TABLE public.golden_lesson_package_versions
  ADD CONSTRAINT golden_direct_intake_attestation_all_or_none CHECK (
    (verified_intake_id IS NULL AND verified_intake_sha256 IS NULL AND verified_manifest_sha256 IS NULL
     AND verified_direct_file_count IS NULL AND verified_direct_bytes IS NULL AND direct_intake_verified_at IS NULL)
    OR
    (verified_intake_id IS NOT NULL AND verified_intake_sha256 IS NOT NULL AND verified_manifest_sha256 IS NOT NULL
     AND verified_direct_file_count IS NOT NULL AND verified_direct_bytes IS NOT NULL AND direct_intake_verified_at IS NOT NULL)
  );

CREATE UNIQUE INDEX golden_lesson_verified_direct_intake_uq
  ON public.golden_lesson_package_versions(created_by, verified_intake_id)
  WHERE verified_intake_id IS NOT NULL;

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

  RETURN jsonb_build_object(
    'intake_sha256', _intake_sha256,
    'file_count', _file_count,
    'idempotent', was_attested,
    'domain_writes_performed', 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.golden_lesson_require_verified_bundle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.review_status = 'DRAFT' AND NEW.review_status = 'SUBMITTED'
     AND NOT EXISTS (
       SELECT 1 FROM public.golden_lesson_package_versions v
       WHERE v.package_id = OLD.id AND v.version = OLD.current_version
         AND (
           (v.verified_intake_sha256 IS NOT NULL AND v.direct_intake_verified_at IS NOT NULL)
           OR
           (v.verified_bundle_sha256 IS NOT NULL AND v.bundle_verified_at IS NOT NULL)
         )
     ) THEN
    RAISE EXCEPTION 'VERIFIED_INTAKE_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.golden_lesson_attest_direct_intake(uuid,integer,uuid,uuid,text,text,integer,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golden_lesson_attest_direct_intake(uuid,integer,uuid,uuid,text,text,integer,bigint)
  TO service_role;

COMMENT ON COLUMN public.golden_lesson_package_versions.verified_intake_sha256 IS
  'Server-derived digest for the exact direct per-file intake; no lesson ZIP is created or uploaded.';
