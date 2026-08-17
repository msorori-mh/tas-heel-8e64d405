-- =====================================================================
-- TAMKEEN_SUBJECT_TEXTBOOK_MULTI_BOOK_TYPES_21B_A3  (PENDING — NOT APPLIED)
--
-- Product correction: a subject may legitimately own several real books
-- at the same time, e.g. a main textbook AND an exercise book, each of
-- which can be full-year or semester-specific.
--
-- BOOK_TYPE and COVERAGE_TYPE are INDEPENDENT dimensions:
--   book_type     : MAIN_TEXTBOOK | EXERCISE_BOOK | OTHER
--   coverage_type : FULL_ACADEMIC_YEAR (semester IS NULL)
--                 | SEMESTER_SPECIFIC  (semester IN (1,2))
-- book_type never implies a semester; coverage never implies a book kind.
--
-- No subject names are hard-coded anywhere. Production rows = 0 at the
-- time of writing, so no data migration and no storage mutation.
-- =====================================================================

-- 1) book_type dimension ----------------------------------------------
ALTER TABLE public.subject_textbooks
  ADD COLUMN IF NOT EXISTS book_type text;

UPDATE public.subject_textbooks
   SET book_type = 'MAIN_TEXTBOOK'
 WHERE book_type IS NULL;

ALTER TABLE public.subject_textbooks
  ALTER COLUMN book_type SET DEFAULT 'MAIN_TEXTBOOK';
ALTER TABLE public.subject_textbooks
  ALTER COLUMN book_type SET NOT NULL;

ALTER TABLE public.subject_textbooks
  DROP CONSTRAINT IF EXISTS subject_textbooks_book_type_valid;
ALTER TABLE public.subject_textbooks
  ADD CONSTRAINT subject_textbooks_book_type_valid
  CHECK (book_type IN ('MAIN_TEXTBOOK', 'EXERCISE_BOOK', 'OTHER'));

-- coverage rules stay exactly as 21B-A2 defined them (re-asserted here so
-- the migration is self-contained and idempotent).
ALTER TABLE public.subject_textbooks
  DROP CONSTRAINT IF EXISTS subject_textbooks_semester_valid;
ALTER TABLE public.subject_textbooks
  ADD CONSTRAINT subject_textbooks_semester_valid
  CHECK (
    (coverage_type = 'FULL_ACADEMIC_YEAR' AND semester IS NULL)
    OR
    (coverage_type = 'SEMESTER_SPECIFIC' AND semester IS NOT NULL AND semester IN (1, 2))
  );

-- 2) minimal uniqueness -------------------------------------------------
--    A duplicate record = same scope AND the same bytes. Title is NEVER
--    part of identity, and the constraint must not block a second real
--    book in the same subject/track/coverage.
DROP INDEX IF EXISTS public.subject_textbooks_scope_path_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS subject_textbooks_scope_path_uidx
  ON public.subject_textbooks (
    subject_id,
    COALESCE(curriculum_track_id, '00000000-0000-0000-0000-000000000000'::uuid),
    book_type,
    coverage_type,
    COALESCE(semester, 0),
    storage_path
  );

-- 3) discovery / ordering index ----------------------------------------
DROP INDEX IF EXISTS public.subject_textbooks_subject_idx;

CREATE INDEX IF NOT EXISTS subject_textbooks_subject_idx
  ON public.subject_textbooks (subject_id, book_type, coverage_type, semester, sort_order);

COMMENT ON COLUMN public.subject_textbooks.book_type IS
  '21B-A3 — MAIN_TEXTBOOK | EXERCISE_BOOK | OTHER. Independent of coverage_type.';
COMMENT ON TABLE public.subject_textbooks IS
  '21B-A3 — curriculum books scoped to subject x track, with independent book type (main/exercise/other) and coverage (full year or one semester). Bytes reuse the private lesson-pdfs bucket.';

-- 4) Grants unchanged (students read-only) ------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.subject_textbooks FROM authenticated;
REVOKE ALL ON public.subject_textbooks FROM anon, PUBLIC;
GRANT SELECT ON public.subject_textbooks TO authenticated;
GRANT ALL ON public.subject_textbooks TO service_role;

-- =====================================================================
-- ROLLBACK (manual, safe while rows = 0):
--   DROP INDEX IF EXISTS public.subject_textbooks_subject_idx;
--   DROP INDEX IF EXISTS public.subject_textbooks_scope_path_uidx;
--   ALTER TABLE public.subject_textbooks DROP CONSTRAINT subject_textbooks_book_type_valid;
--   ALTER TABLE public.subject_textbooks DROP COLUMN book_type;
--   CREATE UNIQUE INDEX subject_textbooks_scope_path_uidx ON public.subject_textbooks
--     (subject_id, COALESCE(curriculum_track_id,'00000000-0000-0000-0000-000000000000'::uuid),
--      storage_path, COALESCE(semester, 0));
--   CREATE INDEX subject_textbooks_subject_idx ON public.subject_textbooks
--     (subject_id, coverage_type, semester, sort_order);
-- =====================================================================
