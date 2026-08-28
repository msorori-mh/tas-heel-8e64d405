-- LESSON_COMPONENT_INDEPENDENT_PUBLISHING_02 — PG17 proof.
--
-- Runs at the end of the CF04–CF11 rehearsal, after both LCIP-02 migrations. The
-- whole proof lives here rather than in the Content V3 job because it needs the CF10
-- and CF11 chain: lesson_is_editorially_managed, lesson_student_content_gate,
-- cf11_lifecycle_capabilities and v3_capability_snapshot all come from it.
--
-- Everything below builds on rows the rehearsal already created — the CHEM-G12
-- subject and the fully published Iron lesson — so no table shape is assumed.

-- =====================================================================================
-- 1) Visibility: a lesson opens on ONE published component and never leaks the rest.
-- =====================================================================================
DO $$
DECLARE
  v_subject uuid := '42000000-0000-0000-0000-000000000012';  -- CHEM-G12, from the fixture
  v_lesson  uuid := '43000000-0000-0000-0000-0000000000a1';
  v_visible boolean;
  v_ready   text[];
BEGIN
  INSERT INTO public.lessons(id, slug, subject_id, unit_id, title, is_free, semester, sort_order)
  VALUES (v_lesson, 'lcip02-visibility', v_subject, NULL, 'LCIP-02 visibility', true, 1, 90)
  ON CONFLICT (id) DO NOTHING;

  -- A lesson whose only authored component is still DRAFT stays hidden.
  INSERT INTO public.lesson_capability_lifecycle (lesson_id, capability, status, applicability)
  VALUES (v_lesson, 'officialBookContent', 'DRAFT', 'REQUIRED')
  ON CONFLICT (lesson_id, capability) DO UPDATE SET status = 'DRAFT';

  IF public.lesson_student_visible(v_lesson) THEN
    RAISE EXCEPTION 'LCIP02_DRAFT_ONLY_LESSON_IS_VISIBLE';
  END IF;

  -- A single READY component publishes the lesson on its own. This is the whole point:
  -- the other six are absent, and the lesson is still reachable.
  UPDATE public.lesson_capability_lifecycle
     SET status = 'READY', ready_at = now()
   WHERE lesson_id = v_lesson AND capability = 'officialBookContent';

  IF NOT public.lesson_student_visible(v_lesson) THEN
    RAISE EXCEPTION 'LCIP02_SINGLE_READY_COMPONENT_STILL_HIDDEN';
  END IF;

  -- A sibling in DRAFT and a sibling in REVIEW must not leak into the readable set
  -- just because the lesson opened.
  INSERT INTO public.lesson_capability_lifecycle (lesson_id, capability, status, applicability)
  VALUES (v_lesson, 'quickReview', 'DRAFT', 'REQUIRED'),
         (v_lesson, 'mindMap', 'REVIEW', 'REQUIRED')
  ON CONFLICT (lesson_id, capability) DO UPDATE SET status = EXCLUDED.status;

  SELECT ready_capabilities INTO v_ready FROM public.lesson_student_content_gate(v_lesson);
  IF v_ready IS DISTINCT FROM ARRAY['officialBookContent']::text[] THEN
    RAISE EXCEPTION 'LCIP02_GATE_LEAKED_UNREADY_COMPONENTS: [%]', array_to_string(v_ready, ',');
  END IF;

  -- Publishing a second component adds it without disturbing the first.
  UPDATE public.lesson_capability_lifecycle
     SET status = 'READY', ready_at = now()
   WHERE lesson_id = v_lesson AND capability = 'mindMap';

  SELECT ready_capabilities INTO v_ready FROM public.lesson_student_content_gate(v_lesson);
  IF v_ready IS DISTINCT FROM ARRAY['mindMap','officialBookContent']::text[] THEN
    RAISE EXCEPTION 'LCIP02_SECOND_COMPONENT_NOT_INDEPENDENT: [%]', array_to_string(v_ready, ',');
  END IF;

  -- Demoting one published component must not unpublish the other.
  UPDATE public.lesson_capability_lifecycle
     SET status = 'DRAFT', ready_at = NULL
   WHERE lesson_id = v_lesson AND capability = 'officialBookContent';

  IF NOT public.lesson_student_visible(v_lesson) THEN
    RAISE EXCEPTION 'LCIP02_SIBLING_DEMOTION_HID_THE_LESSON';
  END IF;
  SELECT ready_capabilities INTO v_ready FROM public.lesson_student_content_gate(v_lesson);
  IF v_ready IS DISTINCT FROM ARRAY['mindMap']::text[] THEN
    RAISE EXCEPTION 'LCIP02_DEMOTED_COMPONENT_STILL_READABLE: [%]', array_to_string(v_ready, ',');
  END IF;

  -- When every component falls back to DRAFT the lesson closes again.
  UPDATE public.lesson_capability_lifecycle
     SET status = 'DRAFT', ready_at = NULL WHERE lesson_id = v_lesson;
  IF public.lesson_student_visible(v_lesson) THEN
    RAISE EXCEPTION 'LCIP02_LESSON_STAYED_VISIBLE_WITH_NOTHING_READY';
  END IF;

  RAISE NOTICE 'LCIP02 visibility proof passed.';
END $$;

-- =====================================================================================
-- 2) The authored-subset helper is the whole basis of the CF11 relaxation, so it is
--    proved against real rows: nothing authored versus the fixture's published lesson.
-- =====================================================================================
DO $$
DECLARE
  v_subject uuid := '42000000-0000-0000-0000-000000000012';
  v_bare    uuid := '43000000-0000-0000-0000-0000000000a2';
  v_iron    uuid := '43000000-0000-0000-0000-000000000012';  -- published by the rehearsal
  v_authored text[];
BEGIN
  INSERT INTO public.lessons(id, slug, subject_id, unit_id, title, is_free, semester, sort_order)
  VALUES (v_bare, 'lcip02-bare', v_subject, NULL, 'LCIP-02 bare', true, 1, 91)
  ON CONFLICT (id) DO NOTHING;

  -- Nothing authored at all: the helper must be empty, which is what makes
  -- CF11_NO_AUTHORED_CAPABILITY reachable instead of a silent empty publication.
  v_authored := public.cf11_authored_capabilities(v_bare);
  IF array_length(v_authored, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'LCIP02_EMPTY_LESSON_REPORTED_AUTHORED: [%]', array_to_string(v_authored, ',');
  END IF;

  -- The lesson the rehearsal actually published carries content, so the helper must
  -- name capabilities for it. An always-empty helper would silently disable CF11.
  v_authored := public.cf11_authored_capabilities(v_iron);
  IF array_length(v_authored, 1) IS NULL THEN
    RAISE EXCEPTION 'LCIP02_PUBLISHED_LESSON_REPORTED_NOTHING_AUTHORED';
  END IF;
  IF NOT ('officialBookContent' = ANY (v_authored)) THEN
    RAISE EXCEPTION 'LCIP02_AUTHORED_SUBSET_MISSING_BOOK_CONTENT: [%]',
      array_to_string(v_authored, ',');
  END IF;

  -- Whatever it names must be a subset of the canonical seven, never a foreign name.
  IF EXISTS (SELECT 1 FROM unnest(v_authored) AS t(c)
              WHERE NOT (t.c = ANY (public.cf11_lifecycle_capabilities()))) THEN
    RAISE EXCEPTION 'LCIP02_AUTHORED_SUBSET_NOT_CANONICAL: [%]', array_to_string(v_authored, ',');
  END IF;

  RAISE NOTICE 'LCIP02 authored-subset proof passed.';
END $$;

-- =====================================================================================
-- 3) The CF11 READY path must still refuse everything it refused before. These are the
--    guards the relaxation must not have widened, asserted on the DEPLOYED body.
-- =====================================================================================
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

-- =====================================================================================
-- 4) Staging: a package describing the seven records but carrying ONE file is accepted,
--    and one carrying none is refused.
-- =====================================================================================
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
      (SELECT jsonb_agg(a || jsonb_build_object('sourcePath', NULL, 'sha256', NULL))
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
