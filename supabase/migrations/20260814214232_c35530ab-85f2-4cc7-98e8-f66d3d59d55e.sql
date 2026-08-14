-- PAST_MINISTERIAL_EXAMS_STUDENT_EXPERIENCE_14D
-- Student-facing, track-isolated read paths. No demo data. No answer exposure.

-- 1) Tighten model SELECT RLS: track isolation enforced server-side.
DROP POLICY IF EXISTS "Authenticated read published ministerial models" ON public.ministerial_exam_models;

CREATE POLICY "Students read own-track published ministerial models"
ON public.ministerial_exam_models
FOR SELECT
TO authenticated
USING (
  status = 'published'
  AND public.can_access_subject(subject_id)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.curriculum_track_id = ministerial_exam_models.curriculum_track_id
  )
);

-- 2) Student catalog: subjects that have published models for the student's track.
CREATE OR REPLACE FUNCTION public.list_ministerial_subjects()
RETURNS TABLE (
  subject_id uuid,
  subject_name text,
  subject_code text,
  models_count integer,
  latest_year integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id,
         s.name,
         s.code,
         COUNT(m.id)::integer,
         MAX(m.academic_year)::integer
  FROM public.ministerial_exam_models m
  JOIN public.subjects s ON s.id = m.subject_id
  JOIN public.profiles p ON p.user_id = auth.uid()
  WHERE auth.uid() IS NOT NULL
    AND m.status = 'published'
    AND m.curriculum_track_id = p.curriculum_track_id
    AND public.can_access_subject(m.subject_id)
  GROUP BY s.id, s.name, s.code
  ORDER BY s.name;
$$;

-- 3) Models of one subject, for the student's track only.
CREATE OR REPLACE FUNCTION public.list_ministerial_models(_subject_id uuid)
RETURNS TABLE (
  model_id uuid,
  model_code text,
  model_label text,
  academic_year integer,
  round_code text,
  variant_code text,
  question_count integer,
  duration_seconds integer,
  last_session_id uuid,
  last_session_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id,
         m.model_code,
         m.model_label,
         m.academic_year,
         m.round_code::text,
         m.variant_code,
         (SELECT COUNT(*)::integer FROM public.ministerial_exam_questions q WHERE q.model_id = m.id),
         t.duration_seconds,
         ls.id,
         ls.status::text
  FROM public.ministerial_exam_models m
  JOIN public.profiles p ON p.user_id = auth.uid()
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
    AND m.curriculum_track_id = p.curriculum_track_id
    AND public.can_access_subject(m.subject_id)
  ORDER BY m.academic_year DESC, m.round_code, m.variant_code;
$$;

-- 4) Single-model overview (pre-start screen).
CREATE OR REPLACE FUNCTION public.get_ministerial_model_overview(_model_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
  JOIN public.profiles p ON p.user_id = auth.uid()
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
    AND m.curriculum_track_id = p.curriculum_track_id
    AND public.can_access_subject(m.subject_id);

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'ministerial_model_not_available' USING ERRCODE = '42501';
  END IF;

  RETURN v_row;
END;
$$;

-- 5) Session state from the frozen snapshot ONLY. Never returns correct answers or solutions.
CREATE OR REPLACE FUNCTION public.get_ministerial_session_state(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_session public.exam_sessions;
  v_questions jsonb;
  v_answers jsonb;
  v_model jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_session FROM public.exam_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_session.user_id <> v_user THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_session.ministerial_model_id IS NULL THEN
    RAISE EXCEPTION 'not_a_ministerial_session' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'model_id', m.id,
    'model_code', m.model_code,
    'model_label', m.model_label,
    'academic_year', m.academic_year,
    'round_code', m.round_code::text,
    'subject_id', s.id,
    'subject_name', s.name
  )
  INTO v_model
  FROM public.ministerial_exam_models m
  JOIN public.subjects s ON s.id = m.subject_id
  WHERE m.id = v_session.ministerial_model_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'question_id', a.question_id,
    'selected_index', a.selected_index,
    'answered_at', a.answered_at
  )), '[]'::jsonb)
  INTO v_answers
  FROM public.exam_session_answers a
  WHERE a.session_id = _session_id;

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'status', v_session.status::text,
      'mode', v_session.mode::text,
      'started_at', v_session.started_at,
      'expires_at', v_session.expires_at,
      'total_questions', v_session.total_questions
    ),
    'model', v_model,
    'questions', v_questions,
    'answers', v_answers,
    'reveal', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_ministerial_subjects() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_ministerial_models(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ministerial_model_overview(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ministerial_session_state(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_ministerial_subjects() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_ministerial_models(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ministerial_model_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ministerial_session_state(uuid) TO authenticated;