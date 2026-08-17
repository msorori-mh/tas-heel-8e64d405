-- TAMKEEN_20C_MIGRATION_RECONCILIATION_AND_SECURITY_CLOSURE_20C_A1
-- Follow-up, IDEMPOTENT, behaviour-neutral.
-- Purpose: record in migration history the grant hardening that was applied
-- manually on production after the 20C-A apply. It must NOT widen any
-- privilege and must NOT touch data or lifecycle rules.
--
-- PREPARE ONLY — apply on production only after
-- APPROVED_PRODUCTION_20C_SECURITY_RECONCILIATION_APPLY.

BEGIN;

/* 1 — table: anon has no access at all; authenticated is read-only. */
REVOKE ALL ON TABLE public.lesson_capability_lifecycle FROM anon;
REVOKE ALL ON TABLE public.lesson_capability_lifecycle FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.lesson_capability_lifecycle FROM authenticated;
GRANT SELECT ON TABLE public.lesson_capability_lifecycle TO authenticated;
GRANT ALL    ON TABLE public.lesson_capability_lifecycle TO service_role;

/* 2 — transition RPC: SECURITY DEFINER, staff-guarded, never public/anon. */
REVOKE ALL ON FUNCTION
  public.lesson_capability_transition(uuid, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION
  public.lesson_capability_transition(uuid, text, text, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION
  public.lesson_capability_transition(uuid, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION
  public.lesson_capability_transition(uuid, text, text, jsonb, text) TO service_role;

/* 3 — trigger helper: callable by nobody but the trigger owner. */
REVOKE ALL ON FUNCTION public.touch_lesson_capability_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_lesson_capability_lifecycle() FROM anon;
REVOKE ALL ON FUNCTION public.touch_lesson_capability_lifecycle() FROM authenticated;

/* 4 — pin search_path defensively (no-op if already pinned). */
ALTER FUNCTION public.lesson_capability_transition(uuid, text, text, jsonb, text)
  SET search_path = public;
ALTER FUNCTION public.touch_lesson_capability_lifecycle()
  SET search_path = public;

COMMIT;
