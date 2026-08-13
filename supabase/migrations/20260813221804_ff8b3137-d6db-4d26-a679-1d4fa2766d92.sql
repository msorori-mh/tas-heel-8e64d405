ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS group_code text,
  ADD COLUMN IF NOT EXISTS group_name text;

COMMENT ON COLUMN public.subjects.group_code IS
  '12C.4 — stable machine identity for a subject group (e.g. arabic). Display/report grouping ONLY. MUST NOT be used in RLS, can_access_subject, question_targets, or any access-control decision.';
COMMENT ON COLUMN public.subjects.group_name IS
  '12C.4 — display label for the subject group (e.g. اللغة العربية). Editable; group_code is not.';

-- group_code must be a slug-ish stable code, and both fields travel together.
ALTER TABLE public.subjects
  DROP CONSTRAINT IF EXISTS subjects_group_code_format_chk;
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_group_code_format_chk
  CHECK (group_code IS NULL OR group_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE public.subjects
  DROP CONSTRAINT IF EXISTS subjects_group_pair_chk;
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_group_pair_chk
  CHECK ((group_code IS NULL) = (group_name IS NULL));

-- Consistency rule from 12B:
-- same (grade_id, curriculum_track_id, group_code) => same group_name.
CREATE OR REPLACE FUNCTION public.assert_subject_group_name_consistent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conflicting text;
BEGIN
  IF NEW.group_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.group_name INTO conflicting
  FROM public.subjects s
  WHERE s.id <> NEW.id
    AND s.group_code = NEW.group_code
    AND s.grade_id IS NOT DISTINCT FROM NEW.grade_id
    AND s.curriculum_track_id IS NOT DISTINCT FROM NEW.curriculum_track_id
    AND s.group_name IS DISTINCT FROM NEW.group_name
  LIMIT 1;

  IF conflicting IS NOT NULL THEN
    RAISE EXCEPTION
      'GROUP_NAME_CONFLICT: group_code=% already uses group_name=% for this grade/track (got %)',
      NEW.group_code, conflicting, NEW.group_name;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_subject_group_name_consistent() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS subjects_group_name_consistency_trg ON public.subjects;
CREATE TRIGGER subjects_group_name_consistency_trg
  BEFORE INSERT OR UPDATE OF group_code, group_name, grade_id, curriculum_track_id
  ON public.subjects
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_subject_group_name_consistent();

CREATE INDEX IF NOT EXISTS subjects_group_lookup_idx
  ON public.subjects (grade_id, curriculum_track_id, group_code)
  WHERE group_code IS NOT NULL;