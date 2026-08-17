DROP INDEX IF EXISTS public.subject_textbooks_scope_path_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS subject_textbooks_scope_path_uidx
  ON public.subject_textbooks (
    subject_id,
    COALESCE(curriculum_track_id, '00000000-0000-0000-0000-000000000000'::uuid),
    storage_path
  );

DROP INDEX IF EXISTS public.subject_textbooks_subject_idx;

CREATE INDEX IF NOT EXISTS subject_textbooks_subject_idx
  ON public.subject_textbooks (subject_id, sort_order);

ALTER TABLE public.subject_textbooks
  ADD COLUMN IF NOT EXISTS coverage text NOT NULL DEFAULT 'FULL_ACADEMIC_YEAR';

ALTER TABLE public.subject_textbooks
  DROP CONSTRAINT IF EXISTS subject_textbooks_coverage_valid;
ALTER TABLE public.subject_textbooks
  ADD CONSTRAINT subject_textbooks_coverage_valid
  CHECK (coverage IN ('FULL_ACADEMIC_YEAR'));

UPDATE public.subject_textbooks SET semester = NULL WHERE semester IS NOT NULL;

ALTER TABLE public.subject_textbooks ALTER COLUMN semester DROP DEFAULT;

ALTER TABLE public.subject_textbooks
  DROP CONSTRAINT IF EXISTS subject_textbooks_semester_valid;
ALTER TABLE public.subject_textbooks
  ADD CONSTRAINT subject_textbooks_semester_valid
  CHECK (semester IS NULL);

COMMENT ON COLUMN public.subject_textbooks.semester IS
  'DEPRECATED (21B-A1) — must stay NULL. One textbook covers the full academic year.';

COMMENT ON TABLE public.subject_textbooks IS
  '21B-A1 — curriculum textbooks scoped to subject x curriculum track (full academic year). Bytes reuse the private lesson-pdfs bucket.';

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.subject_textbooks FROM authenticated;
REVOKE ALL ON public.subject_textbooks FROM anon, PUBLIC;
GRANT SELECT ON public.subject_textbooks TO authenticated;
GRANT ALL ON public.subject_textbooks TO service_role;