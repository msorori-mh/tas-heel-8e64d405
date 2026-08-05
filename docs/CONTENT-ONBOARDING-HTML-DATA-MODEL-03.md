# Operational Data Model Specification for HTML Content Onboarding (v0.3)

**Document ID:** `CONTENT-ONBOARDING-HTML-DATA-MODEL-03`  
**Status:** DESIGN CONTRACT ONLY (ZERO DB Mutations Applied)  
**Target Schema:** `public`  
**Base Branch:** `origin/main`  
**Reference Branch:** `origin/feat/content-onboarding-html-interactive-mvp-01`

---

## 1. Architectural Overview & Boundaries

This document defines the operational schema, entity relationships, enums, state machine transitions, and data integrity constraints for importing, reviewing, publishing, and auditing interactive HTML content (`mind_map_html`, `practical_experiment_html`) within the Tas-heel platform.

> **CRITICAL BOUNDARY GUARANTEE:**
> - All client/browser mutations are strictly prohibited from directly altering `lesson_resources`, `lesson_resource_versions`, or `lesson_resource_files`.
> - All database modifications occur exclusively via validated RPC functions or Edge Functions running with service-role security boundaries.
> - Student clients can query published lesson resources strictly through RLS fail-closed read policies.

---

## 2. Enums and Custom Types

```sql
-- Resource Type Enum Extension
CREATE TYPE public.lesson_resource_type AS ENUM (
  'mind_map_html',
  'practical_experiment_html',
  'summary_html',
  'image',
  'pdf',
  'video',
  'link'
);

-- Resource Lifecycle Status Enum
CREATE TYPE public.lesson_resource_status AS ENUM (
  'draft',
  'in_review',
  'approved',
  'published',
  'rejected',
  'archived'
);

-- Review Action Enum
CREATE TYPE public.review_action AS ENUM (
  'submitted',
  'approved',
  'rejected',
  'published',
  'unpublished',
  'archived'
);

-- Import Batch Status Enum
CREATE TYPE public.import_batch_status AS ENUM (
  'created',
  'uploading',
  'uploaded',
  'validating',
  'dry_run_passed',
  'dry_run_failed',
  'submitting',
  'submitted',
  'partially_failed',
  'completed',
  'failed',
  'archived'
);
```

---

## 3. Entity Schemas & Tables

### 3.1 `lesson_resources`
Primary registry for interactive and static lesson resources.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique resource identifier |
| `resource_code` | `VARCHAR(64)` | `NOT NULL UNIQUE` | Human-readable unique code (e.g. `RES-BIO-10-MM01`) |
| `lesson_id` | `UUID` | `NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE` | Parent lesson reference |
| `resource_type` | `public.lesson_resource_type` | `NOT NULL` | HTML mind map or practical experiment |
| `title_ar` | `TEXT` | `NOT NULL` | Arabic title for presentation |
| `description_ar` | `TEXT` | `NULL` | Arabic descriptive overview |
| `alt_text_ar` | `TEXT` | `NULL` | Accessibility description |
| `sort_order` | `INTEGER` | `NOT NULL DEFAULT 1` | Presentation order within lesson |
| `status` | `public.lesson_resource_status` | `NOT NULL DEFAULT 'draft'` | Current state in review pipeline |
| `active_version` | `INTEGER` | `NOT NULL DEFAULT 1` | Currently active/published version number |
| `offline_enabled` | `BOOLEAN` | `NOT NULL DEFAULT true` | PWA / offline caching flag |
| `orientation` | `VARCHAR(10)` | `NOT NULL DEFAULT 'auto' CHECK (orientation IN ('auto', 'portrait', 'landscape'))` | Preferred layout orientation |
| `height_mode` | `VARCHAR(10)` | `NOT NULL DEFAULT 'viewport' CHECK (height_mode IN ('fixed', 'viewport', 'content'))` | Frame sizing behavior |
| `completion_mode` | `VARCHAR(20)` | `NOT NULL DEFAULT 'view' CHECK (completion_mode IN ('view', 'interaction_event', 'manual_review'))` | Lesson progress completion rule |
| `completion_event` | `VARCHAR(30)` | `CHECK (completion_event IN ('experiment_started', 'step_completed', 'experiment_completed'))` | Event name triggering completion |
| `minimum_interaction_seconds` | `INTEGER` | `DEFAULT 0` | Required interaction dwell time |
| `created_by` | `UUID` | `REFERENCES auth.users(id)` | Uploader auth user ID |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record last modification timestamp |

---

### 3.2 `lesson_resource_versions`
Stores versioned snapshot metadata and immutable package parameters for each resource.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique version record ID |
| `resource_id` | `UUID` | `NOT NULL REFERENCES public.lesson_resources(id) ON DELETE CASCADE` | Associated resource ID |
| `version` | `INTEGER` | `NOT NULL` | Sequential version number (1, 2, 3...) |
| `entry_file` | `TEXT` | `NOT NULL DEFAULT 'index.html'` | Main entry point HTML file |
| `content_sha256` | `CHAR(64)` | `NOT NULL` | SHA-256 digest of entire package |
| `package_size_compressed` | `BIGINT` | `NOT NULL` | Zip payload size in bytes |
| `package_size_uncompressed` | `BIGINT` | `NOT NULL` | Extracted content total bytes |
| `file_count` | `INTEGER` | `NOT NULL` | Total number of extracted files |
| `csp_header` | `TEXT` | `NOT NULL` | Content Security Policy header for sandbox |
| `storage_path` | `TEXT` | `NOT NULL` | Path in Supabase storage bucket |
| `published_at` | `TIMESTAMPTZ` | `NULL` | Timestamp of publication |
| `published_by` | `UUID` | `REFERENCES auth.users(id)` | Auth user who approved publish |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Version creation timestamp |

*Constraints:* `UNIQUE(resource_id, version)`

---

### 3.3 `lesson_resource_files`
Granular manifest of every file contained within an uncompressed HTML resource version.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | File manifest entry ID |
| `version_id` | `UUID` | `NOT NULL REFERENCES public.lesson_resource_versions(id) ON DELETE CASCADE` | Associated version ID |
| `file_path` | `TEXT` | `NOT NULL` | Relative file path within package |
| `file_size` | `BIGINT` | `NOT NULL` | File size in bytes |
| `mime_type` | `VARCHAR(100)` | `NOT NULL` | Sanitized MIME type |
| `content_sha256` | `CHAR(64)` | `NOT NULL` | SHA-256 hash of individual file |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | File index creation timestamp |

*Constraints:* `UNIQUE(version_id, file_path)`

---

### 3.4 `lesson_resource_reviews`
Immutable audit log tracking all approval, rejection, and state transitions.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Review event ID |
| `resource_id` | `UUID` | `NOT NULL REFERENCES public.lesson_resources(id) ON DELETE CASCADE` | Target resource ID |
| `version_id` | `UUID` | `NOT NULL REFERENCES public.lesson_resource_versions(id) ON DELETE CASCADE` | Target version ID |
| `reviewer_id` | `UUID` | `NOT NULL REFERENCES auth.users(id)` | Staff member executing review |
| `action` | `public.review_action` | `NOT NULL` | Action taken (`submitted`, `approved`, `rejected`, etc.) |
| `rejection_reason` | `TEXT` | `NULL` | Structured rejection note if rejected |
| `security_scan_summary` | `JSONB` | `NOT NULL DEFAULT '{}'::jsonb` | Automated preflight scan findings |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Audit event timestamp |

---

### 3.5 `lesson_resource_events`
Audit log recording runtime interactive events emitted by students (e.g. experiment started, completed).

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Event log record ID |
| `user_id` | `UUID` | `NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` | Authenticated student user |
| `resource_id` | `UUID` | `NOT NULL REFERENCES public.lesson_resources(id) ON DELETE CASCADE` | Resource being interacted with |
| `version` | `INTEGER` | `NOT NULL` | Version active during session |
| `event_type` | `VARCHAR(30)` | `NOT NULL` | Event classification |
| `session_nonce` | `UUID` | `NOT NULL` | Ephemeral playback session ID |
| `event_sequence` | `INTEGER` | `NOT NULL` | Monotonic sequence within session |
| `payload` | `JSONB` | `NOT NULL DEFAULT '{}'::jsonb` | Sanitized event telemetry (NO PII/answers) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Event receipt timestamp |

---

### 3.6 `content_import_batches`
Tracks bulk HTML package import sessions.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Import batch ID |
| `batch_code` | `VARCHAR(64)` | `NOT NULL UNIQUE` | Human-friendly code (e.g. `BATCH-20260805-001`) |
| `uploaded_by` | `UUID` | `NOT NULL REFERENCES auth.users(id)` | Content Manager / Admin user |
| `total_rows` | `INTEGER` | `NOT NULL DEFAULT 0` | Total packages in import payload |
| `valid_rows` | `INTEGER` | `NOT NULL DEFAULT 0` | Number of packages passing preflight |
| `status` | `public.import_batch_status` | `NOT NULL DEFAULT 'created'` | Current batch state |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Batch creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Batch last modification timestamp |

---

### 3.7 `content_import_rows`
Per-row package validation breakdown within an import batch.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Import row item ID |
| `batch_id` | `UUID` | `NOT NULL REFERENCES public.content_import_batches(id) ON DELETE CASCADE` | Parent batch ID |
| `row_number` | `INTEGER` | `NOT NULL` | 1-indexed row position in batch manifest |
| `resource_code` | `VARCHAR(64)` | `NOT NULL` | Target resource code |
| `raw_payload` | `JSONB` | `NOT NULL` | Preflight verification payload |
| `is_valid` | `BOOLEAN` | `NOT NULL DEFAULT true` | Preflight compliance boolean |
| `findings` | `JSONB` | `NOT NULL DEFAULT '[]'::jsonb` | Array of validation warnings/errors |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Item timestamp |

---

## 4. State Machine Matrix for `lesson_resources.status`

```
  +---------+   submit_for_review   +-----------+
  |  draft  | ------------------->  | in_review |
  +---------+                       +-----------+
     ^   ^                            /       \
     |   |            reject         /         \  approve
     |   +--------------------------+           v
     |                                      +-----------+
     |                publish               |  approved |
     |    +-------------------------------- +-----------+
     |    |                                       |
     |    v                                       v publish
  +-----------+     unpublish               +-----------+
  | archived  | <-------------------------- | published |
  +-----------+                             +-----------+
```

| Current Status | Target Status | Permitted Trigger Action | Allowed Role | Conditions |
| :--- | :--- | :--- | :--- | :--- |
| `draft` | `in_review` | `submit_for_review` | `admin`, `content_manager` | Preflight scan passes 100% cleanly |
| `in_review` | `approved` | `approve` | `reviewer`, `admin` | Mandatory review pass, no forbidden APIs |
| `in_review` | `rejected` | `reject` | `reviewer`, `admin` | Mandatory rejection reason provided |
| `approved` | `published` | `publish` | `publisher`, `admin` | Files copied to `lesson-resource-published` |
| `rejected` | `draft` | `resubmit_draft` | `admin`, `content_manager` | Fixes applied, new draft version created |
| `published` | `archived` | `archive` | `publisher`, `admin` | Resource retired, student access revoked |

---

## 5. Optimistic Concurrency & Security Guarantees

1. **Optimistic Concurrency Control**:
   - Updates to `lesson_resources` check `updated_at` or `active_version`. If a concurrent update altered the status, the transaction aborts with `409 Conflict`.

2. **Idempotency via SHA-256 Digest**:
   - Re-uploading an identical `content_sha256` payload for a resource returns the existing version without creating duplicate storage blobs or database rows.

3. **No Correct-Answer Leakage**:
   - Interactive packages (`mind_map_html`, `practical_experiment_html`) must resolve evaluation client-side without embedded answer keys in JSON or DOM attributes, or use hashed answer check tokens.

4. **No Student PII**:
   - Package assets and telemetry payloads (`lesson_resource_events.payload`) are scrubbed of student names, emails, or hardware identifiers. Only `user_id` (auth.uid) is referenced.

