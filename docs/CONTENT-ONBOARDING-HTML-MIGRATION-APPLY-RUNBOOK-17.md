# Migration Apply Runbook: Operational HTML Content Backend (PR 17 & 19 Correction)

**Document ID**: `CONTENT-ONBOARDING-HTML-MIGRATION-APPLY-RUNBOOK-17`  
**Migration File**: `supabase/migrations/20260806120000_content_onboarding_html_operational_backend.sql`  
**SQL SHA-256 Hash**: `4cde3e4759f0904418db6d68be7fa31c26867d47b1d5a835ecca0ba69260b619`
**Repository**: `msorori-mh/tas-heel-8e64d405`
**Branch**: `feat/content-onboarding-html-operational-backend-17`

---

> [!CRITICAL]
> **STRICT REQUIREMENT BEFORE APPLYING**
> DO NOT APPLY THIS MIGRATION TO PRODUCTION OR STAGING STAGE WITHOUT EXPLICIT WRITTEN APPROVAL FROM THE REPOSITORY OWNER / ARCHITECT.
> Direct execution of migrations on remote databases during development or automated PR steps is strictly prohibited.

---

## 1. Preflight Checklist & Verification

Before attempting to apply the migration on any environment (Staging / Production):

1. **Verify Source Integrity**:
   - Ensure the SHA-256 hash of the migration file matches:
     `4cde3e4759f0904418db6d68be7fa31c26867d47b1d5a835ecca0ba69260b619`
2. **Database Backup**:
   - Create a full transactional snapshot backup of the remote PostgreSQL database.
3. **Check Existing Tables**:
   - Confirm table `public.lesson_resources` exists and contains baseline columns.
   - Confirm `public.is_content_staff(UUID)` and `public.can_access_lesson(UUID)` functions exist.

---

## 2. Migration Execution Order

Run the migration script strictly in sequence inside a single transactional block:

```bash
# Example execution via Supabase CLI (only when authorized)
supabase db push --dry-run
```

The migration performs:
1. `ALTER TYPE public.lesson_resource_type ADD VALUE IF NOT EXISTS ...`
2. `ALTER TABLE public.lesson_resources ADD COLUMN IF NOT EXISTS ...`
3. `CREATE TABLE IF NOT EXISTS public.content_feature_flags ...`
4. `CREATE TABLE IF NOT EXISTS public.lesson_resource_versions ...`
5. `CREATE TABLE IF NOT EXISTS public.lesson_resource_files ...`
6. `CREATE TABLE IF NOT EXISTS public.lesson_resource_reviews ...`
7. `CREATE TABLE IF NOT EXISTS public.lesson_resource_events ...`
8. `CREATE TABLE IF NOT EXISTS public.content_import_batches ...`
9. `CREATE TABLE IF NOT EXISTS public.content_import_rows ...`
10. `CREATE TABLE IF NOT EXISTS public.storage_operations ...`
11. `CREATE TABLE IF NOT EXISTS public.idempotency_ledger ...`
12. `CREATE TABLE IF NOT EXISTS public.content_package_validations ...`
13. Same-Resource Foreign Key Binding (`ON DELETE RESTRICT`):
    - `fk_lesson_resources_current_draft_same_resource`
    - `fk_lesson_resources_approved_same_resource`
    - `fk_lesson_resources_published_same_resource`
    - `fk_reviews_version_same_resource`
14. Storage Buckets Creation:
    - `lesson-resource-drafts` (private)
    - `lesson-resource-published` (private)
15. RLS Policies & Immutability Triggers.
16. 12 RPC Function declarations with `SECURITY DEFINER SET search_path = public, pg_temp`.
17. Revoking `PUBLIC`/`anon` access and granting explicit `authenticated` execution permissions per function by name.

---

## 3. Post-Apply Verification Checks

After applying the migration:

1. **Check Table Existence**:
   ```sql
   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'lesson_resource_%';
   ```
2. **Check Same-Resource Composite FKs**:
   ```sql
   SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'lesson_resources';
   ```
3. **Check Storage Buckets Privacy**:
   ```sql
   SELECT id, name, public FROM storage.buckets WHERE id IN ('lesson-resource-drafts', 'lesson-resource-published');
   -- Must return public = false for both buckets.
   ```
4. **Check RPC Grants**:
   ```sql
   SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'publish_resource_version';
   ```

---

## 4. Rollback & Emergency Stop Plan

If an error or regression occurs after applying:

1. **Runtime Server Feature Flag Deactivation**:
   - Immediately update `content_feature_flags` table:
     ```sql
     UPDATE public.content_feature_flags SET is_enabled = false;
     ```
2. **Database Schema Rollback**:
   - Non-destructive teardown: Composite FK constraints can be removed using canonical names (`fk_lesson_resources_current_draft_same_resource`, `fk_lesson_resources_approved_same_resource`, `fk_lesson_resources_published_same_resource`).
   - Audit tables and version history are preserved permanently and MUST NOT be dropped.
