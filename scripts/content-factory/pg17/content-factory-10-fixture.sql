-- CF10 PG17 fixture: minimal domain surface matching production natural keys.
ALTER TABLE public.lessons ADD COLUMN title text NOT NULL DEFAULT 'درس';
ALTER TABLE public.lessons ADD COLUMN is_free boolean DEFAULT false;
ALTER TABLE public.lessons ADD COLUMN semester integer;
ALTER TABLE public.lessons ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.lessons ADD CONSTRAINT lessons_subject_id_slug_key UNIQUE (subject_id, slug);

CREATE TABLE public.lesson_book_contents(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL UNIQUE REFERENCES public.lessons(id),
  content text, pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.lesson_explanations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id),
  title text, content text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
  explanation_code text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX lesson_explanations_code_lesson_uniq
  ON public.lesson_explanations(lesson_id, explanation_code) WHERE explanation_code IS NOT NULL;

CREATE TABLE public.lesson_summaries(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL UNIQUE REFERENCES public.lessons(id),
  summary text NOT NULL, key_points jsonb NOT NULL DEFAULT '[]'::jsonb, study_tip text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TYPE public.lesson_resource_type AS ENUM ('video','mindmap','experiment','pdf','link');
CREATE TABLE public.lesson_resources(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id),
  resource_type public.lesson_resource_type NOT NULL, title text NOT NULL, url text NOT NULL,
  description text, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  resource_code text, html_resource_type text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_primary boolean NOT NULL DEFAULT false);
CREATE UNIQUE INDEX idx_lesson_resources_code_per_lesson
  ON public.lesson_resources(lesson_id, resource_code) WHERE resource_code IS NOT NULL;

CREATE TABLE public.questions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid REFERENCES public.lessons(id), subject_id uuid REFERENCES public.subjects(id),
  question_text text NOT NULL, options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_index integer NOT NULL, explanation text, question_type text, year integer,
  sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  unit text, semester integer, code text, created_by uuid,
  archived_at timestamptz, archived_by uuid, current_published_revision_id uuid);
CREATE UNIQUE INDEX questions_code_uniq ON public.questions(code) WHERE code IS NOT NULL;

CREATE TABLE public.question_revisions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id),
  revision_number integer NOT NULL, status text NOT NULL, interaction_type text NOT NULL,
  question_text text NOT NULL, max_score numeric NOT NULL DEFAULT 1,
  allow_partial boolean NOT NULL DEFAULT false, requires_media boolean NOT NULL DEFAULT false,
  manual_grading_required boolean NOT NULL DEFAULT false, payload_hash text,
  payload_hash_version text NOT NULL DEFAULT 'v1', created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, published_at timestamptz, published_by uuid,
  UNIQUE (question_id, revision_number));

CREATE TABLE public.question_options(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id),
  option_code text NOT NULL, body text NOT NULL, sort_order integer NOT NULL,
  is_correct boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_revision_id, option_code), UNIQUE (question_revision_id, sort_order));

CREATE TABLE public.official_question_answers(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id),
  revision_id uuid NOT NULL REFERENCES public.question_revisions(id),
  model_answer text, explanation text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, revision_id));

CREATE TABLE public.question_option_rationales(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id),
  option_id text NOT NULL, why_correct text, why_wrong text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_revision_id, option_id));

CREATE TABLE public.lesson_assessments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id), title text NOT NULL,
  instructions text, sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), assessment_code text);
CREATE UNIQUE INDEX lesson_assessments_code_uniq
  ON public.lesson_assessments(assessment_code) WHERE assessment_code IS NOT NULL;

CREATE TABLE public.assessment_questions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.lesson_assessments(id),
  question_id uuid NOT NULL REFERENCES public.questions(id),
  sort_order integer NOT NULL DEFAULT 0, points numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (assessment_id, question_id));

CREATE TYPE public.capability_applicability AS ENUM ('REQUIRED','OPTIONAL','NA');
CREATE TABLE public.lesson_capability_lifecycle(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id), capability text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT', ready_snapshot jsonb, ready_hash text,
  draft_hash text, draft_updated_at timestamptz, reviewed_by uuid, reviewed_at timestamptz,
  ready_by uuid, ready_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), evidence_origin text, retirement_origin text,
  applicability public.capability_applicability NOT NULL DEFAULT 'REQUIRED',
  UNIQUE (lesson_id, capability));
