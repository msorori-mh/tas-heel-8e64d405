-- =============================================================================
-- IMPORT_NON_PROD_MIGRATION_INDEPENDENT_REVIEW_04
-- Fresh-compatible non-prod baseline for the staging/execution migration rehearsal.
--
-- This file reproduces ONLY the objects the pending migration
-- (supabase/migrations-pending/20260813010000_import_staging_and_execution_03.sql)
-- actually touches or references, in the shape they currently have in the
-- managed database (verified via information_schema on 2026-08-13).
--
-- It is a test fixture. It is never applied to any real environment.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);

-- Supabase's auth.uid() reads the request JWT claim. The rehearsal sets the GUC
-- directly so authorization paths can be exercised without a real JWT.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- ---------------------------------------------------------------------------
-- roles / rbac helpers
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user','content_manager');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_full_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_content_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'content_manager');
$$;

-- ---------------------------------------------------------------------------
-- curriculum / content tables (subset of columns the migration writes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.curriculum_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_name text NOT NULL,
  track_code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'secondary',
  sort_order integer NOT NULL DEFAULT 0,
  curriculum_track_id uuid REFERENCES public.curriculum_tracks(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id uuid NOT NULL REFERENCES public.grades(id),
  slug text NOT NULL,
  name text NOT NULL,
  code text,
  icon text,
  color text,
  semester integer,
  curriculum_track_id uuid REFERENCES public.curriculum_tracks(id),
  lessons_count integer DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grade_id, slug)
);
CREATE UNIQUE INDEX IF NOT EXISTS subjects_code_uniq ON public.subjects (code) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  code text,
  title text NOT NULL,
  description text,
  semester integer,
  is_free boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS units_code_subject_uniq
  ON public.units (subject_id, code) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id),
  slug text NOT NULL,
  title text NOT NULL,
  duration text,
  semester integer,
  is_free boolean DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lessons_subject_id_slug_key UNIQUE (subject_id, slug)
);
-- 04A correction (finding H-2 = NOT_A_DEFECT): production DOES have
-- lessons_subject_id_slug_key UNIQUE (subject_id, slug); the earlier rehearsal
-- fixture drifted from the real schema and produced a false blocker.



CREATE TABLE IF NOT EXISTS public.lesson_book_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL UNIQUE REFERENCES public.lessons(id) ON DELETE CASCADE,
  content text,
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lesson_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  title text,
  content text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lesson_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  instructions text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE public.lesson_resource_type AS ENUM ('video','mindmap','experiment','pdf','link');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.lesson_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  resource_type public.lesson_resource_type NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- NOTE (finding H-1): production lesson_resources has NO resource_code column.
-- It is created only by the unapplied content-html prerequisite migrations.

CREATE TABLE IF NOT EXISTS public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_index integer NOT NULL DEFAULT 0,
  explanation text,
  code text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS questions_code_uniq ON public.questions (code) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.assessment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.lesson_assessments(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  points numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assessment_questions_unique UNIQUE (assessment_id, question_id)
);

-- ---------------------------------------------------------------------------
-- import_jobs (baseline shape, before the phase-03 columns)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  import_type text NOT NULL CHECK (import_type IN ('structure','questions','exam_templates','config','mixed')),
  template_key text,
  original_filename text,
  file_size_bytes bigint CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  mime_type text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','validating','validated','validation_failed','executing','completed','failed','cancelled')),
  mode text NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('dry_run','execute')),
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_rows integer NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  invalid_rows integer NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  warning_rows integer NOT NULL DEFAULT 0 CHECK (warning_rows >= 0),
  inserted_count integer NOT NULL DEFAULT 0 CHECK (inserted_count >= 0),
  updated_count integer NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text
);

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;
