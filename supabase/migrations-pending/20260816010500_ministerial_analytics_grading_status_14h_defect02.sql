-- =============================================================================
-- MINISTERIAL_EXAMS_END_TO_END_CLOSURE_14H — DEFECT-14H-02 (minimal scope)
--
-- 14F filtered finished attempts with exam_sessions.grading_status = 'GRADED',
-- but the session-level vocabulary fixed by QB-01 is
-- ('IN_PROGRESS','SUBMITTED_PENDING_GRADING','PARTIALLY_GRADED','COMPLETED')
-- and 14E submits write 'COMPLETED' (or 'PARTIALLY_GRADED' while manual review
-- is pending). 'GRADED' is the answer-level status only, so every finished
-- attempt was reported as pending manual review: graded_attempts_count = 0 and
-- avg/best/latest/improvement = NULL for every student.
--
-- Fix: compare against 'COMPLETED'. Same function contract, same payload keys,
-- same track isolation and answer-leak guarantees — only the two predicates
-- change.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_ministerial_performance_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_track uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  v_track := public.current_student_track_id();
  IF v_track IS NULL THEN
    RETURN jsonb_build_object(
      'summary', jsonb_build_object(
        'attempts_count', 0, 'graded_attempts_count', 0, 'pending_manual_count', 0,
        'avg_percentage', NULL, 'best_percentage', NULL, 'latest_percentage', NULL,
        'improvement_percentage_points', NULL, 'avg_elapsed_seconds', NULL
      ),
      'by_mode', '[]'::jsonb, 'by_subject', '[]'::jsonb, 'by_lesson', '[]'::jsonb,
      'weak_lessons', '[]'::jsonb,
      'patterns', jsonb_build_object('blank_rate', NULL, 'wrong_rate', NULL,
                                     'manual_pending_questions', 0, 'unlinked_questions_count', 0)
    );
  END IF;

  WITH base AS (
    SELECT es.id,
           es.ministerial_attempt_mode AS attempt_mode,
           es.grading_status,
           es.is_final,
           es.score,
           es.total_points,
           es.started_at,
           coalesce(es.completed_at, es.submitted_at) AS completed_at,
           m.subject_id,
           CASE WHEN coalesce(es.total_points, 0) > 0
                THEN round((coalesce(es.score, 0) / es.total_points) * 100, 2)
                ELSE NULL END AS percentage,
           GREATEST(0, EXTRACT(EPOCH FROM (
             coalesce(es.completed_at, es.submitted_at, now()) - coalesce(es.started_at, es.created_at)
           ))::int) AS elapsed_seconds
    FROM public.exam_sessions es
    JOIN public.ministerial_exam_models m ON m.id = es.ministerial_model_id
    WHERE es.user_id = v_uid
      AND es.ministerial_model_id IS NOT NULL
      AND es.status IN ('submitted', 'expired')
      AND m.curriculum_track_id = v_track
  ),
  finals AS (
    SELECT * FROM base
    WHERE is_final = true AND grading_status = 'COMPLETED' AND percentage IS NOT NULL
  ),
  ordered AS (
    SELECT f.*, row_number() OVER (ORDER BY completed_at DESC NULLS LAST) AS rn_desc
    FROM finals f
  ),
  trend AS (
    SELECT
      (SELECT avg(percentage) FROM ordered WHERE rn_desc <= 3) AS recent_avg,
      (SELECT avg(percentage) FROM ordered WHERE rn_desc > 3) AS previous_avg
  ),
  answers AS (
    SELECT esa.id,
           esa.grading_status AS a_status,
           esa.requires_manual_review,
           esa.is_correct,
           esa.answered_at,
           esa.selected_option_code,
           esq.question_revision_id,
           b.subject_id
    FROM base b
    JOIN public.exam_session_answers esa ON esa.session_id = b.id
    JOIN public.exam_session_questions esq ON esq.id = esa.exam_session_question_id
  ),
  answers_lesson AS (
    SELECT a.*,
           qt.lesson_id
    FROM answers a
    LEFT JOIN LATERAL (
      SELECT t.lesson_id
      FROM public.question_targets t
      WHERE t.revision_id = a.question_revision_id
        AND t.lesson_id IS NOT NULL
      ORDER BY t.is_primary DESC, t.created_at ASC
      LIMIT 1
    ) qt ON true
  ),
  by_lesson AS (
    SELECT al.lesson_id,
           l.title AS lesson_title,
           count(*)::int AS asked,
           count(*) FILTER (WHERE al.requires_manual_review IS NOT TRUE
                              AND al.a_status = 'GRADED')::int AS auto_graded,
           count(*) FILTER (WHERE al.is_correct IS TRUE)::int AS correct,
           count(*) FILTER (WHERE al.is_correct IS FALSE
                              AND al.answered_at IS NOT NULL
                              AND al.selected_option_code IS NOT NULL)::int AS wrong,
           count(*) FILTER (WHERE al.answered_at IS NULL OR al.selected_option_code IS NULL)::int AS blank,
           count(*) FILTER (WHERE al.requires_manual_review IS TRUE)::int AS manual_pending
    FROM answers_lesson al
    JOIN public.lessons l ON l.id = al.lesson_id
    WHERE al.lesson_id IS NOT NULL
    GROUP BY al.lesson_id, l.title
  ),
  by_lesson_acc AS (
    SELECT bl.*,
           CASE WHEN bl.auto_graded > 0
                THEN round((bl.correct::numeric / bl.auto_graded) * 100, 1)
                ELSE NULL END AS accuracy
    FROM by_lesson bl
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'attempts_count', (SELECT count(*)::int FROM base),
      'graded_attempts_count', (SELECT count(*)::int FROM finals),
      'pending_manual_count', (SELECT count(*)::int FROM base WHERE grading_status <> 'COMPLETED'),
      'avg_percentage', (SELECT round(avg(percentage), 1) FROM finals),
      'best_percentage', (SELECT max(percentage) FROM finals),
      'latest_percentage', (SELECT percentage FROM ordered WHERE rn_desc = 1),
      'improvement_percentage_points',
        (SELECT CASE WHEN recent_avg IS NULL OR previous_avg IS NULL
                     THEN NULL ELSE round(recent_avg - previous_avg, 1) END FROM trend),
      'avg_elapsed_seconds', (SELECT round(avg(elapsed_seconds))::int FROM base)
    ),
    'by_mode', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'attempt_mode')
      FROM (
        SELECT jsonb_build_object(
                 'attempt_mode', coalesce(attempt_mode, 'training'),
                 'attempts', count(*)::int,
                 'avg_percentage', round(avg(percentage), 1),
                 'best_percentage', max(percentage)
               ) AS x
        FROM finals GROUP BY coalesce(attempt_mode, 'training')
      ) s
    ), '[]'::jsonb),
    'by_subject', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'subject_name')
      FROM (
        SELECT jsonb_build_object(
                 'subject_id', f.subject_id,
                 'subject_name', s.name,
                 'attempts', count(*)::int,
                 'avg_percentage', round(avg(f.percentage), 1),
                 'best_percentage', max(f.percentage)
               ) AS x
        FROM finals f JOIN public.subjects s ON s.id = f.subject_id
        GROUP BY f.subject_id, s.name
      ) s2
    ), '[]'::jsonb),
    'by_lesson', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'lesson_id', lesson_id, 'lesson_title', lesson_title,
               'asked', asked, 'auto_graded', auto_graded, 'correct', correct,
               'wrong', wrong, 'blank', blank, 'manual_pending', manual_pending,
               'accuracy', accuracy
             ) ORDER BY accuracy NULLS LAST, asked DESC)
      FROM by_lesson_acc
    ), '[]'::jsonb),
    'weak_lessons', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'lesson_id', lesson_id, 'lesson_title', lesson_title,
               'asked', asked, 'accuracy', accuracy
             ) ORDER BY accuracy ASC)
      FROM by_lesson_acc WHERE accuracy IS NOT NULL AND accuracy < 60 AND auto_graded >= 3
    ), '[]'::jsonb),
    'patterns', (
      SELECT jsonb_build_object(
        'total_questions', count(*)::int,
        'blank_rate', CASE WHEN count(*) > 0 THEN round(
            (count(*) FILTER (WHERE answered_at IS NULL OR selected_option_code IS NULL))::numeric
            / count(*) * 100, 1) ELSE NULL END,
        'wrong_rate', CASE WHEN count(*) > 0 THEN round(
            (count(*) FILTER (WHERE is_correct IS FALSE AND selected_option_code IS NOT NULL))::numeric
            / count(*) * 100, 1) ELSE NULL END,
        'manual_pending_questions', count(*) FILTER (WHERE requires_manual_review IS TRUE)::int,
        'unlinked_questions_count', count(*) FILTER (WHERE lesson_id IS NULL)::int
      )
      FROM answers_lesson
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ministerial_performance_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ministerial_performance_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ministerial_performance_overview() TO authenticated;
