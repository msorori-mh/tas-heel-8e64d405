-- FREE-ACCESS-PIVOT-DB-RPC-01
-- Temporary free access for authenticated students: remove subscription gates
-- from content/exam RPCs while keeping auth, grade, and curriculum checks.
-- Does NOT drop financial tables/functions and does NOT grant anon access.

-- ============ can_access_lesson ============
-- Before: required is_free OR first lesson OR active subscription (+ curriculum).
-- After: authenticated user with curriculum access (or admin). No subscription.
CREATE OR REPLACE FUNCTION public.can_access_lesson(_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lessons l
    WHERE l.id = _lesson_id
      AND auth.uid() IS NOT NULL
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.user_can_access_subject_curriculum(l.subject_id)
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_lesson(uuid) FROM anon;

-- ============ start_exam_session ============
-- Before: raised subscription_required unless free content / active sub.
-- After: keeps unauthorized / template / grade / curriculum gates only.
CREATE OR REPLACE FUNCTION public.start_exam_session(_template_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tpl public.exam_templates;
  v_subject_id uuid;
  v_subject record;
  v_profile record;
  v_session_id uuid;
  v_total_q integer := 0;
  v_total_pts numeric := 0;
  v_expires timestamptz;
  v_is_admin boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tpl FROM public.exam_templates WHERE id = _template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_tpl.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'template_inactive' USING ERRCODE = '42501';
  END IF;

  v_subject_id := v_tpl.subject_id;
  IF v_subject_id IS NULL AND v_tpl.unit_id IS NOT NULL THEN
    SELECT u.subject_id INTO v_subject_id FROM public.units u WHERE u.id = v_tpl.unit_id;
  END IF;
  IF v_subject_id IS NULL AND v_tpl.lesson_id IS NOT NULL THEN
    SELECT l.subject_id INTO v_subject_id FROM public.lessons l WHERE l.id = v_tpl.lesson_id;
  END IF;
  IF v_subject_id IS NULL THEN
    RAISE EXCEPTION 'template_scope_missing' USING ERRCODE = '42501';
  END IF;

  SELECT s.id, s.grade_id, s.curriculum_track_id
  INTO v_subject
  FROM public.subjects s
  WHERE s.id = v_subject_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template_scope_missing' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.has_role(v_user, 'admin'::app_role);

  IF NOT v_is_admin THEN
    SELECT p.grade_id, p.grade_uuid, p.curriculum_track_id
    INTO v_profile
    FROM public.profiles p
    WHERE p.user_id = v_user;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'grade_mismatch' USING ERRCODE = '42501';
    END IF;

    IF NOT public.user_can_access_subject_curriculum(v_subject_id) THEN
      RAISE EXCEPTION 'curriculum_mismatch' USING ERRCODE = '42501';
    END IF;

    IF NOT (
      (v_profile.grade_uuid IS NOT NULL AND v_profile.grade_uuid = v_subject.grade_id)
      OR (v_profile.grade_id IS NOT NULL AND v_profile.grade_id = v_subject.grade_id::text)
    ) THEN
      RAISE EXCEPTION 'grade_mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(points), 0)
  INTO v_total_q, v_total_pts
  FROM public.exam_template_questions
  WHERE template_id = _template_id;

  IF v_total_q = 0 THEN
    RAISE EXCEPTION 'template_has_no_questions' USING ERRCODE = '22023';
  END IF;

  IF v_tpl.duration_seconds IS NOT NULL THEN
    v_expires := now() + make_interval(secs => v_tpl.duration_seconds);
  END IF;

  INSERT INTO public.exam_sessions (
    user_id, template_id, mode, status, expires_at, total_questions, total_points
  )
  VALUES (
    v_user, _template_id, v_tpl.mode, 'in_progress', v_expires, v_total_q, v_total_pts
  )
  RETURNING id INTO v_session_id;

  INSERT INTO public.exam_session_answers (session_id, question_id)
  SELECT v_session_id, tq.question_id
  FROM public.exam_template_questions tq
  WHERE tq.template_id = _template_id
  ORDER BY tq.sort_order;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_exam_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_exam_session(uuid) TO authenticated;

-- ============ grade_unit_practice ============
-- Before: non-free units required active subscription.
-- After: authenticated student with matching grade/curriculum may practice.
CREATE OR REPLACE FUNCTION public.grade_unit_practice(_unit_id uuid, _answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_unit record;
  v_subject record;
  v_profile record;
  v_is_admin boolean;
  v_total int := 0;
  v_correct int := 0;
  v_answered int := 0;
  v_score int := 0;
  v_per_question jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT id, subject_id, is_free INTO v_unit FROM public.units WHERE id = _unit_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  SELECT id, grade_id, curriculum_track_id INTO v_subject FROM public.subjects WHERE id = v_unit.subject_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  v_is_admin := public.has_role(v_user, 'admin'::app_role);

  IF NOT v_is_admin THEN
    SELECT grade_id, grade_uuid, curriculum_track_id INTO v_profile FROM public.profiles WHERE user_id = v_user;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'forbidden');
    END IF;

    -- Grade check
    IF NOT (
      (v_profile.grade_uuid IS NOT NULL AND v_profile.grade_uuid = v_subject.grade_id)
      OR (v_profile.grade_id IS NOT NULL AND v_profile.grade_id = v_subject.grade_id::text)
    ) THEN
      RETURN jsonb_build_object('error', 'forbidden');
    END IF;

    -- Track check
    IF v_subject.curriculum_track_id IS NOT NULL
      AND (v_profile.curriculum_track_id IS NULL OR v_profile.curriculum_track_id <> v_subject.curriculum_track_id) THEN
      RETURN jsonb_build_object('error', 'forbidden');
    END IF;
  END IF;

  IF _answers IS NULL OR jsonb_typeof(_answers) <> 'array' THEN
    RETURN jsonb_build_object('error', 'invalid_payload');
  END IF;

  WITH supplied AS (
    SELECT
      (elem->>'question_id')::uuid AS question_id,
      NULLIF(elem->>'selected_index','')::int AS selected_index
    FROM jsonb_array_elements(_answers) elem
    WHERE elem ? 'question_id'
  ),
  valid_q AS (
    SELECT q.id, q.correct_index
    FROM public.questions q
    JOIN public.lessons l ON l.id = q.lesson_id
    WHERE l.unit_id = _unit_id AND l.subject_id = v_unit.subject_id
  ),
  graded AS (
    SELECT
      v.id AS question_id,
      s.selected_index,
      (s.selected_index IS NOT NULL AND s.selected_index = v.correct_index) AS is_correct
    FROM supplied s
    JOIN valid_q v ON v.id = s.question_id
  )
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE selected_index IS NOT NULL)::int,
    COUNT(*) FILTER (WHERE is_correct)::int,
    COALESCE(jsonb_agg(jsonb_build_object('question_id', question_id, 'is_correct', is_correct)), '[]'::jsonb)
  INTO v_total, v_answered, v_correct, v_per_question
  FROM graded;

  IF v_total = 0 THEN
    RETURN jsonb_build_object('error', 'no_valid_questions');
  END IF;

  v_score := ROUND((v_correct::numeric / v_total::numeric) * 100)::int;

  RETURN jsonb_build_object(
    'total', v_total,
    'answered', v_answered,
    'correct', v_correct,
    'score', v_score,
    'per_question', v_per_question
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grade_unit_practice(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.grade_unit_practice(uuid, jsonb) TO authenticated;
