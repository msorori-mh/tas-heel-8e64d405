-- =============================================================================
-- MINISTERIAL_EXAMS_END_TO_END_CLOSURE_14H — DEFECT-14H-01 (minimal scope)
--
-- 14E deliberately keeps ministerial sessions free of any aggregate answer-key
-- signal: create_ministerial_exam_session() inserts correct_answers = NULL and
-- submit_ministerial_exam_session() writes correct_answers = NULL, plus
-- score = NULL while a mixed session is still MANUAL_REVIEW_PENDING.
--
-- public.exam_sessions.correct_answers and .score are still NOT NULL DEFAULT 0
-- from the original 20260607234143 exam engine, so both RPCs abort with
-- 23502 (not-null violation). Every ministerial attempt path is blocked.
--
-- Fix: drop NOT NULL on those two columns only. No column is added, dropped or
-- retyped, defaults and the >= 0 CHECK constraints stay in place (NULL passes a
-- CHECK), and ordinary exam grading keeps writing concrete values.
-- =============================================================================

ALTER TABLE public.exam_sessions ALTER COLUMN correct_answers DROP NOT NULL;
ALTER TABLE public.exam_sessions ALTER COLUMN score DROP NOT NULL;

COMMENT ON COLUMN public.exam_sessions.correct_answers IS
  'Ordinary exams store the correct count. Ministerial sessions keep it NULL: the correct/wrong breakdown is served per attempt through get_ministerial_session_result() only.';
COMMENT ON COLUMN public.exam_sessions.score IS
  'NULL while a session is MANUAL_REVIEW_PENDING / PARTIALLY_GRADED, so no provisional score can be mistaken for a final one.';
