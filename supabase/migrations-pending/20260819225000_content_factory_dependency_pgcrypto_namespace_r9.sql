-- CF10-R9: dependency namespace correction for pgcrypto.
--
-- Production hosts pgcrypto in the `extensions` schema. The already-applied CF04/CF08/CF09
-- functions are pinned to `SET search_path = public, pg_temp` and call `digest(...)` unqualified,
-- so they cannot resolve pgcrypto at runtime in production. This forward migration re-creates the
-- three affected functions VERBATIM, with the single change that every hash call is schema
-- qualified as `extensions.digest(...)`. No signature, volatility, security context, search_path,
-- grant, revoke or behavioural change of any kind.
--
-- The byte contents of the already-applied migrations 20260819190000 / 20260819210000 /
-- 20260819220000 are untouched. This migration is ordered strictly before CF10 (20260819230000).

BEGIN;

DO $cf10_dep_pgcrypto$
BEGIN
  IF to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'CF10_DEPENDENCY_PGCRYPTO_DIGEST_MISSING: extensions.digest(bytea,text) is required before re-creating the CF04/CF08/CF09 hashing functions'
      USING ERRCODE = '42883';
  END IF;
END
$cf10_dep_pgcrypto$;

-- 1/3 CF04 public.golden_lesson_stage_manifest(jsonb,text)
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
  canonical_hash := encode(extensions.digest(convert_to(_manifest::text, 'UTF8'), 'sha256'), 'hex');
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

REVOKE ALL ON FUNCTION public.golden_lesson_stage_manifest(jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golden_lesson_stage_manifest(jsonb,text) TO authenticated;

-- 2/3 CF08 public.golden_lesson_stage_domain_bundle(uuid,integer,uuid,text,jsonb,jsonb)
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
       OR (payload IS NOT NULL AND encode(extensions.digest(payload,'sha256'),'hex') IS DISTINCT FROM artifact->>'sha256')
       OR (provenance IS NULL) IS DISTINCT FROM (artifact->>'provenancePath' IS NULL)
       OR (provenance IS NOT NULL AND encode(extensions.digest(provenance,'sha256'),'hex') IS DISTINCT FROM artifact->>'provenanceSha256') THEN
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
    IF encode(extensions.digest(answer_payload,'sha256'),'hex') IS DISTINCT FROM ver.manifest#>>'{security,answersCompanionSha256}' THEN
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

-- 3/3 CF09 public.golden_lesson_bind_authoritative_identity(uuid,uuid)
CREATE OR REPLACE FUNCTION public.golden_lesson_bind_authoritative_identity(
  _batch_id uuid, _actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  batch public.golden_lesson_domain_stage_batches;
  ver public.golden_lesson_package_versions;
  existing public.golden_lesson_identity_bindings;
  ident jsonb;
  grade_row public.grades;
  subject_row public.subjects;
  lesson_row public.lessons;
  unit_row public.units;
  track_codes text[];
  track_ids uuid[];
  snapshot jsonb;
  snapshot_sha text;
BEGIN
  IF NOT public.golden_lesson_has_role(_actor_id, 'admin') THEN
    RAISE EXCEPTION 'IDENTITY_BIND_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO batch FROM public.golden_lesson_domain_stage_batches
   WHERE id = _batch_id FOR UPDATE;
  IF batch.id IS NULL THEN
    RAISE EXCEPTION 'DOMAIN_STAGE_BATCH_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO ver FROM public.golden_lesson_package_versions
   WHERE package_id = batch.package_id AND version = batch.package_version;
  IF ver.id IS NULL OR ver.verified_bundle_sha256 IS DISTINCT FROM batch.verified_bundle_sha256 THEN
    RAISE EXCEPTION 'IDENTITY_BIND_VERSION_DRIFT' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO existing FROM public.golden_lesson_identity_bindings WHERE batch_id = _batch_id;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('binding_id', existing.id, 'identity_sha256', existing.identity_sha256,
      'idempotent', true, 'writes_performed', 0, 'domain_writes_performed', 0);
  END IF;

  ident := ver.manifest->'identity';
  IF jsonb_typeof(ident) <> 'object' THEN
    RAISE EXCEPTION 'IDENTITY_MANIFEST_MISSING' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT lower(btrim(value)) ORDER BY lower(btrim(value))) INTO track_codes
    FROM jsonb_array_elements_text(ident->'curriculumTrackCodes');
  IF track_codes IS NULL OR cardinality(track_codes) = 0
     OR cardinality(track_codes) <> jsonb_array_length(ident->'curriculumTrackCodes') THEN
    RAISE EXCEPTION 'IDENTITY_TRACK_SET_INVALID' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(*) FROM public.grades WHERE lower(btrim(slug)) = lower(btrim(ident->>'gradeCode'))) <> 1 THEN
    RAISE EXCEPTION 'IDENTITY_GRADE_NOT_EXACTLY_ONE' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO grade_row FROM public.grades WHERE lower(btrim(slug)) = lower(btrim(ident->>'gradeCode'));

  IF (SELECT count(*) FROM public.curriculum_tracks
       WHERE lower(btrim(track_code)) = ANY(track_codes) AND is_active) <> cardinality(track_codes) THEN
    RAISE EXCEPTION 'IDENTITY_TRACK_NOT_EXACTLY_ONE_ACTIVE' USING ERRCODE = '23514';
  END IF;
  SELECT array_agg(id ORDER BY lower(btrim(track_code))) INTO track_ids
    FROM public.curriculum_tracks
   WHERE lower(btrim(track_code)) = ANY(track_codes) AND is_active;

  IF (SELECT count(*) FROM public.subjects WHERE lower(btrim(code)) = lower(btrim(ident->>'subjectCode'))) <> 1 THEN
    RAISE EXCEPTION 'IDENTITY_SUBJECT_NOT_EXACTLY_ONE' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO subject_row FROM public.subjects WHERE lower(btrim(code)) = lower(btrim(ident->>'subjectCode'));
  IF subject_row.grade_id IS DISTINCT FROM grade_row.id THEN
    RAISE EXCEPTION 'IDENTITY_SUBJECT_GRADE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM public.subject_curriculum_tracks
       WHERE subject_id = subject_row.id AND curriculum_track_id = ANY(track_ids) AND is_active)
       <> cardinality(track_ids) THEN
    RAISE EXCEPTION 'IDENTITY_SUBJECT_TRACK_BINDING_MISSING' USING ERRCODE = '23514';
  END IF;

  IF ident->>'unitCode' IS NULL THEN
    unit_row := NULL;
  ELSE
    IF (SELECT count(*) FROM public.units
         WHERE subject_id = subject_row.id AND lower(btrim(code)) = lower(btrim(ident->>'unitCode'))) <> 1 THEN
      RAISE EXCEPTION 'IDENTITY_UNIT_NOT_EXACTLY_ONE' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO unit_row FROM public.units
     WHERE subject_id = subject_row.id AND lower(btrim(code)) = lower(btrim(ident->>'unitCode'));
  END IF;

  -- Import Contract 01 defines (subject_id, lessons.slug) as the lesson natural key.
  -- lessonCode remains the external Content Factory code; lessonSlug binds the live row.
  IF (SELECT count(*) FROM public.lessons
       WHERE subject_id = subject_row.id AND lower(btrim(slug)) = lower(btrim(ident->>'lessonSlug'))) <> 1 THEN
    RAISE EXCEPTION 'IDENTITY_LESSON_NOT_EXACTLY_ONE' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO lesson_row FROM public.lessons
   WHERE subject_id = subject_row.id AND lower(btrim(slug)) = lower(btrim(ident->>'lessonSlug'));
  IF lesson_row.unit_id IS DISTINCT FROM unit_row.id THEN
    RAISE EXCEPTION 'IDENTITY_LESSON_UNIT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  snapshot := jsonb_build_object(
    'grade', jsonb_build_object('id',grade_row.id,'slug',grade_row.slug),
    'tracks', (SELECT jsonb_agg(jsonb_build_object('id',id,'code',track_code) ORDER BY lower(btrim(track_code)))
                 FROM public.curriculum_tracks WHERE id = ANY(track_ids)),
    'subject', jsonb_build_object('id',subject_row.id,'code',subject_row.code,'gradeId',subject_row.grade_id),
    'unit', CASE WHEN unit_row.id IS NULL THEN 'null'::jsonb ELSE jsonb_build_object('id',unit_row.id,'code',unit_row.code,'subjectId',unit_row.subject_id) END,
    'lesson', jsonb_build_object('id',lesson_row.id,'slug',lesson_row.slug,'subjectId',lesson_row.subject_id,'unitId',lesson_row.unit_id),
    'externalLessonCode', ident->>'lessonCode'
  );
  snapshot_sha := encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex');

  INSERT INTO public.golden_lesson_identity_bindings(
    batch_id,grade_id,subject_id,lesson_id,unit_id,curriculum_track_ids,
    external_lesson_code,identity_snapshot,identity_sha256,bound_by)
  VALUES (_batch_id,grade_row.id,subject_row.id,lesson_row.id,unit_row.id,track_ids,
    ident->>'lessonCode',snapshot,snapshot_sha,_actor_id)
  RETURNING * INTO existing;

  RETURN jsonb_build_object('binding_id',existing.id,'identity_sha256',snapshot_sha,
    'idempotent',false,'writes_performed',1,'domain_writes_performed',0,
    'curriculum_creation_performed',false);
END;
$$;

REVOKE ALL ON FUNCTION public.golden_lesson_bind_authoritative_identity(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golden_lesson_bind_authoritative_identity(uuid,uuid) TO service_role;

COMMIT;
