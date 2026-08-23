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
      WHEN capability IN ('labExperimentHtml','officialBookQuestions') THEN 'OPTIONAL'
      ELSE 'REQUIRED' END;
    IF artifact->>'applicability' IS DISTINCT FROM expected_applicability THEN
      RAISE EXCEPTION 'APPLICABILITY_MISMATCH: %', capability USING ERRCODE = '22023';
    END IF;
    IF artifact->>'authority' IS DISTINCT FROM
       (CASE WHEN capability IN ('officialBookContent','officialBookQuestions') THEN 'OFFICIAL' ELSE 'TAMKEEN' END) THEN
      RAISE EXCEPTION 'AUTHORITY_MISMATCH: %', capability USING ERRCODE = '22023';
    END IF;
    IF expected_applicability = 'NA' AND (artifact->'sourcePath' <> 'null'::jsonb OR artifact->'sha256' <> 'null'::jsonb OR artifact->'provenancePath' <> 'null'::jsonb OR artifact->'provenanceSha256' <> 'null'::jsonb) THEN
      RAISE EXCEPTION 'NA_ARTIFACT_HAS_CONTENT: %', capability USING ERRCODE = '22023';
    END IF;
    IF expected_applicability = 'REQUIRED' AND COALESCE(artifact->>'sourcePath','') = '' THEN
      RAISE EXCEPTION 'REQUIRED_ARTIFACT_MISSING: %', capability USING ERRCODE = '22023';
    END IF;
    IF artifact->>'sourcePath' IS NOT NULL AND COALESCE(artifact->>'sha256','') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'ARTIFACT_HASH_INVALID: %', capability USING ERRCODE = '22023';
    END IF;
    IF capability IN ('officialBookContent','officialBookQuestions')
       AND artifact->>'sourcePath' IS NOT NULL THEN
      IF COALESCE(artifact->>'provenancePath','') = '' THEN
        RAISE EXCEPTION 'OFFICIAL_PROVENANCE_MISSING: %', capability USING ERRCODE = '22023';
      END IF;
      IF COALESCE(artifact->>'provenanceSha256','') !~ '^[a-f0-9]{64}$' THEN
        RAISE EXCEPTION 'OFFICIAL_PROVENANCE_HASH_INVALID: %', capability USING ERRCODE = '22023';
      END IF;
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