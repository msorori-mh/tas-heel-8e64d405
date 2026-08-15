-- =============================================================================
-- Rehearsal shim for 15C.
-- The local baseline fixture models user_progress in a reduced form; these
-- columns exist on the shared datastore. Column definitions mirror it exactly.
-- Test fixture only. Never applied to any real environment.
-- =============================================================================
\set ON_ERROR_STOP on

ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS quiz_score numeric;
