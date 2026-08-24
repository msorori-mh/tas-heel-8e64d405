DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE public.curriculum_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_name text NOT NULL,
  track_code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id uuid NOT NULL REFERENCES public.grades(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  icon text DEFAULT 'BookOpen',
  color text DEFAULT '#3b82f6',
  sort_order integer NOT NULL DEFAULT 0,
  semester integer,
  curriculum_track_id uuid REFERENCES public.curriculum_tracks(id) ON DELETE SET NULL,
  code text,
  group_code text,
  group_name text,
  UNIQUE (grade_id, slug),
  CHECK ((group_code IS NULL) = (group_name IS NULL))
);
CREATE UNIQUE INDEX subjects_code_uniq ON public.subjects(code) WHERE code IS NOT NULL;

CREATE TABLE public.subject_curriculum_tracks (
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  curriculum_track_id uuid NOT NULL REFERENCES public.curriculum_tracks(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (subject_id, curriculum_track_id)
);

CREATE OR REPLACE FUNCTION public.is_full_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$ SELECT _user_id = '11111111-1111-4111-8111-111111111111'::uuid $$;

INSERT INTO auth.users(id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

INSERT INTO public.grades(id, slug, name, sort_order) VALUES
  ('55555555-5555-4555-8555-555555555555', 'grade-12', 'الصف الثالث الثانوي', 3);

INSERT INTO public.curriculum_tracks(id, track_code, track_name, is_active) VALUES
  ('66666666-6666-4666-8666-666666666661', 'sanaa', 'منهج صنعاء', true),
  ('66666666-6666-4666-8666-666666666662', 'aden', 'منهج عدن', true),
  ('66666666-6666-4666-8666-666666666663', 'other', 'آخر', true);

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
