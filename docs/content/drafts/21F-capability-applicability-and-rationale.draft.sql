-- TAMKEEN_LESSON_CONTENT_ARCHITECTURE_V3 — 21F / 21E DRAFT MIGRATION
-- STATUS: DRAFT + TEST ONLY. NOT APPLIED TO PRODUCTION.
-- Gate: APPROVED_PRODUCTION_APPLY (explicit user approval required).
--
-- Scope (smallest possible change, additive only, zero data loss):
--   1. per-lesson capability applicability  REQUIRED | OPTIONAL | NA
--   2. per-option teaching rationale        why_correct / why_wrong
--   3. official book question model answers kept OUT of any student-readable
--      view (companion answer layer, service_role + admin only).
--
-- Nothing here drops, renames or deletes an existing column, row or policy.

BEGIN;

/* 1 — applicability ------------------------------------------------ */

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'capability_applicability') THEN
    CREATE TYPE public.capability_applicability AS ENUM ('REQUIRED', 'OPTIONAL', 'NA');
  END IF;
END$$;

ALTER TABLE public.lesson_capability_lifecycle
  ADD COLUMN IF NOT EXISTS applicability public.capability_applicability
  NOT NULL DEFAULT 'REQUIRED';

COMMENT ON COLUMN public.lesson_capability_lifecycle.applicability IS
  '21F — REQUIRED/OPTIONAL/NA. Defaults preserve current behaviour; the lab '
  'experiment capability is seeded as OPTIONAL by the application contract.';

/* 2 — option rationale (21E) --------------------------------------- */

CREATE TABLE IF NOT EXISTS public.question_option_rationales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  option_id text NOT NULL,
  why_correct text,
  why_wrong text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, option_id),
  CHECK (why_correct IS NOT NULL OR why_wrong IS NOT NULL)
);

-- Grants: rationale is an ANSWER-BEARING table. No anon, no authenticated
-- SELECT. It is reachable only through the reveal RPC (security definer) and
-- by admin tooling running as service_role.
REVOKE ALL ON public.question_option_rationales FROM anon, authenticated;
GRANT ALL ON public.question_option_rationales TO service_role;

ALTER TABLE public.question_option_rationales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage option rationales"
  ON public.question_option_rationales
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

/* 3 — official book question model answers -------------------------- */

CREATE TABLE IF NOT EXISTS public.official_question_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL UNIQUE REFERENCES public.questions(id) ON DELETE CASCADE,
  model_answer text,
  explanation text,
  revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.official_question_answers FROM anon, authenticated;
GRANT ALL ON public.official_question_answers TO service_role;

ALTER TABLE public.official_question_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage official answers"
  ON public.official_question_answers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

/* 4 — reveal RPC (fail-closed) -------------------------------------- */
-- Returns the answer layer ONLY for a question the caller already answered in
-- an attempt pinned to the same revision. Mirrors `evaluateReveal()` in
-- src/lib/lessons/official-book-questions.ts.

-- CREATE OR REPLACE FUNCTION public.reveal_question_answer(
--   _question_id uuid, _attempt_id uuid
-- ) RETURNS jsonb
-- LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
-- ...  (implementation drafted alongside the attempts table used by 21E)
-- $$;

COMMIT;

-- ROLLBACK PLAN
--   DROP TABLE public.official_question_answers;
--   DROP TABLE public.question_option_rationales;
--   ALTER TABLE public.lesson_capability_lifecycle DROP COLUMN applicability;
--   DROP TYPE public.capability_applicability;
