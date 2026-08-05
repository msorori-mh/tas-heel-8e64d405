# Operational Data Model Specification for HTML Content Onboarding (v0.5)

**Document ID:** `CONTENT-ONBOARDING-HTML-DATA-MODEL-03`
**Status:** DESIGN CONTRACT ONLY (ZERO DB Mutations Applied)
**Target Schema:** `public`
**Base Branch:** `origin/main`
**Reference Branch:** `origin/feat/content-onboarding-html-interactive-mvp-01`

---

## 1. Architectural Overview & MVP Roles

This document defines the operational schema, entity relationships, enums, state machine transitions, version integrity rules, concurrency controls, and data integrity constraints for importing, reviewing, publishing, and auditing interactive HTML content (`mind_map_html`, `practical_experiment_html`) within the Tas-heel platform.

### MVP Role & Student Identity Representation
For this MVP stage, system authorization relies on system roles:
- **`admin`**: User with `app_role = 'admin'`. Can review, approve/reject, publish/unpublish/archive, perform audited rollbacks, and manage emergency states.
- **`content_manager`**: User with `app_role = 'content_manager'`. Can create drafts, upload package staging files, modify drafts, and submit for review. CANNOT approve, reject, publish, unpublish, or archive.
- **`student`**: Defined dynamically as any authenticated user (`auth.uid() IS NOT NULL`) who does **NOT** hold `admin` or `content_manager` roles. Can read published resources only for accessible lessons.
- **Legacy roles (`moderator`, `user`)**: Do NOT grant any content management permissions.
- **Unauthenticated Users**: Strictly prohibited from reading private lesson resources or staging files.

> **CRITICAL ARCHITECTURAL BOUNDARY GUARANTEE:**
> - `student` is **NOT** a new value in `app_role` enum. Do NOT assume `app_role = 'student'`.
> - All client/browser mutations are strictly prohibited from directly altering `lesson_resources`, `lesson_resource_versions`, `lesson_resource_files`, `storage_operations`, or audit tables.
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

-- Storage Operation Status Enum
CREATE TYPE public.storage_operation_status AS ENUM (
  'pending',
  'uploaded',
  'verified',
  'promoted',
  'cleanup_pending',
  'cleaned',
  'failed',
  'compensated'
);
```

### Type Standardization & Baseline Reconciliation
1. **Baseline Columns Reconciliation (`title`, `description`, `url`)**:
   - The pre-existing baseline `lesson_resources` table uses canonical columns `title` and `description`.
   - These columns are maintained as the single canonical source of truth and documented as **Arabic-first** for the current stage.
   - Separate columns `title_ar` and `description_ar` are **NOT** added in this migration and are reserved for a separate future multi-language migration.
   - The legacy `url` column is preserved strictly for backward compatibility with legacy single-file resources and is **NOT** used for new interactive HTML version packages.

2. **Type Compatibility Mapping**:
   - The canonical entity type for external links is `external_link` (not `link`).
   - `mindmap` → `mind_map_html`
   - `experiment` → `practical_experiment_html`
   - `link` → `external_link`

---

## 3. Entity Schemas & Tables (8 Core Entities)

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
| `title` | `TEXT` | `NOT NULL` | Canonical Arabic-first title |
| `description` | `TEXT` | `NULL` | Canonical Arabic-first descriptive overview |
| `url` | `TEXT` | `NULL` | Legacy single-file compatibility URL (unused for HTML packages) |
| `alt_text_ar` | `TEXT` | `NULL` | Accessibility description |
| `sort_order` | `INTEGER` | `NOT NULL DEFAULT 1` | Presentation order within lesson |
| `status` | `public.lesson_resource_status` | `NOT NULL DEFAULT 'draft'` | Current state in lifecycle pipeline |
| `current_draft_version_id` | `UUID` | `FOREIGN KEY (current_draft_version_id, id) REFERENCES public.lesson_resource_versions(id, resource_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED` | Active draft version reference |
| `approved_version_id` | `UUID` | `FOREIGN KEY (approved_version_id, id) REFERENCES public.lesson_resource_versions(id, resource_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED` | Most recently approved version |
| `published_version_id` | `UUID` | `FOREIGN KEY (published_version_id, id) REFERENCES public.lesson_resource_versions(id, resource_id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED` | Currently published version |
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

*Same-Resource Integrity Contract:*
- **Composite Uniqueness**: Table `lesson_resource_versions` defines `UNIQUE(id, resource_id)`.
- **Cross-Resource Rejection**: Composite FKs `(current_draft_version_id, id)`, `(approved_version_id, id)`, and `(published_version_id, id)` reference `(id, resource_id)` on `lesson_resource_versions`. A version belonging to Resource B can NEVER be assigned to Resource A.
- **Null Handling**: Under PostgreSQL default `MATCH SIMPLE`, if a version pointer is NULL, the FK check passes. When non-NULL, PostgreSQL mandates that the exact pair `(version_id, resource_id)` exists.
- **Order of Creation & Cycle Prevention**: `lesson_resources` master table created first -> `lesson_resource_versions` created with `PRIMARY KEY (id)` and `UNIQUE(id, resource_id)` -> Composite FKs attached to `lesson_resources` using `DEFERRABLE INITIALLY DEFERRED`.
- **Backfill Validation**: Constraints created as `NOT VALID` during migration, existing records reconciled, followed by `ALTER TABLE public.lesson_resources VALIDATE CONSTRAINT ...`.

---

### 3.2 `lesson_resource_versions`
Immutable version snapshots linked to specific `content_sha256` digests and package metrics.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique version record ID |
| `resource_id` | `UUID` | `NOT NULL REFERENCES public.lesson_resources(id) ON DELETE RESTRICT` | Parent resource ID |
| `version_number` | `INTEGER` | `NOT NULL CHECK (version_number > 0)` | Monotonically increasing version number |
| `entry_file` | `TEXT` | `NOT NULL DEFAULT 'index.html'` | Main entry point relative file path |
| `content_sha256` | `CHAR(64)` | `NOT NULL` | SHA-256 hash of entire package zip |
| `package_size_compressed` | `BIGINT` | `NOT NULL` | Zip payload size in bytes |
| `package_size_uncompressed` | `BIGINT` | `NOT NULL` | Extracted content total bytes |
| `file_count` | `INTEGER` | `NOT NULL` | Total number of extracted files |
| `csp_header` | `TEXT` | `NOT NULL` | Content Security Policy header |
| `storage_path` | `TEXT` | `NOT NULL` | Staging or hash-pinned storage path |
| `published_at` | `TIMESTAMPTZ` | `NULL` | Timestamp of publication |
| `published_by` | `UUID` | `REFERENCES auth.users(id) ON DELETE RESTRICT` | Auth user who published version |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Version creation timestamp |

*Explicit Constraints & Canonical Constraint Names:*
- `uq_resource_version_id_resource`: `CONSTRAINT uq_resource_version_id_resource UNIQUE(id, resource_id)` (Composite key for Same-Resource Integrity)
- `fk_lesson_resources_current_draft_same_resource`: `FOREIGN KEY (current_draft_version_id, id) REFERENCES public.lesson_resource_versions(id, resource_id)`
- `fk_lesson_resources_approved_same_resource`: `FOREIGN KEY (approved_version_id, id) REFERENCES public.lesson_resource_versions(id, resource_id)`
- `fk_lesson_resources_published_same_resource`: `FOREIGN KEY (published_version_id, id) REFERENCES public.lesson_resource_versions(id, resource_id)`
- `uq_resource_version_number`: `UNIQUE(resource_id, version_number)`
- `uq_resource_content_sha256`: `UNIQUE(resource_id, content_sha256)`
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
Audit log recording runtime interactive events emitted by students during playback. (Note: does not store `lesson_id` directly; joins via `resource_id`).

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

### 3.8 `storage_operations` (Storage Operation Ledger)
Ledger tracking all storage uploads, file promotions, hash verifications, orphan cleanups, and saga compensation steps.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Ledger entry ID |
| `batch_id` | `UUID` | `NULL REFERENCES public.content_import_batches(id) ON DELETE RESTRICT` | Parent batch reference |
| `resource_version_id` | `UUID` | `NULL REFERENCES public.lesson_resource_versions(id) ON DELETE RESTRICT` | Associated version reference |
| `operation_type` | `VARCHAR(50)` | `NOT NULL` | `stage_upload`, `promote_to_published`, `orphan_cleanup`, `rollback_cleanup`, `archival_cleanup` |
| `source_path` | `TEXT` | `NULL` | Source object key path in storage |
| `target_path` | `TEXT` | `NULL` | Target object key path in storage |
| `expected_hash` | `CHAR(64)` | `NULL` | Expected SHA-256 hash digest |
| `status` | `public.storage_operation_status` | `NOT NULL DEFAULT 'pending'` | `pending`, `uploaded`, `verified`, `promoted`, `cleanup_pending`, `cleaned`, `failed`, `compensated` |
| `attempt_count` | `INTEGER` | `NOT NULL DEFAULT 0` | Execution retry attempt counter |
| `last_error` | `TEXT` | `NULL` | Error details if operation failed |
| `idempotency_key` | `TEXT` | `NOT NULL UNIQUE` | Unique client/saga idempotency key |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Ledger creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Ledger update timestamp |
| `completed_at` | `TIMESTAMPTZ` | `NULL` | Completion timestamp |

*Explicit Constraints & Ownership:*
- `UNIQUE(idempotency_key)`
- **Retry Policy**: Exponential backoff up to 3 retries. Failed steps transition to `failed` or `cleanup_pending`.
- **Orphan Detection & Reconciliation Job**: Periodic server job identifies records in `pending` or `cleanup_pending` older than 24 hours and performs cleanup or compensation.
- **Compensation Contract**: If storage promotion fails after Phase A commit, compensation marks `status = 'compensated'` and flags draft objects for garbage collection without polluting student visibility.

---

### 3.9 `idempotency_ledger`
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

## 4. RLS Policy Specifications with Legal Explicit Joins

> **CRITICAL JOIN COMPLIANCE:**
> Tables `lesson_resource_versions`, `lesson_resource_files`, and `lesson_resource_events` do **NOT** contain a direct `lesson_id` column. RLS policies MUST use explicit, legal database JOINs. Referencing `lesson_id` directly on child tables is strictly forbidden.

### 4.1 `lesson_resources` Read Policy (Student Access)
```sql
CREATE POLICY "Students Read Published Lesson Resources"
ON public.lesson_resources
FOR SELECT
TO authenticated
USING (
  status = 'published'
  AND published_version_id IS NOT NULL
  AND public.can_access_lesson(lesson_id)
);
```

### 4.2 `lesson_resource_versions` Read Policy (Student Access via Explicit Join)
```sql
CREATE POLICY "Students Read Published Lesson Resource Versions"
ON public.lesson_resource_versions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lesson_resources lr
    WHERE lr.id = lesson_resource_versions.resource_id
      AND lr.published_version_id = lesson_resource_versions.id
      AND lr.status = 'published'
      AND public.can_access_lesson(lr.lesson_id)
  )
);
```

### 4.3 `lesson_resource_files` Read Policy (Student Access via 2-Hop Explicit Join)
```sql
CREATE POLICY "Students Read Published Lesson Resource Files"
ON public.lesson_resource_files
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lesson_resource_versions lrv
    JOIN public.lesson_resources lr ON lr.id = lrv.resource_id
    WHERE lrv.id = lesson_resource_files.version_id
      AND lr.published_version_id = lrv.id
      AND lr.status = 'published'
      AND public.can_access_lesson(lr.lesson_id)
  )
);
```

### 4.4 `lesson_resource_events` Insert & Read Policy (Student Access via Explicit Join)
```sql
CREATE POLICY "Students Insert Event Telemetry"
ON public.lesson_resource_events
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.lesson_resources lr
    WHERE lr.id = lesson_resource_events.resource_id
      AND public.can_access_lesson(lr.lesson_id)
  )
);
```

---

## 5. Published Immutability & Audit Preservation Contracts

## 5. Published Immutability & Audit Preservation Contracts

### 5.1 Published Immutability Contract & Trigger Semantics
To guarantee snapshot integrity, approved and published version records and their file manifests are permanently **immutable**:

1. **Protected Fields**:
   - `resource_id`, `version_number`, `content_sha256`, `storage_path`, `entry_file`, `csp_header`, `package_size_compressed`, `package_size_uncompressed`, `file_count`, `created_by`, `created_at`, `published_at`, `published_by`.

2. **Trigger / Enforcement Rules**:
   - Immutability is enforced via two independent per-table triggers:
     - `fn_ensure_immutable_resource_version()` on `lesson_resource_versions`: Evaluates parent resource status using `OLD.resource_id` (queries `lesson_resources lr WHERE lr.id = OLD.resource_id`).
     - `fn_ensure_immutable_resource_file()` on `lesson_resource_files`: Uses `OLD.version_id` with explicit `JOIN`s to `lesson_resource_versions lrv ON lrv.id = OLD.version_id` and `lesson_resources lr ON lr.id = lrv.resource_id`. Does NOT reference non-existent columns (`OLD.status`, `OLD.resource_id`, `OLD.published_version_id`, or `OLD.version_number`).
   - If the version is referenced as `approved_version_id` or `published_version_id`, or if resource status is `approved` or `published`, any `UPDATE` or `DELETE` attempt raises exception `PUBLISHED_VERSION_IMMUTABLE` (409 Conflict).
   - **Correct Semantics for UPDATE and DELETE**:
     - When protected (`approved` / `published`): RAISE EXCEPTION on UPDATE or DELETE.
     - When unprotected (`draft`, `in_review`, `rejected`, `archived`):
       - `UPDATE` returns `NEW`.
       - `DELETE` returns `OLD`.
     - Explicit trigger structure:
       ```sql
       IF TG_OP = 'DELETE' THEN
         RETURN OLD;
       END IF;
       RETURN NEW;
       ```

3. **Trigger Semantics Contract Examples**:
   - **Draft Version Deletion (PERMITTED)**: `DELETE FROM lesson_resource_versions WHERE id = 'draft-id';` -> Permitted under Cleanup policy (returns OLD).
   - **Approved Version Deletion (REJECTED)**: `DELETE FROM lesson_resource_versions WHERE id = 'approved-id';` -> Exception `PUBLISHED_VERSION_IMMUTABLE`.
   - **Published Version Deletion (REJECTED)**: `DELETE FROM lesson_resource_versions WHERE id = 'published-id';` -> Exception `PUBLISHED_VERSION_IMMUTABLE`.
   - **Draft Version Update (PERMITTED)**: `UPDATE lesson_resource_versions SET entry_file = 'index.html' WHERE id = 'draft-id';` -> Permitted for editable fields (returns NEW).
   - **Published Version Update (REJECTED)**: `UPDATE lesson_resource_versions SET entry_file = 'index.html' WHERE id = 'published-id';` -> Exception `PUBLISHED_VERSION_IMMUTABLE`.

4. **Grants & Revokes**:
   - `REVOKE UPDATE, DELETE ON public.lesson_resource_versions FROM authenticated, anon;`
   - `REVOKE UPDATE, DELETE ON public.lesson_resource_files FROM authenticated, anon;`

### 5.2 Audit Immutability Contract (Privileges, Triggers & No `CASCADE`)

1. **Two-Layer Audit Protection**:
   - **Layer A (Privileges)**:
     ```sql
     REVOKE UPDATE, DELETE ON public.lesson_resource_reviews FROM authenticated, anon;
     REVOKE UPDATE, DELETE ON public.lesson_resource_events FROM authenticated, anon;
     REVOKE UPDATE, DELETE ON public.idempotency_ledger FROM authenticated, anon;
     REVOKE UPDATE, DELETE ON public.storage_operations FROM authenticated, anon;
     ```
   - **Layer B (Immutable Triggers)**: `fn_ensure_immutable_audit_record()` triggers on `lesson_resource_reviews`, `lesson_resource_events`, and `idempotency_ledger` raise exceptions on any `UPDATE` or `DELETE`. `fn_ensure_immutable_storage_operation()` on `storage_operations` prohibits `DELETE` completely and blocks `UPDATE` when status is in `('completed', 'cleaned', 'compensated')`.

2. **Legal Separation of Operational Transitions vs Audit Immutability**:
   - **Operational State Transitions**: Legitimate status updates during Saga execution (e.g. `storage_operations.status` moving `pending` → `uploaded` → `verified` → `promoted`) occur strictly via server-side RPCs running with `SECURITY DEFINER`.
   - **Immutable Audit Records**: Once a storage operation reaches a terminal state (`completed`, `cleaned`, `compensated`), all further modifications are rejected. Audit records in `lesson_resource_reviews`, `lesson_resource_events`, and `idempotency_ledger` are strictly read-only and immutable from creation.

3. **No `ON DELETE CASCADE` & Non-destructive Teardown**:
   - Audit tables (`lesson_resource_reviews`, `lesson_resource_events`, `idempotency_ledger`, `storage_operations`) use `ON DELETE RESTRICT`.
   - Down migrations and rollbacks in production MUST **NOT** execute `DROP TABLE CASCADE` or destroy audit data.
   - Feature flag rollback (`ENABLE_HTML_LESSON_RESOURCES=false`) disables new reads while preserving all tables and logs.
   - Non-production development teardown removes composite foreign keys using exact canonical constraint names (`fk_lesson_resources_current_draft_same_resource`, `fk_lesson_resources_approved_same_resource`, `fk_lesson_resources_published_same_resource`) without dropping audit or version history tables.

---

## 6. Idempotency & Optimistic Concurrency Controls

1. **Idempotency Key Enforcement**:
   - Every mutating RPC requires an `idempotency_key` parameter.
   - Execution checks `idempotency_ledger` for `UNIQUE(actor_id, operation, idempotency_key)`. Re-execution yields the cached response payload without re-running side effects.

2. **CAS `lock_version` Locking**:
   - `lesson_resources` contains `lock_version INTEGER`.
   - All status transitions require passing `expected_lock_version`.
   - Queries perform `SELECT ... FOR UPDATE` on `lesson_resources` during status-changing RPCs.
   - If `lock_version != expected_lock_version`, transaction aborts with error code `STALE_LOCK_VERSION` (409 Conflict).

---

## 7. State Machine Matrix for `lesson_resources.status`

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
| `approved` | `published` | `publish_resource_version` | `admin` | Storage Saga Phases A/B/C executed; CAS check; binds `published_version_id` |
| `published` | `approved` | `unpublish_resource_version` | `admin` | Reverts `published_version_id` to NULL; status reverts to `approved` |
| `published` | `approved` | `rollback_published_resource_version` | `admin` | Reverts `published_version_id` to specified target approved version |
| `published` | `archived` | `archive_resource` | `admin` | Resource retired, student access revoked |
| `archived` | Terminal | None | N/A | Default terminal state |

---

## 8. Saga Phases & RPC Transaction Boundaries

Every mutating RPC has explicitly defined transaction boundaries. Distributed transaction simulation is prohibited.

### 8.1 Publish Version Storage Saga (Phases A / B / C)

```
[Phase A: DB Transaction 1]
  1. SELECT ... FOR UPDATE on lesson_resources
  2. CAS check (lock_version == expected_lock_version)
  3. Validate version status is 'approved'
  4. Create pending storage operation in storage_operations (status = 'pending')
  5. COMMIT DB Transaction 1

[Phase B: Storage Copy & Verification (Async/Edge Function)]
  1. Verify source files in lesson-resource-drafts
  2. Perform re-hash verification (SHA-256 match)
  3. Copy objects to lesson-resource-published/published/{subject_code}/{resource_code}/{content_hash}/
  4. Update storage_operations status to 'promoted'

[Phase C: DB Transaction 2]
  1. BEGIN DB Transaction 2
  2. SELECT ... FOR UPDATE on lesson_resources
  3. Re-verify CAS & approval status
  4. Set status = 'published', published_version_id = p_version_id, increment lock_version
  5. Insert immutable audit entry in lesson_resource_reviews
  6. COMMIT DB Transaction 2
```

**Failure & Isolation Guarantees**:
- **No Student Visibility Before Phase C**: Students query strictly where `status = 'published' AND published_version_id IS NOT NULL`. Files in published storage remain invisible to students until Phase C commits.
- **Orphan Cleanup**: If Phase B fails or times out, the object is registered in `storage_operations` with `status = 'cleanup_pending'` for background garbage collection.
- **Idempotency & Retry**: Re-running `publish_resource_version` with the same `idempotency_key` picks up existing promoted storage state or safely completes Phase C.

---

## 9. Rollback RPC Specification (`rollback_published_resource_version`)

Dedicated RPC contract for safe, audited rollback of published resource versions:

- **FunctionName**: `rollback_published_resource_version`
- **Caller Identity**: `auth.uid()` (Must have `admin` role).
- **Security & Search Path**: `SECURITY DEFINER SET search_path = public, pg_temp`.
- **Inputs**:
  - `p_resource_id UUID`
  - `p_target_version_id UUID`
  - `p_expected_lock_version INTEGER`
  - `p_reason TEXT` (Mandatory, min length > 10 chars)
  - `p_idempotency_key TEXT`
- **Pre-Conditions & Validation**:
  - `p_target_version_id` must exist, belong to `p_resource_id`, and have been previously approved (`lesson_resource_reviews` contains action `'approved'`).
  - Hash digest of target version files must be verified in storage.
- **Execution & Audit**:
  - CAS `SELECT ... FOR UPDATE` lock on `lesson_resources`.
  - Sets `published_version_id = p_target_version_id`, `status = 'published'`, increments `lock_version`.
  - Records immutable review audit entry in `lesson_resource_reviews` with action `'published'` and details including `previous_published_version_id` and `new_published_version_id`.
  - Logs storage reconciliation evidence in `storage_operations`.

---

## 10. Correct-Answer Leakage & Student Privacy Guarantees

1. **No Client-Side Answer Keys or Explanation Leakage**:
   - Interactive packages (`mind_map_html`, `practical_experiment_html`) must NOT contain client-side answer keys or explanations inside HTML, JSON attributes, JavaScript objects, manifest files, inline scripts, or local assets.
   - Preflight package security scanner checks packages and REJECTS any package containing forbidden fields and patterns:
     - `correct_index`
     - `correct_answer`
     - `answer_key`
     - `hashed_answer`
     - `explanation`
     - `answer_explanation`
     - `correct_explanation`
     - `solution_key`
   - **Pre-Reveal Gate & Student Iframe Payload**: Explanations MUST NOT be passed to HTML or iframe payloads prior to the Reveal gate. Student iframe payloads strictly exclude all `explanation` properties.
   - **Post-Reveal Explanation Path**: Educational explanations shown after submission/reveal must be served exclusively via secure Server/Application API endpoints outside the HTML content package.
   - **General Educational Content Independence**: Standalone educational explanation material must be completely independent from hidden question answer mappings to prevent reverse-engineering correct answers.
   - All question evaluations requiring correct answer checks occur strictly Server-Side.

2. **No Student PII**:
   - Telemetry payloads (`lesson_resource_events.payload`) are strictly scrubbed of student names, emails, or hardware serial numbers. Only `user_id` (`auth.uid()`) is referenced.
