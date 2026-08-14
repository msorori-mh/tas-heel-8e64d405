CREATE OR REPLACE FUNCTION public.reveal_ministerial_training_answer(
  _session_id uuid,
  _session_question_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_session public.exam_sessions;
  v_esq public.exam_session_questions;
  v_answer public.exam_session_answers;
  v_correct boolean;
  v_correct_code text;
  v_explanation text;
  v_model_answer text;
  v_lesson_id uuid;
  v_lesson_title text;
BEGIN
  v_session := public._ministerial_session_guard(_session_id);

  IF coalesce(v_session.ministerial_attempt_mode, 'strict') <> 'training' THEN
    RAISE EXCEPTION 'REVEAL_NOT_ALLOWED_IN_STRICT' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_esq
  FROM public.exam_session_questions
  WHERE id = _session_question_id AND exam_session_id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_not_in_session' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_answer
  FROM public.exam_session_answers
  WHERE session_id = _session_id AND exam_session_question_id = _session_question_id
  FOR UPDATE;
  IF NOT FOUND OR v_answer.answered_at IS NULL THEN
    RAISE EXCEPTION 'ANSWER_REQUIRED_BEFORE_REVEAL' USING ERRCODE = '42501';
  END IF;

  v_correct := public._ministerial_is_correct(v_esq.id, v_answer.selected_option_code);

  IF v_correct IS NULL THEN
    UPDATE public.exam_session_answers
    SET revealed_at = coalesce(revealed_at, now()),
        requires_manual_review = true,
        grading_status = 'PENDING_MANUAL_REVIEW',
        updated_at = now()
    WHERE id = v_answer.id;

    RETURN jsonb_build_object(
      'verdict', 'manual_review',
      'correct_option_code', NULL,
      'explanation', NULL
    );
  END IF;

  SELECT option_code INTO v_correct_code
  FROM public.question_options
  WHERE question_revision_id = v_esq.question_revision_id AND is_correct IS TRUE
  ORDER BY sort_order
  LIMIT 1;

  SELECT qs.explanation, qs.model_answer
  INTO v_explanation, v_model_answer
  FROM public.question_solutions qs
  WHERE qs.question_revision_id = v_esq.question_revision_id
    AND coalesce(qs.reveal_policy, 'after_attempt') NOT IN ('hidden', 'staff_only')
  ORDER BY qs.sort_order NULLS LAST
  LIMIT 1;

  SELECT l.id, l.title
  INTO v_lesson_id, v_lesson_title
  FROM public.question_targets qt
  JOIN public.lessons l ON l.id = qt.lesson_id
  WHERE qt.revision_id = v_esq.question_revision_id
    AND qt.lesson_id IS NOT NULL
  ORDER BY qt.is_primary DESC NULLS LAST
  LIMIT 1;

  UPDATE public.exam_session_answers
  SET revealed_at = coalesce(revealed_at, now()),
      is_correct = v_correct,
      auto_score = CASE WHEN v_correct THEN coalesce(v_answer.max_score, 0) ELSE 0 END,
      grading_status = 'GRADED',
      updated_at = now()
  WHERE id = v_answer.id;

  RETURN jsonb_build_object(
    'verdict', CASE WHEN v_correct THEN 'correct' ELSE 'wrong' END,
    'correct_option_code', v_correct_code,
    'explanation', v_explanation,
    'model_answer', v_model_answer,
    'lesson_id', v_lesson_id,
    'lesson_title', v_lesson_title
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reveal_ministerial_training_answer(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reveal_ministerial_training_answer(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reveal_ministerial_training_answer(uuid, uuid) TO authenticated;