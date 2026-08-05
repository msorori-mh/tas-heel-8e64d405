# CONTENT ONBOARDING HTML OPERATIONAL BACKEND CORRECTION 19 REPORT

**Repository**: msorori-mh/tas-heel-8e64d405  
**PR**: #60 (Draft)  
**Branch**: `feat/content-onboarding-html-operational-backend-17`  
**Starting HEAD**: `06dd366b9f4f89d2072de75f3e7b1b976ff1a98a`  
**SQL Migration Hash**: `4cde3e4759f0904418db6d68be7fa31c26867d47b1d5a835ecca0ba69260b619`  
**Evaluation Decision**: `PASS`

---

## Executive Summary

PR #60 operational correction addresses all 18 security and implementation findings raised in `CONTENT_ONBOARDING_HTML_OPERATIONAL_BACKEND_INDEPENDENT_REVIEW_18`.

The current implementation provides a true operational server backend for interactive HTML lesson resources without applying remote migrations or writing to production/staging databases.

---

## 1. Key Technical Corrections Implemented

### 1.1 Composite Version Pointers & Immutability (Migration 20260806120000)
- Fixed composite FKs on `lesson_resources`: `current_draft_version_id`, `approved_version_id`, `published_version_id` bound with `ON DELETE RESTRICT` to prevent illegal nullification of primary keys.
- Bound same-resource composite FK on `lesson_resource_reviews`: `(version_id, resource_id) REFERENCES lesson_resource_versions(id, resource_id) ON DELETE RESTRICT`.
- Added `immutable_at TIMESTAMPTZ` and `immutable_reason TEXT` inside `lesson_resource_versions`. Approved/published versions set `immutable_at = now()`.
- Immutability triggers on `lesson_resource_versions` and `lesson_resource_files` check `immutable_at IS NOT NULL`.

### 1.2 Formal Storage Operations State Machine
- Merged state machine states: `pending`, `uploaded`, `verified`, `promoted`, `cleanup_pending`, `cleaned`, `failed`, `compensated`.
- Applied immutable triggers on `storage_operations`: `DELETE` prohibited; identity fields (`operation_type`, `source_path`, `target_path`, `idempotency_key`, `parent_operation_id`, `retry_number`) immutable; `completed_at` timestamps recorded.

### 1.3 Audit Immutability & Per-Function Grants
- Made `lesson_resource_reviews`, `lesson_resource_events`, and `idempotency_ledger` append-only with immutability triggers rejecting `UPDATE` and `DELETE`.
- Removed wildcard `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public`. Applied explicit per-function `REVOKE` and `GRANT` by name.

### 1.4 Direct Browser Writes Closure & RLS Hardening
- Removed all `FOR ALL` policies from operational tables.
- Browser direct writes (`INSERT`, `UPDATE`, `DELETE`) are closed. All mutations are performed via `SECURITY DEFINER` RPCs.
- Student access restricted to published resources with active lesson permission via `fetch_published_lesson_resources`.

### 1.5 Server-Authoritative Feature Flags
- Introduced `content_feature_flags` table with keys: `html_content_backend`, `html_content_upload`, `html_content_publish`, `html_content_student_read` (defaults: `false`).
- All mutating RPCs assert server-side flags. Disabled flags return fail-closed error responses (e.g. `FEATURE_FLAG_DISABLED`).

### 1.6 Atomic Idempotency Claim Workflow
- Replaced check-then-insert with `claim_idempotency_slot` (`INSERT ... ON CONFLICT DO NOTHING`). Concurrency conflicts return cached payloads or in-progress statuses safely.

### 1.7 Trusted Server Scanner & Server-Only Module
- Built `src/lib/server/content-onboarding/`:
  - `package-validator-server.ts`: Ingests ZIPs, checks HTML structure/CSP, MIME, path traversal, PII leakage, and answer/explanation leakage.
  - `upload-service.ts`: Issues staging paths (`staging/{actor_id}/{batch_id}/{upload_session_id}/{filename}`).
  - `publish-service.ts`: Builds published paths (`published/{resource_code}/{version_number}/{content_sha256}`).
  - `signed-access-service.ts`: Issues short-lived signed URLs for published student views.
- Created `content_package_validations` table to store server scanner runs.

### 1.8 12 RPC Public Contracts Inventory
1. `create_content_import_batch`
2. `issue_content_upload`
3. `finalize_content_upload`
4. `validate_content_package`
5. `submit_resource_for_review`
6. `approve_resource_version`
7. `reject_resource_version`
8. `publish_resource_version`
9. `unpublish_resource_version`
10. `archive_lesson_resource`
11. `rollback_published_resource_version`
12. `fetch_published_lesson_resources`

---

## 2. Verification & Local Testing Evidence

- **Local Disposable PostgreSQL 17**: Migration and full SQL / RLS / Immutability test suite executed cleanly on local Docker PostgreSQL 17 (`test-pg17-content-onboarding-disposable`).
- **Node Test Suite**: 117 tests passing cleanly (`npm test`).
- **TypeScript & Build**: `tsc --noEmit` and `npm run build` completed with zero errors.
- **Git Diff & Status**: Working tree clean, zero remote DB / storage writes, zero remote SQL execution.

---

## 3. Decision & Recommended Next Action

**Decision**: `PASS`  
**Recommended Next Action**: `CONTENT_ONBOARDING_HTML_MIGRATION_FINAL_REVIEW_20`
