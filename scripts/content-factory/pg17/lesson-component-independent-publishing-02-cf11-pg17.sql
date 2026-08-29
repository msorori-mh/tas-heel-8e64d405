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
-- 3b) LCIP-03: publishing a SECOND component must not demote the first.
--
--     The first partial publish worked; the second failed, because publish moved every
--     capability to REVIEW including the one already READY, and cf11_assert_demotion_allowed
--     refuses READY -> REVIEW. That is the defect that kept staff uploading all seven.
-- =====================================================================================
DO $$
DECLARE
  d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'golden_lesson_publish_cf11';
  IF d IS NULL THEN
    RAISE EXCEPTION 'LCIP03_PUBLISH_FUNCTION_MISSING';
  END IF;

  -- The transition loop must no longer demote an already published component.
  IF position('IS DISTINCT FROM ''READY'' THEN' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP03_PUBLISH_STILL_DEMOTES_READY';
  END IF;
  -- And the staged-set assertion must count READY as staged.
  IF position('status IN (''REVIEW'', ''READY'')' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP03_PUBLISH_REVIEW_SET_STILL_EXCLUDES_READY';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'golden_lesson_attest_cf11_ready';
  IF position('status IN (''REVIEW'', ''READY'')' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP03_ATTEST_REVIEW_SET_STILL_EXCLUDES_READY';
  END IF;

  -- The demotion guard itself must survive: un-publishing still needs a revocation.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname='public' AND p.proname='cf11_assert_demotion_allowed') THEN
    RAISE EXCEPTION 'LCIP03_DEMOTION_GUARD_LOST';
  END IF;

  RAISE NOTICE 'LCIP03 second-component publish proof passed.';
END $$;

-- The demotion guard must still refuse a real un-publish. Relaxing the publish path
-- must not have opened a way to pull a live component without a revocation ticket.
--
-- This must run against a lesson the guard actually governs. cf11_is_managed_lesson is
-- EXISTS(golden_lesson_publications), so a synthetic lesson with lifecycle rows but no
-- publication makes the guard return early — and a proof that passes with the guard
-- deleted proves nothing. Every early-exit branch is therefore asserted away first.
DO $$
DECLARE
  v_lesson uuid;
  v_refused boolean := false;
  v_purge_active boolean := false;
BEGIN
  SELECT lesson_id INTO v_lesson FROM public.golden_lesson_publications LIMIT 1;
  IF v_lesson IS NULL THEN
    RAISE EXCEPTION 'LCIP03_NO_MANAGED_LESSON: the rehearsal published nothing, so the demotion guard cannot be exercised';
  END IF;
  -- The purge escape hatch exists in production but not in this rehearsal, which never
  -- applies the prelaunch purge migrations. Probe for it dynamically so the assertion is
  -- real where the branch exists and silent where it cannot.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.proname = 'curriculum_prelaunch_purge_ticket_active') THEN
    EXECUTE 'SELECT public.curriculum_prelaunch_purge_ticket_active()' INTO v_purge_active;
    IF v_purge_active THEN
      RAISE EXCEPTION 'LCIP03_PURGE_TICKET_ACTIVE: the guard is globally disabled, the proof would be vacuous';
    END IF;
  END IF;
  IF public.cf11_has_revocation_ticket(v_lesson) THEN
    RAISE EXCEPTION 'LCIP03_REVOCATION_TICKET_OPEN: the guard is disabled for this lesson';
  END IF;

  BEGIN
    PERFORM public.cf11_assert_demotion_allowed(
      v_lesson, 'officialBookContent', 'READY', 'REVIEW', 'REQUIRED', 'lcip03-proof');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%CF11_DIRECT_TRANSITION_FORBIDDEN%' THEN
      RAISE EXCEPTION 'LCIP03_DEMOTION_GUARD_WRONG_ERROR: %', SQLERRM;
    END IF;
    v_refused := true;
  END;

  IF NOT v_refused THEN
    RAISE EXCEPTION 'LCIP03_DEMOTION_GUARD_NO_LONGER_REFUSES_UNPUBLISH';
  END IF;

  RAISE NOTICE 'LCIP03 demotion guard still refuses un-publish.';
END $$;

-- =====================================================================================
-- 3c) LCIP-04: a batch carrying ONE component must materialise, and must write NOTHING
--     for the other six.
--
--     CF10 rejected any staged capability whose payload was NULL:
--       IF entry.applicability = 'REQUIRED' AND payload_text IS NULL THEN
--         RAISE EXCEPTION 'CF10_EMPTY_PAYLOAD: %', entry.capability;
--     Staging always stages all seven, so uploading one component failed on the first
--     empty one. Removing that check alone was not enough: the book/explanation/summary
--     blocks had no NULL guard and would have inserted empty rows — an unauthored
--     component reaching the student as blank content.
-- =====================================================================================
DO $$
DECLARE
  d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'golden_lesson_materialize_domain_batch';
  IF d IS NULL THEN
    RAISE EXCEPTION 'LCIP04_MATERIALIZE_FUNCTION_MISSING';
  END IF;

  IF position('CF10_EMPTY_PAYLOAD' in d) > 0 THEN
    RAISE EXCEPTION 'LCIP04_STILL_REJECTS_PARTIAL_BATCH';
  END IF;

  -- The three blocks that previously had no NULL guard must all have one now, on both
  -- the insert and the hash-conflict branch. Anything less writes empty content.
  IF (SELECT count(*) FROM regexp_matches(d,
        'IF existing_hash IS NULL AND payload_text IS NOT NULL THEN', 'g')) <> 3 THEN
    RAISE EXCEPTION 'LCIP04_INSERT_NOT_GUARDED_ON_ALL_THREE';
  END IF;
  IF (SELECT count(*) FROM regexp_matches(d,
        'ELSIF payload_text IS NOT NULL AND existing_hash IS DISTINCT FROM', 'g')) <> 3 THEN
    RAISE EXCEPTION 'LCIP04_CONFLICT_NOT_GUARDED_ON_ALL_THREE';
  END IF;

  -- Everything that made CF10 safe must survive.
  IF position('cf10_assert_no_answer_leak' in d) = 0
     OR position('CF10_PAYLOAD_HASH_MISMATCH' in d) = 0
     OR position('CF10_IDENTITY_CONFLICT' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP04_CF10_GUARD_LOST';
  END IF;

  RAISE NOTICE 'LCIP04 partial-batch proof passed.';
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


-- ============================================================================
-- LCIP-07: the three CF10 changes have to hold at the same time
--
-- Each one alone is a regression the others hide:
--   * replacement without the NULL guard writes an unauthored component as NULL;
--   * the NULL guard without replacement is the CF10_CONTENT_HASH_CONFLICT wall;
--   * either one without CF09 binding lets an unbound batch overwrite live content.
--
-- Production reached this state by a different route than this chain does -- it got
-- 20260902010000 before 20260827010000, and scripts/content-factory/production/
-- cf10-managed-revision-backfill.sql reconciles the order. Both routes must end at
-- the function this block describes, so assert the destination, not the path.
-- ============================================================================
DO $lcip07$
DECLARE d text; n integer; tbl text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname = 'golden_lesson_materialize_domain_batch'
     AND p.oid::regprocedure::text =
       'golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)';
  IF d IS NULL THEN
    RAISE EXCEPTION 'LCIP07_FUNCTION_MISSING';
  END IF;

  -- 1. A component that was never uploaded is skipped, not rejected.
  IF position('CF10_EMPTY_PAYLOAD' in d) > 0 THEN
    RAISE EXCEPTION 'LCIP07_EMPTY_PAYLOAD_STILL_REJECTS';
  END IF;

  -- 2. ...and it is skipped at every conflict branch, so nothing is written as NULL.
  n := (length(d) - length(replace(d,
         'ELSIF payload_text IS NOT NULL AND existing_hash IS DISTINCT FROM new_hash', ''))) /
       length('ELSIF payload_text IS NOT NULL AND existing_hash IS DISTINCT FROM new_hash');
  IF n <> 3 THEN
    RAISE EXCEPTION 'LCIP07_NULL_GUARD_MISSING: % of 3 branches guarded', n;
  END IF;

  -- 3. A component that was uploaded before can be replaced, under compare-and-swap.
  FOREACH tbl IN ARRAY ARRAY['lesson_book_contents','lesson_explanations','lesson_summaries'] LOOP
    IF position('CF10_MANAGED_REVISION_TARGET_DRIFT: ' || tbl in d) = 0 THEN
      RAISE EXCEPTION 'LCIP07_REPLACEMENT_NOT_AVAILABLE: %', tbl;
    END IF;
  END LOOP;
  IF position('HASH_PINNED_COMPARE_AND_SWAP' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP07_REPLACEMENT_NOT_PINNED';
  END IF;

  -- 4. Only a CF09-bound batch may replace, and the refusal is still reachable.
  n := (length(d) - length(replace(d, 'IF binding_count IS DISTINCT FROM 1 THEN', ''))) /
       length('IF binding_count IS DISTINCT FROM 1 THEN');
  IF n < 3 THEN
    RAISE EXCEPTION 'LCIP07_REPLACEMENT_UNBOUND: % of 3 branches check the CF09 binding', n;
  END IF;
  IF position('CF10_CONTENT_HASH_CONFLICT' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP07_CONFLICT_REFUSAL_DELETED';
  END IF;

  -- 5. Questions and the answer layer stay versioned and closed.
  IF position('CF10_CONTENT_HASH_CONFLICT: questions' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP07_QUESTION_VERSIONING_LOST';
  END IF;
  IF position('cf10_assert_no_answer_leak' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP07_ANSWER_LEAK_GUARD_LOST';
  END IF;

  -- 6. The answers companion is required exactly when questions are in the batch.
  IF position('CF10_ANSWER_COMPANION_MISSING' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP07_COMPANION_GUARD_DELETED';
  END IF;
  IF position('OR (payloads->''selfTest''->>''text'') IS NOT NULL) THEN' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP07_COMPANION_GUARD_STILL_UNCONDITIONAL';
  END IF;

  RAISE NOTICE 'LCIP07 passed: upload one component, and replace one, on the same function.';
END $lcip07$;