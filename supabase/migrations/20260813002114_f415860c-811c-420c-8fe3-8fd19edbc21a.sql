-- QB-01 QUESTION BANK SCHEMA FOUNDATION
-- SOURCE CREATED AND REVIEWED LOCALLY
-- APPLIED IN PHASE QB_FOUNDATION_APPLY_08A (NON-PROD) — PART 1/7
-- DEFAULT RUNTIME MODE REMAINS LEGACY
--
-- HOLD-15 CLOSURE: no client-settable GUC publish bypass; RPC-only PUBLISHED/SUPERSEDED;
-- column privileges deny direct status/pointer updates from client roles.
-- PUBLISH-INVARIANTS-39B: no caller introspection (no CURRENT_USER/owner/OID/name gate).
-- Triggers enforce transition + payload invariants only. Public publish RPC is the
-- sole client entry. APPROVED/PUBLISHED/SUPERSEDED payloads are immutable.
-- POINTER-CHILD-42: service_role has no table-level UPDATE on questions (column allowlist
-- excludes current_published_revision_id); deferred pointer ↔constraint; child parent
-- FKs immutable after INSERT (OLD+NEW freeze checks).
-- CAPABILITY-CORRECTNESS-CI-DELETE-45/45B: no GRANT ALL for service_role on sensitive
-- tables; capability/idempotency append-only; canonical payload_hash verified before
-- APPROVED/PUBLISH; draft delete via RPC + DELETE_DRAFT_QUESTION; capability self-check.
--
-- Package invariants:
--   * CASEFOLD_AR normalization is NOT allowed in QB-01.
--   * Legacy questions.correct_index remains a 0-based cache (see qb_sync_question_legacy).
--   * No question backfill DML; no bucket creation; no DROP/TRUNCATE.
--   * attempt_pin_mode defaults to LEGACY everywhere; runtime config seeded LEGACY only.
--   * Existing start_exam_session / answer_exam_question / submit_exam_session are untouched.

-- ============================================================================
-- 1) Runtime cutover config (singleton)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.question_bank_runtime_config (
  id int PRIMARY KEY CHECK (id = 1),
  attempt_pin_mode text NOT NULL DEFAULT 'LEGACY'
    CHECK (attempt_pin_mode IN ('LEGACY', 'REVISION_PINNED')),
  enabled_at timestamptz,
  enabled_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.question_bank_runtime_config (id, attempt_pin_mode)
VALUES (1, 'LEGACY')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.question_bank_runtime_config IS
  'Singleton runtime cutover config. QB-01 seeds LEGACY only; admin RPC may change for new sessions after audit.';

-- ============================================================================
-- 2) Capability grants
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.question_bank_capability_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability text NOT NULL CHECK (capability IN (
    'EDIT_QUESTION_BANK',
    'REVIEW_QUESTION_CONTENT',
    'PUBLISH_QUESTION_REVISION',
    'GRADE_MANUAL_RESPONSE',
    'READ_HIDDEN_SOLUTIONS',
    'DELETE_DRAFT_QUESTION'
  )),
  scope_type text NOT NULL DEFAULT 'GLOBAL'
    CHECK (scope_type IN ('GLOBAL', 'SUBJECT', 'UNIT', 'LESSON', 'GRADE')),
  scope_id uuid,
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES auth.users(id),
  revoked_at timestamptz,
  reason text NOT NULL,
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at),
  CHECK (
    (scope_type = 'GLOBAL' AND scope_id IS NULL)
    OR (scope_type <> 'GLOBAL' AND scope_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS qb_cap_grants_one_active_uidx
  ON public.question_bank_capability_grants (
    user_id,
    capability,
    scope_type,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE revoked_at IS NULL;

-- ============================================================================
-- 3) Logical hub additives (questions)
-- ============================================================================
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id);

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS current_published_revision_id uuid;

COMMENT ON COLUMN public.questions.correct_index IS
  'Legacy 0-based cache index into questions.options JSON array. Not authoritative for revision-pinned attempts.';

-- ============================================================================
-- 4) question_revisions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.question_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  revision_number int NOT NULL CHECK (revision_number > 0),
  status text NOT NULL CHECK (status IN (
    'DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'REJECTED'
  )),
  interaction_type text NOT NULL,
  grading_mode text CHECK (
    grading_mode IS NULL OR grading_mode IN ('AUTO_SINGLE', 'AUTO_TEXT', 'MANUAL')
  ),
  educational_label text,
  question_text text NOT NULL,
  stimulus_text text,
  max_score numeric NOT NULL DEFAULT 1 CHECK (max_score > 0),
  allow_partial boolean NOT NULL DEFAULT false,
  requires_media boolean NOT NULL DEFAULT false,
  manual_grading_required boolean NOT NULL DEFAULT false,
  payload_hash text,
  payload_hash_version text NOT NULL DEFAULT 'canonical_payload_v1',
  source_payload_hash text,
  backfill_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id),
  superseded_at timestamptz,
  rejected_at timestamptz,
  rejected_by uuid REFERENCES auth.users(id),
  rejection_reason text,
  CHECK (payload_hash IS NULL OR (
    payload_hash_version IS NOT NULL AND payload_hash ~ '^[0-9a-f]{64}$'
  )),
  CHECK (
    status <> 'PUBLISHED'
    OR (published_at IS NOT NULL AND published_by IS NOT NULL AND payload_hash IS NOT NULL)
  ),
  CHECK (
    status <> 'REJECTED'
    OR (rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND rejection_reason IS NOT NULL)
  ),
  UNIQUE (question_id, revision_number),
  UNIQUE (question_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS question_revisions_one_published_uidx
  ON public.question_revisions (question_id)
  WHERE status = 'PUBLISHED';

-- ============================================================================
-- 5) Composite FK: questions → question_revisions (published pointer)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'questions_current_published_revision_fk'
  ) THEN
    ALTER TABLE public.questions
      ADD CONSTRAINT questions_current_published_revision_fk
      FOREIGN KEY (id, current_published_revision_id)
      REFERENCES public.question_revisions (question_id, id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- ============================================================================
-- 6) Lifecycle / pointer / payload invariant triggers (no caller introspection)
-- ============================================================================
DROP TRIGGER IF EXISTS trg_qb_enforce_published_pointer ON public.questions;
DROP TRIGGER IF EXISTS trg_qb_enforce_published_revision_status ON public.question_revisions;
DROP FUNCTION IF EXISTS public.qb_enforce_published_pointer_on_questions();
DROP FUNCTION IF EXISTS public.qb_enforce_published_revision_status();
DROP FUNCTION IF EXISTS public._qb_is_internal_publish_executor();

-- Transition + payload invariants only. Does NOT inspect caller / owner / OID / GUC.
CREATE OR REPLACE FUNCTION public.qb_guard_question_revision_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pointed boolean;
  v_payload_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('PUBLISHED', 'SUPERSEDED', 'APPROVED') THEN
      RAISE EXCEPTION 'cannot insert revision directly as APPROVED, PUBLISHED, or SUPERSEDED';
    END IF;
    IF NEW.status NOT IN ('DRAFT', 'READY_FOR_REVIEW', 'REJECTED') THEN
      RAISE EXCEPTION 'invalid initial revision status';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('APPROVED', 'PUBLISHED', 'SUPERSEDED') THEN
      RAISE EXCEPTION 'cannot delete APPROVED, PUBLISHED, or SUPERSEDED revision';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.current_published_revision_id = OLD.id
    ) INTO v_pointed;
    IF v_pointed THEN
      RAISE EXCEPTION 'cannot delete revision currently pointed by questions.current_published_revision_id';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  v_payload_changed :=
       NEW.interaction_type IS DISTINCT FROM OLD.interaction_type
    OR NEW.grading_mode IS DISTINCT FROM OLD.grading_mode
    OR NEW.educational_label IS DISTINCT FROM OLD.educational_label
    OR NEW.question_text IS DISTINCT FROM OLD.question_text
    OR NEW.stimulus_text IS DISTINCT FROM OLD.stimulus_text
    OR NEW.max_score IS DISTINCT FROM OLD.max_score
    OR NEW.allow_partial IS DISTINCT FROM OLD.allow_partial
    OR NEW.requires_media IS DISTINCT FROM OLD.requires_media
    OR NEW.manual_grading_required IS DISTINCT FROM OLD.manual_grading_required
    OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
    OR NEW.payload_hash_version IS DISTINCT FROM OLD.payload_hash_version
    OR NEW.source_payload_hash IS DISTINCT FROM OLD.source_payload_hash
    OR NEW.backfill_version IS DISTINCT FROM OLD.backfill_version
    OR NEW.question_id IS DISTINCT FROM OLD.question_id
    OR NEW.revision_number IS DISTINCT FROM OLD.revision_number;

  IF OLD.status IN ('APPROVED', 'PUBLISHED', 'SUPERSEDED') AND v_payload_changed THEN
    RAISE EXCEPTION 'payload fields of % revisions are immutable', OLD.status;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'APPROVED' AND NEW.status = 'PUBLISHED' THEN
      IF NEW.published_at IS NULL OR NEW.published_by IS NULL THEN
        RAISE EXCEPTION 'PUBLISHED requires published_at and published_by';
      END IF;
      PERFORM public._qb_assert_revision_payload_hash(
        NEW.id, NEW.payload_hash, NEW.payload_hash_version
      );
    ELSIF OLD.status = 'PUBLISHED' AND NEW.status = 'SUPERSEDED' THEN
      IF NEW.superseded_at IS NULL THEN
        RAISE EXCEPTION 'SUPERSEDED requires superseded_at';
      END IF;
    ELSIF OLD.status IN ('DRAFT', 'READY_FOR_REVIEW', 'REJECTED')
          AND NEW.status IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED') THEN
      IF NEW.status = 'APPROVED' THEN
        PERFORM public._qb_assert_revision_payload_hash(NEW.id, NEW.payload_hash, NEW.payload_hash_version);
      END IF;
    ELSE
      RAISE EXCEPTION 'illegal revision status transition: % → %', OLD.status, NEW.status;
    END IF;
  END IF;

  IF OLD.status IN ('PUBLISHED', 'SUPERSEDED')
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND (
       NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.published_by IS DISTINCT FROM OLD.published_by
       OR NEW.superseded_at IS DISTINCT FROM OLD.superseded_at
     ) THEN
    RAISE EXCEPTION 'publish metadata of % revisions is immutable', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.qb_guard_question_revision_lifecycle() FROM PUBLIC;

-- Pointer integrity only (same-question + PUBLISHED). Client column UPDATE is revoked;
-- this trigger does not authorize callers — it validates row shape.
CREATE OR REPLACE FUNCTION public.qb_guard_current_published_revision_pointer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rev record;
BEGIN
  IF NEW.current_published_revision_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT qr.question_id, qr.status
  INTO v_rev
  FROM public.question_revisions qr
  WHERE qr.id = NEW.current_published_revision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'current_published_revision_id must reference an existing revision';
  END IF;

  IF v_rev.question_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'current_published_revision_id must belong to the same question';
  END IF;

  IF v_rev.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'current_published_revision_id must point to a PUBLISHED revision';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.qb_guard_current_published_revision_pointer() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_qb_guard_question_revision_lifecycle ON public.question_revisions;
CREATE TRIGGER trg_qb_guard_question_revision_lifecycle
  BEFORE INSERT OR UPDATE OR DELETE ON public.question_revisions
  FOR EACH ROW
  EXECUTE FUNCTION public.qb_guard_question_revision_lifecycle();

DROP TRIGGER IF EXISTS trg_qb_guard_current_published_revision_pointer ON public.questions;
CREATE TRIGGER trg_qb_guard_current_published_revision_pointer
  BEFORE INSERT OR UPDATE OF current_published_revision_id ON public.questions
  FOR EACH ROW
  EXECUTE FUNCTION public.qb_guard_current_published_revision_pointer();

-- End-of-transaction consistency: published revision ↔ pointer (no caller introspection).
CREATE OR REPLACE FUNCTION public.qb_assert_published_pointer_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_qid uuid;
  v_ptr uuid;
  v_pub_id uuid;
  v_pub_count int;
BEGIN
  IF TG_TABLE_NAME = 'questions' THEN
    v_qid := COALESCE(NEW.id, OLD.id);
  ELSE
    v_qid := COALESCE(NEW.question_id, OLD.question_id);
  END IF;

  IF v_qid IS NULL THEN
    RETURN NULL;
  END IF;

  -- Question may have been deleted in this transaction.
  SELECT q.current_published_revision_id INTO v_ptr
  FROM public.questions q
  WHERE q.id = v_qid;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*), (array_agg(qr.id ORDER BY qr.id))[1]
  INTO v_pub_count, v_pub_id
  FROM public.question_revisions qr
  WHERE qr.question_id = v_qid
    AND qr.status = 'PUBLISHED';

  IF v_pub_count > 1 THEN
    RAISE EXCEPTION 'question % has % PUBLISHED revisions; at most one is allowed',
      v_qid, v_pub_count;
  END IF;

  IF v_pub_count = 0 THEN
    IF v_ptr IS NOT NULL THEN
      RAISE EXCEPTION
        'questions.current_published_revision_id must be NULL when no PUBLISHED revision exists';
    END IF;
  ELSE
    IF v_ptr IS DISTINCT FROM v_pub_id THEN
      RAISE EXCEPTION
        'questions.current_published_revision_id must equal the PUBLISHED revision (%)',
        v_pub_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.qb_assert_published_pointer_consistency() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_qb_questions_pointer_consistency ON public.questions;
CREATE CONSTRAINT TRIGGER trg_qb_questions_pointer_consistency
  AFTER INSERT OR UPDATE OF current_published_revision_id OR DELETE
  ON public.questions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.qb_assert_published_pointer_consistency();

DROP TRIGGER IF EXISTS trg_qb_revisions_pointer_consistency ON public.question_revisions;
CREATE CONSTRAINT TRIGGER trg_qb_revisions_pointer_consistency
  AFTER INSERT OR UPDATE OF status, question_id OR DELETE
  ON public.question_revisions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.qb_assert_published_pointer_consistency();