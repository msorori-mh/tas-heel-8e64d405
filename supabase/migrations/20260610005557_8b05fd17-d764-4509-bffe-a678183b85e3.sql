
-- 1) Lightweight RPC: check single answer without writing progress
CREATE OR REPLACE FUNCTION public.check_lesson_question(_question_id uuid, _selected_index integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  SELECT id, lesson_id, correct_index, explanation INTO v_q FROM public.questions WHERE id = _question_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'question_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_q.lesson_id IS NULL OR NOT public.can_access_lesson(v_q.lesson_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'question_id', v_q.id,
    'is_correct', (_selected_index IS NOT NULL AND _selected_index = v_q.correct_index),
    'correct_index', v_q.correct_index,
    'explanation', v_q.explanation
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_lesson_question(uuid, integer) TO authenticated;

-- 2) Lock down direct column access to the two sensitive columns
REVOKE SELECT (correct_index, explanation) ON public.questions FROM anon, authenticated;
