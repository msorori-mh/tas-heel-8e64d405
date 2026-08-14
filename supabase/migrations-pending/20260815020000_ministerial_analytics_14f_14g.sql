-- =====================================================================
-- PAST_MINISTERIAL_EXAMS_PERFORMANCE_ANALYTICS_14F
-- REPEATED_MINISTERIAL_QUESTIONS_14G
-- Read-only analytics RPCs. No schema changes, no demo data.
-- Guards:
--   * auth.uid() required (anon DENY)
--   * student sees ONLY own sessions (no user_id parameter anywhere)
--   * every ministerial read is scoped by the student's curriculum_track_id
--   * subject reads additionally gated by public.can_access_subject()
--   * NO answer key / correct option / solution text in any payload
--   * lesson attribution uses the HISTORICAL pinned revision target
-- =====================================================================

-- ---------------------------------------------------------------------
-- helper: the calling student's curriculum track (NULL when unset)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_student_track_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.curriculum_track_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_student_track_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_student_track_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_student_track_id() TO authenticated;

-- =====================================================================
-- 14F — get_ministerial_performance_overview()
-- =====================================================================
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
    WHERE is_final = true AND grading_status = 'GRADED' AND percentage IS NOT NULL
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
      'pending_manual_count', (SELECT count(*)::int FROM base WHERE grading_status <> 'GRADED'),
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

-- =====================================================================
-- 14G — repeated ministerial questions
-- identity = canonical question_id; every occurrence keeps its pinned
-- published_revision_id; display text uses one deterministic revision.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.list_repeated_ministerial_subjects()
RETURNS TABLE (
  subject_id uuid,
  subject_name text,
  subject_code text,
  repeated_questions_count int,
  max_occurrences int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_track uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  v_track := public.current_student_track_id();
  IF v_track IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH occ AS (
    SELECT m.subject_id AS sid, meq.question_id, count(DISTINCT m.id)::int AS c
    FROM public.ministerial_exam_questions meq
    JOIN public.ministerial_exam_models m ON m.id = meq.model_id
    WHERE m.status = 'published'
      AND m.archived_at IS NULL
      AND m.curriculum_track_id = v_track
      AND public.can_access_subject(m.subject_id)
    GROUP BY m.subject_id, meq.question_id
    HAVING count(DISTINCT m.id) >= 2
  )
  SELECT o.sid, s.name, s.code, count(*)::int, max(o.c)::int
  FROM occ o
  JOIN public.subjects s ON s.id = o.sid
  GROUP BY o.sid, s.name, s.code
  ORDER BY count(*) DESC, s.name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_repeated_ministerial_subjects() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_repeated_ministerial_subjects() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_repeated_ministerial_subjects() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_repeated_ministerial_questions(
  _subject_id uuid,
  _min_occurrences int DEFAULT 2,
  _year_from int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_track uuid;
  v_min int := GREATEST(2, coalesce(_min_occurrences, 2));
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  v_track := public.current_student_track_id();
  IF v_track IS NULL THEN
    RAISE EXCEPTION 'curriculum_track_not_set';
  END IF;
  IF NOT public.can_access_subject(_subject_id) THEN
    RAISE EXCEPTION 'subject_access_denied';
  END IF;

  WITH occurrences AS (
    SELECT meq.question_id,
           meq.published_revision_id,
           m.id AS model_id,
           m.model_code,
           m.model_label,
           m.academic_year,
           m.round_code::text AS round_code,
           m.published_at
    FROM public.ministerial_exam_questions meq
    JOIN public.ministerial_exam_models m ON m.id = meq.model_id
    WHERE m.subject_id = _subject_id
      AND m.curriculum_track_id = v_track
      AND m.status = 'published'
      AND m.archived_at IS NULL
      AND (_year_from IS NULL OR m.academic_year >= _year_from)
  ),
  agg AS (
    SELECT question_id, count(DISTINCT model_id)::int AS occurrence_count
    FROM occurrences
    GROUP BY question_id
    HAVING count(DISTINCT model_id) >= v_min
  ),
  display AS (
    SELECT DISTINCT ON (o.question_id)
      o.question_id, o.published_revision_id AS display_revision_id
    FROM occurrences o
    JOIN agg a ON a.question_id = o.question_id
    ORDER BY o.question_id, o.academic_year DESC, o.published_at DESC NULLS LAST, o.model_id
  )
  SELECT coalesce(jsonb_agg(row_json ORDER BY occurrence_count DESC, question_text), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT a.occurrence_count,
           qr.question_text,
           jsonb_build_object(
             'question_id', a.question_id,
             'display_revision_id', d.display_revision_id,
             'question_text', qr.question_text,
             'stimulus_text', qr.stimulus_text,
             'occurrence_count', a.occurrence_count,
             'years', (SELECT jsonb_agg(DISTINCT o2.academic_year ORDER BY o2.academic_year)
                       FROM occurrences o2 WHERE o2.question_id = a.question_id),
             'occurrences', (
               SELECT jsonb_agg(jsonb_build_object(
                        'model_id', o3.model_id,
                        'model_code', o3.model_code,
                        'model_label', o3.model_label,
                        'academic_year', o3.academic_year,
                        'round_code', o3.round_code,
                        'published_revision_id', o3.published_revision_id
                      ) ORDER BY o3.academic_year DESC, o3.model_code)
               FROM occurrences o3 WHERE o3.question_id = a.question_id
             ),
             'latest_model_id', (
               SELECT o4.model_id FROM occurrences o4
               WHERE o4.question_id = a.question_id
               ORDER BY o4.academic_year DESC, o4.published_at DESC NULLS LAST, o4.model_id
               LIMIT 1
             ),
             'lesson_id', lt.lesson_id,
             'lesson_title', lt.lesson_title
           ) AS row_json
    FROM agg a
    JOIN display d ON d.question_id = a.question_id
    JOIN public.question_revisions qr ON qr.id = d.display_revision_id
    LEFT JOIN LATERAL (
      SELECT t.lesson_id, l.title AS lesson_title
      FROM public.question_targets t
      JOIN public.lessons l ON l.id = t.lesson_id
      WHERE t.revision_id = d.display_revision_id AND t.lesson_id IS NOT NULL
      ORDER BY t.is_primary DESC, t.created_at ASC
      LIMIT 1
    ) lt ON true
  ) rows;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.list_repeated_ministerial_questions(uuid, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_repeated_ministerial_questions(uuid, int, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_repeated_ministerial_questions(uuid, int, int) TO authenticated;
