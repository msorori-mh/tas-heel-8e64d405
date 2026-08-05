# Database & Operational Migration Proposal for HTML Content Backend (v0.3)

**Document ID:** `CONTENT-ONBOARDING-HTML-MIGRATION-PROPOSAL-03`  
**Status:** PROPOSAL ONLY (ZERO Migrations Applied, ZERO DB Writes Executed)  
**Target Schema:** `public`  
**Base Branch:** `origin/main`  
**Reference Branch:** `origin/feat/content-onboarding-html-interactive-mvp-01`

---

## 1. Executive Summary

This proposal outlines the exact migration steps, DDL scripts, RPC signatures, storage bucket configurations, fail-closed guards, and rollback strategies required to transition the Tas-heel platform from in-memory HTML package validation (MVP-01) to a full operational backend (`CONTENT-ONBOARDING-HTML-OPERATIONAL-BACKEND-DESIGN-03`).

> **CRITICAL COMPLIANCE NOTICE:**
> - **ZERO** database migrations have been executed during this design phase.
> - **ZERO** SQL scripts have been committed to `supabase/migrations/`.
> - **ZERO** database writes or storage modifications have taken place.

---

## 2. Existing Baseline vs. Migration Targets

| Aspect | Current Baseline (`origin/main`) | Proposed Operational Target (v0.3) |
| :--- | :--- | :--- |
| **Resource Types** | Static (`pdf`, `image`, `video`, `link`) | Interactive (`mind_map_html`, `practical_experiment_html`) + Static |
| **Versioning** | Single active version record | Full snapshot versioning (`lesson_resource_versions`) |
| **Package Assets** | Single URL | Multi-file manifest (`lesson_resource_files`) |
| **Storage Buckets** | Generic static content buckets | `lesson-resource-drafts` (Private) & `lesson-resource-published` (Hash-pinned) |
| **Review Workflow** | Manual flag / Direct publish | Multi-stage lifecycle (`draft` -> `in_review` -> `approved` -> `published`) |
| **Audit Log** | Basic timestamps | Dedicated audit trails (`lesson_resource_reviews`, `lesson_resource_events`) |
| **Import System** | In-memory dry-run (MVP-01) | Persistent batches (`content_import_batches`, `content_import_rows`) |

---

## 3. Proposed DDL Migration (Draft SQL)

```sql
-- Migration File Draft: 20260806000000_content_onboarding_html_operational.sql

BEGIN;

-- 1. Extend Types
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'mind_map_html';
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'practical_experiment_html';
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'summary_html';

-- 2. Create Enums
DO $$ BEGIN
  CREATE TYPE public.lesson_resource_status AS ENUM ('draft', 'in_review', 'approved', 'published', 'rejected', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.review_action AS ENUM ('submitted', 'approved', 'rejected', 'published', 'unpublished', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.import_batch_status AS ENUM ('created', 'uploading', 'uploaded', 'validating', 'dry_run_passed', 'dry_run_failed', 'submitting', 'submitted', 'partially_failed', 'completed', 'failed', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Enhance lesson_resources
CREATE TABLE IF NOT EXISTS public.lesson_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_code VARCHAR(64) NOT NULL UNIQUE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  resource_type public.lesson_resource_type NOT NULL,
  title_ar TEXT NOT NULL,
  description_ar TEXT,
  alt_text_ar TEXT,
  sort_order INTEGER NOT NULL DEFAULT 1,
  status public.lesson_resource_status NOT NULL DEFAULT 'draft',
  active_version INTEGER NOT NULL DEFAULT 1,
  offline_enabled BOOLEAN NOT NULL DEFAULT true,
  orientation VARCHAR(10) NOT NULL DEFAULT 'auto' CHECK (orientation IN ('auto', 'portrait', 'landscape')),
  height_mode VARCHAR(10) NOT NULL DEFAULT 'viewport' CHECK (height_mode IN ('fixed', 'viewport', 'content')),
  completion_mode VARCHAR(20) NOT NULL DEFAULT 'view' CHECK (completion_mode IN ('view', 'interaction_event', 'manual_review')),
  completion_event VARCHAR(30) CHECK (completion_event IN ('experiment_started', 'step_completed', 'experiment_completed')),
  minimum_interaction_seconds INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create lesson_resource_versions
CREATE TABLE IF NOT EXISTS public.lesson_resource_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.lesson_resources(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  entry_file TEXT NOT NULL DEFAULT 'index.html',
  content_sha256 CHAR(64) NOT NULL,
  package_size_compressed BIGINT NOT NULL,
  package_size_uncompressed BIGINT NOT NULL,
  file_count INTEGER NOT NULL,
  csp_header TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(resource_id, version)
);

-- 5. Create lesson_resource_files
CREATE TABLE IF NOT EXISTS public.lesson_resource_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.lesson_resource_versions(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  content_sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(version_id, file_path)
);

-- 6. Create lesson_resource_reviews
CREATE TABLE IF NOT EXISTS public.lesson_resource_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.lesson_resources(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.lesson_resource_versions(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id),
  action public.review_action NOT NULL,
  rejection_reason TEXT,
  security_scan_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Create lesson_resource_events
CREATE TABLE IF NOT EXISTS public.lesson_resource_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES public.lesson_resources(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  event_type VARCHAR(30) NOT NULL,
  session_nonce UUID NOT NULL,
  event_sequence INTEGER NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Create content_import_batches & rows
CREATE TABLE IF NOT EXISTS public.content_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code VARCHAR(64) NOT NULL UNIQUE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  status public.import_batch_status NOT NULL DEFAULT 'created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.content_import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  resource_code VARCHAR(64) NOT NULL,
  raw_payload JSONB NOT NULL,
  is_valid BOOLEAN NOT NULL DEFAULT true,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.lesson_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resource_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resource_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resource_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_resource_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_import_rows ENABLE ROW LEVEL SECURITY;

COMMIT;
```

---

## 4. Operational Server Contracts (RPC / Edge Functions Inventory)

| Function / Edge Contract | Signature & Return | Security Role Required | Function Description |
| :--- | :--- | :--- | :--- |
| `create_import_batch` | `(batch_code text, total_rows int) RETURNS uuid` | `admin`, `content_manager` | Initializes a new bulk import tracking session |
| `upload_package` | `(batch_id uuid, resource_code text, zip_hash text) RETURNS uuid` | `admin`, `content_manager` | Registers uploaded draft zip in storage & DB |
| `validate_package` | `(version_id uuid) RETURNS jsonb` | `admin`, `content_manager`, `reviewer` | Runs security & CSP preflight checks |
| `submit_for_review` | `(resource_id uuid, version int) RETURNS uuid` | `admin`, `content_manager` | Transitions status from `draft` to `in_review` |
| `approve_resource_version` | `(resource_id uuid, version int, notes text) RETURNS uuid` | `reviewer`, `admin` | Approves package version for publication |
| `reject_resource_version` | `(resource_id uuid, version int, reason text) RETURNS uuid` | `reviewer`, `admin` | Rejects package version and returns to `draft` |
| `publish_resource_version` | `(resource_id uuid, version int) RETURNS text` | `publisher`, `admin` | Promotes draft files to published bucket & sets `published` |
| `unpublish_resource_version` | `(resource_id uuid, reason text) RETURNS boolean` | `publisher`, `admin` | Unpublishes resource version safely |
| `archive_resource` | `(resource_id uuid, reason text) RETURNS boolean` | `publisher`, `admin` | Marks resource status as `archived` |
| `fetch_published_lesson_resources` | `(p_lesson_id uuid) RETURNS jsonb` | `student`, `authenticated` | Student-facing RPC retrieving active published resources |

---

## 5. Fail-Closed Security Rules

1. **Default Fail-Closed RLS**: If an unauthenticated user or student without active lesson permissions requests a resource, RLS filters return 0 rows (silent deny).
2. **Hash Integrity Check Failure**: During `publish_resource_version`, if any extracted file hash does not match `lesson_resource_files.content_sha256`, the operation rolls back instantly.
3. **Draft Access Protection**: Draft packages in `lesson-resource-drafts` cannot be read via standard REST endpoints without a valid reviewer HMAC-signed URL.

---

## 6. Comprehensive Rollback Strategy

In the event of a deployment failure or critical regression during backend onboarding:

1. **Feature Flag Fallback**: Immediately set environment flag `ENABLE_HTML_LESSON_RESOURCES=false`. Frontend components will hide HTML resource viewers and fallback to legacy static content components without throw errors.
2. **Database Down Script**:
```sql
BEGIN;
DROP TABLE IF EXISTS public.content_import_rows CASCADE;
DROP TABLE IF EXISTS public.content_import_batches CASCADE;
DROP TABLE IF EXISTS public.lesson_resource_events CASCADE;
DROP TABLE IF EXISTS public.lesson_resource_reviews CASCADE;
DROP TABLE IF EXISTS public.lesson_resource_files CASCADE;
DROP TABLE IF EXISTS public.lesson_resource_versions CASCADE;
DROP TABLE IF EXISTS public.lesson_resources CASCADE;
DROP TYPE IF EXISTS public.import_batch_status CASCADE;
DROP TYPE IF EXISTS public.review_action CASCADE;
DROP TYPE IF EXISTS public.lesson_resource_status CASCADE;
COMMIT;
```
3. **Storage Cleanup**: Delete buckets `lesson-resource-drafts` and `lesson-resource-published` using the Supabase CLI administration command.

---

## 7. Phased Post-Review Execution Plan

1. **Phase 1: Architecture & Design Freeze Review (`CONTENT_ONBOARDING_HTML_BACKEND_DESIGN_REVIEW_04`)**
   - Stakeholders review data model, storage contracts, authorization matrix, and migration proposal.
2. **Phase 2: Database Migration & RLS Deployment**
   - Apply DDL migration file to staging database and verify RLS test coverage.
3. **Phase 3: Storage Buckets & Edge Functions Deployment**
   - Provision `lesson-resource-drafts` and `lesson-resource-published` buckets and deploy server RPC/Edge functions.
4. **Phase 4: Client Integration & End-to-End Verification**
   - Connect `src/lib/content-import-html-package` validators to backend RPC endpoints and verify complete import lifecycle.

