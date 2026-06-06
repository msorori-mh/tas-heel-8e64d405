
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
  v_has_sub boolean;
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

    -- Access (free or active subscription)
    IF NOT v_unit.is_free THEN
      v_has_sub := public.has_active_subscription(v_user);
      IF NOT v_has_sub THEN
        RETURN jsonb_build_object('error', 'forbidden');
      END IF;
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
