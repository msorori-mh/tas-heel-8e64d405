-- ============================================================================
-- Migration: Content HTML Resource Code Boundary Hardening
-- Created At: 2026-08-09
-- Scoped Objective: Close the resource_code canonicalization contract at the
--                   PostgreSQL boundary without mutating prior migrations.
-- Rules: Additive only; deterministic normalization; empty/whitespace denied;
--        uniqueness enforced on canonical values.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ensure the canonical normalizer is present and deterministic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_resource_code(p_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT NULLIF(lower(regexp_replace(p_code, '^\s+|\s+$', '', 'g')), '');
$$;

-- ----------------------------------------------------------------------------
-- 2. Normalize resource_code automatically at the DB boundary
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_lesson_resource_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.resource_code IS NOT NULL THEN
    IF public.normalize_resource_code(NEW.resource_code) IS NULL THEN
      RAISE EXCEPTION 'resource_code cannot be empty or whitespace only' USING ERRCODE = '23514';
    END IF;
    NEW.resource_code := public.normalize_resource_code(NEW.resource_code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_lesson_resource_code ON public.lesson_resources;
CREATE TRIGGER trg_normalize_lesson_resource_code
  BEFORE INSERT OR UPDATE ON public.lesson_resources
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_lesson_resource_code();

-- ----------------------------------------------------------------------------
-- 3. Enforce canonical non-empty resource_code
-- ----------------------------------------------------------------------------
ALTER TABLE public.lesson_resources
  DROP CONSTRAINT IF EXISTS lesson_resources_resource_code_canonical_check,
  ADD CONSTRAINT lesson_resources_resource_code_canonical_check
    CHECK (
      resource_code IS NULL
      OR resource_code = public.normalize_resource_code(resource_code)
    );

ALTER TABLE public.lesson_resources
  DROP CONSTRAINT IF EXISTS lesson_resources_resource_code_non_empty_check,
  ADD CONSTRAINT lesson_resources_resource_code_non_empty_check
    CHECK (
      resource_code IS NULL
      OR length(resource_code) > 0
    );

-- ----------------------------------------------------------------------------
-- 4. Replace partial unique index with canonical-semantics index
--    The trigger stores normalized values, so the index operates on the
--    canonical representation. The expression form is kept for explicitness.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_lesson_resources_code_per_lesson;
CREATE UNIQUE INDEX idx_lesson_resources_code_per_lesson
  ON public.lesson_resources (lesson_id, public.normalize_resource_code(resource_code))
  WHERE resource_code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. Revoke / grant the trigger helper (defense-in-depth; triggers are
--    executed by table owner, but explicit revoke keeps PUBLIC clean)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.normalize_lesson_resource_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_lesson_resource_code() TO authenticated, service_role;
