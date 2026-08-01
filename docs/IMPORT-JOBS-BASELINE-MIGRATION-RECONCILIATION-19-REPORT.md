# IMPORT-JOBS-BASELINE-MIGRATION-RECONCILIATION-19

## Failure cause

Fresh local baseline replay failed before the question-bank migration with:

| Field | Value |
| ----- | ----- |
| SQLSTATE | `42P07` |
| Error | `relation "import_jobs" already exists` |
| First creator | `supabase/migrations/20260628171431_298a038b-a740-482a-9530-10cb6cb377e0.sql` |
| Duplicate creator | `supabase/migrations/20260628190000_import_jobs_foundation.sql` |
| Later QB migration (not in `supabase/migrations` on this base; draft only) | `docs/migration-drafts/QUESTION-BANK-SCHEMA-FOUNDATION-01.NOT_APPLIED.sql` — path `20260801120000_qb01_…` not present on `origin/main` @ `5b67114` |

Migration order is by filename timestamp. `20260628171431` creates `public.import_jobs`, then `20260628190000` attempts the same `CREATE TABLE` and aborts the chain.

## File inventory (pre-repair)

| Property | First (`…171431…`) | Second (`…190000…`) |
| -------- | ------------------ | ------------------- |
| Lines | 104 | 137 |
| SHA-256 | `3A529D4CA0D765C390BF64C0B63B25AF2F67F4D9CF24A9A1739E15FF70A7DD0D` | `883908F2DD2E2EAA7D65F803F7C858733BFF838518A643376AFA153D2F1A7E45` |
| Introduced by | `f0d60cf` — `Changes` (gpt-engineer-app[bot]) | `43a154b` / `a5dc5a5` — `feat(import): add import jobs foundation tables (#11)` |
| Commit date | 2026-06-28 17:14:32 +0000 | 2026-06-28 20:02:06 +0300 (merge) / 19:40:01 +0300 (branch) |

## Object comparison

| Object | First | Second | Match | Additive in second | Conflict |
| ------ | ----- | ------ | ----- | ------------------ | -------- |
| `CREATE TABLE public.import_jobs` | yes | yes | semantic yes | no | yes (duplicate CREATE) |
| Columns (23) | yes | yes | yes | no | no |
| CHECK constraints (11 named) | yes | yes | yes | no | no |
| PK / FK `created_by → auth.users` | yes | yes | yes | no | no |
| Indexes (4) | yes | yes | yes | no | no |
| Trigger `trg_import_jobs_updated_at` | yes | yes | yes | no | no |
| Grants authenticated / service_role | yes | yes | yes | no | no |
| RLS enable | yes | yes | yes | no | no |
| Policy `Admins manage import jobs` | yes | yes | yes | no | no |
| Comments on table/columns | yes | yes | yes (text) | formatting only | no |
| `CREATE TABLE public.import_errors` | yes | yes | semantic yes | no | yes (duplicate CREATE) |
| `import_errors` indexes/RLS/policy/grants | yes | yes | yes | no | no |
| Extra descriptive header comments | minimal | section banners + lifecycle note | n/a | comments only | no |
| Functions (new) | none | none | — | no | no |
| DML | none | none | — | no | no |

Shared objects: full foundation surface for `import_jobs` + `import_errors`.

Unique objects in first: none structurally (compact formatting only).

Unique objects in second: none structurally (whitespace / section comments only).

Conflicts: second `CREATE TABLE` for both tables after first already created them.

## Git history

1. Branch commit `a5dc5a5` added `20260628190000_import_jobs_foundation.sql` as the intentional IMPORT-JOBS-FOUNDATION-01 source.
2. Merge `43a154b` landed that file on the mainline as `#11` in the commit subject.
3. Shortly after (UTC), Lovable/gpt-engineer bot commit `f0d60cf` added the UUID-named migration `20260628171431_…sql` plus generated `src/integrations/supabase/types.ts` rows — almost certainly a dashboard/schema sync of the same foundation.
4. Because `171431` sorts before `190000`, fresh replay always hits the Lovable file first, then fails on the PR file.

Evidence of intended purpose of the second file: create the foundation once (PR #11). It was not authored as an additive follow-up; it is a parallel full foundation definition that collided with the bot-synced copy.

## Later references

| Category | Locations |
| -------- | --------- |
| CREATE TABLE | only the two foundation migrations (pre-repair) |
| ALTER TABLE | none on `import_jobs` columns |
| Policy replace | `20260703121000_content_manager_rbac_policies.sql`, `20260703204450_…sql` — drop `Admins manage import jobs` / recreate content-staff policies |
| FK | `import_errors.job_id → import_jobs(id)` in foundation |
| TypeScript types | `src/integrations/supabase/types.ts` |
| Import UI / functions | `src/lib/import/*`, `src/components/admin/ImportJobsHistory.tsx` |
| Docs | `docs/QUESTION-BANK-CURRENT-ARCHITECTURE-AUDIT-01.md` (mention only) |
| Tests (pre-package) | none migration-specific |

Expected final table shape remains the foundation columns/constraints plus later policy renames to content-staff management. No later migration adds columns.

## Decision

**Option A** — second file is a full semantic duplicate, not historically required as independent DDL, and contains no unique additive objects.

### Reconciliation

| Item | Value |
| ---- | ----- |
| Canonical creator | `20260628171431_298a038b-a740-482a-9530-10cb6cb377e0.sql` |
| Strategy | Convert second file to documentation-only no-op; preserve timestamp/filename |
| Historical migration modified | `20260628190000_import_jobs_foundation.sql` only |
| Timestamp preserved | yes |
| Unique additions preserved | n/a (none existed) |
| `CREATE TABLE IF NOT EXISTS` used | **no** |
| QB migration modified | **no** |

### Post-repair SHA

| File | SHA-256 |
| ---- | ------- |
| First (unchanged) | `3A529D4CA0D765C390BF64C0B63B25AF2F67F4D9CF24A9A1739E15FF70A7DD0D` |
| Second before | `883908F2DD2E2EAA7D65F803F7C858733BFF838518A643376AFA153D2F1A7E45` |
| Second after | `8F6CF1E6FE0BF930301337F1C4E6E1CA047474A0AF895CEFB7759A7A743C97DB` |

## Impact

### Fresh local reset / replay

- `171431` creates `import_jobs` / `import_errors`.
- `190000` records as a no-op documentation migration.
- Chain can proceed to later migrations including QB-01.

### Environments that already recorded `20260628190000`

- Supabase tracks migration versions by name; already-applied versions are not re-executed.
- Changing file body does not rewrite remote schema or data.
- If a remote ledger already has both versions applied somehow, this source change does not drop or alter live tables.
- If a remote only applied the Lovable UUID migration and never successfully applied `190000`, a future `migration up` would apply the new no-op safely.

### Migration ledger / PR #48

- Source-only repair package; independent Draft PR on `fix/import-jobs-baseline-replay-19`.
- Does not merge, deploy, or apply SQL.
- Follow-up independent review package: `IMPORT-JOBS-BASELINE-RECONCILIATION-INDEPENDENT-REVIEW-20`.

## Risks

| Risk | Level | Notes |
| ---- | ----- | ----- |
| Semantic drift between the two original files | low | Object-by-object compare showed formatting-only differences |
| Remote ledger unknown | low–medium | Not required to unblock fresh replay; optional readonly preflight later |
| Editing historical migration body | accepted | Explicit repair comment + SHA audit trail; version name retained |
| Hiding structural conflict via `IF NOT EXISTS` | avoided | Not used |

## Tests

```text
node --test tests/migrations/import-jobs-baseline-replay.test.mjs
```

Assertions (text-level only; does **not** prove SQL compilation):

1. Single `CREATE TABLE public.import_jobs`
2. Single `CREATE TABLE public.import_errors`
3. Required columns / constraints / indexes / RLS / policy remain in first file
4. Second file has no CREATE/DROP/TRUNCATE/DML
5. No DROP/TRUNCATE of `import_jobs` anywhere
6. Both timestamps/filenames preserved
7. QB migration not created/rewritten by this package (`20260801120000_qb01_…` absent on base; `git diff --exit-code origin/main --` that path = clean)
8. No `CREATE TABLE IF NOT EXISTS public.import_jobs`

Note: on base `5b67114`, the question-bank schema foundation exists only as a **not-applied draft** under `docs/migration-drafts/`. Fresh-replay failure is still caused solely by the duplicate `import_jobs` CREATE pair above.

## Authorization bounds (observed)

| Action | Done? |
| ------ | ----- |
| Historical migration audit | yes |
| Source reconciliation of duplicate CREATE | yes |
| Documentation report | yes |
| Offline source tests | yes |
| Draft PR | yes (package step J) |
| Modify QB migration | **no** |
| Apply SQL / `db push` / `migration up` | **no** |
| Remote DB connection | **no** |
| Deploy / publish / merge | **no** |
| Force push / renumber / timestamp change | **no** |
| Data delete / backfill | **no** |
