-- =====================================================================
-- TAMKEEN_SUBJECT_TEXTBOOKS_AND_OFFLINE_DOWNLOADS_21B
-- Curriculum textbooks at SUBJECT x CURRICULUM_TRACK x SEMESTER level.
--
-- Reuse-only migration:
--   * bytes live in the EXISTING private bucket `lesson-pdfs`
--     (path prefix `subject-textbooks/<subject_id>/<uuid>.pdf`)
--   * delivery reuses the 18C authenticated file route + offline cache
--   * NO new storage bucket, NO new storage RLS, NO lesson_resources change
--
-- Idempotent: safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Rollback: see the commented block at the bottom of this file.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.subject_textbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  curriculum_track_id uuid REFERENCES public.curriculum_tracks(id) ON DELETE RESTRICT,
  semester smallint,
  title text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'lesson-pdfs',
  storage_path text NOT NULL,
  file_name text,
  file_size bigint,
  version text NOT NULL,
  sha256 text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subject_textbooks_semester_valid CHECK (semester IS NULL OR semester IN (1, 2)),
  CONSTRAINT subject_textbooks_bucket_allowed CHECK (storage_bucket = 'lesson-pdfs'),
  CONSTRAINT subject_textbooks_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT subject_textbooks_sha256_shape CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT subject_textbooks_path_shape CHECK (
    storage_path ~ '^subject-textbooks/[0-9a-fA-F-]{36}/[^/]+\.pdf$'
  )
);

COMMENT ON TABLE public.subject_textbooks IS
  '21B — curriculum textbooks scoped to subject x curriculum track x semester. Bytes reuse the private lesson-pdfs bucket.';

-- The same physical file may legitimately serve two tracks (sanaa/aden):
-- storage_path is NOT unique on purpose (no duplicated bytes).
CREATE UNIQUE INDEX IF NOT EXISTS subject_textbooks_scope_path_uidx
  ON public.subject_textbooks (
    subject_id,
    COALESCE(curriculum_track_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(semester, 0),
    storage_path
  );

CREATE INDEX IF NOT EXISTS subject_textbooks_subject_idx
  ON public.subject_textbooks (subject_id, semester, sort_order);

CREATE INDEX IF NOT EXISTS subject_textbooks_active_idx
  ON public.subject_textbooks (subject_id) WHERE is_active;

-- ---------------------------------------------------------------------
-- GRANTS (Data API is not granted by default on public schema)
-- Students only ever READ; every write goes through content-staff server
-- functions running as service_role.
-- ---------------------------------------------------------------------
REVOKE ALL ON public.subject_textbooks FROM PUBLIC;
REVOKE ALL ON public.subject_textbooks FROM anon;
GRANT SELECT ON public.subject_textbooks TO authenticated;
GRANT ALL ON public.subject_textbooks TO service_role;

ALTER TABLE public.subject_textbooks ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- RLS — fail closed. A textbook can never widen grade/track access:
-- it is gated by exactly the same predicates as the subject itself.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Students read entitled active textbooks" ON public.subject_textbooks;
CREATE POLICY "Students read entitled active textbooks"
ON public.subject_textbooks
FOR SELECT
TO authenticated
USING (
  is_active
  AND public.can_access_subject(subject_id)
  AND public.user_can_access_subject_curriculum(subject_id)
  AND (
    curriculum_track_id IS NULL
    OR curriculum_track_id = public.current_student_track_id()
  )
);

DROP POLICY IF EXISTS "Content staff read all textbooks" ON public.subject_textbooks;
CREATE POLICY "Content staff read all textbooks"
ON public.subject_textbooks
FOR SELECT
TO authenticated
USING (public.is_content_staff(auth.uid()));

-- ---------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_subject_textbooks_updated_at ON public.subject_textbooks;
CREATE TRIGGER trg_subject_textbooks_updated_at
BEFORE UPDATE ON public.subject_textbooks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- Binding guard: a textbook may not be attached to a track the subject
-- does not belong to (WRONG_TRACK_BINDING_DENY).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_subject_textbook_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  subject_track uuid;
BEGIN
  SELECT s.curriculum_track_id INTO subject_track
  FROM public.subjects s WHERE s.id = NEW.subject_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subject_not_found' USING ERRCODE = '23503';
  END IF;

  IF subject_track IS NOT NULL
     AND NEW.curriculum_track_id IS NOT NULL
     AND NEW.curriculum_track_id <> subject_track THEN
    RAISE EXCEPTION 'textbook_track_mismatch' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_subject_textbook_binding() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_subject_textbook_binding() FROM anon;

DROP TRIGGER IF EXISTS trg_subject_textbooks_binding ON public.subject_textbooks;
CREATE TRIGGER trg_subject_textbooks_binding
BEFORE INSERT OR UPDATE OF subject_id, curriculum_track_id ON public.subject_textbooks
FOR EACH ROW EXECUTE FUNCTION public.assert_subject_textbook_binding();