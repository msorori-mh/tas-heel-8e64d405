-- QB-01 PART 6/7
-- ============================================================================
-- 13b) Controlled draft-question deletion (keeps ON DELETE RESTRICT on revisions)
-- ============================================================================
DROP FUNCTION IF EXISTS public.delete_draft_question(uuid, text);

CREATE OR REPLACE FUNCTION public.delete_draft_question(
  p_question_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_q public.questions%ROWTYPE;
  v_rev_count int;
  v_non_draft int;
  v_usage int;
  v_fingerprint text;
  v_existing public.question_bank_rpc_idempotency%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT (
    public.is_full_admin(v_actor)
    OR public.can_delete_draft_question(v_actor)
  ) THEN
    RAISE EXCEPTION 'DELETE_DRAFT_QUESTION or admin authorization required';
  END IF;

  IF p_question_id IS NULL THEN
    RAISE EXCEPTION 'p_question_id is required';
  END IF;

  IF p_reason IS NULL OR char_length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  IF p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;

  v_fingerprint := encode(
    sha256(
      convert_to(
        concat_ws('|', 'delete_draft_question', v_actor::text, p_question_id::text, trim(p_reason)),
        'utf8'
      )
    ),
    'hex'
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended('qb:delete_draft:' || v_actor::text || ':' || p_idempotency_key, 0)
  );

  SELECT * INTO v_existing
  FROM public.question_bank_rpc_idempotency
  WHERE rpc_name = 'delete_draft_question'
    AND actor_id = v_actor
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'idempotency key reused with different input';
    END IF;
    RETURN v_existing.result;
  END IF;

  SELECT * INTO v_q
  FROM public.questions
  WHERE id = p_question_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question not found';
  END IF;

  IF v_q.current_published_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'cannot delete question with a published pointer';
  END IF;

  PERFORM 1
  FROM public.question_revisions
  WHERE question_id = p_question_id
  FOR UPDATE;

  SELECT count(*),
         count(*) FILTER (
           WHERE status <> 'DRAFT'
         )
  INTO v_rev_count, v_non_draft
  FROM public.question_revisions
  WHERE question_id = p_question_id;

  IF v_non_draft > 0 THEN
    RAISE EXCEPTION
      'cannot delete question: non-DRAFT revisions exist (READY_FOR_REVIEW/APPROVED/PUBLISHED/SUPERSEDED/REJECTED)';
  END IF;

  SELECT
    (SELECT count(*) FROM public.assessment_questions aq WHERE aq.question_id = p_question_id)
    + (SELECT count(*) FROM public.exam_template_questions etq WHERE etq.question_id = p_question_id)
    + (SELECT count(*) FROM public.exam_session_questions esq WHERE esq.logical_question_id = p_question_id)
    + (SELECT count(*) FROM public.practice_attempt_questions paq WHERE paq.logical_question_id = p_question_id)
    + (
        SELECT count(*)
        FROM public.exam_session_answers esa
        WHERE esa.question_id = p_question_id
           OR esa.question_revision_id IN (
                SELECT id FROM public.question_revisions WHERE question_id = p_question_id
              )
      )
    + (
        SELECT count(*)
        FROM public.practice_attempt_responses par
        WHERE par.practice_attempt_question_id IN (
          SELECT paq.id
          FROM public.practice_attempt_questions paq
          WHERE paq.logical_question_id = p_question_id
        )
      )
    + (
        SELECT count(*)
        FROM public.question_response_reviews qrr
        WHERE qrr.exam_answer_id IN (
              SELECT esa.id FROM public.exam_session_answers esa WHERE esa.question_id = p_question_id
            )
           OR qrr.practice_response_id IN (
              SELECT par.id
              FROM public.practice_attempt_responses par
              JOIN public.practice_attempt_questions paq ON paq.id = par.practice_attempt_question_id
              WHERE paq.logical_question_id = p_question_id
            )
      )
  INTO v_usage;

  IF v_usage > 0 THEN
    RAISE EXCEPTION 'cannot delete question: historical or operational usage exists';
  END IF;

  PERFORM public.write_audit_log(
    'DRAFT_QUESTION_DELETED',
    'question',
    p_question_id,
    jsonb_build_object(
      'question_id', p_question_id,
      'code', v_q.code,
      'actor_id', v_actor,
      'reason', p_reason,
      'revision_count', v_rev_count,
      'idempotency_key', p_idempotency_key,
      'deleted_at', now()
    )
  );

  DELETE FROM public.question_revisions
  WHERE question_id = p_question_id
    AND status = 'DRAFT';

  DELETE FROM public.questions
  WHERE id = p_question_id;

  v_result := jsonb_build_object(
    'success', true,
    'question_id', p_question_id,
    'revision_count', v_rev_count
  );

  INSERT INTO public.question_bank_rpc_idempotency (
    rpc_name, actor_id, idempotency_key, request_fingerprint, result
  ) VALUES (
    'delete_draft_question', v_actor, p_idempotency_key, v_fingerprint, v_result
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_draft_question(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_draft_question(uuid, text, text) TO authenticated;

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