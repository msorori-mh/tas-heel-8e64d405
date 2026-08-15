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

  CREATE TEMP TABLE IF NOT EXISTS _mm_rows (
    question_id uuid,
    display_revision_id uuid,
    question_text text,
    subject_id uuid,
    lesson_id uuid,
    wrong_count int,
    blank_count int,
    occurrence_count int,
    first_mistake_at timestamptz,
    last_mistake_at timestamptz,
    latest_state text,
    latest_attempt_type text,
    latest_attempt_scope text,
    latest_session_id uuid,
    has_repeated_mistake boolean
  ) ON COMMIT DROP;
  DELETE FROM _mm_rows;

  INSERT INTO _mm_rows
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
  )
  SELECT a.question_id,
         l.question_revision_id,
         l.rendered_question_text,
         l.eff_subject_id,
         l.lesson_id,
         a.wrong_count,
         a.blank_count,
         a.occurrence_count,
         a.first_mistake_at,
         a.last_mistake_at,
         CASE WHEN a.last_correct_at IS NOT NULL AND a.last_correct_at > a.last_mistake_at
              THEN 'MASTERED_LATER' ELSE l.state END,
         l.attempt_type,
         l.scope,
         l.session_id,
         a.occurrence_count > 1
  FROM agg a
  JOIN latest l ON l.question_id = a.question_id;

  -- subject facets are computed BEFORE the subject/lesson/status narrowing
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'subject_name'), '[]'::jsonb) INTO v_subjects
  FROM (
    SELECT jsonb_build_object(
             'subject_id', r.subject_id,
             'subject_name', s.name,
             'count', count(*)::int
           ) AS x
    FROM _mm_rows r
    LEFT JOIN public.subjects s ON s.id = r.subject_id
    WHERE r.subject_id IS NOT NULL
    GROUP BY r.subject_id, s.name
  ) f;

  SELECT count(*)::int INTO v_total
  FROM _mm_rows r
  WHERE (_subject_id IS NULL OR r.subject_id = _subject_id)
    AND (_lesson_id IS NULL OR r.lesson_id = _lesson_id)
    AND (v_status = 'ALL'
         OR (v_status = 'REPEATED' AND r.has_repeated_mistake)
         OR (v_status <> 'REPEATED' AND r.latest_state = v_status));

  SELECT coalesce(jsonb_agg(item ORDER BY ord), '[]'::jsonb) INTO v_items
  FROM (
    SELECT row_number() OVER () AS ord,
           jsonb_build_object(
             'question_id', r.question_id,
             'display_revision_id', r.display_revision_id,
             'question_text', r.question_text,
             'subject_id', r.subject_id,
             'subject_name', s.name,
             'lesson_id', r.lesson_id,
             'lesson_title', l.title,
             'wrong_count', r.wrong_count,
             'blank_count', r.blank_count,
             'occurrence_count', r.occurrence_count,
             'first_mistake_at', r.first_mistake_at,
             'last_mistake_at', r.last_mistake_at,
             'latest_state', r.latest_state,
             'latest_attempt_type', r.latest_attempt_type,
             'latest_attempt_scope', r.latest_attempt_scope,
             'latest_session_id', r.latest_session_id,
             'has_repeated_mistake', r.has_repeated_mistake,
             'can_review_lesson', r.lesson_id IS NOT NULL,
             'can_open_attempt', r.latest_session_id IS NOT NULL
           ) AS item
    FROM _mm_rows r
    LEFT JOIN public.subjects s ON s.id = r.subject_id
    LEFT JOIN public.lessons l ON l.id = r.lesson_id
    WHERE (_subject_id IS NULL OR r.subject_id = _subject_id)
      AND (_lesson_id IS NULL OR r.lesson_id = _lesson_id)
      AND (v_status = 'ALL'
           OR (v_status = 'REPEATED' AND r.has_repeated_mistake)
           OR (v_status <> 'REPEATED' AND r.latest_state = v_status))
    ORDER BY
      CASE WHEN v_sort = 'most_repeated' THEN r.occurrence_count END DESC NULLS LAST,
      r.last_mistake_at DESC NULLS LAST,
      r.question_id
    LIMIT v_limit OFFSET v_offset
  ) q;

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
