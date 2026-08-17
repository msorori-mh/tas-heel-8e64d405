BEGIN;

REVOKE ALL ON TABLE public.lesson_capability_lifecycle FROM anon;
REVOKE ALL ON TABLE public.lesson_capability_lifecycle FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.lesson_capability_lifecycle FROM authenticated;
GRANT SELECT ON TABLE public.lesson_capability_lifecycle TO authenticated;
GRANT ALL    ON TABLE public.lesson_capability_lifecycle TO service_role;

REVOKE ALL ON FUNCTION
  public.lesson_capability_transition(uuid, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public.lesson_capability_transition(uuid, text, text, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION
  public.lesson_capability_transition(uuid, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.lesson_capability_transition(uuid, text, text, jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.touch_lesson_capability_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_lesson_capability_lifecycle() FROM anon;
REVOKE ALL ON FUNCTION public.touch_lesson_capability_lifecycle() FROM authenticated;

ALTER FUNCTION public.lesson_capability_transition(uuid, text, text, jsonb, text)
  SET search_path = public;
ALTER FUNCTION public.touch_lesson_capability_lifecycle()
  SET search_path = public;

COMMIT;