-- 21B-A2 — local PG17 baseline reproducing the CURRENT production schema of
-- public.subject_textbooks (post 21B-A1 apply). No production data involved.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE TABLE public.curriculum_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_name text NOT NULL
);

CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

CREATE OR REPLACE FUNCTION public.can_access_subject(_subject_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.user_can_access_subject_curriculum(_subject_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.current_student_track_id()
RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE OR REPLACE FUNCTION public.is_content_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE TABLE public.subject_textbooks (
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
  coverage text NOT NULL DEFAULT 'FULL_ACADEMIC_YEAR',
  CONSTRAINT subject_textbooks_bucket_allowed CHECK (storage_bucket = 'lesson-pdfs'),
  CONSTRAINT subject_textbooks_coverage_valid CHECK (coverage IN ('FULL_ACADEMIC_YEAR')),
  CONSTRAINT subject_textbooks_path_shape
    CHECK (storage_path ~ '^subject-textbooks/[0-9a-fA-F-]{36}/[^/]+\.pdf$'),
  CONSTRAINT subject_textbooks_semester_valid CHECK (semester IS NULL),
  CONSTRAINT subject_textbooks_sha256_shape CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT subject_textbooks_title_not_blank CHECK (btrim(title) <> '')
);

CREATE UNIQUE INDEX subject_textbooks_scope_path_uidx
  ON public.subject_textbooks (
    subject_id,
    COALESCE(curriculum_track_id, '00000000-0000-0000-0000-000000000000'::uuid),
    storage_path
  );
CREATE INDEX subject_textbooks_subject_idx ON public.subject_textbooks (subject_id, sort_order);
CREATE INDEX subject_textbooks_active_idx ON public.subject_textbooks (subject_id) WHERE is_active;

ALTER TABLE public.subject_textbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Content staff read all textbooks" ON public.subject_textbooks
  FOR SELECT TO authenticated USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Students read entitled active textbooks" ON public.subject_textbooks
  FOR SELECT TO authenticated USING (
    is_active
    AND public.can_access_subject(subject_id)
    AND public.user_can_access_subject_curriculum(subject_id)
    AND (curriculum_track_id IS NULL OR curriculum_track_id = public.current_student_track_id())
  );

REVOKE ALL ON public.subject_textbooks FROM anon, PUBLIC;
GRANT SELECT ON public.subject_textbooks TO authenticated;
GRANT ALL ON public.subject_textbooks TO service_role;
