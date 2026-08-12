-- =============================================================================
-- content_html chain delta for the phase-03 rehearsal (04A).
--
-- Mirrors, IN REAL APPLY ORDER, the parts of
--   supabase/migrations/20260808060000_content_html_resource_contract_alignment.sql
--   supabase/migrations/20260809010000_content_html_resource_code_boundary_hardening.sql
-- that touch lesson_resources.resource_code.
--
-- These two migrations exist in the repo but are NOT applied to the managed
-- database (verified 2026-08-13). The rehearsal applies this chain both BEFORE
-- and AFTER the pending phase-03 migration to prove order independence.
-- =============================================================================

-- ---------------------------------------------------------------- 20260808060000
ALTER TABLE public.lesson_resources
  ADD COLUMN IF NOT EXISTS resource_code text,
  ADD COLUMN IF NOT EXISTS html_resource_type text;

CREATE OR REPLACE FUNCTION public.normalize_resource_code(p_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT NULLIF(trim(p_code), '');
$$;

DROP INDEX IF EXISTS idx_lesson_resources_code_per_lesson;
CREATE UNIQUE INDEX idx_lesson_resources_code_per_lesson
  ON public.lesson_resources (lesson_id, resource_code)
  WHERE resource_code IS NOT NULL;

-- ---------------------------------------------------------------- 20260809010000
-- Hardened canonical normalizer: this is the terminal definition of the chain
-- and is semantically identical to the one declared by the pending phase-03
-- migration, so 03 -> content_html and content_html -> 03 converge.
CREATE OR REPLACE FUNCTION public.normalize_resource_code(p_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT NULLIF(lower(regexp_replace(p_code, '^\s+|\s+$', '', 'g')), '');
$$;

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
  FOR EACH ROW EXECUTE FUNCTION public.normalize_lesson_resource_code();

CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_resources_code_per_lesson
  ON public.lesson_resources (lesson_id, resource_code)
  WHERE resource_code IS NOT NULL;
