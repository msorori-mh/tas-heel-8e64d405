-- TAMKEEN CONTENT V3 / 21H R3 runtime contract.
-- Disposable PG17 fixture only; the runner proves locality before execution.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_contract(p_condition boolean, p_name text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT COALESCE(p_condition, false) THEN
    RAISE EXCEPTION 'R3_RUNTIME_CONTRACT_FAIL: %', p_name;
  END IF;
  RAISE NOTICE 'R3_RUNTIME_CONTRACT_PASS: %', p_name;
END;
$$;

DO $$
DECLARE
  v_owner uuid := '10000000-0000-0000-0000-000000000001';
  v_other uuid := '10000000-0000-0000-0000-000000000002';
  v_subject uuid := '20000000-0000-0000-0000-000000000001';
  v_lesson uuid := '30000000-0000-0000-0000-000000000001';
  v_other_lesson uuid := '30000000-0000-0000-0000-000000000002';
  v_assessment uuid := '40000000-0000-0000-0000-000000000001';
  v_other_assessment uuid := '40000000-0000-0000-0000-000000000002';
  v_question uuid := '50000000-0000-0000-0000-000000000001';
  v_other_question uuid := '50000000-0000-0000-0000-000000000002';
  v_unlisted_question uuid := '50000000-0000-0000-0000-000000000003';
  v_old_revision uuid := '60000000-0000-0000-0000-000000000001';
  v_draft_revision uuid := '60000000-0000-0000-0000-000000000002';
  v_attempt uuid := '70000000-0000-0000-0000-000000000001';
  v_unsubmitted_attempt uuid := '70000000-0000-0000-0000-000000000002';
  v_draft_attempt uuid := '70000000-0000-0000-0000-000000000003';
  v_attempt_question uuid := '80000000-0000-0000-0000-000000000001';
  v_unsubmitted_question uuid := '80000000-0000-0000-0000-000000000002';
  v_draft_attempt_question uuid := '80000000-0000-0000-0000-000000000003';
  v_payload jsonb;
  v_first jsonb;
  v_second jsonb;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_owner), (v_other) ON CONFLICT DO NOTHING;
  INSERT INTO public.subjects (id, code, name) VALUES (v_subject, 'R3', 'R3 fixture') ON CONFLICT DO NOTHING;
  INSERT INTO public.lessons (id, subject_id, slug, title, is_free)
  VALUES
    (v_lesson, v_subject, 'r3-lesson', 'R3 lesson', true),
    (v_other_lesson, v_subject, 'r3-other-lesson', 'R3 other lesson', true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.lesson_assessments
    (id, lesson_id, title, instructions, sort_order, assessment_code)
  VALUES
    (v_assessment, v_lesson, 'R3 assessment', 'fixture', 1, 'R3-A1'),
    (v_other_assessment, v_other_lesson, 'R3 other assessment', 'fixture', 1, 'R3-A2')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.questions
    (id, lesson_id, subject_id, question_text, options, correct_index, question_type, sort_order, code)
  VALUES
    (v_question, v_lesson, v_subject, 'R3 question', '[]'::jsonb, -1, 'lesson', 1, 'R3-Q1'),
    (v_other_question, v_other_lesson, v_subject, 'R3 other question', '[]'::jsonb, -1, 'lesson', 2, 'R3-Q2'),
    (v_unlisted_question, v_lesson, v_subject, 'R3 unlisted question', '[]'::jsonb, -1, 'lesson', 3, 'R3-Q3')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.question_revisions
    (id, question_id, revision_number, status, interaction_type, question_text)
  VALUES
    (v_old_revision, v_question, 1, 'PUBLISHED', 'SINGLE_CHOICE', 'R3 question old'),
    (v_draft_revision, v_question, 2, 'DRAFT', 'SINGLE_CHOICE', 'R3 question draft')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.question_options
    (id, question_revision_id, option_code, body, sort_order, is_correct)
  VALUES
    ('90000000-0000-0000-0000-000000000001', v_old_revision, 'A', 'A', 1, true),
    ('90000000-0000-0000-0000-000000000002', v_old_revision, 'B', 'B', 2, false)
  ON CONFLICT DO NOTHING;
  UPDATE public.questions SET current_published_revision_id = v_old_revision WHERE id = v_question;
  INSERT INTO public.assessment_questions (id, assessment_id, question_id, sort_order, points)
  VALUES
    ('a0000000-0000-0000-0000-000000000001', v_assessment, v_question, 1, 1),
    ('a0000000-0000-0000-0000-000000000002', v_other_assessment, v_other_question, 1, 1)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.lesson_capability_lifecycle
    (lesson_id, capability, status, applicability, ready_by, ready_at)
  VALUES (v_lesson, 'checkUnderstanding', 'READY', 'REQUIRED', v_owner, now())
  ON CONFLICT (lesson_id, capability) DO UPDATE
    SET status = 'READY', applicability = 'REQUIRED', ready_by = v_owner, ready_at = now();
  INSERT INTO public.official_question_answers
    (question_id, revision_id, model_answer, explanation)
  VALUES (v_question, v_old_revision, 'A', 'R3 explanation');
  INSERT INTO public.question_option_rationales
    (question_id, question_revision_id, option_id, why_correct)
  VALUES (v_question, v_old_revision, 'A', 'R3 rationale');

  INSERT INTO public.practice_attempts
    (id, user_id, attempt_type, lesson_assessment_id, started_at, submitted_at, attempt_pin_mode)
  VALUES
    (v_attempt, v_owner, 'LESSON', v_assessment, now(), now(), 'REVISION_PINNED'),
    (v_unsubmitted_attempt, v_owner, 'LESSON', v_assessment, now(), NULL, 'REVISION_PINNED'),
    (v_draft_attempt, v_owner, 'LESSON', v_assessment, now(), now(), 'REVISION_PINNED');
  INSERT INTO public.practice_attempt_questions
    (id, practice_attempt_id, question_revision_id, logical_question_id, question_order,
     rendered_question_text, payload_hash)
  VALUES
    (v_attempt_question, v_attempt, v_old_revision, v_question, 1, 'R3 snapshot old', repeat('a', 64)),
    (v_unsubmitted_question, v_unsubmitted_attempt, v_old_revision, v_question, 1, 'R3 snapshot unsubmitted', repeat('b', 64)),
    (v_draft_attempt_question, v_draft_attempt, v_draft_revision, v_question, 1, 'R3 snapshot draft', repeat('c', 64));
  INSERT INTO public.practice_attempt_responses
    (id, practice_attempt_id, practice_attempt_question_id, selected_option_code, submitted_at)
  VALUES
    ('b0000000-0000-0000-0000-000000000001', v_attempt, v_attempt_question, 'A', now()),
    ('b0000000-0000-0000-0000-000000000002', v_unsubmitted_attempt, v_unsubmitted_question, 'A', now()),
    ('b0000000-0000-0000-0000-000000000003', v_draft_attempt, v_draft_attempt_question, 'A', now());

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_payload
    FROM public.get_lesson_official_questions(v_lesson) x;
  PERFORM pg_temp.assert_contract(
    v_payload::text !~* '(correct_index|is_correct|model_answer|explanation|rationale|why_correct|why_wrong)',
    'no answer or rationale before reveal'
  );

  v_first := public.reveal_official_question_answer(v_question, v_attempt);
  PERFORM pg_temp.assert_contract(v_first->>'error' IS NULL AND v_first->>'revisionId' = v_old_revision::text, 'authorized reveal');
  v_second := public.reveal_official_question_answer(v_question, v_attempt);
  PERFORM pg_temp.assert_contract(v_first = v_second, 'duplicate reveal is deterministic');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
  PERFORM pg_temp.assert_contract(
    public.reveal_official_question_answer(v_question, v_attempt)->>'error' = 'REVEAL_NOT_AUTHORIZED',
    'wrong user denied'
  );
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  PERFORM pg_temp.assert_contract(
    public.reveal_official_question_answer(v_other_question, v_attempt)->>'error' = 'REVEAL_NOT_AUTHORIZED',
    'wrong lesson denied'
  );
  PERFORM pg_temp.assert_contract(
    public.reveal_official_question_answer(v_unlisted_question, v_attempt)->>'error' = 'REVEAL_NOT_AUTHORIZED',
    'wrong question membership denied'
  );
  PERFORM pg_temp.assert_contract(
    public.reveal_official_question_answer(v_question, v_unsubmitted_attempt)->>'error' = 'REVEAL_NOT_AUTHORIZED',
    'unsubmitted attempt denied'
  );

  UPDATE public.lesson_capability_lifecycle SET status = 'DRAFT' WHERE lesson_id = v_lesson AND capability = 'checkUnderstanding';
  PERFORM pg_temp.assert_contract(public.reveal_official_question_answer(v_question, v_attempt)->>'error' = 'LESSON_NOT_READY', 'DRAFT denied');
  UPDATE public.lesson_capability_lifecycle SET status = 'REVIEW' WHERE lesson_id = v_lesson AND capability = 'checkUnderstanding';
  PERFORM pg_temp.assert_contract(public.reveal_official_question_answer(v_question, v_attempt)->>'error' = 'LESSON_NOT_READY', 'REVIEW denied');
  UPDATE public.lesson_capability_lifecycle SET status = 'READY', applicability = 'REQUIRED' WHERE lesson_id = v_lesson AND capability = 'checkUnderstanding';
  PERFORM pg_temp.assert_contract(public.reveal_official_question_answer(v_question, v_attempt)->>'error' IS NULL, 'READY allowed');
  UPDATE public.lesson_capability_lifecycle SET applicability = 'NA' WHERE lesson_id = v_lesson AND capability = 'checkUnderstanding';
  PERFORM pg_temp.assert_contract(public.reveal_official_question_answer(v_question, v_attempt)->>'error' = 'LESSON_NOT_READY', 'N/A denied');
  UPDATE public.lesson_capability_lifecycle SET applicability = 'REQUIRED', status = 'READY' WHERE lesson_id = v_lesson AND capability = 'checkUnderstanding';

  PERFORM pg_temp.assert_contract(
    public.reveal_official_question_answer(v_question, v_draft_attempt)->>'error' = 'ANSWER_NOT_AVAILABLE',
    'new draft revision is not substituted for historical revision'
  );
  UPDATE public.question_revisions SET status = 'SUPERSEDED' WHERE id = v_old_revision;
  PERFORM pg_temp.assert_contract(
    public.reveal_official_question_answer(v_question, v_attempt)->>'revisionId' = v_old_revision::text,
    'historical revision remains pinned'
  );
END $$;

COMMIT;
