-- SECONDARY-EXAM-ANSWERS-POSTGREST-LEAK-HARDENING-01
-- Idempotent end-state re-assertion of answer-key protection on public.questions.
--
-- Context: RLS policies on public.questions ("Questions viewable per access")
-- decide WHICH ROWS a student can read, but row-level security cannot hide
-- individual COLUMNS. The answer key (correct_index, explanation) is therefore
-- protected by column-level privileges, first applied in
-- 20260622140000_questions_answer_column_grants.sql and re-applied in
-- 20260623030305. This migration re-asserts that end state so the protection
-- does not depend on the ordering of older migrations, and documents the
-- invariant for future changes:
--
--   * Students (role: authenticated) read the public question payload only:
--     id, lesson_id, subject_id, question_text, options, question_type,
--     year, sort_order, created_at, unit, semester, code.
--   * correct_index / explanation are reachable ONLY through:
--       - SECURITY DEFINER RPCs that run as the owner (postgres):
--         get_exam_session_state (reveals only after submission),
--         check_lesson_question / grade_lesson_quiz (post-answer lesson-quiz
--         feedback — the intended formative UX),
--       - the service_role (server-side admin import and management paths).
--   * anon reads nothing (RLS already denies every row; privileges too).
--
-- IMPORTANT Postgres semantics: a table-level SELECT GRANT would silently
-- re-open ALL columns, including the answer key, regardless of column-level
-- REVOKEs. That is why step 1 (revoking the table-level grant) is the
-- critical line and must never be reverted by later migrations.

-- 1) Remove table-level SELECT for client roles (critical).
REVOKE SELECT ON public.questions FROM anon;
REVOKE SELECT ON public.questions FROM authenticated;

-- 2) Column allowlist for the student question payload.
GRANT SELECT (
  id,
  lesson_id,
  subject_id,
  question_text,
  options,
  question_type,
  year,
  sort_order,
  created_at,
  unit,
  semester,
  code
) ON public.questions TO authenticated;

-- 3) Belt-and-braces: explicitly deny the answer columns to client roles.
REVOKE SELECT (correct_index, explanation) ON public.questions FROM anon, authenticated;

-- 4) Server-side paths keep full access (service role bypasses RLS and is
--    used only by trusted server functions, e.g. content import).
GRANT ALL ON public.questions TO service_role;

-- No changes to: RLS policies, RPC bodies, financial/wallet tables, storage,
-- auth, or any table data. Write paths (INSERT/UPDATE/DELETE) are untouched;
-- they remain governed by the existing "Content staff manage questions"
-- policy and the service_role server paths.
