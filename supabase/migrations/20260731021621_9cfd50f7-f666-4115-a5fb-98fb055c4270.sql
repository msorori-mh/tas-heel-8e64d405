REVOKE SELECT ON public.questions FROM anon;
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
  semester,
  code
) ON public.questions TO authenticated;

REVOKE SELECT (correct_index, explanation) ON public.questions FROM anon, authenticated;

GRANT ALL ON public.questions TO service_role;