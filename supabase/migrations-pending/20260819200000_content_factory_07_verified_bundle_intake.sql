-- CONTENT_FACTORY_07_VERIFIED_BUNDLE_INTAKE
-- Status: SOURCE-READY / NOT APPLIED TO PRODUCTION.
-- Scope: private immutable ZIP intake and server-attested byte verification.
-- Explicitly absent: domain-content writes, READY, publish, execute.

DO $$
DECLARE current_bucket storage.buckets%ROWTYPE;
BEGIN
  SELECT * INTO current_bucket FROM storage.buckets WHERE id = 'golden-lesson-intake';
  IF current_bucket.id IS NULL THEN
    INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('golden-lesson-intake','golden-lesson-intake',false,52428800,ARRAY['application/zip','application/x-zip-compressed']);
  ELSIF current_bucket.public IS DISTINCT FROM false
     OR current_bucket.file_size_limit IS DISTINCT FROM 52428800::bigint
     OR current_bucket.allowed_mime_types IS DISTINCT FROM ARRAY['application/zip','application/x-zip-compressed']::text[] THEN
    RAISE EXCEPTION 'GOLDEN_INTAKE_BUCKET_CONTRACT_MISMATCH' USING ERRCODE = '23514';
  END IF;
END $$;

CREATE POLICY "golden bundle owner insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'golden-lesson-intake'
    AND public.is_golden_lesson_content_staff(auth.uid())
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.zip$'
  );
CREATE POLICY "golden bundle owner read" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'golden-lesson-intake'
    AND public.is_golden_lesson_content_staff(auth.uid())
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

ALTER TABLE public.golden_lesson_package_versions
  ADD COLUMN verified_bundle_sha256 text CHECK (verified_bundle_sha256 ~ '^[a-f0-9]{64}$'),
  ADD COLUMN verified_storage_path text,
  ADD COLUMN verified_file_count integer CHECK (verified_file_count BETWEEN 1 AND 32),
  ADD COLUMN verified_compressed_bytes bigint CHECK (verified_compressed_bytes BETWEEN 1 AND 52428800),
  ADD COLUMN verified_uncompressed_bytes bigint CHECK (verified_uncompressed_bytes BETWEEN 1 AND 52428800),
  ADD COLUMN bundle_verified_at timestamptz;

ALTER TABLE public.golden_lesson_package_versions ADD CONSTRAINT golden_bundle_attestation_all_or_none CHECK (
  (verified_bundle_sha256 IS NULL AND verified_storage_path IS NULL AND verified_file_count IS NULL
   AND verified_compressed_bytes IS NULL AND verified_uncompressed_bytes IS NULL AND bundle_verified_at IS NULL)
  OR
  (verified_bundle_sha256 IS NOT NULL AND verified_storage_path IS NOT NULL AND verified_file_count IS NOT NULL
   AND verified_compressed_bytes IS NOT NULL AND verified_uncompressed_bytes IS NOT NULL AND bundle_verified_at IS NOT NULL)
);
CREATE UNIQUE INDEX golden_lesson_verified_storage_path_uq
  ON public.golden_lesson_package_versions(verified_storage_path) WHERE verified_storage_path IS NOT NULL;

CREATE OR REPLACE FUNCTION public.golden_lesson_attest_bundle(
  _package_id uuid, _version integer, _actor_id uuid, _storage_path text,
  _bundle_sha256 text, _file_count integer, _compressed_bytes bigint, _uncompressed_bytes bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v public.golden_lesson_package_versions;
BEGIN
  SELECT * INTO v FROM public.golden_lesson_package_versions
    WHERE package_id = _package_id AND version = _version FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'PACKAGE_VERSION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v.created_by IS DISTINCT FROM _actor_id THEN RAISE EXCEPTION 'BUNDLE_ACTOR_MISMATCH' USING ERRCODE = '42501'; END IF;
  IF _storage_path !~ ('^' || _actor_id::text || '/[0-9a-f-]{36}\.zip$')
     OR _bundle_sha256 !~ '^[a-f0-9]{64}$' OR _file_count NOT BETWEEN 1 AND 32
     OR _compressed_bytes NOT BETWEEN 1 AND 52428800 OR _uncompressed_bytes NOT BETWEEN 1 AND 52428800 THEN
    RAISE EXCEPTION 'BUNDLE_ATTESTATION_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v.verified_bundle_sha256 IS NOT NULL THEN
    IF (v.verified_bundle_sha256, v.verified_storage_path, v.verified_file_count,
        v.verified_compressed_bytes, v.verified_uncompressed_bytes)
       IS DISTINCT FROM (_bundle_sha256, _storage_path, _file_count, _compressed_bytes, _uncompressed_bytes) THEN
      RAISE EXCEPTION 'BUNDLE_ATTESTATION_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  ELSE
    UPDATE public.golden_lesson_package_versions SET
      verified_bundle_sha256 = _bundle_sha256, verified_storage_path = _storage_path,
      verified_file_count = _file_count, verified_compressed_bytes = _compressed_bytes,
      verified_uncompressed_bytes = _uncompressed_bytes, bundle_verified_at = clock_timestamp()
    WHERE id = v.id;
  END IF;
  RETURN jsonb_build_object('bundle_sha256',_bundle_sha256,'file_count',_file_count,
    'idempotent',v.verified_bundle_sha256 IS NOT NULL,'domain_writes_performed',0);
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
         AND v.verified_bundle_sha256 IS NOT NULL AND v.bundle_verified_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'VERIFIED_BUNDLE_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER golden_lesson_verified_bundle_before_submit
  BEFORE UPDATE OF review_status ON public.golden_lesson_packages
  FOR EACH ROW EXECUTE FUNCTION public.golden_lesson_require_verified_bundle();

REVOKE ALL ON FUNCTION public.golden_lesson_attest_bundle(uuid,integer,uuid,text,text,integer,bigint,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golden_lesson_attest_bundle(uuid,integer,uuid,text,text,integer,bigint,bigint) TO service_role;
REVOKE ALL ON FUNCTION public.golden_lesson_require_verified_bundle() FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.golden_lesson_package_versions.verified_bundle_sha256 IS
  'Server-derived SHA-256 of the exact private ZIP; required before SUBMITTED and never publication authority.';
