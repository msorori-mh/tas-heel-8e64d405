REVOKE ALL ON public.lesson_capability_lifecycle FROM anon;
REVOKE ALL ON FUNCTION public.lesson_capability_transition(uuid, text, text, jsonb, text) FROM anon;
GRANT SELECT ON public.lesson_capability_lifecycle TO authenticated;
GRANT ALL ON public.lesson_capability_lifecycle TO service_role;
GRANT EXECUTE ON FUNCTION public.lesson_capability_transition(uuid, text, text, jsonb, text) TO authenticated;