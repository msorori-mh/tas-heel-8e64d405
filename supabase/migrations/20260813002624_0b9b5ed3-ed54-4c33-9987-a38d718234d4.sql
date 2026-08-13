-- QB-01 PART 5/7
-- ============================================================================
-- 14) Exam session extensions (Model A foundation)
-- ============================================================================
ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS attempt_pin_mode text NOT NULL DEFAULT 'LEGACY'
    CHECK (attempt_pin_mode IN ('LEGACY', 'REVISION_PINNED'));

ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS grading_status text NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (grading_status IN (
      'IN_PROGRESS', 'SUBMITTED_PENDING_GRADING', 'PARTIALLY_GRADED', 'COMPLETED'
    ));

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

COMMENT ON COLUMN public.exam_session_questions.rendered_options IS
  'Student-readable snapshot JSON. MUST NOT contain is_correct.';

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS exam_session_question_id uuid
    REFERENCES public.exam_session_questions(id) ON DELETE RESTRICT;

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS question_revision_id uuid
    REFERENCES public.question_revisions(id) ON DELETE RESTRICT;

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS selected_option_code text;

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS response_text text;

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS response_payload jsonb;

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS requires_manual_review boolean NOT NULL DEFAULT false;

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS grading_status text
    CHECK (grading_status IS NULL OR grading_status IN (
      'NOT_REQUIRED', 'PENDING_MANUAL_REVIEW', 'IN_REVIEW', 'GRADED',
      'RETURNED_FOR_SECOND_REVIEW', 'FINALIZED'
    ));

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS auto_score numeric
    CHECK (auto_score IS NULL OR auto_score >= 0);

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS manual_score numeric
    CHECK (manual_score IS NULL OR manual_score >= 0);

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS final_score numeric
    CHECK (final_score IS NULL OR final_score >= 0);

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS max_score numeric
    CHECK (max_score IS NULL OR max_score > 0);

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS assigned_grader_id uuid REFERENCES auth.users(id);

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS graded_at timestamptz;

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS pin_mode text
    CHECK (pin_mode IS NULL OR pin_mode IN ('LEGACY', 'REVISION_PINNED'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exam_session_answers_final_score_le_max'
  ) THEN
    ALTER TABLE public.exam_session_answers
      ADD CONSTRAINT exam_session_answers_final_score_le_max
      CHECK (final_score IS NULL OR max_score IS NULL OR final_score <= max_score);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exam_session_answers_revision_pin_shape'
  ) THEN
    ALTER TABLE public.exam_session_answers
      ADD CONSTRAINT exam_session_answers_revision_pin_shape
      CHECK (
        pin_mode IS DISTINCT FROM 'REVISION_PINNED'
        OR (exam_session_question_id IS NOT NULL AND selected_index IS NULL)
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS exam_session_questions_id_session_uidx
  ON public.exam_session_questions (exam_session_id, id);

DO $$ BEGIN
  ALTER TABLE public.exam_session_answers
    DROP CONSTRAINT IF EXISTS exam_session_answers_exam_session_question_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_session_answers_session_question_fk') THEN
    ALTER TABLE public.exam_session_answers
      ADD CONSTRAINT exam_session_answers_session_question_fk
      FOREIGN KEY (session_id, exam_session_question_id)
      REFERENCES public.exam_session_questions (exam_session_id, id);
  END IF;
END $$;

-- ============================================================================
-- 15) Practice attempt surfaces
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.practice_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt_type text NOT NULL CHECK (attempt_type IN ('LESSON', 'UNIT')),
  lesson_assessment_id uuid REFERENCES public.lesson_assessments(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES public.units(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  grading_status text NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (grading_status IN (
      'IN_PROGRESS', 'SUBMITTED_PENDING_GRADING', 'PARTIALLY_GRADED', 'COMPLETED'
    )),
  total_score numeric CHECK (total_score IS NULL OR total_score >= 0),
  max_score numeric CHECK (max_score IS NULL OR max_score > 0),
  attempt_pin_mode text NOT NULL DEFAULT 'LEGACY'
    CHECK (attempt_pin_mode IN ('LEGACY', 'REVISION_PINNED')),
  CONSTRAINT practice_attempts_type_shape CHECK (
    (attempt_type = 'LESSON' AND lesson_assessment_id IS NOT NULL AND unit_id IS NULL)
    OR (attempt_type = 'UNIT' AND unit_id IS NOT NULL AND lesson_assessment_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.practice_attempt_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_attempt_id uuid NOT NULL REFERENCES public.practice_attempts(id) ON DELETE CASCADE,
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
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_attempt_id, question_order),
  UNIQUE (practice_attempt_id, question_revision_id)
);

COMMENT ON COLUMN public.practice_attempt_questions.rendered_options IS
  'Student-readable snapshot JSON. MUST NOT contain is_correct.';

-- Snapshot freeze point: after successful INSERT. UPDATE of payload fields rejected.
-- DELETE remains allowed so parent CASCADE / authorized cleanup still works.
CREATE OR REPLACE FUNCTION public.qb_guard_attempt_snapshot_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_changed boolean := false;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  v_changed :=
       NEW.question_revision_id IS DISTINCT FROM OLD.question_revision_id
    OR NEW.logical_question_id IS DISTINCT FROM OLD.logical_question_id
    OR NEW.question_order IS DISTINCT FROM OLD.question_order
    OR NEW.rendered_question_text IS DISTINCT FROM OLD.rendered_question_text
    OR NEW.rendered_stimulus_text IS DISTINCT FROM OLD.rendered_stimulus_text
    OR NEW.rendered_options IS DISTINCT FROM OLD.rendered_options
    OR NEW.option_order_mapping IS DISTINCT FROM OLD.option_order_mapping
    OR NEW.max_score IS DISTINCT FROM OLD.max_score
    OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
    OR NEW.payload_hash_version IS DISTINCT FROM OLD.payload_hash_version;

  IF TG_TABLE_NAME = 'exam_session_questions' THEN
    v_changed := v_changed
      OR NEW.pin_mode IS DISTINCT FROM OLD.pin_mode
      OR NEW.exam_session_id IS DISTINCT FROM OLD.exam_session_id;
  ELSIF TG_TABLE_NAME = 'practice_attempt_questions' THEN
    v_changed := v_changed
      OR NEW.practice_attempt_id IS DISTINCT FROM OLD.practice_attempt_id;
  END IF;

  IF v_changed THEN
    RAISE EXCEPTION 'attempt snapshot payload is immutable after creation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.qb_guard_attempt_snapshot_immutable() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_qb_esq_snapshot_immutable ON public.exam_session_questions;
CREATE TRIGGER trg_qb_esq_snapshot_immutable
  BEFORE UPDATE ON public.exam_session_questions
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_attempt_snapshot_immutable();

DROP TRIGGER IF EXISTS trg_qb_paq_snapshot_immutable ON public.practice_attempt_questions;
CREATE TRIGGER trg_qb_paq_snapshot_immutable
  BEFORE UPDATE ON public.practice_attempt_questions
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_attempt_snapshot_immutable();

CREATE TABLE IF NOT EXISTS public.practice_attempt_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_attempt_id uuid NOT NULL REFERENCES public.practice_attempts(id) ON DELETE CASCADE,
  practice_attempt_question_id uuid NOT NULL REFERENCES public.practice_attempt_questions(id) ON DELETE RESTRICT,
  selected_option_code text,
  response_text text,
  response_payload jsonb,
  requires_manual_review boolean NOT NULL DEFAULT false,
  grading_status text
    CHECK (grading_status IS NULL OR grading_status IN (
      'NOT_REQUIRED', 'PENDING_MANUAL_REVIEW', 'IN_REVIEW', 'GRADED',
      'RETURNED_FOR_SECOND_REVIEW', 'FINALIZED'
    )),
  auto_score numeric CHECK (auto_score IS NULL OR auto_score >= 0),
  manual_score numeric CHECK (manual_score IS NULL OR manual_score >= 0),
  final_score numeric CHECK (final_score IS NULL OR final_score >= 0),
  max_score numeric CHECK (max_score IS NULL OR max_score > 0),
  submitted_at timestamptz,
  graded_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_attempt_question_id),
  CHECK (final_score IS NULL OR max_score IS NULL OR final_score <= max_score)
);

CREATE UNIQUE INDEX IF NOT EXISTS practice_attempt_questions_id_attempt_uidx
  ON public.practice_attempt_questions (practice_attempt_id, id);

DO $$ BEGIN
  ALTER TABLE public.practice_attempt_responses
    DROP CONSTRAINT IF EXISTS practice_attempt_responses_practice_attempt_question_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'practice_attempt_responses_attempt_question_fk') THEN
    ALTER TABLE public.practice_attempt_responses
      ADD CONSTRAINT practice_attempt_responses_attempt_question_fk
      FOREIGN KEY (practice_attempt_id, practice_attempt_question_id)
      REFERENCES public.practice_attempt_questions (practice_attempt_id, id);
  END IF;
END $$;