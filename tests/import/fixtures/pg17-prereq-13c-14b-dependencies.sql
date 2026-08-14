-- =============================================================================
-- 13C/14B rehearsal dependency stub
-- Creates the tables referenced by SHARED_CURRICULUM_SUBJECT_MAPPING_13C but
-- missing from the pg17-baseline-schema fixture. This is a test-only fixture.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  curriculum_track_id uuid REFERENCES public.curriculum_tracks(id) ON DELETE SET NULL,
  grade_uuid uuid REFERENCES public.grades(id) ON DELETE SET NULL,
  grade_id text,
  governorate_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE public.exam_mode AS ENUM ('training', 'strict', 'ministry');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.exam_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  description text,
  mode public.exam_mode NOT NULL DEFAULT 'training',
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  duration_seconds integer,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- mirrors 20260615005248 (global template code)
ALTER TABLE public.exam_templates ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS exam_templates_code_uniq
  ON public.exam_templates (code) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.exam_template_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.exam_templates(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  points numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_template_questions_unique UNIQUE (template_id, question_id),
  CONSTRAINT exam_template_questions_points_pos CHECK (points > 0),
  CONSTRAINT exam_template_questions_sort_nonneg CHECK (sort_order >= 0)
);

CREATE TABLE IF NOT EXISTS public.governorates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  default_curriculum_track_id uuid REFERENCES public.curriculum_tracks(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.governorate_curriculum_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  governorate_id uuid NOT NULL REFERENCES public.governorates(id) ON DELETE CASCADE,
  curriculum_track_id uuid NOT NULL REFERENCES public.curriculum_tracks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (governorate_id, curriculum_track_id)
);

CREATE TABLE IF NOT EXISTS public.content_review_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  review_status text NOT NULL DEFAULT 'pending',
  publication_status text NOT NULL DEFAULT 'draft',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  actor_id uuid,
  entity_type text,
  entity_id uuid,
  target_type text,
  target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);

