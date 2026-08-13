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
CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'in_progress',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS exam_sessions_id_uidx ON public.exam_sessions (id);

CREATE TABLE IF NOT EXISTS public.exam_session_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_index integer,
  is_correct boolean,
  created_at timestamptz NOT NULL DEFAULT now()
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
