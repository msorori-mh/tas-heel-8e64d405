-- TAMKEEN CONTENT V3 / 21H R3
-- Disposable PG17 fixture only. Never run against a shared or remote database.
--
-- The five contract tables below deliberately mirror the canonical migration
-- columns. In particular, practice_attempts has lesson_assessment_id and does
-- NOT have lesson_id. The R3 schema gate checks this fixture against the
-- canonical migration source before the runner is allowed to use it.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS public;

-- Supabase-defined database roles required by GRANT/REVOKE statements in the
-- production migration. These are disposable NOLOGIN roles in this fixture.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $roles$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'content_editor', 'content_reviewer', 'student');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid PRIMARY KEY,
  code text,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.units (
  id uuid PRIMARY KEY,
  subject_id uuid NOT NULL REFERENCES public.subjects(id),
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  semester integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  code text
);

-- Canonical source: 20260606003842... plus unit_id and semester additions.
CREATE TABLE IF NOT EXISTS public.lessons (
  id uuid PRIMARY KEY,
  subject_id uuid NOT NULL REFERENCES public.subjects(id),
  unit_id uuid REFERENCES public.units(id),
  slug text NOT NULL,
  title text NOT NULL,
  duration text,
  video_url text,
  content_text text,
  content_pdf_url text,
  is_free boolean DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  semester integer
);

-- Canonical source: 20260606003842... plus unit, semester, code, and the
-- revision pointer added by the QB-01 migrations.
CREATE TABLE IF NOT EXISTS public.questions (
  id uuid PRIMARY KEY,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  options jsonb NOT NULL,
  correct_index integer NOT NULL,
  explanation text,
  question_type text DEFAULT 'lesson',
  year integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  unit text,
  semester integer,
  code text,
  current_published_revision_id uuid
);

-- Canonical source: 20260606004917... plus assessment_code from
-- 20260812234007... .
CREATE TABLE IF NOT EXISTS public.lesson_assessments (
  id uuid PRIMARY KEY,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  instructions text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  assessment_code text
);

CREATE TABLE IF NOT EXISTS public.assessment_questions (
  id uuid PRIMARY KEY,
  assessment_id uuid NOT NULL REFERENCES public.lesson_assessments(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  points numeric NOT NULL DEFAULT 1,
  UNIQUE (assessment_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.question_revisions (
  id uuid PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  revision_number integer NOT NULL,
  status text NOT NULL,
  interaction_type text NOT NULL,
  grading_mode text,
  educational_label text,
  question_text text NOT NULL,
  max_score numeric NOT NULL DEFAULT 1,
  allow_partial boolean NOT NULL DEFAULT false,
  requires_media boolean NOT NULL DEFAULT false,
  manual_grading_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, revision_number),
  UNIQUE (question_id, id)
);

CREATE TABLE IF NOT EXISTS public.question_options (
  id uuid PRIMARY KEY,
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE CASCADE,
  option_code text NOT NULL,
  body text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_correct boolean NOT NULL DEFAULT false
);

-- Canonical source: 20260813002624... . There is intentionally no lesson_id.
CREATE TABLE IF NOT EXISTS public.practice_attempts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_type text NOT NULL,
  lesson_assessment_id uuid REFERENCES public.lesson_assessments(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES public.units(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  grading_status text NOT NULL DEFAULT 'IN_PROGRESS',
  total_score numeric,
  max_score numeric,
  attempt_pin_mode text NOT NULL DEFAULT 'LEGACY'
);

CREATE TABLE IF NOT EXISTS public.practice_attempt_questions (
  id uuid PRIMARY KEY,
  practice_attempt_id uuid NOT NULL REFERENCES public.practice_attempts(id) ON DELETE CASCADE,
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE RESTRICT,
  logical_question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  question_order integer NOT NULL,
  rendered_question_text text NOT NULL,
  rendered_stimulus_text text,
  rendered_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  option_order_mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_score numeric NOT NULL DEFAULT 1,
  payload_hash text NOT NULL,
  payload_hash_version text NOT NULL DEFAULT 'canonical_payload_v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_attempt_id, question_order),
  UNIQUE (practice_attempt_id, question_revision_id)
);

CREATE TABLE IF NOT EXISTS public.practice_attempt_responses (
  id uuid PRIMARY KEY,
  practice_attempt_id uuid NOT NULL REFERENCES public.practice_attempts(id) ON DELETE CASCADE,
  practice_attempt_question_id uuid NOT NULL REFERENCES public.practice_attempt_questions(id) ON DELETE RESTRICT,
  selected_option_code text,
  response_text text,
  response_payload jsonb,
  requires_manual_review boolean NOT NULL DEFAULT false,
  grading_status text,
  auto_score numeric,
  manual_score numeric,
  final_score numeric,
  max_score numeric,
  submitted_at timestamptz,
  graded_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_attempt_question_id)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lesson_book_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL,
  content text,
  pdf_url text
);
CREATE TABLE IF NOT EXISTS public.lesson_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL,
  title text,
  content text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.lesson_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL,
  summary text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.lesson_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL
);
CREATE TABLE IF NOT EXISTS public.lesson_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL,
  resource_type text NOT NULL,
  html_resource_type text,
  title text NOT NULL DEFAULT 'fixture',
  url text NOT NULL DEFAULT 'https://example.test/fixture',
  is_primary boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.subject_textbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid REFERENCES public.subjects(id),
  title text NOT NULL DEFAULT 'fixture'
);
CREATE TABLE IF NOT EXISTS public.exam_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT ((NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid)
$$;

CREATE OR REPLACE FUNCTION public.can_access_lesson(_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.lessons WHERE id = _lesson_id)
$$;

CREATE OR REPLACE FUNCTION public.is_content_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT _user_id IS NOT NULL $$;

CREATE OR REPLACE FUNCTION public.is_full_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT _user_id IS NOT NULL $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT _user_id IS NOT NULL $$;
