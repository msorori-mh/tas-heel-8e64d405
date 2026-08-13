-- QB-01 PART 4/7
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

  IF p_user_id = v_actor THEN
    RAISE EXCEPTION 'self-grant is not allowed';
  END IF;

  IF p_capability NOT IN (
    'EDIT_QUESTION_BANK',
    'REVIEW_QUESTION_CONTENT',
    'PUBLISH_QUESTION_REVISION',
    'GRADE_MANUAL_RESPONSE',
    'READ_HIDDEN_SOLUTIONS',
    'DELETE_DRAFT_QUESTION'
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