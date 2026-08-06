-- Content Onboarding HTML Operational Backend Migration
-- Timestamp: 20260806120000
-- Migration Type: ADDITIVE ONLY (Does NOT drop or destructively mutate lesson_resources)

BEGIN;

--------------------------------------------------------------------------------
-- 1. ADDITIVE ALTERATIONS TO EXISTING TABLES & ENUMS
--------------------------------------------------------------------------------

-- Extend lesson_resource_type enum if needed
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'mind_map_html';
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'practical_experiment_html';
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'summary_html';
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'image';
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'external_link';

-- Additive columns on lesson_resources
ALTER TABLE public.lesson_resources
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'published', 'rejected', 'archived')),
  ADD COLUMN IF NOT EXISTS resource_code TEXT,
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_draft_version_id UUID,
  ADD COLUMN IF NOT EXISTS approved_version_id UUID,
  ADD COLUMN IF NOT EXISTS published_version_id UUID,
  ADD COLUMN IF NOT EXISTS lock_version INT NOT NULL DEFAULT 1 CHECK (lock_version >= 1),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

--------------------------------------------------------------------------------
-- 2. SERVER FEATURE FLAGS TABLE
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_feature_flags (
  flag_name TEXT PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.content_feature_flags (flag_name, is_enabled, description)
VALUES
  ('html_content_backend', false, 'Master switch for operational HTML content backend'),
  ('html_content_upload', false, 'Allows content staff to issue and finalize HTML uploads'),
  ('html_content_publish', false, 'Allows admins to publish approved HTML resources'),
  ('html_content_student_read', false, 'Allows students to read published HTML resources')
ON CONFLICT (flag_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.check_content_feature_flag(p_flag_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  SELECT is_enabled INTO v_enabled
  FROM public.content_feature_flags
  WHERE flag_name = p_flag_name;
  RETURN COALESCE(v_enabled, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.assert_content_feature_flag(p_flag_name TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT public.check_content_feature_flag(p_flag_name) THEN
    RAISE EXCEPTION 'Feature flag % is disabled', p_flag_name USING ERRCODE = '42501';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

--------------------------------------------------------------------------------
-- 3. NEW TABLES FOR VERSIONING, AUDIT, SAGAS AND IDEMPOTENCY
--------------------------------------------------------------------------------

-- 3.1 lesson_resource_versions
CREATE TABLE IF NOT EXISTS public.lesson_resource_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.lesson_resources(id) ON DELETE CASCADE,
  version_number INT NOT NULL CHECK (version_number > 0),
  content_sha256 TEXT NOT NULL,
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  entry_file TEXT NOT NULL DEFAULT 'index.html',
  immutable_at TIMESTAMPTZ,
  immutable_reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_resource_version_id_resource UNIQUE (id, resource_id),
  CONSTRAINT uq_resource_version_number UNIQUE (resource_id, version_number),
  CONSTRAINT uq_resource_content_hash UNIQUE (resource_id, content_sha256)
);

-- BIND SAME-RESOURCE COMPOSITE FOREIGN KEYS ON lesson_resources WITH ON DELETE RESTRICT
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lesson_resources_current_draft_same_resource') THEN
    ALTER TABLE public.lesson_resources
      ADD CONSTRAINT fk_lesson_resources_current_draft_same_resource
      FOREIGN KEY (current_draft_version_id, id)
      REFERENCES public.lesson_resource_versions(id, resource_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lesson_resources_approved_same_resource') THEN
    ALTER TABLE public.lesson_resources
      ADD CONSTRAINT fk_lesson_resources_approved_same_resource
      FOREIGN KEY (approved_version_id, id)
      REFERENCES public.lesson_resource_versions(id, resource_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lesson_resources_published_same_resource') THEN
    ALTER TABLE public.lesson_resources
      ADD CONSTRAINT fk_lesson_resources_published_same_resource
      FOREIGN KEY (published_version_id, id)
      REFERENCES public.lesson_resource_versions(id, resource_id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 3.2 lesson_resource_files
CREATE TABLE IF NOT EXISTS public.lesson_resource_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.lesson_resource_versions(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes >= 0),
  mime_type TEXT NOT NULL,
  sha256_hash TEXT NOT NULL,
  is_entry_point BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_version_file_path UNIQUE (version_id, file_path)
);

-- 3.3 lesson_resource_reviews (Append-only audit, SAME-RESOURCE COMPOSITE FK, NO CASCADE)
CREATE TABLE IF NOT EXISTS public.lesson_resource_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.lesson_resources(id) ON DELETE RESTRICT,
  version_id UUID NOT NULL,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('submitted', 'approved', 'rejected', 'published', 'unpublished', 'archived', 'rollback')),
  reason TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_reviews_version_same_resource
    FOREIGN KEY (version_id, resource_id)
    REFERENCES public.lesson_resource_versions(id, resource_id) ON DELETE RESTRICT
);

-- 3.4 lesson_resource_events (Append-only audit, NO CASCADE)
CREATE TABLE IF NOT EXISTS public.lesson_resource_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.lesson_resources(id) ON DELETE RESTRICT,
  version_id UUID REFERENCES public.lesson_resource_versions(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.5 content_import_batches
CREATE TABLE IF NOT EXISTS public.content_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'validating', 'completed', 'failed', 'cancelled')),
  excel_filename TEXT,
  zip_filename TEXT,
  total_rows INT NOT NULL DEFAULT 0,
  processed_rows INT NOT NULL DEFAULT 0,
  error_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.6 content_import_rows
CREATE TABLE IF NOT EXISTS public.content_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.content_import_batches(id) ON DELETE CASCADE,
  row_index INT NOT NULL,
  resource_code TEXT NOT NULL,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  resource_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'valid', 'invalid', 'imported', 'failed')),
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  resource_id UUID REFERENCES public.lesson_resources(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_batch_row_index UNIQUE (batch_id, row_index)
);

-- 3.7 storage_operations (Formal State Machine & Immutability Rules)
CREATE TABLE IF NOT EXISTS public.storage_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_operation_id UUID REFERENCES public.storage_operations(id) ON DELETE RESTRICT,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('stage_upload', 'promote_published', 'cleanup_orphan', 'rollback_published')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'verified', 'promoted', 'cleanup_pending', 'cleaned', 'failed', 'compensated')),
  source_path TEXT NOT NULL,
  target_path TEXT,
  expected_hash TEXT,
  actual_hash TEXT,
  retry_number INT NOT NULL DEFAULT 0 CHECK (retry_number >= 0),
  attempt_count INT NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  idempotency_key TEXT NOT NULL,
  error_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 3.8 idempotency_ledger (Append-only Ledger & Atomic Claim Workflow)
CREATE TABLE IF NOT EXISTS public.idempotency_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'succeeded', 'failed')),
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_actor_operation_idempotency UNIQUE (actor_id, operation, idempotency_key)
);

-- 3.9 content_package_validations (Server-authoritative Scanner Persisted Runs)
CREATE TABLE IF NOT EXISTS public.content_package_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID REFERENCES public.lesson_resource_versions(id) ON DELETE RESTRICT,
  batch_id UUID REFERENCES public.content_import_batches(id) ON DELETE RESTRICT,
  package_hash TEXT NOT NULL,
  scanner_version TEXT NOT NULL DEFAULT 'v1',
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_valid BOOLEAN NOT NULL DEFAULT false,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  validated_by_server BOOLEAN NOT NULL DEFAULT true
);

--------------------------------------------------------------------------------
-- 4. STORAGE BUCKETS CONFIGURATION
--------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('lesson-resource-drafts', 'lesson-resource-drafts', false, 52428800, ARRAY['application/zip', 'application/x-zip-compressed', 'text/html', 'image/png', 'image/jpeg', 'application/json']),
  ('lesson-resource-published', 'lesson-resource-published', false, 52428800, ARRAY['text/html', 'text/css', 'application/javascript', 'image/png', 'image/jpeg', 'image/svg+xml', 'application/json'])
ON CONFLICT (id) DO UPDATE SET public = false;

--------------------------------------------------------------------------------
-- 5. RLS ENFORCEMENT, IMMUTABILITY TRIGGERS & STATE MACHINE GUARDS
--------------------------------------------------------------------------------

ALTER TABLE public.lesson_resource_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resource_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resource_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resource_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_package_validations ENABLE ROW LEVEL SECURITY;

-- 5.1 Enforce Audit Append-Only Immutability
CREATE OR REPLACE FUNCTION public.enforce_audit_immutability()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are immutable append-only logs' USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_immutability_reviews ON public.lesson_resource_reviews;
CREATE TRIGGER trg_audit_immutability_reviews
BEFORE UPDATE OR DELETE ON public.lesson_resource_reviews
FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_immutability();

DROP TRIGGER IF EXISTS trg_audit_immutability_events ON public.lesson_resource_events;
CREATE TRIGGER trg_audit_immutability_events
BEFORE UPDATE OR DELETE ON public.lesson_resource_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_immutability();

-- 5.2 Version Immutability Triggers (historical immutability via immutable_at)
CREATE OR REPLACE FUNCTION public.enforce_version_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.immutable_at IS NOT NULL THEN
    RAISE EXCEPTION 'Approved and published versions are immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256 OR
     NEW.manifest IS DISTINCT FROM OLD.manifest OR
     NEW.entry_file IS DISTINCT FROM OLD.entry_file THEN
    RAISE EXCEPTION 'Core version properties of an immutable version cannot be altered' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_version_immutability ON public.lesson_resource_versions;
CREATE TRIGGER trg_version_immutability
BEFORE UPDATE OR DELETE ON public.lesson_resource_versions
FOR EACH ROW EXECUTE FUNCTION public.enforce_version_immutability();

-- 5.3 Version Files Immutability Trigger
CREATE OR REPLACE FUNCTION public.enforce_version_files_immutability()
RETURNS TRIGGER AS $$
DECLARE
  v_immutable TIMESTAMPTZ;
BEGIN
  SELECT lrv.immutable_at INTO v_immutable
  FROM public.lesson_resource_versions lrv
  WHERE lrv.id = OLD.version_id;

  IF v_immutable IS NOT NULL THEN
    RAISE EXCEPTION 'Files of immutable versions cannot be modified or deleted' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_version_files_immutability ON public.lesson_resource_files;
CREATE TRIGGER trg_version_files_immutability
BEFORE UPDATE OR DELETE ON public.lesson_resource_files
FOR EACH ROW EXECUTE FUNCTION public.enforce_version_files_immutability();

-- 5.4 Storage Operation Transitions Trigger
CREATE OR REPLACE FUNCTION public.enforce_storage_operation_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Storage operations cannot be deleted' USING ERRCODE = '42501';
  END IF;

  -- Identity fields immutable
  IF NEW.operation_type IS DISTINCT FROM OLD.operation_type OR
     NEW.source_path IS DISTINCT FROM OLD.source_path OR
     NEW.target_path IS DISTINCT FROM OLD.target_path OR
     NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR
     NEW.parent_operation_id IS DISTINCT FROM OLD.parent_operation_id OR
     NEW.retry_number IS DISTINCT FROM OLD.retry_number THEN
    RAISE EXCEPTION 'Storage operation identity fields are immutable' USING ERRCODE = '42501';
  END IF;

  -- Terminal states cleaned and compensated cannot transition
  IF OLD.status IN ('cleaned', 'compensated') THEN
    RAISE EXCEPTION 'Terminal storage operation status % cannot transition', OLD.status USING ERRCODE = '42501';
  END IF;

  -- State machine transition rules
  IF OLD.status = 'pending' AND NEW.status NOT IN ('uploaded', 'failed') THEN
    RAISE EXCEPTION 'Illegal status transition from pending to %', NEW.status USING ERRCODE = '42501';
  ELSIF OLD.status = 'uploaded' AND NEW.status NOT IN ('verified', 'failed') THEN
    RAISE EXCEPTION 'Illegal status transition from uploaded to %', NEW.status USING ERRCODE = '42501';
  ELSIF OLD.status = 'verified' AND NEW.status NOT IN ('promoted', 'failed') THEN
    RAISE EXCEPTION 'Illegal status transition from verified to %', NEW.status USING ERRCODE = '42501';
  ELSIF OLD.status = 'promoted' AND NEW.status NOT IN ('cleanup_pending', 'failed') THEN
    RAISE EXCEPTION 'Illegal status transition from promoted to %', NEW.status USING ERRCODE = '42501';
  ELSIF OLD.status = 'cleanup_pending' AND NEW.status NOT IN ('cleaned', 'failed') THEN
    RAISE EXCEPTION 'Illegal status transition from cleanup_pending to %', NEW.status USING ERRCODE = '42501';
  ELSIF OLD.status = 'failed' AND NEW.status <> 'compensated' THEN
    RAISE EXCEPTION 'Illegal status transition from failed to %', NEW.status USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := now();
  IF NEW.status IN ('cleaned', 'compensated', 'promoted', 'verified', 'uploaded', 'failed') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_storage_operations_rules ON public.storage_operations;
CREATE TRIGGER trg_storage_operations_rules
BEFORE UPDATE OR DELETE ON public.storage_operations
FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_operation_rules();

--------------------------------------------------------------------------------
-- 6. STRICT RLS POLICIES (NO DIRECT BROWSER WRITES)
--------------------------------------------------------------------------------

-- Clean up any historical open policies on lesson_resources
DROP POLICY IF EXISTS "Resources viewable per lesson access" ON public.lesson_resources;
DROP POLICY IF EXISTS "Content staff manage resources" ON public.lesson_resources;
DROP POLICY IF EXISTS "Content staff select lesson resources" ON public.lesson_resources;
DROP POLICY IF EXISTS "Content staff manage versions" ON public.lesson_resource_versions;
DROP POLICY IF EXISTS "Content staff manage files" ON public.lesson_resource_files;
DROP POLICY IF EXISTS "Content staff manage import batches" ON public.content_import_batches;
DROP POLICY IF EXISTS "Content staff manage import rows" ON public.content_import_rows;
DROP POLICY IF EXISTS "Content staff manage storage operations" ON public.storage_operations;

-- SELECT ONLY POLICIES FOR STAFF (NO DIRECT BROWSER MUTATIONS)
ALTER TABLE public.lesson_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Content staff select lesson resources"
  ON public.lesson_resources FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Content staff select versions"
  ON public.lesson_resource_versions FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Content staff select files"
  ON public.lesson_resource_files FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Content staff select reviews"
  ON public.lesson_resource_reviews FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Content staff select import batches"
  ON public.content_import_batches FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Content staff select import rows"
  ON public.content_import_rows FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Content staff select storage operations"
  ON public.storage_operations FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Content staff select feature flags"
  ON public.content_feature_flags FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Content staff select package validations"
  ON public.content_package_validations FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

-- Student SELECT on lesson_resources: Restricted to Published only with active lesson access
DROP POLICY IF EXISTS "Students read published lesson resources" ON public.lesson_resources;
CREATE POLICY "Students read published lesson resources"
  ON public.lesson_resources FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND published_version_id IS NOT NULL
    AND public.can_access_lesson(lesson_id)
  );

-- Storage Bucket Policies
DROP POLICY IF EXISTS "Content staff draft staging upload" ON storage.objects;
CREATE POLICY "Content staff draft staging upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lesson-resource-drafts'
    AND public.is_content_staff(auth.uid())
    AND (storage.foldername(name))[1] = 'staging'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Content staff draft staging select" ON storage.objects;
CREATE POLICY "Content staff draft staging select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'lesson-resource-drafts'
    AND public.is_content_staff(auth.uid())
  );

DROP POLICY IF EXISTS "No direct browser write to published bucket" ON storage.objects;
CREATE POLICY "No direct browser write to published bucket"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (false);

--------------------------------------------------------------------------------
-- 7. ATOMIC IDEMPOTENCY WORKFLOW FUNCTIONS
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_idempotency_slot(
  p_actor_id UUID,
  p_operation TEXT,
  p_key TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_row public.idempotency_ledger%ROWTYPE;
BEGIN
  IF p_key IS NULL OR trim(p_key) = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.idempotency_ledger (actor_id, operation, idempotency_key, status)
  VALUES (p_actor_id, p_operation, p_key, 'in_progress')
  ON CONFLICT (actor_id, operation, idempotency_key) DO NOTHING;

  IF NOT FOUND THEN
    SELECT * INTO v_row
    FROM public.idempotency_ledger
    WHERE actor_id = p_actor_id AND operation = p_operation AND idempotency_key = p_key;

    IF v_row.status = 'succeeded' THEN
      RETURN v_row.response_payload;
    ELSIF v_row.status = 'in_progress' THEN
      RAISE EXCEPTION 'Operation in progress' USING ERRCODE = '40900';
    ELSE
      RAISE EXCEPTION 'Previous execution failed' USING ERRCODE = '40000';
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.complete_idempotency_slot(
  p_actor_id UUID,
  p_operation TEXT,
  p_key TEXT,
  p_payload JSONB
)
RETURNS VOID AS $$
BEGIN
  IF p_key IS NOT NULL AND trim(p_key) <> '' THEN
    UPDATE public.idempotency_ledger
    SET status = 'succeeded', response_payload = p_payload, updated_at = now()
    WHERE actor_id = p_actor_id AND operation = p_operation AND idempotency_key = p_key;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

--------------------------------------------------------------------------------
-- 8. THE 12 RPC PROCEDURES & LIFECYCLE GUARDS
--------------------------------------------------------------------------------

-- 8.1 create_content_import_batch
CREATE OR REPLACE FUNCTION public.create_content_import_batch(
  p_excel_filename TEXT,
  p_zip_filename TEXT,
  p_total_rows INT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_claimed JSONB;
  v_batch_id UUID;
  v_result JSONB;
BEGIN
  PERFORM public.assert_content_feature_flag('html_content_backend');
  PERFORM public.assert_content_feature_flag('html_content_upload');

  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'Unauthorized staff access' USING ERRCODE = '42501';
  END IF;

  v_claimed := public.claim_idempotency_slot(v_actor, 'create_content_import_batch', p_idempotency_key);
  IF v_claimed IS NOT NULL THEN
    RETURN v_claimed;
  END IF;

  INSERT INTO public.content_import_batches (creator_id, status, excel_filename, zip_filename, total_rows)
  VALUES (v_actor, 'pending', p_excel_filename, p_zip_filename, COALESCE(p_total_rows, 0))
  RETURNING id INTO v_batch_id;

  v_result := jsonb_build_object(
    'batch_id', v_batch_id,
    'status', 'pending',
    'total_rows', COALESCE(p_total_rows, 0),
    'created_at', now()
  );

  PERFORM public.complete_idempotency_slot(v_actor, 'create_content_import_batch', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8.2 issue_content_upload
CREATE OR REPLACE FUNCTION public.issue_content_upload(
  p_batch_id UUID,
  p_resource_code TEXT,
  p_filename TEXT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_claimed JSONB;
  v_batch RECORD;
  v_upload_session_id UUID := gen_random_uuid();
  v_staging_path TEXT;
  v_result JSONB;
BEGIN
  PERFORM public.assert_content_feature_flag('html_content_backend');
  PERFORM public.assert_content_feature_flag('html_content_upload');

  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'Unauthorized staff access' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_batch FROM public.content_import_batches WHERE id = p_batch_id;
  IF v_batch.id IS NULL OR v_batch.creator_id <> v_actor THEN
    RAISE EXCEPTION 'Import batch not found or unauthorized' USING ERRCODE = '40400';
  END IF;

  IF p_resource_code IS NULL OR p_resource_code ~ '[/\\]|\.\.' OR p_filename ~ '[/\\]|\.\.' THEN
    RAISE EXCEPTION 'Invalid resource code or filename traversal detected' USING ERRCODE = '40000';
  END IF;

  v_claimed := public.claim_idempotency_slot(v_actor, 'issue_content_upload', p_idempotency_key);
  IF v_claimed IS NOT NULL THEN
    RETURN v_claimed;
  END IF;

  v_staging_path := 'staging/' || v_actor::text || '/' || p_batch_id::text || '/' || v_upload_session_id::text || '/' || p_filename;

  INSERT INTO public.storage_operations (
    operation_type, status, source_path, idempotency_key
  ) VALUES (
    'stage_upload', 'pending', v_staging_path, COALESCE(p_idempotency_key, v_upload_session_id::text)
  );

  v_result := jsonb_build_object(
    'batch_id', p_batch_id,
    'upload_session_id', v_upload_session_id,
    'resource_code', p_resource_code,
    'bucket', 'lesson-resource-drafts',
    'staging_path', v_staging_path
  );

  PERFORM public.complete_idempotency_slot(v_actor, 'issue_content_upload', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8.3 finalize_content_upload
CREATE OR REPLACE FUNCTION public.finalize_content_upload(
  p_batch_id UUID,
  p_lesson_id UUID,
  p_resource_code TEXT,
  p_resource_type TEXT,
  p_title TEXT,
  p_staging_path TEXT,
  p_content_sha256 TEXT,
  p_manifest JSONB,
  p_files JSONB,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_claimed JSONB;
  v_resource_id UUID;
  v_version_id UUID;
  v_version_num INT := 1;
  v_lock_ver INT;
  v_file_elem JSONB;
  v_db_resource_type public.lesson_resource_type;
  v_result JSONB;
BEGIN
  PERFORM public.assert_content_feature_flag('html_content_backend');
  PERFORM public.assert_content_feature_flag('html_content_upload');

  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'Unauthorized staff access' USING ERRCODE = '42501';
  END IF;

  v_claimed := public.claim_idempotency_slot(v_actor, 'finalize_content_upload', p_idempotency_key);
  IF v_claimed IS NOT NULL THEN
    RETURN v_claimed;
  END IF;

  v_db_resource_type := CASE p_resource_type
    WHEN 'mindmap' THEN 'mind_map_html'::public.lesson_resource_type
    WHEN 'experiment' THEN 'practical_experiment_html'::public.lesson_resource_type
    WHEN 'link' THEN 'external_link'::public.lesson_resource_type
    ELSE p_resource_type::public.lesson_resource_type
  END;

  SELECT id, lock_version INTO v_resource_id, v_lock_ver
  FROM public.lesson_resources
  WHERE lesson_id = p_lesson_id AND resource_code = p_resource_code
  FOR UPDATE;

  IF v_resource_id IS NULL THEN
    INSERT INTO public.lesson_resources (lesson_id, resource_code, resource_type, title, status, created_by, url)
    VALUES (p_lesson_id, p_resource_code, v_db_resource_type, p_title, 'draft', v_actor, p_staging_path)
    RETURNING id, lock_version INTO v_resource_id, v_lock_ver;
  ELSE
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_num
    FROM public.lesson_resource_versions
    WHERE resource_id = v_resource_id;

    UPDATE public.lesson_resources
    SET title = p_title, resource_type = v_db_resource_type, status = 'draft', url = p_staging_path, updated_at = now()
    WHERE id = v_resource_id;
  END IF;

  INSERT INTO public.lesson_resource_versions (resource_id, version_number, content_sha256, manifest, entry_file, created_by)
  VALUES (v_resource_id, v_version_num, p_content_sha256, COALESCE(p_manifest, '{}'::jsonb), COALESCE(p_manifest->>'entry', 'index.html'), v_actor)
  RETURNING id INTO v_version_id;

  IF p_files IS NOT NULL AND jsonb_array_length(p_files) > 0 THEN
    FOR v_file_elem IN SELECT * FROM jsonb_array_elements(p_files)
    LOOP
      INSERT INTO public.lesson_resource_files (version_id, file_path, file_size_bytes, mime_type, sha256_hash, is_entry_point)
      VALUES (
        v_version_id,
        v_file_elem->>'file_path',
        (v_file_elem->>'file_size_bytes')::BIGINT,
        v_file_elem->>'mime_type',
        v_file_elem->>'sha256_hash',
        COALESCE((v_file_elem->>'is_entry_point')::BOOLEAN, false)
      );
    END LOOP;
  END IF;

  UPDATE public.lesson_resources
  SET current_draft_version_id = v_version_id, lock_version = lock_version + 1, updated_at = now()
  WHERE id = v_resource_id;

  v_result := jsonb_build_object(
    'resource_id', v_resource_id,
    'version_id', v_version_id,
    'version_number', v_version_num,
    'status', 'draft',
    'lock_version', v_lock_ver + 1
  );

  PERFORM public.complete_idempotency_slot(v_actor, 'finalize_content_upload', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8.4 validate_content_package (Attests trusted server validation run)
CREATE OR REPLACE FUNCTION public.validate_content_package(
  p_resource_id UUID,
  p_version_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_claimed JSONB;
  v_version RECORD;
  v_validation RECORD;
  v_result JSONB;
BEGIN
  PERFORM public.assert_content_feature_flag('html_content_backend');
  PERFORM public.assert_content_feature_flag('html_content_upload');

  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'Unauthorized staff access' USING ERRCODE = '42501';
  END IF;

  v_claimed := public.claim_idempotency_slot(v_actor, 'validate_content_package', p_idempotency_key);
  IF v_claimed IS NOT NULL THEN
    RETURN v_claimed;
  END IF;

  SELECT * INTO v_version
  FROM public.lesson_resource_versions
  WHERE id = p_version_id AND resource_id = p_resource_id;

  IF v_version.id IS NULL THEN
    RAISE EXCEPTION 'Version or resource not found' USING ERRCODE = '40400';
  END IF;

  SELECT * INTO v_validation
  FROM public.content_package_validations
  WHERE version_id = p_version_id
  ORDER BY validated_at DESC
  LIMIT 1;

  v_result := jsonb_build_object(
    'resource_id', p_resource_id,
    'version_id', p_version_id,
    'is_valid', COALESCE(v_validation.is_valid, false),
    'content_sha256', v_version.content_sha256,
    'findings', COALESCE(v_validation.findings, '[]'::jsonb),
    'validated_at', v_validation.validated_at
  );

  PERFORM public.complete_idempotency_slot(v_actor, 'validate_content_package', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8.5 submit_resource_for_review
CREATE OR REPLACE FUNCTION public.submit_resource_for_review(
  p_resource_id UUID,
  p_expected_lock_version INT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_claimed JSONB;
  v_res RECORD;
  v_ver RECORD;
  v_validation RECORD;
  v_result JSONB;
BEGIN
  PERFORM public.assert_content_feature_flag('html_content_backend');

  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'Unauthorized staff access' USING ERRCODE = '42501';
  END IF;

  v_claimed := public.claim_idempotency_slot(v_actor, 'submit_resource_for_review', p_idempotency_key);
  IF v_claimed IS NOT NULL THEN
    RETURN v_claimed;
  END IF;

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'Resource not found' USING ERRCODE = '40400';
  END IF;

  IF v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Stale lock version' USING ERRCODE = '40900';
  END IF;

  SELECT * INTO v_ver FROM public.lesson_resource_versions WHERE id = v_res.current_draft_version_id;
  IF v_ver.id IS NULL THEN
    RAISE EXCEPTION 'Current draft version not found' USING ERRCODE = '40400';
  END IF;

  -- Require valid server validation run matching version content_sha256
  SELECT * INTO v_validation
  FROM public.content_package_validations
  WHERE version_id = v_res.current_draft_version_id
    AND is_valid = true
    AND validated_by_server = true
    AND package_hash = v_ver.content_sha256
  ORDER BY validated_at DESC
  LIMIT 1;

  IF v_validation.id IS NULL THEN
    RAISE EXCEPTION 'Server package validation matching version content SHA-256 must pass before submitting for review' USING ERRCODE = '42200';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_validation.findings) elem
    WHERE elem->>'severity' = 'error'
  ) THEN
    RAISE EXCEPTION 'Package validation contains blocking security findings' USING ERRCODE = '42200';
  END IF;

  UPDATE public.lesson_resources
  SET status = 'in_review', lock_version = lock_version + 1, updated_at = now()
  WHERE id = p_resource_id;

  INSERT INTO public.lesson_resource_reviews (resource_id, version_id, reviewer_id, action, reason)
  VALUES (p_resource_id, v_res.current_draft_version_id, v_actor, 'submitted', 'Submitted for administrative review');

  v_result := jsonb_build_object(
    'resource_id', p_resource_id,
    'status', 'in_review',
    'lock_version', v_res.lock_version + 1
  );

  PERFORM public.complete_idempotency_slot(v_actor, 'submit_resource_for_review', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8.6 approve_resource_version
CREATE OR REPLACE FUNCTION public.approve_resource_version(
  p_resource_id UUID,
  p_version_id UUID,
  p_expected_lock_version INT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_claimed JSONB;
  v_res RECORD;
  v_ver RECORD;
  v_validation RECORD;
  v_result JSONB;
BEGIN
  PERFORM public.assert_content_feature_flag('html_content_backend');

  IF NOT has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can approve versions' USING ERRCODE = '42501';
  END IF;

  v_claimed := public.claim_idempotency_slot(v_actor, 'approve_resource_version', p_idempotency_key);
  IF v_claimed IS NOT NULL THEN
    RETURN v_claimed;
  END IF;

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'Resource not found' USING ERRCODE = '40400';
  END IF;

  IF v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Stale lock version' USING ERRCODE = '40900';
  END IF;

  IF v_res.status <> 'in_review' THEN
    RAISE EXCEPTION 'Resource must be in review status' USING ERRCODE = '42200';
  END IF;

  SELECT * INTO v_ver FROM public.lesson_resource_versions WHERE id = p_version_id AND resource_id = p_resource_id;
  IF v_ver.id IS NULL THEN
    RAISE EXCEPTION 'Version does not belong to resource' USING ERRCODE = '40000';
  END IF;

  SELECT * INTO v_validation
  FROM public.content_package_validations
  WHERE version_id = p_version_id
    AND is_valid = true
    AND validated_by_server = true
    AND package_hash = v_ver.content_sha256
  ORDER BY validated_at DESC
  LIMIT 1;

  IF v_validation.id IS NULL THEN
    RAISE EXCEPTION 'Version lacks valid server validation run matching version content SHA-256' USING ERRCODE = '42200';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_validation.findings) elem
    WHERE elem->>'severity' = 'error'
  ) THEN
    RAISE EXCEPTION 'Package validation contains blocking security findings' USING ERRCODE = '42200';
  END IF;

  -- Set version immutability
  UPDATE public.lesson_resource_versions
  SET immutable_at = COALESCE(immutable_at, now()), immutable_reason = 'approved'
  WHERE id = p_version_id;

  UPDATE public.lesson_resources
  SET status = 'approved', approved_version_id = p_version_id, lock_version = lock_version + 1, updated_at = now()
  WHERE id = p_resource_id;

  INSERT INTO public.lesson_resource_reviews (resource_id, version_id, reviewer_id, action, reason)
  VALUES (p_resource_id, p_version_id, v_actor, 'approved', 'Approved by administrator');

  v_result := jsonb_build_object(
    'resource_id', p_resource_id,
    'status', 'approved',
    'approved_version_id', p_version_id,
    'lock_version', v_res.lock_version + 1
  );

  PERFORM public.complete_idempotency_slot(v_actor, 'approve_resource_version', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8.7 reject_resource_version
CREATE OR REPLACE FUNCTION public.reject_resource_version(
  p_resource_id UUID,
  p_version_id UUID,
  p_reason TEXT,
  p_expected_lock_version INT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_claimed JSONB;
  v_res RECORD;
  v_ver RECORD;
  v_result JSONB;
BEGIN
  PERFORM public.assert_content_feature_flag('html_content_backend');

  IF NOT has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can reject versions' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR char_length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Mandatory rejection reason required' USING ERRCODE = '40000';
  END IF;

  v_claimed := public.claim_idempotency_slot(v_actor, 'reject_resource_version', p_idempotency_key);
  IF v_claimed IS NOT NULL THEN
    RETURN v_claimed;
  END IF;

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'Resource not found' USING ERRCODE = '40400';
  END IF;

  IF v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Stale lock version' USING ERRCODE = '40900';
  END IF;

  IF v_res.status <> 'in_review' THEN
    RAISE EXCEPTION 'Resource must be in review status to be rejected' USING ERRCODE = '42200';
  END IF;

  SELECT * INTO v_ver FROM public.lesson_resource_versions WHERE id = p_version_id AND resource_id = p_resource_id;
  IF v_ver.id IS NULL THEN
    RAISE EXCEPTION 'Version does not belong to resource' USING ERRCODE = '40000';
  END IF;

  UPDATE public.lesson_resources
  SET status = 'rejected', lock_version = lock_version + 1, updated_at = now()
  WHERE id = p_resource_id;

  INSERT INTO public.lesson_resource_reviews (resource_id, version_id, reviewer_id, action, reason)
  VALUES (p_resource_id, p_version_id, v_actor, 'rejected', p_reason);

  v_result := jsonb_build_object(
    'resource_id', p_resource_id,
    'status', 'rejected',
    'lock_version', v_res.lock_version + 1
  );

  PERFORM public.complete_idempotency_slot(v_actor, 'reject_resource_version', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8.8 publish_resource_version
CREATE OR REPLACE FUNCTION public.publish_resource_version(
  p_resource_id UUID,
  p_version_id UUID,
  p_expected_lock_version INT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_claimed JSONB;
  v_res RECORD;
  v_ver RECORD;
  v_op_id UUID;
  v_target_path TEXT;
  v_result JSONB;
BEGIN
  PERFORM public.assert_content_feature_flag('html_content_backend');
  PERFORM public.assert_content_feature_flag('html_content_publish');

  IF NOT has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can publish versions' USING ERRCODE = '42501';
  END IF;

  v_claimed := public.claim_idempotency_slot(v_actor, 'publish_resource_version', p_idempotency_key);
  IF v_claimed IS NOT NULL THEN
    RETURN v_claimed;
  END IF;

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'Resource not found' USING ERRCODE = '40400';
  END IF;

  IF v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Stale lock version' USING ERRCODE = '40900';
  END IF;

  IF v_res.status <> 'approved' OR v_res.approved_version_id IS NULL OR v_res.approved_version_id <> p_version_id THEN
    RAISE EXCEPTION 'Version must be approved before publication' USING ERRCODE = '42200';
  END IF;

  SELECT * INTO v_ver FROM public.lesson_resource_versions WHERE id = p_version_id AND resource_id = p_resource_id;

  v_target_path := 'published/' || COALESCE(v_res.resource_code, p_resource_id::text) || '/' || v_ver.version_number::text || '/' || v_ver.content_sha256;

  INSERT INTO public.storage_operations (
    operation_type, status, source_path, target_path, expected_hash, idempotency_key
  ) VALUES (
    'promote_published', 'pending', v_res.url, v_target_path, v_ver.content_sha256, COALESCE(p_idempotency_key, gen_random_uuid()::text)
  ) RETURNING id INTO v_op_id;

  -- Transition storage op to promoted
  UPDATE public.storage_operations
  SET status = 'uploaded', updated_at = now()
  WHERE id = v_op_id;

  UPDATE public.storage_operations
  SET status = 'verified', actual_hash = v_ver.content_sha256, updated_at = now()
  WHERE id = v_op_id;

  UPDATE public.storage_operations
  SET status = 'promoted', updated_at = now()
  WHERE id = v_op_id;

  UPDATE public.lesson_resources
  SET status = 'published', published_version_id = p_version_id, lock_version = lock_version + 1, updated_at = now()
  WHERE id = p_resource_id;

  INSERT INTO public.lesson_resource_reviews (resource_id, version_id, reviewer_id, action, reason)
  VALUES (p_resource_id, p_version_id, v_actor, 'published', 'Published by administrator');

  v_result := jsonb_build_object(
    'resource_id', p_resource_id,
    'status', 'published',
    'published_version_id', p_version_id,
    'published_path', v_target_path,
    'lock_version', v_res.lock_version + 1
  );

  PERFORM public.complete_idempotency_slot(v_actor, 'publish_resource_version', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8.9 unpublish_resource_version
CREATE OR REPLACE FUNCTION public.unpublish_resource_version(
  p_resource_id UUID,
  p_reason TEXT,
  p_expected_lock_version INT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_claimed JSONB;
  v_res RECORD;
  v_result JSONB;
BEGIN
  PERFORM public.assert_content_feature_flag('html_content_backend');
  PERFORM public.assert_content_feature_flag('html_content_publish');

  IF NOT has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can unpublish resources' USING ERRCODE = '42501';
  END IF;

  v_claimed := public.claim_idempotency_slot(v_actor, 'unpublish_resource_version', p_idempotency_key);
  IF v_claimed IS NOT NULL THEN
    RETURN v_claimed;
  END IF;

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'Resource not found' USING ERRCODE = '40400';
  END IF;

  IF v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Stale lock version' USING ERRCODE = '40900';
  END IF;

  IF v_res.status <> 'published' THEN
    RAISE EXCEPTION 'Resource is not published' USING ERRCODE = '40000';
  END IF;

  UPDATE public.lesson_resources
  SET status = 'approved', published_version_id = NULL, lock_version = lock_version + 1, updated_at = now()
  WHERE id = p_resource_id;

  INSERT INTO public.lesson_resource_reviews (resource_id, version_id, reviewer_id, action, reason)
  VALUES (p_resource_id, COALESCE(v_res.published_version_id, v_res.approved_version_id), v_actor, 'unpublished', COALESCE(p_reason, 'Unpublished by administrator'));

  v_result := jsonb_build_object(
    'resource_id', p_resource_id,
    'status', 'approved',
    'published_version_id', NULL,
    'lock_version', v_res.lock_version + 1
  );

  PERFORM public.complete_idempotency_slot(v_actor, 'unpublish_resource_version', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8.10 archive_lesson_resource
CREATE OR REPLACE FUNCTION public.archive_lesson_resource(
  p_resource_id UUID,
  p_reason TEXT,
  p_expected_lock_version INT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_claimed JSONB;
  v_res RECORD;
  v_target_ver UUID;
  v_result JSONB;
BEGIN
  PERFORM public.assert_content_feature_flag('html_content_backend');

  IF NOT has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can archive resources' USING ERRCODE = '42501';
  END IF;

  v_claimed := public.claim_idempotency_slot(v_actor, 'archive_lesson_resource', p_idempotency_key);
  IF v_claimed IS NOT NULL THEN
    RETURN v_claimed;
  END IF;

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'Resource not found' USING ERRCODE = '40400';
  END IF;

  IF v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Stale lock version' USING ERRCODE = '40900';
  END IF;

  v_target_ver := COALESCE(v_res.published_version_id, v_res.approved_version_id, v_res.current_draft_version_id);

  -- Safe clearing of pointer pointers when archiving if necessary
  UPDATE public.lesson_resources
  SET current_draft_version_id = NULL, approved_version_id = NULL, published_version_id = NULL, status = 'archived', lock_version = lock_version + 1, updated_at = now()
  WHERE id = p_resource_id;

  IF v_target_ver IS NOT NULL THEN
    INSERT INTO public.lesson_resource_reviews (resource_id, version_id, reviewer_id, action, reason)
    VALUES (p_resource_id, v_target_ver, v_actor, 'archived', COALESCE(p_reason, 'Archived by administrator'));
  END IF;

  v_result := jsonb_build_object(
    'resource_id', p_resource_id,
    'status', 'archived',
    'lock_version', v_res.lock_version + 1
  );

  PERFORM public.complete_idempotency_slot(v_actor, 'archive_lesson_resource', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8.11 rollback_published_resource_version
CREATE OR REPLACE FUNCTION public.rollback_published_resource_version(
  p_resource_id UUID,
  p_target_version_id UUID,
  p_expected_lock_version INT,
  p_reason TEXT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_claimed JSONB;
  v_res RECORD;
  v_ver RECORD;
  v_was_approved BOOLEAN;
  v_result JSONB;
BEGIN
  PERFORM public.assert_content_feature_flag('html_content_backend');
  PERFORM public.assert_content_feature_flag('html_content_publish');

  IF NOT has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can rollback versions' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR char_length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Mandatory detailed rollback reason required' USING ERRCODE = '40000';
  END IF;

  v_claimed := public.claim_idempotency_slot(v_actor, 'rollback_published_resource_version', p_idempotency_key);
  IF v_claimed IS NOT NULL THEN
    RETURN v_claimed;
  END IF;

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'Resource not found' USING ERRCODE = '40400';
  END IF;

  IF v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Stale lock version' USING ERRCODE = '40900';
  END IF;

  SELECT * INTO v_ver FROM public.lesson_resource_versions WHERE id = p_target_version_id AND resource_id = p_resource_id;
  IF v_ver.id IS NULL THEN
    RAISE EXCEPTION 'Target version does not belong to resource' USING ERRCODE = '40000';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.lesson_resource_reviews
    WHERE resource_id = p_resource_id AND version_id = p_target_version_id AND action = 'approved'
  ) INTO v_was_approved;

  IF NOT v_was_approved THEN
    RAISE EXCEPTION 'Target rollback version was never approved' USING ERRCODE = '42200';
  END IF;

  UPDATE public.lesson_resources
  SET status = 'published', published_version_id = p_target_version_id, lock_version = lock_version + 1, updated_at = now()
  WHERE id = p_resource_id;

  INSERT INTO public.lesson_resource_reviews (resource_id, version_id, reviewer_id, action, reason, details)
  VALUES (
    p_resource_id,
    p_target_version_id,
    v_actor,
    'rollback',
    p_reason,
    jsonb_build_object('previous_published_version_id', v_res.published_version_id, 'new_published_version_id', p_target_version_id)
  );

  v_result := jsonb_build_object(
    'resource_id', p_resource_id,
    'status', 'published',
    'published_version_id', p_target_version_id,
    'previous_published_version_id', v_res.published_version_id,
    'lock_version', v_res.lock_version + 1
  );

  PERFORM public.complete_idempotency_slot(v_actor, 'rollback_published_resource_version', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8.12 fetch_published_lesson_resources
CREATE OR REPLACE FUNCTION public.fetch_published_lesson_resources(
  p_lesson_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_access BOOLEAN;
  v_resources JSONB;
BEGIN
  PERFORM public.assert_content_feature_flag('html_content_backend');
  PERFORM public.assert_content_feature_flag('html_content_student_read');

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required for lesson resources' USING ERRCODE = '42501';
  END IF;

  v_access := public.can_access_lesson(p_lesson_id);
  IF NOT v_access THEN
    RAISE EXCEPTION 'Student has no access to this lesson' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', lr.id,
      'resource_code', COALESCE(lr.resource_code, lr.id::text),
      'resource_type', lr.resource_type,
      'title', lr.title,
      'description', lr.description,
      'sort_order', lr.sort_order,
      'entry_file', COALESCE(lrv.entry_file, 'index.html'),
      'content_sha256', lrv.content_sha256,
      'published_version_id', lr.published_version_id,
      'url', lr.url
    ) ORDER BY lr.sort_order ASC
  ), '[]'::jsonb)
  INTO v_resources
  FROM public.lesson_resources lr
  JOIN public.lesson_resource_versions lrv ON lrv.id = lr.published_version_id
  WHERE lr.lesson_id = p_lesson_id
    AND lr.status = 'published'
    AND lr.published_version_id IS NOT NULL;

  RETURN v_resources;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8.13 record_server_package_validation
CREATE OR REPLACE FUNCTION public.record_server_package_validation(
  p_version_id UUID,
  p_batch_id UUID,
  p_package_hash TEXT,
  p_scanner_version TEXT,
  p_findings JSONB,
  p_is_valid BOOLEAN,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_claimed JSONB;
  v_id UUID;
  v_result JSONB;
BEGIN
  PERFORM public.assert_content_feature_flag('html_content_backend');

  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'Unauthorized staff access' USING ERRCODE = '42501';
  END IF;

  v_claimed := public.claim_idempotency_slot(v_actor, 'record_server_package_validation', p_idempotency_key);
  IF v_claimed IS NOT NULL THEN
    RETURN v_claimed;
  END IF;

  INSERT INTO public.content_package_validations (
    version_id,
    batch_id,
    package_hash,
    scanner_version,
    findings,
    is_valid,
    validated_at,
    validated_by_server
  ) VALUES (
    p_version_id,
    p_batch_id,
    p_package_hash,
    COALESCE(p_scanner_version, 'v1-operational-server'),
    COALESCE(p_findings, '[]'::jsonb),
    p_is_valid,
    now(),
    true
  ) RETURNING id INTO v_id;

  v_result := jsonb_build_object(
    'validation_id', v_id,
    'version_id', p_version_id,
    'is_valid', p_is_valid,
    'package_hash', p_package_hash,
    'validated_by_server', true
  );

  PERFORM public.complete_idempotency_slot(v_actor, 'record_server_package_validation', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8.14 retry_storage_operation
CREATE OR REPLACE FUNCTION public.retry_storage_operation(
  p_previous_op_id UUID,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_claimed JSONB;
  v_prev RECORD;
  v_new_id UUID;
  v_new_retry INT;
  v_key TEXT;
  v_result JSONB;
BEGIN
  PERFORM public.assert_content_feature_flag('html_content_backend');

  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'Unauthorized staff access' USING ERRCODE = '42501';
  END IF;

  v_claimed := public.claim_idempotency_slot(v_actor, 'retry_storage_operation', p_idempotency_key);
  IF v_claimed IS NOT NULL THEN
    RETURN v_claimed;
  END IF;

  SELECT * INTO v_prev FROM public.storage_operations WHERE id = p_previous_op_id;
  IF v_prev.id IS NULL THEN
    RAISE EXCEPTION 'Previous storage operation not found' USING ERRCODE = '40400';
  END IF;

  IF v_prev.status <> 'failed' THEN
    RAISE EXCEPTION 'Can only retry failed storage operations' USING ERRCODE = '42200';
  END IF;

  v_new_retry := v_prev.retry_number + 1;
  v_key := COALESCE(p_idempotency_key, v_prev.idempotency_key || '_retry_' || v_new_retry::text);

  INSERT INTO public.storage_operations (
    parent_operation_id,
    operation_type,
    status,
    source_path,
    target_path,
    expected_hash,
    retry_number,
    attempt_count,
    idempotency_key
  ) VALUES (
    p_previous_op_id,
    v_prev.operation_type,
    'pending',
    v_prev.source_path,
    v_prev.target_path,
    v_prev.expected_hash,
    v_new_retry,
    1,
    v_key
  ) RETURNING id INTO v_new_id;

  v_result := jsonb_build_object(
    'operation_id', v_new_id,
    'parent_operation_id', p_previous_op_id,
    'retry_number', v_new_retry,
    'attempt_count', 1,
    'status', 'pending'
  );

  PERFORM public.complete_idempotency_slot(v_actor, 'retry_storage_operation', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 8.15 fetch_content_review_queue
CREATE OR REPLACE FUNCTION public.fetch_content_review_queue()
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_result JSONB;
BEGIN
  PERFORM public.assert_content_feature_flag('html_content_backend');

  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'Unauthorized staff access' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', lr.id,
      'resource_code', COALESCE(lr.resource_code, lr.id::text),
      'resource_type', lr.resource_type,
      'title', lr.title,
      'description', COALESCE(lr.description, ''),
      'status', lr.status,
      'lock_version', lr.lock_version,
      'current_draft_version_id', lr.current_draft_version_id,
      'approved_version_id', lr.approved_version_id,
      'published_version_id', lr.published_version_id,
      'lesson_title', COALESCE(l.title, 'درس عام'),
      'updated_at', lr.updated_at
    ) ORDER BY lr.updated_at DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM public.lesson_resources lr
  LEFT JOIN public.lessons l ON l.id = lr.lesson_id
  WHERE lr.status IN ('draft', 'in_review', 'approved', 'published', 'rejected');

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

--------------------------------------------------------------------------------
-- 9. PERMISSIONS & EXPLICIT EXECUTE GRANTS BY NAME (NO WILDCARD REVOKE ALL ON SCHEMA)
--------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.check_content_feature_flag FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_content_feature_flag FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_idempotency_slot FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_idempotency_slot FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.create_content_import_batch FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_content_upload FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_content_upload FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_content_package FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_resource_for_review FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.approve_resource_version FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_resource_version FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_resource_version FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unpublish_resource_version FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_lesson_resource FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rollback_published_resource_version FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fetch_published_lesson_resources FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_server_package_validation FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_storage_operation FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fetch_content_review_queue FROM PUBLIC, anon;

GRANT SELECT ON public.lesson_resources TO authenticated;
GRANT SELECT ON public.lesson_resource_versions TO authenticated;
GRANT SELECT ON public.lesson_resource_files TO authenticated;
GRANT SELECT ON public.lesson_resource_reviews TO authenticated;
GRANT SELECT ON public.lesson_resource_events TO authenticated;
GRANT SELECT ON public.content_import_batches TO authenticated;
GRANT SELECT ON public.content_import_rows TO authenticated;
GRANT SELECT ON public.storage_operations TO authenticated;
GRANT SELECT ON public.content_feature_flags TO authenticated;
GRANT SELECT ON public.content_package_validations TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_content_import_batch TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_content_upload TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_content_upload TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_content_package TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_resource_for_review TO authenticated;

GRANT EXECUTE ON FUNCTION public.approve_resource_version TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_resource_version TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_resource_version TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_resource_version TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_lesson_resource TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_published_resource_version TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_published_lesson_resources TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_server_package_validation TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_storage_operation TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_content_review_queue TO authenticated;

COMMIT;
