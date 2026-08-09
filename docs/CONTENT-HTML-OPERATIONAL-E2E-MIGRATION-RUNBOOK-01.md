# HTML Content Operational E2E — Production Migration Runbook

**Work item:** `TAMKEEN_CONTENT_OPERATIONAL_E2E_FULL_CLOSURE_24`
**Repository:** `msorori-mh/tas-heel-8e64d405`  
**Branch:** `feat/content-operational-e2e-full-closure-01`  
**Base ancestor:** `87cd351b40ecf79c12d79f6378c2ae2e4076a3fc`

---

## 1. Scope

This runbook covers the production migration of the **HTML lesson resource pipeline** that was closed operationally end-to-end in the local environment:

- DB/RLS foundation for HTML resources.
- Lifecycle state machine (draft → submit → review → approve → publish → unpublish → rollback).
- Resource contract alignment (`resource_code`, `html_resource_type`, `published_version_id`).
- Resource-code boundary hardening.
- Trusted server pipeline (signed upload, stored-byte validation, storage promotion, atomic publication).
- Admin import/review wiring.
- Student enumeration, signed access, sandboxed viewer, and bridge event handling.

> **Hard prohibition:** No remote production SQL, DB writes, Storage writes, migration apply, deploy, publish, merge, or force-push are performed from this runbook. Apply commands are **document-only**.

---

## 2. Exact migrations in `main` for this path

The following migrations exist in `supabase/migrations/` at the closure base and implement the HTML content path:

| Order | Migration file | Purpose |
|-------|----------------|---------|
| 1 | `20260806050000_content_html_db_rls_foundation.sql` | HTML resource tables, RLS, feature flags, student binding helpers, storage operation skeleton. |
| 2 | `20260807050000_content_html_lifecycle_contracts.sql` | Lifecycle state machine, review/submit/approve/unpublish/rollback RPCs, audit events, CAS locks. |
| 3 | `20260808060000_content_html_resource_contract_alignment.sql` | Resource contract alignment (`resource_code`, `html_resource_type`, `published_version_id`), canonical student enumeration. |
| 4 | `20260809010000_content_html_resource_code_boundary_hardening.sql` | Resource-code boundary hardening (lowercase enforcement, duplicate prevention, canonical index). |

### Dependencies already in `main`

These earlier migrations are assumed already applied in production because they are older than the HTML path and are required by it:

- `20260703120000_content_manager_enum.sql`
- `20260703121000_content_manager_rbac_policies.sql`
- `20260705160000_free_access_student_content_gates.sql`
- `20260720120000_free_access_content_gates_security_hardening.sql`
- `20260731180000_restrict_units_select_to_authenticated.sql`

### Production migration status

| Environment | Status |
|-------------|--------|
| Local Supabase (this closure) | Applied and verified by E2E. |
| Remote Production | **PRECHECK_REQUIRED** — remote migration history was not read; do not assume these migrations are unapplied. Verify with `supabase migration list --linked` or equivalent read-only check before applying. |

---

## 3. Preflight commands (read-only / safe)

Run these against the production project **without writing anything**:

```bash
# 1. Verify target project is linked (do not run if linked to the wrong project).
supabase projects list

# 2. List migrations already applied in production.
supabase migration list --linked

# 3. Verify the four HTML migrations are present locally.
ls supabase/migrations/20260806* supabase/migrations/20260807* supabase/migrations/20260808* supabase/migrations/20260809*

# 4. Build and typecheck locally before any remote operation.
npm ci
npm test
npx tsc --noEmit
npm run build

# 5. Run the full local operational E2E to confirm the migration set still closes the path.
npm run test:html-content-e2e
npx playwright test tests/content-import/browser-html-content-e2e.spec.ts --project=chromium --workers=1
```

---

## 4. Backup / read-only verification

Before applying migrations in production:

1. **Snapshot / backup**
   - Use Supabase Dashboard or CLI to create a project snapshot / point-in-time backup.
   - Record the backup timestamp and ID.

2. **Read-only integrity checks** (run via a read-only role or SQL editor with SELECT only):

   ```sql
   -- Verify feature flags exist and are currently disabled (expected before activation).
   SELECT flag_key, is_enabled
   FROM public.content_feature_flags
   WHERE flag_key LIKE 'html_content_%';

   -- Confirm no pre-existing published HTML resources will be affected.
   SELECT COUNT(*) AS published_html_count
   FROM public.lesson_resources
   WHERE resource_type = 'html'
     AND lifecycle_status = 'published';

   -- Confirm dependency migrations are present.
   SELECT COUNT(*) AS expected_role_count
   FROM public.user_roles
   WHERE role = 'content_manager';
   ```

---

## 5. Apply command — DOCUMENT ONLY

> **Do not execute this command during the closure. It is documented for the authorised production change window only.**

If and only if preflight confirms the four migrations are **not yet applied** in production:

```bash
# Ensure you are on the exact release commit/branch.
git checkout <release-tag-or-commit>

# Link to the production project if not already linked (verify project ref first).
supabase link --project-ref <PRODUCTION_PROJECT_REF>

# Apply the pending migrations in chronological order.
supabase migration up --linked
```

After apply, re-run the read-only verification queries in section 6.

---

## 6. Post-apply verification

Run these checks after the documented apply command:

```sql
-- 1. All four migrations registered.
SELECT version
FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260806050000',
  '20260807050000',
  '20260808060000',
  '20260809010000'
);

-- 2. Feature flags exist and are still disabled (activation is a separate step).
SELECT flag_key, is_enabled
FROM public.content_feature_flags
WHERE flag_key LIKE 'html_content_%';

-- 3. HTML resource functions are present and callable by expected roles.
SELECT proname
FROM pg_proc
WHERE proname IN (
  'submit_resource_for_review',
  'approve_resource',
  'reject_resource',
  'unpublish_resource',
  'rollback_resource',
  'record_successful_resource_publication',
  'resolve_student_resource_binding',
  'list_published_html_resources_for_lesson'
);

-- 4. Indexes for resource-code boundary hardening exist.
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'lesson_resources'
  AND indexname LIKE '%resource_code%';
```

---

## 7. Feature flag activation order

The HTML content path is gated by feature flags in `public.content_feature_flags`. Enable them **after** migrations are verified and the application build is deployed:

| Order | Flag | When to enable |
|-------|------|----------------|
| 1 | `html_content_backend` | Backend/server functions deployed and RPCs verified. |
| 2 | `html_content_upload` | Admin import page deployed; signed upload wiring verified. |
| 3 | `html_content_publish` | Admin review/publish page deployed; promotion path smoke-tested. |
| 4 | `html_content_student_read` | Student lesson page deployed; signed access and viewer smoke-tested. |

Example update (document-only):

```sql
-- Enable in the above order, one at a time, with a smoke test between each.
UPDATE public.content_feature_flags
SET is_enabled = true
WHERE flag_key = 'html_content_backend';
```

---

## 8. Rollback / disable procedure

### Feature-flag disable (immediate)

If an incident occurs after activation, disable the relevant flag first:

```sql
-- Disable all HTML content feature flags immediately.
UPDATE public.content_feature_flags
SET is_enabled = false
WHERE flag_key LIKE 'html_content_%';
```

This prevents:
- new HTML imports (`html_content_upload`),
- new HTML publications (`html_content_publish`),
- student enumeration of HTML resources (`html_content_student_read`),
- backend HTML RPC exposure (`html_content_backend`).

### Migration rollback

There is **no automatic down-migration** for the four SQL files. If a data rollback is required after migration apply:

1. Restore from the pre-apply backup/snapshot (preferred).
2. If backup restore is not viable, prepare a manual reversal script that:
   - Drops the HTML-specific indexes/constraints added by `20260809010000_content_html_resource_code_boundary_hardening.sql`.
   - Reverts the column additions from `20260808060000_content_html_resource_contract_alignment.sql` after confirming no published HTML resources exist.
   - This must be reviewed and tested in a local clone before any production execution.

---

## 9. Operational E2E evidence

The following tests passed locally against the migration set and must continue to pass before any production apply:

| Suite | Command | Result |
|-------|---------|--------|
| Unit / contract tests | `npm test` | 172 passed |
| HTML backend operational E2E | `npm run test:html-content-e2e` | 11 passed |
| Browser operational E2E | `npx playwright test tests/content-import/browser-html-content-e2e.spec.ts --project=chromium --workers=1` | 3 passed |
| Type check | `npx tsc --noEmit` | clean |
| Build | `npm run build` | clean |

---

## 10. Sign-off checklist

- [ ] Production migration status verified with read-only `supabase migration list --linked`.
- [ ] The four HTML migrations confirmed present in the release commit.
- [ ] Backup/snapshot created and ID recorded.
- [ ] Preflight commands executed successfully.
- [ ] Apply command executed by authorised operator in the production change window.
- [ ] Post-apply verification queries return expected results.
- [ ] Feature flags enabled in documented order with smoke tests.
- [ ] Rollback plan understood and snapshot retention confirmed.

---

**Decision status:** `PRODUCTION_MIGRATION_APPROVAL_REQUIRED`  
**Remote production writes performed in this closure:** `NONE`  
**Production migration applied in this closure:** `NO`
