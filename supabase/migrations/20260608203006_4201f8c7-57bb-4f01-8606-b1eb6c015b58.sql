-- Revoke direct SELECT on sensitive answer-key columns from authenticated role.
-- correct_index and explanation must only be exposed through SECURITY DEFINER RPCs
-- (e.g. submit_exam_session) AFTER an exam session is submitted.
REVOKE SELECT ON public.questions FROM authenticated;

GRANT SELECT (
  id,
  lesson_id,
  subject_id,
  question_text,
  options,
  question_type,
  year,
  sort_order,
  created_at,
  unit,
  semester
) ON public.questions TO authenticated;

-- service_role keeps full access (admin operations via RPCs / server functions)
GRANT ALL ON public.questions TO service_role;