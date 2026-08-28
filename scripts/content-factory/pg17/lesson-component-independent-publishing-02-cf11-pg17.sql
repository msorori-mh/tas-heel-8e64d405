-- LESSON_COMPONENT_INDEPENDENT_PUBLISHING_02 — CF11 half of the PG17 proof.
--
-- Runs at the end of the CF04–CF11 rehearsal, where the whole publication chain
-- exists. The other half (visibility gate + staged manifest) runs in the Content V3
-- job, which does not build CF11 and therefore cannot exercise this.
--
-- Proves the authored-subset helper and that the relaxation did not widen any guard.

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

