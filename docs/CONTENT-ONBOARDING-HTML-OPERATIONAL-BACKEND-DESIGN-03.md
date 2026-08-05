# Operational Backend Architecture Design for HTML Content Onboarding (v0.3)

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
- **Strict Server/RPC Boundary**: Browser client code is denied direct database write access to resource tables and prohibited from direct writes to published storage buckets.

---

## 2. Current State vs. Operational Backend Design

| Domain | Current Baseline (`origin/main`) | MVP-01 Feature Branch (`origin/feat/content-onboarding-html-interactive-mvp-01`) | Operational Backend Target (v0.3 Design) |
| :--- | :--- | :--- | :--- |
| **Persistence** | Static URL references only | In-memory dry-run validation & mock state | Full relational DB schema + Supabase Storage |
| **Versioning** | Single static column | In-memory manifest preflight | Immutable snapshot tables (`lesson_resource_versions`) |
| **Review Workflow** | N/A | Local UI drag-and-drop preview | Multi-stage lifecycle (`draft` -> `in_review` -> `approved` -> `published`) |
| **Storage Buckets** | None dedicated | Local blob URLs | `lesson-resource-drafts` (Private) & `lesson-resource-published` (Hash-pinned) |
| **Security Boundary** | Standard static RLS | Browser-side client scanning | Fail-closed server RPCs + Storage object policies + Signed URLs |

---

## 3. Data Architecture Summary

The operational design introduces 7 database entities spanning resource metadata, version manifests, review audits, interactive telemetry, and import batches:

1. **`lesson_resources`**: Master table tracking interactive resource metadata, orientation, height mode, completion triggers, and current state (`draft`, `in_review`, `approved`, `published`, `rejected`, `archived`).
2. **`lesson_resource_versions`**: Immutable version snapshots linked to specific `content_sha256` digests, package byte sizes, CSP headers, and storage paths.
3. **`lesson_resource_files`**: Detailed file manifest indexing every extracted asset within a version (file path, MIME type, SHA-256 hash).
4. **`lesson_resource_reviews`**: Immutable review log tracking all submission, approval, rejection, and publishing events with reviewer identity and notes.
5. **`lesson_resource_events`**: Student interactive telemetry audit log (experiment started, step completed) bound by session nonces.
6. **`content_import_batches`**: Bulk import session registry tracking uploaded package counts and validation results.
7. **`content_import_rows`**: Granular validation log detailing row-by-row preflight checks during bulk import.

*Detailed schema definition available in [docs/CONTENT-ONBOARDING-HTML-DATA-MODEL-03.md](file:///C:/projects/tas-heel-content-backend-design-03/docs/CONTENT-ONBOARDING-HTML-DATA-MODEL-03.md).*

---

## 4. Lifecycle State Machine

Resources transition through 6 formal lifecycle states governed by role permissions and security criteria:

```
                      +-------------------+
                      |       draft       |
                      +-------------------+
                                |
                        submit_for_review (admin / content_manager)
                                v
                      +-------------------+
                      |     in_review     |
                      +-------------------+
                        /               \
            reject     /                 \  approve
   (reviewer / admin) /                   \ (reviewer / admin)
                     v                     v
          +-------------------+   +-------------------+
          |     rejected      |   |     approved      |
          +-------------------+   +-------------------+
                    |                       |
            resubmit_draft            publish (publisher / admin)
                    v                       v
          +-------------------+   +-------------------+
          |       draft       |   |     published     |
          +-------------------+   +-------------------+
                                            |
                                      archive (publisher / admin)
                                            v
                                  +-------------------+
                                  |     archived      |
                                  +-------------------+
```

---

## 5. Storage Contract Strategy

The backend defines two distinct Supabase Storage buckets with strict role-based separation:

1. **`lesson-resource-drafts`**
   - **Access:** Private (Public = false).
   - **Uploaders:** `admin`, `content_manager`.
   - **Review Access:** Short-lived HMAC-signed URLs generated for `reviewer` tokens (max 15 min TTL).
   - **Student Access:** Strictly denied.

2. **`lesson-resource-published`**
   - **Access:** Read-only for authenticated students possessing active lesson permissions via `can_access_lesson(lesson_id)`.
   - **Pathing:** Hash-pinned (`published/{subject_code}/{resource_code}/{content_hash}/{filename}`).
   - **Browser Write Restriction:** Direct client uploads are prohibited via Storage RLS. File transfer is executed exclusively by server Edge Functions using `service_role`.

*Detailed storage contract available in [docs/CONTENT-ONBOARDING-HTML-STORAGE-CONTRACT-03.md](file:///C:/projects/tas-heel-content-backend-design-03/docs/CONTENT-ONBOARDING-HTML-STORAGE-CONTRACT-03.md).*

---

## 6. Server Contracts (10 RPC & Edge Function APIs)

1. `create_import_batch`: Initializes bulk import session.
2. `upload_package`: Stores zip package in `lesson-resource-drafts` and indexes manifest.
3. `validate_package`: Executes security scanner, CSP validation, and manifest checks.
4. `submit_for_review`: Moves status from `draft` to `in_review`.
5. `approve`: Approves version for publication.
6. `reject`: Rejects version with mandatory reason feedback.
7. `publish`: Copies files to `lesson-resource-published`, sets state to `published`.
8. `unpublish`: Reverts published state to `draft` or `archived`.
9. `archive`: Permanently retires resource version.
10. `fetch_published_lesson_resources`: Student RPC retrieving active published HTML resources for a lesson.

---

## 7. Security & Authorization Matrix Overview

Permissions are enforced across 5 roles (`admin`, `content_manager`, `reviewer`, `publisher`, `student`):

- **Upload & Preflight:** `admin`, `content_manager`.
- **Review (Approve/Reject):** `reviewer`, `admin`.
- **Publish & Archive:** `publisher`, `admin`.
- **Student Consumption:** `student` can ONLY read resources with `status = 'published'` for accessible lessons.
- **Fail-Closed Default:** Unauthenticated or unauthorized calls yield zero rows or permission errors.
- **No Answer Leakage & No PII:** Interactive assets and event logs exclude correct answer keys and student personal identifiable information.

*Machine-readable matrix available in [docs/CONTENT-ONBOARDING-HTML-AUTHORIZATION-MATRIX-03.json](file:///C:/projects/tas-heel-content-backend-design-03/docs/CONTENT-ONBOARDING-HTML-AUTHORIZATION-MATRIX-03.json).*

---

## 8. Requirements Matrix & Operational Specifications

### 8.1 Existing Baseline
- Basic static resource table (`lesson_resources` without HTML versioning or storage manifests).
- In-memory HTML package validator built in feature branch `origin/feat/content-onboarding-html-interactive-mvp-01`.

### 8.2 DB Migration Requirements
- Extend `lesson_resource_type` enum with `mind_map_html`, `practical_experiment_html`, `summary_html`.
- Create `lesson_resource_status`, `review_action`, `import_batch_status` enums.
- Create 6 new tables and alter `lesson_resources` as defined in `docs/CONTENT-ONBOARDING-HTML-DATA-MODEL-03.md`.
- Apply RLS policies to all 7 tables.

### 8.3 Edge Function & RPC Requirements
- 10 operational contracts implemented as Postgres functions or Supabase Edge Functions with `service_role` execution context for publishing operations.

### 8.4 Storage Policies
- Storage policies on `storage.objects` for `lesson-resource-drafts` and `lesson-resource-published`.

### 8.5 Fail-Closed Conditions
- RLS default deny for non-published states.
- Hash mismatch abort during publish.
- Missing reviewer signature aborts draft viewing.

### 8.6 Rollback Strategy
- Environment feature flag `ENABLE_HTML_LESSON_RESOURCES=false`.
- Reversible SQL down-script for database schemas.
- Storage bucket deletion script for draft/published buckets.

### 8.7 Post-Review Execution Sequence
1. Architectural review signoff (`CONTENT_ONBOARDING_HTML_BACKEND_DESIGN_REVIEW_04`).
2. Migration script creation in `supabase/migrations/` and staging application.
3. Storage bucket creation & Edge Function deployment.
4. UI integration of operational contracts.

