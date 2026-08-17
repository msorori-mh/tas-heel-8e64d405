ALTER TABLE public.subject_textbooks
  ADD COLUMN IF NOT EXISTS coverage_type text;

UPDATE public.subject_textbooks
   SET coverage_type = COALESCE(coverage_type, 'FULL_ACADEMIC_YEAR')
 WHERE coverage_type IS NULL;

ALTER TABLE public.subject_textbooks
  ALTER COLUMN coverage_type SET DEFAULT 'FULL_ACADEMIC_YEAR';
ALTER TABLE public.subject_textbooks
  ALTER COLUMN coverage_type SET NOT NULL;

ALTER TABLE public.subject_textbooks
  DROP CONSTRAINT IF EXISTS subject_textbooks_coverage_valid;
ALTER TABLE public.subject_textbooks
  DROP COLUMN IF EXISTS coverage;

ALTER TABLE public.subject_textbooks
  DROP CONSTRAINT IF EXISTS subject_textbooks_coverage_type_valid;
ALTER TABLE public.subject_textbooks
  ADD CONSTRAINT subject_textbooks_coverage_type_valid
  CHECK (coverage_type IN ('FULL_ACADEMIC_YEAR', 'SEMESTER_SPECIFIC'));

ALTER TABLE public.subject_textbooks
  DROP CONSTRAINT IF EXISTS subject_textbooks_semester_valid;
ALTER TABLE public.subject_textbooks
  ADD CONSTRAINT subject_textbooks_semester_valid
  CHECK (
    (coverage_type = 'FULL_ACADEMIC_YEAR' AND semester IS NULL)
    OR
    (coverage_type = 'SEMESTER_SPECIFIC'
      AND semester IS NOT NULL
      AND semester IN (1, 2))
  );

DROP INDEX IF EXISTS public.subject_textbooks_scope_path_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS subject_textbooks_scope_path_uidx
  ON public.subject_textbooks (
    subject_id,
    COALESCE(curriculum_track_id, '00000000-0000-0000-0000-000000000000'::uuid),
    storage_path,
    COALESCE(semester, 0)
  );

DROP INDEX IF EXISTS public.subject_textbooks_subject_idx;

CREATE INDEX IF NOT EXISTS subject_textbooks_subject_idx
  ON public.subject_textbooks (subject_id, coverage_type, semester, sort_order);

COMMENT ON COLUMN public.subject_textbooks.coverage_type IS
  '21B-A2 — FULL_ACADEMIC_YEAR (semester IS NULL) or SEMESTER_SPECIFIC (semester 1|2).';
COMMENT ON COLUMN public.subject_textbooks.semester IS
  '21B-A2 — scope metadata: NULL for full-year books, 1|2 for semester-specific books.';
COMMENT ON TABLE public.subject_textbooks IS
  '21B-A2 — curriculum textbooks scoped to subject x curriculum track, with flexible coverage (full year or a single semester). Bytes reuse the private lesson-pdfs bucket.';

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.subject_textbooks FROM authenticated;
REVOKE ALL ON public.subject_textbooks FROM anon, PUBLIC;
GRANT SELECT ON public.subject_textbooks TO authenticated;
GRANT ALL ON public.subject_textbooks TO service_role;