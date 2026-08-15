-- =====================================================================
-- TAMKEEN_UNIFIED_PERFORMANCE_DUAL_SURFACE_15C
--
-- Unified performance analytics DERIVED from the existing attempt data.
--   * NEW_ANALYTICS_TABLE = NO, NEW_MATERIALIZED_COPY = NO, no triggers.
--   * Exactly two public RPCs (student + admin aggregate) plus shared
--     INTERNAL set-returning helpers so both surfaces consume the SAME
--     source of truth => STUDENT_ADMIN_METRIC_PARITY by construction.
--
-- Metric definitions (reused, not re-invented):
--   * FINAL ATTEMPT (14F): status IN ('submitted','expired')
--       AND is_final AND grading_status = 'GRADED' AND percentage IS NOT NULL
--   * PERCENTAGE (14F): score / NULLIF(total_points,0) * 100  (never raw score)
--   * MANUAL_REVIEW_PENDING (14F/14E): excluded from avg/best/latest/trend;
--       surfaced only as pending_manual_count
--   * improvement (14F): avg(latest 3 finals) - avg(older finals)
--   * WRONG / BLANK / CORRECT / PENDING per occurrence (15B), mastered later
--       = last correct occurrence is newer than the last mistake occurrence
--   * Lesson attribution: pinned exam_session_questions.question_revision_id
--       -> question_targets of THAT revision (historical truth, never latest)
--   * Ministerial track isolation (14D-14H): model track must equal the
--       session owner's curriculum track.
--
-- Answer secrecy: no correct option, no answer key, no is_correct flag, no
-- hidden solution, no raw response payload in any output. ANSWER_LEAK = ZERO.
-- Privacy: the admin surface is aggregate-only; no user ids, no names.
-- =====================================================================

-- ---------------------------------------------------------------------
-- internal: unified session ledger (ordinary + ministerial)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._up_sessions(
  _user_id uuid DEFAULT NULL,
  _grade_id uuid DEFAULT NULL,
  _track_id uuid DEFAULT NULL,
  _attempt_type text DEFAULT 'ALL',
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  session_id uuid,
  student_id uuid,
  attempt_at timestamptz,
  scope text,
  attempt_type text,
  subject_id uuid,
  grade_id uuid,
  track_id uuid,
  percentage numeric,
  elapsed_seconds int,
  is_final_graded boolean,
  is_pending_manual boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    es.id,
    es.user_id,
    coalesce(es.completed_at, es.submitted_at, es.created_at),
    CASE WHEN es.ministerial_model_id IS NOT NULL THEN 'MINISTERIAL' ELSE 'ORDINARY' END,
    CASE
      WHEN es.ministerial_model_id IS NULL THEN 'ORDINARY'
      WHEN coalesce(es.ministerial_attempt_mode, 'training') = 'training'
        THEN 'MINISTERIAL_TRAINING'
      ELSE 'MINISTERIAL_STRICT'
    END,
    coalesce(m.subject_id, t.subject_id),
    p.grade_uuid,
    p.curriculum_track_id,
    CASE WHEN coalesce(es.total_points, 0) > 0
         THEN round((coalesce(es.score, 0) / es.total_points) * 100, 2)
         ELSE NULL END,
    GREATEST(0, EXTRACT(EPOCH FROM (
      coalesce(es.completed_at, es.submitted_at, now()) - coalesce(es.started_at, es.created_at)
    ))::int),
    (es.is_final IS TRUE
      AND es.grading_status = 'GRADED'
      AND coalesce(es.total_points, 0) > 0),
    (coalesce(es.grading_status, '') <> 'GRADED')
  FROM public.exam_sessions es
  LEFT JOIN public.exam_templates t ON t.id = es.template_id
  LEFT JOIN public.ministerial_exam_models m ON m.id = es.ministerial_model_id
  LEFT JOIN public.profiles p ON p.user_id = es.user_id
  WHERE es.status IN ('submitted', 'expired')
    AND (_user_id IS NULL OR es.user_id = _user_id)
    -- ministerial track isolation: cross-track history is never counted
    AND (es.ministerial_model_id IS NULL
         OR (p.curriculum_track_id IS NOT NULL
             AND m.curriculum_track_id = p.curriculum_track_id))
    AND (_grade_id IS NULL OR p.grade_uuid = _grade_id)
    AND (_track_id IS NULL OR p.curriculum_track_id = _track_id)
    AND (_from IS NULL OR coalesce(es.completed_at, es.submitted_at, es.created_at) >= _from)
    AND (_to IS NULL OR coalesce(es.completed_at, es.submitted_at, es.created_at) <= _to)
    AND (
      coalesce(_attempt_type, 'ALL') = 'ALL'
      OR (_attempt_type = 'ORDINARY' AND es.ministerial_model_id IS NULL)
      OR (_attempt_type = 'MINISTERIAL' AND es.ministerial_model_id IS NOT NULL)
      OR (_attempt_type = 'MINISTERIAL_TRAINING'
          AND es.ministerial_model_id IS NOT NULL
          AND coalesce(es.ministerial_attempt_mode, 'training') = 'training')
      OR (_attempt_type = 'MINISTERIAL_STRICT'
          AND es.ministerial_model_id IS NOT NULL
          AND coalesce(es.ministerial_attempt_mode, 'training') <> 'training')
    )
$$;

REVOKE ALL ON FUNCTION public._up_sessions(uuid, uuid, uuid, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._up_sessions(uuid, uuid, uuid, text, timestamptz, timestamptz) FROM anon;

-- ---------------------------------------------------------------------
-- internal: per-question occurrences with 15B state + historical target
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._up_occurrences(
  _user_id uuid DEFAULT NULL,
  _grade_id uuid DEFAULT NULL,
  _track_id uuid DEFAULT NULL,
  _attempt_type text DEFAULT 'ALL',
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  session_id uuid,
  student_id uuid,
  attempt_at timestamptz,
  scope text,
  attempt_type text,
  question_id uuid,
  eff_subject_id uuid,
  lesson_id uuid,
  state text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT o.session_id, o.student_id, o.attempt_at, o.scope, o.attempt_type,
         o.question_id,
         coalesce(qt.subject_id, o.subject_id) AS eff_subject_id,
         qt.lesson_id,
         o.state
  FROM (
    SELECT s.session_id, s.student_id, s.attempt_at, s.scope, s.attempt_type,
           s.subject_id,
           esq.logical_question_id AS question_id,
           esq.question_revision_id,
           CASE
             WHEN a.requires_manual_review IS TRUE
               OR (a.id IS NOT NULL AND coalesce(a.grading_status, '') <> 'GRADED') THEN 'PENDING'
             WHEN a.id IS NULL
               OR (a.selected_option_code IS NULL AND coalesce(a.response_text, '') = '') THEN 'BLANK'
             WHEN a.is_correct IS TRUE THEN 'CORRECT'
             WHEN a.is_correct IS FALSE THEN 'WRONG'
             ELSE 'PENDING'
           END AS state
    FROM public._up_sessions(_user_id, _grade_id, _track_id, _attempt_type, _from, _to) s
    JOIN public.exam_session_questions esq ON esq.exam_session_id = s.session_id
    LEFT JOIN public.exam_session_answers a ON a.exam_session_question_id = esq.id
    WHERE esq.logical_question_id IS NOT NULL
  ) o
  LEFT JOIN LATERAL (
    -- historical attribution: the target of the PINNED revision only
    SELECT t.subject_id, t.lesson_id
    FROM public.question_targets t
    WHERE t.revision_id = o.question_revision_id
    ORDER BY t.is_primary DESC, t.created_at ASC
    LIMIT 1
  ) qt ON true
$$;

REVOKE ALL ON FUNCTION public._up_occurrences(uuid, uuid, uuid, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._up_occurrences(uuid, uuid, uuid, text, timestamptz, timestamptz) FROM anon;

-- ---------------------------------------------------------------------
-- internal: content progress per subject for one student
-- (existing progress contract: user_progress.completed over the lessons of
--  the subjects offered to that student's grade + curriculum track;
--  Subject->Unit->Lesson and Subject->Lesson are both covered because the
--  lesson set is read from lessons.subject_id — no fake units, and PDF
--  lessons follow the same completion contract.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._up_progress(_user_id uuid)
RETURNS TABLE (
  subject_id uuid,
  subject_name text,
  total_lessons int,
  completed_lessons int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id,
         s.name,
         count(l.id)::int,
         count(l.id) FILTER (WHERE up.completed IS TRUE)::int
  FROM public.profiles p
  JOIN public.subjects s ON s.grade_id = p.grade_uuid
  LEFT JOIN public.lessons l ON l.subject_id = s.id
  LEFT JOIN public.user_progress up ON up.lesson_id = l.id AND up.user_id = p.user_id
  WHERE p.user_id = _user_id
    AND (
      EXISTS (SELECT 1 FROM public.subject_curriculum_tracks sct
               WHERE sct.subject_id = s.id AND sct.is_active
                 AND sct.curriculum_track_id = p.curriculum_track_id)
      OR (NOT EXISTS (SELECT 1 FROM public.subject_curriculum_tracks sct2
                       WHERE sct2.subject_id = s.id AND sct2.is_active)
          AND (s.curriculum_track_id IS NULL
               OR s.curriculum_track_id = p.curriculum_track_id))
    )
  GROUP BY s.id, s.name
$$;

REVOKE ALL ON FUNCTION public._up_progress(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._up_progress(uuid) FROM anon;

-- =====================================================================
-- STUDENT SURFACE — get_student_unified_performance()
--   auth.uid() only; NO _user_id parameter; single jsonb payload.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_student_unified_performance(
  _attempt_type text DEFAULT 'ALL',
  _limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_type  text := upper(coalesce(_attempt_type, 'ALL'));
  v_limit int  := least(greatest(coalesce(_limit, 50), 1), 200);
  v_out   jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF v_type NOT IN ('ALL', 'ORDINARY', 'MINISTERIAL', 'MINISTERIAL_TRAINING', 'MINISTERIAL_STRICT') THEN
    RAISE EXCEPTION 'invalid attempt_type';
  END IF;

  WITH sess AS (
    SELECT * FROM public._up_sessions(v_uid, NULL, NULL, v_type, NULL, NULL)
  ),
  finals AS (
    SELECT * FROM sess WHERE is_final_graded AND percentage IS NOT NULL
  ),
  ordered AS (
    SELECT f.*, row_number() OVER (ORDER BY attempt_at DESC NULLS LAST, session_id) AS rn_desc
    FROM finals f
  ),
  trend AS (
    SELECT (SELECT avg(percentage) FROM ordered WHERE rn_desc <= 3) AS recent_avg,
           (SELECT avg(percentage) FROM ordered WHERE rn_desc > 3) AS previous_avg
  ),
  occ AS (
    SELECT * FROM public._up_occurrences(v_uid, NULL, NULL, v_type, NULL, NULL)
  ),
  evaluated AS (
    SELECT * FROM occ WHERE state <> 'PENDING'
  ),
  prog AS (
    SELECT * FROM public._up_progress(v_uid)
  ),
  pairs AS (
    SELECT question_id,
           count(*) FILTER (WHERE state = 'WRONG')::int AS wrong_count,
           count(*) FILTER (WHERE state = 'BLANK')::int AS blank_count,
           count(*) FILTER (WHERE state IN ('WRONG', 'BLANK'))::int AS mistake_count,
           max(attempt_at) FILTER (WHERE state IN ('WRONG', 'BLANK')) AS last_mistake_at,
           max(attempt_at) FILTER (WHERE state = 'CORRECT') AS last_correct_at
    FROM evaluated
    GROUP BY question_id
    HAVING count(*) FILTER (WHERE state IN ('WRONG', 'BLANK')) > 0
  ),
  by_subject AS (
    SELECT sj.id AS subject_id,
           sj.name AS subject_name,
           coalesce(fs.attempts, 0)::int AS attempts,
           fs.avg_percentage,
           fs.best_percentage,
           coalesce(pr.total_lessons, 0)::int AS total_lessons,
           coalesce(pr.completed_lessons, 0)::int AS completed_lessons,
           CASE WHEN coalesce(pr.total_lessons, 0) > 0
                THEN round(pr.completed_lessons::numeric * 100 / pr.total_lessons, 1)
                ELSE NULL END AS lesson_completion_percentage,
           coalesce(os.evaluated, 0)::int AS evaluated_questions,
           CASE WHEN coalesce(os.evaluated, 0) > 0
                THEN round(os.wrong::numeric * 100 / os.evaluated, 1) ELSE NULL END AS wrong_rate,
           CASE WHEN coalesce(os.evaluated, 0) > 0
                THEN round(os.blank::numeric * 100 / os.evaluated, 1) ELSE NULL END AS blank_rate,
           CASE WHEN coalesce(os.evaluated, 0) > 0
                THEN round(os.correct::numeric * 100 / os.evaluated, 1) ELSE NULL END AS accuracy
    FROM public.subjects sj
    LEFT JOIN (
      SELECT subject_id, count(*)::int AS attempts,
             round(avg(percentage), 1) AS avg_percentage,
             max(percentage) AS best_percentage
      FROM finals WHERE subject_id IS NOT NULL GROUP BY subject_id
    ) fs ON fs.subject_id = sj.id
    LEFT JOIN prog pr ON pr.subject_id = sj.id
    LEFT JOIN (
      SELECT eff_subject_id AS subject_id,
             count(*)::int AS evaluated,
             count(*) FILTER (WHERE state = 'WRONG')::int AS wrong,
             count(*) FILTER (WHERE state = 'BLANK')::int AS blank,
             count(*) FILTER (WHERE state = 'CORRECT')::int AS correct
      FROM evaluated WHERE eff_subject_id IS NOT NULL GROUP BY eff_subject_id
    ) os ON os.subject_id = sj.id
    WHERE fs.subject_id IS NOT NULL OR pr.subject_id IS NOT NULL OR os.subject_id IS NOT NULL
  ),
  by_lesson AS (
    SELECT o.lesson_id,
           ls.title AS lesson_title,
           o.eff_subject_id AS subject_id,
           count(*)::int AS asked,
           count(*) FILTER (WHERE o.state <> 'PENDING')::int AS auto_graded,
           count(*) FILTER (WHERE o.state = 'CORRECT')::int AS correct,
           count(*) FILTER (WHERE o.state = 'WRONG')::int AS wrong,
           count(*) FILTER (WHERE o.state = 'BLANK')::int AS blank,
           count(*) FILTER (WHERE o.state = 'PENDING')::int AS manual_pending,
           CASE WHEN count(*) FILTER (WHERE o.state <> 'PENDING') > 0
                THEN round(count(*) FILTER (WHERE o.state = 'CORRECT')::numeric * 100
                           / count(*) FILTER (WHERE o.state <> 'PENDING'), 1)
                ELSE NULL END AS accuracy,
           bool_or(up.completed IS TRUE) AS lesson_completed
    FROM occ o
    JOIN public.lessons ls ON ls.id = o.lesson_id
    LEFT JOIN public.user_progress up ON up.lesson_id = o.lesson_id AND up.user_id = v_uid
    WHERE o.lesson_id IS NOT NULL
    GROUP BY o.lesson_id, ls.title, o.eff_subject_id
  )
  SELECT jsonb_build_object(
    'attempt_type', v_type,
    'summary', jsonb_build_object(
      'attempts_count', (SELECT count(*)::int FROM sess),
      'graded_attempts_count', (SELECT count(*)::int FROM finals),
      'pending_manual_count', (SELECT count(*)::int FROM sess WHERE is_pending_manual),
      'avg_percentage', (SELECT round(avg(percentage), 1) FROM finals),
      'best_percentage', (SELECT max(percentage) FROM finals),
      'latest_percentage', (SELECT percentage FROM ordered WHERE rn_desc = 1),
      'improvement_percentage_points',
        (SELECT CASE WHEN recent_avg IS NULL OR previous_avg IS NULL THEN NULL
                     ELSE round(recent_avg - previous_avg, 1) END FROM trend),
      'avg_elapsed_seconds', (SELECT round(avg(elapsed_seconds))::int FROM finals)
    ),
    'progress', jsonb_build_object(
      'total_lessons', (SELECT coalesce(sum(total_lessons), 0)::int FROM prog),
      'completed_lessons', (SELECT coalesce(sum(completed_lessons), 0)::int FROM prog),
      'completion_percentage', (SELECT CASE WHEN coalesce(sum(total_lessons), 0) > 0
             THEN round(sum(completed_lessons)::numeric * 100 / sum(total_lessons), 1)
             ELSE NULL END FROM prog)
    ),
    'assessment_breakdown', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'attempt_type')
      FROM (
        SELECT jsonb_build_object(
                 'attempt_type', attempt_type,
                 'attempts', count(*)::int,
                 'avg_percentage', round(avg(percentage), 1),
                 'best_percentage', max(percentage)
               ) AS x
        FROM finals GROUP BY attempt_type
      ) t
    ), '[]'::jsonb),
    'by_subject', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'subject_id', subject_id, 'subject_name', subject_name,
               'attempts', attempts, 'avg_percentage', avg_percentage,
               'best_percentage', best_percentage,
               'lesson_completion_percentage', lesson_completion_percentage,
               'total_lessons', total_lessons, 'completed_lessons', completed_lessons,
               'evaluated_questions', evaluated_questions,
               'accuracy', accuracy, 'wrong_rate', wrong_rate, 'blank_rate', blank_rate
             ) ORDER BY subject_name)
      FROM by_subject
    ), '[]'::jsonb),
    'by_lesson', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'lesson_id', lesson_id, 'lesson_title', lesson_title,
               'subject_id', subject_id, 'asked', asked, 'auto_graded', auto_graded,
               'correct', correct, 'wrong', wrong, 'blank', blank,
               'manual_pending', manual_pending, 'accuracy', accuracy,
               'completion_state', CASE WHEN lesson_completed THEN 'COMPLETED' ELSE 'NOT_COMPLETED' END
             ) ORDER BY accuracy NULLS LAST, asked DESC)
      FROM (SELECT * FROM by_lesson ORDER BY accuracy NULLS LAST, asked DESC LIMIT v_limit) bl
    ), '[]'::jsonb),
    'strengths', jsonb_build_object(
      'lessons', coalesce((
        SELECT jsonb_agg(jsonb_build_object('lesson_id', lesson_id, 'lesson_title', lesson_title,
                 'asked', asked, 'accuracy', accuracy) ORDER BY accuracy DESC)
        FROM by_lesson WHERE accuracy IS NOT NULL AND accuracy >= 80 AND auto_graded >= 3
      ), '[]'::jsonb),
      'subjects', coalesce((
        SELECT jsonb_agg(jsonb_build_object('subject_id', subject_id, 'subject_name', subject_name,
                 'accuracy', accuracy) ORDER BY accuracy DESC)
        FROM by_subject WHERE accuracy IS NOT NULL AND accuracy >= 80 AND evaluated_questions >= 3
      ), '[]'::jsonb)
    ),
    'weaknesses', jsonb_build_object(
      'lessons', coalesce((
        SELECT jsonb_agg(jsonb_build_object('lesson_id', lesson_id, 'lesson_title', lesson_title,
                 'asked', asked, 'accuracy', accuracy) ORDER BY accuracy ASC)
        FROM by_lesson WHERE accuracy IS NOT NULL AND accuracy < 60 AND auto_graded >= 3
      ), '[]'::jsonb),
      'subjects', coalesce((
        SELECT jsonb_agg(jsonb_build_object('subject_id', subject_id, 'subject_name', subject_name,
                 'accuracy', accuracy) ORDER BY accuracy ASC)
        FROM by_subject WHERE accuracy IS NOT NULL AND accuracy < 60 AND evaluated_questions >= 3
      ), '[]'::jsonb)
    ),
    'mistake_patterns', jsonb_build_object(
      'unique_mistakes', (SELECT count(*)::int FROM pairs),
      'repeated_mistakes', (SELECT count(*)::int FROM pairs WHERE mistake_count > 1),
      'blank_questions', (SELECT count(*)::int FROM pairs WHERE blank_count > 0),
      'mastered_later', (SELECT count(*)::int FROM pairs
                          WHERE last_correct_at IS NOT NULL AND last_correct_at > last_mistake_at),
      'wrong_rate', (SELECT CASE WHEN count(*) > 0
             THEN round(count(*) FILTER (WHERE state = 'WRONG')::numeric * 100 / count(*), 1)
             ELSE NULL END FROM evaluated),
      'blank_rate', (SELECT CASE WHEN count(*) > 0
             THEN round(count(*) FILTER (WHERE state = 'BLANK')::numeric * 100 / count(*), 1)
             ELSE NULL END FROM evaluated),
      'unlinked_questions', (SELECT count(*)::int FROM occ WHERE lesson_id IS NULL)
    )
  ) INTO v_out;

  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.get_student_unified_performance(text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_unified_performance(text, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_unified_performance(text, int) TO authenticated;

COMMENT ON FUNCTION public.get_student_unified_performance(text, int) IS
  '15C unified student performance. auth.uid() only, percentage-normalised, '
  'manual-pending excluded from averages, historical pinned lesson attribution, '
  'ministerial track isolation. Never returns answer keys or correctness flags.';

-- =====================================================================
-- ADMIN SURFACE — get_admin_unified_performance(...)
--   aggregate only; full admin guard; no student identities.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_admin_unified_performance(
  _grade_id uuid DEFAULT NULL,
  _track_id uuid DEFAULT NULL,
  _subject_id uuid DEFAULT NULL,
  _lesson_id uuid DEFAULT NULL,
  _attempt_type text DEFAULT 'ALL',
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _limit int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_type  text := upper(coalesce(_attempt_type, 'ALL'));
  v_limit int  := least(greatest(coalesce(_limit, 20), 1), 100);
  v_k     int  := 3;   -- privacy threshold for group rows (re-identification)
  v_out   jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_full_admin(v_uid) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF v_type NOT IN ('ALL', 'ORDINARY', 'MINISTERIAL', 'MINISTERIAL_TRAINING', 'MINISTERIAL_STRICT') THEN
    RAISE EXCEPTION 'invalid attempt_type';
  END IF;

  WITH sess_all AS (
    SELECT * FROM public._up_sessions(NULL, _grade_id, _track_id, v_type, _from, _to)
  ),
  sess AS (
    SELECT * FROM sess_all
    WHERE (_subject_id IS NULL OR subject_id = _subject_id)
  ),
  finals AS (
    SELECT * FROM sess WHERE is_final_graded AND percentage IS NOT NULL
  ),
  occ AS (
    SELECT * FROM public._up_occurrences(NULL, _grade_id, _track_id, v_type, _from, _to)
    WHERE (_subject_id IS NULL OR eff_subject_id = _subject_id)
      AND (_lesson_id IS NULL OR lesson_id = _lesson_id)
  ),
  evaluated AS (
    SELECT * FROM occ WHERE state <> 'PENDING'
  ),
  pairs AS (
    SELECT student_id, question_id, eff_subject_id, lesson_id,
           count(*) FILTER (WHERE state IN ('WRONG', 'BLANK'))::int AS mistake_count,
           max(attempt_at) FILTER (WHERE state IN ('WRONG', 'BLANK')) AS last_mistake_at,
           max(attempt_at) FILTER (WHERE state = 'CORRECT') AS last_correct_at
    FROM evaluated
    GROUP BY student_id, question_id, eff_subject_id, lesson_id
    HAVING count(*) FILTER (WHERE state IN ('WRONG', 'BLANK')) > 0
  ),
  prog AS (
    SELECT pr.*
    FROM (SELECT DISTINCT p.user_id
          FROM public.profiles p
          WHERE (_grade_id IS NULL OR p.grade_uuid = _grade_id)
            AND (_track_id IS NULL OR p.curriculum_track_id = _track_id)) s
    CROSS JOIN LATERAL public._up_progress(s.user_id) pr
    WHERE (_subject_id IS NULL OR pr.subject_id = _subject_id)
  ),
  ordered AS (
    SELECT f.*, row_number() OVER (PARTITION BY student_id ORDER BY attempt_at DESC NULLS LAST, session_id) AS rn_desc
    FROM finals f
  ),
  trend AS (
    SELECT student_id,
           avg(percentage) FILTER (WHERE rn_desc <= 3) AS recent_avg,
           avg(percentage) FILTER (WHERE rn_desc > 3) AS previous_avg,
           (SELECT eff_subject_id FROM evaluated e WHERE e.student_id = o.student_id
             ORDER BY attempt_at DESC LIMIT 1) AS last_subject_id
    FROM ordered o GROUP BY student_id
  ),
  subj_group AS (
    SELECT sj.id AS subject_id, sj.name AS subject_name,
           (SELECT count(DISTINCT student_id)::int FROM finals f WHERE f.subject_id = sj.id) AS students_count,
           (SELECT count(*)::int FROM finals f WHERE f.subject_id = sj.id) AS attempts,
           (SELECT round(avg(percentage), 1) FROM finals f WHERE f.subject_id = sj.id) AS avg_percentage,
           (SELECT count(*)::int FROM evaluated e WHERE e.eff_subject_id = sj.id) AS evaluated_questions,
           (SELECT count(*) FILTER (WHERE state = 'WRONG')::int FROM evaluated e WHERE e.eff_subject_id = sj.id) AS wrong_q,
           (SELECT count(*) FILTER (WHERE state = 'BLANK')::int FROM evaluated e WHERE e.eff_subject_id = sj.id) AS blank_q,
           (SELECT coalesce(sum(total_lessons), 0)::int FROM prog p WHERE p.subject_id = sj.id) AS total_lessons,
           (SELECT coalesce(sum(completed_lessons), 0)::int FROM prog p WHERE p.subject_id = sj.id) AS completed_lessons
    FROM public.subjects sj
    WHERE (_subject_id IS NULL OR sj.id = _subject_id)
  ),
  subj_rows AS (
    SELECT g.*,
           CASE WHEN evaluated_questions > 0 THEN round(wrong_q::numeric * 100 / evaluated_questions, 1) END AS wrong_rate,
           CASE WHEN evaluated_questions > 0 THEN round(blank_q::numeric * 100 / evaluated_questions, 1) END AS blank_rate,
           CASE WHEN total_lessons > 0 THEN round(completed_lessons::numeric * 100 / total_lessons, 1) END AS completion_percentage
    FROM subj_group g
    WHERE (attempts > 0 OR evaluated_questions > 0) AND students_count >= v_k
  ),
  lesson_group AS (
    SELECT e.lesson_id, ls.title AS lesson_title, e.eff_subject_id AS subject_id,
           count(DISTINCT e.student_id)::int AS students_count,
           count(*)::int AS evaluated_questions,
           count(*) FILTER (WHERE e.state = 'CORRECT')::int AS correct_q,
           count(*) FILTER (WHERE e.state = 'WRONG')::int AS wrong_q,
           count(*) FILTER (WHERE e.state = 'BLANK')::int AS blank_q
    FROM evaluated e
    JOIN public.lessons ls ON ls.id = e.lesson_id
    WHERE e.lesson_id IS NOT NULL
    GROUP BY e.lesson_id, ls.title, e.eff_subject_id
  ),
  lesson_rows AS (
    SELECT g.*,
           round(correct_q::numeric * 100 / NULLIF(evaluated_questions, 0), 1) AS accuracy,
           round(wrong_q::numeric * 100 / NULLIF(evaluated_questions, 0), 1) AS wrong_rate,
           round(blank_q::numeric * 100 / NULLIF(evaluated_questions, 0), 1) AS blank_rate,
           (SELECT count(*)::int FROM pairs p WHERE p.lesson_id = g.lesson_id AND p.mistake_count > 1) AS repeated_pairs,
           (SELECT count(*)::int FROM pairs p WHERE p.lesson_id = g.lesson_id) AS mistake_pairs
    FROM lesson_group g
    WHERE students_count >= v_k
  )
  SELECT jsonb_build_object(
    'attempt_type', v_type,
    'privacy_min_group_size', v_k,
    'summary', jsonb_build_object(
      'attempts_count', (SELECT count(*)::int FROM sess),
      'graded_attempts_count', (SELECT count(*)::int FROM finals),
      'pending_manual_count', (SELECT count(*)::int FROM sess WHERE is_pending_manual),
      'avg_percentage', (SELECT round(avg(percentage), 1) FROM finals),
      'best_percentage', (SELECT max(percentage) FROM finals),
      'avg_elapsed_seconds', (SELECT round(avg(elapsed_seconds))::int FROM finals),
      'completion_percentage', (SELECT CASE WHEN coalesce(sum(total_lessons), 0) > 0
             THEN round(sum(completed_lessons)::numeric * 100 / sum(total_lessons), 1) ELSE NULL END FROM prog),
      'wrong_rate', (SELECT CASE WHEN count(*) > 0
             THEN round(count(*) FILTER (WHERE state = 'WRONG')::numeric * 100 / count(*), 1) END FROM evaluated),
      'blank_rate', (SELECT CASE WHEN count(*) > 0
             THEN round(count(*) FILTER (WHERE state = 'BLANK')::numeric * 100 / count(*), 1) END FROM evaluated),
      'mastered_later_rate', (SELECT CASE WHEN count(*) > 0
             THEN round(count(*) FILTER (WHERE last_correct_at IS NOT NULL
                                           AND last_correct_at > last_mistake_at)::numeric * 100 / count(*), 1) END
           FROM pairs),
      'repeated_mistake_rate', (SELECT CASE WHEN count(*) > 0
             THEN round(count(*) FILTER (WHERE mistake_count > 1)::numeric * 100 / count(*), 1) END FROM pairs)
    ),
    'by_attempt_type', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'attempt_type') FROM (
        SELECT jsonb_build_object('attempt_type', attempt_type, 'attempts', count(*)::int,
                 'students_count', count(DISTINCT student_id)::int,
                 'avg_percentage', round(avg(percentage), 1)) AS x
        FROM finals GROUP BY attempt_type HAVING count(DISTINCT student_id) >= v_k
      ) t), '[]'::jsonb),
    'by_grade', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'grade_name') FROM (
        SELECT jsonb_build_object('grade_id', f.grade_id, 'grade_name', g.name,
                 'attempts', count(*)::int, 'students_count', count(DISTINCT f.student_id)::int,
                 'avg_percentage', round(avg(f.percentage), 1)) AS x
        FROM finals f LEFT JOIN public.grades g ON g.id = f.grade_id
        WHERE f.grade_id IS NOT NULL
        GROUP BY f.grade_id, g.name HAVING count(DISTINCT f.student_id) >= v_k
      ) t), '[]'::jsonb),
    'by_track', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'track_name') FROM (
        SELECT jsonb_build_object('track_id', f.track_id, 'track_name', ct.track_name,
                 'attempts', count(*)::int, 'students_count', count(DISTINCT f.student_id)::int,
                 'avg_percentage', round(avg(f.percentage), 1)) AS x
        FROM finals f LEFT JOIN public.curriculum_tracks ct ON ct.id = f.track_id
        WHERE f.track_id IS NOT NULL
        GROUP BY f.track_id, ct.track_name HAVING count(DISTINCT f.student_id) >= v_k
      ) t), '[]'::jsonb),
    'by_subject', coalesce((
      SELECT jsonb_agg(jsonb_build_object('subject_id', subject_id, 'subject_name', subject_name,
               'students_count', students_count, 'attempts', attempts,
               'avg_percentage', avg_percentage, 'completion_percentage', completion_percentage,
               'wrong_rate', wrong_rate, 'blank_rate', blank_rate) ORDER BY subject_name)
      FROM subj_rows), '[]'::jsonb),
    'by_lesson', coalesce((
      SELECT jsonb_agg(jsonb_build_object('lesson_id', lesson_id, 'lesson_title', lesson_title,
               'subject_id', subject_id, 'students_count', students_count,
               'evaluated_questions', evaluated_questions, 'accuracy', accuracy,
               'wrong_rate', wrong_rate, 'blank_rate', blank_rate) ORDER BY accuracy NULLS LAST)
      FROM (SELECT * FROM lesson_rows ORDER BY accuracy NULLS LAST LIMIT v_limit) l), '[]'::jsonb),
    'weakest_subjects', coalesce((
      SELECT jsonb_agg(jsonb_build_object('subject_id', subject_id, 'subject_name', subject_name,
               'avg_percentage', avg_percentage, 'wrong_rate', wrong_rate) ORDER BY avg_percentage ASC NULLS LAST)
      FROM (SELECT * FROM subj_rows WHERE avg_percentage IS NOT NULL
            ORDER BY avg_percentage ASC LIMIT v_limit) s), '[]'::jsonb),
    'weakest_lessons', coalesce((
      SELECT jsonb_agg(jsonb_build_object('lesson_id', lesson_id, 'lesson_title', lesson_title,
               'accuracy', accuracy, 'students_count', students_count) ORDER BY accuracy ASC)
      FROM (SELECT * FROM lesson_rows WHERE accuracy IS NOT NULL
            ORDER BY accuracy ASC LIMIT v_limit) l), '[]'::jsonb),
    'highest_blank_rate', coalesce((
      SELECT jsonb_agg(jsonb_build_object('lesson_id', lesson_id, 'lesson_title', lesson_title,
               'blank_rate', blank_rate, 'students_count', students_count) ORDER BY blank_rate DESC)
      FROM (SELECT * FROM lesson_rows WHERE blank_rate IS NOT NULL AND blank_rate > 0
            ORDER BY blank_rate DESC LIMIT v_limit) l), '[]'::jsonb),
    'highest_repeated_mistake_rate', coalesce((
      SELECT jsonb_agg(jsonb_build_object('lesson_id', lesson_id, 'lesson_title', lesson_title,
               'repeated_mistake_rate', round(repeated_pairs::numeric * 100 / NULLIF(mistake_pairs, 0), 1),
               'students_count', students_count)
             ORDER BY round(repeated_pairs::numeric * 100 / NULLIF(mistake_pairs, 0), 1) DESC NULLS LAST)
      FROM (SELECT * FROM lesson_rows WHERE mistake_pairs > 0
            ORDER BY repeated_pairs::numeric / NULLIF(mistake_pairs, 0) DESC LIMIT v_limit) l), '[]'::jsonb),
    'strongest_improvement_areas', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'improvement_percentage_points')::numeric DESC) FROM (
        SELECT jsonb_build_object('subject_id', t.last_subject_id, 'subject_name', sj.name,
                 'students_count', count(*)::int,
                 'improvement_percentage_points', round(avg(t.recent_avg - t.previous_avg), 1)) AS x
        FROM trend t LEFT JOIN public.subjects sj ON sj.id = t.last_subject_id
        WHERE t.recent_avg IS NOT NULL AND t.previous_avg IS NOT NULL
        GROUP BY t.last_subject_id, sj.name
        HAVING count(*) >= v_k AND avg(t.recent_avg - t.previous_avg) > 0
      ) z), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.get_admin_unified_performance(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_unified_performance(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_unified_performance(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, int) TO authenticated;

COMMENT ON FUNCTION public.get_admin_unified_performance(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, int) IS
  '15C unified admin performance insights. Full-admin only, aggregate ONLY '
  '(no user ids, no student names, min group size 3), same derived source of '
  'truth as the student surface. Never returns answer keys or correctness flags.';