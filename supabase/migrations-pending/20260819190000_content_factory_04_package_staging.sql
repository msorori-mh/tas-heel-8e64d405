-- CONTENT_FACTORY_04_PACKAGE_STAGING
-- Status: SOURCE-READY / NOT APPLIED TO PRODUCTION.
-- Scope: persist Golden Lesson manifests and review evidence only.
-- Explicitly absent: domain-content writes, READY, publish, storage uploads.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.golden_lesson_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_code text NOT NULL UNIQUE,
  profile_id text NOT NULL CHECK (profile_id IN ('GOLDEN_QURAN_V1','GOLDEN_CHEMISTRY_V1')),
  identity jsonb NOT NULL,
  current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0),
  current_manifest_sha256 text NOT NULL CHECK (current_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  current_canonical_sha256 text NOT NULL CHECK (current_canonical_sha256 ~ '^[a-f0-9]{64}$'),
  review_status text NOT NULL DEFAULT 'DRAFT'
    CHECK (review_status IN ('DRAFT','SUBMITTED','CONTENT_APPROVED','APPROVED_FOR_STAGING')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.golden_lesson_package_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.golden_lesson_packages(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  manifest jsonb NOT NULL,
  client_manifest_sha256 text NOT NULL CHECK (client_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  canonical_manifest_sha256 text NOT NULL CHECK (canonical_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, version),
  UNIQUE (package_id, canonical_manifest_sha256)
);

CREATE TABLE public.golden_lesson_package_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.golden_lesson_packages(id) ON DELETE RESTRICT,
  package_version integer NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  actor_role text NOT NULL CHECK (actor_role IN ('CONTENT_EDITOR','CONTENT_REVIEWER','TECHNICAL_REVIEWER')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (package_id, package_version)
    REFERENCES public.golden_lesson_package_versions(package_id, version) ON DELETE RESTRICT,
  CHECK (from_status IN ('DRAFT','SUBMITTED','CONTENT_APPROVED')),
  CHECK (to_status IN ('SUBMITTED','CONTENT_APPROVED','APPROVED_FOR_STAGING'))
);

CREATE INDEX golden_lesson_packages_review_idx
  ON public.golden_lesson_packages(review_status, updated_at DESC);
CREATE INDEX golden_lesson_reviews_package_idx
  ON public.golden_lesson_package_reviews(package_id, package_version, created_at);

ALTER TABLE public.golden_lesson_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golden_lesson_package_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golden_lesson_package_reviews ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.golden_lesson_packages, public.golden_lesson_package_versions,
  public.golden_lesson_package_reviews TO authenticated;
GRANT ALL ON public.golden_lesson_packages, public.golden_lesson_package_versions,
  public.golden_lesson_package_reviews TO service_role;

CREATE OR REPLACE FUNCTION public.golden_lesson_has_role(_user_id uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role::text = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_golden_lesson_content_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT public.golden_lesson_has_role(_user_id, 'admin')
      OR public.golden_lesson_has_role(_user_id, 'content_manager');
$$;

CREATE POLICY "golden package staff read" ON public.golden_lesson_packages
  FOR SELECT TO authenticated USING (public.is_golden_lesson_content_staff(auth.uid()));
CREATE POLICY "golden version staff read" ON public.golden_lesson_package_versions
  FOR SELECT TO authenticated USING (public.is_golden_lesson_content_staff(auth.uid()));
CREATE POLICY "golden review staff read" ON public.golden_lesson_package_reviews
  FOR SELECT TO authenticated USING (public.is_golden_lesson_content_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.assert_golden_lesson_manifest(_manifest jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  expected_order constant text[] := ARRAY[
    'officialBookContent','tamkeenExplanationHtml','lessonSummaryHtml','mindMapHtml',
    'labExperimentHtml','officialBookQuestions','selfTest'
  ];
  actual_order text[];
  artifact jsonb;
  capability text;
  expected_applicability text;
BEGIN
  IF jsonb_typeof(_manifest) <> 'object' THEN
    RAISE EXCEPTION 'MANIFEST_SHAPE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF _manifest->>'schema' <> 'tamkeen.golden-lesson-package.v1' THEN
    RAISE EXCEPTION 'SCHEMA_UNSUPPORTED' USING ERRCODE = '22023';
  END IF;
  IF _manifest->>'profileId' NOT IN ('GOLDEN_QURAN_V1','GOLDEN_CHEMISTRY_V1') THEN
    RAISE EXCEPTION 'PROFILE_UNKNOWN' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(_manifest->>'packageCode','') !~ '^[A-Z0-9][A-Z0-9-]{2,63}$' THEN
    RAISE EXCEPTION 'PACKAGE_CODE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(_manifest->'identity') <> 'object'
     OR COALESCE(_manifest#>>'{identity,gradeCode}','') !~ '^[A-Z0-9][A-Z0-9-]{2,63}$'
     OR COALESCE(_manifest#>>'{identity,subjectCode}','') !~ '^[A-Z0-9][A-Z0-9-]{2,63}$'
     OR COALESCE(_manifest#>>'{identity,lessonCode}','') !~ '^[A-Z0-9][A-Z0-9-]{2,63}$'
     OR jsonb_typeof(_manifest#>'{identity,curriculumTrackCodes}') <> 'array'
     OR jsonb_array_length(_manifest#>'{identity,curriculumTrackCodes}') = 0 THEN
    RAISE EXCEPTION 'IDENTITY_INVALID' USING ERRCODE = '22023';
  END IF;
  IF _manifest#>>'{lifecycle,initialStatus}' <> 'DRAFT'
     OR COALESCE((_manifest#>>'{lifecycle,allowDirectReady}')::boolean, true) THEN
    RAISE EXCEPTION 'LIFECYCLE_UNSAFE' USING ERRCODE = '22023';
  END IF;
  IF COALESCE((_manifest#>>'{security,productionApply}')::boolean, true)
     OR COALESCE((_manifest#>>'{security,publicPayloadContainsAnswers}')::boolean, true)
     OR _manifest#>>'{security,htmlNetworkAccess}' <> 'NONE' THEN
    RAISE EXCEPTION 'SECURITY_CONTRACT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(value ORDER BY ordinality) INTO actual_order
  FROM jsonb_array_elements_text(_manifest->'capabilityOrder') WITH ORDINALITY;
  IF actual_order IS DISTINCT FROM expected_order THEN
    RAISE EXCEPTION 'CAPABILITY_ORDER_INVALID' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(_manifest->'artifacts') <> 'array'
     OR jsonb_array_length(_manifest->'artifacts') <> 7
     OR (SELECT count(DISTINCT a->>'capability') FROM jsonb_array_elements(_manifest->'artifacts') a) <> 7 THEN
    RAISE EXCEPTION 'ARTIFACT_SET_INVALID' USING ERRCODE = '22023';
  END IF;

  FOR artifact IN SELECT value FROM jsonb_array_elements(_manifest->'artifacts') LOOP
    capability := artifact->>'capability';
    IF NOT capability = ANY(expected_order) THEN
      RAISE EXCEPTION 'CAPABILITY_UNKNOWN: %', capability USING ERRCODE = '22023';
    END IF;
    expected_applicability := CASE
      WHEN _manifest->>'profileId' = 'GOLDEN_QURAN_V1' AND capability = 'labExperimentHtml' THEN 'NA'
      WHEN _manifest->>'profileId' = 'GOLDEN_QURAN_V1' AND capability IN ('mindMapHtml','selfTest') THEN 'OPTIONAL'
      WHEN _manifest->>'profileId' = 'GOLDEN_CHEMISTRY_V1' AND capability = 'labExperimentHtml' THEN 'OPTIONAL'
      ELSE 'REQUIRED' END;
    IF artifact->>'applicability' IS DISTINCT FROM expected_applicability THEN
      RAISE EXCEPTION 'APPLICABILITY_MISMATCH: %', capability USING ERRCODE = '22023';
    END IF;
    IF artifact->>'authority' IS DISTINCT FROM
       (CASE WHEN capability IN ('officialBookContent','officialBookQuestions') THEN 'OFFICIAL' ELSE 'TAMKEEN' END) THEN
      RAISE EXCEPTION 'AUTHORITY_MISMATCH: %', capability USING ERRCODE = '22023';
    END IF;
    IF expected_applicability = 'NA' AND (artifact->'sourcePath' <> 'null'::jsonb OR artifact->'sha256' <> 'null'::jsonb) THEN
      RAISE EXCEPTION 'NA_ARTIFACT_HAS_CONTENT: %', capability USING ERRCODE = '22023';
    END IF;
    IF expected_applicability = 'REQUIRED' AND COALESCE(artifact->>'sourcePath','') = '' THEN
      RAISE EXCEPTION 'REQUIRED_ARTIFACT_MISSING: %', capability USING ERRCODE = '22023';
    END IF;
    IF artifact->>'sourcePath' IS NOT NULL AND COALESCE(artifact->>'sha256','') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'ARTIFACT_HASH_INVALID: %', capability USING ERRCODE = '22023';
    END IF;
    IF capability IN ('officialBookContent','officialBookQuestions')
       AND artifact->>'sourcePath' IS NOT NULL AND COALESCE(artifact->>'provenancePath','') = '' THEN
      RAISE EXCEPTION 'OFFICIAL_PROVENANCE_MISSING: %', capability USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF (_manifest#>>'{security,answersCompanionPath}' IS NULL) <> (_manifest#>>'{security,answersCompanionSha256}' IS NULL) THEN
    RAISE EXCEPTION 'ANSWER_COMPANION_PAIR_INVALID' USING ERRCODE = '22023';
  END IF;
  IF _manifest#>>'{security,answersCompanionPath}' IS NOT NULL AND
     (_manifest#>>'{security,answersCompanionPath}' !~ '[.]server-only[.]json$'
      OR _manifest#>>'{security,answersCompanionSha256}' !~ '^[a-f0-9]{64}$') THEN
    RAISE EXCEPTION 'ANSWER_COMPANION_INVALID' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.golden_lesson_stage_manifest(
  _manifest jsonb,
  _client_manifest_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  actor uuid := auth.uid();
  code text;
  canonical_hash text;
  pkg public.golden_lesson_packages;
  next_version integer;
BEGIN
  IF actor IS NULL OR NOT public.is_golden_lesson_content_staff(actor) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _client_manifest_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'CLIENT_MANIFEST_HASH_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_golden_lesson_manifest(_manifest);
  code := _manifest->>'packageCode';
  canonical_hash := encode(digest(convert_to(_manifest::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('golden_lesson:' || code, 0));

  SELECT * INTO pkg FROM public.golden_lesson_packages WHERE package_code = code FOR UPDATE;
  IF pkg.id IS NULL THEN
    INSERT INTO public.golden_lesson_packages(
      package_code, profile_id, identity, current_manifest_sha256,
      current_canonical_sha256, created_by
    ) VALUES (
      code, _manifest->>'profileId', _manifest->'identity', _client_manifest_sha256,
      canonical_hash, actor
    ) RETURNING * INTO pkg;
    next_version := 1;
  ELSE
    IF pkg.profile_id IS DISTINCT FROM _manifest->>'profileId'
       OR pkg.identity IS DISTINCT FROM _manifest->'identity' THEN
      RAISE EXCEPTION 'PACKAGE_IDENTITY_IMMUTABLE' USING ERRCODE = '22023';
    END IF;
    IF pkg.current_canonical_sha256 = canonical_hash THEN
      RETURN jsonb_build_object('package_id', pkg.id, 'version', pkg.current_version,
        'status', pkg.review_status, 'idempotent', true, 'writes_performed', 0);
    END IF;
    next_version := pkg.current_version + 1;
    UPDATE public.golden_lesson_packages SET
      current_version = next_version,
      current_manifest_sha256 = _client_manifest_sha256,
      current_canonical_sha256 = canonical_hash,
      review_status = 'DRAFT', updated_at = now()
    WHERE id = pkg.id RETURNING * INTO pkg;
  END IF;

  INSERT INTO public.golden_lesson_package_versions(
    package_id, version, manifest, client_manifest_sha256,
    canonical_manifest_sha256, created_by
  ) VALUES (pkg.id, next_version, _manifest, _client_manifest_sha256, canonical_hash, actor);

  RETURN jsonb_build_object('package_id', pkg.id, 'version', next_version,
    'status', 'DRAFT', 'idempotent', false, 'writes_performed', 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.golden_lesson_advance_review(
  _package_id uuid,
  _expected_version integer,
  _to_status text,
  _evidence jsonb,
  _note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  actor uuid := auth.uid();
  pkg public.golden_lesson_packages;
  required_role text;
  actor_role text;
  previous_actor uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO pkg FROM public.golden_lesson_packages WHERE id = _package_id FOR UPDATE;
  IF pkg.id IS NULL THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF pkg.current_version <> _expected_version THEN RAISE EXCEPTION 'STALE_PACKAGE_VERSION' USING ERRCODE = '40001'; END IF;
  IF jsonb_typeof(COALESCE(_evidence, '{}'::jsonb)) <> 'object' THEN RAISE EXCEPTION 'EVIDENCE_INVALID' USING ERRCODE = '22023'; END IF;

  IF pkg.review_status = 'DRAFT' AND _to_status = 'SUBMITTED' THEN
    required_role := 'content_manager'; actor_role := 'CONTENT_EDITOR';
    IF COALESCE((_evidence->>'packageValidationPassed')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'EVIDENCE_MISSING' USING ERRCODE = '22023'; END IF;
  ELSIF pkg.review_status = 'SUBMITTED' AND _to_status = 'CONTENT_APPROVED' THEN
    required_role := 'content_manager'; actor_role := 'CONTENT_REVIEWER';
    IF COALESCE((_evidence->>'officialProvenanceChecked')::boolean, false) IS NOT TRUE
       OR COALESCE((_evidence->>'answerSeparationChecked')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'EVIDENCE_MISSING' USING ERRCODE = '22023'; END IF;
  ELSIF pkg.review_status = 'CONTENT_APPROVED' AND _to_status = 'APPROVED_FOR_STAGING' THEN
    required_role := 'admin'; actor_role := 'TECHNICAL_REVIEWER';
    IF COALESCE((_evidence->>'responsivePreviewChecked')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'EVIDENCE_MISSING' USING ERRCODE = '22023'; END IF;
  ELSE
    RAISE EXCEPTION 'TRANSITION_INVALID' USING ERRCODE = '22023';
  END IF;

  IF NOT public.golden_lesson_has_role(actor, required_role) THEN
    RAISE EXCEPTION 'ROLE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Operational duties map to production roles; identity separation prevents self-approval.
  IF actor_role = 'CONTENT_REVIEWER' THEN
    SELECT actor_id INTO previous_actor
    FROM public.golden_lesson_package_reviews
    WHERE package_id = pkg.id AND package_version = pkg.current_version AND to_status = 'SUBMITTED'
    ORDER BY created_at DESC, id DESC LIMIT 1;
    IF previous_actor IS NULL THEN RAISE EXCEPTION 'SUBMISSION_AUDIT_MISSING' USING ERRCODE = '23514'; END IF;
    IF previous_actor = actor THEN RAISE EXCEPTION 'REVIEWER_MUST_DIFFER_FROM_SUBMITTER' USING ERRCODE = '42501'; END IF;
  ELSIF actor_role = 'TECHNICAL_REVIEWER' THEN
    SELECT actor_id INTO previous_actor
    FROM public.golden_lesson_package_reviews
    WHERE package_id = pkg.id AND package_version = pkg.current_version AND to_status = 'CONTENT_APPROVED'
    ORDER BY created_at DESC, id DESC LIMIT 1;
    IF previous_actor IS NULL THEN RAISE EXCEPTION 'CONTENT_APPROVAL_AUDIT_MISSING' USING ERRCODE = '23514'; END IF;
    IF previous_actor = actor THEN RAISE EXCEPTION 'TECHNICAL_REVIEWER_MUST_DIFFER' USING ERRCODE = '42501'; END IF;
  END IF;

  UPDATE public.golden_lesson_packages SET review_status = _to_status, updated_at = now()
  WHERE id = pkg.id;
  INSERT INTO public.golden_lesson_package_reviews(
    package_id, package_version, from_status, to_status, actor_id, actor_role, evidence, note
  ) VALUES (pkg.id, pkg.current_version, pkg.review_status, _to_status, actor, actor_role, _evidence, NULLIF(btrim(_note),''));
  RETURN jsonb_build_object('package_id', pkg.id, 'version', pkg.current_version,
    'status', _to_status, 'writes_performed', 2, 'domain_writes_performed', 0);
END;
$$;

REVOKE ALL ON public.golden_lesson_packages, public.golden_lesson_package_versions,
  public.golden_lesson_package_reviews FROM anon, authenticated;
GRANT SELECT ON public.golden_lesson_packages, public.golden_lesson_package_versions,
  public.golden_lesson_package_reviews TO authenticated;
REVOKE ALL ON FUNCTION public.golden_lesson_has_role(uuid,text),
  public.is_golden_lesson_content_staff(uuid), public.assert_golden_lesson_manifest(jsonb),
  public.golden_lesson_stage_manifest(jsonb,text),
  public.golden_lesson_advance_review(uuid,integer,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golden_lesson_stage_manifest(jsonb,text),
  public.golden_lesson_advance_review(uuid,integer,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_golden_lesson_content_staff(uuid) TO authenticated;

COMMENT ON TABLE public.golden_lesson_packages IS
  'Content Factory staging metadata only. Never student-visible and never a publication source.';
