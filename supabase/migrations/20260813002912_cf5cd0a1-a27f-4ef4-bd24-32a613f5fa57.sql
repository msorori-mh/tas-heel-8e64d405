-- QB-01 PART 7/7
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

-- 45B: service_role has no direct DML on sensitive QB surfaces; RPCs are SECURITY DEFINER.
REVOKE ALL ON public.question_bank_runtime_config FROM service_role;
GRANT SELECT ON public.question_bank_runtime_config TO service_role;

REVOKE ALL ON public.question_bank_capability_grants FROM service_role;
GRANT SELECT ON public.question_bank_capability_grants TO service_role;

REVOKE ALL ON public.question_bank_rpc_idempotency FROM service_role;

REVOKE ALL ON public.question_revisions FROM service_role;
GRANT SELECT ON public.question_revisions TO service_role;

REVOKE ALL ON public.question_options FROM service_role;
GRANT SELECT ON public.question_options TO service_role;
REVOKE ALL ON public.question_accepted_answers FROM service_role;
GRANT SELECT ON public.question_accepted_answers TO service_role;
REVOKE ALL ON public.question_solutions FROM service_role;
GRANT SELECT ON public.question_solutions TO service_role;
REVOKE ALL ON public.question_solution_steps FROM service_role;
GRANT SELECT ON public.question_solution_steps TO service_role;
REVOKE ALL ON public.question_media FROM service_role;
GRANT SELECT ON public.question_media TO service_role;

REVOKE ALL ON public.question_targets FROM service_role;
GRANT SELECT ON public.question_targets TO service_role;

REVOKE ALL ON public.exam_session_questions FROM service_role;
GRANT SELECT ON public.exam_session_questions TO service_role;
REVOKE ALL ON public.practice_attempts FROM service_role;
GRANT SELECT ON public.practice_attempts TO service_role;
REVOKE ALL ON public.practice_attempt_questions FROM service_role;
GRANT SELECT ON public.practice_attempt_questions TO service_role;
REVOKE ALL ON public.practice_attempt_responses FROM service_role;
GRANT SELECT ON public.practice_attempt_responses TO service_role;
REVOKE ALL ON public.question_response_reviews FROM service_role;
GRANT SELECT ON public.question_response_reviews TO service_role;

REVOKE ALL ON public.exam_session_answers FROM service_role;
GRANT SELECT ON public.exam_session_answers TO service_role;

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

-- POINTER-CHILD-42 / 45B: service_role has SELECT only on questions (no direct DML).
-- Pointer/lifecycle/delete are SECURITY DEFINER RPCs only (owner bypass).
REVOKE ALL ON public.questions FROM service_role;
GRANT SELECT ON public.questions TO service_role;
REVOKE UPDATE (current_published_revision_id) ON public.questions FROM authenticated, anon, service_role;
REVOKE UPDATE (correct_index, explanation) ON public.questions FROM service_role;
REVOKE DELETE ON public.questions FROM anon, authenticated, service_role;

-- ============================================================================
-- 24) Append-only guards (capability grants + idempotency)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.qb_guard_capability_grants_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'question_bank_capability_grants rows are append-only; revoke via RPC';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.capability IS DISTINCT FROM OLD.capability
       OR NEW.scope_type IS DISTINCT FROM OLD.scope_type
       OR NEW.scope_id IS DISTINCT FROM OLD.scope_id
       OR NEW.granted_by IS DISTINCT FROM OLD.granted_by
       OR NEW.granted_at IS DISTINCT FROM OLD.granted_at
       OR NEW.reason IS DISTINCT FROM OLD.reason THEN
      RAISE EXCEPTION 'capability grant identity fields are immutable; revoke via RPC';
    END IF;
    IF OLD.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'revoked capability grants are immutable';
    END IF;
    IF NEW.revoked_at IS NULL THEN
      RAISE EXCEPTION 'capability grant UPDATE must set revoked_at via revoke RPC';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qb_capability_grants_append_only ON public.question_bank_capability_grants;
CREATE TRIGGER trg_qb_capability_grants_append_only
  BEFORE UPDATE OR DELETE ON public.question_bank_capability_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.qb_guard_capability_grants_append_only();

CREATE OR REPLACE FUNCTION public.qb_guard_idempotency_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'question_bank_rpc_idempotency rows are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_qb_idempotency_append_only ON public.question_bank_rpc_idempotency;
CREATE TRIGGER trg_qb_idempotency_append_only
  BEFORE UPDATE OR DELETE ON public.question_bank_rpc_idempotency
  FOR EACH ROW
  EXECUTE FUNCTION public.qb_guard_idempotency_append_only();

CREATE OR REPLACE FUNCTION public.qb_guard_snapshot_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Allow CASCADE cleanup when parent session/attempt is already gone.
  IF TG_TABLE_NAME = 'exam_session_questions' THEN
    IF EXISTS (
      SELECT 1 FROM public.exam_sessions s WHERE s.id = OLD.exam_session_id
    ) THEN
      RAISE EXCEPTION 'attempt snapshot rows cannot be deleted directly';
    END IF;
  ELSIF TG_TABLE_NAME = 'practice_attempt_questions' THEN
    IF EXISTS (
      SELECT 1 FROM public.practice_attempts a WHERE a.id = OLD.practice_attempt_id
    ) THEN
      RAISE EXCEPTION 'attempt snapshot rows cannot be deleted directly';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_qb_exam_snapshot_no_delete ON public.exam_session_questions;
CREATE TRIGGER trg_qb_exam_snapshot_no_delete
  BEFORE DELETE ON public.exam_session_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.qb_guard_snapshot_no_delete();

DROP TRIGGER IF EXISTS trg_qb_practice_snapshot_no_delete ON public.practice_attempt_questions;
CREATE TRIGGER trg_qb_practice_snapshot_no_delete
  BEFORE DELETE ON public.practice_attempt_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.qb_guard_snapshot_no_delete();

CREATE OR REPLACE FUNCTION public.qb_guard_reviews_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'question_response_reviews are append-only';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'question_response_reviews are append-only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qb_reviews_append_only ON public.question_response_reviews;
CREATE TRIGGER trg_qb_reviews_append_only
  BEFORE UPDATE OR DELETE ON public.question_response_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.qb_guard_reviews_append_only();

REVOKE ALL ON FUNCTION public.qb_guard_capability_grants_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qb_guard_idempotency_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qb_guard_snapshot_no_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qb_guard_reviews_append_only() FROM PUBLIC;