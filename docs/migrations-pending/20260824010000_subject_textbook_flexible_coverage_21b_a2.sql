-- =====================================================================
-- TAMKEEN_SUBJECT_TEXTBOOK_FLEXIBLE_COVERAGE_21B_A2  (PENDING — NOT APPLIED)
--
-- Product correction: curriculum textbooks exist in two real shapes.
--   1) FULL_ACADEMIC_YEAR  — one book covering both semesters (majority)
--   2) SEMESTER_SPECIFIC   — a book bound to semester 1 or 2 (e.g. Quran)
--
-- 21B-A1 hard-coded FULL_ACADEMIC_YEAR and forced `semester IS NULL`.
-- This migration widens the coverage contract only. No data migration
-- (production rows = 0), no storage mutation, no RLS widening.
--
-- IDENTITY
--   FULL_ACADEMIC_YEAR : subject x track x storage_path
--   SEMESTER_SPECIFIC  : subject x track x storage_path x semester
-- semester is scope metadata, never mandatory identity.
-- =====================================================================

-- 1) coverage -> coverage_type with two allowed values -----------------
ALTER TABLE public.subject_textbooks
  ADD COLUMN IF NOT EXISTS coverage_type text;

UPDATE public.subject_textbooks
   SET coverage_type = COALESCE(coverage_type, 'FULL_ACADEMIC_YEAR')
 WHERE coverage_type IS NULL;

ALTER TABLE public.subject_textbooks
  ALTER COLUMN coverage_type SET DEFAULT 'FULL_ACADEMIC_YEAR';
ALTER TABLE public.subject_textbooks
  ALTER COLUMN coverage_type SET NOT NULL;

-- legacy 21B-A1 column is retired (it only ever held FULL_ACADEMIC_YEAR)
ALTER TABLE public.subject_textbooks
  DROP CONSTRAINT IF EXISTS subject_textbooks_coverage_valid;
ALTER TABLE public.subject_textbooks
  DROP COLUMN IF EXISTS coverage;

ALTER TABLE public.subject_textbooks
  DROP CONSTRAINT IF EXISTS subject_textbooks_coverage_type_valid;
ALTER TABLE public.subject_textbooks
  ADD CONSTRAINT subject_textbooks_coverage_type_valid
  CHECK (coverage_type IN ('FULL_ACADEMIC_YEAR', 'SEMESTER_SPECIFIC'));

-- 2) semester rules tied to coverage_type ------------------------------
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

-- 3) minimal uniqueness: block byte-identical duplicate scope rows only
--    (multiple real books per subject/track/coverage stay possible:
--     core book, appendix, extra part — each has its own storage_path)
DROP INDEX IF EXISTS public.subject_textbooks_scope_path_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS subject_textbooks_scope_path_uidx
  ON public.subject_textbooks (
    subject_id,
    COALESCE(curriculum_track_id, '00000000-0000-0000-0000-000000000000'::uuid),
    storage_path,
    COALESCE(semester, 0)
  );

-- 4) student discovery index (semester-aware, still subject-first) -----
DROP INDEX IF EXISTS public.subject_textbooks_subject_idx;

CREATE INDEX IF NOT EXISTS subject_textbooks_subject_idx
  ON public.subject_textbooks (subject_id, coverage_type, semester, sort_order);

COMMENT ON COLUMN public.subject_textbooks.coverage_type IS
  '21B-A2 — FULL_ACADEMIC_YEAR (semester IS NULL) or SEMESTER_SPECIFIC (semester 1|2).';
COMMENT ON COLUMN public.subject_textbooks.semester IS
  '21B-A2 — scope metadata: NULL for full-year books, 1|2 for semester-specific books.';
COMMENT ON TABLE public.subject_textbooks IS
  '21B-A2 — curriculum textbooks scoped to subject x curriculum track, with flexible coverage (full year or a single semester). Bytes reuse the private lesson-pdfs bucket.';

-- 5) Grants unchanged (students read-only) -----------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.subject_textbooks FROM authenticated;
REVOKE ALL ON public.subject_textbooks FROM anon, PUBLIC;
GRANT SELECT ON public.subject_textbooks TO authenticated;
GRANT ALL ON public.subject_textbooks TO service_role;

-- =====================================================================
-- ROLLBACK (manual, safe while rows = 0):
--   ALTER TABLE public.subject_textbooks DROP CONSTRAINT subject_textbooks_semester_valid;
--   ALTER TABLE public.subject_textbooks ADD CONSTRAINT subject_textbooks_semester_valid
--     CHECK (semester IS NULL);
--   ALTER TABLE public.subject_textbooks ADD COLUMN coverage text NOT NULL DEFAULT 'FULL_ACADEMIC_YEAR';
--   ALTER TABLE public.subject_textbooks ADD CONSTRAINT subject_textbooks_coverage_valid
--     CHECK (coverage IN ('FULL_ACADEMIC_YEAR'));
--   ALTER TABLE public.subject_textbooks DROP CONSTRAINT subject_textbooks_coverage_type_valid;
--   DROP INDEX public.subject_textbooks_subject_idx;          -- depends on coverage_type
--   ALTER TABLE public.subject_textbooks DROP COLUMN coverage_type;
--   DROP INDEX IF EXISTS public.subject_textbooks_scope_path_uidx;
--   CREATE UNIQUE INDEX subject_textbooks_scope_path_uidx ON public.subject_textbooks
--     (subject_id, COALESCE(curriculum_track_id,'00000000-0000-0000-0000-000000000000'::uuid), storage_path);
--   CREATE INDEX subject_textbooks_subject_idx ON public.subject_textbooks (subject_id, sort_order);
-- =====================================================================
