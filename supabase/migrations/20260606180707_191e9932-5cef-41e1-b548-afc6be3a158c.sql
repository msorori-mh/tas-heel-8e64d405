
CREATE OR REPLACE FUNCTION public.submit_unit_practice_attempt(_unit_id uuid, _answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_grade jsonb;
  v_subject_id uuid;
  v_total int;
  v_answered int;
  v_correct int;
  v_score int;
  v_per_question jsonb;
  v_valid_ids uuid[];
  v_answers_clean jsonb;
  v_attempt_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  -- Reuse grading (handles auth, grade/track, free/sub/admin, question filtering)
  v_grade := public.grade_unit_practice(_unit_id, _answers);

  IF v_grade ? 'error' THEN
    RETURN v_grade;
  END IF;

  SELECT subject_id INTO v_subject_id FROM public.units WHERE id = _unit_id;
  IF v_subject_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  v_total      := COALESCE((v_grade->>'total')::int, 0);
  v_answered   := COALESCE((v_grade->>'answered')::int, 0);
  v_correct    := COALESCE((v_grade->>'correct')::int, 0);
  v_score      := COALESCE((v_grade->>'score')::int, 0);
  v_per_question := COALESCE(v_grade->'per_question', '[]'::jsonb);

  -- Whitelist of valid question_ids (the ones that were graded)
  SELECT COALESCE(array_agg((pq->>'question_id')::uuid), ARRAY[]::uuid[])
  INTO v_valid_ids
  FROM jsonb_array_elements(v_per_question) pq;

  -- Clean answers: only question_id + selected_index, and only ids in valid set
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'question_id', (elem->>'question_id')::uuid,
            'selected_index', NULLIF(elem->>'selected_index','')::int
         )), '[]'::jsonb)
  INTO v_answers_clean
  FROM jsonb_array_elements(_answers) elem
  WHERE elem ? 'question_id'
    AND (elem->>'question_id')::uuid = ANY(v_valid_ids);

  INSERT INTO public.unit_practice_attempts (
    user_id, unit_id, subject_id, total, answered, correct, score, answers, per_question
  ) VALUES (
    v_user, _unit_id, v_subject_id, v_total, v_answered, v_correct, v_score, v_answers_clean, v_per_question
  )
  RETURNING id INTO v_attempt_id;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id,
    'total', v_total,
    'answered', v_answered,
    'correct', v_correct,
    'score', v_score,
    'per_question', v_per_question
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_unit_practice_attempt(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_unit_practice_attempt(uuid, jsonb) TO authenticated;
