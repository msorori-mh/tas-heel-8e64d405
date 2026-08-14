-- =============================================================================
-- G1_PUBLISHED_REVISION_TARGET_BINDING_11 — rehearsal prerequisite fixture
--
-- Adds the objects the QB-01 foundation migration expects to already exist in
-- the managed database but that the import baseline fixture does not carry:
-- exam/practice attempt roots, the audit sink, and the LEGACY assessment link
-- trigger (so the rehearsal proves stage 11 replaces it, not just adds to it).
--
-- Test fixture only. Never applied to any real environment.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.write_audit_log(
  _action text,
  _entity_type text,
  _entity_id uuid,
  _details jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), _action, _entity_type, _entity_id, _details);
$$;

CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.can_access_lesson(_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _lesson_id IS NOT NULL AND auth.uid() IS NOT NULL;
$$;

-- ---------------------------------------------------------------------------
-- exam / practice roots (pre-QB-01 shape)
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- exam / practice roots (pre-QB-01 shape, expanded to match production columns)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.exam_templates(id) ON DELETE SET NULL,
  mode text NOT NULL DEFAULT 'training',
  status text NOT NULL DEFAULT 'in_progress',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  submitted_at timestamptz,
  total_questions integer NOT NULL DEFAULT 0,
  answered_questions integer NOT NULL DEFAULT 0,
  correct_answers integer NOT NULL DEFAULT 0,
  score numeric NOT NULL DEFAULT 0,
  total_points numeric NOT NULL DEFAULT 0,
  result_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  attempt_pin_mode text,
  grading_status text,
  ministerial_model_id uuid REFERENCES public.ministerial_exam_models(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS exam_sessions_id_uidx ON public.exam_sessions (id);

CREATE TABLE IF NOT EXISTS public.exam_session_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_session_id uuid NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE RESTRICT,
  logical_question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  question_order int NOT NULL,
  rendered_question_text text NOT NULL,
  rendered_stimulus_text text,
  rendered_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  option_order_mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_score numeric NOT NULL DEFAULT 1 CHECK (max_score > 0),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  payload_hash_version text NOT NULL DEFAULT 'canonical_payload_v1',
  pin_mode text NOT NULL CHECK (pin_mode IN ('LEGACY', 'REVISION_PINNED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_session_id, question_order),
  UNIQUE (exam_session_id, question_revision_id)
);

CREATE TABLE IF NOT EXISTS public.exam_session_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_index integer,
  is_correct boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  exam_session_question_id uuid REFERENCES public.exam_session_questions(id) ON DELETE RESTRICT,
  question_revision_id uuid REFERENCES public.question_revisions(id) ON DELETE RESTRICT,
  selected_option_code text,
  response_text text,
  response_payload jsonb,
  requires_manual_review boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- LEGACY assessment link validation (the exact behaviour stage 11 replaces).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_assessment_question_link()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_assessment_lesson_id uuid; v_lesson_subject_id uuid; v_q_lesson_id uuid; v_q_subject_id uuid;
BEGIN
  SELECT la.lesson_id, l.subject_id INTO v_assessment_lesson_id, v_lesson_subject_id
  FROM public.lesson_assessments la JOIN public.lessons l ON l.id = la.lesson_id WHERE la.id = NEW.assessment_id;
  IF v_assessment_lesson_id IS NULL THEN RAISE EXCEPTION 'Assessment not found' USING ERRCODE = '23514'; END IF;
  SELECT lesson_id, subject_id INTO v_q_lesson_id, v_q_subject_id FROM public.questions WHERE id = NEW.question_id;
  IF v_q_lesson_id IS NOT NULL THEN
    IF v_q_lesson_id <> v_assessment_lesson_id THEN RAISE EXCEPTION 'Question belongs to a different lesson' USING ERRCODE = '23514'; END IF;
  ELSE
    IF v_q_subject_id IS NULL OR v_q_subject_id <> v_lesson_subject_id THEN RAISE EXCEPTION 'Question must belong to the same subject as the assessment lesson' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_assessment_question_link ON public.assessment_questions;
CREATE TRIGGER trg_validate_assessment_question_link
  BEFORE INSERT OR UPDATE OF assessment_id, question_id ON public.assessment_questions
  FOR EACH ROW EXECUTE FUNCTION public.validate_assessment_question_link();

-- ---------------------------------------------------------------------------
-- Legacy questions columns present in the managed DB but not in the import
-- baseline fixture (QB-01 grants reference them by name).
-- ---------------------------------------------------------------------------
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'lesson';
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS year integer;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS semester integer;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id);
