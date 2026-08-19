-- CONTENT_FACTORY_08_ATOMIC_DOMAIN_STAGING
-- Status: SOURCE-READY / NOT APPLIED TO PRODUCTION.
-- Scope: immutable, byte-pinned staging plan for the seven Golden Lesson capabilities.
-- Explicitly absent: writes to live lesson tables, publish, READY, student visibility.

CREATE TABLE public.golden_lesson_domain_stage_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL,
  package_version integer NOT NULL,
  verified_bundle_sha256 text NOT NULL CHECK (verified_bundle_sha256 ~ '^[a-f0-9]{64}$'),
  stage_status text NOT NULL DEFAULT 'STAGED' CHECK (stage_status = 'STAGED'),
  staged_by uuid NOT NULL REFERENCES auth.users(id),
  staged_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (package_id, package_version)
    REFERENCES public.golden_lesson_package_versions(package_id, version) ON DELETE RESTRICT,
  UNIQUE (package_id, package_version)
);

CREATE TABLE public.golden_lesson_domain_stage_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.golden_lesson_domain_stage_batches(id) ON DELETE RESTRICT,
  capability text NOT NULL,
  lifecycle_capability text NOT NULL,
  target_plan text NOT NULL,
  applicability text NOT NULL CHECK (applicability IN ('REQUIRED','OPTIONAL','NA')),
  authority text NOT NULL CHECK (authority IN ('OFFICIAL','TAMKEEN')),
  source_path text,
  source_sha256 text CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_payload bytea,
  provenance_path text,
  provenance_sha256 text CHECK (provenance_sha256 ~ '^[a-f0-9]{64}$'),
  provenance_payload bytea,
  UNIQUE (batch_id, capability),
  CHECK ((source_path IS NULL AND source_sha256 IS NULL AND source_payload IS NULL)
      OR (source_path IS NOT NULL AND source_sha256 IS NOT NULL AND source_payload IS NOT NULL)),
  CHECK ((provenance_path IS NULL AND provenance_sha256 IS NULL AND provenance_payload IS NULL)
      OR (provenance_path IS NOT NULL AND provenance_sha256 IS NOT NULL AND provenance_payload IS NOT NULL)),
  CHECK (applicability <> 'NA' OR (source_payload IS NULL AND provenance_payload IS NULL))
);

CREATE TABLE public.golden_lesson_domain_stage_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL UNIQUE REFERENCES public.golden_lesson_domain_stage_batches(id) ON DELETE RESTRICT,
  companion_path text NOT NULL CHECK (companion_path LIKE '%.server-only.json'),
  companion_sha256 text NOT NULL CHECK (companion_sha256 ~ '^[a-f0-9]{64}$'),
  companion_payload bytea NOT NULL
);

ALTER TABLE public.golden_lesson_domain_stage_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golden_lesson_domain_stage_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golden_lesson_domain_stage_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.golden_lesson_domain_stage_batches,
  public.golden_lesson_domain_stage_entries, public.golden_lesson_domain_stage_answers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.golden_lesson_domain_stage_batches,
  public.golden_lesson_domain_stage_entries TO authenticated;
GRANT SELECT ON public.golden_lesson_domain_stage_answers TO authenticated;
GRANT ALL ON public.golden_lesson_domain_stage_batches,
  public.golden_lesson_domain_stage_entries, public.golden_lesson_domain_stage_answers TO service_role;

CREATE POLICY "golden domain stage staff read" ON public.golden_lesson_domain_stage_batches
  FOR SELECT TO authenticated USING (public.is_golden_lesson_content_staff(auth.uid()));
CREATE POLICY "golden domain entries staff read" ON public.golden_lesson_domain_stage_entries
  FOR SELECT TO authenticated USING (public.is_golden_lesson_content_staff(auth.uid()));
CREATE POLICY "golden domain answers admin read" ON public.golden_lesson_domain_stage_answers
  FOR SELECT TO authenticated USING (public.golden_lesson_has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.reject_golden_domain_stage_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN RAISE EXCEPTION 'GOLDEN_DOMAIN_STAGE_IMMUTABLE' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER golden_domain_batch_immutable BEFORE UPDATE OR DELETE ON public.golden_lesson_domain_stage_batches
  FOR EACH ROW EXECUTE FUNCTION public.reject_golden_domain_stage_mutation();
CREATE TRIGGER golden_domain_entry_immutable BEFORE UPDATE OR DELETE ON public.golden_lesson_domain_stage_entries
  FOR EACH ROW EXECUTE FUNCTION public.reject_golden_domain_stage_mutation();
CREATE TRIGGER golden_domain_answer_immutable BEFORE UPDATE OR DELETE ON public.golden_lesson_domain_stage_answers
  FOR EACH ROW EXECUTE FUNCTION public.reject_golden_domain_stage_mutation();

CREATE OR REPLACE FUNCTION public.golden_lesson_stage_domain_bundle(
  _package_id uuid, _version integer, _actor_id uuid, _bundle_sha256 text,
  _entries jsonb, _answers_companion jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  pkg public.golden_lesson_packages;
  ver public.golden_lesson_package_versions;
  existing public.golden_lesson_domain_stage_batches;
  batch_id uuid;
  item jsonb;
  artifact jsonb;
  payload bytea;
  provenance bytea;
  expected_target text;
  expected_lifecycle text;
  writes integer := 1;
  answer_payload bytea;
BEGIN
  IF NOT public.golden_lesson_has_role(_actor_id,'admin') THEN
    RAISE EXCEPTION 'DOMAIN_STAGE_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO pkg FROM public.golden_lesson_packages WHERE id=_package_id FOR UPDATE;
  SELECT * INTO ver FROM public.golden_lesson_package_versions
    WHERE package_id=_package_id AND version=_version FOR UPDATE;
  IF pkg.id IS NULL OR ver.id IS NULL THEN RAISE EXCEPTION 'PACKAGE_VERSION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF pkg.current_version <> _version OR pkg.review_status <> 'APPROVED_FOR_STAGING' THEN
    RAISE EXCEPTION 'PACKAGE_NOT_APPROVED_FOR_DOMAIN_STAGING' USING ERRCODE='23514';
  END IF;
  IF ver.verified_bundle_sha256 IS DISTINCT FROM _bundle_sha256 OR ver.bundle_verified_at IS NULL THEN
    RAISE EXCEPTION 'VERIFIED_BUNDLE_IDENTITY_MISMATCH' USING ERRCODE='23514';
  END IF;
  SELECT * INTO existing FROM public.golden_lesson_domain_stage_batches
    WHERE package_id=_package_id AND package_version=_version;
  IF existing.id IS NOT NULL THEN
    IF existing.verified_bundle_sha256 IS DISTINCT FROM _bundle_sha256 THEN
      RAISE EXCEPTION 'DOMAIN_STAGE_IMMUTABLE_CONFLICT' USING ERRCODE='23514';
    END IF;
    RETURN jsonb_build_object('batch_id',existing.id,'idempotent',true,'writes_performed',0,'domain_writes_performed',0);
  END IF;
  IF jsonb_typeof(_entries) <> 'array' OR jsonb_array_length(_entries) <> 7
     OR (SELECT count(DISTINCT value->>'capability') FROM jsonb_array_elements(_entries)) <> 7 THEN
    RAISE EXCEPTION 'DOMAIN_STAGE_ENTRY_SET_INVALID' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.golden_lesson_domain_stage_batches(package_id,package_version,verified_bundle_sha256,staged_by)
  VALUES (_package_id,_version,_bundle_sha256,_actor_id) RETURNING id INTO batch_id;
  FOR item IN SELECT value FROM jsonb_array_elements(_entries) LOOP
    SELECT value INTO artifact FROM jsonb_array_elements(ver.manifest->'artifacts')
      WHERE value->>'capability'=item->>'capability';
    IF artifact IS NULL THEN RAISE EXCEPTION 'DOMAIN_STAGE_CAPABILITY_UNKNOWN' USING ERRCODE='22023'; END IF;
    expected_target := CASE item->>'capability'
      WHEN 'officialBookContent' THEN 'lesson_book_contents'
      WHEN 'tamkeenExplanationHtml' THEN 'lesson_explanations'
      WHEN 'lessonSummaryHtml' THEN 'lesson_summaries'
      WHEN 'mindMapHtml' THEN 'lesson_resources:mindmap'
      WHEN 'labExperimentHtml' THEN 'lesson_resources:experiment'
      WHEN 'officialBookQuestions' THEN 'questions:official'
      WHEN 'selfTest' THEN 'lesson_assessments:self_test' ELSE NULL END;
    expected_lifecycle := CASE item->>'capability'
      WHEN 'officialBookContent' THEN 'officialBookContent'
      WHEN 'tamkeenExplanationHtml' THEN 'tamkeenExplanation'
      WHEN 'lessonSummaryHtml' THEN 'quickReview'
      WHEN 'mindMapHtml' THEN 'mindMap'
      WHEN 'labExperimentHtml' THEN 'simulation'
      WHEN 'officialBookQuestions' THEN 'checkUnderstanding'
      WHEN 'selfTest' THEN 'lessonAssessment' ELSE NULL END;
    IF item->>'targetPlan' IS DISTINCT FROM expected_target
       OR item->>'lifecycleCapability' IS DISTINCT FROM expected_lifecycle
       OR item->>'applicability' IS DISTINCT FROM artifact->>'applicability'
       OR item->>'authority' IS DISTINCT FROM artifact->>'authority'
       OR item->>'sourcePath' IS DISTINCT FROM artifact->>'sourcePath'
       OR item->>'sourceSha256' IS DISTINCT FROM artifact->>'sha256'
       OR item->>'provenancePath' IS DISTINCT FROM artifact->>'provenancePath'
       OR item->>'provenanceSha256' IS DISTINCT FROM artifact->>'provenanceSha256' THEN
      RAISE EXCEPTION 'DOMAIN_STAGE_MANIFEST_MISMATCH: %',item->>'capability' USING ERRCODE='23514';
    END IF;
    payload := CASE WHEN item->>'sourceBase64' IS NULL THEN NULL ELSE decode(item->>'sourceBase64','base64') END;
    provenance := CASE WHEN item->>'provenanceBase64' IS NULL THEN NULL ELSE decode(item->>'provenanceBase64','base64') END;
    IF (payload IS NULL) IS DISTINCT FROM (artifact->>'sourcePath' IS NULL)
       OR (payload IS NOT NULL AND encode(digest(payload,'sha256'),'hex') IS DISTINCT FROM artifact->>'sha256')
       OR (provenance IS NULL) IS DISTINCT FROM (artifact->>'provenancePath' IS NULL)
       OR (provenance IS NOT NULL AND encode(digest(provenance,'sha256'),'hex') IS DISTINCT FROM artifact->>'provenanceSha256') THEN
      RAISE EXCEPTION 'DOMAIN_STAGE_PAYLOAD_HASH_MISMATCH: %',item->>'capability' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.golden_lesson_domain_stage_entries(
      batch_id,capability,lifecycle_capability,target_plan,applicability,authority,
      source_path,source_sha256,source_payload,provenance_path,provenance_sha256,provenance_payload)
    VALUES (batch_id,item->>'capability',expected_lifecycle,expected_target,item->>'applicability',item->>'authority',
      item->>'sourcePath',item->>'sourceSha256',payload,item->>'provenancePath',item->>'provenanceSha256',provenance);
    writes := writes + 1;
  END LOOP;

  IF ver.manifest#>>'{security,answersCompanionPath}' IS NULL THEN
    IF _answers_companion IS NOT NULL AND _answers_companion <> 'null'::jsonb THEN
      RAISE EXCEPTION 'DOMAIN_STAGE_UNDECLARED_ANSWERS' USING ERRCODE='23514';
    END IF;
  ELSE
    IF jsonb_typeof(_answers_companion) <> 'object'
       OR _answers_companion->>'path' IS DISTINCT FROM ver.manifest#>>'{security,answersCompanionPath}'
       OR _answers_companion->>'sha256' IS DISTINCT FROM ver.manifest#>>'{security,answersCompanionSha256}' THEN
      RAISE EXCEPTION 'DOMAIN_STAGE_ANSWERS_MISMATCH' USING ERRCODE='23514';
    END IF;
    answer_payload := decode(_answers_companion->>'base64','base64');
    IF encode(digest(answer_payload,'sha256'),'hex') IS DISTINCT FROM ver.manifest#>>'{security,answersCompanionSha256}' THEN
      RAISE EXCEPTION 'DOMAIN_STAGE_ANSWERS_HASH_MISMATCH' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.golden_lesson_domain_stage_answers(batch_id,companion_path,companion_sha256,companion_payload)
    VALUES (batch_id,_answers_companion->>'path',_answers_companion->>'sha256',answer_payload);
    writes := writes + 1;
  END IF;
  RETURN jsonb_build_object('batch_id',batch_id,'idempotent',false,'writes_performed',writes,'domain_writes_performed',0);
END;
$$;

REVOKE ALL ON FUNCTION public.golden_lesson_stage_domain_bundle(uuid,integer,uuid,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golden_lesson_stage_domain_bundle(uuid,integer,uuid,text,jsonb,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.reject_golden_domain_stage_mutation() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.golden_lesson_domain_stage_batches IS
  'Immutable pre-domain staging only; never student-visible and never publication authority.';
