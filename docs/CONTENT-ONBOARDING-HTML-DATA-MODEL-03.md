# Operational Data Model Specification for HTML Content Onboarding (v0.5)

**Document ID:** `CONTENT-ONBOARDING-HTML-DATA-MODEL-03`
**Status:** DESIGN CONTRACT ONLY (ZERO DB Mutations Applied)
**Target Schema:** `public`
**Base Branch:** `origin/main`
**Reference Branch:** `origin/feat/content-onboarding-html-interactive-mvp-01`

---

## 1. Architectural Overview & MVP Roles

This document defines the operational schema, entity relationships, enums, state machine transitions, version integrity rules, concurrency controls, and data integrity constraints for importing, reviewing, publishing, and auditing interactive HTML content (`mind_map_html`, `practical_experiment_html`) within the Tas-heel platform.

### MVP Role Boundary
For this MVP stage, system roles are strictly limited to:
- **`content_manager`**: Can create drafts, upload package staging files, modify drafts, and submit for review. CANNOT approve or publish.
- **`admin`**: Can review, approve/reject, publish/unpublish/archive, and manage audited emergency states.
- **`student`**: Can read published resources only for accessible lessons.

*(Note: Roles `reviewer` and `publisher` are NOT used in `app_role` for this MVP).*

> **CRITICAL BOUNDARY GUARANTEE:**
> - All client/browser mutations are strictly prohibited from directly altering `lesson_resources`, `lesson_resource_versions`, `lesson_resource_files`, or audit tables.
> - All database modifications occur exclusively via validated RPC functions running with `SECURITY DEFINER` and strict CAS lock constraints.
> - Student clients query published lesson resources strictly through RLS fail-closed read policies or server RPCs.

---

## 2. Enums, Types & Type Compatibility Mapping

```sql
-- Resource Type Enum Extension
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'mind_map_html';
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'practical_experiment_html';
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'summary_html';
ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS 'external_link';

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

### Type Standardization & Legacy Compatibility Mapping
The canonical entity type for external links is `external_link` (not `link`).
To preserve backward compatibility with legacy datasets, the operational system enforces the following mapping:
- `mindmap` → `mind_map_html`
- `experiment` → `practical_experiment_html`
- `link` → `external_link`

---

## 3. Entity Schemas & Tables (Additive Strategy)

> **Additive Migration Rule:**
> The `lesson_resources` table **already exists** in the database baseline. It is converted to the operational model via **additive `ALTER TABLE` operations**. Using `CREATE TABLE IF NOT EXISTS lesson_resources` as a migration conversion is strictly forbidden.

### 3.1 `lesson_resources` (Additive Enhancement)
Master registry for interactive and static lesson resources. Extended via additive columns and foreign keys.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique resource identifier |
| `resource_code` | `VARCHAR(64)` | `NOT NULL UNIQUE` | Human-readable unique code (e.g. `RES-BIO-10-MM01`) |
| `lesson_id` | `UUID` | `NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT` | Parent lesson reference |
| `resource_type` | `public.lesson_resource_type` | `NOT NULL` | HTML mind map, experiment, external_link, etc. |
| `title_ar` | `TEXT` | `NOT NULL` | Arabic title for presentation |
| `description_ar` | `TEXT` | `NULL` | Arabic descriptive overview |
| `alt_text_ar` | `TEXT` | `NULL` | Accessibility description |
| `sort_order` | `INTEGER` | `NOT NULL DEFAULT 1` | Presentation order within lesson |
| `status` | `public.lesson_resource_status` | `NOT NULL DEFAULT 'draft'` | Current state in lifecycle pipeline |
| `current_draft_version_id` | `UUID` | `REFERENCES public.lesson_resource_versions(id) ON DELETE RESTRICT` | Active draft version reference |
| `approved_version_id` | `UUID` | `REFERENCES public.lesson_resource_versions(id) ON DELETE RESTRICT` | Most recently approved version |
| `published_version_id` | `UUID` | `REFERENCES public.lesson_resource_versions(id) ON DELETE RESTRICT` | Currently published version |
| `lock_version` | `INTEGER` | `NOT NULL DEFAULT 1` | Optimistic CAS lock counter |
| `offline_enabled` | `BOOLEAN` | `NOT NULL DEFAULT true` | PWA / offline caching flag |
| `orientation` | `VARCHAR(10)` | `NOT NULL DEFAULT 'auto' CHECK (orientation IN ('auto', 'portrait', 'landscape'))` | Preferred layout orientation |
| `height_mode` | `VARCHAR(10)` | `NOT NULL DEFAULT 'viewport' CHECK (height_mode IN ('fixed', 'viewport', 'content'))` | Frame sizing behavior |
| `completion_mode` | `VARCHAR(20)` | `NOT NULL DEFAULT 'view' CHECK (completion_mode IN ('view', 'interaction_event', 'manual_review'))` | Lesson progress completion rule |
| `completion_event` | `VARCHAR(30)` | `CHECK (completion_event IN ('experiment_started', 'step_completed', 'experiment_completed'))` | Event name triggering completion |
| `minimum_interaction_seconds` | `INTEGER` | `DEFAULT 0` | Required interaction dwell time |
| `created_by` | `UUID` | `REFERENCES auth.users(id) ON DELETE RESTRICT` | Uploader auth user ID |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record last modification timestamp |

---

### 3.2 `lesson_resource_versions`
Immutable version snapshots linked to specific `content_sha256` digests and package metrics.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique version record ID |
| `resource_id` | `UUID` | `NOT NULL REFERENCES public.lesson_resources(id) ON DELETE RESTRICT` | Associated resource ID |
| `version_number` | `INTEGER` | `NOT NULL CHECK (version_number > 0)` | Monotonic version number (1, 2, 3...) |
| `entry_file` | `TEXT` | `NOT NULL DEFAULT 'index.html'` | Main entry point HTML file |
| `content_sha256` | `CHAR(64)` | `NOT NULL` | SHA-256 digest of entire package |
| `package_size_compressed` | `BIGINT` | `NOT NULL` | Zip payload size in bytes |
| `package_size_uncompressed` | `BIGINT` | `NOT NULL` | Extracted content total bytes |
| `file_count` | `INTEGER` | `NOT NULL` | Total number of extracted files |
| `csp_header` | `TEXT` | `NOT NULL` | Content Security Policy header |
| `storage_path` | `TEXT` | `NOT NULL` | Staging or hash-pinned storage path |
| `published_at` | `TIMESTAMPTZ` | `NULL` | Timestamp of publication |
| `published_by` | `UUID` | `REFERENCES auth.users(id) ON DELETE RESTRICT` | Auth user who published version |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Version creation timestamp |

*Explicit Constraints:*
- `UNIQUE(resource_id, version_number)`
- `UNIQUE(resource_id, content_sha256)`
- `CHECK (version_number > 0)`

---

### 3.3 `lesson_resource_files`
Granular file manifest indexing every extracted asset within a version package.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | File manifest entry ID |
| `version_id` | `UUID` | `NOT NULL REFERENCES public.lesson_resource_versions(id) ON DELETE RESTRICT` | Associated version ID |
| `file_path` | `TEXT` | `NOT NULL` | Relative file path within package |
| `file_size` | `BIGINT` | `NOT NULL` | File size in bytes |
| `mime_type` | `VARCHAR(100)` | `NOT NULL` | Sanitized MIME type |
| `content_sha256` | `CHAR(64)` | `NOT NULL` | SHA-256 hash of individual file |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | File index creation timestamp |

*Explicit Constraints:* `UNIQUE(version_id, file_path)`

---

### 3.4 `lesson_resource_reviews`
Immutable audit log tracking all approval, rejection, and review decisions explicitly tied to version IDs.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Review event ID |
| `resource_id` | `UUID` | `NOT NULL REFERENCES public.lesson_resources(id) ON DELETE RESTRICT` | Target resource ID |
| `version_id` | `UUID` | `NOT NULL REFERENCES public.lesson_resource_versions(id) ON DELETE RESTRICT` | Explicitly bound version ID |
| `reviewer_id` | `UUID` | `NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT` | Admin executing review |
| `action` | `public.review_action` | `NOT NULL` | Action taken (`submitted`, `approved`, `rejected`, etc.) |
| `rejection_reason` | `TEXT` | `NULL` | Structured rejection note if rejected |
| `security_scan_summary` | `JSONB` | `NOT NULL DEFAULT '{}'::jsonb` | Automated preflight scan findings |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Audit event timestamp |

---

### 3.5 `lesson_resource_events`
Audit log recording runtime interactive events emitted by students during playback.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Event log record ID |
| `user_id` | `UUID` | `NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT` | Authenticated student user |
| `resource_id` | `UUID` | `NOT NULL REFERENCES public.lesson_resources(id) ON DELETE RESTRICT` | Resource being interacted with |
| `resource_version_id` | `UUID` | `NOT NULL REFERENCES public.lesson_resource_versions(id) ON DELETE RESTRICT` | Active version record ID |
| `version_number` | `INTEGER` | `NOT NULL` | Version active during session |
| `event_type` | `VARCHAR(30)` | `NOT NULL` | Event classification |
| `session_nonce` | `UUID` | `NOT NULL` | Ephemeral playback session ID |
| `event_sequence` | `INTEGER` | `NOT NULL` | Monotonic sequence within session |
| `payload` | `JSONB` | `NOT NULL DEFAULT '{}'::jsonb` | Sanitized event telemetry (NO PII/answers) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Event receipt timestamp |

*Explicit Constraints:* `UNIQUE(resource_version_id, session_nonce, event_sequence)`

---

### 3.6 `content_import_batches`
Tracks bulk HTML package import sessions.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Import batch ID |
| `batch_code` | `VARCHAR(64)` | `NOT NULL UNIQUE` | Human-friendly code (e.g. `BATCH-20260805-001`) |
| `uploaded_by` | `UUID` | `NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT` | Content Manager / Admin user |
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
| `batch_id` | `UUID` | `NOT NULL REFERENCES public.content_import_batches(id) ON DELETE RESTRICT` | Parent batch ID |
| `row_number` | `INTEGER` | `NOT NULL` | 1-indexed row position in batch manifest |
| `resource_code` | `VARCHAR(64)` | `NOT NULL` | Target resource code |
| `raw_payload` | `JSONB` | `NOT NULL` | Preflight verification payload |
| `is_valid` | `BOOLEAN` | `NOT NULL DEFAULT true` | Preflight compliance boolean |
| `findings` | `JSONB` | `NOT NULL DEFAULT '[]'::jsonb` | Array of validation warnings/errors |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Item timestamp |

*Explicit Constraints:* `UNIQUE(batch_id, row_number)`

---

### 3.8 `idempotency_ledger`
Ledger tracking unique mutating RPC operations to prevent duplicate executions.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Ledger record ID |
| `actor_id` | `UUID` | `NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT` | User initiating operation |
| `operation` | `VARCHAR(64)` | `NOT NULL` | Target RPC operation name |
| `idempotency_key` | `TEXT` | `NOT NULL` | Client-provided idempotency key |
| `response_payload` | `JSONB` | `NULL` | Cached response payload |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Record creation timestamp |

*Explicit Constraints:* `UNIQUE(actor_id, operation, idempotency_key)`

---

## 4. Version Integrity Rules & Foreign Key Policies

To guarantee snapshot integrity and auditability, foreign keys on versions, reviews, events, and import tables strictly enforce:

1. **NO `ON DELETE CASCADE` on Audit Tables**:
   - `lesson_resource_versions`, `lesson_resource_reviews`, `lesson_resource_events`, `content_import_batches`, `content_import_rows`, and `idempotency_ledger` use `ON DELETE RESTRICT` or `ON DELETE NO ACTION`. Deleting records from these tables directly is forbidden.
   - Deactivation of resources must use soft archiving (`status = 'archived'`).

2. **Published Version Guards**:
   - `published_version_id` can ONLY be set to a version whose status in `lesson_resource_reviews` is `approved` and whose `resource_id` matches the parent `lesson_resources.id`.
   - Database trigger or RPC check prevents binding an unapproved version to `published_version_id`.
   - Attempting to delete a version currently referenced by `published_version_id` aborts with `RESTRICT` error.

3. **Immutability of Snapshot Bytes/Hash**:
   - `BEFORE UPDATE` trigger on `lesson_resource_versions` prevents modifying `content_sha256`, `package_size_compressed`, `package_size_uncompressed`, `file_count`, or `storage_path` once created.

---

## 5. Idempotency & Optimistic Concurrency Controls

1. **Idempotency Key Enforcement**:
   - Every mutating RPC requires an `idempotency_key` parameter.
   - Execution checks `idempotency_ledger` for `UNIQUE(actor_id, operation, idempotency_key)`. Re-execution yields the cached response payload without re-running side effects.

2. **CAS `lock_version` Locking**:
   - `lesson_resources` contains `lock_version INTEGER`.
   - All status transitions require passing `expected_lock_version`.
   - Queries perform `SELECT ... FOR UPDATE` on `lesson_resources` during `publish_resource_version`.
   - If `lock_version != expected_lock_version`, transaction aborts with error code `STALE_LOCK_VERSION` (409 Conflict).

---

## 6. State Machine Matrix for `lesson_resources.status`

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

| Current Status | Target Status | Permitted Trigger Action | Allowed MVP Role | Guards & Conditions |
| :--- | :--- | :--- | :--- | :--- |
| `draft` | `in_review` | `submit_for_review` | `content_manager`, `admin` | Preflight scanner passes 100% cleanly; binds `current_draft_version_id` |
| `in_review` | `approved` | `approve_resource_version` | `admin` | Explicit review log entry created; binds `approved_version_id` |
| `in_review` | `rejected` | `reject_resource_version` | `admin` | Rejection reason required; resets status to `draft` |
| `rejected` | `draft` | `submit_for_review` | `content_manager`, `admin` | Fixes applied, new `version_number` created |
| `approved` | `published` | `publish_resource_version` | `admin` | Files copied to `lesson-resource-published`; CAS check; binds `published_version_id` |
| `published` | `approved` | `unpublish_resource_version` | `admin` | Reverts `published_version_id` to NULL; status reverts to `approved` |
| `published` | `archived` | `archive_resource` | `admin` | Resource retired, student access revoked |
| `archived` | Terminal | None | N/A | Default terminal state |

---

## 7. Correct-Answer Leakage & Student Privacy Guarantees

1. **No Client-Side Hashed Answer Keys**:
   - Interactive packages (`mind_map_html`, `practical_experiment_html`) must NOT contain client-side hashed answer keys inside HTML, JSON attributes, or JavaScript files.
   - Preflight package scanner checks HTML packages for answer key fields (`correct_index`, `answer_key`, `hashed_answer`, etc.) and aborts validation if found.
   - All question evaluations requiring correct answer checks occur strictly Server-Side.

2. **No Student PII**:
   - Telemetry payloads (`lesson_resource_events.payload`) are strictly scrubbed of student names, emails, or hardware serial numbers. Only `user_id` (`auth.uid()`) is referenced.
