# Database & Storage Migration Proposal for Interactive HTML Content

**Date:** 2026-08-05  
**Document Status:** PROPOSAL ONLY (ZERO Migrations Applied)  
**Target Schema:** `public`  
**Target Storage Buckets:** `lesson-resource-drafts`, `lesson-resource-published`

---

## 1. Executive Overview

This document presents the detailed architectural proposal for updating the database schema and Supabase storage buckets to support versioned, secure, and audited interactive HTML lesson resources (`mind_map_html` and `practical_experiment_html`).

> **IMPORTANT:** In strict compliance with task constraints:
> - **ZERO** SQL migrations have been executed on any environment.
> - **ZERO** production database writes occur during the current MVP phase.
> - All import dry-run logic operates in-memory without persistent mutations.

---

## 2. Storage Buckets Proposal

### 2.1 Bucket Definitions
1. **`lesson-resource-drafts`**
   - **Public Access:** False (Private).
   - **File Size Limit:** 25MB per package zip, 10MB per individual file.
   - **MIME Types:** HTML, CSS, JS, SVG, PNG, JPG, WEBP, JSON.
   - **Path Pattern:** `{uploader_id}/{import_batch_id}/{resource_code}/v{version}/*`
   - **Access Control:** Content managers and admins can read/write drafts via signed URLs or authenticated server endpoints.

2. **`lesson-resource-published`**
   - **Public Access:** Read-Only for authenticated students with lesson access.
   - **File Size Limit:** 100MB per uncompressed package.
   - **Path Pattern:** `{subject_code}/{resource_code}/{content_hash}/*` (Immutable content-addressed pathing).
   - **Access Control:** No direct client writes allowed. Storage objects populated exclusively via privileged Edge Function or Server RPC during the review publish workflow.

---

## 3. Database Schema Proposal (DDL)

```sql
-- 1. Update Enum lesson_resource_type
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'mind_map_html';
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'practical_experiment_html';
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'summary_html';
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'image';

-- 2. Enhanced lesson_resources Table
CREATE TABLE IF NOT EXISTS public.lesson_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_code VARCHAR(64) NOT NULL UNIQUE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  resource_type public.lesson_resource_type NOT NULL,
  title_ar TEXT NOT NULL,
  description_ar TEXT,
  alt_text_ar TEXT,
  sort_order INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'approved', 'published', 'rejected', 'archived')),
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

-- 3. Versioning Table
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

-- 4. Package File Manifest Table
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

-- 5. Review Workflow Table
CREATE TABLE IF NOT EXISTS public.lesson_resource_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES public.lesson_resources(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.lesson_resource_versions(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id),
  action VARCHAR(20) NOT NULL CHECK (action IN ('submitted', 'approved', 'rejected', 'published', 'unpublished')),
  rejection_reason TEXT,
  security_scan_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Interactive Event Audit Table
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

-- 7. Import Batches & Rows Tables
CREATE TABLE IF NOT EXISTS public.content_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code VARCHAR(64) NOT NULL UNIQUE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'dry_run_passed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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
```

---

## 4. Row Level Security (RLS) Policy Specifications

1. **`lesson_resources` & `lesson_resource_versions`**:
   - `SELECT`: Authenticated students can read if `status = 'published'` AND the student has access to the parent lesson via `public.can_access_lesson(lesson_id)`.
   - `INSERT / UPDATE / DELETE`: Restricted to users with `admin` or `content_manager` roles via `public.has_role(auth.uid(), 'admin')` or server-side Edge Functions.

2. **`lesson_resource_reviews` & `content_import_batches`**:
   - Accessible only by staff roles (`admin`, `content_manager`).

3. **`lesson_resource_events`**:
   - `INSERT`: Allowed for authenticated students matching `auth.uid() = user_id`, restricted by rate-limit and nonce verification RPC.

---

## 5. Security & Migration Guarantees

- **Fail-Closed Default**: RLS policies deny access to draft or unpublished versions for student roles.
- **Content Integrity**: All file assets are verified against content SHA-256 before publishing.
- **Zero Impact**: No migration scripts have been executed or added to `supabase/migrations/` in this PR.
