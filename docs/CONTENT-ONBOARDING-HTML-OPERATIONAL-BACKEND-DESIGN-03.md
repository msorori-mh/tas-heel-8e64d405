# Operational Backend Architecture Design for HTML Content Onboarding (v0.5)

**Document ID:** `CONTENT-ONBOARDING-HTML-OPERATIONAL-BACKEND-DESIGN-03`
**Repository:** `msorori-mh/tas-heel-8e64d405`
**Branch:** `docs/content-onboarding-html-operational-backend-design-03`
**Base:** `origin/main`
**Reference Branch:** `origin/feat/content-onboarding-html-interactive-mvp-01`
**Status:** DESIGN & CONTRACTS ONLY (ZERO DB Mutations, ZERO Storage Executions, ZERO `src/` Changes)

---

## 1. Executive Summary & Design Scope

This document specifies the operational backend architecture for importing, reviewing, publishing, and serving interactive HTML lesson resources (`mind_map_html`, `practical_experiment_html`) within the Tas-heel platform.

It builds upon the in-memory dry-run validation foundation established in `origin/feat/content-onboarding-html-interactive-mvp-01` and bridges it to an enterprise-grade backend infrastructure with strict authorization controls, snapshot versioning, content hashing, audit trails, and fail-closed security guarantees.

### 1.1 Non-Negotiable Boundary Constraints
- **ZERO Code Modifications in `src/`**: All existing application source code remains untouched in this design task.
- **ZERO SQL Executions or Database Writes**: No migration scripts have been placed in `supabase/migrations/` or executed against any database.
- **ZERO Storage Operations**: Storage buckets and policies are defined purely as contract specifications.
- **Strict Server/RPC Boundary**: Browser client code is denied direct database write access to resource tables and prohibited from direct writes to storage buckets.

---

## 2. Approved MVP Roles & Authorization

The authorization system for this MVP stage relies strictly on system roles:

- **`content_manager`**:
  - Create Draft (`create_import_batch`).
  - Upload package to staging (`finalize_uploaded_package`).
  - Modify Draft & validate (`validate_package`).
  - Submit for review (`submit_for_review`).
  - **CANNOT** Approve, Reject, Publish, Unpublish, or Archive.

- **`admin`**:
  - Review & Validate (`validate_package`).
  - Approve / Reject (`approve_resource_version`, `reject_resource_version`).
  - Publish / Unpublish / Archive (`publish_resource_version`, `unpublish_resource_version`, `archive_resource`).
  - Perform audited version rollbacks (`rollback_published_resource_version`).
  - Manage audited emergency states.

- **`student`**:
  - Defined dynamically as any authenticated user (`auth.uid() IS NOT NULL`) who does **NOT** hold `admin` or `content_manager` roles.
  - Read published resources only (`fetch_published_lesson_resources`) for accessible lessons.

*(Note: `student` is NOT an `app_role` enum value. Roles `reviewer` and `publisher` are NOT added to `app_role` at this MVP phase).*

---

## 3. Data Architecture & Additive Migration Strategy

The operational design extends the pre-existing `lesson_resources` table via additive `ALTER TABLE` operations and introduces 8 database entities spanning versions, file manifests, review audits, interactive telemetry, import batches, storage ledgers, and idempotency tracking:

1. **`lesson_resources`**: Master table (pre-existing, extended via additive columns) tracking interactive resource metadata with canonical `title` and `description` (Arabic-first), legacy `url` compatibility, state (`draft`, `in_review`, `approved`, `published`, `rejected`, `archived`), optimistic concurrency CAS counter (`lock_version`), and explicit version foreign keys:
   - `current_draft_version_id` (FK to `lesson_resource_versions(id) ON DELETE RESTRICT`)
   - `approved_version_id` (FK to `lesson_resource_versions(id) ON DELETE RESTRICT`)
   - `published_version_id` (FK to `lesson_resource_versions(id) ON DELETE RESTRICT`)
2. **`lesson_resource_versions`**: Immutable snapshot versions with explicit constraints:
   - `UNIQUE(resource_id, version_number)`
   - `UNIQUE(resource_id, content_sha256)`
   - `CHECK version_number > 0`
3. **`lesson_resource_files`**: Detailed file manifest indexing extracted assets within a version package.
4. **`lesson_resource_reviews`**: Immutable review log tracking all submission, approval, rejection, and publishing events explicitly tied to `version_id`.
5. **`lesson_resource_events`**: Student telemetry audit log bound by `UNIQUE(resource_version_id, session_nonce, event_sequence)`. Joined via `resource_id` (no `lesson_id` on table).
6. **`content_import_batches`**: Bulk import session registry tracking uploaded package payloads.
7. **`content_import_rows`**: Validation breakdown bound by `UNIQUE(batch_id, row_number)`.
8. **`storage_operations`**: Storage operation ledger tracking staging, file promotion, orphan cleanup, and saga compensation (`pending`, `uploaded`, `verified`, `promoted`, `cleanup_pending`, `cleaned`, `failed`, `compensated`).
9. **`idempotency_ledger`**: Ledger guaranteeing idempotency bound by `UNIQUE(actor_id, operation, idempotency_key)`.

### Foreign Key & Integrity Policy
- **NO `ON DELETE CASCADE`** on versions, reviews, events, import batches, storage operations, or idempotency logs (`ON DELETE RESTRICT` / `ON DELETE NO ACTION` enforced).
- Deactivation of resources uses soft archiving (`status = 'archived'`).

*Detailed schema definition available in [docs/CONTENT-ONBOARDING-HTML-DATA-MODEL-03.md](file:///C:/projects/tas-heel-content-backend-design-03/docs/CONTENT-ONBOARDING-HTML-DATA-MODEL-03.md).*

---

## 4. Lifecycle State Machine

Resources transition through 6 formal lifecycle states governed by MVP role permissions and security guards:

```
                      +-------------------+
                      |       draft       |
                      +-------------------+
                                |
                        submit_for_review (content_manager / admin)
                                v
                      +-------------------+
                      |     in_review     |
                      +-------------------+
                        /               \
             reject    /                 \  approve
            (admin)   /                   \ (admin)
                     v                     v
          +-------------------+   +-------------------+
          |     rejected      |   |     approved      |
          +-------------------+   +-------------------+
                    |                       |
            submit_for_review               |  publish (admin)
                    v                       v
          +-------------------+   +-------------------+
          |       draft       |   |     published     |
          +-------------------+   +-------------------+
                                            |
                                unpublish / archive / rollback (admin)
                                            v
                                  +-------------------+
                                  | approved/archived |
                                  +-------------------+
```

---

## 5. Private Storage Bucket Saga

Both storage buckets are **PRIVATE** (zero public access):

1. **`lesson-resource-drafts`**
   - **Access:** Private (Public = false).
   - **Staging Path:** `staging/{batch_id}/{resource_code}/v{version}/{filename}`.
   - **Uploaders:** `admin`, `content_manager` via scoped signed upload URLs issued for batch staging prefix ONLY.
   - **Student Access:** Strictly denied.

2. **`lesson-resource-published`**
   - **Access:** Private (Public = false). Read access granted exclusively via short-lived Server-signed URLs (TTL max 15 min) after validating `status = 'published'` and `can_access_lesson(lesson_id)`.
   - **Pathing:** Immutable Hash-pinned (`published/{subject_code}/{resource_code}/{content_hash}/{filename}`).
   - **Browser Write Restriction:** Direct client uploads are prohibited via Storage RLS. File promotion is executed exclusively by server Edge Functions using `service_role`.
   - **Storage Operations Ledger & Saga Phases**: Storage promotion follows a 3-Phase Saga (Phase A: DB pending entry; Phase B: Async copy & re-hash; Phase C: DB bind & commit). Orphan detection and cleanup are managed by `storage_operations`.

*Detailed storage contract available in [docs/CONTENT-ONBOARDING-HTML-STORAGE-CONTRACT-03.md](file:///C:/projects/tas-heel-content-backend-design-03/docs/CONTENT-ONBOARDING-HTML-STORAGE-CONTRACT-03.md).*

---

## 6. Server Contracts (11 RPC Specifications)

1. `create_import_batch`: Initializes bulk import session with idempotency tracking.
2. `finalize_uploaded_package`: Registers uploaded draft zip in storage staging, validates hash/size, and creates version snapshot.
3. `validate_package`: Executes security scanner, CSP validation, and manifest checks.
4. `submit_for_review`: Transitions status from `draft` or `rejected` to `in_review` with CAS locking.
5. `approve_resource_version`: Admin RPC approving a specific version for publication and setting `approved_version_id`.
6. `reject_resource_version`: Admin RPC rejecting a version with mandatory feedback reason.
7. `publish_resource_version`: Admin RPC executing 3-Phase Saga (Phase A: DB lock & operation pending; Phase B: storage copy; Phase C: DB publish commit).
8. `unpublish_resource_version`: Admin RPC reverting published state to `approved`.
9. `archive_resource`: Admin RPC permanently setting resource state to `archived`.
10. `fetch_published_lesson_resources`: Student-facing RPC returning active published HTML resources with short-lived signed access URLs.
11. `rollback_published_resource_version`: Admin RPC safely reverting `published_version_id` to a target approved version.

---

## 7. Security, Idempotency & Correct-Answer Guarantees

- **CAS Optimistic Locking**: Updates to `lesson_resources` check `lock_version`. If a concurrent mutation altered `lock_version`, the transaction aborts with `STALE_LOCK_VERSION` (409 Conflict).
- **Idempotency**: Mutating RPCs require `idempotency_key` checked against `UNIQUE(actor_id, operation, idempotency_key)`.
- **Same-Resource Foreign Key Integrity**: Pointers `current_draft_version_id`, `approved_version_id`, and `published_version_id` on `lesson_resources` use composite foreign keys referencing `(id, resource_id)` on `lesson_resource_versions`. Attempts to associate a version of Resource B to Resource A are rejected by PostgreSQL.
- **Legal Independent Immutability Triggers**: Immutability for versions and files is enforced via separate `BEFORE UPDATE OR DELETE` triggers. Trigger on `lesson_resource_versions` queries parent `lesson_resources` using `OLD.resource_id`. Trigger on `lesson_resource_files` uses `OLD.version_id` with explicit `JOIN`s to `lesson_resource_versions` and `lesson_resources` without referencing non-existent columns (`status`, `resource_id`, `published_version_id`, `version_number`).
- **No Correct-Answer or Explanation Leakage (Security Scanner Contract)**: Interactive HTML packages must NOT contain embedded answer keys, hashed tokens, or explanations inside HTML, JSON attributes, JavaScript objects, manifest files, inline scripts, or local assets. Preflight security scanner checks packages and REJECTS any presence of forbidden fields: `correct_index`, `correct_answer`, `answer_key`, `hashed_answer`, `explanation`, `answer_explanation`, `correct_explanation`, `solution_key`. Student iframe payloads strictly exclude all `explanation` content prior to reveal. Educational explanations shown post-reveal must be fetched from server/application paths outside the content package. General educational explanations must remain independent of answer keys.
- **No Student PII**: Telemetry payloads (`lesson_resource_events.payload`) scrub personal identifiers, referencing only `auth.uid()`.
- **Type Standardization & Baseline Reconciliation**: Entity type standardizes on `external_link` with compatibility mapping (`mindmap` → `mind_map_html`, `experiment` → `practical_experiment_html`, `link` → `external_link`). Baseline canonical columns `title` and `description` are preserved.

---

## 8. Safe Rollback Strategy

1. **Environment Feature Flag**: `ENABLE_HTML_LESSON_RESOURCES=false` instantly reverts client components to legacy views.
2. **Rollback to Previous Approved Version**: `published_version_id` can be updated to point to a previously approved version in an audited CAS transaction via `rollback_published_resource_version`.
3. **Database Down Script Strategy**:
   - `lesson_resources` table is **NEVER** dropped.
   - Enum values are **NEVER** dropped (PostgreSQL does not support removing enum values from existing types).
   - Audit tables (`lesson_resource_reviews`, `lesson_resource_events`, `idempotency_ledger`, `storage_operations`) are **NEVER** dropped in production down scripts (`CASCADE` prohibited). Down script removes FK constraints safely while preserving audit history.
4. **Audit History**: Review, event, and storage operation logs are preserved permanently during rollbacks.
