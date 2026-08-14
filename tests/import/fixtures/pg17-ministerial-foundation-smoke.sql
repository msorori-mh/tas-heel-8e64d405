-- =============================================================================
-- PAST_MINISTERIAL_EXAMS_FOUNDATION_14B — runtime smoke
--
-- Exercises guards, gates, snapshot isolation, and track separation on a
-- disposable PostgreSQL 17 cluster after the migration chain + 14B.
-- =============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Actors
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'staff@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'student@example.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'content_manager')
ON CONFLICT DO NOTHING;

-- Capability grants required by the question-bank publish guard.
INSERT INTO public.question_bank_capability_grants (user_id, capability, scope_type, scope_id, granted_by, reason)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'PUBLISH_QUESTION_REVISION', 'GLOBAL', NULL, '11111111-1111-1111-1111-111111111111', 'smoke test grant'),
  ('11111111-1111-1111-1111-111111111111', 'EDIT_QUESTION_BANK', 'GLOBAL', NULL, '11111111-1111-1111-1111-111111111111', 'smoke test grant')
ON CONFLICT DO NOTHING;

INSERT INTO public.curriculum_tracks (id, track_name, track_code) VALUES
  ('33333333-0000-0000-0000-000000000001', 'Aden', 'aden'),
  ('33333333-0000-0000-0000-000000000002', 'Sanaa', 'sanaa')
ON CONFLICT DO NOTHING;

INSERT INTO public.grades (id, slug, name, curriculum_track_id) VALUES
  ('33333333-0000-0000-0000-000000000003', 'g12', 'Grade 12', '33333333-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Subject shared across both tracks (TCS-2 identity)
INSERT INTO public.subjects (id, grade_id, slug, name, code) VALUES
  ('33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000003', 'phys', 'Physics', 'sub-g12-001')
ON CONFLICT DO NOTHING;

-- Map physics to Aden only for the main test scenario; Sanaa mapping added later for the variant gate test.
INSERT INTO public.subject_curriculum_tracks (subject_id, curriculum_track_id, is_active, created_by)
VALUES ('33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000001', true, '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

-- Student profile: Grade 12, Aden track
INSERT INTO public.profiles (user_id, full_name, grade_id, grade_uuid, curriculum_track_id) VALUES
  ('22222222-2222-2222-2222-222222222222', 'Student Aden', 'g12', '33333333-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.mk_question(p_code text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_qid uuid;
BEGIN
  INSERT INTO public.questions (code, question_text, options, correct_index, question_type, subject_id, created_by)
  VALUES (p_code, 'Q ' || p_code, '[]'::jsonb, -1, 'lesson', '33333333-0000-0000-0000-000000000004', auth.uid())
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
  VALUES (v_rev, 'A', 'Option A', 0, true), (v_rev, 'B', 'Option B', 1, false);

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

-- ---------------------------------------------------------------------------
-- 1. Create a question with a published revision
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_q uuid; v_r uuid;
BEGIN
  SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  v_q := pg_temp.mk_question('q-phys-00001');
  v_r := pg_temp.mk_revision(v_q, 'What is the unit of force?');
  PERFORM pg_temp.approve_and_publish(v_q, v_r);
  RAISE NOTICE 'PASS 1 published question and revision';
END $$;

-- ---------------------------------------------------------------------------
-- 2. Create a ministry exam template with one question
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tpl uuid;
  v_q uuid;
BEGIN
  SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  SELECT id INTO v_q FROM public.questions WHERE code = 'q-phys-00001';

  INSERT INTO public.exam_templates (
    title, mode, subject_id, duration_seconds, is_active, created_by
  ) VALUES (
    'Physics 2024 Aden Round 1', 'ministry', '33333333-0000-0000-0000-000000000004', 7200, true, auth.uid()
  ) RETURNING id INTO v_tpl;

  INSERT INTO public.exam_template_questions (template_id, question_id, sort_order, points)
  VALUES (v_tpl, v_q, 1, 1);

  RAISE NOTICE 'PASS 2 ministry exam template created';
END $$;

-- ---------------------------------------------------------------------------
-- 3. MODEL_VALIDITY_GATE: reject model for track not mapped to subject
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tpl uuid;
  v_err text;
BEGIN
  SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  SELECT id INTO v_tpl FROM public.exam_templates WHERE title = 'Physics 2024 Aden Round 1';

  BEGIN
    INSERT INTO public.ministerial_exam_models (
      template_id, subject_id, curriculum_track_id, academic_year, round_code, variant_code, model_code, created_by
    ) VALUES (
      v_tpl, '33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000002',
      2024, 'r1', 'a', 'mex-g12-aden-001-2024-r1-a', auth.uid()
    );
    RAISE EXCEPTION 'FAIL 3 MODEL_VALIDITY_GATE did not block unmapped track';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err LIKE '%MODEL_VALIDITY_GATE%' THEN
      RAISE NOTICE 'PASS 3 MODEL_VALIDITY_GATE blocked unmapped track';
    ELSE
      RAISE EXCEPTION 'FAIL 3 unexpected error: %', v_err;
    END IF;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Create valid ministerial model for Aden track
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tpl uuid;
  v_model uuid;
BEGIN
  SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  SELECT id INTO v_tpl FROM public.exam_templates WHERE title = 'Physics 2024 Aden Round 1';

  INSERT INTO public.ministerial_exam_models (
    template_id, subject_id, curriculum_track_id, academic_year, round_code, variant_code, model_code, created_by
  ) VALUES (
    v_tpl, '33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000001',
    2024, 'r1', 'a', 'mex-g12-aden-001-2024-r1-a', auth.uid()
  ) RETURNING id INTO v_model;

  RAISE NOTICE 'PASS 4 valid ministerial model created: %', v_model;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Membership publishable gate: reject draft revision
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_model uuid;
  v_q uuid;
  v_draft uuid;
  v_err text;
BEGIN
  SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  SELECT id INTO v_model FROM public.ministerial_exam_models WHERE model_code = 'mex-g12-aden-001-2024-r1-a';
  SELECT id INTO v_q FROM public.questions WHERE code = 'q-phys-00001';

  v_draft := pg_temp.mk_revision(v_q, 'draft revision');

  BEGIN
    INSERT INTO public.ministerial_exam_questions (
      model_id, question_id, published_revision_id, sort_order, marks
    ) VALUES (v_model, v_q, v_draft, 1, 1);
    RAISE EXCEPTION 'FAIL 5 publishable gate did not block draft revision';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err LIKE '%MINISTERIAL_QUESTION_NOT_PUBLISHED%' THEN
      RAISE NOTICE 'PASS 5 membership publishable gate blocked draft revision';
    ELSE
      RAISE EXCEPTION 'FAIL 5 unexpected error: %', v_err;
    END IF;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Add valid published membership and publish the model
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_model uuid;
  v_q uuid;
  v_pub uuid;
BEGIN
  SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  SELECT id INTO v_model FROM public.ministerial_exam_models WHERE model_code = 'mex-g12-aden-001-2024-r1-a';
  SELECT id INTO v_q FROM public.questions WHERE code = 'q-phys-00001';
  SELECT current_published_revision_id INTO v_pub FROM public.questions WHERE id = v_q;

  INSERT INTO public.ministerial_exam_questions (
    model_id, question_id, published_revision_id, sort_order, marks
  ) VALUES (v_model, v_q, v_pub, 1, 1);

  PERFORM public.publish_ministerial_model(v_model);

  RAISE NOTICE 'PASS 6 model published successfully';
END $$;

-- ---------------------------------------------------------------------------
-- 7. Track separation: create a second student on Sanaa track and verify they cannot start Aden model
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_model uuid;
  v_err text;
BEGIN
  SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  SELECT id INTO v_model FROM public.ministerial_exam_models WHERE model_code = 'mex-g12-aden-001-2024-r1-a';

  INSERT INTO public.subject_curriculum_tracks (subject_id, curriculum_track_id, is_active, created_by)
  VALUES ('33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000002', true, auth.uid())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (user_id, full_name, grade_id, grade_uuid, curriculum_track_id) VALUES
    ('33333333-3333-3333-3333-333333333333', 'Student Sanaa', 'g12', '33333333-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000002')
  ON CONFLICT DO NOTHING;

  INSERT INTO auth.users (id, email) VALUES
    ('33333333-3333-3333-3333-333333333333', 'sanaa@example.test')
  ON CONFLICT DO NOTHING;

  SET request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
  BEGIN
    PERFORM public.create_ministerial_exam_session(v_model);
    RAISE EXCEPTION 'FAIL 7 track separation: Sanaa student started Aden model';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err LIKE '%curriculum_or_grade_mismatch%' THEN
      RAISE NOTICE 'PASS 7 track separation blocked Sanaa student from Aden model';
    ELSE
      RAISE EXCEPTION 'FAIL 7 unexpected error: %', v_err;
    END IF;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Student starts the ministerial exam session and snapshot is frozen
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_model uuid;
  v_session uuid;
  v_esq_count int;
  v_answer_count int;
  v_has_correct boolean;
BEGIN
  SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  SELECT id INTO v_model FROM public.ministerial_exam_models WHERE model_code = 'mex-g12-aden-001-2024-r1-a';

  v_session := public.create_ministerial_exam_session(v_model);

  SELECT COUNT(*) INTO v_esq_count FROM public.exam_session_questions WHERE exam_session_id = v_session;
  SELECT COUNT(*) INTO v_answer_count FROM public.exam_session_answers WHERE session_id = v_session;

  IF v_esq_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 8 expected 1 exam_session_question, got %', v_esq_count;
  END IF;
  IF v_answer_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 8 expected 1 exam_session_answer, got %', v_answer_count;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.exam_session_questions
    WHERE exam_session_id = v_session AND pin_mode = 'REVISION_PINNED'
  ) INTO v_has_correct;
  IF NOT v_has_correct THEN
    RAISE EXCEPTION 'FAIL 8 exam_session_question is not REVISION_PINNED';
  END IF;

  RAISE NOTICE 'PASS 8 student started ministerial session with frozen REVISION_PINNED snapshot';
END $$;

-- ---------------------------------------------------------------------------
-- 9. Legacy RPC start_exam_session must block ministry templates
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tpl uuid;
  v_err text;
BEGIN
  SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  SELECT id INTO v_tpl FROM public.exam_templates WHERE title = 'Physics 2024 Aden Round 1';

  BEGIN
    PERFORM public.start_exam_session(v_tpl);
    RAISE EXCEPTION 'FAIL 9 legacy start_exam_session allowed ministry template';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err LIKE '%MINISTRY_TEMPLATE_BYPASS_BLOCKED%' THEN
      RAISE NOTICE 'PASS 9 legacy RPC blocked ministry template bypass';
    ELSE
      RAISE EXCEPTION 'FAIL 9 unexpected error: %', v_err;
    END IF;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 10. RLS: student cannot SELECT from ministerial_exam_questions directly
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count int;
BEGIN
  SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  SELECT COUNT(*) INTO v_count FROM public.ministerial_exam_questions;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 10 student could read % rows from ministerial_exam_questions', v_count;
  END IF;
  RAISE NOTICE 'PASS 10 RLS blocked student direct read on ministerial_exam_questions';
END $$;

-- ---------------------------------------------------------------------------
-- 11. Publish gate: reject when template and membership mismatch
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tpl uuid;
  v_model uuid;
  v_q uuid;
  v_q2 uuid;
  v_pub uuid;
  v_err text;
BEGIN
  SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  v_q := pg_temp.mk_question('q-phys-00002');
  v_pub := pg_temp.mk_revision(v_q, 'Second question');
  PERFORM pg_temp.approve_and_publish(v_q, v_pub);

  INSERT INTO public.exam_templates (
    title, mode, subject_id, duration_seconds, is_active, created_by
  ) VALUES (
    'Physics 2024 Aden Round 1 Variant B', 'ministry', '33333333-0000-0000-0000-000000000004', 7200, true, auth.uid()
  ) RETURNING id INTO v_tpl;

  INSERT INTO public.exam_template_questions (template_id, question_id, sort_order, points)
  VALUES (v_tpl, v_q, 1, 1);

  INSERT INTO public.ministerial_exam_models (
    template_id, subject_id, curriculum_track_id, academic_year, round_code, variant_code, model_code, created_by
  ) VALUES (
    v_tpl, '33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000001',
    2024, 'r1', 'b', 'mex-g12-aden-001-2024-r1-b', auth.uid()
  ) RETURNING id INTO v_model;

  -- membership references a different question than template -> mismatch
  SELECT id INTO v_q2 FROM public.questions WHERE code = 'q-phys-00001';
  SELECT current_published_revision_id INTO v_pub FROM public.questions WHERE id = v_q2;

  INSERT INTO public.ministerial_exam_questions (model_id, question_id, published_revision_id, sort_order, marks)
  VALUES (v_model, v_q2, v_pub, 1, 1);

  BEGIN
    PERFORM public.publish_ministerial_model(v_model);
    RAISE EXCEPTION 'FAIL 11 publish gate allowed mismatched membership';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err LIKE '%MINISTERIAL_PUBLISH_GATE_FAILED%' THEN
      RAISE NOTICE 'PASS 11 publish gate rejected mismatched membership';
    ELSE
      RAISE EXCEPTION 'FAIL 11 unexpected error: %', v_err;
    END IF;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 12. Published model membership is immutable
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_model uuid;
  v_q uuid;
  v_pub uuid;
  v_err text;
BEGIN
  SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  SELECT id INTO v_model FROM public.ministerial_exam_models WHERE model_code = 'mex-g12-aden-001-2024-r1-a';
  SELECT id INTO v_q FROM public.questions WHERE code = 'q-phys-00001';
  SELECT current_published_revision_id INTO v_pub FROM public.questions WHERE id = v_q;

  BEGIN
    UPDATE public.ministerial_exam_questions SET marks = 2 WHERE model_id = v_model AND question_id = v_q;
    RAISE EXCEPTION 'FAIL 12 published membership mutation was allowed';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err LIKE '%MINISTERIAL_PUBLISHED_MEMBERSHIP_IMMUTABLE%' THEN
      RAISE NOTICE 'PASS 12 published membership is immutable';
    ELSE
      RAISE EXCEPTION 'FAIL 12 unexpected error: %', v_err;
    END IF;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 13. No answer leak in rendered snapshot
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_session uuid;
  v_options jsonb;
BEGIN
  SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  SELECT id INTO v_session FROM public.exam_sessions WHERE user_id = '22222222-2222-2222-2222-222222222222';

  SELECT rendered_options INTO v_options FROM public.exam_session_questions WHERE exam_session_id = v_session;
  IF v_options::text ILIKE '%is_correct%' THEN
    RAISE EXCEPTION 'FAIL 13 rendered options leaked correctness flag';
  END IF;
  IF v_options::text NOT ILIKE '%Option A%' THEN
    RAISE EXCEPTION 'FAIL 13 rendered options missing option bodies';
  END IF;

  RAISE NOTICE 'PASS 13 rendered snapshot does not leak correct answers';
END $$;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'SMOKE COMPLETE: all 13 checks passed';
END $$;
