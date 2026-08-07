-- ============================================================================
-- Migration: Content HTML Lifecycle Contracts
-- Created At: 2026-08-07
-- Scoped Objective: Atomic SECURITY DEFINER RPCs for trusted HTML resource
--                   lifecycle transitions (submit, approve, reject, unpublish,
--                   publish, rollback). No UI or storage pipeline redesign.
-- Rules: Additive only; fail-closed; explicit auth/state/hash guards;
--        audit events inside the same transaction.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Ensure lesson_resources has updated_at for atomic lifecycle transitions
-- ----------------------------------------------------------------------------
ALTER TABLE public.lesson_resources
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- Helper: assert caller is admin (or service_role)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._assert_html_admin_caller()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('role', true) IN ('service_role', 'postgres') OR auth.role() = 'service_role' THEN
    RETURN;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated caller cannot perform admin lifecycle operations' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required for lifecycle operation' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- Helper: assert caller is content staff (content_manager or admin or service_role)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._assert_html_content_staff_caller()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('role', true) IN ('service_role', 'postgres') OR auth.role() = 'service_role' THEN
    RETURN;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated caller cannot perform content staff lifecycle operations' USING ERRCODE = '42501';
  END IF;
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'content_manager') THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'Content manager or admin role required for lifecycle operation' USING ERRCODE = '42501';
END;
$$;

-- ----------------------------------------------------------------------------
-- 0.1 Re-create promotion binding helper with lock_version for CAS publication
--     This is a non-breaking additive change to the foundation helper; the
--     extra column is ignored by existing callers and consumed by the atomic
--     publication contract below.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.resolve_promotion_binding(uuid, uuid);

CREATE OR REPLACE FUNCTION public.resolve_promotion_binding(
  p_upload_session_id uuid DEFAULT NULL,
  p_resource_version_id uuid DEFAULT NULL
)
RETURNS TABLE (
  resource_id uuid,
  version_id uuid,
  upload_session_id uuid,
  staging_path text,
  expected_hash text,
  resource_code text,
  version_number integer,
  published_target_path text,
  valid_validation_id uuid,
  lock_version integer
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_session record;
  v_version record;
  v_resource record;
  v_validation record;
BEGIN
  IF NOT public.is_content_feature_enabled('html_content_publish') THEN
    RAISE EXCEPTION 'Feature html_content_publish is disabled' USING ERRCODE = '42501';
  END IF;

  IF (p_upload_session_id IS NULL AND p_resource_version_id IS NULL) OR
     (p_upload_session_id IS NOT NULL AND p_resource_version_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Must provide exactly one of p_upload_session_id or p_resource_version_id' USING ERRCODE = '22000';
  END IF;

  IF p_upload_session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public.lesson_resource_upload_sessions s WHERE s.id = p_upload_session_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Upload session % not found', p_upload_session_id USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_validation FROM public.content_package_validations cpv
    WHERE cpv.upload_session_id = v_session.id
      AND cpv.is_valid = true
      AND cpv.valid_until > now()
      AND cpv.package_hash = v_session.expected_package_hash
      AND cpv.storage_object_path = v_session.staging_path
    ORDER BY cpv.created_at DESC LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No valid active validation found for upload session %', p_upload_session_id USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_version FROM public.lesson_resource_versions v WHERE v.id = v_validation.resource_version_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Resource version % bound to validation not found', v_validation.resource_version_id USING ERRCODE = 'P0002';
    END IF;
  ELSE
    SELECT * INTO v_version FROM public.lesson_resource_versions v WHERE v.id = p_resource_version_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Resource version % not found', p_resource_version_id USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_validation FROM public.content_package_validations cpv
    WHERE cpv.resource_version_id = v_version.id
      AND cpv.is_valid = true
      AND cpv.valid_until > now()
      AND cpv.package_hash = v_version.content_sha256
    ORDER BY cpv.created_at DESC LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No valid active validation found for resource version %', p_resource_version_id USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_session FROM public.lesson_resource_upload_sessions s WHERE s.id = v_validation.upload_session_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Upload session % bound to validation not found', v_validation.upload_session_id USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF v_session.expires_at <= now() OR v_session.status = 'expired' THEN
    RAISE EXCEPTION 'Upload session % is expired', v_session.id USING ERRCODE = '22000';
  END IF;

  IF v_session.resource_id <> v_version.resource_id THEN
    RAISE EXCEPTION 'Cross-resource promotion binding denied' USING ERRCODE = '42000';
  END IF;

  SELECT * INTO v_resource FROM public.lesson_resources WHERE id = v_version.resource_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resource % not found', v_version.resource_id USING ERRCODE = 'P0002';
  END IF;

  IF v_resource.lifecycle_status NOT IN ('approved', 'published') THEN
    RAISE EXCEPTION 'Resource status % is not eligible for promotion', v_resource.lifecycle_status USING ERRCODE = '42000';
  END IF;

  IF v_resource.approved_version_id IS NULL OR v_resource.approved_version_id <> v_version.id THEN
    RAISE EXCEPTION 'Resource approved_version_id does not match target version' USING ERRCODE = '42000';
  END IF;

  IF v_version.immutable_at IS NULL THEN
    RAISE EXCEPTION 'Resource version % is not immutable', v_version.id USING ERRCODE = '42000';
  END IF;

  IF v_session.expected_package_hash <> v_version.content_sha256 THEN
    RAISE EXCEPTION 'Package hash mismatch between upload session and resource version' USING ERRCODE = '42000';
  END IF;

  RETURN QUERY SELECT
    v_resource.id AS resource_id,
    v_version.id AS version_id,
    v_session.id AS upload_session_id,
    v_session.staging_path AS staging_path,
    v_version.content_sha256 AS expected_hash,
    COALESCE(v_session.resource_code, v_resource.id::text) AS resource_code,
    v_version.version_number AS version_number,
    'published/' || v_resource.id::text || '/' || v_version.version_number::text AS published_target_path,
    v_validation.id AS valid_validation_id,
    v_resource.lock_version AS lock_version;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. Submit resource for review (draft -> in_review)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_resource_for_review(
  p_resource_id uuid,
  p_expected_lock_version integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_res record;
  v_ver record;
  v_val record;
  v_session record;
BEGIN
  PERFORM public._assert_html_content_staff_caller();

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resource % not found', p_resource_id USING ERRCODE = 'P0002';
  END IF;

  IF v_res.lifecycle_status <> 'draft' THEN
    RAISE EXCEPTION 'Resource % status % is not draft', p_resource_id, v_res.lifecycle_status USING ERRCODE = '42000';
  END IF;

  IF v_res.current_draft_version_id IS NULL THEN
    RAISE EXCEPTION 'Resource % has no current draft version', p_resource_id USING ERRCODE = '42000';
  END IF;

  IF p_expected_lock_version IS NOT NULL AND v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Resource % lock version mismatch: expected %, actual %', p_resource_id, p_expected_lock_version, v_res.lock_version USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_ver
  FROM public.lesson_resource_versions
  WHERE id = v_res.current_draft_version_id AND resource_id = p_resource_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft version % does not belong to resource %', v_res.current_draft_version_id, p_resource_id USING ERRCODE = '42000';
  END IF;

  SELECT v.*, s.status AS session_status, s.expires_at AS session_expires_at, s.staging_path AS session_staging_path
  INTO v_val
  FROM public.content_package_validations v
  JOIN public.lesson_resource_upload_sessions s ON s.id = v.upload_session_id
  WHERE v.resource_version_id = v_ver.id
    AND v.resource_id = p_resource_id
    AND v.is_valid = true
    AND v.valid_until > now()
    AND v.package_hash = v_ver.content_sha256
    AND v.package_hash = s.expected_package_hash
    AND v.storage_object_path = s.staging_path
  ORDER BY v.validated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No valid, non-stale server validation found for resource % version %', p_resource_id, v_ver.id USING ERRCODE = '42000';
  END IF;

  IF v_val.findings IS NOT NULL AND v_val.findings @> '[{"severity": "blocking"}]'::jsonb THEN
    RAISE EXCEPTION 'Resource % version % has blocking findings and cannot be submitted', p_resource_id, v_ver.id USING ERRCODE = '42000';
  END IF;

  IF v_val.session_status = 'expired' OR v_val.session_expires_at <= now() THEN
    RAISE EXCEPTION 'Upload session % is expired', v_val.upload_session_id USING ERRCODE = '42000';
  END IF;

  UPDATE public.lesson_resources
  SET lifecycle_status = 'in_review',
      lock_version = lock_version + 1,
      updated_at = now()
  WHERE id = p_resource_id
    AND lifecycle_status = 'draft'
    AND current_draft_version_id = v_ver.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Concurrent modification detected for resource %', p_resource_id USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.lesson_resource_events (resource_id, resource_version_id, actor_id, event_type, payload)
  VALUES (p_resource_id, v_ver.id, auth.uid(), 'submit', jsonb_build_object('validation_id', v_val.id, 'upload_session_id', v_val.upload_session_id));
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Approve resource (in_review -> approved)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_resource(
  p_resource_id uuid,
  p_version_id uuid,
  p_expected_lock_version integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_res record;
  v_ver record;
  v_val record;
BEGIN
  PERFORM public._assert_html_admin_caller();

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resource % not found', p_resource_id USING ERRCODE = 'P0002';
  END IF;

  IF v_res.lifecycle_status <> 'in_review' THEN
    RAISE EXCEPTION 'Resource % status % is not in_review', p_resource_id, v_res.lifecycle_status USING ERRCODE = '42000';
  END IF;

  IF v_res.current_draft_version_id IS NULL OR v_res.current_draft_version_id <> p_version_id THEN
    RAISE EXCEPTION 'Resource % current_draft_version_id does not match requested version %', p_resource_id, p_version_id USING ERRCODE = '42000';
  END IF;

  IF p_expected_lock_version IS NOT NULL AND v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Resource % lock version mismatch: expected %, actual %', p_resource_id, p_expected_lock_version, v_res.lock_version USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_ver
  FROM public.lesson_resource_versions
  WHERE id = p_version_id AND resource_id = p_resource_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version % does not belong to resource %', p_version_id, p_resource_id USING ERRCODE = '42000';
  END IF;

  SELECT v.* INTO v_val
  FROM public.content_package_validations v
  JOIN public.lesson_resource_upload_sessions s ON s.id = v.upload_session_id
  WHERE v.resource_version_id = v_ver.id
    AND v.resource_id = p_resource_id
    AND v.is_valid = true
    AND v.valid_until > now()
    AND v.package_hash = v_ver.content_sha256
    AND v.package_hash = s.expected_package_hash
    AND v.storage_object_path = s.staging_path
  ORDER BY v.validated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No valid, non-stale server validation found for resource % version %', p_resource_id, p_version_id USING ERRCODE = '42000';
  END IF;

  IF v_val.findings IS NOT NULL AND v_val.findings @> '[{"severity": "blocking"}]'::jsonb THEN
    RAISE EXCEPTION 'Resource % version % has blocking findings and cannot be approved', p_resource_id, p_version_id USING ERRCODE = '42000';
  END IF;

  UPDATE public.lesson_resources
  SET lifecycle_status = 'approved',
      approved_version_id = v_ver.id,
      lock_version = lock_version + 1,
      updated_at = now()
  WHERE id = p_resource_id
    AND lifecycle_status = 'in_review'
    AND current_draft_version_id = v_ver.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Concurrent modification detected for resource %', p_resource_id USING ERRCODE = '40001';
  END IF;

  UPDATE public.lesson_resource_versions
  SET immutable_at = COALESCE(immutable_at, now()),
      immutable_reason = COALESCE(immutable_reason, 'approved')
  WHERE id = v_ver.id;

  INSERT INTO public.lesson_resource_reviews (resource_id, resource_version_id, reviewer_id, decision, reason)
  VALUES (p_resource_id, v_ver.id, auth.uid(), 'approved', NULL);

  INSERT INTO public.lesson_resource_events (resource_id, resource_version_id, actor_id, event_type, payload)
  VALUES (p_resource_id, v_ver.id, auth.uid(), 'approve', jsonb_build_object('validation_id', v_val.id));
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Reject resource (in_review -> rejected)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_resource(
  p_resource_id uuid,
  p_version_id uuid,
  p_reason text,
  p_expected_lock_version integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_res record;
  v_ver record;
BEGIN
  PERFORM public._assert_html_admin_caller();

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Rejection reason is required' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resource % not found', p_resource_id USING ERRCODE = 'P0002';
  END IF;

  IF v_res.lifecycle_status <> 'in_review' THEN
    RAISE EXCEPTION 'Resource % status % is not in_review', p_resource_id, v_res.lifecycle_status USING ERRCODE = '42000';
  END IF;

  IF v_res.current_draft_version_id IS NULL OR v_res.current_draft_version_id <> p_version_id THEN
    RAISE EXCEPTION 'Resource % current_draft_version_id does not match requested version %', p_resource_id, p_version_id USING ERRCODE = '42000';
  END IF;

  IF p_expected_lock_version IS NOT NULL AND v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Resource % lock version mismatch: expected %, actual %', p_resource_id, p_expected_lock_version, v_res.lock_version USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_ver
  FROM public.lesson_resource_versions
  WHERE id = p_version_id AND resource_id = p_resource_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version % does not belong to resource %', p_version_id, p_resource_id USING ERRCODE = '42000';
  END IF;

  UPDATE public.lesson_resources
  SET lifecycle_status = 'rejected',
      lock_version = lock_version + 1,
      updated_at = now()
  WHERE id = p_resource_id
    AND lifecycle_status = 'in_review'
    AND current_draft_version_id = v_ver.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Concurrent modification detected for resource %', p_resource_id USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.lesson_resource_reviews (resource_id, resource_version_id, reviewer_id, decision, reason)
  VALUES (p_resource_id, v_ver.id, auth.uid(), 'rejected', p_reason);

  INSERT INTO public.lesson_resource_events (resource_id, resource_version_id, actor_id, event_type, payload)
  VALUES (p_resource_id, v_ver.id, auth.uid(), 'reject', jsonb_build_object('reason', p_reason));
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Unpublish resource (published -> approved)
--    Preserves history; does not delete published storage bytes.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unpublish_resource(
  p_resource_id uuid,
  p_expected_lock_version integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_res record;
  v_prev_version_id uuid;
BEGIN
  PERFORM public._assert_html_admin_caller();

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resource % not found', p_resource_id USING ERRCODE = 'P0002';
  END IF;

  IF v_res.lifecycle_status <> 'published' OR v_res.published_version_id IS NULL THEN
    RAISE EXCEPTION 'Resource % is not published', p_resource_id USING ERRCODE = '42000';
  END IF;

  IF p_expected_lock_version IS NOT NULL AND v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Resource % lock version mismatch: expected %, actual %', p_resource_id, p_expected_lock_version, v_res.lock_version USING ERRCODE = '40001';
  END IF;

  v_prev_version_id := v_res.published_version_id;

  UPDATE public.lesson_resources
  SET lifecycle_status = 'approved',
      published_version_id = NULL,
      lock_version = lock_version + 1,
      updated_at = now()
  WHERE id = p_resource_id
    AND lifecycle_status = 'published'
    AND published_version_id = v_prev_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Concurrent modification detected for resource %', p_resource_id USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.lesson_resource_events (resource_id, resource_version_id, actor_id, event_type, payload)
  VALUES (p_resource_id, v_prev_version_id, auth.uid(), 'unpublish', jsonb_build_object('previous_published_version_id', v_prev_version_id));
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Atomic successful resource publication
--    Service-role only. Updates the publication pointer only when a trusted
--    storage operation proves that the exact immutable version bytes were
--    promoted to the canonical published path.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_successful_resource_publication(
  p_resource_id uuid,
  p_version_id uuid,
  p_storage_operation_id uuid,
  p_upload_session_id uuid DEFAULT NULL,
  p_expected_lock_version integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_res record;
  v_ver record;
  v_op record;
  v_expected_path text;
BEGIN
  -- Strict server/service-role gate
  IF current_setting('role', true) NOT IN ('service_role', 'postgres') AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only service_role can record successful resource publication' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resource % not found', p_resource_id USING ERRCODE = 'P0002';
  END IF;

  IF v_res.lifecycle_status <> 'approved' THEN
    RAISE EXCEPTION 'Resource % status % is not approved', p_resource_id, v_res.lifecycle_status USING ERRCODE = '42000';
  END IF;

  IF v_res.approved_version_id IS NULL OR v_res.approved_version_id <> p_version_id THEN
    RAISE EXCEPTION 'Resource approved_version_id does not match requested version' USING ERRCODE = '42000';
  END IF;

  IF p_expected_lock_version IS NOT NULL AND v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Resource % lock version mismatch: expected %, actual %', p_resource_id, p_expected_lock_version, v_res.lock_version USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_ver
  FROM public.lesson_resource_versions
  WHERE id = p_version_id AND resource_id = p_resource_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version % does not belong to resource %', p_version_id, p_resource_id USING ERRCODE = '42000';
  END IF;

  IF v_ver.immutable_at IS NULL THEN
    RAISE EXCEPTION 'Resource version % is not immutable', p_version_id USING ERRCODE = '42000';
  END IF;

  v_expected_path := 'published/' || p_resource_id::text || '/' || v_ver.version_number::text;

  SELECT * INTO v_op FROM public.storage_operations WHERE id = p_storage_operation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Storage operation % not found', p_storage_operation_id USING ERRCODE = 'P0002';
  END IF;

  IF v_op.resource_id <> p_resource_id THEN
    RAISE EXCEPTION 'Storage operation % belongs to a different resource', p_storage_operation_id USING ERRCODE = '42000';
  END IF;

  IF v_op.resource_version_id <> p_version_id THEN
    RAISE EXCEPTION 'Storage operation % belongs to a different version', p_storage_operation_id USING ERRCODE = '42000';
  END IF;

  IF p_upload_session_id IS NOT NULL AND v_op.upload_session_id IS DISTINCT FROM p_upload_session_id THEN
    RAISE EXCEPTION 'Storage operation % does not belong to the requested upload session', p_storage_operation_id USING ERRCODE = '42000';
  END IF;

  IF v_op.operation_type <> 'promote_published' THEN
    RAISE EXCEPTION 'Storage operation % is not a promote_published operation', p_storage_operation_id USING ERRCODE = '42000';
  END IF;

  IF v_op.status <> 'promoted' THEN
    RAISE EXCEPTION 'Storage operation % status % is not promoted', p_storage_operation_id, v_op.status USING ERRCODE = '42000';
  END IF;

  IF v_op.target_path IS NULL OR v_op.target_path = '' OR v_op.target_path <> v_expected_path THEN
    RAISE EXCEPTION 'Storage operation % target_path % does not match expected published path %', p_storage_operation_id, v_op.target_path, v_expected_path USING ERRCODE = '42000';
  END IF;

  IF v_op.expected_hash IS NULL OR v_op.expected_hash <> v_ver.content_sha256 THEN
    RAISE EXCEPTION 'Storage operation % expected_hash does not match version content_sha256', p_storage_operation_id USING ERRCODE = '42000';
  END IF;

  UPDATE public.lesson_resources
  SET lifecycle_status = 'published',
      published_version_id = p_version_id,
      lock_version = lock_version + 1,
      updated_at = now()
  WHERE id = p_resource_id
    AND lifecycle_status = 'approved'
    AND approved_version_id = p_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Concurrent modification detected for resource %', p_resource_id USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.lesson_resource_events (resource_id, resource_version_id, actor_id, event_type, payload)
  VALUES (p_resource_id, p_version_id, auth.uid(), 'publish', jsonb_build_object(
    'storage_operation_id', p_storage_operation_id,
    'upload_session_id', v_op.upload_session_id,
    'published_path', v_expected_path,
    'previous_published_version_id', v_res.published_version_id
  ));
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Rollback resource to a previously-published version
--    Requires the target version to be immutable, historically approved, and
--    to have a trusted published storage binding with matching canonical hash
--    and path. Refuses client paths/hashes and pointer-only rollbacks.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rollback_resource(
  p_resource_id uuid,
  p_target_version_id uuid,
  p_expected_lock_version integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_res record;
  v_target record;
  v_expected_path text;
  v_op record;
BEGIN
  PERFORM public._assert_html_admin_caller();

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resource % not found', p_resource_id USING ERRCODE = 'P0002';
  END IF;

  IF v_res.lifecycle_status <> 'published' THEN
    RAISE EXCEPTION 'Resource % is not published; rollback only applies to published resources', p_resource_id USING ERRCODE = '42000';
  END IF;

  IF p_expected_lock_version IS NOT NULL AND v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Resource % lock version mismatch: expected %, actual %', p_resource_id, p_expected_lock_version, v_res.lock_version USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_target
  FROM public.lesson_resource_versions
  WHERE id = p_target_version_id AND resource_id = p_resource_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target version % does not belong to resource %', p_target_version_id, p_resource_id USING ERRCODE = '42000';
  END IF;

  IF v_target.immutable_at IS NULL THEN
    RAISE EXCEPTION 'Target version % is not immutable and cannot be rolled back to', p_target_version_id USING ERRCODE = '42000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.lesson_resource_reviews
    WHERE resource_id = p_resource_id
      AND resource_version_id = p_target_version_id
      AND decision = 'approved'
  ) THEN
    RAISE EXCEPTION 'Target version % was never approved for resource %', p_target_version_id, p_resource_id USING ERRCODE = '42000';
  END IF;

  v_expected_path := 'published/' || p_resource_id::text || '/' || v_target.version_number::text;

  -- Trusted storage proof: exact resource, exact version, successful promotion,
  -- canonical path, and hash matching the immutable version bytes.
  SELECT * INTO v_op
  FROM public.storage_operations
  WHERE resource_id = p_resource_id
    AND resource_version_id = p_target_version_id
    AND operation_type = 'promote_published'
    AND status IN ('promoted', 'cleaned')
    AND target_path = v_expected_path
    AND expected_hash = v_target.content_sha256
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target version % has no trusted published storage binding for resource %', p_target_version_id, p_resource_id USING ERRCODE = '42000';
  END IF;

  UPDATE public.lesson_resources
  SET published_version_id = v_target.id,
      lifecycle_status = 'published',
      lock_version = lock_version + 1,
      updated_at = now()
  WHERE id = p_resource_id
    AND lifecycle_status = 'published';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Concurrent modification detected for resource %', p_resource_id USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.lesson_resource_events (resource_id, resource_version_id, actor_id, event_type, payload)
  VALUES (p_resource_id, v_target.id, auth.uid(), 'rollback', jsonb_build_object(
    'previous_published_version_id', v_res.published_version_id,
    'target_version_id', v_target.id,
    'published_path', v_expected_path,
    'storage_operation_id', v_op.id
  ));
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Explicit grants / revokes for new lifecycle functions
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._assert_html_admin_caller() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._assert_html_content_staff_caller() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_resource_for_review(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_resource(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_resource(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unpublish_resource(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_successful_resource_publication(uuid, uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rollback_resource(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_promotion_binding(uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._assert_html_admin_caller() TO service_role;
GRANT EXECUTE ON FUNCTION public._assert_html_content_staff_caller() TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_resource_for_review(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_resource(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_resource(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.unpublish_resource(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_successful_resource_publication(uuid, uuid, uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rollback_resource(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_promotion_binding(uuid, uuid) TO service_role;
