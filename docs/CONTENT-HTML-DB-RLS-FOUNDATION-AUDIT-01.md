# CONTENT HTML DB RLS FOUNDATION AUDIT 01

- **Date:** 2026-08-06
- **Repository:** `msorori-mh/tas-heel-8e64d405`
- **Branch:** `feat/content-html-db-rls-foundation-01`

---

## 1. Executive Summary

This document performs a complete baseline audit of existing database tables, RLS policies, functions, storage access, and role definitions related to lesson resources (`lesson_resources`) and media storage in the Tas-heel platform prior to introducing the Database + RLS Foundation for interactive HTML content.

---

## 2. Baseline Schema Analysis: `public.lesson_resources`

### 2.1 Existing Structure
From baseline migration `20260606004917_18901270-9c14-4c37-bea7-1b33e3e26812.sql`:
- **Table Name:** `public.lesson_resources`
- **Columns:**
  - `id` (`uuid`, PRIMARY KEY, `DEFAULT gen_random_uuid()`)
  - `lesson_id` (`uuid`, NOT NULL, `REFERENCES public.lessons(id) ON DELETE CASCADE`)
  - `resource_type` (`public.lesson_resource_type`, ENUM: `'video'`, `'mindmap'`, `'experiment'`, `'pdf'`, `'link'`)
  - `title` (`text`, NOT NULL)
  - `url` (`text`, NOT NULL)
  - `description` (`text`, NULLABLE)
  - `sort_order` (`integer`, NOT NULL, `DEFAULT 0`)
  - `created_at` (`timestamptz`, NOT NULL, `DEFAULT now()`)
- **Indexes:**
  - `idx_resources_lesson`: ON `public.lesson_resources(lesson_id, resource_type, sort_order)`

---

## 3. Historical Policies & Access Matrix

### 3.1 Historical Policies on `public.lesson_resources`
1. `Resources viewable per lesson access` (Migration: `20260606004917`)
   - **Type:** `SELECT` `TO authenticated`
   - **Condition:** `USING (public.can_access_lesson(lesson_id))`
   - **Issue:** Allows any authenticated student with lesson access to read draft, unverified, or archived resources. Must be dropped and restricted to `published` status only.

2. `Admins manage resources` (Migration: `20260606004917`, dropped in `20260703121000`)
   - **Type:** `FOR ALL` `TO authenticated`
   - **Condition:** `USING (has_role(auth.uid(), 'admin'::app_role))`

3. `Content staff manage resources` (Migration: `20260703121000`)
   - **Type:** `FOR ALL` `TO authenticated`
   - **Condition:** `USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()))`
   - **Issue:** Allows direct browser mutation (INSERT/UPDATE/DELETE) by `content_manager` or `admin`. In the new server pipeline design, all mutations MUST go through trusted server RPC / service-role handlers. Permissive client mutation policies must be removed or restricted.

### 3.2 Historical Storage Policies on `storage.objects`
- `Students can read lesson media with lesson access`
- `Admins manage lesson files - select/insert/update/delete`
- `Content staff manage lesson files - select/insert/update/delete`

---

## 4. Role Enums & Helpers Audit

### 4.1 Existing Roles
- `public.app_role`: ENUM (`'admin'`, `'content_manager'`, `'student'`)
- Role validation functions:
  - `public.has_role(_user_id uuid, _role app_role)`
  - `public.is_full_admin(_user_id uuid)`
  - `public.is_content_staff(_user_id uuid)`
- Target roles for foundation:
  - `admin`, `content_manager`, `authenticated`, `service_role`. No un-scoped custom roles (e.g. `reviewer`, `publisher`).

---

## 5. Required Modifications & Policy Sunset Plan

1. **Policies to Drop/Redefine by Exact Name:**
   - On `public.lesson_resources`:
     - `DROP POLICY IF EXISTS "Resources viewable per lesson access" ON public.lesson_resources;`
     - `DROP POLICY IF EXISTS "Content staff manage resources" ON public.lesson_resources;`
     - `DROP POLICY IF EXISTS "Admins manage resources" ON public.lesson_resources;`

2. **Additive Extensions on `public.lesson_resources`:**
   - Add `lifecycle_status` (`draft`, `in_review`, `approved`, `published`, `rejected`, `archived`).
   - Add `current_draft_version_id`, `approved_version_id`, `published_version_id`.
   - Add `lock_version`.
   - Extend `public.lesson_resource_type` ENUM to include `'html'`.

3. **New Foundation Tables:**
   - `public.lesson_resource_versions`
   - `public.lesson_resource_files`
   - `public.content_import_batches`
   - `public.lesson_resource_upload_sessions`
   - `public.content_package_validations`
   - `public.lesson_resource_reviews`
   - `public.lesson_resource_events`
   - `public.storage_operations`
   - `public.idempotency_ledger`
   - `public.content_feature_flags`

4. **Security & RLS Principles:**
   - RLS fail-closed by default across all tables.
   - `anon` role completely DENIED across all interactive resource tables.
   - Browser client direct DML (INSERT/UPDATE/DELETE) DENIED for `authenticated`, `admin`, and `content_manager`.
   - `service_role` / SECURITY DEFINER helpers handle server pipeline operations.
   - Students (`authenticated`) can SELECT `published` resources ONLY when `can_access_lesson(lesson_id)` is `true` and feature flag `html_content_student_read` is enabled.
