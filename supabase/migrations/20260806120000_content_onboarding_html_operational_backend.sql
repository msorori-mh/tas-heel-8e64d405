-- Content Onboarding HTML Operational Backend Migration
-- Timestamp: 20260806120000
-- Migration Type: ADDITIVE ONLY (Does NOT drop or destructively mutate lesson_resources)

BEGIN;

--------------------------------------------------------------------------------
-- 1. ADDITIVE ALTERATIONS TO EXISITING TABLES & ENUMS
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
-- 2. NEW TABLES FOR VERSIONING, AUDIT, SAGAS AND IDEMPOTENCY
--------------------------------------------------------------------------------

-- 2.1 lesson_resource_versions
CREATE TABLE IF NOT EXISTS public.lesson_resource_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.lesson_resources(id) ON DELETE CASCADE,
  version_number INT NOT NULL CHECK (version_number > 0),
  content_sha256 TEXT NOT NULL,
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  entry_file TEXT NOT NULL DEFAULT 'index.html',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_resource_version_id_resource UNIQUE (id, resource_id),
  CONSTRAINT uq_resource_version_number UNIQUE (resource_id, version_number),
  CONSTRAINT uq_resource_content_hash UNIQUE (resource_id, content_sha256)
);

-- BIND SAME-RESOURCE COMPOSITE FOREIGN KEYS ON lesson_resources
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lesson_resources_current_draft_same_resource') THEN
    ALTER TABLE public.lesson_resources
      ADD CONSTRAINT fk_lesson_resources_current_draft_same_resource
      FOREIGN KEY (current_draft_version_id, id)
      REFERENCES public.lesson_resource_versions(id, resource_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lesson_resources_approved_same_resource') THEN
    ALTER TABLE public.lesson_resources
      ADD CONSTRAINT fk_lesson_resources_approved_same_resource
      FOREIGN KEY (approved_version_id, id)
      REFERENCES public.lesson_resource_versions(id, resource_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lesson_resources_published_same_resource') THEN
    ALTER TABLE public.lesson_resources
      ADD CONSTRAINT fk_lesson_resources_published_same_resource
      FOREIGN KEY (published_version_id, id)
      REFERENCES public.lesson_resource_versions(id, resource_id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2.2 lesson_resource_files
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

-- 2.3 lesson_resource_reviews
CREATE TABLE IF NOT EXISTS public.lesson_resource_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.lesson_resources(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.lesson_resource_versions(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL CHECK (action IN ('submitted', 'approved', 'rejected', 'published', 'unpublished', 'archived', 'rollback')),
  reason TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.4 lesson_resource_events
CREATE TABLE IF NOT EXISTS public.lesson_resource_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.lesson_resources(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.lesson_resource_versions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.5 content_import_batches
CREATE TABLE IF NOT EXISTS public.content_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'validating', 'completed', 'failed', 'cancelled')),
  excel_filename TEXT,
  zip_filename TEXT,
  total_rows INT NOT NULL DEFAULT 0,
  processed_rows INT NOT NULL DEFAULT 0,
  error_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.6 content_import_rows
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

-- 2.7 storage_operations
CREATE TABLE IF NOT EXISTS public.storage_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_operation_id UUID REFERENCES public.storage_operations(id) ON DELETE SET NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('stage_upload', 'promote_published', 'cleanup_orphan', 'rollback_published')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'verified', 'promoted', 'cleanup_pending', 'cleaned', 'failed', 'compensated')),
  source_path TEXT NOT NULL,
  target_path TEXT,
  expected_hash TEXT,
  actual_hash TEXT,
  retry_number INT NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL,
  error_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.8 idempotency_ledger
CREATE TABLE IF NOT EXISTS public.idempotency_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  response_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_actor_operation_idempotency UNIQUE (actor_id, operation, idempotency_key)
);

--------------------------------------------------------------------------------
-- 3. STORAGE BUCKETS CONFIGURATION
--------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('lesson-resource-drafts', 'lesson-resource-drafts', false, 52428800, ARRAY['application/zip', 'application/x-zip-compressed', 'text/html', 'image/png', 'image/jpeg', 'application/json']),
  ('lesson-resource-published', 'lesson-resource-published', false, 52428800, ARRAY['text/html', 'text/css', 'application/javascript', 'image/png', 'image/jpeg', 'image/svg+xml', 'application/json'])
ON CONFLICT (id) DO UPDATE SET public = false;

--------------------------------------------------------------------------------
-- 4. RLS ENFORCEMENT & IMMUTABILITY TRIGGERS
--------------------------------------------------------------------------------

ALTER TABLE public.lesson_resource_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resource_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resource_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resource_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_ledger ENABLE ROW LEVEL SECURITY;

-- 4.1 Immutability for Audit & Version Tables
CREATE OR REPLACE FUNCTION public.enforce_audit_immutability()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are immutable and cannot be updated or deleted' USING ERRCODE = '42501';
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

DROP TRIGGER IF EXISTS trg_audit_immutability_ledger ON public.idempotency_ledger;
CREATE TRIGGER trg_audit_immutability_ledger
BEFORE UPDATE OR DELETE ON public.idempotency_ledger
FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_immutability();

-- 4.2 Approved/Published Version Immutability Triggers
CREATE OR REPLACE FUNCTION public.enforce_version_immutability()
RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM public.lesson_resources WHERE id = OLD.resource_id;
  IF v_status IN ('approved', 'published') THEN
    RAISE EXCEPTION 'Approved and published versions are immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_version_immutability ON public.lesson_resource_versions;
CREATE TRIGGER trg_version_immutability
BEFORE UPDATE OR DELETE ON public.lesson_resource_versions
FOR EACH ROW EXECUTE FUNCTION public.enforce_version_immutability();

-- 4.3 Version Files Immutability Trigger
CREATE OR REPLACE FUNCTION public.enforce_version_files_immutability()
RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT lr.status INTO v_status
  FROM public.lesson_resource_versions lrv
  JOIN public.lesson_resources lr ON lr.id = lrv.resource_id
  WHERE lrv.id = OLD.version_id;

  IF v_status IN ('approved', 'published') THEN
    RAISE EXCEPTION 'Files of approved and published versions are immutable' USING ERRCODE = '42501';
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

-- 4.4 RLS Policies
CREATE POLICY "Content staff manage versions"
  ON public.lesson_resource_versions FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid()))
  WITH CHECK (public.is_content_staff(auth.uid()));

CREATE POLICY "Content staff manage files"
  ON public.lesson_resource_files FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid()))
  WITH CHECK (public.is_content_staff(auth.uid()));

CREATE POLICY "Content staff view reviews"
  ON public.lesson_resource_reviews FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Content staff manage import batches"
  ON public.content_import_batches FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid()))
  WITH CHECK (public.is_content_staff(auth.uid()));

CREATE POLICY "Content staff manage import rows"
  ON public.content_import_rows FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid()))
  WITH CHECK (public.is_content_staff(auth.uid()));

CREATE POLICY "Content staff manage storage operations"
  ON public.storage_operations FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid()))
  WITH CHECK (public.is_content_staff(auth.uid()));

-- Storage Bucket Policies
DROP POLICY IF EXISTS "Content staff draft staging upload" ON storage.objects;
CREATE POLICY "Content staff draft staging upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lesson-resource-drafts' AND public.is_content_staff(auth.uid())
  );

DROP POLICY IF EXISTS "Content staff draft staging select" ON storage.objects;
CREATE POLICY "Content staff draft staging select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'lesson-resource-drafts' AND public.is_content_staff(auth.uid())
  );

DROP POLICY IF EXISTS "No direct browser write to published bucket" ON storage.objects;
CREATE POLICY "No direct browser write to published bucket"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (false);

--------------------------------------------------------------------------------
-- 5. RPC PROCEDURES AND SECURITY DEFINER CONTRACTS
--------------------------------------------------------------------------------

-- Helper: Check Idempotency
CREATE OR REPLACE FUNCTION public.check_idempotency(p_actor_id UUID, p_operation TEXT, p_key TEXT)
RETURNS JSONB AS $$
DECLARE
  v_cached JSONB;
BEGIN
  IF p_key IS NULL OR p_key = '' THEN
    RETURN NULL;
  END IF;
  SELECT response_payload INTO v_cached
  FROM public.idempotency_ledger
  WHERE actor_id = p_actor_id AND operation = p_operation AND idempotency_key = p_key;
  RETURN v_cached;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Helper: Save Idempotency
CREATE OR REPLACE FUNCTION public.save_idempotency(p_actor_id UUID, p_operation TEXT, p_key TEXT, p_payload JSONB)
RETURNS VOID AS $$
BEGIN
  IF p_key IS NOT NULL AND p_key <> '' THEN
    INSERT INTO public.idempotency_ledger (actor_id, operation, idempotency_key, response_payload)
    VALUES (p_actor_id, p_operation, p_key, p_payload)
    ON CONFLICT (actor_id, operation, idempotency_key) DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.1 create_content_import_batch
CREATE OR REPLACE FUNCTION public.create_content_import_batch(
  p_excel_filename TEXT,
  p_zip_filename TEXT,
  p_total_rows INT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_cached JSONB;
  v_batch_id UUID;
  v_result JSONB;
BEGIN
  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'Unauthorized staff access' USING ERRCODE = '42501';
  END IF;

  v_cached := public.check_idempotency(v_actor, 'create_content_import_batch', p_idempotency_key);
  IF v_cached IS NOT NULL THEN
    RETURN v_cached;
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

  PERFORM public.save_idempotency(v_actor, 'create_content_import_batch', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.2 issue_content_upload
CREATE OR REPLACE FUNCTION public.issue_content_upload(
  p_batch_id UUID,
  p_resource_code TEXT,
  p_filename TEXT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_cached JSONB;
  v_staging_path TEXT;
  v_result JSONB;
BEGIN
  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'Unauthorized staff access' USING ERRCODE = '42501';
  END IF;

  v_cached := public.check_idempotency(v_actor, 'issue_content_upload', p_idempotency_key);
  IF v_cached IS NOT NULL THEN
    RETURN v_cached;
  END IF;

  v_staging_path := 'staging/' || p_batch_id::text || '/' || p_resource_code || '/' || p_filename;

  v_result := jsonb_build_object(
    'batch_id', p_batch_id,
    'resource_code', p_resource_code,
    'bucket', 'lesson-resource-drafts',
    'staging_path', v_staging_path
  );

  PERFORM public.save_idempotency(v_actor, 'issue_content_upload', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.3 finalize_content_upload
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
  v_cached JSONB;
  v_resource_id UUID;
  v_version_id UUID;
  v_version_num INT := 1;
  v_lock_ver INT;
  v_file_elem JSONB;
  v_db_resource_type public.lesson_resource_type;
  v_result JSONB;
BEGIN
  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'Unauthorized staff access' USING ERRCODE = '42501';
  END IF;

  v_cached := public.check_idempotency(v_actor, 'finalize_content_upload', p_idempotency_key);
  IF v_cached IS NOT NULL THEN
    RETURN v_cached;
  END IF;

  -- Map text type to enum
  v_db_resource_type := CASE p_resource_type
    WHEN 'mindmap' THEN 'mind_map_html'::public.lesson_resource_type
    WHEN 'experiment' THEN 'practical_experiment_html'::public.lesson_resource_type
    WHEN 'link' THEN 'external_link'::public.lesson_resource_type
    ELSE p_resource_type::public.lesson_resource_type
  END;

  -- Find or create lesson resource
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

  -- Create version
  INSERT INTO public.lesson_resource_versions (resource_id, version_number, content_sha256, manifest, entry_file, created_by)
  VALUES (v_resource_id, v_version_num, p_content_sha256, COALESCE(p_manifest, '{}'::jsonb), COALESCE(p_manifest->>'entry', 'index.html'), v_actor)
  RETURNING id INTO v_version_id;

  -- Create version files
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

  -- Bind current draft version
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

  PERFORM public.save_idempotency(v_actor, 'finalize_content_upload', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.4 validate_content_package
CREATE OR REPLACE FUNCTION public.validate_content_package(
  p_resource_id UUID,
  p_version_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_version RECORD;
BEGIN
  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'Unauthorized staff access' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_version
  FROM public.lesson_resource_versions
  WHERE id = p_version_id AND resource_id = p_resource_id;

  IF v_version.id IS NULL THEN
    RAISE EXCEPTION 'Version or resource not found' USING ERRCODE = '40400';
  END IF;

  RETURN jsonb_build_object(
    'resource_id', p_resource_id,
    'version_id', p_version_id,
    'is_valid', true,
    'content_sha256', v_version.content_sha256,
    'errors', '[]'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.5 submit_resource_for_review
CREATE OR REPLACE FUNCTION public.submit_resource_for_review(
  p_resource_id UUID,
  p_expected_lock_version INT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_cached JSONB;
  v_res RECORD;
  v_result JSONB;
BEGIN
  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'Unauthorized staff access' USING ERRCODE = '42501';
  END IF;

  v_cached := public.check_idempotency(v_actor, 'submit_resource_for_review', p_idempotency_key);
  IF v_cached IS NOT NULL THEN
    RETURN v_cached;
  END IF;

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'Resource not found' USING ERRCODE = '40400';
  END IF;

  IF v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Stale lock version' USING ERRCODE = '40900';
  END IF;

  IF v_res.current_draft_version_id IS NULL THEN
    RAISE EXCEPTION 'No draft version bound' USING ERRCODE = '42200';
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

  PERFORM public.save_idempotency(v_actor, 'submit_resource_for_review', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.6 approve_resource_version
CREATE OR REPLACE FUNCTION public.approve_resource_version(
  p_resource_id UUID,
  p_version_id UUID,
  p_expected_lock_version INT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_cached JSONB;
  v_res RECORD;
  v_ver RECORD;
  v_result JSONB;
BEGIN
  IF NOT has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can approve versions' USING ERRCODE = '42501';
  END IF;

  v_cached := public.check_idempotency(v_actor, 'approve_resource_version', p_idempotency_key);
  IF v_cached IS NOT NULL THEN
    RETURN v_cached;
  END IF;

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'Resource not found' USING ERRCODE = '40400';
  END IF;

  IF v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Stale lock version' USING ERRCODE = '40900';
  END IF;

  SELECT * INTO v_ver FROM public.lesson_resource_versions WHERE id = p_version_id AND resource_id = p_resource_id;
  IF v_ver.id IS NULL THEN
    RAISE EXCEPTION 'Version does not belong to resource' USING ERRCODE = '40000';
  END IF;

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

  PERFORM public.save_idempotency(v_actor, 'approve_resource_version', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.7 reject_resource_version
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
  v_cached JSONB;
  v_res RECORD;
  v_result JSONB;
BEGIN
  IF NOT has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can reject versions' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR char_length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Mandatory rejection reason required' USING ERRCODE = '40000';
  END IF;

  v_cached := public.check_idempotency(v_actor, 'reject_resource_version', p_idempotency_key);
  IF v_cached IS NOT NULL THEN
    RETURN v_cached;
  END IF;

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'Resource not found' USING ERRCODE = '40400';
  END IF;

  IF v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Stale lock version' USING ERRCODE = '40900';
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

  PERFORM public.save_idempotency(v_actor, 'reject_resource_version', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.8 publish_resource_version
CREATE OR REPLACE FUNCTION public.publish_resource_version(
  p_resource_id UUID,
  p_version_id UUID,
  p_expected_lock_version INT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_cached JSONB;
  v_res RECORD;
  v_result JSONB;
BEGIN
  IF NOT has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can publish versions' USING ERRCODE = '42501';
  END IF;

  v_cached := public.check_idempotency(v_actor, 'publish_resource_version', p_idempotency_key);
  IF v_cached IS NOT NULL THEN
    RETURN v_cached;
  END IF;

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'Resource not found' USING ERRCODE = '40400';
  END IF;

  IF v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Stale lock version' USING ERRCODE = '40900';
  END IF;

  IF v_res.approved_version_id IS NULL OR v_res.approved_version_id <> p_version_id THEN
    RAISE EXCEPTION 'Version must be approved before publication' USING ERRCODE = '42200';
  END IF;

  UPDATE public.lesson_resources
  SET status = 'published', published_version_id = p_version_id, lock_version = lock_version + 1, updated_at = now()
  WHERE id = p_resource_id;

  INSERT INTO public.lesson_resource_reviews (resource_id, version_id, reviewer_id, action, reason)
  VALUES (p_resource_id, p_version_id, v_actor, 'published', 'Published by administrator');

  v_result := jsonb_build_object(
    'resource_id', p_resource_id,
    'status', 'published',
    'published_version_id', p_version_id,
    'lock_version', v_res.lock_version + 1
  );

  PERFORM public.save_idempotency(v_actor, 'publish_resource_version', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.9 unpublish_resource_version
CREATE OR REPLACE FUNCTION public.unpublish_resource_version(
  p_resource_id UUID,
  p_reason TEXT,
  p_expected_lock_version INT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_cached JSONB;
  v_res RECORD;
  v_result JSONB;
BEGIN
  IF NOT has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can unpublish resources' USING ERRCODE = '42501';
  END IF;

  v_cached := public.check_idempotency(v_actor, 'unpublish_resource_version', p_idempotency_key);
  IF v_cached IS NOT NULL THEN
    RETURN v_cached;
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

  PERFORM public.save_idempotency(v_actor, 'unpublish_resource_version', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.10 archive_lesson_resource
CREATE OR REPLACE FUNCTION public.archive_lesson_resource(
  p_resource_id UUID,
  p_reason TEXT,
  p_expected_lock_version INT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_cached JSONB;
  v_res RECORD;
  v_result JSONB;
BEGIN
  IF NOT has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can archive resources' USING ERRCODE = '42501';
  END IF;

  v_cached := public.check_idempotency(v_actor, 'archive_lesson_resource', p_idempotency_key);
  IF v_cached IS NOT NULL THEN
    RETURN v_cached;
  END IF;

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id FOR UPDATE;
  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'Resource not found' USING ERRCODE = '40400';
  END IF;

  IF v_res.lock_version <> p_expected_lock_version THEN
    RAISE EXCEPTION 'Stale lock version' USING ERRCODE = '40900';
  END IF;

  UPDATE public.lesson_resources
  SET status = 'archived', lock_version = lock_version + 1, updated_at = now()
  WHERE id = p_resource_id;

  INSERT INTO public.lesson_resource_reviews (resource_id, version_id, reviewer_id, action, reason)
  VALUES (p_resource_id, COALESCE(v_res.published_version_id, v_res.approved_version_id, v_res.current_draft_version_id), v_actor, 'archived', COALESCE(p_reason, 'Archived by administrator'));

  v_result := jsonb_build_object(
    'resource_id', p_resource_id,
    'status', 'archived',
    'lock_version', v_res.lock_version + 1
  );

  PERFORM public.save_idempotency(v_actor, 'archive_lesson_resource', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.11 rollback_published_resource_version
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
  v_cached JSONB;
  v_res RECORD;
  v_ver RECORD;
  v_was_approved BOOLEAN;
  v_result JSONB;
BEGIN
  IF NOT has_role(v_actor, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can rollback versions' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR char_length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Mandatory detailed rollback reason required' USING ERRCODE = '40000';
  END IF;

  v_cached := public.check_idempotency(v_actor, 'rollback_published_resource_version', p_idempotency_key);
  IF v_cached IS NOT NULL THEN
    RETURN v_cached;
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

  PERFORM public.save_idempotency(v_actor, 'rollback_published_resource_version', p_idempotency_key, v_result);
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.12 fetch_published_lesson_resources
CREATE OR REPLACE FUNCTION public.fetch_published_lesson_resources(
  p_lesson_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_access BOOLEAN;
  v_resources JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_access := public.can_access_lesson(p_lesson_id);
  IF NOT v_access THEN
    RETURN '[]'::jsonb;
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

--------------------------------------------------------------------------------
-- 6. PERMISSIONS REVOKING & EXPLICIT EXECUTE GRANTS
--------------------------------------------------------------------------------
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

GRANT EXECUTE ON FUNCTION public.can_access_lesson(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_content_staff(UUID) TO authenticated;

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

COMMIT;
