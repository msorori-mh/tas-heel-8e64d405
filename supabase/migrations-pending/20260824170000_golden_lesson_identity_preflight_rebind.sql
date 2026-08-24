-- GOLDEN_LESSON_IDENTITY_PREFLIGHT_REBIND
-- Status: SOURCE-READY / NOT APPLIED TO PRODUCTION.
-- Scope: one fail-closed repair path for an unreviewed DRAFT whose stable lesson key is unchanged.
-- Explicitly absent: READY/publish, deletion, review-history rewrite, domain-content writes.

BEGIN;

CREATE TABLE public.golden_lesson_identity_rebindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.golden_lesson_packages(id) ON DELETE RESTRICT,
  from_version integer NOT NULL CHECK (from_version > 0),
  to_version integer NOT NULL CHECK (to_version > from_version),
  old_identity jsonb NOT NULL,
  new_identity jsonb NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 8 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, to_version),
  FOREIGN KEY (package_id, to_version)
    REFERENCES public.golden_lesson_package_versions(package_id, version) ON DELETE RESTRICT
);

CREATE INDEX golden_lesson_identity_rebindings_package_idx
  ON public.golden_lesson_identity_rebindings(package_id, created_at DESC);

ALTER TABLE public.golden_lesson_identity_rebindings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.golden_lesson_identity_rebindings TO authenticated;
GRANT ALL ON public.golden_lesson_identity_rebindings TO service_role;

CREATE POLICY "golden identity rebind staff read"
  ON public.golden_lesson_identity_rebindings
  FOR SELECT TO authenticated
  USING (public.is_golden_lesson_content_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.golden_lesson_rebind_draft_identity(
  _manifest jsonb,
  _client_manifest_sha256 text,
  _expected_current_version integer,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  actor uuid := auth.uid();
  code text;
  canonical_hash text;
  pkg public.golden_lesson_packages;
  old_identity jsonb;
  new_identity jsonb;
  next_version integer;
BEGIN
  IF actor IS NULL OR NOT public.golden_lesson_has_role(actor, 'admin') THEN
    RAISE EXCEPTION 'DRAFT_IDENTITY_REBIND_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _client_manifest_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'CLIENT_MANIFEST_HASH_INVALID' USING ERRCODE = '22023';
  END IF;
  IF _expected_current_version IS NULL OR _expected_current_version < 1 THEN
    RAISE EXCEPTION 'EXPECTED_VERSION_INVALID' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_reason, ''))) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'REBIND_REASON_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM public.assert_golden_lesson_manifest(_manifest);
  code := _manifest->>'packageCode';
  new_identity := _manifest->'identity';
  canonical_hash := encode(extensions.digest(convert_to(_manifest::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('golden_lesson:' || code, 0));

  SELECT * INTO pkg
    FROM public.golden_lesson_packages
   WHERE package_code = code
   FOR UPDATE;
  IF pkg.id IS NULL THEN
    RAISE EXCEPTION 'PACKAGE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF pkg.current_version IS DISTINCT FROM _expected_current_version THEN
    RAISE EXCEPTION 'STALE_PACKAGE_VERSION' USING ERRCODE = '40001';
  END IF;
  IF pkg.review_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'DRAFT_IDENTITY_REBIND_STATUS_FORBIDDEN' USING ERRCODE = '23514';
  END IF;
  IF pkg.profile_id IS DISTINCT FROM _manifest->>'profileId' THEN
    RAISE EXCEPTION 'DRAFT_IDENTITY_REBIND_PROFILE_FORBIDDEN' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.golden_lesson_package_reviews r WHERE r.package_id = pkg.id
  ) THEN
    RAISE EXCEPTION 'DRAFT_IDENTITY_REBIND_REVIEW_EXISTS' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.golden_lesson_domain_stage_batches b WHERE b.package_id = pkg.id
  ) THEN
    RAISE EXCEPTION 'DRAFT_IDENTITY_REBIND_DOMAIN_STAGE_EXISTS' USING ERRCODE = '23514';
  END IF;

  old_identity := pkg.identity;
  -- Only routing metadata may be corrected. The stable lesson natural/external key is immutable.
  IF lower(btrim(old_identity->>'gradeCode')) IS DISTINCT FROM lower(btrim(new_identity->>'gradeCode'))
     OR lower(btrim(old_identity->>'subjectCode')) IS DISTINCT FROM lower(btrim(new_identity->>'subjectCode'))
     OR lower(btrim(old_identity->>'lessonCode')) IS DISTINCT FROM lower(btrim(new_identity->>'lessonCode'))
     OR lower(btrim(old_identity->>'lessonSlug')) IS DISTINCT FROM lower(btrim(new_identity->>'lessonSlug')) THEN
    RAISE EXCEPTION 'DRAFT_IDENTITY_REBIND_STABLE_KEY_FORBIDDEN' USING ERRCODE = '23514';
  END IF;
  IF old_identity IS NOT DISTINCT FROM new_identity THEN
    RAISE EXCEPTION 'DRAFT_IDENTITY_REBIND_NOT_NEEDED' USING ERRCODE = '22023';
  END IF;

  next_version := pkg.current_version + 1;
  UPDATE public.golden_lesson_packages SET
    identity = new_identity,
    current_version = next_version,
    current_manifest_sha256 = _client_manifest_sha256,
    current_canonical_sha256 = canonical_hash,
    review_status = 'DRAFT',
    updated_at = now()
  WHERE id = pkg.id;

  INSERT INTO public.golden_lesson_package_versions(
    package_id, version, manifest, client_manifest_sha256,
    canonical_manifest_sha256, created_by
  ) VALUES (
    pkg.id, next_version, _manifest, _client_manifest_sha256,
    canonical_hash, actor
  );

  INSERT INTO public.golden_lesson_identity_rebindings(
    package_id, from_version, to_version, old_identity, new_identity, actor_id, reason
  ) VALUES (
    pkg.id, pkg.current_version, next_version, old_identity, new_identity, actor, btrim(_reason)
  );

  RETURN jsonb_build_object(
    'package_id', pkg.id,
    'version', next_version,
    'status', 'DRAFT',
    'idempotent', false,
    'identity_rebound', true,
    'writes_performed', 3,
    'domain_writes_performed', 0
  );
END;
$$;

REVOKE ALL ON public.golden_lesson_identity_rebindings FROM anon, authenticated;
GRANT SELECT ON public.golden_lesson_identity_rebindings TO authenticated;
REVOKE ALL ON FUNCTION public.golden_lesson_rebind_draft_identity(jsonb,text,integer,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golden_lesson_rebind_draft_identity(jsonb,text,integer,text)
  TO authenticated;

COMMENT ON TABLE public.golden_lesson_identity_rebindings IS
  'Append-only audit for admin-only routing corrections on unreviewed DRAFT Golden Lesson packages.';
COMMENT ON FUNCTION public.golden_lesson_rebind_draft_identity(jsonb,text,integer,text) IS
  'Fail-closed correction of mutable routing fields only; never rewrites review/domain history.';

COMMIT;
