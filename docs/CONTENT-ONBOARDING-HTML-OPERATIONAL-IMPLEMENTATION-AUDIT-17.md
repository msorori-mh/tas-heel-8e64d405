# Content Onboarding HTML Operational Implementation Audit (PR 17)

**Date**: 2026-08-06  
**Target Repository**: `msorori-mh/tas-heel-8e64d405`  
**Target Branch**: `feat/content-onboarding-html-operational-backend-17`  
**Base HEAD**: `179d4cab01d1e1ad993bac8e984e2123314e426e` (Includes PR #59: Secure Interactive HTML Lesson Resources)

---

## 1. Executive Summary

This audit assesses the current state of the database schema, role definitions, storage policies, application UI routes, and package scanners in the repository prior to implementing the additive database migration, RPC layer, storage saga, authorization enforcement, and UI integrations for operational HTML content onboarding.

---

## 2. Database Schema Audit

### 2.1 Existing `lesson_resources` Table
* **Migration Origin**: `20260606004917_18901270-9c14-4c37-bea7-1b33e3e26812.sql`
* **Current Columns**:
  - `id` (`uuid`, PRIMARY KEY, `gen_random_uuid()`)
  - `lesson_id` (`uuid`, FOREIGN KEY -> `lessons.id` ON DELETE CASCADE)
  - `resource_type` (`lesson_resource_type` enum)
  - `title` (`text`, NOT NULL)
  - `description` (`text`, NULLABLE)
  - `url` (`text`, NOT NULL)
  - `sort_order` (`integer`, NOT NULL DEFAULT 0)
  - `created_at` (`timestamptz`, NOT NULL DEFAULT `now()`)

### 2.2 Existing `lesson_resource_type` Enum
* **Values**: `'video'`, `'mindmap'`, `'experiment'`, `'pdf'`, `'link'`
* **Design Requirement**: Additive compatibility mapping:
  - `mindmap` -> `mind_map_html`
  - `experiment` -> `practical_experiment_html`
  - `link` -> `external_link`
  - New enum values to support: `'mind_map_html'`, `'practical_experiment_html'`, `'summary_html'`, `'image'`, `'external_link'`.
  - Legacy enum values (`mindmap`, `experiment`, `link`, `video`, `pdf`) are preserved for full backward compatibility.

### 2.3 Existing RLS Policies on `lesson_resources`
1. `"Resources viewable per lesson access"`:
   - `FOR SELECT TO authenticated USING (public.can_access_lesson(lesson_id))`
2. `"Content staff manage resources"` (from `20260703121000_content_manager_rbac_policies.sql`):
   - `FOR ALL TO authenticated USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()))`

### 2.4 Existing App Role & RBAC
* **`app_role` Enum Values**: `'admin'`, `'moderator'`, `'user'`, `'content_manager'`
* **Status**: `'content_manager'` ALREADY exists in `app_role` (added via `20260703120000_content_manager_enum.sql`).
* **Helper Function**: `public.is_content_staff(user_id)` returns true for `admin` and `content_manager`.

### 2.5 Audit of Related Tables
* **`lessons`**: `id`, `unit_id`, `title`, `description`, `sort_order`, `is_free_access`, `created_at`, `updated_at`.
* **`units`**: `id`, `subject_id`, `title`, `description`, `sort_order`, `created_at`.
* **`subjects`**: `id`, `grade_id`, `code`, `title`, `sort_order`, `created_at`.
* **`user_roles`**: `id`, `user_id`, `role` (`app_role`), `created_at`.
* **`profiles`**: `id`, `full_name`, `avatar_url`, `created_at`, `updated_at`.
* **`user_progress`**: `id`, `user_id`, `lesson_id`, `is_completed`, `completed_at`, `created_at`, `updated_at`.

---

## 3. Storage Buckets & Policies Audit

### 3.1 Current Storage Buckets
* Existing storage bucket definitions exist in migrations for payments/wallet receipts.
* **Missing Buckets**:
  - `lesson-resource-drafts` (Private bucket for draft staging uploads)
  - `lesson-resource-published` (Private bucket for immutable published bundles)
* Both buckets must be created as **PRIVATE** (`public = false`) with strict RLS policies restricting browser uploads and reads.

---

## 4. HTML Package Scanner Audit (PR #59 Integration)

* **Location**: `src/lib/content-import/html-package/`
* **Components**:
  - `zip-ingestion.ts`: ZIP extraction, limit checks, path traversal prevention, symlink detection.
  - `package-preflight.ts`: Combined package preflight scanner.
  - `html-security-scanner.ts`: CSP rules, disallowed scripts, dangerous attributes.
  - `manifest-validator.ts`: Manifest schema validation.
  - `html-parser.ts`: Structural parsing of HTML.
  - `css-scanner.ts` / `js-scanner.ts`: External URL & inline code scanners.
  - `capacitor-gate.ts`: Native runtime restriction (Capacitor fail-closed).
  - `content-hash.ts`: Deterministic SHA-256 payload calculation.
  - `validation-codes.ts`: Standard error codes for security violations.

---

## 5. UI Route Audit

### 5.1 Admin Content Import Route (`/admin/import` / `src/routes/_authenticated/admin.import.tsx`)
* Currently acts as a preflight dry-run simulator.
* Needs integration with backend RPCs behind `ENABLE_HTML_CONTENT_UPLOAD` feature flag.

### 5.2 Admin Content Review Route (`/admin/content-review` / `src/routes/_authenticated/admin.content-review.tsx`)
* Currently renders static/simulated queue items.
* Needs integration with `in_review` queue, approvals, rejections, publishing, and rollback RPCs behind `ENABLE_HTML_CONTENT_BACKEND` feature flag.

### 5.3 Student Lesson Route (`/lessons/$lessonId` / `src/routes/_authenticated/lessons.$lessonId.tsx`)
* Renders lesson overview and interactive resource previewers.
* Needs integration with `fetch_published_lesson_resources` behind `ENABLE_HTML_CONTENT_STUDENT_READ` feature flag.

---

## 6. Target Additive Migration Architecture

The new migration (`20260806120000_content_onboarding_html_operational_backend.sql`) will:
1. Preserve the existing `lesson_resources` table without dropping or destructive alterations.
2. Add necessary columns to `lesson_resources` (`status`, `resource_code`, `subject_id`, `current_draft_version_id`, `approved_version_id`, `published_version_id`, `lock_version`, `created_by`, `updated_at`).
3. Add enum values to `lesson_resource_type` (`mind_map_html`, `practical_experiment_html`, `summary_html`, `image`, `external_link`).
4. Create 8 new tables:
   - `lesson_resource_versions`
   - `lesson_resource_files`
   - `lesson_resource_reviews`
   - `lesson_resource_events`
   - `content_import_batches`
   - `content_import_rows`
   - `storage_operations`
   - `idempotency_ledger`
5. Apply 4 canonical composite foreign keys for Same-Resource Version Integrity.
6. Create 11 RPCs with SECURITY DEFINER and `SET search_path = public, pg_temp`.
7. Configure Private Storage buckets `lesson-resource-drafts` and `lesson-resource-published` with fail-closed RLS policies.
