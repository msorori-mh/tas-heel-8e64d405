-- QB-01 PART 3/7
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
  'Internal capability probe. P0: only active GLOBAL grants are effective. Not granted to client roles.';

-- Client-facing self-only helper (cannot probe arbitrary user_id).
CREATE OR REPLACE FUNCTION public.qb_i_have_capability(p_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.qb_has_capability(auth.uid(), p_capability);
$$;

CREATE OR REPLACE FUNCTION public.can_edit_question_bank(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN p_user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE public.qb_has_capability(p_user_id, 'EDIT_QUESTION_BANK')
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_review_question_content(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN p_user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE public.qb_has_capability(p_user_id, 'REVIEW_QUESTION_CONTENT')
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_publish_question_revision(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN p_user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE public.qb_has_capability(p_user_id, 'PUBLISH_QUESTION_REVISION')
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_grade_manual_response(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN p_user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE public.qb_has_capability(p_user_id, 'GRADE_MANUAL_RESPONSE')
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_hidden_solutions(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN p_user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE public.qb_has_capability(p_user_id, 'READ_HIDDEN_SOLUTIONS')
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_delete_draft_question(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    WHEN p_user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE public.qb_has_capability(p_user_id, 'DELETE_DRAFT_QUESTION')
  END;
$$;

REVOKE ALL ON FUNCTION public.qb_has_capability(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qb_has_capability(uuid, text) FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.qb_i_have_capability(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_question_bank(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_review_question_content(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_publish_question_revision(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_grade_manual_response(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_hidden_solutions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_delete_draft_question(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.qb_i_have_capability(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_question_bank(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_review_question_content(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_publish_question_revision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_grade_manual_response(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_hidden_solutions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_draft_question(uuid) TO authenticated;

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

  PERFORM public._qb_assert_revision_payload_hash(
    p_revision_id, v_revision.payload_hash, v_revision.payload_hash_version
  );

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