-- =============================================================================
-- Canonical content-code prerequisite for the isolated CF11 PG17 rehearsal.
--
-- Mirrors the production definition installed by the import/content migrations.
-- CF11 resolves the self-test assessment through this normalized stable code.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.normalize_content_code(p_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT NULLIF(lower(regexp_replace(p_code, '^\s+|\s+$', '', 'g')), '');
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_content_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_content_code(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.normalize_lesson_assessment_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.assessment_code IS NOT NULL THEN
    IF public.normalize_content_code(NEW.assessment_code) IS NULL THEN
      RAISE EXCEPTION 'assessment_code cannot be empty or whitespace only' USING ERRCODE = '23514';
    END IF;
    NEW.assessment_code := public.normalize_content_code(NEW.assessment_code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_lesson_assessment_code ON public.lesson_assessments;
CREATE TRIGGER trg_normalize_lesson_assessment_code
  BEFORE INSERT OR UPDATE ON public.lesson_assessments
  FOR EACH ROW EXECUTE FUNCTION public.normalize_lesson_assessment_code();
