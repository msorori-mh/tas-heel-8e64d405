-- LESSON_COMPONENT_INDEPENDENT_PUBLISHING_02 — PG17 proof.
--
-- Runs after the disposable Content V3 rehearsal and after
-- 20260831010000_lesson_component_independent_publishing_02.sql.
--
-- Proves the behaviour the content team asked for, and the boundary that keeps it
-- safe: one READY component makes the lesson reachable, and nothing that is still
-- DRAFT or REVIEW is ever reported as readable.
DO $$
DECLARE
  v_actor uuid := '11000000-0000-0000-0000-000000000002';
  v_subject uuid := '22000000-0000-0000-0000-000000000002';
  v_lesson uuid := '33000000-0000-0000-0000-000000000002';
  v_visible boolean;
  v_ready text[];
BEGIN
  INSERT INTO auth.users (id) VALUES (v_actor) ON CONFLICT DO NOTHING;
  INSERT INTO public.subjects (id, code, name)
  VALUES (v_subject, 'LCIP02', 'Independent publishing 02 fixture')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.lessons (id, subject_id, slug, title, is_free)
  VALUES (v_lesson, v_subject, 'independent-publishing-02', 'Independent publishing 02', true)
  ON CONFLICT DO NOTHING;

  -- ---------------------------------------------------------------------------
  -- 1) A lesson whose only authored component is still DRAFT stays hidden.
  -- ---------------------------------------------------------------------------
  INSERT INTO public.lesson_capability_lifecycle (lesson_id, capability, status, applicability)
  VALUES (v_lesson, 'officialBookContent', 'DRAFT', 'REQUIRED')
  ON CONFLICT (lesson_id, capability) DO UPDATE
    SET status = 'DRAFT', applicability = 'REQUIRED', ready_by = NULL, ready_at = NULL;

  SELECT public.lesson_student_visible(v_lesson) INTO v_visible;
  IF v_visible THEN
    RAISE EXCEPTION 'LCIP02_DRAFT_ONLY_LESSON_IS_VISIBLE';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 2) A single READY component publishes the lesson on its own. This is the whole
  --    point: the other six are absent, and the lesson is still reachable.
  -- ---------------------------------------------------------------------------
  UPDATE public.lesson_capability_lifecycle
     SET status = 'READY', ready_by = v_actor, ready_at = now()
   WHERE lesson_id = v_lesson AND capability = 'officialBookContent';

  SELECT public.lesson_student_visible(v_lesson) INTO v_visible;
  IF NOT v_visible THEN
    RAISE EXCEPTION 'LCIP02_SINGLE_READY_COMPONENT_STILL_HIDDEN';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 3) The gate reports only the READY component. A sibling in DRAFT and a sibling
  --    in REVIEW must not leak into the readable set just because the lesson opened.
  -- ---------------------------------------------------------------------------
  INSERT INTO public.lesson_capability_lifecycle (lesson_id, capability, status, applicability)
  VALUES
    (v_lesson, 'quickReview', 'DRAFT', 'REQUIRED'),
    (v_lesson, 'mindMap', 'REVIEW', 'REQUIRED')
  ON CONFLICT (lesson_id, capability) DO UPDATE
    SET status = EXCLUDED.status, applicability = EXCLUDED.applicability;

  SELECT ready_capabilities INTO v_ready
    FROM public.lesson_student_content_gate(v_lesson);

  IF v_ready IS DISTINCT FROM ARRAY['officialBookContent']::text[] THEN
    RAISE EXCEPTION 'LCIP02_GATE_LEAKED_UNREADY_COMPONENTS: [%]', array_to_string(v_ready, ',');
  END IF;

  -- ---------------------------------------------------------------------------
  -- 4) Publishing a second component adds it without disturbing the first.
  -- ---------------------------------------------------------------------------
  UPDATE public.lesson_capability_lifecycle
     SET status = 'READY', ready_by = v_actor, ready_at = now()
   WHERE lesson_id = v_lesson AND capability = 'mindMap';

  SELECT ready_capabilities INTO v_ready
    FROM public.lesson_student_content_gate(v_lesson);

  IF v_ready IS DISTINCT FROM ARRAY['mindMap','officialBookContent']::text[] THEN
    RAISE EXCEPTION 'LCIP02_SECOND_COMPONENT_NOT_INDEPENDENT: [%]', array_to_string(v_ready, ',');
  END IF;

  -- ---------------------------------------------------------------------------
  -- 5) Demoting one published component must not unpublish the other.
  -- ---------------------------------------------------------------------------
  UPDATE public.lesson_capability_lifecycle
     SET status = 'DRAFT', ready_by = NULL, ready_at = NULL
   WHERE lesson_id = v_lesson AND capability = 'officialBookContent';

  SELECT public.lesson_student_visible(v_lesson) INTO v_visible;
  IF NOT v_visible THEN
    RAISE EXCEPTION 'LCIP02_SIBLING_DEMOTION_HID_THE_LESSON';
  END IF;

  SELECT ready_capabilities INTO v_ready
    FROM public.lesson_student_content_gate(v_lesson);
  IF v_ready IS DISTINCT FROM ARRAY['mindMap']::text[] THEN
    RAISE EXCEPTION 'LCIP02_DEMOTED_COMPONENT_STILL_READABLE: [%]', array_to_string(v_ready, ',');
  END IF;

  -- ---------------------------------------------------------------------------
  -- 6) When every component falls back to DRAFT the lesson closes again.
  -- ---------------------------------------------------------------------------
  UPDATE public.lesson_capability_lifecycle
     SET status = 'DRAFT', ready_by = NULL, ready_at = NULL
   WHERE lesson_id = v_lesson;

  SELECT public.lesson_student_visible(v_lesson) INTO v_visible;
  IF v_visible THEN
    RAISE EXCEPTION 'LCIP02_LESSON_STAYED_VISIBLE_WITH_NOTHING_READY';
  END IF;

  RAISE NOTICE 'LCIP02 PG17 proof passed.';
END $$;

-- LCIP-02: the authored-subset helper is the whole basis of the CF11 relaxation, so it
-- is proved directly: it must name exactly the capabilities that carry content.
DO $$
DECLARE
  v_lesson uuid := '33000000-0000-0000-0000-000000000003';
  v_subject uuid := '22000000-0000-0000-0000-000000000003';
  v_authored text[];
BEGIN
  INSERT INTO public.subjects (id, code, name)
  VALUES (v_subject, 'LCIP02B', 'Authored subset fixture') ON CONFLICT DO NOTHING;
  INSERT INTO public.lessons (id, subject_id, slug, title, is_free)
  VALUES (v_lesson, v_subject, 'lcip02-authored-subset', 'Authored subset', true)
  ON CONFLICT DO NOTHING;

  -- Nothing authored at all: the helper must be empty, which is what makes
  -- CF11_NO_AUTHORED_CAPABILITY reachable instead of a silent empty publication.
  v_authored := public.cf11_authored_capabilities(v_lesson);
  IF array_length(v_authored, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'LCIP02_EMPTY_LESSON_REPORTED_AUTHORED: [%]',
      array_to_string(v_authored, ',');
  END IF;

  -- One real body: the helper must name exactly that one capability.
  INSERT INTO public.lesson_summaries (lesson_id, summary)
  VALUES (v_lesson, '<p>ملخص منشور</p>')
  ON CONFLICT (lesson_id) DO UPDATE SET summary = EXCLUDED.summary;

  v_authored := public.cf11_authored_capabilities(v_lesson);
  IF NOT ('quickReview' = ANY (v_authored)) THEN
    RAISE EXCEPTION 'LCIP02_AUTHORED_COMPONENT_NOT_DETECTED: [%]',
      array_to_string(v_authored, ',');
  END IF;
  IF 'mindMap' = ANY (v_authored) OR 'simulation' = ANY (v_authored) THEN
    RAISE EXCEPTION 'LCIP02_UNAUTHORED_COMPONENT_REPORTED_AUTHORED: [%]',
      array_to_string(v_authored, ',');
  END IF;

  RAISE NOTICE 'LCIP02 authored-subset proof passed.';
END $$;

-- The CF11 READY path must still refuse everything it refused before. These are the
-- guards the relaxation must not have widened; each is asserted on the deployed body.
DO $$
DECLARE
  d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'golden_lesson_attest_cf11_ready';

  IF d IS NULL THEN
    RAISE EXCEPTION 'LCIP02_ATTEST_FUNCTION_MISSING';
  END IF;

  IF position('CF11_SEPARATION_OF_DUTIES' in d) = 0
     OR position('CF11_PUBLICATION_REVOKED' in d) = 0
     OR position('CF11_READY_EVIDENCE_REQUIRED' in d) = 0
     OR position('CF11_ANSWER_LEAK_DETECTED' in d) = 0
     OR position('CF11_ASSET_OBJECT_IDENTITY_DRIFT_AT_READY' in d) = 0
     OR position('CF11_READY_REQUIRES_REVIEW_FOR_ALL' in d) = 0
     OR position('cf11_assert_replay_state' in d) = 0
     OR position('cf11_assert_exact_required_lifecycle_set' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP02_CF11_GUARD_LOST';
  END IF;

  -- The relaxation must be scoped to the authored subset, never to "skip everything".
  IF position('cf11_authored_capabilities' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP02_CF11_NOT_SCOPED_TO_AUTHORED';
  END IF;
  IF position('CF11_NO_AUTHORED_CAPABILITY' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP02_CF11_ALLOWS_EMPTY_PUBLICATION';
  END IF;

  RAISE NOTICE 'LCIP02 CF11 guard-retention proof passed.';
END $$;

-- The staged manifest rule is proved separately: a package that describes the seven
-- records but carries only one file must be accepted, and one carrying none rejected.
DO $$
DECLARE
  v_manifest jsonb;
  v_rejected boolean := false;
BEGIN
  SELECT jsonb_build_object(
    'schema', 'tamkeen.golden-lesson-package.v1',
    'profileId', 'GOLDEN_CHEMISTRY_V1',
    'packageCode', 'LCIP02-PROOF',
    'identity', jsonb_build_object(
      'gradeCode', 'GRADE-12',
      'curriculumTrackCodes', jsonb_build_array('sanaa'),
      'subjectCode', 'CHEM-G12',
      'lessonCode', 'CHEM-G12-L01',
      'lessonSlug', 'lcip02-proof',
      'unitCode', NULL, 'semester', 1, 'sortOrder', 1),
    'capabilityOrder', jsonb_build_array(
      'officialBookContent','tamkeenExplanationHtml','lessonSummaryHtml','mindMapHtml',
      'labExperimentHtml','officialBookQuestions','selfTest'),
    'artifacts', (
      SELECT jsonb_agg(jsonb_build_object(
        'capability', c,
        'applicability', CASE WHEN c = 'labExperimentHtml' THEN 'OPTIONAL' ELSE 'REQUIRED' END,
        'authority', CASE WHEN c IN ('officialBookContent','officialBookQuestions')
                          THEN 'OFFICIAL' ELSE 'TAMKEEN' END,
        -- Only the summary carries a file. Six of seven are still unauthored.
        'sourcePath', CASE WHEN c = 'lessonSummaryHtml' THEN 'lessonSummaryHtml.html' END,
        'sha256', CASE WHEN c = 'lessonSummaryHtml' THEN repeat('a', 64) END,
        'provenancePath', NULL,
        'provenanceSha256', NULL) ORDER BY o)
      FROM unnest(ARRAY[
        'officialBookContent','tamkeenExplanationHtml','lessonSummaryHtml','mindMapHtml',
        'labExperimentHtml','officialBookQuestions','selfTest']) WITH ORDINALITY AS t(c, o)),
    'lifecycle', jsonb_build_object('initialStatus', 'DRAFT', 'allowDirectReady', false),
    'security', jsonb_build_object(
      'productionApply', false, 'publicPayloadContainsAnswers', false,
      'answersCompanionPath', NULL, 'answersCompanionSha256', NULL,
      'htmlNetworkAccess', 'NONE')
  ) INTO v_manifest;

  -- One authored component is a complete, stageable package.
  PERFORM public.assert_golden_lesson_manifest(v_manifest);

  -- A package with no file at all still has nothing to publish.
  BEGIN
    PERFORM public.assert_golden_lesson_manifest(jsonb_set(
      v_manifest, '{artifacts}',
      (SELECT jsonb_agg(a - 'sourcePath' || jsonb_build_object('sourcePath', NULL, 'sha256', NULL))
         FROM jsonb_array_elements(v_manifest->'artifacts') a)));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PACKAGE_HAS_NO_CONTENT%' THEN
      RAISE EXCEPTION 'LCIP02_EMPTY_PACKAGE_WRONG_ERROR: %', SQLERRM;
    END IF;
    v_rejected := true;
  END;

  IF NOT v_rejected THEN
    RAISE EXCEPTION 'LCIP02_EMPTY_PACKAGE_WAS_ACCEPTED';
  END IF;

  RAISE NOTICE 'LCIP02 manifest proof passed.';
END $$;
