-- GOLDEN LESSON PACKAGE V2 — CONTRACT FOUNDATION (SOURCE ONLY)
-- Baseline: msorori-mh/tas-heel-8e64d405@b37ef3f0655ad1019d6e611148dd1c7c9d9336c1
--
-- This is a forward-only migration. It preserves every V1 row and function signature.
-- It deliberately does NOT enable V2 CF10 materialization or CF11 publication until their
-- complete schema-aware implementations are installed. Passing V2 through the V1 paths would
-- silently reinterpret concepts/equations/activity as mind-map/experiment content.

BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.golden_lesson_package_versions') IS NULL
     OR to_regclass('public.golden_lesson_domain_stage_batches') IS NULL
     OR to_regclass('public.golden_lesson_domain_stage_entries') IS NULL THEN
    RAISE EXCEPTION 'GLV2_PREFLIGHT_CF08_SCHEMA_MISSING' USING ERRCODE = '0A000';
  END IF;
  IF to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'GLV2_PREFLIGHT_PGCRYPTO_MISSING' USING ERRCODE = '42883';
  END IF;
END
$preflight$;

-- The immutable contract version belongs to the stage batch. Existing rows are V1.
ALTER TABLE public.golden_lesson_domain_stage_batches
  ADD COLUMN IF NOT EXISTS contract_schema text;

UPDATE public.golden_lesson_domain_stage_batches b
   SET contract_schema = CASE v.manifest->>'schema'
     WHEN 'tamkeen.golden-lesson-package.v2' THEN 'tamkeen.golden-lesson-package.v2'
     ELSE 'tamkeen.golden-lesson-package.v1'
   END
  FROM public.golden_lesson_package_versions v
 WHERE v.package_id = b.package_id
   AND v.version = b.package_version
   AND b.contract_schema IS NULL;

ALTER TABLE public.golden_lesson_domain_stage_batches
  ALTER COLUMN contract_schema SET DEFAULT 'tamkeen.golden-lesson-package.v1',
  ALTER COLUMN contract_schema SET NOT NULL,
  DROP CONSTRAINT IF EXISTS golden_lesson_domain_stage_batches_contract_schema_chk,
  ADD CONSTRAINT golden_lesson_domain_stage_batches_contract_schema_chk CHECK (
    contract_schema IN (
      'tamkeen.golden-lesson-package.v1',
      'tamkeen.golden-lesson-package.v2'
    )
  );

-- Preserve the existing broad resource enum. New lesson elements are canonical HTML subtypes.
ALTER TABLE public.lesson_resources
  DROP CONSTRAINT IF EXISTS lesson_resources_html_resource_type_check,
  ADD CONSTRAINT lesson_resources_html_resource_type_check CHECK (
    html_resource_type IS NULL OR html_resource_type IN (
      'mind_map_html', 'practical_experiment_html', 'summary_html',
      'mindmap', 'experiment',
      'concepts_and_terms_html', 'equations_and_laws_html', 'interactive_activity_html'
    )
  );

CREATE OR REPLACE FUNCTION public.golden_lesson_contract_schema(_schema text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF _schema = 'tamkeen.golden-lesson-package.v1' THEN
    RETURN _schema;
  ELSIF _schema = 'tamkeen.golden-lesson-package.v2' THEN
    RETURN _schema;
  END IF;
  RAISE EXCEPTION 'GOLDEN_LESSON_CONTRACT_SCHEMA_UNSUPPORTED: %', coalesce(_schema,'<null>')
    USING ERRCODE = '22023';
END $$;

CREATE OR REPLACE FUNCTION public.golden_lesson_contract_capabilities(_schema text)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF _schema = 'tamkeen.golden-lesson-package.v1' THEN
    RETURN ARRAY['labExperimentHtml','lessonSummaryHtml','mindMapHtml','officialBookContent',
                 'officialBookQuestions','selfTest','tamkeenExplanationHtml']::text[];
  ELSIF _schema = 'tamkeen.golden-lesson-package.v2' THEN
    RETURN ARRAY['officialBookContent','tamkeenExplanationHtml','lessonSummaryHtml',
                 'conceptsAndTermsHtml','equationsAndLawsHtml','officialBookQuestions',
                 'selfTest','interactiveActivityHtml']::text[];
  END IF;
  RAISE EXCEPTION 'GOLDEN_LESSON_CONTRACT_SCHEMA_UNSUPPORTED: %', coalesce(_schema,'<null>')
    USING ERRCODE = '22023';
END $$;

CREATE OR REPLACE FUNCTION public.golden_lesson_contract_capability_set(_schema text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT array_agg(capability ORDER BY capability)
    FROM unnest(public.golden_lesson_contract_capabilities(_schema)) AS capability;
$$;

CREATE OR REPLACE FUNCTION public.golden_lesson_contract_entry(_schema text, _capability text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE out_value jsonb;
BEGIN
  IF _schema = 'tamkeen.golden-lesson-package.v1' THEN
    out_value := CASE _capability
      WHEN 'officialBookContent' THEN jsonb_build_object('target','lesson_book_contents','lifecycle','officialBookContent')
      WHEN 'tamkeenExplanationHtml' THEN jsonb_build_object('target','lesson_explanations','lifecycle','tamkeenExplanation')
      WHEN 'lessonSummaryHtml' THEN jsonb_build_object('target','lesson_summaries','lifecycle','quickReview')
      WHEN 'mindMapHtml' THEN jsonb_build_object('target','lesson_resources:mindmap','lifecycle','mindMap','htmlSubtype','mindmap','renderMode','STATIC')
      WHEN 'labExperimentHtml' THEN jsonb_build_object('target','lesson_resources:experiment','lifecycle','simulation','htmlSubtype','experiment','renderMode','INTERACTIVE')
      WHEN 'officialBookQuestions' THEN jsonb_build_object('target','questions:official','lifecycle','checkUnderstanding')
      WHEN 'selfTest' THEN jsonb_build_object('target','lesson_assessments:self_test','lifecycle','lessonAssessment')
      ELSE NULL END;
  ELSIF _schema = 'tamkeen.golden-lesson-package.v2' THEN
    out_value := CASE _capability
      WHEN 'officialBookContent' THEN jsonb_build_object('target','lesson_book_contents','lifecycle','officialBookContent')
      WHEN 'tamkeenExplanationHtml' THEN jsonb_build_object('target','lesson_explanations','lifecycle','tamkeenExplanation')
      WHEN 'lessonSummaryHtml' THEN jsonb_build_object('target','lesson_summaries','lifecycle','quickReview')
      WHEN 'conceptsAndTermsHtml' THEN jsonb_build_object('target','lesson_resources:concepts_and_terms_html','lifecycle','conceptsAndTerms','htmlSubtype','concepts_and_terms_html','renderMode','STATIC')
      WHEN 'equationsAndLawsHtml' THEN jsonb_build_object('target','lesson_resources:equations_and_laws_html','lifecycle','equationsAndLaws','htmlSubtype','equations_and_laws_html','renderMode','STATIC')
      WHEN 'interactiveActivityHtml' THEN jsonb_build_object('target','lesson_resources:interactive_activity_html','lifecycle','interactiveActivity','htmlSubtype','interactive_activity_html','renderMode','INTERACTIVE')
      WHEN 'officialBookQuestions' THEN jsonb_build_object('target','questions:official','lifecycle','checkUnderstanding')
      WHEN 'selfTest' THEN jsonb_build_object('target','lesson_assessments:self_test','lifecycle','lessonAssessment')
      ELSE NULL END;
  ELSE
    RAISE EXCEPTION 'GOLDEN_LESSON_CONTRACT_SCHEMA_UNSUPPORTED: %', coalesce(_schema,'<null>')
      USING ERRCODE = '22023';
  END IF;
  IF out_value IS NULL THEN
    RAISE EXCEPTION 'GOLDEN_LESSON_CAPABILITY_UNSUPPORTED: %/%', _schema, coalesce(_capability,'<null>')
      USING ERRCODE = '22023';
  END IF;
  RETURN out_value;
END $$;

CREATE OR REPLACE FUNCTION public.golden_lesson_contract_lifecycle_capabilities(_schema text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT array_agg(lifecycle ORDER BY lifecycle)
    FROM (
      SELECT public.golden_lesson_contract_entry(_schema, cap)->>'lifecycle' AS lifecycle
        FROM unnest(public.golden_lesson_contract_capabilities(_schema)) AS cap
    ) mapped;
$$;

-- Exact applicability rules. V1 remains manifest-defined. V2 is fail-closed:
-- seven numbered contents are required except equations may be NA; activity is optional.
CREATE OR REPLACE FUNCTION public.golden_lesson_assert_v2_applicability(
  _capability text, _applicability text, _has_payload boolean
) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF _capability = 'interactiveActivityHtml' THEN
    IF _applicability NOT IN ('OPTIONAL','NA') THEN
      RAISE EXCEPTION 'GLV2_ACTIVITY_MUST_BE_OPTIONAL_OR_NA' USING ERRCODE = '23514';
    END IF;
  ELSIF _capability = 'equationsAndLawsHtml' THEN
    IF _applicability NOT IN ('REQUIRED','NA') THEN
      RAISE EXCEPTION 'GLV2_EQUATIONS_APPLICABILITY_INVALID' USING ERRCODE = '23514';
    END IF;
  ELSIF _applicability <> 'REQUIRED' THEN
    RAISE EXCEPTION 'GLV2_NUMBERED_CAPABILITY_MUST_BE_REQUIRED: %', _capability USING ERRCODE = '23514';
  END IF;
  IF _applicability = 'NA' AND _has_payload THEN
    RAISE EXCEPTION 'GLV2_NA_MUST_NOT_HAVE_PAYLOAD: %', _capability USING ERRCODE = '23514';
  END IF;
  IF _applicability = 'REQUIRED' AND NOT _has_payload THEN
    RAISE EXCEPTION 'GLV2_REQUIRED_PAYLOAD_MISSING: %', _capability USING ERRCODE = '23514';
  END IF;
END $$;

-- Deferred exact-set guard. It validates both CF08 vocabulary and the profile/schema pin.
CREATE OR REPLACE FUNCTION public.golden_lesson_validate_stage_batch_contract(_batch_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  b public.golden_lesson_domain_stage_batches;
  v public.golden_lesson_package_versions;
  got text[];
  want text[];
  row_value record;
  mapping jsonb;
BEGIN
  SELECT * INTO b FROM public.golden_lesson_domain_stage_batches WHERE id = _batch_id;
  IF b.id IS NULL THEN RETURN; END IF;
  SELECT * INTO v FROM public.golden_lesson_package_versions
   WHERE package_id=b.package_id AND version=b.package_version;
  IF v.id IS NULL THEN RAISE EXCEPTION 'GLV2_PACKAGE_VERSION_MISSING' USING ERRCODE='23514'; END IF;
  IF b.contract_schema IS DISTINCT FROM public.golden_lesson_contract_schema(v.manifest->>'schema') THEN
    RAISE EXCEPTION 'GLV2_BATCH_SCHEMA_PROFILE_MISMATCH' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(array_agg(capability ORDER BY capability),ARRAY[]::text[]) INTO got
    FROM public.golden_lesson_domain_stage_entries WHERE batch_id=_batch_id;
  want := public.golden_lesson_contract_capability_set(b.contract_schema);
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'GLV2_STAGE_CAPABILITY_SET_INVALID got=[%] want=[%]',
      array_to_string(got,','),array_to_string(want,',') USING ERRCODE='23514';
  END IF;
  FOR row_value IN SELECT * FROM public.golden_lesson_domain_stage_entries WHERE batch_id=_batch_id LOOP
    mapping := public.golden_lesson_contract_entry(b.contract_schema,row_value.capability);
    IF row_value.target_plan IS DISTINCT FROM mapping->>'target'
       OR row_value.lifecycle_capability IS DISTINCT FROM mapping->>'lifecycle' THEN
      RAISE EXCEPTION 'GLV2_STAGE_MAPPING_INVALID: %',row_value.capability USING ERRCODE='23514';
    END IF;
    IF b.contract_schema = 'tamkeen.golden-lesson-package.v2' THEN
      PERFORM public.golden_lesson_assert_v2_applicability(
        row_value.capability,row_value.applicability,row_value.source_payload IS NOT NULL);
    END IF;
  END LOOP;
END $$;

-- CF04 compatibility bridge: V2 manifests need their own validator/entry point because the
-- installed V1 validator intentionally rejects every non-V1 schema. Existing V1 RPC is untouched.
CREATE OR REPLACE FUNCTION public.assert_golden_lesson_manifest_v2(_manifest jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  artifact jsonb;
  capability text;
  got text[];
  want text[] := public.golden_lesson_contract_capabilities('tamkeen.golden-lesson-package.v2');
  has_payload boolean;
BEGIN
  IF jsonb_typeof(_manifest) <> 'object'
     OR _manifest->>'schema' IS DISTINCT FROM 'tamkeen.golden-lesson-package.v2' THEN
    RAISE EXCEPTION 'GLV2_MANIFEST_SCHEMA_INVALID' USING ERRCODE='22023';
  END IF;
  -- Profiles remain subject-specific; V2 is a package schema, not a replacement profile name.
  IF _manifest->>'profileId' NOT IN ('GOLDEN_QURAN_V1','GOLDEN_CHEMISTRY_V1') THEN
    RAISE EXCEPTION 'GLV2_PROFILE_INVALID' USING ERRCODE='22023';
  END IF;
  IF coalesce(btrim(_manifest->>'packageCode'),'') = ''
     OR jsonb_typeof(_manifest->'identity') <> 'object'
     OR jsonb_typeof(_manifest->'artifacts') <> 'array'
     OR jsonb_typeof(_manifest->'capabilityOrder') <> 'array' THEN
    RAISE EXCEPTION 'GLV2_MANIFEST_REQUIRED_FIELD_MISSING' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(value ORDER BY ordinality) INTO got
    FROM jsonb_array_elements_text(_manifest->'capabilityOrder') WITH ORDINALITY;
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'GLV2_CAPABILITY_ORDER_SET_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(DISTINCT value->>'capability' ORDER BY value->>'capability') INTO got
    FROM jsonb_array_elements(_manifest->'artifacts');
  IF got IS DISTINCT FROM public.golden_lesson_contract_capability_set('tamkeen.golden-lesson-package.v2')
     OR jsonb_array_length(_manifest->'artifacts') <> array_length(want,1) THEN
    RAISE EXCEPTION 'GLV2_ARTIFACT_SET_INVALID' USING ERRCODE='22023';
  END IF;
  FOR artifact IN SELECT value FROM jsonb_array_elements(_manifest->'artifacts') LOOP
    capability := artifact->>'capability';
    has_payload := artifact->>'sourcePath' IS NOT NULL;
    PERFORM public.golden_lesson_assert_v2_applicability(
      capability,artifact->>'applicability',has_payload);
    IF artifact->>'authority' IS DISTINCT FROM
       CASE WHEN capability IN ('officialBookContent','officialBookQuestions')
            THEN 'OFFICIAL' ELSE 'TAMKEEN' END THEN
      RAISE EXCEPTION 'GLV2_AUTHORITY_MISMATCH: %',capability USING ERRCODE='22023';
    END IF;
    IF has_payload AND (artifact->>'sha256' IS NULL OR artifact->>'sha256' !~ '^[a-f0-9]{64}$') THEN
      RAISE EXCEPTION 'GLV2_ARTIFACT_HASH_INVALID: %',capability USING ERRCODE='22023';
    END IF;
    IF NOT has_payload AND artifact->>'sha256' IS NOT NULL THEN
      RAISE EXCEPTION 'GLV2_ARTIFACT_PATH_HASH_MISMATCH: %',capability USING ERRCODE='22023';
    END IF;
    IF capability IN ('officialBookContent','officialBookQuestions')
       AND (artifact->>'provenancePath' IS NULL
         OR artifact->>'provenanceSha256' !~ '^[a-f0-9]{64}$') THEN
      RAISE EXCEPTION 'GLV2_OFFICIAL_PROVENANCE_MISSING: %',capability USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF coalesce(_manifest#>>'{security,answersCompanionPath}','') !~ '\.server-only\.json$'
     OR coalesce(_manifest#>>'{security,answersCompanionSha256}','') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'GLV2_ANSWERS_COMPANION_INVALID' USING ERRCODE='22023';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.golden_lesson_stage_manifest_v2(
  _manifest jsonb, _client_manifest_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor uuid := auth.uid();
  code text;
  canonical_hash text;
  pkg public.golden_lesson_packages;
  next_version integer;
BEGIN
  IF actor IS NULL OR NOT public.is_golden_lesson_content_staff(actor) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF _client_manifest_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'CLIENT_MANIFEST_HASH_INVALID' USING ERRCODE='22023';
  END IF;
  PERFORM public.assert_golden_lesson_manifest_v2(_manifest);
  code := _manifest->>'packageCode';
  canonical_hash := encode(extensions.digest(convert_to(_manifest::text,'UTF8'),'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('golden_lesson:' || code,0));
  SELECT * INTO pkg FROM public.golden_lesson_packages WHERE package_code=code FOR UPDATE;
  IF pkg.id IS NULL THEN
    INSERT INTO public.golden_lesson_packages(
      package_code,profile_id,identity,current_manifest_sha256,current_canonical_sha256,created_by)
    VALUES(code,_manifest->>'profileId',_manifest->'identity',_client_manifest_sha256,canonical_hash,actor)
    RETURNING * INTO pkg;
    next_version := 1;
  ELSE
    IF pkg.profile_id IS DISTINCT FROM _manifest->>'profileId'
       OR pkg.identity IS DISTINCT FROM _manifest->'identity' THEN
      RAISE EXCEPTION 'PACKAGE_IDENTITY_IMMUTABLE' USING ERRCODE='22023';
    END IF;
    IF pkg.current_canonical_sha256=canonical_hash THEN
      RETURN jsonb_build_object('package_id',pkg.id,'version',pkg.current_version,
        'status',pkg.review_status,'schema','tamkeen.golden-lesson-package.v2',
        'idempotent',true,'writes_performed',0);
    END IF;
    next_version := pkg.current_version+1;
    UPDATE public.golden_lesson_packages SET current_version=next_version,
      current_manifest_sha256=_client_manifest_sha256,current_canonical_sha256=canonical_hash,
      review_status='DRAFT',updated_at=now()
     WHERE id=pkg.id RETURNING * INTO pkg;
  END IF;
  INSERT INTO public.golden_lesson_package_versions(
    package_id,version,manifest,client_manifest_sha256,canonical_manifest_sha256,created_by)
  VALUES(pkg.id,next_version,_manifest,_client_manifest_sha256,canonical_hash,actor);
  RETURN jsonb_build_object('package_id',pkg.id,'version',next_version,'status','DRAFT',
    'schema','tamkeen.golden-lesson-package.v2','idempotent',false,'writes_performed',2);
END $$;

REVOKE ALL ON FUNCTION public.golden_lesson_stage_manifest_v2(jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golden_lesson_stage_manifest_v2(jsonb,text) TO authenticated;

-- CF08 V2 entry point. V1 keeps using golden_lesson_stage_domain_bundle unchanged.
CREATE OR REPLACE FUNCTION public.golden_lesson_stage_domain_bundle_v2(
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
  mapping jsonb;
  answer_payload bytea;
  got text[];
  writes integer := 1;
BEGIN
  IF NOT public.golden_lesson_has_role(_actor_id,'admin') THEN
    RAISE EXCEPTION 'DOMAIN_STAGE_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO pkg FROM public.golden_lesson_packages WHERE id=_package_id FOR UPDATE;
  SELECT * INTO ver FROM public.golden_lesson_package_versions
   WHERE package_id=_package_id AND version=_version FOR UPDATE;
  IF pkg.id IS NULL OR ver.id IS NULL THEN RAISE EXCEPTION 'PACKAGE_VERSION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF ver.manifest->>'schema' IS DISTINCT FROM 'tamkeen.golden-lesson-package.v2' THEN
    RAISE EXCEPTION 'GLV2_PROFILE_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF pkg.current_version <> _version OR pkg.review_status <> 'APPROVED_FOR_STAGING' THEN
    RAISE EXCEPTION 'PACKAGE_NOT_APPROVED_FOR_DOMAIN_STAGING' USING ERRCODE='23514';
  END IF;
  IF ver.verified_bundle_sha256 IS DISTINCT FROM _bundle_sha256 OR ver.bundle_verified_at IS NULL THEN
    RAISE EXCEPTION 'VERIFIED_BUNDLE_IDENTITY_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF jsonb_typeof(_entries) <> 'array' THEN
    RAISE EXCEPTION 'DOMAIN_STAGE_ENTRY_SET_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(DISTINCT value->>'capability' ORDER BY value->>'capability') INTO got
    FROM jsonb_array_elements(_entries);
  IF got IS DISTINCT FROM public.golden_lesson_contract_capability_set('tamkeen.golden-lesson-package.v2')
     OR jsonb_array_length(_entries) <> array_length(got,1) THEN
    RAISE EXCEPTION 'DOMAIN_STAGE_ENTRY_SET_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT * INTO existing FROM public.golden_lesson_domain_stage_batches
   WHERE package_id=_package_id AND package_version=_version;
  IF existing.id IS NOT NULL THEN
    IF existing.verified_bundle_sha256 IS DISTINCT FROM _bundle_sha256
       OR existing.contract_schema IS DISTINCT FROM 'tamkeen.golden-lesson-package.v2' THEN
      RAISE EXCEPTION 'DOMAIN_STAGE_IMMUTABLE_CONFLICT' USING ERRCODE='23514';
    END IF;
    RETURN jsonb_build_object('batch_id',existing.id,'contract_schema',existing.contract_schema,
      'idempotent',true,'writes_performed',0,'domain_writes_performed',0);
  END IF;
  INSERT INTO public.golden_lesson_domain_stage_batches(
    package_id,package_version,verified_bundle_sha256,staged_by,contract_schema)
  VALUES(_package_id,_version,_bundle_sha256,_actor_id,'tamkeen.golden-lesson-package.v2')
  RETURNING id INTO batch_id;
  FOR item IN SELECT value FROM jsonb_array_elements(_entries) LOOP
    SELECT value INTO artifact FROM jsonb_array_elements(ver.manifest->'artifacts')
      WHERE value->>'capability'=item->>'capability';
    IF artifact IS NULL THEN RAISE EXCEPTION 'DOMAIN_STAGE_CAPABILITY_UNKNOWN' USING ERRCODE='22023'; END IF;
    mapping := public.golden_lesson_contract_entry('tamkeen.golden-lesson-package.v2',item->>'capability');
    IF item->>'targetPlan' IS DISTINCT FROM mapping->>'target'
       OR item->>'lifecycleCapability' IS DISTINCT FROM mapping->>'lifecycle'
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
    PERFORM public.golden_lesson_assert_v2_applicability(
      item->>'capability',item->>'applicability',payload IS NOT NULL);
    IF (payload IS NULL) IS DISTINCT FROM (artifact->>'sourcePath' IS NULL)
       OR (payload IS NOT NULL AND encode(extensions.digest(payload,'sha256'),'hex') IS DISTINCT FROM artifact->>'sha256')
       OR (provenance IS NULL) IS DISTINCT FROM (artifact->>'provenancePath' IS NULL)
       OR (provenance IS NOT NULL AND encode(extensions.digest(provenance,'sha256'),'hex') IS DISTINCT FROM artifact->>'provenanceSha256') THEN
      RAISE EXCEPTION 'DOMAIN_STAGE_PAYLOAD_HASH_MISMATCH: %',item->>'capability' USING ERRCODE='23514';
    END IF;
    INSERT INTO public.golden_lesson_domain_stage_entries(
      batch_id,capability,lifecycle_capability,target_plan,applicability,authority,
      source_path,source_sha256,source_payload,provenance_path,provenance_sha256,provenance_payload)
    VALUES(batch_id,item->>'capability',mapping->>'lifecycle',mapping->>'target',
      item->>'applicability',item->>'authority',item->>'sourcePath',item->>'sourceSha256',payload,
      item->>'provenancePath',item->>'provenanceSha256',provenance);
    writes := writes + 1;
  END LOOP;
  PERFORM public.golden_lesson_validate_stage_batch_contract(batch_id);
  IF jsonb_typeof(_answers_companion) <> 'object'
     OR _answers_companion->>'path' IS DISTINCT FROM ver.manifest#>>'{security,answersCompanionPath}'
     OR _answers_companion->>'sha256' IS DISTINCT FROM ver.manifest#>>'{security,answersCompanionSha256}' THEN
    RAISE EXCEPTION 'DOMAIN_STAGE_ANSWERS_MISMATCH' USING ERRCODE='23514';
  END IF;
  answer_payload := decode(_answers_companion->>'base64','base64');
  IF encode(extensions.digest(answer_payload,'sha256'),'hex') IS DISTINCT FROM _answers_companion->>'sha256' THEN
    RAISE EXCEPTION 'DOMAIN_STAGE_ANSWERS_HASH_MISMATCH' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.golden_lesson_domain_stage_answers(batch_id,companion_path,companion_sha256,companion_payload)
  VALUES(batch_id,_answers_companion->>'path',_answers_companion->>'sha256',answer_payload);
  RETURN jsonb_build_object('batch_id',batch_id,'contract_schema','tamkeen.golden-lesson-package.v2',
    'idempotent',false,'writes_performed',writes+1,'domain_writes_performed',0);
END $$;

REVOKE ALL ON FUNCTION public.golden_lesson_stage_domain_bundle_v2(uuid,integer,uuid,text,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golden_lesson_stage_domain_bundle_v2(uuid,integer,uuid,text,jsonb,jsonb)
  TO service_role;

-- CF10/CF11 branch guard. Until the complete V2 materializer and publisher are present,
-- operators receive an explicit hard failure instead of falling through to V1 semantics.
CREATE OR REPLACE FUNCTION public.golden_lesson_assert_runtime_contract_supported(
  _batch_id uuid, _stage text
) RETURNS text LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE schema_value text;
BEGIN
  SELECT contract_schema INTO schema_value
    FROM public.golden_lesson_domain_stage_batches WHERE id=_batch_id;
  IF schema_value IS NULL THEN RAISE EXCEPTION 'GOLDEN_LESSON_BATCH_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF schema_value = 'tamkeen.golden-lesson-package.v1' THEN RETURN schema_value; END IF;
  IF _stage IN ('CF10','CF11') THEN
    RAISE EXCEPTION 'GLV2_%_IMPLEMENTATION_REQUIRED',_stage USING ERRCODE='0A000';
  END IF;
  RETURN schema_value;
END $$;

COMMENT ON FUNCTION public.golden_lesson_assert_runtime_contract_supported(uuid,text) IS
  'Fail-closed V1/V2 branch gate. Remove the V2 refusal only in the atomic migration that installs complete CF10 and CF11 V2 implementations.';

COMMIT;

-- Rollback notes (manual, source-only):
-- 1. Do not roll back after a V2 batch is staged. Preserve it as immutable audit history.
-- 2. Before any rollback prove zero contract_schema=V2 batches and zero new HTML subtype rows.
-- 3. Then drop only the *_v2 and golden_lesson_contract_* functions, drop the batch constraint,
--    drop contract_schema, and restore the prior HTML subtype constraint verbatim.
-- 4. Never delete stage, publication, question, answer, or audit rows to simulate rollback.
