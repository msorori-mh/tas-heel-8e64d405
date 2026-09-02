-- MINISTERIAL_ADEN_TEXT_ANSWERS_V1
-- Aden previous exams use the same learning interaction as official-book
-- evaluation questions: write an answer first, then explicitly reveal the
-- pinned model answer. Sanaa remains option-code-only.

BEGIN;

CREATE OR REPLACE FUNCTION public.answer_ministerial_text_question(
  _session_id uuid,
  _session_question_id uuid,
  _response_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_session public.exam_sessions;
  v_esq public.exam_session_questions;
  v_answer public.exam_session_answers;
  v_track_code text;
  v_text text := btrim(coalesce(_response_text, ''));
BEGIN
  v_session := public._ministerial_session_guard(_session_id);

  SELECT ct.track_code INTO v_track_code
  FROM public.ministerial_exam_models m
  JOIN public.curriculum_tracks ct ON ct.id = m.curriculum_track_id
  WHERE m.id = v_session.ministerial_model_id;
  IF v_track_code IS DISTINCT FROM 'aden' THEN
    RAISE EXCEPTION 'MINISTERIAL_TEXT_ANSWER_ADEN_ONLY' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_text) > 8000 THEN
    RAISE EXCEPTION 'MINISTERIAL_TEXT_ANSWER_TOO_LONG' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_esq
  FROM public.exam_session_questions
  WHERE id = _session_question_id AND exam_session_id = _session_id;
  IF NOT FOUND OR jsonb_array_length(v_esq.rendered_options) <> 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_TEXT_QUESTION_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_session FROM public.exam_sessions WHERE id = _session_id FOR UPDATE;
  IF v_session.status <> 'in_progress' THEN
    RAISE EXCEPTION 'session_not_in_progress' USING ERRCODE = '22023';
  END IF;
  IF v_session.expires_at IS NOT NULL AND v_session.expires_at < now() THEN
    RAISE EXCEPTION 'SESSION_EXPIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_answer
  FROM public.exam_session_answers
  WHERE session_id = _session_id AND exam_session_question_id = _session_question_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_not_in_session' USING ERRCODE = '22023';
  END IF;
  IF v_answer.revealed_at IS NOT NULL THEN
    RAISE EXCEPTION 'ANSWER_ALREADY_REVEALED_LOCKED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.exam_session_answers
  SET response_text = nullif(v_text, ''),
      response_payload = CASE WHEN v_text = '' THEN NULL ELSE jsonb_build_object('kind', 'text') END,
      selected_option_code = NULL,
      selected_index = NULL,
      answered_at = CASE WHEN v_text = '' THEN NULL ELSE now() END,
      submitted_at = CASE WHEN v_text = '' THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = v_answer.id;

  UPDATE public.exam_sessions es
  SET answered_questions = (
        SELECT count(*) FROM public.exam_session_answers a
        WHERE a.session_id = _session_id AND a.answered_at IS NOT NULL
      ),
      updated_at = now()
  WHERE es.id = _session_id;

  RETURN jsonb_build_object('ok', true, 'answered', v_text <> '');
END;
$function$;

REVOKE ALL ON FUNCTION public.answer_ministerial_text_question(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.answer_ministerial_text_question(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reveal_ministerial_training_answer(
  _session_id uuid,
  _session_question_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_session public.exam_sessions;
  v_esq public.exam_session_questions;
  v_answer public.exam_session_answers;
  v_track_code text;
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

  SELECT ct.track_code INTO v_track_code
  FROM public.ministerial_exam_models m
  JOIN public.curriculum_tracks ct ON ct.id = m.curriculum_track_id
  WHERE m.id = v_session.ministerial_model_id;

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

  SELECT qs.explanation, qs.model_answer
  INTO v_explanation, v_model_answer
  FROM public.question_solutions qs
  WHERE qs.question_revision_id = v_esq.question_revision_id
    AND lower(coalesce(qs.reveal_policy, 'after_submit')) NOT IN ('hidden', 'staff_only')
  ORDER BY qs.sort_order NULLS LAST
  LIMIT 1;

  IF v_track_code = 'aden' THEN
    IF nullif(btrim(coalesce(v_answer.response_text, '')), '') IS NULL THEN
      RAISE EXCEPTION 'ANSWER_REQUIRED_BEFORE_REVEAL' USING ERRCODE = '42501';
    END IF;
    IF nullif(btrim(coalesce(v_model_answer, '')), '') IS NULL THEN
      RAISE EXCEPTION 'MINISTERIAL_ANSWER_LAYER_NOT_READY' USING ERRCODE = '23514';
    END IF;
    UPDATE public.exam_session_answers
    SET revealed_at = coalesce(revealed_at, now()),
        requires_manual_review = true,
        grading_status = 'PENDING_MANUAL_REVIEW',
        updated_at = now()
    WHERE id = v_answer.id;
    RETURN jsonb_build_object(
      'verdict', 'manual_review',
      'correct_option_code', NULL,
      'model_answer', v_model_answer,
      'explanation', v_explanation,
      'comparison_only', true
    );
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
  ORDER BY sort_order LIMIT 1;
  SELECT l.id, l.title INTO v_lesson_id, v_lesson_title
  FROM public.question_targets qt
  JOIN public.lessons l ON l.id = qt.lesson_id
  WHERE qt.revision_id = v_esq.question_revision_id AND qt.lesson_id IS NOT NULL
  ORDER BY qt.is_primary DESC NULLS LAST LIMIT 1;

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
    'lesson_title', v_lesson_title,
    'comparison_only', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reveal_ministerial_training_answer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_ministerial_training_answer(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_ministerial_exam_session(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_session public.exam_sessions;
  v_row record;
  v_track_code text;
  v_is_aden boolean := false;
  v_is_correct boolean;
  v_answered integer := 0;
  v_correct integer := 0;
  v_wrong integer := 0;
  v_blank integer := 0;
  v_manual integer := 0;
  v_score numeric := 0;
  v_total numeric := 0;
  v_pct numeric;
  v_elapsed integer;
  v_expired boolean;
  v_result jsonb;
BEGIN
  PERFORM public._ministerial_session_guard(_session_id);
  SELECT * INTO v_session FROM public.exam_sessions WHERE id = _session_id FOR UPDATE;

  IF v_session.status <> 'in_progress' AND v_session.result_json IS NOT NULL THEN
    RETURN v_session.result_json;
  END IF;

  SELECT ct.track_code INTO v_track_code
  FROM public.ministerial_exam_models m
  JOIN public.curriculum_tracks ct ON ct.id = m.curriculum_track_id
  WHERE m.id = v_session.ministerial_model_id;
  v_is_aden := v_track_code = 'aden';
  v_expired := v_session.expires_at IS NOT NULL AND v_session.expires_at < now();

  FOR v_row IN
    SELECT esa.id, esa.selected_option_code, esa.response_text, esa.answered_at,
           esq.id AS esq_id, esq.max_score
    FROM public.exam_session_answers esa
    JOIN public.exam_session_questions esq ON esq.id = esa.exam_session_question_id
    WHERE esa.session_id = _session_id
    ORDER BY esq.question_order
  LOOP
    v_total := v_total + coalesce(v_row.max_score, 0);

    IF v_is_aden THEN
      IF v_row.answered_at IS NULL OR nullif(btrim(coalesce(v_row.response_text, '')), '') IS NULL THEN
        v_blank := v_blank + 1;
        UPDATE public.exam_session_answers
        SET is_correct = NULL, auto_score = NULL, final_score = NULL,
            requires_manual_review = false, grading_status = 'GRADED',
            graded_at = now(), updated_at = now()
        WHERE id = v_row.id;
      ELSE
        v_answered := v_answered + 1;
        UPDATE public.exam_session_answers
        SET is_correct = NULL, auto_score = NULL, final_score = NULL,
            requires_manual_review = false, grading_status = 'GRADED',
            graded_at = now(), updated_at = now()
        WHERE id = v_row.id;
      END IF;
      CONTINUE;
    END IF;

    IF v_row.answered_at IS NULL OR v_row.selected_option_code IS NULL THEN
      v_blank := v_blank + 1;
      UPDATE public.exam_session_answers
      SET is_correct = false, auto_score = 0, final_score = 0,
          grading_status = 'GRADED', graded_at = now(), updated_at = now()
      WHERE id = v_row.id;
      CONTINUE;
    END IF;

    v_answered := v_answered + 1;
    v_is_correct := public._ministerial_is_correct(v_row.esq_id, v_row.selected_option_code);
    IF v_is_correct IS NULL THEN
      v_manual := v_manual + 1;
      UPDATE public.exam_session_answers
      SET requires_manual_review = true,
          grading_status = 'PENDING_MANUAL_REVIEW', updated_at = now()
      WHERE id = v_row.id;
      CONTINUE;
    END IF;
    IF v_is_correct THEN
      v_correct := v_correct + 1;
      v_score := v_score + coalesce(v_row.max_score, 0);
    ELSE
      v_wrong := v_wrong + 1;
    END IF;
    UPDATE public.exam_session_answers
    SET is_correct = v_is_correct,
        auto_score = CASE WHEN v_is_correct THEN coalesce(v_row.max_score, 0) ELSE 0 END,
        final_score = CASE WHEN v_is_correct THEN coalesce(v_row.max_score, 0) ELSE 0 END,
        grading_status = 'GRADED', graded_at = now(), updated_at = now()
    WHERE id = v_row.id;
  END LOOP;

  v_elapsed := GREATEST(
    0,
    EXTRACT(EPOCH FROM (
      LEAST(now(), coalesce(v_session.expires_at, now()))
      - coalesce(v_session.started_at, v_session.created_at)
    ))::integer
  );
  v_pct := CASE
    WHEN v_is_aden OR v_manual > 0 THEN NULL
    WHEN v_total > 0 THEN round((v_score / v_total) * 100, 2)
    ELSE 0
  END;

  v_result := jsonb_build_object(
    'session_id', _session_id,
    'attempt_mode', v_session.ministerial_attempt_mode,
    'answered', v_answered,
    'correct_count', CASE WHEN v_is_aden OR v_manual > 0 THEN NULL ELSE v_correct END,
    'wrong_count', CASE WHEN v_is_aden OR v_manual > 0 THEN NULL ELSE v_wrong END,
    'blank_count', v_blank,
    'manual_count', CASE WHEN v_is_aden THEN 0 ELSE v_manual END,
    'score', CASE WHEN v_is_aden OR v_manual > 0 THEN NULL ELSE v_score END,
    'total_points', v_total,
    'total_questions', v_session.total_questions,
    'percentage', v_pct,
    'elapsed_seconds', v_elapsed,
    'manual_review_required', CASE WHEN v_is_aden THEN false ELSE v_manual > 0 END,
    'self_review', v_is_aden,
    'is_final', v_is_aden OR v_manual = 0
  );

  UPDATE public.exam_sessions
  SET status = CASE WHEN v_expired THEN 'expired'::public.exam_session_status
                    ELSE 'submitted'::public.exam_session_status END,
      submitted_at = coalesce(submitted_at, now()), completed_at = now(),
      answered_questions = v_answered, correct_answers = NULL,
      score = CASE WHEN v_is_aden OR v_manual > 0 THEN NULL ELSE v_score END,
      total_points = v_total,
      grading_status = CASE
        WHEN v_is_aden OR v_manual = 0 THEN 'COMPLETED'
        ELSE 'PARTIALLY_GRADED'
      END,
      is_final = (v_is_aden OR v_manual = 0),
      result_json = v_result, updated_at = now()
  WHERE id = _session_id;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_ministerial_exam_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_ministerial_exam_session(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ministerial_session_state(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_session public.exam_sessions;
  v_questions jsonb;
  v_answers jsonb;
  v_model jsonb;
BEGIN
  v_session := public._ministerial_session_guard(_session_id);

  SELECT jsonb_build_object(
    'model_id', m.id,
    'model_code', m.model_code,
    'model_label', m.model_label,
    'academic_year', m.academic_year,
    'round_code', m.round_code::text,
    'subject_id', s.id,
    'subject_name', s.name,
    'track_code', ct.track_code,
    'track_name', ct.track_name
  ) INTO v_model
  FROM public.ministerial_exam_models m
  JOIN public.subjects s ON s.id = m.subject_id
  JOIN public.curriculum_tracks ct ON ct.id = m.curriculum_track_id
  WHERE m.id = v_session.ministerial_model_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'session_question_id', esq.id,
    'question_id', esq.logical_question_id,
    'question_order', esq.question_order,
    'question_text', esq.rendered_question_text,
    'stimulus_text', esq.rendered_stimulus_text,
    'options', esq.rendered_options,
    'max_score', esq.max_score
  ) ORDER BY esq.question_order), '[]'::jsonb)
  INTO v_questions
  FROM public.exam_session_questions esq
  WHERE esq.exam_session_id = _session_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'question_id', a.question_id,
    'session_question_id', a.exam_session_question_id,
    'selected_option_code', a.selected_option_code,
    'response_text', a.response_text,
    'answered_at', a.answered_at,
    'revealed_at', a.revealed_at
  )), '[]'::jsonb)
  INTO v_answers
  FROM public.exam_session_answers a
  WHERE a.session_id = _session_id;

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'status', v_session.status::text,
      'mode', v_session.mode::text,
      'attempt_mode', coalesce(v_session.ministerial_attempt_mode, 'training'),
      'grading_status', v_session.grading_status,
      'is_final', v_session.is_final,
      'started_at', v_session.started_at,
      'expires_at', v_session.expires_at,
      'server_now', now(),
      'total_questions', v_session.total_questions
    ),
    'model', v_model,
    'questions', v_questions,
    'answers', v_answers,
    'reveal', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_ministerial_session_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ministerial_session_state(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ministerial_session_result(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_session public.exam_sessions;
  v_model jsonb;
  v_questions jsonb;
BEGIN
  v_session := public._ministerial_session_guard(_session_id);
  IF v_session.status = 'in_progress' OR v_session.result_json IS NULL THEN
    RAISE EXCEPTION 'SESSION_NOT_COMPLETED' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'model_id', m.id,
    'model_code', m.model_code,
    'model_label', m.model_label,
    'academic_year', m.academic_year,
    'round_code', m.round_code::text,
    'subject_id', m.subject_id,
    'subject_name', s.name,
    'track_code', ct.track_code,
    'track_name', ct.track_name
  ) INTO v_model
  FROM public.ministerial_exam_models m
  JOIN public.subjects s ON s.id = m.subject_id
  JOIN public.curriculum_tracks ct ON ct.id = m.curriculum_track_id
  WHERE m.id = v_session.ministerial_model_id;

  SELECT coalesce(jsonb_agg(q ORDER BY (q->>'question_order')::int), '[]'::jsonb)
  INTO v_questions
  FROM (
    SELECT jsonb_build_object(
      'session_question_id', esq.id,
      'question_order', esq.question_order,
      'question_text', esq.rendered_question_text,
      'stimulus_text', esq.rendered_stimulus_text,
      'options', esq.rendered_options,
      'max_score', esq.max_score,
      'selected_option_code', esa.selected_option_code,
      'response_text', esa.response_text,
      'status', CASE
        WHEN esa.requires_manual_review IS TRUE THEN 'manual_review'
        WHEN esa.answered_at IS NULL THEN 'blank'
        WHEN esa.is_correct IS TRUE THEN 'correct'
        WHEN esa.is_correct IS FALSE THEN 'wrong'
        ELSE 'manual_review'
      END,
      'correct_option_code', CASE WHEN esa.requires_manual_review IS TRUE THEN NULL ELSE (
        SELECT qo.option_code FROM public.question_options qo
        WHERE qo.question_revision_id = esq.question_revision_id AND qo.is_correct IS TRUE
        ORDER BY qo.sort_order LIMIT 1
      ) END,
      'model_answer', (
        SELECT qs.model_answer FROM public.question_solutions qs
        WHERE qs.question_revision_id = esq.question_revision_id
          AND lower(coalesce(qs.reveal_policy, 'after_submit')) NOT IN ('hidden', 'staff_only')
        ORDER BY qs.sort_order NULLS LAST LIMIT 1
      ),
      'explanation', (
        SELECT qs.explanation FROM public.question_solutions qs
        WHERE qs.question_revision_id = esq.question_revision_id
          AND lower(coalesce(qs.reveal_policy, 'after_submit')) NOT IN ('hidden', 'staff_only')
        ORDER BY qs.sort_order NULLS LAST LIMIT 1
      ),
      'lesson_id', (
        SELECT qt.lesson_id FROM public.question_targets qt
        WHERE qt.revision_id = esq.question_revision_id AND qt.lesson_id IS NOT NULL
        ORDER BY qt.is_primary DESC NULLS LAST LIMIT 1
      )
    ) AS q
    FROM public.exam_session_questions esq
    JOIN public.exam_session_answers esa ON esa.exam_session_question_id = esq.id
    WHERE esq.exam_session_id = _session_id
  ) t;

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'status', v_session.status::text,
      'attempt_mode', v_session.ministerial_attempt_mode,
      'grading_status', v_session.grading_status,
      'is_final', v_session.is_final,
      'started_at', v_session.started_at,
      'completed_at', v_session.completed_at
    ),
    'model', v_model,
    'summary', v_session.result_json,
    'questions', v_questions
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_ministerial_session_result(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ministerial_session_result(uuid) TO authenticated;

DO $proof$
DECLARE
  v_answer text;
  v_reveal text;
  v_submit text;
  v_state text;
BEGIN
  SELECT pg_get_functiondef('public.answer_ministerial_text_question(uuid,uuid,text)'::regprocedure)
  INTO v_answer;
  SELECT pg_get_functiondef('public.reveal_ministerial_training_answer(uuid,uuid)'::regprocedure)
  INTO v_reveal;
  SELECT pg_get_functiondef('public.submit_ministerial_exam_session(uuid)'::regprocedure)
  INTO v_submit;
  SELECT pg_get_functiondef('public.get_ministerial_session_state(uuid)'::regprocedure)
  INTO v_state;
  IF position('track_code' in v_answer) = 0
     OR position('response_text' in v_answer) = 0
     OR position('model_answer' in v_reveal) = 0
     OR position('v_is_aden' in v_submit) = 0
     OR position('response_text' in v_submit) = 0
     OR position('response_text' in v_state) = 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_ADEN_TEXT_GUARD_MISSING';
  END IF;
  IF has_function_privilege('anon', 'public.answer_ministerial_text_question(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.submit_ministerial_exam_session(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MINISTERIAL_ADEN_TEXT_ANON_EXECUTE';
  END IF;
END
$proof$;

COMMIT;
