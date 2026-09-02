-- OFFLINE-05 — disposable PostgreSQL 17 production-shape fixture.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.lessons (
  id uuid PRIMARY KEY,
  title text NOT NULL
);

CREATE TABLE public.lesson_access (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE OR REPLACE FUNCTION public.can_access_lesson(_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lesson_access a
    WHERE a.user_id = auth.uid()
      AND a.lesson_id = _lesson_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_lesson(uuid) TO authenticated, service_role;

CREATE TABLE public.questions (
  id uuid PRIMARY KEY,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  current_published_revision_id uuid
);

CREATE TABLE public.question_revisions (
  id uuid PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  status text NOT NULL,
  educational_label text,
  question_text text NOT NULL
);

ALTER TABLE public.questions
  ADD CONSTRAINT questions_current_published_revision_id_fkey
  FOREIGN KEY (current_published_revision_id)
  REFERENCES public.question_revisions(id)
  ON DELETE SET NULL;

CREATE TABLE public.question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE CASCADE,
  option_code text NOT NULL,
  body text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_correct boolean NOT NULL DEFAULT false,
  UNIQUE (question_revision_id, option_code)
);

CREATE TABLE public.official_question_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE CASCADE,
  model_answer text,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, revision_id)
);

CREATE TABLE public.question_option_rationales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE CASCADE,
  option_id text NOT NULL,
  why_correct text,
  why_wrong text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_revision_id, option_id)
);

CREATE TABLE public.lesson_question_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answer_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_question_notes_unique UNIQUE (student_id, question_id)
);

CREATE TABLE public.user_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  completed boolean DEFAULT false,
  quiz_score integer,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);

GRANT SELECT ON public.lessons, public.questions, public.question_revisions TO authenticated;
