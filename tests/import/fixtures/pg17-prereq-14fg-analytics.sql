-- =============================================================================
-- Rehearsal shim for 14F/14G.
-- The local qb-runtime fixture models exam_session_* tables in a reduced form.
-- These columns exist on the real datastore (added incrementally by the 14B/14C/
-- 14D/14E chain, part of which is not replayable on a bare cluster), so we add
-- the missing ones here. Column definitions mirror the shared schema exactly.
-- Analytics code is read-only; nothing here changes production behaviour.
-- =============================================================================
\set ON_ERROR_STOP on

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS points_awarded numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS answered_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS grading_status text,
  ADD COLUMN IF NOT EXISTS auto_score numeric,
  ADD COLUMN IF NOT EXISTS manual_score numeric,
  ADD COLUMN IF NOT EXISTS final_score numeric,
  ADD COLUMN IF NOT EXISTS max_score numeric,
  ADD COLUMN IF NOT EXISTS assigned_grader_id uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS graded_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS pin_mode text,
  ADD COLUMN IF NOT EXISTS revealed_at timestamptz;

ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS ministerial_attempt_mode text,
  ADD COLUMN IF NOT EXISTS is_final boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS elapsed_seconds integer;

ALTER TABLE public.exam_session_questions
  ADD COLUMN IF NOT EXISTS logical_question_id uuid,
  ADD COLUMN IF NOT EXISTS max_score numeric;
