-- =============================================================================
-- G1_PUBLISHED_REVISION_TARGET_BINDING_11 — runtime smoke
--
-- Exercises the full binding matrix on a disposable PostgreSQL 17 cluster after
-- the exact migration chain + the pending stage-11 migration.
--
-- Every check raises NOTICE 'PASS ...' or aborts the script.
-- =============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Actor: full admin (qb_has_capability short-circuits on is_full_admin).
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'staff@example.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin')
ON CONFLICT DO NOTHING;

SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- Curriculum: subject > unit > lesson_u  AND  subject > lesson_direct (no unit)
-- ---------------------------------------------------------------------------
INSERT INTO public.curriculum_tracks (id, track_name, track_code) VALUES
  ('22222222-0000-0000-0000-000000000001', 'Aden', 'aden') ON CONFLICT DO NOTHING;
INSERT INTO public.grades (id, slug, name, curriculum_track_id) VALUES
  ('22222222-0000-0000-0000-000000000002', 'g12', 'Grade 12', '22222222-0000-0000-0000-000000000001')
  ON CONFLICT DO NOTHING;
INSERT INTO public.subjects (id, grade_id, slug, name, code) VALUES
  ('22222222-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000002', 'phys', 'Physics', 'G11-SUB-PHY')
  ON CONFLICT DO NOTHING;
INSERT INTO public.units (id, subject_id, code, title) VALUES
  ('22222222-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000003', 'U1', 'Unit 1')
  ON CONFLICT DO NOTHING;
INSERT INTO public.lessons (id, subject_id, unit_id, slug, title) VALUES
  ('22222222-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000003',
   '22222222-0000-0000-0000-000000000004', 'l1', 'Lesson 1'),
  ('22222222-0000-0000-0000-000000000006', '22222222-0000-0000-0000-000000000003',
   NULL, 'l2-direct', 'Lesson 2 (no unit)')
  ON CONFLICT DO NOTHING;
INSERT INTO public.lesson_assessments (id, lesson_id, title) VALUES
  ('22222222-0000-0000-0000-000000000007', '22222222-0000-0000-0000-000000000005', 'Quiz L1'),
  ('22222222-0000-0000-0000-000000000008', '22222222-0000-0000-0000-000000000006', 'Quiz L2')
  ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Helper: create a question + DRAFT revision with 2 options, return ids.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.mk_question(p_code text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_qid uuid;
BEGIN
  INSERT INTO public.questions (code, question_text, options, correct_index, question_type, created_by)
  VALUES (p_code, 'Q ' || p_code, '[]'::jsonb, -1, 'lesson', auth.uid())
  RETURNING id INTO v_qid;
  RETURN v_qid;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.mk_revision(p_qid uuid, p_text text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_rev uuid; v_num int;
BEGIN
  SELECT COALESCE(max(revision_number), 0) + 1 INTO v_num
  FROM public.question_revisions WHERE question_id = p_qid;

  INSERT INTO public.question_revisions (
    question_id, revision_number, status, interaction_type, grading_mode,
    question_text, max_score, allow_partial, requires_media, manual_grading_required, created_by
  ) VALUES (
    p_qid, v_num, 'DRAFT', 'SINGLE_CHOICE', 'AUTO_SINGLE', p_text, 1, false, false, false, auth.uid()
  ) RETURNING id INTO v_rev;

  INSERT INTO public.question_options (question_revision_id, option_code, body, sort_order, is_correct)
  VALUES (v_rev, 'OPT_1', 'a', 1, true), (v_rev, 'OPT_2', 'b', 2, false);

  RETURN v_rev;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.approve_and_publish(p_qid uuid, p_rev uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_cur uuid;
BEGIN
  PERFORM public.compute_and_set_revision_payload_hash(p_rev);
  UPDATE public.question_revisions SET status = 'APPROVED' WHERE id = p_rev;
  SELECT current_published_revision_id INTO v_cur FROM public.questions WHERE id = p_qid;
  PERFORM public.publish_question_revision(p_qid, p_rev, v_cur, 'idem-' || p_rev::text);
END $$;

-- ===========================================================================
-- S1 — publish gate: revision without any target cannot be published.
-- ===========================================================================
DO $$
DECLARE v_q uuid; v_r uuid;
BEGIN
  v_q := pg_temp.mk_question('SMOKE-NOTARGET');
  v_r := pg_temp.mk_revision(v_q, 'no target');
  BEGIN
    PERFORM pg_temp.approve_and_publish(v_q, v_r);
    RAISE EXCEPTION 'S1 FAIL: publish succeeded without a target';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%QB_PUBLISH_TARGET_REQUIRED%' THEN
      RAISE NOTICE 'PASS S1 publish denied without target';
    ELSE RAISE; END IF;
  END;
END $$;

-- ===========================================================================
-- S2 — publish gate: exactly one primary target (zero / two primaries denied).
-- ===========================================================================
DO $$
DECLARE v_q uuid; v_r uuid;
BEGIN
  v_q := pg_temp.mk_question('SMOKE-PRIMARY');
  v_r := pg_temp.mk_revision(v_q, 'primaries');
  INSERT INTO public.question_targets (question_id, revision_id, target_type, subject_id, unit_id, lesson_id, is_primary)
  VALUES (v_q, v_r, 'LESSON', '22222222-0000-0000-0000-000000000003',
          '22222222-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000005', false);

  BEGIN
    PERFORM pg_temp.approve_and_publish(v_q, v_r);
    RAISE EXCEPTION 'S2 FAIL: publish succeeded with zero primary targets';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%QB_PUBLISH_PRIMARY_TARGET_REQUIRED%' THEN
      RAISE NOTICE 'PASS S2a publish denied with 0 primary targets';
    ELSE RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.question_targets (question_id, revision_id, target_type, subject_id, is_primary)
    VALUES (v_q, v_r, 'SUBJECT', '22222222-0000-0000-0000-000000000003', true);
    INSERT INTO public.question_targets (question_id, revision_id, target_type, subject_id, unit_id, is_primary)
    VALUES (v_q, v_r, 'UNIT', '22222222-0000-0000-0000-000000000003',
            '22222222-0000-0000-0000-000000000004', true);
    RAISE EXCEPTION 'S2 FAIL: two primary targets accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS S2b second primary target on the same revision rejected by unique index';
  END;
END $$;

-- ===========================================================================
-- S3 — cross-question target is impossible (composite FK).
-- ===========================================================================
DO $$
DECLARE v_q1 uuid; v_q2 uuid; v_r1 uuid;
BEGIN
  v_q1 := pg_temp.mk_question('SMOKE-XQ1');
  v_q2 := pg_temp.mk_question('SMOKE-XQ2');
  v_r1 := pg_temp.mk_revision(v_q1, 'x1');
  BEGIN
    INSERT INTO public.question_targets (question_id, revision_id, target_type, subject_id, is_primary)
    VALUES (v_q2, v_r1, 'SUBJECT', '22222222-0000-0000-0000-000000000003', true);
    RAISE EXCEPTION 'S3 FAIL: target bound to another question''s revision';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS S3 cross-question revision target rejected by composite FK';
  END;
END $$;

-- ===========================================================================
-- S4 — the binding matrix.
-- ===========================================================================
DO $$
DECLARE
  v_q uuid; v_r1 uuid; v_r2 uuid;
  v_lesson uuid := '22222222-0000-0000-0000-000000000005';
  v_lesson2 uuid := '22222222-0000-0000-0000-000000000006';
  v_assess uuid := '22222222-0000-0000-0000-000000000007';
  v_assess2 uuid := '22222222-0000-0000-0000-000000000008';
  v_subject uuid := '22222222-0000-0000-0000-000000000003';
  v_unit uuid := '22222222-0000-0000-0000-000000000004';
  v_link uuid;
BEGIN
  v_q := pg_temp.mk_question('SMOKE-MATRIX');
  v_r1 := pg_temp.mk_revision(v_q, 'rev 1');
  INSERT INTO public.question_targets (question_id, revision_id, target_type, subject_id, unit_id, lesson_id, is_primary)
  VALUES (v_q, v_r1, 'LESSON', v_subject, v_unit, v_lesson, true);

  -- S4a draft question → binding DENIED
  BEGIN
    INSERT INTO public.assessment_questions (assessment_id, question_id) VALUES (v_assess, v_q);
    RAISE EXCEPTION 'S4a FAIL: draft question bound to an assessment';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE '%QUESTION_PUBLISH_REQUIRED%' THEN
      RAISE NOTICE 'PASS S4a draft question binding denied (QUESTION_PUBLISH_REQUIRED)';
    ELSE RAISE; END IF;
  END;

  -- publish revision 1
  PERFORM pg_temp.approve_and_publish(v_q, v_r1);

  -- S4b published revision + matching target → PASS
  INSERT INTO public.assessment_questions (assessment_id, question_id)
  VALUES (v_assess, v_q) RETURNING id INTO v_link;
  RAISE NOTICE 'PASS S4b published revision + matching target accepted';

  -- S4c published revision, assessment on a lesson with NO matching target → DENIED
  BEGIN
    INSERT INTO public.assessment_questions (assessment_id, question_id) VALUES (v_assess2, v_q);
    RAISE EXCEPTION 'S4c FAIL: binding accepted without a matching target';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE '%QUESTION_TARGET_MISMATCH%' THEN
      RAISE NOTICE 'PASS S4c non-matching lesson binding denied (QUESTION_TARGET_MISMATCH)';
    ELSE RAISE; END IF;
  END;

  -- S4d targets of the PUBLISHED revision are immutable
  BEGIN
    UPDATE public.question_targets SET lesson_id = v_lesson2 WHERE revision_id = v_r1;
    RAISE EXCEPTION 'S4d FAIL: published revision target was edited';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%QB_TARGET_IMMUTABLE_REVISION%' THEN
      RAISE NOTICE 'PASS S4d published revision targets immutable';
    ELSE RAISE; END IF;
  END;

  -- S4e a NEWER DRAFT with a different target does NOT change eligibility
  v_r2 := pg_temp.mk_revision(v_q, 'rev 2');
  INSERT INTO public.question_targets (question_id, revision_id, target_type, subject_id, lesson_id, is_primary)
  VALUES (v_q, v_r2, 'LESSON', v_subject, v_lesson2, true);

  BEGIN
    INSERT INTO public.assessment_questions (assessment_id, question_id) VALUES (v_assess2, v_q);
    RAISE EXCEPTION 'S4e FAIL: draft-revision target granted a binding';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE '%QUESTION_TARGET_MISMATCH%' THEN
      RAISE NOTICE 'PASS S4e newer-draft target ignored while it is not published';
    ELSE RAISE; END IF;
  END;

  -- S4f publishing the newer revision switches eligibility to its own target
  PERFORM pg_temp.approve_and_publish(v_q, v_r2);

  INSERT INTO public.assessment_questions (assessment_id, question_id) VALUES (v_assess2, v_q);
  RAISE NOTICE 'PASS S4f newly published revision target accepted (direct-subject lesson, no unit)';

  BEGIN
    DELETE FROM public.assessment_questions WHERE id = v_link;
    INSERT INTO public.assessment_questions (assessment_id, question_id) VALUES (v_assess, v_q);
    RAISE EXCEPTION 'S4g FAIL: superseded-revision target still grants a binding';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE '%QUESTION_TARGET_MISMATCH%' THEN
      RAISE NOTICE 'PASS S4g superseded revision target no longer grants new bindings';
    ELSE RAISE; END IF;
  END;

  -- S4h superseded revision targets stay historical and immutable
  IF NOT EXISTS (
    SELECT 1 FROM public.question_targets t
    JOIN public.question_revisions r ON r.id = t.revision_id
    WHERE t.revision_id = v_r1 AND r.status = 'SUPERSEDED'
  ) THEN
    RAISE EXCEPTION 'S4h FAIL: history lost for the superseded revision';
  END IF;

  BEGIN
    DELETE FROM public.question_targets WHERE revision_id = v_r1;
    RAISE EXCEPTION 'S4h FAIL: superseded revision target deleted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%QB_TARGET_IMMUTABLE_REVISION%' THEN
      RAISE NOTICE 'PASS S4h superseded revision targets are immutable history';
    ELSE RAISE; END IF;
  END;

  -- S4i legacy question columns are never populated nor consulted
  IF EXISTS (
    SELECT 1 FROM public.questions q
    WHERE q.id = v_q AND (q.lesson_id IS NOT NULL OR q.subject_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'S4i FAIL: legacy binding columns were populated';
  END IF;
  RAISE NOTICE 'PASS S4i legacy questions.lesson_id/subject_id remain unused';
END $$;

-- ===========================================================================
-- S5 — legacy columns cannot rescue a binding (fail-closed proof).
-- ===========================================================================
DO $$
DECLARE v_q uuid;
BEGIN
  v_q := pg_temp.mk_question('SMOKE-LEGACY');
  UPDATE public.questions
     SET lesson_id = '22222222-0000-0000-0000-000000000005',
         subject_id = '22222222-0000-0000-0000-000000000003'
   WHERE id = v_q;

  BEGIN
    INSERT INTO public.assessment_questions (assessment_id, question_id)
    VALUES ('22222222-0000-0000-0000-000000000007', v_q);
    RAISE EXCEPTION 'S5 FAIL: legacy lesson_id granted a binding';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE '%QUESTION_PUBLISH_REQUIRED%' THEN
      RAISE NOTICE 'PASS S5 legacy lesson_id/subject_id cannot grant a binding';
    ELSE RAISE; END IF;
  END;
END $$;

-- ===========================================================================
-- S6 — retarget_question works on a draft revision and refuses published ones.
-- ===========================================================================
DO $$
DECLARE v_q uuid; v_r1 uuid; v_r2 uuid; v_res jsonb;
BEGIN
  v_q := pg_temp.mk_question('SMOKE-RETARGET');
  v_r1 := pg_temp.mk_revision(v_q, 'rt 1');

  v_res := public.retarget_question(
    v_q, v_r1,
    jsonb_build_array(jsonb_build_object(
      'target_type', 'LESSON',
      'subject_id', '22222222-0000-0000-0000-000000000003',
      'unit_id', '22222222-0000-0000-0000-000000000004',
      'lesson_id', '22222222-0000-0000-0000-000000000005',
      'is_primary', true)),
    'initial targeting');

  IF (v_res->>'success')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'S6 FAIL: retarget on draft failed';
  END IF;
  RAISE NOTICE 'PASS S6a retarget_question binds targets to the draft revision';

  -- LESSON target without unit_id is accepted (direct-subject lesson)
  PERFORM public.retarget_question(
    v_q, v_r1,
    jsonb_build_array(jsonb_build_object(
      'target_type', 'LESSON',
      'subject_id', '22222222-0000-0000-0000-000000000003',
      'lesson_id', '22222222-0000-0000-0000-000000000006',
      'is_primary', true)),
    'direct-subject lesson');
  RAISE NOTICE 'PASS S6b LESSON target without unit_id accepted';

  PERFORM public.retarget_question(
    v_q, v_r1,
    jsonb_build_array(jsonb_build_object(
      'target_type', 'LESSON',
      'subject_id', '22222222-0000-0000-0000-000000000003',
      'unit_id', '22222222-0000-0000-0000-000000000004',
      'lesson_id', '22222222-0000-0000-0000-000000000005',
      'is_primary', true)),
    'back to unit lesson');

  PERFORM pg_temp.approve_and_publish(v_q, v_r1);

  BEGIN
    PERFORM public.retarget_question(
      v_q, v_r1,
      jsonb_build_array(jsonb_build_object(
        'target_type', 'SUBJECT',
        'subject_id', '22222222-0000-0000-0000-000000000003',
        'is_primary', true)),
      'should fail');
    RAISE EXCEPTION 'S6 FAIL: retarget on a published revision succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%immutable%' THEN
      RAISE NOTICE 'PASS S6c retarget_question refuses published revisions';
    ELSE RAISE; END IF;
  END;
END $$;

-- ===========================================================================
-- S7 — structural assertions.
-- ===========================================================================
DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
        WHERE table_schema='public' AND table_name='question_targets'
          AND column_name='revision_id' AND is_nullable='NO') <> 1 THEN
    RAISE EXCEPTION 'S7 FAIL: revision_id column missing or nullable';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='question_targets_revision_question_fk') THEN
    RAISE EXCEPTION 'S7 FAIL: composite FK missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='question_targets_shape_chk') THEN
    RAISE EXCEPTION 'S7 FAIL: target shape CHECK missing';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
               AND indexname IN ('question_targets_dedupe_uidx','question_targets_one_primary_uidx')) THEN
    RAISE EXCEPTION 'S7 FAIL: question-scoped uniqueness indexes still present';
  END IF;

  IF (SELECT count(*) FROM pg_indexes WHERE schemaname='public'
        AND indexname IN ('question_targets_revision_dedupe_uidx',
                          'question_targets_one_primary_per_revision_uidx')) <> 2 THEN
    RAISE EXCEPTION 'S7 FAIL: revision-scoped uniqueness indexes missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='retarget_question'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, jsonb, text'
  ) THEN
    RAISE EXCEPTION 'S7 FAIL: legacy 3-argument retarget_question still exists';
  END IF;

  IF (SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='validate_assessment_question_link')
     LIKE '%q_lesson_id%' THEN
    RAISE EXCEPTION 'S7 FAIL: legacy assessment link validator still installed';
  END IF;

  RAISE NOTICE 'PASS S7 structural assertions';
END $$;

-- ===========================================================================
-- S8 — cascade cleanup still works (teardown must not be blocked).
-- ===========================================================================
DO $$
DECLARE v_q uuid; v_r uuid;
BEGIN
  v_q := pg_temp.mk_question('SMOKE-CASCADE');
  v_r := pg_temp.mk_revision(v_q, 'cascade');
  INSERT INTO public.question_targets (question_id, revision_id, target_type, subject_id, is_primary)
  VALUES (v_q, v_r, 'SUBJECT', '22222222-0000-0000-0000-000000000003', true);

  DELETE FROM public.question_revisions WHERE id = v_r;
  IF EXISTS (SELECT 1 FROM public.question_targets WHERE revision_id = v_r) THEN
    RAISE EXCEPTION 'S8 FAIL: targets survived revision deletion';
  END IF;
  DELETE FROM public.questions WHERE id = v_q;
  RAISE NOTICE 'PASS S8 cascade delete of a draft revision removes its targets';
END $$;

-- ===========================================================================
-- S9 — real workflow: Template 09 ingest -> DRAFT -> approve -> publish
--      -> Template 08 assessment binding.
-- ===========================================================================
DO $$
DECLARE
  v_job uuid; v_row uuid; v_payload jsonb; v_res jsonb;
  v_qid uuid; v_rev uuid;
BEGIN
  INSERT INTO public.import_jobs (created_by, import_type, execution_state)
  VALUES (auth.uid(), 'questions', 'applying') RETURNING id INTO v_job;

  v_payload := jsonb_build_object(
    'question_code', 'SMOKE-T09-1',
    'question_text', 'imported question',
    'subject_code', 'G11-SUB-PHY',
    'lesson_code', 'l1',
    'option_1', 'a', 'option_2', 'b',
    'correct_index', '1'
  );

  INSERT INTO public.import_staging_rows (job_id, template_key, row_number, payload, row_hash, is_valid)
  VALUES (v_job, 'questions', 1, v_payload, public._qb_import_row_hash(v_payload), true)
  RETURNING id INTO v_row;

  v_res := public.qb_import_ingest_revision(v_row);
  v_qid := (v_res->>'question_id')::uuid;
  v_rev := (v_res->>'revision_id')::uuid;

  IF NOT EXISTS (
    SELECT 1 FROM public.question_revisions WHERE id = v_rev AND status = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'S9 FAIL: ingest did not produce a DRAFT revision';
  END IF;
  RAISE NOTICE 'PASS S9a template 09 ingest creates a DRAFT revision';

  IF NOT EXISTS (
    SELECT 1 FROM public.question_targets
    WHERE revision_id = v_rev AND question_id = v_qid
      AND target_type = 'LESSON' AND is_primary
  ) THEN
    RAISE EXCEPTION 'S9 FAIL: ingest target not bound to the draft revision as primary';
  END IF;
  RAISE NOTICE 'PASS S9b ingest binds the target to that exact draft revision (primary)';

  -- Template 08 must still refuse the question while it is only a draft.
  BEGIN
    INSERT INTO public.assessment_questions (assessment_id, question_id)
    VALUES ('22222222-0000-0000-0000-000000000007', v_qid);
    RAISE EXCEPTION 'S9 FAIL: imported draft question was bindable';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE '%QUESTION_PUBLISH_REQUIRED%' THEN
      RAISE NOTICE 'PASS S9c imported draft is not bindable by template 08';
    ELSE RAISE; END IF;
  END;

  -- Review -> approve -> publish, then template 08 succeeds.
  UPDATE public.question_revisions SET status = 'READY_FOR_REVIEW' WHERE id = v_rev;
  PERFORM pg_temp.approve_and_publish(v_qid, v_rev);

  INSERT INTO public.assessment_questions (assessment_id, question_id)
  VALUES ('22222222-0000-0000-0000-000000000007', v_qid);
  RAISE NOTICE 'PASS S9d after publish, template 08 binding succeeds on the targeted lesson';

  UPDATE public.import_jobs SET execution_state = 'succeeded' WHERE id = v_job;
END $$;
