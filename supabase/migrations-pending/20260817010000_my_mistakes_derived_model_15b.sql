-- =====================================================================
-- TAMKEEN_MY_MISTAKES_DERIVED_MODEL_15B
--
-- "دفتر أخطائي" — DERIVED read model over the EXISTING attempt data.
--   * NO new mistake table, no materialized copy, no duplicated question
--     text / answers / correctness.
--   * Only two SECURITY DEFINER RPCs so the student can read the safe
--     projection of tables they must never SELECT directly
--     (question_revisions / question_targets / question_options /
--      ministerial_exam_questions).
--
-- Guards:
--   * auth.uid() required (anon DENY); NO _user_id parameter anywhere.
--   * ministerial sessions are scoped to the student's current track (14D–14H).
--   * historical truth only: every occurrence keeps its pinned
--     question_revision_id and the target of THAT revision.
--   * ZERO answer key: no is_correct, no correct_option_code, no accepted
--     answers, no hidden solution in any payload.
--   * server-side pagination with an explicit total (no silent 1000 cap).
-- =====================================================================

-- ---------------------------------------------------------------------
-- internal: safe option projection from a pinned snapshot
-- (option_code + body only — never any correctness marker)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._my_mistakes_safe_options(_rendered jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (SELECT jsonb_agg(jsonb_build_object(
              'option_code', e->>'option_code',
              'body', e->>'body'
            ) ORDER BY ord)
     FROM jsonb_array_elements(coalesce(_rendered, '[]'::jsonb)) WITH ORDINALITY AS t(e, ord)),
    '[]'::jsonb)
$$;

REVOKE ALL ON FUNCTION public._my_mistakes_safe_options(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._my_mistakes_safe_options(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public._my_mistakes_safe_options(jsonb) TO authenticated;

-- =====================================================================
-- list_my_mistakes
-- =====================================================================
CREATE OR REPLACE FUNCTION public.list_my_mistakes(
  _subject_id uuid DEFAULT NULL,
  _lesson_id uuid DEFAULT NULL,
  _attempt_scope text DEFAULT 'ALL',
  _status text DEFAULT 'ALL',
  _sort text DEFAULT 'recent',
  _limit int DEFAULT 20,
  _offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_track  uuid;
  v_scope  text := upper(coalesce(_attempt_scope, 'ALL'));
  v_status text := upper(coalesce(_status, 'ALL'));
  v_sort   text := lower(coalesce(_sort, 'recent'));
  v_limit  int  := least(greatest(coalesce(_limit, 20), 1), 100);
  v_offset int  := greatest(coalesce(_offset, 0), 0);
  v_total  int  := 0;
  v_items  jsonb := '[]'::jsonb;
  v_subjects jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF v_scope NOT IN ('ALL', 'ORDINARY', 'MINISTERIAL') THEN
    RAISE EXCEPTION 'invalid attempt_scope';
  END IF;
  IF v_status NOT IN ('ALL', 'WRONG', 'BLANK', 'REPEATED', 'MASTERED_LATER') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  IF v_sort NOT IN ('recent', 'most_repeated') THEN
    RAISE EXCEPTION 'invalid sort';
  END IF;

  v_track := public.current_student_track_id();

  -- Whole derived set for this student (read-only; no temp tables so the RPC
  -- stays callable inside PostgREST's read-only transactions).
  WITH sess AS (
    SELECT es.id,
           coalesce(es.completed_at, es.submitted_at, es.created_at) AS attempt_at,
           CASE WHEN es.ministerial_model_id IS NOT NULL THEN 'MINISTERIAL' ELSE 'ORDINARY' END AS scope,
           CASE WHEN es.ministerial_model_id IS NOT NULL
                THEN coalesce(es.ministerial_attempt_mode, 'ministry')
                ELSE coalesce(es.mode::text, 'exam') END AS attempt_type,
           t.subject_id AS template_subject_id
    FROM public.exam_sessions es
    LEFT JOIN public.exam_templates t ON t.id = es.template_id
    LEFT JOIN public.ministerial_exam_models m ON m.id = es.ministerial_model_id
    WHERE es.user_id = v_uid
      AND es.status IN ('submitted', 'expired')
      AND es.grading_status = 'GRADED'
      -- ministerial track isolation (cross-track = DENY)
      AND (es.ministerial_model_id IS NULL
           OR (v_track IS NOT NULL AND m.curriculum_track_id = v_track))
  ),
  occ AS (
    SELECT s.id AS session_id,
           s.attempt_at,
           s.scope,
           s.attempt_type,
           s.template_subject_id,
           esq.logical_question_id AS question_id,
           esq.question_revision_id,
           esq.rendered_question_text,
           CASE
             WHEN a.requires_manual_review IS TRUE
               OR (a.id IS NOT NULL AND coalesce(a.grading_status, '') <> 'GRADED') THEN 'PENDING'
             WHEN a.id IS NULL
               OR (a.selected_option_code IS NULL AND coalesce(a.response_text, '') = '') THEN 'BLANK'
             WHEN a.is_correct IS TRUE THEN 'CORRECT'
             WHEN a.is_correct IS FALSE THEN 'WRONG'
             ELSE 'PENDING'
           END AS state
    FROM sess s
    JOIN public.exam_session_questions esq ON esq.exam_session_id = s.id
    LEFT JOIN public.exam_session_answers a ON a.exam_session_question_id = esq.id
    WHERE esq.logical_question_id IS NOT NULL
      AND (v_scope = 'ALL' OR s.scope = v_scope)
  ),
  occ_t AS (
    SELECT o.*,
           coalesce(qt.subject_id, o.template_subject_id) AS eff_subject_id,
           qt.lesson_id
    FROM occ o
    LEFT JOIN LATERAL (
      -- historical attribution: the target of the PINNED revision
      SELECT t.subject_id, t.lesson_id
      FROM public.question_targets t
      WHERE t.revision_id = o.question_revision_id
      ORDER BY t.is_primary DESC, t.created_at ASC
      LIMIT 1
    ) qt ON true
  ),
  agg AS (
    SELECT question_id,
           count(*) FILTER (WHERE state = 'WRONG')::int AS wrong_count,
           count(*) FILTER (WHERE state = 'BLANK')::int AS blank_count,
           count(*) FILTER (WHERE state IN ('WRONG', 'BLANK'))::int AS occurrence_count,
           min(attempt_at) FILTER (WHERE state IN ('WRONG', 'BLANK')) AS first_mistake_at,
           max(attempt_at) FILTER (WHERE state IN ('WRONG', 'BLANK')) AS last_mistake_at,
           max(attempt_at) FILTER (WHERE state = 'CORRECT') AS last_correct_at
    FROM occ_t
    GROUP BY question_id
    HAVING count(*) FILTER (WHERE state IN ('WRONG', 'BLANK')) > 0
  ),
  latest AS (
    SELECT DISTINCT ON (question_id)
           question_id, session_id, question_revision_id, rendered_question_text,
           eff_subject_id, lesson_id, attempt_type, scope, state
    FROM occ_t
    WHERE state IN ('WRONG', 'BLANK')
    ORDER BY question_id, attempt_at DESC, session_id
  ),
  rows_all AS (
    SELECT a.question_id,
           l.question_revision_id AS display_revision_id,
           l.rendered_question_text AS question_text,
           l.eff_subject_id AS subject_id,
           sj.name AS subject_name,
           l.lesson_id,
           ls.title AS lesson_title,
           a.wrong_count,
           a.blank_count,
           a.occurrence_count,
           a.first_mistake_at,
           a.last_mistake_at,
           CASE WHEN a.last_correct_at IS NOT NULL AND a.last_correct_at > a.last_mistake_at
                THEN 'MASTERED_LATER' ELSE l.state END AS latest_state,
           l.attempt_type AS latest_attempt_type,
           l.scope AS latest_attempt_scope,
           l.session_id AS latest_session_id,
           a.occurrence_count > 1 AS has_repeated_mistake
    FROM agg a
    JOIN latest l ON l.question_id = a.question_id
    LEFT JOIN public.subjects sj ON sj.id = l.eff_subject_id
    LEFT JOIN public.lessons ls ON ls.id = l.lesson_id
  ),
  filtered AS (
    SELECT * FROM rows_all r
    WHERE (_subject_id IS NULL OR r.subject_id = _subject_id)
      AND (_lesson_id IS NULL OR r.lesson_id = _lesson_id)
      AND (v_status = 'ALL'
           OR (v_status = 'REPEATED' AND r.has_repeated_mistake)
           OR (v_status <> 'REPEATED' AND r.latest_state = v_status))
  ),
  page AS (
    SELECT * FROM filtered
    ORDER BY
      CASE WHEN v_sort = 'most_repeated' THEN occurrence_count END DESC NULLS LAST,
      last_mistake_at DESC NULLS LAST,
      question_id
    LIMIT v_limit OFFSET v_offset
  ),
  facets AS (
    SELECT coalesce(jsonb_agg(x ORDER BY nm), '[]'::jsonb) AS subjects
    FROM (
      SELECT coalesce(subject_name, '') AS nm,
             jsonb_build_object(
               'subject_id', subject_id,
               'subject_name', subject_name,
               'count', count(*)::int
             ) AS x
      FROM rows_all
      WHERE subject_id IS NOT NULL
      GROUP BY subject_id, subject_name
    ) s
  )
  SELECT
    coalesce((SELECT jsonb_agg(jsonb_build_object(
        'question_id', p.question_id,
        'display_revision_id', p.display_revision_id,
        'question_text', p.question_text,
        'subject_id', p.subject_id,
        'subject_name', p.subject_name,
        'lesson_id', p.lesson_id,
        'lesson_title', p.lesson_title,
        'wrong_count', p.wrong_count,
        'blank_count', p.blank_count,
        'occurrence_count', p.occurrence_count,
        'first_mistake_at', p.first_mistake_at,
        'last_mistake_at', p.last_mistake_at,
        'latest_state', p.latest_state,
        'latest_attempt_type', p.latest_attempt_type,
        'latest_attempt_scope', p.latest_attempt_scope,
        'latest_session_id', p.latest_session_id,
        'has_repeated_mistake', p.has_repeated_mistake,
        'can_review_lesson', p.lesson_id IS NOT NULL,
        'can_open_attempt', p.latest_session_id IS NOT NULL
      ) ORDER BY
        CASE WHEN v_sort = 'most_repeated' THEN p.occurrence_count END DESC NULLS LAST,
        p.last_mistake_at DESC NULLS LAST,
        p.question_id)
      FROM page p), '[]'::jsonb),
    (SELECT count(*)::int FROM filtered),
    (SELECT subjects FROM facets)
  INTO v_items, v_total, v_subjects;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'has_more', (v_offset + v_limit) < v_total,
    'subjects', v_subjects,
    'filters', jsonb_build_object(
      'subject_id', _subject_id,
      'lesson_id', _lesson_id,
      'attempt_scope', v_scope,
      'status', v_status,
      'sort', v_sort
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.list_my_mistakes(uuid, uuid, text, text, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_my_mistakes(uuid, uuid, text, text, text, int, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_my_mistakes(uuid, uuid, text, text, text, int, int) TO authenticated;

COMMENT ON FUNCTION public.list_my_mistakes(uuid, uuid, text, text, text, int, int) IS
  '15B derived mistake notebook. Own data only (auth.uid()), ministerial track isolated, '
  'historical pinned revisions, server-side pagination, zero answer-key exposure.';

-- =====================================================================
-- get_my_mistake_detail
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_my_mistake_detail(_question_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_track uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF _question_id IS NULL THEN
    RAISE EXCEPTION 'question_id required';
  END IF;

  v_track := public.current_student_track_id();

  WITH sess AS (
    SELECT es.id,
           coalesce(es.completed_at, es.submitted_at, es.created_at) AS attempt_at,
           CASE WHEN es.ministerial_model_id IS NOT NULL THEN 'MINISTERIAL' ELSE 'ORDINARY' END AS scope,
           CASE WHEN es.ministerial_model_id IS NOT NULL
                THEN coalesce(es.ministerial_attempt_mode, 'ministry')
                ELSE coalesce(es.mode::text, 'exam') END AS attempt_type,
           t.subject_id AS template_subject_id
    FROM public.exam_sessions es
    LEFT JOIN public.exam_templates t ON t.id = es.template_id
    LEFT JOIN public.ministerial_exam_models m ON m.id = es.ministerial_model_id
    WHERE es.user_id = v_uid
      AND es.status IN ('submitted', 'expired')
      AND es.grading_status = 'GRADED'
      AND (es.ministerial_model_id IS NULL
           OR (v_track IS NOT NULL AND m.curriculum_track_id = v_track))
  ),
  occ AS (
    SELECT s.id AS session_id,
           s.attempt_at,
           s.scope,
           s.attempt_type,
           s.template_subject_id,
           esq.question_revision_id,
           esq.rendered_question_text,
           esq.rendered_options,
           a.selected_option_code,
           CASE
             WHEN a.requires_manual_review IS TRUE
               OR (a.id IS NOT NULL AND coalesce(a.grading_status, '') <> 'GRADED') THEN 'PENDING'
             WHEN a.id IS NULL
               OR (a.selected_option_code IS NULL AND coalesce(a.response_text, '') = '') THEN 'BLANK'
             WHEN a.is_correct IS TRUE THEN 'CORRECT'
             WHEN a.is_correct IS FALSE THEN 'WRONG'
             ELSE 'PENDING'
           END AS state
    FROM sess s
    JOIN public.exam_session_questions esq ON esq.exam_session_id = s.id
    LEFT JOIN public.exam_session_answers a ON a.exam_session_question_id = esq.id
    WHERE esq.logical_question_id = _question_id
  ),
  occ_t AS (
    SELECT o.*,
           coalesce(qt.subject_id, o.template_subject_id) AS eff_subject_id,
           qt.lesson_id
    FROM occ o
    LEFT JOIN LATERAL (
      SELECT t.subject_id, t.lesson_id
      FROM public.question_targets t
      WHERE t.revision_id = o.question_revision_id
      ORDER BY t.is_primary DESC, t.created_at ASC
      LIMIT 1
    ) qt ON true
  ),
  latest AS (
    SELECT * FROM occ_t
    WHERE state IN ('WRONG', 'BLANK')
    ORDER BY attempt_at DESC, session_id
    LIMIT 1
  ),
  stats AS (
    SELECT count(*) FILTER (WHERE state = 'WRONG')::int AS wrong_count,
           count(*) FILTER (WHERE state = 'BLANK')::int AS blank_count,
           count(*) FILTER (WHERE state IN ('WRONG', 'BLANK'))::int AS occurrence_count,
           min(attempt_at) FILTER (WHERE state IN ('WRONG', 'BLANK')) AS first_mistake_at,
           max(attempt_at) FILTER (WHERE state IN ('WRONG', 'BLANK')) AS last_mistake_at,
           max(attempt_at) FILTER (WHERE state = 'CORRECT') AS last_correct_at
    FROM occ_t
  )
  SELECT jsonb_build_object(
           'question_id', _question_id,
           'display_revision_id', l.question_revision_id,
           'question_text', l.rendered_question_text,
           'displayed_options', public._my_mistakes_safe_options(l.rendered_options),
           'my_selected_option_code', l.selected_option_code,
           'subject_id', l.eff_subject_id,
           'subject_name', sj.name,
           'lesson_id', l.lesson_id,
           'lesson_title', ls.title,
           'wrong_count', st.wrong_count,
           'blank_count', st.blank_count,
           'occurrence_count', st.occurrence_count,
           'first_mistake_at', st.first_mistake_at,
           'last_mistake_at', st.last_mistake_at,
           'latest_state', CASE WHEN st.last_correct_at IS NOT NULL
                                 AND st.last_correct_at > st.last_mistake_at
                                THEN 'MASTERED_LATER' ELSE l.state END,
           'latest_attempt_type', l.attempt_type,
           'latest_attempt_scope', l.scope,
           'latest_session_id', l.session_id,
           'has_repeated_mistake', st.occurrence_count > 1,
           'can_review_lesson', l.lesson_id IS NOT NULL,
           'can_open_attempt', l.session_id IS NOT NULL,
           'occurrences', coalesce((
             SELECT jsonb_agg(jsonb_build_object(
                      'session_id', o.session_id,
                      'attempt_at', o.attempt_at,
                      'attempt_type', o.attempt_type,
                      'attempt_scope', o.scope,
                      'revision_id', o.question_revision_id,
                      'state', o.state,
                      'my_selected_option_code', o.selected_option_code
                    ) ORDER BY o.attempt_at DESC)
             FROM occ_t o
             WHERE o.state <> 'PENDING'
           ), '[]'::jsonb)
         )
  INTO v_result
  FROM latest l
  CROSS JOIN stats st
  LEFT JOIN public.subjects sj ON sj.id = l.eff_subject_id
  LEFT JOIN public.lessons ls ON ls.id = l.lesson_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.get_my_mistake_detail(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_mistake_detail(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_mistake_detail(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_my_mistake_detail(uuid) IS
  '15B mistake detail. Historical occurrences from pinned revisions only. '
  'Never returns the correct answer, is_correct flags or hidden solutions.';

-- =====================================================================
-- TAMKEEN_MY_MISTAKES_ADMIN_INSIGHTS_15B_A
--
-- Admin aggregate insights over the SAME derived source of truth used by
-- the student notebook (exam_sessions / exam_session_questions /
-- exam_session_answers + pinned revisions + historical targets).
--   * NO new table, no materialized copy.
--   * full admin ONLY (is_full_admin); student/anon DENY.
--   * AGGREGATE ONLY: never returns user_id, student names or per-student
--     rows; never returns correct_option / answer keys / is_correct flags /
--     hidden solutions.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_admin_mistake_insights(
  _grade_id uuid DEFAULT NULL,
  _track_id uuid DEFAULT NULL,
  _subject_id uuid DEFAULT NULL,
  _lesson_id uuid DEFAULT NULL,
  _attempt_scope text DEFAULT 'ALL',
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
  v_scope text := upper(coalesce(_attempt_scope, 'ALL'));
  v_limit int  := least(greatest(coalesce(_limit, 20), 1), 100);
  v_out   jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_full_admin(v_uid) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF v_scope NOT IN ('ALL', 'ORDINARY', 'MINISTERIAL') THEN
    RAISE EXCEPTION 'invalid attempt_scope';
  END IF;

  WITH sess AS (
    SELECT es.id,
           es.user_id,
           coalesce(es.completed_at, es.submitted_at, es.created_at) AS attempt_at,
           CASE WHEN es.ministerial_model_id IS NOT NULL THEN 'MINISTERIAL' ELSE 'ORDINARY' END AS scope,
           t.subject_id AS template_subject_id,
           p.grade_uuid AS grade_id,
           p.curriculum_track_id AS track_id
    FROM public.exam_sessions es
    LEFT JOIN public.exam_templates t ON t.id = es.template_id
    LEFT JOIN public.ministerial_exam_models m ON m.id = es.ministerial_model_id
    LEFT JOIN public.profiles p ON p.user_id = es.user_id
    WHERE es.status IN ('submitted', 'expired')
      AND es.grading_status = 'GRADED'
      -- same track-consistency rule the student notebook applies
      AND (es.ministerial_model_id IS NULL
           OR (p.curriculum_track_id IS NOT NULL AND m.curriculum_track_id = p.curriculum_track_id))
      AND (_from IS NULL OR coalesce(es.completed_at, es.submitted_at, es.created_at) >= _from)
      AND (_to IS NULL OR coalesce(es.completed_at, es.submitted_at, es.created_at) <= _to)
      AND (_grade_id IS NULL OR p.grade_uuid = _grade_id)
      AND (_track_id IS NULL OR p.curriculum_track_id = _track_id)
  ),
  occ AS (
    SELECT s.id AS session_id, s.user_id, s.attempt_at, s.scope, s.grade_id, s.track_id,
           s.template_subject_id,
           esq.logical_question_id AS question_id,
           esq.question_revision_id,
           esq.rendered_question_text,
           CASE
             WHEN a.requires_manual_review IS TRUE
               OR (a.id IS NOT NULL AND coalesce(a.grading_status, '') <> 'GRADED') THEN 'PENDING'
             WHEN a.id IS NULL
               OR (a.selected_option_code IS NULL AND coalesce(a.response_text, '') = '') THEN 'BLANK'
             WHEN a.is_correct IS TRUE THEN 'CORRECT'
             WHEN a.is_correct IS FALSE THEN 'WRONG'
             ELSE 'PENDING'
           END AS state
    FROM sess s
    JOIN public.exam_session_questions esq ON esq.exam_session_id = s.id
    LEFT JOIN public.exam_session_answers a ON a.exam_session_question_id = esq.id
    WHERE esq.logical_question_id IS NOT NULL
      AND (v_scope = 'ALL' OR s.scope = v_scope)
  ),
  occ_t AS (
    SELECT o.*,
           coalesce(qt.subject_id, o.template_subject_id) AS eff_subject_id,
           qt.lesson_id
    FROM occ o
    LEFT JOIN LATERAL (
      SELECT t.subject_id, t.lesson_id
      FROM public.question_targets t
      WHERE t.revision_id = o.question_revision_id
      ORDER BY t.is_primary DESC, t.created_at ASC
      LIMIT 1
    ) qt ON true
  ),
  scoped AS (
    SELECT * FROM occ_t
    WHERE (_subject_id IS NULL OR eff_subject_id = _subject_id)
      AND (_lesson_id IS NULL OR lesson_id = _lesson_id)
      AND state <> 'PENDING'
  ),
  -- per (student, question): the student-notebook unit of truth
  pairs AS (
    SELECT user_id, question_id,
           count(*) FILTER (WHERE state = 'WRONG')::int AS wrong_count,
           count(*) FILTER (WHERE state = 'BLANK')::int AS blank_count,
           count(*) FILTER (WHERE state IN ('WRONG','BLANK'))::int AS mistake_count,
           max(attempt_at) FILTER (WHERE state IN ('WRONG','BLANK')) AS last_mistake_at,
           max(attempt_at) FILTER (WHERE state = 'CORRECT') AS last_correct_at
    FROM scoped
    GROUP BY user_id, question_id
    HAVING count(*) FILTER (WHERE state IN ('WRONG','BLANK')) > 0
  ),
  summary AS (
    SELECT
      (SELECT coalesce(sum(mistake_count), 0)::int FROM pairs) AS total_mistake_occurrences,
      (SELECT count(DISTINCT question_id)::int FROM pairs) AS unique_questions_with_mistakes,
      (SELECT count(*)::int FROM pairs WHERE mistake_count > 1) AS repeated_mistakes,
      (SELECT count(*)::int FROM scoped) AS total_evaluated_occurrences,
      (SELECT count(*)::int FROM scoped WHERE state = 'BLANK') AS total_blank_occurrences,
      (SELECT count(*)::int FROM pairs) AS total_student_question_pairs,
      (SELECT count(*)::int FROM pairs
        WHERE last_correct_at IS NOT NULL AND last_correct_at > last_mistake_at) AS mastered_later_pairs
  ),
  q_stats AS (
    SELECT s.question_id,
           count(*)::int AS attempt_count,
           count(*) FILTER (WHERE s.state = 'WRONG')::int AS wrong_count,
           count(*) FILTER (WHERE s.state = 'BLANK')::int AS blank_count,
           max(s.eff_subject_id) AS subject_id,
           max(s.lesson_id) AS lesson_id,
           (SELECT x.rendered_question_text FROM scoped x
             WHERE x.question_id = s.question_id AND x.rendered_question_text IS NOT NULL
             ORDER BY x.attempt_at DESC LIMIT 1) AS question_preview
    FROM scoped s
    GROUP BY s.question_id
  ),
  q_mastered AS (
    SELECT question_id,
           count(*) FILTER (WHERE last_correct_at IS NOT NULL AND last_correct_at > last_mistake_at)::int AS mastered_later_count,
           count(*)::int AS mistaken_pairs,
           sum(mistake_count)::int AS mistake_occurrences
    FROM pairs GROUP BY question_id
  )
  SELECT jsonb_build_object(
    'summary', (
      SELECT jsonb_build_object(
        'total_mistake_occurrences', total_mistake_occurrences,
        'unique_questions_with_mistakes', unique_questions_with_mistakes,
        'repeated_mistakes', repeated_mistakes,
        'total_evaluated_occurrences', total_evaluated_occurrences,
        'blank_rate', CASE WHEN total_evaluated_occurrences > 0
                           THEN round(total_blank_occurrences::numeric * 100 / total_evaluated_occurrences, 2)
                           ELSE 0 END,
        'mastered_later_rate', CASE WHEN total_student_question_pairs > 0
                           THEN round(mastered_later_pairs::numeric * 100 / total_student_question_pairs, 2)
                           ELSE 0 END
      ) FROM summary
    ),
    'by_subject', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'mistake_occurrences')::int DESC) FROM (
        SELECT jsonb_build_object(
                 'subject_id', s.eff_subject_id,
                 'subject_name', sj.name,
                 'mistake_occurrences', count(*) FILTER (WHERE s.state IN ('WRONG','BLANK'))::int,
                 'blank_occurrences', count(*) FILTER (WHERE s.state = 'BLANK')::int,
                 'evaluated_occurrences', count(*)::int,
                 'unique_questions', count(DISTINCT s.question_id) FILTER (WHERE s.state IN ('WRONG','BLANK'))::int
               ) AS x
        FROM scoped s LEFT JOIN public.subjects sj ON sj.id = s.eff_subject_id
        WHERE s.eff_subject_id IS NOT NULL
        GROUP BY s.eff_subject_id, sj.name
        HAVING count(*) FILTER (WHERE s.state IN ('WRONG','BLANK')) > 0
      ) t), '[]'::jsonb),
    'by_lesson', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'mistake_occurrences')::int DESC) FROM (
        SELECT jsonb_build_object(
                 'lesson_id', s.lesson_id,
                 'lesson_title', ls.title,
                 'subject_id', s.eff_subject_id,
                 'subject_name', sj.name,
                 'mistake_occurrences', count(*) FILTER (WHERE s.state IN ('WRONG','BLANK'))::int,
                 'blank_occurrences', count(*) FILTER (WHERE s.state = 'BLANK')::int,
                 'evaluated_occurrences', count(*)::int
               ) AS x
        FROM scoped s
        LEFT JOIN public.lessons ls ON ls.id = s.lesson_id
        LEFT JOIN public.subjects sj ON sj.id = s.eff_subject_id
        WHERE s.lesson_id IS NOT NULL
        GROUP BY s.lesson_id, ls.title, s.eff_subject_id, sj.name
        HAVING count(*) FILTER (WHERE s.state IN ('WRONG','BLANK')) > 0
      ) t), '[]'::jsonb),
    'by_grade', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'mistake_occurrences')::int DESC) FROM (
        SELECT jsonb_build_object(
                 'grade_id', s.grade_id,
                 'grade_name', g.name,
                 'mistake_occurrences', count(*) FILTER (WHERE s.state IN ('WRONG','BLANK'))::int,
                 'evaluated_occurrences', count(*)::int
               ) AS x
        FROM scoped s LEFT JOIN public.grades g ON g.id = s.grade_id
        WHERE s.grade_id IS NOT NULL
        GROUP BY s.grade_id, g.name
        HAVING count(*) FILTER (WHERE s.state IN ('WRONG','BLANK')) > 0
      ) t), '[]'::jsonb),
    'by_track', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'mistake_occurrences')::int DESC) FROM (
        SELECT jsonb_build_object(
                 'track_id', s.track_id,
                 'track_name', ct.track_name,
                 'mistake_occurrences', count(*) FILTER (WHERE s.state IN ('WRONG','BLANK'))::int,
                 'evaluated_occurrences', count(*)::int
               ) AS x
        FROM scoped s LEFT JOIN public.curriculum_tracks ct ON ct.id = s.track_id
        WHERE s.track_id IS NOT NULL
        GROUP BY s.track_id, ct.track_name
        HAVING count(*) FILTER (WHERE s.state IN ('WRONG','BLANK')) > 0
      ) t), '[]'::jsonb),
    'top_questions', coalesce((
      SELECT jsonb_agg(x ORDER BY (x->>'mistake_occurrences')::int DESC, (x->>'question_id')) FROM (
        SELECT jsonb_build_object(
                 'question_id', qs.question_id,
                 'question_code', q.code,
                 'question_preview', left(coalesce(qs.question_preview, ''), 240),
                 'subject_id', qs.subject_id,
                 'subject_name', sj.name,
                 'lesson_id', qs.lesson_id,
                 'lesson_title', ls.title,
                 'attempt_count', qs.attempt_count,
                 'wrong_count', qs.wrong_count,
                 'wrong_percentage', CASE WHEN qs.attempt_count > 0
                    THEN round(qs.wrong_count::numeric * 100 / qs.attempt_count, 2) ELSE 0 END,
                 'blank_count', qs.blank_count,
                 'blank_percentage', CASE WHEN qs.attempt_count > 0
                    THEN round(qs.blank_count::numeric * 100 / qs.attempt_count, 2) ELSE 0 END,
                 'mistake_occurrences', coalesce(qm.mistake_occurrences, 0),
                 'mastered_later_count', coalesce(qm.mastered_later_count, 0),
                 'mastered_later_percentage', CASE WHEN coalesce(qm.mistaken_pairs, 0) > 0
                    THEN round(qm.mastered_later_count::numeric * 100 / qm.mistaken_pairs, 2) ELSE 0 END
               ) AS x
        FROM q_stats qs
        JOIN q_mastered qm ON qm.question_id = qs.question_id
        LEFT JOIN public.questions q ON q.id = qs.question_id
        LEFT JOIN public.subjects sj ON sj.id = qs.subject_id
        LEFT JOIN public.lessons ls ON ls.id = qs.lesson_id
        ORDER BY qm.mistake_occurrences DESC, qs.question_id
        LIMIT v_limit
      ) t), '[]'::jsonb),
    'filters', jsonb_build_object(
      'grade_id', _grade_id, 'track_id', _track_id, 'subject_id', _subject_id,
      'lesson_id', _lesson_id, 'attempt_scope', v_scope, 'from', _from, 'to', _to, 'limit', v_limit
    )
  ) INTO v_out;

  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.get_admin_mistake_insights(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_mistake_insights(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_mistake_insights(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, int) TO authenticated;

COMMENT ON FUNCTION public.get_admin_mistake_insights(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, int) IS
  '15B-A admin mistake insights. Full admin only. Aggregate output only: no user_id, no student '
  'identities, no per-student notebook, and zero answer-key / is_correct / solution exposure.';
