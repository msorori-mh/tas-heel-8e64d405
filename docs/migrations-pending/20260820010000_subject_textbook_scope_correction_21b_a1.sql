-- =====================================================================
-- TAMKEEN_SUBJECT_TEXTBOOK_SCOPE_CORRECTION_21B_A1  (PENDING — NOT APPLIED)
--
-- Product correction: a subject has ONE curriculum textbook covering the
-- FULL academic year (both semesters). `semester` must not be part of the
-- textbook identity / uniqueness.
--
-- TARGET IDENTITY: subject_id x curriculum_track_id x storage_path
--
-- Minimal correction (production rows = 0):
--   * rebuild the unique index without semester
--   * rebuild the lookup index without semester
--   * neutralise `semester` (kept as a deprecated, always-NULL column so the
--     change stays compatible with already-deployed clients)
--   * add `coverage` metadata (FULL_ACADEMIC_YEAR)
-- No table drop, no data migration, no storage mutation. Idempotent.
-- =====================================================================

-- 1) Identity without semester ---------------------------------------
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

-- 2) Coverage metadata (full academic year by contract) ---------------
ALTER TABLE public.subject_textbooks
  ADD COLUMN IF NOT EXISTS coverage text NOT NULL DEFAULT 'FULL_ACADEMIC_YEAR';

ALTER TABLE public.subject_textbooks
  DROP CONSTRAINT IF EXISTS subject_textbooks_coverage_valid;
ALTER TABLE public.subject_textbooks
  ADD CONSTRAINT subject_textbooks_coverage_valid
  CHECK (coverage IN ('FULL_ACADEMIC_YEAR'));

-- 3) Neutralise semester (deprecated metadata, never scoping) ---------
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

-- 4) Grants unchanged (students read-only) ----------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.subject_textbooks FROM authenticated;
REVOKE ALL ON public.subject_textbooks FROM anon, PUBLIC;
GRANT SELECT ON public.subject_textbooks TO authenticated;
GRANT ALL ON public.subject_textbooks TO service_role;

-- =====================================================================
-- ROLLBACK (manual):
--   DROP INDEX IF EXISTS public.subject_textbooks_scope_path_uidx;
--   CREATE UNIQUE INDEX subject_textbooks_scope_path_uidx
--     ON public.subject_textbooks (subject_id,
--       COALESCE(curriculum_track_id,'00000000-0000-0000-0000-000000000000'::uuid),
--       COALESCE(semester,0), storage_path);
--   DROP INDEX IF EXISTS public.subject_textbooks_subject_idx;
--   CREATE INDEX subject_textbooks_subject_idx
--     ON public.subject_textbooks (subject_id, semester, sort_order);
--   ALTER TABLE public.subject_textbooks DROP CONSTRAINT subject_textbooks_semester_valid;
--   ALTER TABLE public.subject_textbooks ADD CONSTRAINT subject_textbooks_semester_valid
--     CHECK (semester IS NULL OR semester IN (1,2));
--   ALTER TABLE public.subject_textbooks DROP CONSTRAINT subject_textbooks_coverage_valid;
--   ALTER TABLE public.subject_textbooks DROP COLUMN coverage;
-- =====================================================================
