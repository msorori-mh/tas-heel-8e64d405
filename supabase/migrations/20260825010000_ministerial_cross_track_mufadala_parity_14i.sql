-- =============================================================================
-- PAST_MINISTERIAL_EXAMS_CROSS_TRACK_MUFADALA_PARITY_14I
--
-- Product rule:
--   * a grade-12 student on either operational curriculum track may browse and
--     practise published Sanaa and Aden ministerial models;
--   * model identity, question membership and attempts remain track-attributed;
--   * answer keys remain server-only and sessions still use revision snapshots.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.can_access_ministerial_model(_model_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.is_content_staff(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.ministerial_exam_models m
        JOIN public.curriculum_tracks model_track
          ON model_track.id = m.curriculum_track_id
         AND model_track.is_active IS TRUE
         AND model_track.track_code IN ('sanaa', 'aden')
        JOIN public.subjects s ON s.id = m.subject_id
        JOIN public.subject_curriculum_tracks sct
          ON sct.subject_id = s.id
         AND sct.curriculum_track_id = m.curriculum_track_id
         AND sct.is_active IS TRUE
        JOIN public.profiles p ON p.user_id = auth.uid()
        JOIN public.curriculum_tracks student_track
          ON student_track.id = p.curriculum_track_id
         AND student_track.is_active IS TRUE
         AND student_track.track_code IN ('sanaa', 'aden')
        WHERE m.id = _model_id
          AND (p.grade_uuid = s.grade_id OR p.grade_id = s.grade_id::text)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_ministerial_model(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_ministerial_model(uuid) TO authenticated;

DROP POLICY IF EXISTS "Students read own-track published ministerial models"
  ON public.ministerial_exam_models;
DROP POLICY IF EXISTS "Students read published Sanaa and Aden ministerial models"
  ON public.ministerial_exam_models;
CREATE POLICY "Students read published Sanaa and Aden ministerial models"
ON public.ministerial_exam_models
FOR SELECT
TO authenticated
USING (
  status = 'published'
  AND public.can_access_ministerial_model(id)
);

DROP FUNCTION IF EXISTS public.list_ministerial_subjects();
CREATE FUNCTION public.list_ministerial_subjects()
RETURNS TABLE(
  subject_id uuid,
  subject_name text,
  subject_code text,
  models_count integer,
  latest_year integer,
  sanaa_models_count integer,
  aden_models_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT s.id,
         s.name,
         s.code,
         COUNT(m.id)::integer,
         MAX(m.academic_year)::integer,
         COUNT(m.id) FILTER (WHERE ct.track_code = 'sanaa')::integer,
         COUNT(m.id) FILTER (WHERE ct.track_code = 'aden')::integer
  FROM public.ministerial_exam_models m
  JOIN public.subjects s ON s.id = m.subject_id
  JOIN public.curriculum_tracks ct ON ct.id = m.curriculum_track_id
  WHERE auth.uid() IS NOT NULL
    AND m.status = 'published'
    AND ct.track_code IN ('sanaa', 'aden')
    AND public.can_access_ministerial_model(m.id)
  GROUP BY s.id, s.name, s.code
  ORDER BY s.name;
$$;

REVOKE ALL ON FUNCTION public.list_ministerial_subjects() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_ministerial_subjects() TO authenticated;

DROP FUNCTION IF EXISTS public.list_ministerial_models(uuid);
CREATE FUNCTION public.list_ministerial_models(_subject_id uuid)
RETURNS TABLE(
  model_id uuid,
  model_code text,
  model_label text,
  academic_year integer,
  round_code text,
  variant_code text,
  question_count integer,
  duration_seconds integer,
  last_session_id uuid,
  last_session_status text,
  track_code text,
  track_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT m.id,
         m.model_code,
         m.model_label,
         m.academic_year,
         m.round_code::text,
         m.variant_code,
         (SELECT COUNT(*)::integer
            FROM public.ministerial_exam_questions q
           WHERE q.model_id = m.id),
         t.duration_seconds,
         ls.id,
         ls.status::text,
         ct.track_code,
         ct.track_name
  FROM public.ministerial_exam_models m
  JOIN public.curriculum_tracks ct ON ct.id = m.curriculum_track_id
  LEFT JOIN public.exam_templates t ON t.id = m.template_id
  LEFT JOIN LATERAL (
    SELECT es.id, es.status
    FROM public.exam_sessions es
    WHERE es.ministerial_model_id = m.id
      AND es.user_id = auth.uid()
    ORDER BY es.created_at DESC
    LIMIT 1
  ) ls ON true
  WHERE auth.uid() IS NOT NULL
    AND m.subject_id = _subject_id
    AND m.status = 'published'
    AND ct.track_code IN ('sanaa', 'aden')
    AND public.can_access_ministerial_model(m.id)
  ORDER BY m.academic_year DESC, ct.track_code, m.round_code, m.variant_code;
$$;

REVOKE ALL ON FUNCTION public.list_ministerial_models(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_ministerial_models(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_ministerial_model_overview(_model_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'model_id', m.id,
    'model_code', m.model_code,
    'model_label', m.model_label,
    'academic_year', m.academic_year,
    'round_code', m.round_code::text,
    'variant_code', m.variant_code,
    'subject_id', s.id,
    'subject_name', s.name,
    'track_code', ct.track_code,
    'track_name', ct.track_name,
    'question_count', (SELECT COUNT(*) FROM public.ministerial_exam_questions q WHERE q.model_id = m.id),
    'duration_seconds', t.duration_seconds,
    'last_session_id', ls.id,
    'last_session_status', ls.status::text
  )
  INTO v_row
  FROM public.ministerial_exam_models m
  JOIN public.subjects s ON s.id = m.subject_id
  JOIN public.curriculum_tracks ct ON ct.id = m.curriculum_track_id
  LEFT JOIN public.exam_templates t ON t.id = m.template_id
  LEFT JOIN LATERAL (
    SELECT es.id, es.status
    FROM public.exam_sessions es
    WHERE es.ministerial_model_id = m.id AND es.user_id = auth.uid()
    ORDER BY es.created_at DESC
    LIMIT 1
  ) ls ON true
  WHERE m.id = _model_id
    AND m.status = 'published'
    AND ct.track_code IN ('sanaa', 'aden')
    AND public.can_access_ministerial_model(m.id);

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'ministerial_model_not_available' USING ERRCODE = '42501';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ministerial_model_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ministerial_model_overview(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_ministerial_exam_session(
  _model_id uuid,
  _mode text DEFAULT 'training'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_model public.ministerial_exam_models;
  v_tpl public.exam_templates;
  v_session_id uuid;
  v_total_q integer := 0;
  v_total_pts numeric := 0;
  v_expires timestamptz;
  v_membership record;
  v_option record;
  v_rendered_options jsonb;
  v_option_mapping jsonb;
  v_display_index integer;
  v_question_order integer := 0;
  v_esq_id uuid;
  v_mode text := lower(coalesce(_mode, 'training'));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF v_mode NOT IN ('training', 'strict') THEN
    RAISE EXCEPTION 'INVALID_ATTEMPT_MODE' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_model FROM public.ministerial_exam_models WHERE id = _model_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'model_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_model.status <> 'published' THEN
    RAISE EXCEPTION 'MINISTERIAL_MODEL_NOT_PUBLISHED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tpl FROM public.exam_templates WHERE id = v_model.template_id;
  IF NOT FOUND OR v_tpl.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'template_inactive' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_access_ministerial_model(_model_id) THEN
    RAISE EXCEPTION 'curriculum_or_grade_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(marks), 0)
  INTO v_total_q, v_total_pts
  FROM public.ministerial_exam_questions
  WHERE model_id = _model_id;

  IF v_total_q = 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_MODEL_HAS_NO_QUESTIONS' USING ERRCODE = '22023';
  END IF;

  IF v_mode = 'strict' THEN
    v_expires := now() + make_interval(
      secs => COALESCE(v_tpl.duration_seconds, GREATEST(5, v_total_q) * 60)
    );
  END IF;

  INSERT INTO public.exam_sessions (
    user_id, template_id, mode, status, expires_at, total_questions, total_points,
    attempt_pin_mode, grading_status, ministerial_model_id, ministerial_attempt_mode,
    correct_answers, is_final
  )
  VALUES (
    v_user, v_model.template_id, 'ministry', 'in_progress', v_expires, v_total_q, v_total_pts,
    'REVISION_PINNED', 'IN_PROGRESS', _model_id, v_mode,
    NULL, false
  )
  RETURNING id INTO v_session_id;

  FOR v_membership IN
    SELECT meq.*, qr.question_text, qr.stimulus_text, qr.payload_hash,
           q.id AS logical_question_id
    FROM public.ministerial_exam_questions meq
    JOIN public.question_revisions qr ON qr.id = meq.published_revision_id
    JOIN public.questions q ON q.id = meq.question_id
    WHERE meq.model_id = _model_id
    ORDER BY meq.sort_order
  LOOP
    v_question_order := v_question_order + 1;
    v_rendered_options := '[]'::jsonb;
    v_option_mapping := '[]'::jsonb;
    v_display_index := 0;

    FOR v_option IN
      SELECT id, option_code, body, sort_order
      FROM public.question_options
      WHERE question_revision_id = v_membership.published_revision_id
      ORDER BY sort_order
    LOOP
      v_rendered_options := v_rendered_options || jsonb_build_object(
        'option_code', v_option.option_code,
        'body', v_option.body
      );
      v_option_mapping := v_option_mapping || jsonb_build_object(
        'display_index', v_display_index,
        'original_index', v_option.sort_order,
        'option_code', v_option.option_code
      );
      v_display_index := v_display_index + 1;
    END LOOP;

    INSERT INTO public.exam_session_questions (
      exam_session_id, question_revision_id, logical_question_id, question_order,
      rendered_question_text, rendered_stimulus_text, rendered_options, option_order_mapping,
      max_score, payload_hash, payload_hash_version, pin_mode
    )
    VALUES (
      v_session_id, v_membership.published_revision_id, v_membership.logical_question_id,
      v_question_order, v_membership.question_text, v_membership.stimulus_text,
      v_rendered_options, v_option_mapping,
      v_membership.marks, v_membership.payload_hash, 'canonical_payload_v1', 'REVISION_PINNED'
    )
    RETURNING id INTO v_esq_id;

    INSERT INTO public.exam_session_answers (
      session_id, question_id, exam_session_question_id, question_revision_id,
      max_score, pin_mode, grading_status
    )
    VALUES (
      v_session_id, v_membership.logical_question_id, v_esq_id,
      v_membership.published_revision_id, v_membership.marks, 'REVISION_PINNED', 'NOT_REQUIRED'
    );
  END LOOP;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ministerial_exam_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ministerial_exam_session(uuid, text) TO authenticated;

COMMIT;
