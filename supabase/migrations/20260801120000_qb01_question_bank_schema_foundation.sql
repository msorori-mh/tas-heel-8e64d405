-- QB-01 QUESTION BANK SCHEMA FOUNDATION
-- SOURCE CREATED AND REVIEWED LOCALLY
-- NOT APPLIED TO ANY DATABASE BY THIS PACKAGE
-- DEFAULT RUNTIME MODE REMAINS LEGACY
--
-- HOLD-15 CLOSURE: no client-settable GUC publish bypass; RPC-only PUBLISHED/SUPERSEDED;
-- column privileges deny direct status/pointer updates from client roles.
-- PUBLISH-INVARIANTS-39B: no caller introspection (no CURRENT_USER/owner/OID/name gate).
-- Triggers enforce transition + payload invariants only. Public publish RPC is the
-- sole client entry. APPROVED/PUBLISHED/SUPERSEDED payloads are immutable.
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
    'READ_HIDDEN_SOLUTIONS'
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
    IF NEW.status IN ('PUBLISHED', 'SUPERSEDED') THEN
      RAISE EXCEPTION 'cannot insert revision directly as PUBLISHED or SUPERSEDED';
    END IF;
    IF NEW.status NOT IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED') THEN
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
      IF NEW.payload_hash IS NULL OR NEW.payload_hash_version IS NULL
         OR NEW.payload_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'PUBLISHED requires valid payload_hash and payload_hash_version';
      END IF;
    ELSIF OLD.status = 'PUBLISHED' AND NEW.status = 'SUPERSEDED' THEN
      IF NEW.superseded_at IS NULL THEN
        RAISE EXCEPTION 'SUPERSEDED requires superseded_at';
      END IF;
    ELSIF OLD.status IN ('DRAFT', 'READY_FOR_REVIEW', 'REJECTED')
          AND NEW.status IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED') THEN
      NULL; -- editorial / review transitions (not publish)
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

-- ============================================================================
-- 7) RPC idempotency store (request-bound fingerprint)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.question_bank_rpc_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rpc_name text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rpc_name, actor_id, idempotency_key)
);

-- ============================================================================
-- 8) Revision-scoped children
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE CASCADE,
  option_code text NOT NULL CHECK (char_length(option_code) > 0),
  body text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_revision_id, option_code),
  UNIQUE (question_revision_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.question_accepted_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE CASCADE,
  answer_text text NOT NULL,
  normalized_answer text NOT NULL,
  normalization_policy text NOT NULL DEFAULT 'TRIM_COLLAPSE'
    CHECK (normalization_policy IN ('EXACT', 'TRIM', 'TRIM_COLLAPSE')),
  is_primary boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_revision_id, sort_order, normalized_answer, normalization_policy)
);

COMMENT ON TABLE public.question_accepted_answers IS
  'Accepted-answer normalization policies: EXACT, TRIM, TRIM_COLLAPSE only. CASEFOLD_AR is not allowed in QB-01.';

CREATE TABLE IF NOT EXISTS public.question_solutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE CASCADE,
  solution_code text NOT NULL,
  solution_type text NOT NULL DEFAULT 'MODEL',
  sort_order int NOT NULL DEFAULT 0,
  model_answer text,
  explanation text,
  hint text,
  common_mistakes text,
  simplified_rubric text,
  reveal_policy text NOT NULL DEFAULT 'AFTER_SUBMIT',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_revision_id, solution_code)
);

CREATE TABLE IF NOT EXISTS public.question_solution_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id uuid NOT NULL REFERENCES public.question_solutions(id) ON DELETE CASCADE,
  sort_order int NOT NULL,
  step_code text NOT NULL,
  body text NOT NULL,
  UNIQUE (solution_id, sort_order),
  UNIQUE (solution_id, step_code)
);

CREATE TABLE IF NOT EXISTS public.question_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE CASCADE,
  media_code text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint,
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  alt_text_ar text NOT NULL,
  caption text,
  sort_order int NOT NULL DEFAULT 0,
  requires_media boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_revision_id, media_code),
  UNIQUE (question_revision_id, sort_order, media_code)
);

COMMENT ON TABLE public.question_media IS
  'Revision-scoped media metadata. Storage bucket question-media is NOT created in QB-01.';

-- ============================================================================
-- 8b) Child payload immutability for APPROVED / PUBLISHED / SUPERSEDED parents
-- ============================================================================
CREATE OR REPLACE FUNCTION public.qb_guard_revision_children_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rid uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_rid := OLD.question_revision_id;
  ELSE
    v_rid := NEW.question_revision_id;
  END IF;

  SELECT status INTO v_status
  FROM public.question_revisions
  WHERE id = v_rid;

  IF v_status IN ('APPROVED', 'PUBLISHED', 'SUPERSEDED') THEN
    RAISE EXCEPTION
      'cannot % child rows of % revision (payload frozen)',
      TG_OP, v_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.qb_guard_revision_children_immutable() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_qb_options_immutable ON public.question_options;
CREATE TRIGGER trg_qb_options_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.question_options
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_revision_children_immutable();

DROP TRIGGER IF EXISTS trg_qb_accepted_immutable ON public.question_accepted_answers;
CREATE TRIGGER trg_qb_accepted_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.question_accepted_answers
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_revision_children_immutable();

DROP TRIGGER IF EXISTS trg_qb_solutions_immutable ON public.question_solutions;
CREATE TRIGGER trg_qb_solutions_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.question_solutions
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_revision_children_immutable();

CREATE OR REPLACE FUNCTION public.qb_guard_solution_steps_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sid uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_sid := OLD.solution_id;
  ELSE
    v_sid := NEW.solution_id;
  END IF;

  SELECT qr.status INTO v_status
  FROM public.question_solutions qs
  JOIN public.question_revisions qr ON qr.id = qs.question_revision_id
  WHERE qs.id = v_sid;

  IF v_status IN ('APPROVED', 'PUBLISHED', 'SUPERSEDED') THEN
    RAISE EXCEPTION
      'cannot % solution steps of % revision (payload frozen)',
      TG_OP, v_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.qb_guard_solution_steps_immutable() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_qb_solution_steps_immutable ON public.question_solution_steps;
CREATE TRIGGER trg_qb_solution_steps_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.question_solution_steps
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_solution_steps_immutable();

DROP TRIGGER IF EXISTS trg_qb_media_immutable ON public.question_media;
CREATE TRIGGER trg_qb_media_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.question_media
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_revision_children_immutable();

-- ============================================================================
-- 9) Logical targets
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.question_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('SUBJECT', 'UNIT', 'LESSON')),
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (target_type = 'SUBJECT' AND subject_id IS NOT NULL AND unit_id IS NULL AND lesson_id IS NULL)
    OR (target_type = 'UNIT' AND subject_id IS NOT NULL AND unit_id IS NOT NULL AND lesson_id IS NULL)
    OR (target_type = 'LESSON' AND subject_id IS NOT NULL AND unit_id IS NOT NULL AND lesson_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS question_targets_dedupe_uidx
  ON public.question_targets (
    question_id,
    target_type,
    COALESCE(lesson_id, unit_id, subject_id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS question_targets_one_primary_uidx
  ON public.question_targets (question_id)
  WHERE is_primary;

-- ============================================================================
-- 10) Capability helpers (SECURITY DEFINER, fail closed)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.qb_has_capability(
  p_user_id uuid,
  p_capability text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_full_admin(p_user_id) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.question_bank_capability_grants g
    WHERE g.user_id = p_user_id
      AND g.capability = p_capability
      AND g.revoked_at IS NULL
      AND g.scope_type = 'GLOBAL'
      AND g.scope_id IS NULL
  );
END;
$$;

COMMENT ON FUNCTION public.qb_has_capability(uuid, text) IS
  'P0: only active GLOBAL grants (scope_id IS NULL) are effective. Non-GLOBAL scopes are reserved for future use.';

CREATE OR REPLACE FUNCTION public.can_edit_question_bank(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.qb_has_capability(p_user_id, 'EDIT_QUESTION_BANK');
$$;

CREATE OR REPLACE FUNCTION public.can_review_question_content(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.qb_has_capability(p_user_id, 'REVIEW_QUESTION_CONTENT');
$$;

CREATE OR REPLACE FUNCTION public.can_publish_question_revision(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.qb_has_capability(p_user_id, 'PUBLISH_QUESTION_REVISION');
$$;

CREATE OR REPLACE FUNCTION public.can_grade_manual_response(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.qb_has_capability(p_user_id, 'GRADE_MANUAL_RESPONSE');
$$;

CREATE OR REPLACE FUNCTION public.can_read_hidden_solutions(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.qb_has_capability(p_user_id, 'READ_HIDDEN_SOLUTIONS');
$$;

REVOKE ALL ON FUNCTION public.qb_has_capability(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_question_bank(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_review_question_content(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_publish_question_revision(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_grade_manual_response(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_hidden_solutions(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.qb_has_capability(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_question_bank(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_review_question_content(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_publish_question_revision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_grade_manual_response(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_hidden_solutions(uuid) TO authenticated;

-- ============================================================================
-- 11) publish_question_revision RPC (public + private internal)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._qb_validate_revision_for_publish(p_revision_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_revision public.question_revisions%ROWTYPE;
  v_option_count int;
  v_correct_count int;
  v_answer_count int;
  v_bad_policy_count int;
  v_solution_ok boolean;
  v_media_count int;
BEGIN
  SELECT * INTO v_revision
  FROM public.question_revisions
  WHERE id = p_revision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision not found';
  END IF;

  IF v_revision.max_score <= 0 THEN
    RAISE EXCEPTION 'revision max_score must be greater than zero';
  END IF;

  IF v_revision.interaction_type = 'SINGLE_CHOICE'
     OR v_revision.grading_mode = 'AUTO_SINGLE' THEN
    SELECT count(*), count(*) FILTER (WHERE is_correct)
    INTO v_option_count, v_correct_count
    FROM public.question_options
    WHERE question_revision_id = p_revision_id;

    IF v_option_count < 2 THEN
      RAISE EXCEPTION 'SINGLE_CHOICE/AUTO_SINGLE requires at least 2 options';
    END IF;

    IF v_correct_count <> 1 THEN
      RAISE EXCEPTION 'SINGLE_CHOICE/AUTO_SINGLE requires exactly one correct option';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.question_options
      WHERE question_revision_id = p_revision_id
        AND (option_code IS NULL OR char_length(trim(option_code)) = 0)
    ) THEN
      RAISE EXCEPTION 'SINGLE_CHOICE/AUTO_SINGLE requires non-empty option_codes';
    END IF;
  END IF;

  IF v_revision.interaction_type = 'SHORT_TEXT'
     OR v_revision.grading_mode = 'AUTO_TEXT' THEN
    SELECT count(*) INTO v_answer_count
    FROM public.question_accepted_answers
    WHERE question_revision_id = p_revision_id;

    IF v_answer_count < 1 THEN
      RAISE EXCEPTION 'SHORT_TEXT/AUTO_TEXT requires at least one accepted answer';
    END IF;

    SELECT count(*) INTO v_bad_policy_count
    FROM public.question_accepted_answers
    WHERE question_revision_id = p_revision_id
      AND normalization_policy NOT IN ('EXACT', 'TRIM', 'TRIM_COLLAPSE');

    IF v_bad_policy_count > 0 THEN
      RAISE EXCEPTION 'accepted answers must use EXACT, TRIM, or TRIM_COLLAPSE normalization';
    END IF;
  END IF;

  IF v_revision.grading_mode = 'MANUAL' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.question_solutions qs
      WHERE qs.question_revision_id = p_revision_id
        AND (
          (qs.model_answer IS NOT NULL AND char_length(trim(qs.model_answer)) > 0)
          OR (qs.explanation IS NOT NULL AND char_length(trim(qs.explanation)) > 0)
          OR (qs.solution_code IS NOT NULL AND char_length(trim(qs.solution_code)) > 0)
        )
    ) INTO v_solution_ok;

    IF NOT v_solution_ok THEN
      RAISE EXCEPTION 'MANUAL grading requires a solution with model_answer, explanation, or solution_code';
    END IF;
  END IF;

  IF v_revision.requires_media THEN
    SELECT count(*) INTO v_media_count
    FROM public.question_media qm
    WHERE qm.question_revision_id = p_revision_id
      AND qm.storage_path IS NOT NULL AND char_length(trim(qm.storage_path)) > 0
      AND qm.alt_text_ar IS NOT NULL AND char_length(trim(qm.alt_text_ar)) > 0;

    IF v_media_count < 1 THEN
      RAISE EXCEPTION 'requires_media revision must have at least one media row with storage_path and alt_text_ar';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._qb_validate_revision_for_publish(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._qb_validate_revision_for_publish(uuid)
  FROM anon, authenticated, service_role;

-- Drop legacy private executor if present (39B merges publish into the public RPC).
DROP FUNCTION IF EXISTS public._qb_publish_question_revision_internal(uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.publish_question_revision(
  p_question_id uuid,
  p_revision_id uuid,
  p_expected_current_revision_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_question public.questions%ROWTYPE;
  v_revision public.question_revisions%ROWTYPE;
  v_prior_id uuid;
  v_result jsonb;
  v_fingerprint text;
  v_existing public.question_bank_rpc_idempotency%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;

  IF NOT public.can_publish_question_revision(v_actor) THEN
    RAISE EXCEPTION 'not authorized to publish question revisions';
  END IF;

  v_fingerprint := encode(
    sha256(
      convert_to(
        concat_ws(
          '|',
          'publish_question_revision',
          v_actor::text,
          coalesce(p_question_id::text, ''),
          coalesce(p_revision_id::text, ''),
          coalesce(p_expected_current_revision_id::text, '')
        ),
        'utf8'
      )
    ),
    'hex'
  );

  -- Serialize concurrent publish attempts for the same actor+key.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('qb:publish:' || v_actor::text || ':' || p_idempotency_key, 0)
  );

  SELECT * INTO v_existing
  FROM public.question_bank_rpc_idempotency
  WHERE rpc_name = 'publish_question_revision'
    AND actor_id = v_actor
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'idempotency key reused with different input';
    END IF;
    RETURN v_existing.result;
  END IF;

  SELECT * INTO v_question
  FROM public.questions
  WHERE id = p_question_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question not found';
  END IF;

  IF v_question.current_published_revision_id IS DISTINCT FROM p_expected_current_revision_id THEN
    RAISE EXCEPTION 'optimistic concurrency failure: published pointer changed';
  END IF;

  SELECT * INTO v_revision
  FROM public.question_revisions
  WHERE id = p_revision_id
    AND question_id = p_question_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision not found for question';
  END IF;

  IF v_revision.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'only APPROVED revisions may be published';
  END IF;

  IF v_revision.payload_hash IS NULL THEN
    RAISE EXCEPTION 'published revision requires payload_hash';
  END IF;

  PERFORM public._qb_validate_revision_for_publish(p_revision_id);

  SELECT qr.id INTO v_prior_id
  FROM public.question_revisions qr
  WHERE qr.question_id = p_question_id
    AND qr.status = 'PUBLISHED'
    AND qr.id <> p_revision_id
  FOR UPDATE;

  IF v_prior_id IS NOT NULL THEN
    UPDATE public.question_revisions
    SET status = 'SUPERSEDED',
        superseded_at = now()
    WHERE id = v_prior_id;

    PERFORM public.write_audit_log(
      'REVISION_SUPERSEDED',
      'question_revision',
      v_prior_id,
      jsonb_build_object(
        'question_id', p_question_id,
        'superseded_by', p_revision_id,
        'idempotency_key', p_idempotency_key
      )
    );
  END IF;

  UPDATE public.question_revisions
  SET status = 'PUBLISHED',
      published_at = now(),
      published_by = v_actor
  WHERE id = p_revision_id;

  UPDATE public.questions
  SET current_published_revision_id = p_revision_id
  WHERE id = p_question_id;

  PERFORM public.write_audit_log(
    'REVISION_PUBLISHED',
    'question',
    p_question_id,
    jsonb_build_object(
      'revision_id', p_revision_id,
      'published_by', v_actor,
      'idempotency_key', p_idempotency_key
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'question_id', p_question_id,
    'revision_id', p_revision_id,
    'previous_revision_id', p_expected_current_revision_id,
    'request_fingerprint', v_fingerprint
  );

  INSERT INTO public.question_bank_rpc_idempotency (
    rpc_name, actor_id, idempotency_key, request_fingerprint, result
  ) VALUES (
    'publish_question_revision', v_actor, p_idempotency_key, v_fingerprint, v_result
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_question_revision(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_question_revision(uuid, uuid, uuid, text) TO authenticated;

-- ============================================================================
-- 12) retarget_question RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.retarget_question(
  p_question_id uuid,
  p_targets jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_question public.questions%ROWTYPE;
  v_old jsonb;
  v_new jsonb;
  v_elem jsonb;
  v_target_type text;
  v_subject_id uuid;
  v_unit_id uuid;
  v_lesson_id uuid;
  v_is_primary boolean;
  v_primary_count int := 0;
  v_idx int;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_edit_question_bank(v_actor) THEN
    RAISE EXCEPTION 'not authorized to edit question bank';
  END IF;

  IF p_targets IS NULL OR jsonb_typeof(p_targets) <> 'array' OR jsonb_array_length(p_targets) = 0 THEN
    RAISE EXCEPTION 'p_targets must be a non-empty JSON array';
  END IF;

  SELECT * INTO v_question
  FROM public.questions
  WHERE id = p_question_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question not found';
  END IF;

  IF v_question.current_published_revision_id IS NOT NULL
     AND (p_reason IS NULL OR char_length(trim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'reason is required when retargeting a published question';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb)
  INTO v_old
  FROM public.question_targets t
  WHERE t.question_id = p_question_id;

  FOR v_idx IN 0 .. jsonb_array_length(p_targets) - 1 LOOP
    v_elem := p_targets -> v_idx;
    v_target_type := upper(trim(v_elem ->> 'target_type'));
    v_subject_id := NULLIF(v_elem ->> 'subject_id', '')::uuid;
    v_unit_id := NULLIF(v_elem ->> 'unit_id', '')::uuid;
    v_lesson_id := NULLIF(v_elem ->> 'lesson_id', '')::uuid;
    v_is_primary := COALESCE((v_elem ->> 'is_primary')::boolean, false);

    IF v_target_type NOT IN ('SUBJECT', 'UNIT', 'LESSON') THEN
      RAISE EXCEPTION 'invalid target_type at index %', v_idx;
    END IF;

    IF v_target_type = 'SUBJECT' THEN
      IF v_subject_id IS NULL OR v_unit_id IS NOT NULL OR v_lesson_id IS NOT NULL THEN
        RAISE EXCEPTION 'SUBJECT target shape invalid at index %', v_idx;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.subjects s WHERE s.id = v_subject_id) THEN
        RAISE EXCEPTION 'subject not found at index %', v_idx;
      END IF;
    ELSIF v_target_type = 'UNIT' THEN
      IF v_subject_id IS NULL OR v_unit_id IS NULL OR v_lesson_id IS NOT NULL THEN
        RAISE EXCEPTION 'UNIT target shape invalid at index %', v_idx;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.units u
        WHERE u.id = v_unit_id AND u.subject_id = v_subject_id
      ) THEN
        RAISE EXCEPTION 'unit/subject hierarchy mismatch at index %', v_idx;
      END IF;
    ELSE
      IF v_subject_id IS NULL OR v_unit_id IS NULL OR v_lesson_id IS NULL THEN
        RAISE EXCEPTION 'LESSON target shape invalid at index %', v_idx;
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.lessons l
        JOIN public.units u ON u.id = v_unit_id
        WHERE l.id = v_lesson_id
          AND l.subject_id = v_subject_id
          AND l.unit_id = v_unit_id
      ) THEN
        RAISE EXCEPTION 'lesson/unit/subject hierarchy mismatch at index %', v_idx;
      END IF;
    END IF;

    IF v_is_primary THEN
      v_primary_count := v_primary_count + 1;
    END IF;
  END LOOP;

  IF v_primary_count <> 1 THEN
    RAISE EXCEPTION 'exactly one primary target is required';
  END IF;

  DELETE FROM public.question_targets WHERE question_id = p_question_id;

  FOR v_idx IN 0 .. jsonb_array_length(p_targets) - 1 LOOP
    v_elem := p_targets -> v_idx;
    INSERT INTO public.question_targets (
      question_id,
      target_type,
      subject_id,
      unit_id,
      lesson_id,
      is_primary,
      created_by
    ) VALUES (
      p_question_id,
      upper(trim(v_elem ->> 'target_type')),
      NULLIF(v_elem ->> 'subject_id', '')::uuid,
      NULLIF(v_elem ->> 'unit_id', '')::uuid,
      NULLIF(v_elem ->> 'lesson_id', '')::uuid,
      COALESCE((v_elem ->> 'is_primary')::boolean, false),
      v_actor
    );
  END LOOP;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb)
  INTO v_new
  FROM public.question_targets t
  WHERE t.question_id = p_question_id;

  PERFORM public.write_audit_log(
    'QUESTION_RETARGETED',
    'question',
    p_question_id,
    jsonb_build_object(
      'reason', p_reason,
      'old_targets', v_old,
      'new_targets', v_new
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'question_id', p_question_id,
    'targets', v_new
  );
END;
$$;

REVOKE ALL ON FUNCTION public.retarget_question(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retarget_question(uuid, jsonb, text) TO authenticated;

-- ============================================================================
-- 13) Capability grant / revoke RPCs (admin only)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.grant_question_bank_capability(
  p_user_id uuid,
  p_capability text,
  p_scope_type text,
  p_scope_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_grant_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.is_full_admin(v_actor) THEN
    RAISE EXCEPTION 'admin authorization required';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF p_reason IS NULL OR char_length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  IF p_user_id = v_actor AND NOT public.is_full_admin(v_actor) THEN
    RAISE EXCEPTION 'self-grant is not allowed';
  END IF;

  IF p_capability NOT IN (
    'EDIT_QUESTION_BANK',
    'REVIEW_QUESTION_CONTENT',
    'PUBLISH_QUESTION_REVISION',
    'GRADE_MANUAL_RESPONSE',
    'READ_HIDDEN_SOLUTIONS'
  ) THEN
    RAISE EXCEPTION 'invalid capability';
  END IF;

  IF p_scope_type NOT IN ('GLOBAL', 'SUBJECT', 'UNIT', 'LESSON', 'GRADE') THEN
    RAISE EXCEPTION 'invalid scope_type';
  END IF;

  IF p_scope_type <> 'GLOBAL' THEN
    RAISE EXCEPTION 'non-GLOBAL scopes are not supported in P0; only GLOBAL grants are effective';
  END IF;

  IF (p_scope_type = 'GLOBAL' AND p_scope_id IS NOT NULL)
     OR (p_scope_type <> 'GLOBAL' AND p_scope_id IS NULL) THEN
    RAISE EXCEPTION 'scope_type/scope_id shape invalid';
  END IF;

  INSERT INTO public.question_bank_capability_grants (
    user_id, capability, scope_type, scope_id, granted_by, reason
  ) VALUES (
    p_user_id, p_capability, p_scope_type, p_scope_id, v_actor, p_reason
  )
  RETURNING id INTO v_grant_id;

  PERFORM public.write_audit_log(
    'CAPABILITY_GRANTED',
    'question_bank_capability_grant',
    v_grant_id,
    jsonb_build_object(
      'user_id', p_user_id,
      'capability', p_capability,
      'scope_type', p_scope_type,
      'scope_id', p_scope_id,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object('success', true, 'grant_id', v_grant_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_question_bank_capability(
  p_grant_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_grant public.question_bank_capability_grants%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_full_admin(v_actor) THEN
    RAISE EXCEPTION 'admin authorization required';
  END IF;

  IF p_reason IS NULL OR char_length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT * INTO v_grant
  FROM public.question_bank_capability_grants
  WHERE id = p_grant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant not found';
  END IF;

  IF v_grant.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'grant_id', p_grant_id, 'noop', true);
  END IF;

  UPDATE public.question_bank_capability_grants
  SET revoked_at = now(),
      revoked_by = v_actor
  WHERE id = p_grant_id;

  PERFORM public.write_audit_log(
    'CAPABILITY_REVOKED',
    'question_bank_capability_grant',
    p_grant_id,
    jsonb_build_object(
      'user_id', v_grant.user_id,
      'capability', v_grant.capability,
      'scope_type', v_grant.scope_type,
      'scope_id', v_grant.scope_id,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object('success', true, 'grant_id', p_grant_id);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_question_bank_capability(uuid, text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_question_bank_capability(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_question_bank_capability(uuid, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_question_bank_capability(uuid, text) TO authenticated;

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

-- ============================================================================
-- 16) Manual grading reviews (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.question_response_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_answer_id uuid REFERENCES public.exam_session_answers(id) ON DELETE RESTRICT,
  practice_response_id uuid REFERENCES public.practice_attempt_responses(id) ON DELETE RESTRICT,
  grader_id uuid NOT NULL REFERENCES auth.users(id),
  assigned_grader_id uuid REFERENCES auth.users(id),
  score_awarded numeric NOT NULL CHECK (score_awarded >= 0),
  feedback text,
  previous_score numeric,
  reason text,
  is_final boolean NOT NULL DEFAULT false,
  action_id uuid NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (exam_answer_id IS NOT NULL AND practice_response_id IS NULL)
    OR (exam_answer_id IS NULL AND practice_response_id IS NOT NULL)
  ),
  CHECK (NOT is_final OR reason IS NOT NULL),
  UNIQUE (exam_answer_id, idempotency_key),
  UNIQUE (practice_response_id, idempotency_key)
);

COMMENT ON COLUMN public.question_response_reviews.reason IS
  'Nullable for initial grading rows; NOT NULL when is_final = true. Correction/reopen RPCs must supply reason.';

-- ============================================================================
-- 17) Unified read-only analytics view
-- ============================================================================
CREATE OR REPLACE VIEW public.v_question_responses_unified
WITH (security_invoker = true)
AS
SELECT
  'exam'::text AS surface_type,
  ea.id AS response_id,
  es.id AS attempt_id,
  es.user_id,
  ea.question_id AS logical_question_id,
  ea.question_revision_id,
  ea.selected_option_code,
  ea.response_text,
  ea.grading_status,
  ea.final_score,
  ea.max_score,
  ea.created_at
FROM public.exam_session_answers ea
JOIN public.exam_sessions es ON es.id = ea.session_id
UNION ALL
SELECT
  'practice'::text AS surface_type,
  par.id AS response_id,
  pa.id AS attempt_id,
  pa.user_id,
  paq.logical_question_id,
  paq.question_revision_id,
  par.selected_option_code,
  par.response_text,
  par.grading_status,
  par.final_score,
  par.max_score,
  par.created_at
FROM public.practice_attempt_responses par
JOIN public.practice_attempt_questions paq ON paq.id = par.practice_attempt_question_id
JOIN public.practice_attempts pa ON pa.id = par.practice_attempt_id;

COMMENT ON VIEW public.v_question_responses_unified IS
  'Read-only UNION for analytics/reporting. Not write SoT. Underlying table RLS applies (security_invoker).';

REVOKE ALL ON public.v_question_responses_unified FROM PUBLIC;
GRANT SELECT ON public.v_question_responses_unified TO authenticated;

-- ============================================================================
-- 18) Snapshot create stubs (fail closed; not activated in QB-01)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_exam_session_with_snapshot(p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT attempt_pin_mode INTO v_mode
  FROM public.question_bank_runtime_config
  WHERE id = 1
  FOR SHARE;

  IF v_mode = 'REVISION_PINNED' THEN
    RAISE EXCEPTION 'REVISION_PINNED path not activated';
  END IF;

  RAISE EXCEPTION 'QB-01 snapshot create not activated; use legacy RPCs';
END;
$$;

CREATE OR REPLACE FUNCTION public.create_practice_attempt_with_snapshot(p_params jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mode text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT attempt_pin_mode INTO v_mode
  FROM public.question_bank_runtime_config
  WHERE id = 1
  FOR SHARE;

  IF v_mode = 'REVISION_PINNED' THEN
    RAISE EXCEPTION 'REVISION_PINNED path not activated';
  END IF;

  RAISE EXCEPTION 'QB-01 snapshot create not activated; use legacy RPCs';
END;
$$;

REVOKE ALL ON FUNCTION public.create_exam_session_with_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_practice_attempt_with_snapshot(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_exam_session_with_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_practice_attempt_with_snapshot(jsonb) TO service_role;

-- ============================================================================
-- 19) Admin runtime mode RPC (not invoked by QB-01 package)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_question_bank_attempt_pin_mode(
  p_attempt_pin_mode text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_full_admin(v_actor) THEN
    RAISE EXCEPTION 'admin authorization required';
  END IF;

  IF p_attempt_pin_mode NOT IN ('LEGACY', 'REVISION_PINNED') THEN
    RAISE EXCEPTION 'invalid attempt_pin_mode';
  END IF;

  IF p_reason IS NULL OR char_length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT attempt_pin_mode INTO v_old
  FROM public.question_bank_runtime_config
  WHERE id = 1
  FOR UPDATE;

  UPDATE public.question_bank_runtime_config
  SET attempt_pin_mode = p_attempt_pin_mode,
      enabled_at = CASE WHEN p_attempt_pin_mode = 'REVISION_PINNED' THEN now() ELSE enabled_at END,
      enabled_by = CASE WHEN p_attempt_pin_mode = 'REVISION_PINNED' THEN v_actor ELSE enabled_by END,
      updated_at = now(),
      updated_by = v_actor
  WHERE id = 1;

  PERFORM public.write_audit_log(
    'ATTEMPT_PIN_MODE_CHANGED',
    'question_bank_runtime_config',
    NULL,
    jsonb_build_object(
      'config_id', 1,
      'old_mode', v_old,
      'new_mode', p_attempt_pin_mode,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object('success', true, 'attempt_pin_mode', p_attempt_pin_mode);
END;
$$;

REVOKE ALL ON FUNCTION public.set_question_bank_attempt_pin_mode(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_question_bank_attempt_pin_mode(text, text) TO authenticated;

-- ============================================================================
-- 20) Legacy sync stub (0-based correct_index cache writer — not activated)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.qb_sync_question_legacy(_question_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Future implementation:
  --   * Read questions.current_published_revision_id
  --   * Build legacy options JSON from question_options ordered by sort_order
  --   * Set questions.correct_index to ZERO-BASED index of first is_correct option
  --   * NEVER write Excel 1-based values into correct_index
  --   * Copy explanation/hidden content from question_solutions as needed
  NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.qb_sync_question_legacy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qb_sync_question_legacy(uuid) TO service_role;

-- ============================================================================
-- 21) Row level security
-- ============================================================================
ALTER TABLE public.question_bank_runtime_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank_capability_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_accepted_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_solution_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_session_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_attempt_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_attempt_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_response_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank_rpc_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_session_answers ENABLE ROW LEVEL SECURITY;

-- runtime_config
DROP POLICY IF EXISTS qb_runtime_config_admin_select ON public.question_bank_runtime_config;
CREATE POLICY qb_runtime_config_admin_select ON public.question_bank_runtime_config
  FOR SELECT TO authenticated
  USING (public.is_full_admin(auth.uid()));

DROP POLICY IF EXISTS qb_runtime_config_admin_all ON public.question_bank_runtime_config;
CREATE POLICY qb_runtime_config_admin_all ON public.question_bank_runtime_config
  FOR ALL TO authenticated
  USING (public.is_full_admin(auth.uid()))
  WITH CHECK (public.is_full_admin(auth.uid()));

-- capability_grants: admin read only; writes via RPC
DROP POLICY IF EXISTS qb_cap_grants_admin_select ON public.question_bank_capability_grants;
CREATE POLICY qb_cap_grants_admin_select ON public.question_bank_capability_grants
  FOR SELECT TO authenticated
  USING (public.is_full_admin(auth.uid()));

-- question_revisions
DROP POLICY IF EXISTS qb_revisions_staff_select ON public.question_revisions;
CREATE POLICY qb_revisions_staff_select ON public.question_revisions
  FOR SELECT TO authenticated
  USING (
    public.is_full_admin(auth.uid())
    OR public.can_edit_question_bank(auth.uid())
    OR public.can_review_question_content(auth.uid())
    OR public.can_read_hidden_solutions(auth.uid())
  );

DROP POLICY IF EXISTS qb_revisions_edit_manage ON public.question_revisions;
DROP POLICY IF EXISTS qb_revisions_edit_insert ON public.question_revisions;
CREATE POLICY qb_revisions_edit_insert ON public.question_revisions
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.can_edit_question_bank(auth.uid()) OR public.is_full_admin(auth.uid()))
    AND status = 'DRAFT'
  );

DROP POLICY IF EXISTS qb_revisions_edit_update ON public.question_revisions;
CREATE POLICY qb_revisions_edit_update ON public.question_revisions
  FOR UPDATE TO authenticated
  USING (
    (public.can_edit_question_bank(auth.uid()) OR public.is_full_admin(auth.uid()))
    AND status IN ('DRAFT', 'READY_FOR_REVIEW', 'REJECTED')
  )
  WITH CHECK (
    (public.can_edit_question_bank(auth.uid()) OR public.is_full_admin(auth.uid()))
    AND status IN ('DRAFT', 'READY_FOR_REVIEW', 'REJECTED')
  );

-- Sensitive revision children (includes is_correct / accepted answers / solutions)
DROP POLICY IF EXISTS qb_options_staff_select ON public.question_options;
CREATE POLICY qb_options_staff_select ON public.question_options
  FOR SELECT TO authenticated
  USING (
    public.is_full_admin(auth.uid())
    OR public.can_edit_question_bank(auth.uid())
    OR public.can_review_question_content(auth.uid())
    OR public.can_read_hidden_solutions(auth.uid())
  );

DROP POLICY IF EXISTS qb_options_edit_manage ON public.question_options;
CREATE POLICY qb_options_edit_manage ON public.question_options
  FOR ALL TO authenticated
  USING (public.can_edit_question_bank(auth.uid()) OR public.is_full_admin(auth.uid()))
  WITH CHECK (public.can_edit_question_bank(auth.uid()) OR public.is_full_admin(auth.uid()));

DROP POLICY IF EXISTS qb_accepted_staff_select ON public.question_accepted_answers;
CREATE POLICY qb_accepted_staff_select ON public.question_accepted_answers
  FOR SELECT TO authenticated
  USING (
    public.is_full_admin(auth.uid())
    OR public.can_edit_question_bank(auth.uid())
    OR public.can_review_question_content(auth.uid())
    OR public.can_read_hidden_solutions(auth.uid())
  );

DROP POLICY IF EXISTS qb_accepted_edit_manage ON public.question_accepted_answers;
CREATE POLICY qb_accepted_edit_manage ON public.question_accepted_answers
  FOR ALL TO authenticated
  USING (public.can_edit_question_bank(auth.uid()) OR public.is_full_admin(auth.uid()))
  WITH CHECK (public.can_edit_question_bank(auth.uid()) OR public.is_full_admin(auth.uid()));

DROP POLICY IF EXISTS qb_solutions_staff_select ON public.question_solutions;
CREATE POLICY qb_solutions_staff_select ON public.question_solutions
  FOR SELECT TO authenticated
  USING (
    public.is_full_admin(auth.uid())
    OR public.can_edit_question_bank(auth.uid())
    OR public.can_review_question_content(auth.uid())
    OR public.can_read_hidden_solutions(auth.uid())
  );

DROP POLICY IF EXISTS qb_solutions_edit_manage ON public.question_solutions;
CREATE POLICY qb_solutions_edit_manage ON public.question_solutions
  FOR ALL TO authenticated
  USING (public.can_edit_question_bank(auth.uid()) OR public.is_full_admin(auth.uid()))
  WITH CHECK (public.can_edit_question_bank(auth.uid()) OR public.is_full_admin(auth.uid()));

DROP POLICY IF EXISTS qb_solution_steps_staff_select ON public.question_solution_steps;
CREATE POLICY qb_solution_steps_staff_select ON public.question_solution_steps
  FOR SELECT TO authenticated
  USING (
    public.is_full_admin(auth.uid())
    OR public.can_edit_question_bank(auth.uid())
    OR public.can_review_question_content(auth.uid())
    OR public.can_read_hidden_solutions(auth.uid())
  );

DROP POLICY IF EXISTS qb_solution_steps_edit_manage ON public.question_solution_steps;
CREATE POLICY qb_solution_steps_edit_manage ON public.question_solution_steps
  FOR ALL TO authenticated
  USING (public.can_edit_question_bank(auth.uid()) OR public.is_full_admin(auth.uid()))
  WITH CHECK (public.can_edit_question_bank(auth.uid()) OR public.is_full_admin(auth.uid()));

DROP POLICY IF EXISTS qb_media_staff_select ON public.question_media;
CREATE POLICY qb_media_staff_select ON public.question_media
  FOR SELECT TO authenticated
  USING (
    public.is_full_admin(auth.uid())
    OR public.can_edit_question_bank(auth.uid())
    OR public.can_review_question_content(auth.uid())
  );

DROP POLICY IF EXISTS qb_media_edit_manage ON public.question_media;
CREATE POLICY qb_media_edit_manage ON public.question_media
  FOR ALL TO authenticated
  USING (public.can_edit_question_bank(auth.uid()) OR public.is_full_admin(auth.uid()))
  WITH CHECK (public.can_edit_question_bank(auth.uid()) OR public.is_full_admin(auth.uid()));

-- targets
DROP POLICY IF EXISTS qb_targets_staff_select ON public.question_targets;
CREATE POLICY qb_targets_staff_select ON public.question_targets
  FOR SELECT TO authenticated
  USING (
    public.is_full_admin(auth.uid())
    OR public.can_edit_question_bank(auth.uid())
    OR public.can_review_question_content(auth.uid())
  );

DROP POLICY IF EXISTS qb_targets_edit_manage ON public.question_targets;
CREATE POLICY qb_targets_edit_manage ON public.question_targets
  FOR ALL TO authenticated
  USING (public.can_edit_question_bank(auth.uid()) OR public.is_full_admin(auth.uid()))
  WITH CHECK (public.can_edit_question_bank(auth.uid()) OR public.is_full_admin(auth.uid()));

-- exam_session_questions
DROP POLICY IF EXISTS qb_esq_owner_select ON public.exam_session_questions;
CREATE POLICY qb_esq_owner_select ON public.exam_session_questions
  FOR SELECT TO authenticated
  USING (
    public.is_full_admin(auth.uid())
    OR public.can_review_question_content(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.exam_sessions es
      WHERE es.id = exam_session_id AND es.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.exam_session_answers esa
      WHERE esa.exam_session_question_id = exam_session_questions.id
        AND esa.assigned_grader_id = auth.uid()
    )
  );

-- practice attempts (owner read; no broad student insert)
DROP POLICY IF EXISTS qb_practice_owner_select ON public.practice_attempts;
CREATE POLICY qb_practice_owner_select ON public.practice_attempts
  FOR SELECT TO authenticated
  USING (
    public.is_full_admin(auth.uid())
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS qb_practice_q_owner_select ON public.practice_attempt_questions;
CREATE POLICY qb_practice_q_owner_select ON public.practice_attempt_questions
  FOR SELECT TO authenticated
  USING (
    public.is_full_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.practice_attempts pa
      WHERE pa.id = practice_attempt_id AND pa.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.practice_attempt_responses par
      JOIN public.question_response_reviews r ON r.practice_response_id = par.id
      WHERE par.practice_attempt_question_id = practice_attempt_questions.id
        AND (r.assigned_grader_id = auth.uid() OR r.grader_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS qb_practice_r_owner_select ON public.practice_attempt_responses;
CREATE POLICY qb_practice_r_owner_select ON public.practice_attempt_responses
  FOR SELECT TO authenticated
  USING (
    public.is_full_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.practice_attempts pa
      WHERE pa.id = practice_attempt_id AND pa.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.question_response_reviews r
      WHERE r.practice_response_id = practice_attempt_responses.id
        AND (r.assigned_grader_id = auth.uid() OR r.grader_id = auth.uid())
    )
  );

-- reviews: grader read; append-only except admin
DROP POLICY IF EXISTS qb_reviews_grader_select ON public.question_response_reviews;
CREATE POLICY qb_reviews_grader_select ON public.question_response_reviews
  FOR SELECT TO authenticated
  USING (
    public.is_full_admin(auth.uid())
    OR grader_id = auth.uid()
    OR assigned_grader_id = auth.uid()
  );

DROP POLICY IF EXISTS qb_reviews_admin_mutate ON public.question_response_reviews;
CREATE POLICY qb_reviews_admin_mutate ON public.question_response_reviews
  FOR ALL TO authenticated
  USING (public.is_full_admin(auth.uid()))
  WITH CHECK (public.is_full_admin(auth.uid()));

-- exam_session_answers: assigned grader read
DROP POLICY IF EXISTS qb_esa_assigned_grader_select ON public.exam_session_answers;
CREATE POLICY qb_esa_assigned_grader_select ON public.exam_session_answers
  FOR SELECT TO authenticated
  USING (
    public.is_full_admin(auth.uid())
    OR assigned_grader_id = auth.uid()
  );

-- idempotency: service_role / definer RPCs only
DROP POLICY IF EXISTS qb_idempotency_service ON public.question_bank_rpc_idempotency;
CREATE POLICY qb_idempotency_service ON public.question_bank_rpc_idempotency
  FOR ALL TO authenticated
  USING (public.is_full_admin(auth.uid()))
  WITH CHECK (public.is_full_admin(auth.uid()));

-- ============================================================================
-- 22) Table privileges
-- ============================================================================
REVOKE ALL ON public.question_bank_runtime_config FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.question_bank_capability_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.question_revisions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.question_options FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.question_accepted_answers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.question_solutions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.question_solution_steps FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.question_media FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.question_targets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.exam_session_questions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.practice_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.practice_attempt_questions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.practice_attempt_responses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.question_response_reviews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.question_bank_rpc_idempotency FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.question_bank_runtime_config TO authenticated;
GRANT SELECT ON public.question_bank_capability_grants TO authenticated;
GRANT SELECT, INSERT ON public.question_revisions TO authenticated;
GRANT UPDATE (
  interaction_type,
  grading_mode,
  educational_label,
  question_text,
  stimulus_text,
  max_score,
  allow_partial,
  requires_media,
  manual_grading_required,
  reviewed_at,
  reviewed_by,
  rejected_at,
  rejected_by,
  rejection_reason
) ON public.question_revisions TO authenticated;
REVOKE UPDATE (
  status,
  published_at,
  published_by,
  superseded_at,
  payload_hash,
  payload_hash_version
) ON public.question_revisions FROM authenticated, anon, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_options TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_accepted_answers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_solutions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_solution_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_media TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_targets TO authenticated;
GRANT SELECT ON public.exam_session_questions TO authenticated;
GRANT SELECT ON public.practice_attempts TO authenticated;
GRANT SELECT ON public.practice_attempt_questions TO authenticated;
GRANT SELECT ON public.practice_attempt_responses TO authenticated;
GRANT SELECT ON public.question_response_reviews TO authenticated;

GRANT ALL ON public.question_bank_runtime_config TO service_role;
GRANT ALL ON public.question_bank_capability_grants TO service_role;
GRANT SELECT, INSERT ON public.question_revisions TO service_role;
GRANT UPDATE (
  interaction_type,
  grading_mode,
  educational_label,
  question_text,
  stimulus_text,
  max_score,
  allow_partial,
  requires_media,
  manual_grading_required,
  reviewed_at,
  reviewed_by,
  rejected_at,
  rejected_by,
  rejection_reason
) ON public.question_revisions TO service_role;
GRANT ALL ON public.question_options TO service_role;
GRANT ALL ON public.question_accepted_answers TO service_role;
GRANT ALL ON public.question_solutions TO service_role;
GRANT ALL ON public.question_solution_steps TO service_role;
GRANT ALL ON public.question_media TO service_role;
GRANT ALL ON public.question_targets TO service_role;
GRANT ALL ON public.exam_session_questions TO service_role;
GRANT ALL ON public.practice_attempts TO service_role;
GRANT ALL ON public.practice_attempt_questions TO service_role;
GRANT ALL ON public.practice_attempt_responses TO service_role;
GRANT ALL ON public.question_response_reviews TO service_role;
GRANT ALL ON public.question_bank_rpc_idempotency TO service_role;

-- ============================================================================
-- 23) Re-assert questions column grants (extends 20260731120000 allowlist)
-- ============================================================================
REVOKE UPDATE ON public.questions FROM authenticated, anon;
REVOKE SELECT ON public.questions FROM anon;
REVOKE SELECT ON public.questions FROM authenticated;

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
  code,
  created_by,
  archived_at,
  current_published_revision_id
) ON public.questions TO authenticated;

REVOKE SELECT (correct_index, explanation, archived_by) ON public.questions FROM anon, authenticated;

GRANT ALL ON public.questions TO service_role;
REVOKE UPDATE (current_published_revision_id) ON public.questions FROM authenticated, anon, service_role;

-- END QB-01 QUESTION BANK SCHEMA FOUNDATION (SOURCE ONLY — NOT APPLIED BY PACKAGE)
