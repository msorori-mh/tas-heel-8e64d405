# CONTENT HTML DB RLS FOUNDATION APPLY RUNBOOK 01

- **Date:** 2026-08-06
- **Target Migration:** `supabase/migrations/20260806050000_content_html_db_rls_foundation.sql`
- **Migration SHA256:** `E9E2333319C3C70A7FE870AC7C743AB933B606A5E6E10E0A755E0E4F6727F6C8`

---

## 1. Migration Identity & Metadata

- **Filename:** `20260806050000_content_html_db_rls_foundation.sql`
- **Scope:** Database + RLS Foundation for interactive HTML content resources
- **Type:** Additive migration source only (No `DROP TABLE`, No `CASCADE`, No broad `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public`)

---

## 2. Preflight Requirements

1. **Local Preflight Checks:**
   - Verify migration file hash:
     ```bash
     node -e "const crypto=require('crypto'); const fs=require('fs'); console.log(crypto.createHash('sha256').update(fs.readFileSync('supabase/migrations/20260806050000_content_html_db_rls_foundation.sql')).digest('hex').toUpperCase());"
     ```
     Expected output: `E9E2333319C3C70A7FE870AC7C743AB933B606A5E6E10E0A755E0E4F6727F6C8`

2. **Local PostgreSQL 17 Evidence:**
   - Ensure local runtime harness passes:
     ```bash
     node tests/question-bank/runtime/run-pg17-content-html-db-rls-foundation-test.mjs
     ```

3. **Remote Apply Prohibition:**
   - Do NOT execute `supabase db push` or apply this migration to remote database staging/production environment without explicit owner written approval.

---

## 3. Apply Procedure (Local / Staging Controlled Execution)

1. **Database Backup:**
   - Take snapshot/dump of database state prior to applying migration.

2. **Apply Order:**
   - Ensure all preceding migrations (`20260801120000_qb01_question_bank_schema_foundation.sql` or baseline main) have been applied.
   - Apply `20260806050000_content_html_db_rls_foundation.sql`.

3. **Stop Conditions:**
   - Stop execution immediately if any of the following occur:
     - Migration returns any SQL error (e.g. state `42000`, `23503`, `22000`).
     - Any constraint violation on pre-existing `lesson_resources` data.
     - Any permission error on system catalog extensions.

---

## 4. Post-Apply Verification Steps

1. **Verify Table & Enum Presence:**
   ```sql
   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (
     'lesson_resource_versions', 'lesson_resource_files', 'content_import_batches',
     'lesson_resource_upload_sessions', 'content_package_validations', 'lesson_resource_reviews',
     'lesson_resource_events', 'storage_operations', 'idempotency_ledger', 'content_feature_flags'
   );
   ```

2. **Verify Feature Flags Setup:**
   ```sql
   SELECT flag_key, is_enabled FROM public.content_feature_flags;
   ```
   All HTML feature flags must report `is_enabled = false`.

3. **Verify Deleted Policies:**
   ```sql
   SELECT policyname FROM pg_policies WHERE tablename = 'lesson_resources' AND policyname IN (
     'Resources viewable per lesson access', 'Content staff manage resources', 'Admins manage resources'
   );
   ```
   Must return 0 rows.

---

## 5. Non-Destructive Rollback & Compensation Plan

In the event of a required rollback:
- Do NOT issue `DROP TABLE lesson_resources`.
- Restore pre-apply backup snapshot.
- Or disable student access by setting feature flags:
  ```sql
  UPDATE public.content_feature_flags SET is_enabled = false WHERE flag_key LIKE 'html_content%';
  ```
