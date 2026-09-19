-- Exact production normalization trigger (20260812234007). The old fixture
-- had the unique index but omitted this trigger, hiding the replay defect.
CREATE OR REPLACE FUNCTION public.normalize_lesson_explanation_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.explanation_code IS NOT NULL THEN
    IF public.normalize_content_code(NEW.explanation_code) IS NULL THEN
      RAISE EXCEPTION 'explanation_code cannot be empty or whitespace only' USING ERRCODE = '23514';
    END IF;
    NEW.explanation_code := public.normalize_content_code(NEW.explanation_code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_lesson_explanation_code ON public.lesson_explanations;
CREATE TRIGGER trg_normalize_lesson_explanation_code
  BEFORE INSERT OR UPDATE ON public.lesson_explanations
  FOR EACH ROW EXECUTE FUNCTION public.normalize_lesson_explanation_code();
