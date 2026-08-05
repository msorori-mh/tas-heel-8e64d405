# Database & Operational Migration Proposal for HTML Content Backend (v0.5)

**Document ID:** `CONTENT-ONBOARDING-HTML-MIGRATION-PROPOSAL-03`
**Status:** PROPOSAL ONLY (ZERO Migrations Applied, ZERO DB Writes Executed)
**Target Schema:** `public`
**Base Branch:** `origin/main`
**Reference Branch:** `origin/feat/content-onboarding-html-interactive-mvp-01`

---

## 1. Executive Summary & Migration Strategy

This proposal details the additive database migration phases, schema enhancements, 10 operational server RPC contracts, fail-closed guards, and rollback procedures required for interactive HTML content (`mind_map_html`, `practical_experiment_html`) within the Tas-heel platform.

> **CRITICAL COMPLIANCE RULES:**
> - **Additive Migration Rule**: The `lesson_resources` table **already exists** in the database. Using `CREATE TABLE IF NOT EXISTS lesson_resources` as a migration conversion is strictly forbidden. Schema extension must be executed via phased additive `ALTER TABLE` statements.
> - **No Deletion of Existing Table**: Dropping `lesson_resources` in rollback or migration scripts is strictly prohibited.
> - **No Enum Value Drop**: PostgreSQL does not support removing enum values. Rollback must map or ignore new enum values rather than attempting invalid enum drop operations.
> - **Audit Trail Preservation**: No `ON DELETE CASCADE` on versions, reviews, events, or import tables.

---

## 2. Existing Baseline vs. Migration Targets

| Aspect | Current Baseline (`origin/main`) | Operational Migration Target (v0.5) |
| :--- | :--- | :--- |
| **Existing Table** | `lesson_resources` already exists | Preserved; altered via additive `ALTER TABLE` |
| **Resource Types** | Static (`pdf`, `image`, `video`, `link`) | Interactive (`mind_map_html`, `practical_experiment_html`) + `external_link` |
| **Versioning** | Single active column | Snapshot tables (`lesson_resource_versions`) + Explicit FKs |
| **Package Assets** | Single URL | Multi-file manifest (`lesson_resource_files`) |
| **Storage Buckets** | Generic static content | `lesson-resource-drafts` (Private) & `lesson-resource-published` (Private) |
| **MVP Roles** | Legacy roles | `content_manager` (Draft/Upload), `admin` (Approve/Publish), `student` (Read) |
| **Concurrency** | Basic timestamps | CAS `lock_version` + `idempotency_ledger` |

---

## 3. Phased Additive Migration Plan

### Phase 1: Audit Existing Schema
Inspect existing `public.lesson_resources` table columns, indices, and constraints to ensure compatibility with additive columns.

### Phase 2: Additive Type & Enum Extensions
```sql
-- Additive extension of lesson_resource_type enum
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'mind_map_html';
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'practical_experiment_html';
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'summary_html';
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'external_link';

-- Create new status and action enums
DO $$ BEGIN
  CREATE TYPE public.lesson_resource_status AS ENUM ('draft', 'in_review', 'approved', 'published', 'rejected', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.review_action AS ENUM ('submitted', 'approved', 'rejected', 'published', 'unpublished', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.import_batch_status AS ENUM ('created', 'uploading', 'uploaded', 'validating', 'dry_run_passed', 'dry_run_failed', 'submitting', 'submitted', 'partially_failed', 'completed', 'failed', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;
```

### Phase 3: Additive Column Enhancements on `lesson_resources`
```sql
-- Add new operational columns to pre-existing lesson_resources table
ALTER TABLE public.lesson_resources
  ADD COLUMN IF NOT EXISTS resource_code VARCHAR(64) UNIQUE,
  ADD COLUMN IF NOT EXISTS current_draft_version_id UUID,
  ADD COLUMN IF NOT EXISTS approved_version_id UUID,
  ADD COLUMN IF NOT EXISTS published_version_id UUID,
  ADD COLUMN IF NOT EXISTS lock_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status public.lesson_resource_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS orientation VARCHAR(10) NOT NULL DEFAULT 'auto' CHECK (orientation IN ('auto', 'portrait', 'landscape')),
  ADD COLUMN IF NOT EXISTS height_mode VARCHAR(10) NOT NULL DEFAULT 'viewport' CHECK (height_mode IN ('fixed', 'viewport', 'content')),
  ADD COLUMN IF NOT EXISTS completion_mode VARCHAR(20) NOT NULL DEFAULT 'view' CHECK (completion_mode IN ('view', 'interaction_event', 'manual_review')),
  ADD COLUMN IF NOT EXISTS completion_event VARCHAR(30) CHECK (completion_event IN ('experiment_started', 'step_completed', 'experiment_completed')),
  ADD COLUMN IF NOT EXISTS minimum_interaction_seconds INTEGER DEFAULT 0;
```

### Phase 4: Create New Snapshot & Audit Tables
```sql
-- 1. lesson_resource_versions (NO CASCADE on parent resource)
CREATE TABLE IF NOT EXISTS public.lesson_resource_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.lesson_resources(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  entry_file TEXT NOT NULL DEFAULT 'index.html',
  content_sha256 CHAR(64) NOT NULL,
  package_size_compressed BIGINT NOT NULL,
  package_size_uncompressed BIGINT NOT NULL,
  file_count INTEGER NOT NULL,
  csp_header TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_resource_version_number UNIQUE(resource_id, version_number),
  CONSTRAINT uq_resource_content_sha256 UNIQUE(resource_id, content_sha256),
  CONSTRAINT uq_resource_version_id_resource UNIQUE(id, resource_id)
);

-- 2. Add composite same-resource FKs back to lesson_resources safely
-- Composite FKs guarantee that current_draft_version_id, approved_version_id, and published_version_id
-- point ONLY to a version belonging to the SAME parent lesson_resources row (id).
-- NULL handling: MATCH SIMPLE allows NULL values when pointers are unassigned.
-- Order & cycles: lesson_resources master created -> lesson_resource_versions created with UNIQUE(id, resource_id) -> composite FKs added with DEFERRABLE.
-- Backfill: ADD CONSTRAINT NOT VALID during migration, backfilled, followed by VALIDATE CONSTRAINT.
ALTER TABLE public.lesson_resources
  ADD CONSTRAINT fk_lesson_resources_draft_same_resource FOREIGN KEY (current_draft_version_id, id) REFERENCES public.lesson_resource_versions(id, resource_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT fk_lesson_resources_approved_same_resource FOREIGN KEY (approved_version_id, id) REFERENCES public.lesson_resource_versions(id, resource_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT fk_lesson_resources_published_same_resource FOREIGN KEY (published_version_id, id) REFERENCES public.lesson_resource_versions(id, resource_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- 3. lesson_resource_files
CREATE TABLE IF NOT EXISTS public.lesson_resource_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.lesson_resource_versions(id) ON DELETE RESTRICT,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  content_sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_version_file_path UNIQUE(version_id, file_path)
);

-- 4. lesson_resource_reviews
CREATE TABLE IF NOT EXISTS public.lesson_resource_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.lesson_resources(id) ON DELETE RESTRICT,
  version_id UUID NOT NULL REFERENCES public.lesson_resource_versions(id) ON DELETE RESTRICT,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action public.review_action NOT NULL,
  rejection_reason TEXT,
  security_scan_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. lesson_resource_events
CREATE TABLE IF NOT EXISTS public.lesson_resource_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  resource_id UUID NOT NULL REFERENCES public.lesson_resources(id) ON DELETE RESTRICT,
  resource_version_id UUID NOT NULL REFERENCES public.lesson_resource_versions(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL,
  event_type VARCHAR(30) NOT NULL,
  session_nonce UUID NOT NULL,
  event_sequence INTEGER NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_event_sequence UNIQUE(resource_version_id, session_nonce, event_sequence)
);

-- 6. content_import_batches & content_import_rows
CREATE TABLE IF NOT EXISTS public.content_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code VARCHAR(64) NOT NULL UNIQUE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  status public.import_batch_status NOT NULL DEFAULT 'created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.content_import_batches(id) ON DELETE RESTRICT,
  row_number INTEGER NOT NULL,
  resource_code VARCHAR(64) NOT NULL,
  raw_payload JSONB NOT NULL,
  is_valid BOOLEAN NOT NULL DEFAULT true,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_batch_row_number UNIQUE(batch_id, row_number)
);

-- 8. storage_operations (Storage Operation Ledger)
CREATE TABLE IF NOT EXISTS public.storage_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.content_import_batches(id) ON DELETE RESTRICT,
  resource_version_id UUID REFERENCES public.lesson_resource_versions(id) ON DELETE RESTRICT,
  operation_type VARCHAR(50) NOT NULL,
  source_path TEXT,
  target_path TEXT,
  expected_hash CHAR(64),
  status public.storage_operation_status NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 9. idempotency_ledger
CREATE TABLE IF NOT EXISTS public.idempotency_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation VARCHAR(64) NOT NULL,
  idempotency_key TEXT NOT NULL,
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_actor_operation_idempotency UNIQUE(actor_id, operation, idempotency_key)
);
```

### Phase 4.1: Trigger-based Published Immutability
```sql
-- 1. Immutability trigger for lesson_resource_versions
-- Evaluates parent resource status and version pointers using OLD.resource_id (valid column on versions table).
CREATE OR REPLACE FUNCTION public.fn_ensure_immutable_resource_version()
RETURNS TRIGGER AS $$
DECLARE
  v_is_locked BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.lesson_resources lr
    WHERE lr.id = OLD.resource_id
      AND (
        lr.approved_version_id = OLD.id
        OR lr.published_version_id = OLD.id
        OR (lr.current_draft_version_id = OLD.id AND lr.status IN ('approved', 'published'))
      )
  ) INTO v_is_locked;

  IF v_is_locked THEN
    RAISE EXCEPTION 'PUBLISHED_VERSION_IMMUTABLE: Cannot modify or delete an approved or published version (version_id: %, resource_id: %). Create a new version instead.', OLD.id, OLD.resource_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ensure_version_published_immutable
BEFORE UPDATE OR DELETE ON public.lesson_resource_versions
FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_immutable_resource_version();

-- 2. Immutability trigger for lesson_resource_files
-- Uses OLD.version_id with explicit JOINs to lesson_resource_versions and lesson_resources.
-- Does NOT reference non-existent OLD.status, OLD.published_version_id, or OLD.resource_id on lesson_resource_files.
CREATE OR REPLACE FUNCTION public.fn_ensure_immutable_resource_file()
RETURNS TRIGGER AS $$
DECLARE
  v_is_locked BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.lesson_resource_versions lrv
    JOIN public.lesson_resources lr ON lr.id = lrv.resource_id
    WHERE lrv.id = OLD.version_id
      AND (
        lr.approved_version_id = lrv.id
        OR lr.published_version_id = lrv.id
        OR (lr.current_draft_version_id = lrv.id AND lr.status IN ('approved', 'published'))
      )
  ) INTO v_is_locked;

  IF v_is_locked THEN
    RAISE EXCEPTION 'PUBLISHED_FILE_IMMUTABLE: Cannot modify or delete files belonging to an approved or published version (version_id: %). Create a new version instead.', OLD.version_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ensure_file_published_immutable
BEFORE UPDATE OR DELETE ON public.lesson_resource_files
FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_immutable_resource_file();
```

### Phase 5: Backfill Data
Backfill legacy `lesson_resources` rows with default `lock_version = 1`, generate `resource_code` where missing, and apply type compatibility mapping (`mindmap` → `mind_map_html`, `experiment` → `practical_experiment_html`, `link` → `external_link`).

### Phase 6: Validate & Enforce Constraints
Apply `NOT NULL` constraints and index validation checks.

### Phase 7: Feature-Flag Cutover
Enable runtime feature flag `ENABLE_HTML_LESSON_RESOURCES=true`.

---

## 4. Operational Server RPC Contracts (11 RPC Specifications)

All RPCs are defined with `SECURITY DEFINER`, fixed `SET search_path = public, pg_temp`, `REVOKE ALL FROM PUBLIC`, explicit caller identity checks from `auth.uid()`, idempotency validation, CAS locking, explicit transaction boundaries, error contracts, and audit logging.

---

### Contract 1: `create_import_batch`
- **Caller Identity**: `auth.uid()` (Must have role `admin` or `content_manager`).
- **Security & Path**: `SECURITY DEFINER SET search_path = public, pg_temp`.
- **Grants/Revokes**: `REVOKE ALL ON FUNCTION public.create_import_batch FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.create_import_batch TO authenticated;`
- **Transaction Boundary**: Single atomic DB block.
- **Inputs**: `p_batch_code TEXT`, `p_total_rows INT`, `p_idempotency_key TEXT`.
- **Validations**: Check caller role; check `p_total_rows > 0`; check `p_idempotency_key`.
- **Idempotency**: Check `idempotency_ledger` for `(auth.uid(), 'create_import_batch', p_idempotency_key)`. Return cached UUID if present.
- **Locking/CAS**: N/A.
- **Outputs**: `UUID` (batch_id).
- **Error Contract**: `UNAUTHORIZED` (403), `DUPLICATE_BATCH_CODE` (409).
- **Audit**: Logged in `content_import_batches`.

---

### Contract 2: `finalize_uploaded_package`
- **Caller Identity**: `auth.uid()` (Must have role `admin` or `content_manager`).
- **Security & Path**: `SECURITY DEFINER SET search_path = public, pg_temp`.
- **Grants/Revokes**: `REVOKE ALL ON FUNCTION public.finalize_uploaded_package FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.finalize_uploaded_package TO authenticated;`
- **Transaction Boundary**: Single atomic DB block.
- **Inputs**: `p_batch_id UUID`, `p_resource_code TEXT`, `p_content_sha256 CHAR(64)`, `p_package_size_compressed BIGINT`, `p_package_size_uncompressed BIGINT`, `p_file_count INT`, `p_files JSONB`, `p_idempotency_key TEXT`.
- **Validations**: Verify staging file completion, SHA-256 hash match, zip payload size limits, MIME whitelists, and absence of answer keys.
- **Idempotency**: Check `idempotency_ledger`.
- **Locking/CAS**: N/A.
- **Outputs**: `JSONB` (`{ version_id: UUID, resource_id: UUID, version_number: INT }`).
- **Error Contract**: `HASH_MISMATCH` (400), `ANSWER_KEY_DETECTED` (422), `UNAUTHORIZED` (403).
- **Audit**: Inserts version into `lesson_resource_versions` and file manifests into `lesson_resource_files`.

---

### Contract 3: `validate_package`
- **Caller Identity**: `auth.uid()` (Must have role `admin` or `content_manager`).
- **Security & Path**: `SECURITY DEFINER SET search_path = public, pg_temp`.
- **Grants/Revokes**: `REVOKE ALL ON FUNCTION public.validate_package FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.validate_package TO authenticated;`
- **Transaction Boundary**: Read-only validation query.
- **Inputs**: `p_version_id UUID`.
- **Validations**: Runs preflight security scanner. Prohibits answer key and explanation leakage inside HTML, JSON, JavaScript, manifest, inline scripts, and local assets. Scans and REJECTS forbidden fields and patterns: `correct_index`, `correct_answer`, `answer_key`, `hashed_answer`, `explanation`, `answer_explanation`, `correct_explanation`, `solution_key`. Ensures student iframe payloads contain zero explanations or hidden answer keys, and mandates that post-reveal educational explanations are retrieved strictly via server/application paths outside the content package.
- **Outputs**: `JSONB` (`{ is_valid: BOOLEAN, findings: ARRAY }`).
- **Error Contract**: `VERSION_NOT_FOUND` (404).

---

### Contract 4: `submit_for_review`
- **Caller Identity**: `auth.uid()` (Must have role `admin` or `content_manager`).
- **Security & Path**: `SECURITY DEFINER SET search_path = public, pg_temp`.
- **Grants/Revokes**: `REVOKE ALL ON FUNCTION public.submit_for_review FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.submit_for_review TO authenticated;`
- **Transaction Boundary**: Single atomic DB block with CAS lock.
- **Inputs**: `p_resource_id UUID`, `p_version_id UUID`, `p_expected_lock_version INT`, `p_idempotency_key TEXT`.
- **Validations**: Check resource status is `draft` or `rejected`; check version passes preflight clean.
- **Locking/CAS**: `SELECT ... FOR UPDATE` on `lesson_resources`. Verify `lock_version = p_expected_lock_version`. Increment `lock_version`.
- **Outputs**: `JSONB` (`{ resource_id: UUID, status: 'in_review', lock_version: INT }`).
- **Error Contract**: `STALE_LOCK_VERSION` (409), `INVALID_STATUS_TRANSITION` (400).
- **Audit**: Inserts record into `lesson_resource_reviews` with action `submitted`.

---

### Contract 5: `approve_resource_version`
- **Caller Identity**: `auth.uid()` (Must have role `admin`).
- **Security & Path**: `SECURITY DEFINER SET search_path = public, pg_temp`.
- **Grants/Revokes**: `REVOKE ALL ON FUNCTION public.approve_resource_version FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.approve_resource_version TO authenticated;`
- **Transaction Boundary**: Single atomic DB block with CAS lock.
- **Inputs**: `p_resource_id UUID`, `p_version_id UUID`, `p_notes TEXT`, `p_expected_lock_version INT`, `p_idempotency_key TEXT`.
- **Validations**: Check caller is `admin`; check status is `in_review`; check `p_version_id` belongs to `p_resource_id`.
- **Locking/CAS**: `SELECT ... FOR UPDATE`. Verify `lock_version = p_expected_lock_version`. Binds `approved_version_id = p_version_id`.
- **Outputs**: `JSONB` (`{ resource_id: UUID, status: 'approved', approved_version_id: UUID }`).
- **Error Contract**: `UNAUTHORIZED` (403), `STALE_LOCK_VERSION` (409), `RESOURCE_ID_MISMATCH` (400).
- **Audit**: Inserts review entry in `lesson_resource_reviews` with action `approved`.

---

### Contract 6: `reject_resource_version`
- **Caller Identity**: `auth.uid()` (Must have role `admin`).
- **Security & Path**: `SECURITY DEFINER SET search_path = public, pg_temp`.
- **Grants/Revokes**: `REVOKE ALL ON FUNCTION public.reject_resource_version FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.reject_resource_version TO authenticated;`
- **Transaction Boundary**: Single atomic DB block with CAS lock.
- **Inputs**: `p_resource_id UUID`, `p_version_id UUID`, `p_reason TEXT`, `p_expected_lock_version INT`, `p_idempotency_key TEXT`.
- **Validations**: Check caller is `admin`; check mandatory `p_reason` length > 10 chars.
- **Locking/CAS**: `SELECT ... FOR UPDATE`. Verify `lock_version`. Status reverts to `rejected`.
- **Outputs**: `JSONB` (`{ resource_id: UUID, status: 'rejected' }`).
- **Error Contract**: `REASON_REQUIRED` (400), `STALE_LOCK_VERSION` (409).
- **Audit**: Inserts review entry in `lesson_resource_reviews` with action `rejected`.

---

### Contract 7: `publish_resource_version` (3-Phase Saga Transaction Boundary)
- **Caller Identity**: `auth.uid()` (Must have role `admin`).
- **Security & Path**: `SECURITY DEFINER SET search_path = public, pg_temp`.
- **Grants/Revokes**: `REVOKE ALL ON FUNCTION public.publish_resource_version FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.publish_resource_version TO authenticated;`
- **Transaction Boundaries (3 Phases)**:
  - **Phase A (DB Transaction 1)**: Row lock `lesson_resources` (`SELECT ... FOR UPDATE`), CAS validation (`lock_version = p_expected_lock_version`), approval check (`approved_version_id = p_version_id`), insert pending record into `storage_operations`, commit.
  - **Phase B (Async Storage Copy & Verification)**: Read files from staging bucket, perform SHA-256 hash match verification, copy files to immutable hash-pinned path in published bucket, update `storage_operations` status to `promoted`.
  - **Phase C (DB Transaction 2)**: Re-open DB transaction, re-lock `lesson_resources`, re-verify CAS and approval status, set `published_version_id = p_version_id`, set `status = 'published'`, increment `lock_version`, insert immutable audit entry in `lesson_resource_reviews`, commit.
- **Inputs**: `p_resource_id UUID`, `p_version_id UUID`, `p_expected_lock_version INT`, `p_idempotency_key TEXT`.
- **Validations**: Caller MUST be `admin`; `p_version_id` MUST match `approved_version_id`; re-verify file SHA-256 hashes.
- **Outputs**: `JSONB` (`{ resource_id: UUID, status: 'published', published_version_id: UUID, lock_version: INT }`).
- **Error Contract**: `VERSION_NOT_APPROVED` (422), `RESOURCE_ID_MISMATCH` (400), `STALE_LOCK_VERSION` (409).
- **Failure Guarantees**: NO student visibility before Phase C final commit. Orphan storage objects registered in `storage_operations` for background reconciliation.

---

### Contract 8: `unpublish_resource_version`
- **Caller Identity**: `auth.uid()` (Must have role `admin`).
- **Security & Path**: `SECURITY DEFINER SET search_path = public, pg_temp`.
- **Grants/Revokes**: `REVOKE ALL ON FUNCTION public.unpublish_resource_version FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.unpublish_resource_version TO authenticated;`
- **Transaction Boundary**: Single atomic DB block with CAS lock.
- **Inputs**: `p_resource_id UUID`, `p_reason TEXT`, `p_expected_lock_version INT`, `p_idempotency_key TEXT`.
- **Validations**: Check caller is `admin`; check status is currently `published`.
- **Locking/CAS**: `SELECT ... FOR UPDATE`. Reverts `published_version_id = NULL`; status reverts to `approved`.
- **Outputs**: `JSONB` (`{ resource_id: UUID, status: 'approved', published_version_id: null }`).
- **Error Contract**: `NOT_PUBLISHED` (400), `STALE_LOCK_VERSION` (409).
- **Audit**: Inserts review entry in `lesson_resource_reviews` with action `unpublished`.

---

### Contract 9: `archive_resource`
- **Caller Identity**: `auth.uid()` (Must have role `admin`).
- **Security & Path**: `SECURITY DEFINER SET search_path = public, pg_temp`.
- **Grants/Revokes**: `REVOKE ALL ON FUNCTION public.archive_resource FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.archive_resource TO authenticated;`
- **Transaction Boundary**: Single atomic DB block with CAS lock.
- **Inputs**: `p_resource_id UUID`, `p_reason TEXT`, `p_expected_lock_version INT`, `p_idempotency_key TEXT`.
- **Validations**: Check caller is `admin`; check mandatory audit reason.
- **Locking/CAS**: `SELECT ... FOR UPDATE`. Sets status to `archived`.
- **Outputs**: `JSONB` (`{ resource_id: UUID, status: 'archived' }`).
- **Error Contract**: `UNAUTHORIZED` (403), `STALE_LOCK_VERSION` (409).
- **Audit**: Inserts review entry in `lesson_resource_reviews` with action `archived`.

---

### Contract 10: `fetch_published_lesson_resources`
- **Caller Identity**: `auth.uid()` (Student / Authenticated user).
- **Security & Path**: `SECURITY DEFINER SET search_path = public, pg_temp`.
- **Grants/Revokes**: `REVOKE ALL ON FUNCTION public.fetch_published_lesson_resources FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.fetch_published_lesson_resources TO authenticated;`
- **Transaction Boundary**: Read-only query block.
- **Inputs**: `p_lesson_id UUID`.
- **Validations**: Evaluates `public.can_access_lesson(p_lesson_id)`. If false, yields empty JSON array (silent fail-closed).
- **Outputs**: `JSONB` array of published resources (`id`, `resource_code`, `resource_type`, `title`, `description`, `sort_order`, `entry_file`, `signed_access_url`, `csp_header`). Only resources with `status = 'published'` and valid `published_version_id` are returned.
- **Error Contract**: Returns `[]` if unauthorized or no published resources exist.

---

### Contract 11: `rollback_published_resource_version`
- **Caller Identity**: `auth.uid()` (Must have role `admin`).
- **Security & Path**: `SECURITY DEFINER SET search_path = public, pg_temp`.
- **Grants/Revokes**: `REVOKE ALL ON FUNCTION public.rollback_published_resource_version FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.rollback_published_resource_version TO authenticated;`
- **Transaction Boundary**: Single atomic DB block with CAS lock.
- **Inputs**: `p_resource_id UUID`, `p_target_version_id UUID`, `p_expected_lock_version INT`, `p_reason TEXT`, `p_idempotency_key TEXT`.
- **Validations**:
  - Caller MUST be `admin`.
  - `p_target_version_id` MUST belong to `p_resource_id`.
  - `p_target_version_id` MUST have action `'approved'` in `lesson_resource_reviews`.
  - Mandatory `p_reason` length > 10 chars.
  - Storage file hash verification for target version.
- **Locking/CAS**: `SELECT ... FOR UPDATE` on `lesson_resources`. Verify `lock_version`.
- **Outputs**: `JSONB` (`{ resource_id: UUID, status: 'published', published_version_id: UUID, previous_published_version_id: UUID, lock_version: INT }`).
- **Error Contract**: `TARGET_VERSION_NOT_APPROVED` (422), `STALE_LOCK_VERSION` (409), `REASON_REQUIRED` (400).
- **Audit**: Records immutable audit event in `lesson_resource_reviews` with previous/new version IDs, and logs storage reconciliation evidence in `storage_operations`.

---

## 5. Comprehensive & Safe Rollback Plan

In the event of an operational regression or deployment cancellation:

1. **Runtime Feature Flag Fallback**:
   - Immediately switch environment flag `ENABLE_HTML_LESSON_RESOURCES=false`.
   - Client applications immediately bypass HTML resource rendering and fall back to legacy static components without throwing errors.

2. **Rollback to Previous Approved Version**:
   - Execute `rollback_published_resource_version` RPC to revert `published_version_id` to a target approved version in an audited, CAS-locked transaction.
   - Version history is preserved permanently; overwriting audit logs is prohibited.

3. **Database Down Script Strategy (Audit Preservation Guarantee)**:
   - **DO NOT DROP `lesson_resources`**: The legacy `lesson_resources` table is preserved.
   - **DO NOT attempt enum value deletion**: PostgreSQL does not support removing enum values. The down script leaves enum values intact.
   - **NO `DROP TABLE CASCADE` on Audit Tables**: Audit tables (`lesson_resource_reviews`, `lesson_resource_events`, `idempotency_ledger`, `storage_operations`) are permanently kept in production.
   - Down script safely removes only newly added foreign key constraints without dropping audit or version history tables:
```sql
BEGIN;
-- Remove version FKs from lesson_resources safely
ALTER TABLE public.lesson_resources DROP CONSTRAINT IF EXISTS fk_lesson_resources_draft_version;
ALTER TABLE public.lesson_resources DROP CONSTRAINT IF EXISTS fk_lesson_resources_approved_version;
ALTER TABLE public.lesson_resources DROP CONSTRAINT IF EXISTS fk_lesson_resources_published_version;
COMMIT;
```

4. **Storage Object & Audit Preservation**:
   - Storage cleanup for orphan objects is executed strictly via `storage_operations`.
   - Audit logs (`lesson_resource_reviews`, `lesson_resource_events`, `idempotency_ledger`, `storage_operations`) are preserved and never truncated during rollback.
