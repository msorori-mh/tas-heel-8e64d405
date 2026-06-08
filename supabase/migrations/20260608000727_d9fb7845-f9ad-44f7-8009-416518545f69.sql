-- Allow submit_exam_session to finalize sessions that were auto-expired
-- (so students can still see results when the timer ran out).
CREATE OR REPLACE FUNCTION public.submit_exam_session(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_session public.exam_sessions;
  v_answered int := 0;
  v_correct int := 0;
  v_score numeric := 0;
  v_total_pts numeric := 0;
  v_per_question jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_session FROM public.exam_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_session.user_id <> v_user THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v_session.status NOT IN ('in_progress', 'expired') THEN
    RAISE EXCEPTION 'session_not_in_progress' USING ERRCODE = '22023';
  END IF;

  -- If time elapsed, drop any answers made after expiry by nulling them out
  IF v_session.expires_at IS NOT NULL AND v_session.expires_at < now() THEN
    UPDATE public.exam_session_answers
    SET selected_index = NULL, is_correct = NULL, points_awarded = 0
    WHERE session_id = _session_id
      AND answered_at IS NOT NULL
      AND answered_at > v_session.expires_at;
  END IF;

  WITH graded AS (
    SELECT
      a.id AS answer_id,
      a.question_id,
      a.selected_index,
      q.correct_index,
      tq.points AS q_points,
      (a.selected_index IS NOT NULL AND a.selected_index = q.correct_index) AS is_correct
    FROM public.exam_session_answers a
    JOIN public.questions q ON q.id = a.question_id
    LEFT JOIN public.exam_template_questions tq
      ON tq.template_id = v_session.template_id AND tq.question_id = a.question_id
    WHERE a.session_id = _session_id
  ),
  upd AS (
    UPDATE public.exam_session_answers a
    SET is_correct = g.is_correct,
        points_awarded = CASE WHEN g.is_correct THEN COALESCE(g.q_points, 1) ELSE 0 END,
        updated_at = now()
    FROM graded g
    WHERE a.id = g.answer_id
    RETURNING a.question_id, a.is_correct, a.points_awarded, a.selected_index
  )
  SELECT
    COUNT(*) FILTER (WHERE selected_index IS NOT NULL),
    COUNT(*) FILTER (WHERE is_correct IS TRUE),
    COALESCE(SUM(points_awarded), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'question_id', question_id,
      'is_correct', is_correct,
      'points_awarded', points_awarded
    ) ORDER BY question_id), '[]'::jsonb)
  INTO v_answered, v_correct, v_score, v_per_question
  FROM upd;

  SELECT COALESCE(SUM(points), 0) INTO v_total_pts
  FROM public.exam_template_questions WHERE template_id = v_session.template_id;

  UPDATE public.exam_sessions
  SET status = 'submitted',
      submitted_at = now(),
      answered_questions = v_answered,
      correct_answers = v_correct,
      score = v_score,
      total_points = v_total_pts,
      result_json = jsonb_build_object(
        'answered', v_answered,
        'correct', v_correct,
        'score', v_score,
        'total_points', v_total_pts,
        'per_question', v_per_question
      ),
      updated_at = now()
  WHERE id = _session_id;

  RETURN jsonb_build_object(
    'session_id', _session_id,
    'answered', v_answered,
    'correct', v_correct,
    'score', v_score,
    'total_points', v_total_pts,
    'percentage', CASE WHEN v_total_pts > 0 THEN ROUND((v_score / v_total_pts) * 100, 2) ELSE 0 END
  );
END;
$function$;