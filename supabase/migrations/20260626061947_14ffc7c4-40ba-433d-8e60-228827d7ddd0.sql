-- C-02: Gate start_exam_session by subscription, grade, curriculum, and template scope.

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
  v_is_free boolean := false;
  v_lesson_is_free boolean;
  v_lesson_unit_id uuid;
  v_unit_is_free boolean;
  v_mode text;
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

    v_mode := v_tpl.mode::text;
    IF v_mode IS NULL OR v_mode NOT IN ('training', 'strict', 'ministry') THEN
      v_mode := 'strict';
    END IF;

    IF v_tpl.lesson_id IS NOT NULL THEN
      SELECT l.is_free, l.unit_id
      INTO v_lesson_is_free, v_lesson_unit_id
      FROM public.lessons l
      WHERE l.id = v_tpl.lesson_id;
      IF FOUND THEN
        IF v_lesson_is_free OR public.is_first_lesson_in_subject(v_tpl.lesson_id) THEN
          v_is_free := true;
        ELSIF v_lesson_unit_id IS NOT NULL THEN
          SELECT u.is_free INTO v_unit_is_free FROM public.units u WHERE u.id = v_lesson_unit_id;
          IF FOUND AND v_unit_is_free THEN
            v_is_free := true;
          END IF;
        END IF;
      END IF;
    ELSIF v_tpl.unit_id IS NOT NULL THEN
      SELECT u.is_free INTO v_unit_is_free FROM public.units u WHERE u.id = v_tpl.unit_id;
      IF FOUND AND v_unit_is_free THEN
        v_is_free := true;
      END IF;
    END IF;

    IF v_mode IN ('strict', 'ministry') THEN
      IF NOT public.has_active_subscription(v_user) THEN
        RAISE EXCEPTION 'subscription_required' USING ERRCODE = '42501';
      END IF;
    ELSIF v_mode = 'training' THEN
      IF NOT v_is_free AND NOT public.has_active_subscription(v_user) THEN
        RAISE EXCEPTION 'subscription_required' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NOT public.has_active_subscription(v_user) THEN
        RAISE EXCEPTION 'subscription_required' USING ERRCODE = '42501';
      END IF;
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