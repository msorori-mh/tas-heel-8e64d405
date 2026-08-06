-- ============================================================================
-- Migration: Content HTML Database & RLS Foundation
-- Created At: 2026-08-06
-- Scoped Objective: Trusted Database + RLS Foundation for Interactive HTML Resources
-- Rules: Additive migration, fail-closed RLS, composite same-resource integrity,
--        append-only audit/reviews, strict state machine for storage ops.
-- ============================================================================

-- 1. Extend lesson_resource_type ENUM safely if needed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'lesson_resource_type' AND e.enumlabel = 'html'
  ) THEN
    ALTER TYPE public.lesson_resource_type ADD VALUE 'html';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'lesson_resource_type' AND e.enumlabel = 'interactive_html'
  ) THEN
    ALTER TYPE public.lesson_resource_type ADD VALUE 'interactive_html';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Adapt lesson_resources table with lifecycle and version pointer columns
ALTER TABLE public.lesson_resources
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'published'
    CHECK (lifecycle_status IN ('draft', 'in_review', 'approved', 'published', 'rejected', 'archived')),
  ADD COLUMN IF NOT EXISTS current_draft_version_id UUID,
  ADD COLUMN IF NOT EXISTS approved_version_id UUID,
  ADD COLUMN IF NOT EXISTS published_version_id UUID,
  ADD COLUMN IF NOT EXISTS lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version >= 1);

-- 3. Table: lesson_resource_versions
CREATE TABLE IF NOT EXISTS public.lesson_resource_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.lesson_resources(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  content_sha256 TEXT NOT NULL,
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  immutable_at TIMESTAMPTZ,
  immutable_reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lesson_resource_versions_resource_version_uniq UNIQUE (resource_id, version_number),
  CONSTRAINT lesson_resource_versions_resource_sha256_uniq UNIQUE (resource_id, content_sha256),
  CONSTRAINT lesson_resource_versions_id_resource_uniq UNIQUE (id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_resource_versions_resource ON public.lesson_resource_versions(resource_id);

-- 4. Table: lesson_resource_files
CREATE TABLE IF NOT EXISTS public.lesson_resource_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL,
  resource_id UUID NOT NULL,
  relative_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  content_sha256 TEXT NOT NULL,
  storage_object_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lesson_resource_files_version_path_uniq UNIQUE (version_id, relative_path),
  CONSTRAINT lesson_resource_files_composite_fk FOREIGN KEY (resource_id, version_id)
    REFERENCES public.lesson_resource_versions(resource_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_lesson_resource_files_version ON public.lesson_resource_files(version_id);

-- 5. Add Same-Resource Foreign Key constraints on lesson_resources
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'lesson_resources_draft_version_fk'
  ) THEN
    ALTER TABLE public.lesson_resources
      ADD CONSTRAINT lesson_resources_draft_version_fk
      FOREIGN KEY (id, current_draft_version_id)
      REFERENCES public.lesson_resource_versions(resource_id, id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'lesson_resources_approved_version_fk'
  ) THEN
    ALTER TABLE public.lesson_resources
      ADD CONSTRAINT lesson_resources_approved_version_fk
      FOREIGN KEY (id, approved_version_id)
      REFERENCES public.lesson_resource_versions(resource_id, id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'lesson_resources_published_version_fk'
  ) THEN
    ALTER TABLE public.lesson_resources
      ADD CONSTRAINT lesson_resources_published_version_fk
      FOREIGN KEY (id, published_version_id)
      REFERENCES public.lesson_resource_versions(resource_id, id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Automatic Immutability Setter Trigger on lesson_resources
CREATE OR REPLACE FUNCTION public.mark_version_immutable_on_resource_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.approved_version_id IS NOT NULL THEN
    UPDATE public.lesson_resource_versions
    SET immutable_at = COALESCE(immutable_at, now()),
        immutable_reason = COALESCE(immutable_reason, 'approved')
    WHERE id = NEW.approved_version_id AND immutable_at IS NULL;
  END IF;

  IF NEW.published_version_id IS NOT NULL THEN
    UPDATE public.lesson_resource_versions
    SET immutable_at = COALESCE(immutable_at, now()),
        immutable_reason = COALESCE(immutable_reason, 'published')
    WHERE id = NEW.published_version_id AND immutable_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_version_immutable ON public.lesson_resources;
CREATE TRIGGER trg_mark_version_immutable
  AFTER INSERT OR UPDATE OF approved_version_id, published_version_id ON public.lesson_resources
  FOR EACH ROW EXECUTE FUNCTION public.mark_version_immutable_on_resource_change();

-- 6. Table: content_import_batches
CREATE TABLE IF NOT EXISTS public.content_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'in_progress', 'completed', 'failed', 'cancelled')),
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 7. Path validation helper function
CREATE OR REPLACE FUNCTION public.validate_staging_path(p_path text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF p_path IS NULL OR p_path = '' THEN
    RAISE EXCEPTION 'Staging path cannot be empty' USING ERRCODE = '22000';
  END IF;
  IF NOT (p_path LIKE 'html-packages/staging/%') THEN
    RAISE EXCEPTION 'Staging path % does not start with canonical prefix html-packages/staging/', p_path USING ERRCODE = '22000';
  END IF;
  IF p_path LIKE '%..%' THEN
    RAISE EXCEPTION 'Staging path % contains illegal directory traversal ..', p_path USING ERRCODE = '22000';
  END IF;
  IF p_path LIKE '%\%' THEN
    RAISE EXCEPTION 'Staging path % contains illegal backslash', p_path USING ERRCODE = '22000';
  END IF;
  IF p_path LIKE '%//%' THEN
    RAISE EXCEPTION 'Staging path % contains illegal empty segment //', p_path USING ERRCODE = '22000';
  END IF;
  IF p_path ~ '^[a-zA-Z]:' OR p_path LIKE '/%' THEN
    RAISE EXCEPTION 'Staging path % is an absolute path', p_path USING ERRCODE = '22000';
  END IF;
  RETURN true;
END;
$$;

-- Table: lesson_resource_upload_sessions
CREATE TABLE IF NOT EXISTS public.lesson_resource_upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.content_import_batches(id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  resource_id UUID NOT NULL REFERENCES public.lesson_resources(id) ON DELETE RESTRICT,
  resource_code TEXT,
  staging_path TEXT NOT NULL UNIQUE,
  expected_package_hash TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'uploading', 'uploaded', 'validating', 'validated', 'expired', 'failed', 'finalized', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lesson_resource_upload_sessions_id_resource_uniq UNIQUE (id, resource_id)
);

-- Trigger: Upload session actor must match batch actor
CREATE OR REPLACE FUNCTION public.enforce_upload_session_actor_matches_batch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_batch_actor uuid;
BEGIN
  SELECT actor_id INTO v_batch_actor
  FROM public.content_import_batches
  WHERE id = NEW.batch_id;

  IF v_batch_actor IS NULL THEN
    RAISE EXCEPTION 'Import batch % not found', NEW.batch_id USING ERRCODE = '23503';
  END IF;

  IF NEW.actor_id <> v_batch_actor THEN
    RAISE EXCEPTION 'Upload session actor % must match import batch actor %', NEW.actor_id, v_batch_actor USING ERRCODE = '42000';
  END IF;

  PERFORM public.validate_staging_path(NEW.staging_path);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upload_session_actor_matches_batch ON public.lesson_resource_upload_sessions;
CREATE TRIGGER trg_upload_session_actor_matches_batch
  BEFORE INSERT OR UPDATE ON public.lesson_resource_upload_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_upload_session_actor_matches_batch();

-- Trigger: Upload sessions immutability of actor_id, staging_path, expected_package_hash
CREATE OR REPLACE FUNCTION public.enforce_upload_session_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.actor_id IS DISTINCT FROM NEW.actor_id THEN
    RAISE EXCEPTION 'actor_id is immutable on lesson_resource_upload_sessions' USING ERRCODE = '42000';
  END IF;
  IF OLD.staging_path IS DISTINCT FROM NEW.staging_path THEN
    RAISE EXCEPTION 'staging_path is immutable on lesson_resource_upload_sessions' USING ERRCODE = '42000';
  END IF;
  IF OLD.expected_package_hash IS DISTINCT FROM NEW.expected_package_hash THEN
    RAISE EXCEPTION 'expected_package_hash is immutable on lesson_resource_upload_sessions' USING ERRCODE = '42000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_upload_session_immutability ON public.lesson_resource_upload_sessions;
CREATE TRIGGER trg_upload_session_immutability
  BEFORE UPDATE ON public.lesson_resource_upload_sessions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_upload_session_immutability();

-- 8. Table: content_package_validations
CREATE TABLE IF NOT EXISTS public.content_package_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_session_id UUID NOT NULL,
  resource_id UUID NOT NULL,
  resource_version_id UUID NOT NULL,
  package_hash TEXT NOT NULL,
  scanner_version TEXT NOT NULL,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_valid BOOLEAN NOT NULL DEFAULT false,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ NOT NULL,
  storage_object_path TEXT NOT NULL,
  storage_object_version TEXT,
  created_by_server BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_package_validations_session_composite_fk
    FOREIGN KEY (upload_session_id, resource_id)
    REFERENCES public.lesson_resource_upload_sessions(id, resource_id) ON DELETE RESTRICT,
  CONSTRAINT content_package_validations_version_composite_fk
    FOREIGN KEY (resource_version_id, resource_id)
    REFERENCES public.lesson_resource_versions(id, resource_id) ON DELETE RESTRICT
);

-- 9. Table: lesson_resource_reviews (Append-only)
CREATE TABLE IF NOT EXISTS public.lesson_resource_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL,
  resource_version_id UUID NOT NULL,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lesson_resource_reviews_composite_fk FOREIGN KEY (resource_id, resource_version_id)
    REFERENCES public.lesson_resource_versions(resource_id, id) ON DELETE RESTRICT
);

-- 10. Table: lesson_resource_events (Append-only Audit)
CREATE TABLE IF NOT EXISTS public.lesson_resource_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID REFERENCES public.lesson_resources(id) ON DELETE RESTRICT,
  resource_version_id UUID REFERENCES public.lesson_resource_versions(id) ON DELETE RESTRICT,
  actor_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('create', 'upload_issued', 'upload_finalized', 'validation_passed', 'validation_failed', 'submit', 'approve', 'reject', 'publish', 'unpublish', 'rollback', 'cleanup', 'compensation')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only trigger for reviews and events
CREATE OR REPLACE FUNCTION public.enforce_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only. UPDATE and DELETE are prohibited.', TG_TABLE_NAME USING ERRCODE = '42000';
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_append_only ON public.lesson_resource_reviews;
CREATE TRIGGER trg_reviews_append_only
  BEFORE UPDATE OR DELETE ON public.lesson_resource_reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only();

DROP TRIGGER IF EXISTS trg_events_append_only ON public.lesson_resource_events;
CREATE TRIGGER trg_events_append_only
  BEFORE UPDATE OR DELETE ON public.lesson_resource_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only();

-- 11. Table: storage_operations
CREATE TABLE IF NOT EXISTS public.storage_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  resource_id UUID NOT NULL REFERENCES public.lesson_resources(id) ON DELETE RESTRICT,
  resource_version_id UUID NOT NULL REFERENCES public.lesson_resource_versions(id) ON DELETE RESTRICT,
  upload_session_id UUID REFERENCES public.lesson_resource_upload_sessions(id) ON DELETE RESTRICT,
  source_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  expected_hash TEXT,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('stage_upload', 'promote_published', 'cleanup_staging', 'cleanup_archived', 'rollback_promotion')),
  parent_operation_id UUID REFERENCES public.storage_operations(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'verified', 'promoted', 'cleanup_pending', 'cleaned', 'failed', 'compensated')),
  retry_number INTEGER NOT NULL DEFAULT 0 CHECK (retry_number >= 0),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  idempotency_key TEXT,
  failure_code TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT storage_operations_version_composite_fk
    FOREIGN KEY (resource_version_id, resource_id)
    REFERENCES public.lesson_resource_versions(id, resource_id) ON DELETE RESTRICT
);

-- Trigger on storage_operations:
-- 1) Prevent DELETE
-- 2) Identity immutability
-- 3) Strict state transitions
CREATE OR REPLACE FUNCTION public.enforce_storage_operation_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DELETE on storage_operations is strictly prohibited' USING ERRCODE = '42000';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Identity fields immutability
    IF OLD.actor_id IS DISTINCT FROM NEW.actor_id OR
       OLD.resource_id IS DISTINCT FROM NEW.resource_id OR
       OLD.resource_version_id IS DISTINCT FROM NEW.resource_version_id OR
       OLD.upload_session_id IS DISTINCT FROM NEW.upload_session_id OR
       OLD.source_path IS DISTINCT FROM NEW.source_path OR
       OLD.target_path IS DISTINCT FROM NEW.target_path OR
       OLD.expected_hash IS DISTINCT FROM NEW.expected_hash OR
       OLD.operation_type IS DISTINCT FROM NEW.operation_type OR
       OLD.parent_operation_id IS DISTINCT FROM NEW.parent_operation_id OR
       OLD.retry_number IS DISTINCT FROM NEW.retry_number OR
       OLD.attempt_count IS DISTINCT FROM NEW.attempt_count OR
       OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key OR
       OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'Identity fields on storage_operations are immutable' USING ERRCODE = '42000';
    END IF;

    -- Terminal states cannot be changed
    IF OLD.status IN ('cleaned', 'compensated') THEN
      RAISE EXCEPTION 'Status % is terminal and cannot be changed', OLD.status USING ERRCODE = '42000';
    END IF;

    -- Valid state transitions
    IF OLD.status = NEW.status THEN
      RETURN NEW;
    END IF;

    IF OLD.status = 'pending' AND NEW.status IN ('uploaded', 'failed') THEN
      -- Valid transition
    ELSIF OLD.status = 'uploaded' AND NEW.status IN ('verified', 'failed') THEN
      -- Valid transition
    ELSIF OLD.status = 'verified' AND NEW.status IN ('promoted', 'failed') THEN
      -- Valid transition
    ELSIF OLD.status = 'promoted' AND NEW.status IN ('cleanup_pending', 'failed') THEN
      -- Valid transition
    ELSIF OLD.status = 'cleanup_pending' AND NEW.status IN ('cleaned', 'failed') THEN
      -- Valid transition
    ELSIF OLD.status = 'failed' AND NEW.status IN ('compensated') THEN
      -- Valid transition
    ELSE
      RAISE EXCEPTION 'Invalid state transition from % to %', OLD.status, NEW.status USING ERRCODE = '22000';
    END IF;

    IF NEW.status IN ('cleaned', 'compensated') AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_storage_operations_rules ON public.storage_operations;
CREATE TRIGGER trg_storage_operations_rules
  BEFORE UPDATE OR DELETE ON public.storage_operations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_operation_rules();

-- Validate retry contract on INSERT into storage_operations
CREATE OR REPLACE FUNCTION public.enforce_storage_operation_retry_contract()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_parent record;
BEGIN
  IF NEW.parent_operation_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.storage_operations WHERE id = NEW.parent_operation_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent storage operation % not found', NEW.parent_operation_id USING ERRCODE = '23503';
    END IF;

    IF v_parent.status <> 'failed' THEN
      RAISE EXCEPTION 'Cannot retry storage operation % with parent status %, parent must be failed', v_parent.id, v_parent.status USING ERRCODE = '42000';
    END IF;

    IF v_parent.status IN ('cleaned', 'compensated') THEN
      RAISE EXCEPTION 'Cannot retry terminal parent storage operation %', v_parent.id USING ERRCODE = '42000';
    END IF;

    IF NEW.retry_number <> v_parent.retry_number + 1 THEN
      RAISE EXCEPTION 'Invalid retry_number %, must be parent retry_number + 1 (%)', NEW.retry_number, v_parent.retry_number + 1 USING ERRCODE = '22000';
    END IF;

    IF NEW.attempt_count <> v_parent.attempt_count + 1 THEN
      RAISE EXCEPTION 'Invalid attempt_count %, must be parent attempt_count + 1 (%)', NEW.attempt_count, v_parent.attempt_count + 1 USING ERRCODE = '22000';
    END IF;

    IF NEW.actor_id IS DISTINCT FROM v_parent.actor_id OR
       NEW.resource_id IS DISTINCT FROM v_parent.resource_id OR
       NEW.resource_version_id IS DISTINCT FROM v_parent.resource_version_id OR
       NEW.upload_session_id IS DISTINCT FROM v_parent.upload_session_id OR
       NEW.source_path IS DISTINCT FROM v_parent.source_path OR
       NEW.target_path IS DISTINCT FROM v_parent.target_path OR
       NEW.operation_type IS DISTINCT FROM v_parent.operation_type OR
       NEW.expected_hash IS DISTINCT FROM v_parent.expected_hash THEN
      RAISE EXCEPTION 'Retry storage operation identity fields must match parent operation' USING ERRCODE = '42000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_storage_operations_retry ON public.storage_operations;
CREATE TRIGGER trg_storage_operations_retry
  BEFORE INSERT ON public.storage_operations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_operation_retry_contract();

-- 12. Table: idempotency_ledger
CREATE TABLE IF NOT EXISTS public.idempotency_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'succeeded', 'failed')),
  result JSONB,
  error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT idempotency_ledger_actor_op_key_uniq UNIQUE (actor_id, operation, idempotency_key)
);

-- Trigger: Prevent direct UPDATE/DELETE on idempotency_ledger except via trusted functions
CREATE OR REPLACE FUNCTION public.enforce_idempotency_ledger_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DELETE on idempotency_ledger is prohibited' USING ERRCODE = '42000';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.actor_id IS DISTINCT FROM NEW.actor_id OR
       OLD.operation IS DISTINCT FROM NEW.operation OR
       OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key OR
       OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'Identity fields on idempotency_ledger are immutable' USING ERRCODE = '42000';
    END IF;

    IF OLD.status IN ('succeeded', 'failed') THEN
      RAISE EXCEPTION 'Idempotency ledger entry is in terminal state % and cannot be modified', OLD.status USING ERRCODE = '42000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_idempotency_ledger_immutability ON public.idempotency_ledger;
CREATE TRIGGER trg_idempotency_ledger_immutability
  BEFORE UPDATE OR DELETE ON public.idempotency_ledger
  FOR EACH ROW EXECUTE FUNCTION public.enforce_idempotency_ledger_immutability();

-- Atomic Claim Helper Function for Idempotency
CREATE OR REPLACE FUNCTION public.claim_idempotency_key(
  p_operation text,
  p_key text
) RETURNS TABLE (
  ledger_id uuid,
  claimed boolean,
  current_status text,
  previous_result jsonb,
  previous_error jsonb
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_id uuid;
  v_id uuid;
  v_existing record;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    IF auth.role() IN ('service_role', 'postgres') OR current_user IN ('service_role', 'postgres') THEN
      v_actor_id := '00000000-0000-0000-0000-000000000000'::uuid;
    ELSE
      RAISE EXCEPTION 'Unauthenticated actor cannot claim idempotency key' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Atomic claim using INSERT ... ON CONFLICT ... DO NOTHING RETURNING id
  INSERT INTO public.idempotency_ledger (actor_id, operation, idempotency_key, status)
  VALUES (v_actor_id, p_operation, p_key, 'in_progress')
  ON CONFLICT (actor_id, operation, idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, true, 'in_progress'::text, NULL::jsonb, NULL::jsonb;
    RETURN;
  END IF;

  -- Conflict occurred: fetch existing claim state
  SELECT * INTO v_existing FROM public.idempotency_ledger
  WHERE actor_id = v_actor_id AND operation = p_operation AND idempotency_key = p_key;

  RETURN QUERY SELECT v_existing.id, false, v_existing.status, v_existing.result, v_existing.error;
END;
$$;

-- Complete Idempotency Helper Function
CREATE OR REPLACE FUNCTION public.complete_idempotency_key(
  p_ledger_id uuid,
  p_result jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.idempotency_ledger
  SET status = 'succeeded',
      result = p_result,
      completed_at = now()
  WHERE id = p_ledger_id AND status = 'in_progress';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Idempotency ledger entry % not found or not in_progress', p_ledger_id USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- Fail Idempotency Helper Function
CREATE OR REPLACE FUNCTION public.fail_idempotency_key(
  p_ledger_id uuid,
  p_error jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.idempotency_ledger
  SET status = 'failed',
      error = p_error,
      completed_at = now()
  WHERE id = p_ledger_id AND status = 'in_progress';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Idempotency ledger entry % not found or not in_progress', p_ledger_id USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- 13. Table: content_feature_flags
CREATE TABLE IF NOT EXISTS public.content_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT UNIQUE NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.content_feature_flags (flag_key, is_enabled, description)
VALUES
  ('html_content_backend', false, 'Backend pipeline for HTML interactive content'),
  ('html_content_upload', false, 'Upload sessions and staging for HTML packages'),
  ('html_content_publish', false, 'Publishing and promotion of HTML resource versions'),
  ('html_content_student_read', false, 'Student access authorization for published HTML content')
ON CONFLICT (flag_key) DO NOTHING;

-- Server helper: is_content_feature_enabled
CREATE OR REPLACE FUNCTION public.is_content_feature_enabled(p_key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_enabled boolean;
BEGIN
  SELECT is_enabled INTO v_enabled FROM public.content_feature_flags WHERE flag_key = p_key;
  IF v_enabled IS NULL THEN
    RETURN false;
  END IF;
  RETURN v_enabled;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

-- 14. Immutability trigger for versions and files
CREATE OR REPLACE FUNCTION public.enforce_version_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_is_referenced boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.immutable_at IS NOT NULL THEN
      RAISE EXCEPTION 'Version % is marked immutable and cannot be deleted', OLD.id USING ERRCODE = '42000';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.lesson_resources
      WHERE approved_version_id = OLD.id OR published_version_id = OLD.id
    ) INTO v_is_referenced;

    IF v_is_referenced THEN
      RAISE EXCEPTION 'Version % is approved or published historically and cannot be deleted', OLD.id USING ERRCODE = '42000';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.immutable_at IS NOT NULL THEN
      IF NEW.immutable_at IS NULL THEN
        RAISE EXCEPTION 'immutable_at cannot be cleared once set on version %', OLD.id USING ERRCODE = '42000';
      END IF;

      IF OLD.resource_id IS DISTINCT FROM NEW.resource_id OR
         OLD.version_number IS DISTINCT FROM NEW.version_number OR
         OLD.content_sha256 IS DISTINCT FROM NEW.content_sha256 OR
         OLD.manifest IS DISTINCT FROM NEW.manifest THEN
        RAISE EXCEPTION 'Version % is immutable and core fields cannot be updated', OLD.id USING ERRCODE = '42000';
      END IF;
    END IF;

    IF NEW.immutable_at IS NOT NULL AND OLD.immutable_at IS NULL THEN
      IF NEW.immutable_reason IS NULL THEN
        NEW.immutable_reason := 'approved';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_version_immutability ON public.lesson_resource_versions;
CREATE TRIGGER trg_version_immutability
  BEFORE UPDATE OR DELETE ON public.lesson_resource_versions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_version_immutability();

-- Trigger for file immutability when parent version is immutable
CREATE OR REPLACE FUNCTION public.enforce_file_immutability_on_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_ver_id uuid; v_immutable_at timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ver_id := OLD.version_id;
  ELSE
    v_ver_id := NEW.version_id;
  END IF;

  SELECT immutable_at INTO v_immutable_at
  FROM public.lesson_resource_versions
  WHERE id = v_ver_id;

  IF v_immutable_at IS NOT NULL THEN
    RAISE EXCEPTION 'Version % is immutable. File modifications (INSERT/UPDATE/DELETE) are prohibited.', v_ver_id USING ERRCODE = '42000';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_file_immutability_on_version ON public.lesson_resource_files;
CREATE TRIGGER trg_file_immutability_on_version
  BEFORE INSERT OR UPDATE OR DELETE ON public.lesson_resource_files
  FOR EACH ROW EXECUTE FUNCTION public.enforce_file_immutability_on_version();

-- 15. Server Helper / Contract Functions for Pipeline
-- 15.1 resolve_upload_session
CREATE OR REPLACE FUNCTION public.resolve_upload_session(p_upload_session_id uuid)
RETURNS TABLE (
  session_id uuid,
  batch_id uuid,
  actor_id uuid,
  resource_id uuid,
  resource_code text,
  staging_path text,
  expected_package_hash text,
  status text,
  expires_at timestamptz,
  is_expired boolean
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_sess record;
BEGIN
  SELECT * INTO v_sess
  FROM public.lesson_resource_upload_sessions
  WHERE id = p_upload_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Upload session % not found', p_upload_session_id USING ERRCODE = 'P0002';
  END IF;

  -- Verify ownership: current actor must be session actor or service_role
  IF current_setting('role', true) NOT IN ('service_role', 'postgres') AND auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() <> v_sess.actor_id THEN
      RAISE EXCEPTION 'Actor % cannot resolve upload session belonging to actor %', auth.uid(), v_sess.actor_id USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Explicit error on expiry
  IF v_sess.expires_at <= now() OR v_sess.status = 'expired' THEN
    RAISE EXCEPTION 'Upload session % is expired', p_upload_session_id USING ERRCODE = '22000';
  END IF;

  RETURN QUERY
  SELECT
    v_sess.id,
    v_sess.batch_id,
    v_sess.actor_id,
    v_sess.resource_id,
    v_sess.resource_code,
    v_sess.staging_path,
    v_sess.expected_package_hash,
    v_sess.status,
    v_sess.expires_at,
    false AS is_expired;
END;
$$;

-- 15.2 record_server_validation (Service-role only)
CREATE OR REPLACE FUNCTION public.record_server_validation(
  p_upload_session_id uuid,
  p_resource_version_id uuid,
  p_package_hash text,
  p_scanner_version text,
  p_findings jsonb,
  p_is_valid boolean,
  p_valid_until timestamptz,
  p_storage_object_path text,
  p_storage_object_version text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
  v_session record;
  v_version record;
BEGIN
  -- Strict server check
  IF current_setting('role', true) NOT IN ('service_role', 'postgres') AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Only server/service_role can record validation results' USING ERRCODE = '42501';
  END IF;

  -- Validate freshness
  IF p_valid_until <= now() THEN
    RAISE EXCEPTION 'Validation valid_until must be in the future' USING ERRCODE = '22000';
  END IF;

  -- Validate upload session binding
  SELECT * INTO v_session FROM public.lesson_resource_upload_sessions WHERE id = p_upload_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Upload session % not found', p_upload_session_id USING ERRCODE = 'P0002';
  END IF;

  IF v_session.expected_package_hash <> p_package_hash THEN
    RAISE EXCEPTION 'Package hash mismatch between validation and upload session' USING ERRCODE = '42000';
  END IF;

  IF v_session.staging_path <> p_storage_object_path THEN
    RAISE EXCEPTION 'Storage object path mismatch between validation and upload session' USING ERRCODE = '42000';
  END IF;

  -- Validate resource version binding
  SELECT * INTO v_version FROM public.lesson_resource_versions WHERE id = p_resource_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resource version % not found', p_resource_version_id USING ERRCODE = 'P0002';
  END IF;

  IF v_version.resource_id <> v_session.resource_id THEN
    RAISE EXCEPTION 'Cross-resource validation binding denied (session resource %, version resource %)', v_session.resource_id, v_version.resource_id USING ERRCODE = '42000';
  END IF;

  IF v_version.content_sha256 <> p_package_hash THEN
    RAISE EXCEPTION 'Package hash mismatch between validation and resource version' USING ERRCODE = '42000';
  END IF;

  INSERT INTO public.content_package_validations (
    upload_session_id,
    resource_id,
    resource_version_id,
    package_hash,
    scanner_version,
    findings,
    is_valid,
    valid_until,
    storage_object_path,
    storage_object_version,
    created_by_server
  ) VALUES (
    p_upload_session_id,
    v_session.resource_id,
    p_resource_version_id,
    p_package_hash,
    p_scanner_version,
    COALESCE(p_findings, '[]'::jsonb),
    p_is_valid,
    p_valid_until,
    p_storage_object_path,
    p_storage_object_version,
    true
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Trusted helper: get_valid_server_validation
CREATE OR REPLACE FUNCTION public.get_valid_server_validation(
  p_resource_version_id uuid,
  p_upload_session_id uuid
) RETURNS TABLE (
  validation_id uuid,
  upload_session_id uuid,
  resource_version_id uuid,
  package_hash text,
  is_valid boolean,
  valid_until timestamptz,
  storage_object_path text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    v.upload_session_id,
    v.resource_version_id,
    v.package_hash,
    v.is_valid,
    v.valid_until,
    v.storage_object_path
  FROM public.content_package_validations v
  JOIN public.lesson_resource_upload_sessions s ON s.id = v.upload_session_id
  WHERE v.resource_version_id = p_resource_version_id
    AND v.upload_session_id = p_upload_session_id
    AND v.is_valid = true
    AND v.valid_until > now()
    AND v.package_hash = s.expected_package_hash
    AND v.storage_object_path = s.staging_path
    AND (v.findings IS NULL OR NOT (v.findings @> '[{"severity": "blocking"}]'::jsonb));
END;
$$;

-- 15.3 resolve_promotion_binding
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
  valid_validation_id uuid
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
    v_validation.id AS valid_validation_id;
END;
$$;

-- 15.4 resolve_student_resource_binding
CREATE OR REPLACE FUNCTION public.resolve_student_resource_binding(p_resource_id uuid)
RETURNS TABLE (
  resource_id uuid,
  lesson_id uuid,
  version_id uuid,
  resource_type text,
  title text,
  published_version_number integer
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_res record; v_ver record;
BEGIN
  IF NOT public.is_content_feature_enabled('html_content_student_read') THEN
    RAISE EXCEPTION 'Feature html_content_student_read is disabled' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resource % not found', p_resource_id USING ERRCODE = 'P0002';
  END IF;

  IF v_res.lifecycle_status <> 'published' OR v_res.published_version_id IS NULL THEN
    RAISE EXCEPTION 'Resource % is not published', p_resource_id USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_access_lesson(v_res.lesson_id) THEN
    RAISE EXCEPTION 'Student cannot access lesson %', v_res.lesson_id USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ver FROM public.lesson_resource_versions WHERE id = v_res.published_version_id;

  RETURN QUERY SELECT
    v_res.id,
    v_res.lesson_id,
    v_ver.id,
    v_res.resource_type::text,
    v_res.title,
    v_ver.version_number;
END;
$$;

-- 15.5 fetch_published_lesson_resources
CREATE OR REPLACE FUNCTION public.fetch_published_lesson_resources(p_lesson_id uuid)
RETURNS TABLE (
  resource_id uuid,
  version_id uuid,
  resource_type text,
  title text,
  sort_order integer
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_content_feature_enabled('html_content_student_read') THEN
    RAISE EXCEPTION 'Feature html_content_student_read is disabled' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_access_lesson(p_lesson_id) THEN
    RAISE EXCEPTION 'Lesson access denied for lesson %', p_lesson_id USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    lr.id AS resource_id,
    lr.published_version_id AS version_id,
    lr.resource_type::text AS resource_type,
    lr.title AS title,
    lr.sort_order AS sort_order
  FROM public.lesson_resources lr
  WHERE lr.lesson_id = p_lesson_id
    AND lr.lifecycle_status = 'published'
    AND lr.published_version_id IS NOT NULL
  ORDER BY lr.sort_order;
END;
$$;

-- 16. Remove Permissive Historical Policies by Exact Name
DROP POLICY IF EXISTS "Resources viewable per lesson access" ON public.lesson_resources;
DROP POLICY IF EXISTS "Content staff manage resources" ON public.lesson_resources;
DROP POLICY IF EXISTS "Admins manage resources" ON public.lesson_resources;

-- 17. Enable RLS on all foundation tables
ALTER TABLE public.lesson_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resource_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resource_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resource_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_package_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resource_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resource_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_feature_flags ENABLE ROW LEVEL SECURITY;

-- 18. RLS Policies for Student Published-Only Access
DROP POLICY IF EXISTS "Students can read published lesson resources" ON public.lesson_resources;
CREATE POLICY "Students can read published lesson resources"
  ON public.lesson_resources FOR SELECT TO authenticated
  USING (
    lifecycle_status = 'published' AND
    published_version_id IS NOT NULL AND
    public.can_access_lesson(lesson_id) AND
    public.is_content_feature_enabled('html_content_student_read')
  );

DROP POLICY IF EXISTS "Students can read published resource versions" ON public.lesson_resource_versions;
CREATE POLICY "Students can read published resource versions"
  ON public.lesson_resource_versions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lesson_resources lr
      WHERE lr.published_version_id = lesson_resource_versions.id
        AND lr.lifecycle_status = 'published'
        AND public.can_access_lesson(lr.lesson_id)
        AND public.is_content_feature_enabled('html_content_student_read')
    )
  );

DROP POLICY IF EXISTS "Students can read published resource files" ON public.lesson_resource_files;
CREATE POLICY "Students can read published resource files"
  ON public.lesson_resource_files FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lesson_resources lr
      WHERE lr.published_version_id = lesson_resource_files.version_id
        AND lr.lifecycle_status = 'published'
        AND public.can_access_lesson(lr.lesson_id)
        AND public.is_content_feature_enabled('html_content_student_read')
    )
  );

DROP POLICY IF EXISTS "Authenticated users can read feature flags" ON public.content_feature_flags;
CREATE POLICY "Authenticated users can read feature flags"
  ON public.content_feature_flags FOR SELECT TO authenticated
  USING (true);

-- 19. Explicit Grants & Revokes (NO wide revoke)
-- Revoke direct DML on foundation tables from public, authenticated, anon
REVOKE INSERT, UPDATE, DELETE ON public.lesson_resources FROM public, authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.lesson_resource_versions FROM public, authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.lesson_resource_files FROM public, authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.content_import_batches FROM public, authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.lesson_resource_upload_sessions FROM public, authenticated, anon;
REVOKE ALL ON public.content_package_validations FROM public, authenticated, anon;
REVOKE ALL ON public.lesson_resource_reviews FROM public, authenticated, anon;
REVOKE ALL ON public.lesson_resource_events FROM public, authenticated, anon;
REVOKE ALL ON public.storage_operations FROM public, authenticated, anon;
REVOKE ALL ON public.idempotency_ledger FROM public, authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.content_feature_flags FROM public, authenticated, anon;

-- Explicit REVOKE EXECUTE FROM PUBLIC and anon on SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.is_content_feature_enabled(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_staging_path(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_upload_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_server_validation(uuid, uuid, text, text, jsonb, boolean, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_valid_server_validation(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_promotion_binding(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_student_resource_binding(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fetch_published_lesson_resources(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_idempotency_key(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_idempotency_key(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fail_idempotency_key(uuid, jsonb) FROM PUBLIC, anon;

-- Grant SELECT to authenticated where required
GRANT SELECT ON public.lesson_resources TO authenticated;
GRANT SELECT ON public.lesson_resource_versions TO authenticated;
GRANT SELECT ON public.lesson_resource_files TO authenticated;
GRANT SELECT ON public.content_feature_flags TO authenticated;

-- Grant service_role full permissions
GRANT ALL ON public.lesson_resources TO service_role;
GRANT ALL ON public.lesson_resource_versions TO service_role;
GRANT ALL ON public.lesson_resource_files TO service_role;
GRANT ALL ON public.content_import_batches TO service_role;
GRANT ALL ON public.lesson_resource_upload_sessions TO service_role;
GRANT ALL ON public.content_package_validations TO service_role;
GRANT ALL ON public.lesson_resource_reviews TO service_role;
GRANT ALL ON public.lesson_resource_events TO service_role;
GRANT ALL ON public.storage_operations TO service_role;
GRANT ALL ON public.idempotency_ledger TO service_role;
GRANT ALL ON public.content_feature_flags TO service_role;

-- Grant EXECUTE on server contracts
GRANT EXECUTE ON FUNCTION public.is_content_feature_enabled(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_upload_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_server_validation(uuid, uuid, text, text, jsonb, boolean, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_valid_server_validation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_promotion_binding(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_student_resource_binding(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fetch_published_lesson_resources(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_idempotency_key(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_idempotency_key(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_idempotency_key(uuid, jsonb) TO service_role;
