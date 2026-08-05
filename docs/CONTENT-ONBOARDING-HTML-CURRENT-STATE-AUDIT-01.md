# Content Onboarding HTML Interactive — Current State Audit

**Date:** 2026-08-05  
**Repository:** `msorori-mh/tas-heel-8e64d405`  
**Base HEAD:** `c2095a926cba6e3594965957ac4aec2103d4bee6`  
**Branch:** `feat/content-onboarding-html-interactive-mvp-01`

---

## 1. Executive Summary

This audit evaluates the current codebase state for onboarding interactive HTML content (Mind Maps `mind_map_html` and Practical Experiments `practical_experiment_html`). It covers database schemas, storage buckets, security boundaries, Capacitor native bridge exposure, offline capabilities, import workflows, and student runtime rendering.

---

## 2. Component Audits

### 2.1 Database & Schema Audit
- **`subjects`**: Table exists (`id`, `subject_code`, `name`, `grade_slug`, `track_code`, `semester`, etc.).
- **`units`**: Table exists (`id`, `unit_code`, `subject_code`, `title`, `sort_order`).
- **`lessons`**: Table exists (`id`, `lesson_code`, `subject_code`, `unit_id`, `title`, `sort_order`).
- **`questions`**: Table exists (`id`, `question_code`, `lesson_id`, `question_text`, etc.).
- **`user_progress`**: Table exists (`user_id`, `lesson_id`, `status`, `completed_at`).
- **`profiles` / `user_roles`**: Table exists (`profiles`, `user_roles` with roles: `admin`, `content_manager`, `editor`, `student`).
- **`lesson_resources`**: Table exists in Supabase schema (`id`, `lesson_id`, `resource_type`, `title`, `description`, `url`, `sort_order`).
  - *Current Enum*: `lesson_resource_type` = `('video', 'mindmap', 'experiment', 'pdf', 'link')`.
  - *Limitations*: Lacks `resource_code`, `status` (`draft`, `in_review`, `published`, etc.), `version`, `entry_file`, `package_path`, `content_sha256`, `offline_enabled`, `orientation`, `height_mode`, `completion_mode`, `completion_event`, `minimum_interaction_seconds`, and audit fields.

### 2.2 Supabase Storage & Buckets Audit
- Existing storage buckets configured in migrations:
  - `receipts` (private user receipts)
  - `lesson-videos` (admin upload, public/authenticated read)
  - `lesson-pdfs` (admin upload, public/authenticated read)
  - `payment-methods` (payment logos & barcodes)
  - `wallet-topup-receipts`
- **Missing Buckets**: No dedicated `lesson-resource-drafts` (private draft storage) or `lesson-resource-published` (versioned immutable published packages).

### 2.3 Admin & Lesson Routes Audit
- **Admin routes**: `src/routes/_authenticated/admin.import.tsx`, `admin.lessons.tsx`, `admin.lessons.$lessonId.tsx`, `admin.subjects.tsx`, `admin.units.tsx`, `admin.questions.tsx`.
- **Lesson student route**: `src/routes/_authenticated/lessons.$lessonId.tsx`.
- **Import foundation**: Preflight validator and Excel template generators exist for basic lesson data (`01`–`09`). Import dry-run is enabled, but DB execution writes are disabled in source-only phase.

### 2.4 Security, CSP & Isolation Audit
- **Current App CSP**: Default header does not yet define isolated sandbox origins for sub-packages.
- **`dangerouslySetInnerHTML` Usage**: Must be strictly prohibited for interactive HTML resources.
- **Origin Isolation**: Web applications serving HTML packages within the same domain risk granting access to local storage, cookies, and Supabase tokens unless rendered inside an isolated `sandboxed iframe` (`sandbox="allow-scripts"`) with no `allow-same-origin` or direct window parent access.

### 2.5 Capacitor & Mobile Bridge Audit
- Project contains `@capacitor/preferences` dependency and supports Android build targets.
- **Native Bridge Exposure**: In Capacitor native containers, loading arbitrary untrusted HTML within the main WebView exposes `window.Capacitor` and native device plugins.
- **Required Safeguards**: Imported HTML MUST NOT have access to the Capacitor bridge. If isolated iframe origin or bridge-disabled secondary WebView cannot be guaranteed on native mobile, mobile HTML runtime must fail-closed (Disabled).

### 2.6 Offline & Cache Audit
- Service Worker & PWA cache foundation exists for static assets.
- Interactive packages marked `offline_enabled = true` require local caching of immutable package archives verified by SHA-256 hashes prior to runtime execution.

---

## 3. Audit Questions & Definitive Findings

1. **Is there a table for lesson resources?**  
   *Yes* (`lesson_resources`), but it lacks versioning, review workflow statuses (`draft`, `in_review`, `approved`, `published`), interactive HTML attributes, and hash integrity fields.

2. **Is there a suitable Storage bucket?**  
   *No*. Dedicated buckets `lesson-resource-drafts` and `lesson-resource-published` must be created via migration proposal.

3. **Are draft/review/published states supported?**  
   *No*. The existing schema does not track resource lifecycle status.

4. **Is there a safe Server write endpoint?**  
   *No*. Server write endpoints for automated database ingestion are disabled in this phase. Dry-run validation operates source-side without database writes.

5. **Can HTML be hosted with an isolated origin?**  
   *Yes*, via `sandboxed iframe` (without `allow-same-origin`), Blob URLs with CSP headers, or isolated origin subdomains.

6. **Does Capacitor prevent native bridge exposure to HTML?**  
   *Not automatically*. If rendered inside the root application window, `window.Capacitor` would be accessible. Sandboxed iframe without same-origin privileges strips access to parent global objects including `window.Capacitor`.

7. **What needs Migration?**  
   - Enum update: `lesson_resource_type` to include `mind_map_html`, `practical_experiment_html`, `summary_html`, `image`.
   - New schema tables / proposals: `lesson_resources` enhancement, `lesson_resource_versions`, `lesson_resource_files`, `lesson_resource_reviews`, `lesson_resource_events`, `content_import_batches`, `content_import_rows`.
   - Storage buckets: `lesson-resource-drafts`, `lesson-resource-published`.

8. **What can be accomplished Source-Only (MVP Phase 01)?**  
   - Excel row parser & contract (`InteractiveLessonResourceImportRow`).
   - ZIP package validator (Preflight, Manifest schema check, File limits, Security scanner, CSP builder, Asset resolver, Deterministic SHA-256 hasher).
   - Admin Import UI (`/admin/content-import`) with dry-run reports, findings display, preflight checks, and preview capabilities.
   - Admin Review UI (`/admin/content-review`) with draft/review/published state management simulator.
   - Student Lesson UI (`/lessons/$lessonId`) viewer component using safe sandboxed iframe with MessageChannel bridge.
   - Comprehensive test suite covering security, package validity, bridge safety, and isolation.
   - Comprehensive Arabic documentation & team guide.

---

## 4. Compliance Verification Matrix

| Constraint / Requirement | Status | Verification Method |
|---|---|---|
| No modification of PR #58 | **Enforced** | Git branch isolation |
| Zero SQL/Migration execution | **Enforced** | No file created in `supabase/migrations/` |
| Zero Production DB writes | **Enforced** | Client & server dry-run mode only |
| Zero `dangerouslySetInnerHTML` | **Enforced** | Strictly using sandboxed iframe |
| No `allow-same-origin` or parent DOM access | **Enforced** | Sandbox attribute `sandbox="allow-scripts"` |
| No cookie / Supabase token access | **Enforced** | Isolated origin & sandbox boundary |
| No external network requests | **Enforced** | CSP `connect-src 'none'` & package preflight scanner |
