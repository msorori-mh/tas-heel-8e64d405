# CONTENT-STAFF-RBAC-BASELINE-MIGRATION-RECONCILIATION-22

## Failure cause

After the `import_jobs` foundation repair applied successfully, fresh local baseline replay stopped at:

| Field | Value |
| ----- | ----- |
| SQLSTATE | `42710` |
| Error | `policy "Content staff manage grades" for table "grades" already exists` |
| First creator | `supabase/migrations/20260703121000_content_manager_rbac_policies.sql` |
| Duplicate creator | `supabase/migrations/20260703204450_5223b435-1a4d-44ab-ad03-ab3d9a8f4432.sql` |

Migration order is by filename timestamp. `20260703121000` creates the Content staff policies; `20260703204450` attempts the same `CREATE POLICY` set and aborts the chain at the first policy (`grades`).

## File inventory (pre-repair)

| Property | First (`…121000…`) | Second (`…204450…`) |
| -------- | ------------------ | ------------------- |
| Lines | 239 | 136 |
| SHA-256 | `5C8035188769A816FFDA68CBCF9345F7F8F45B5B705BD2258AE36FD3E263EEAF` | `5966098F6D18119CE454CA0849E43A36ABD7E6342E67AB48078C1EA1F510A789` |
| Introduced by | `eb0392e` — `Add content_manager RBAC for content-only admin access` (Mokhtar Alsarori) | `5fd1a9c` — `Changes` (gpt-engineer-app[bot]) |
| Commit date | 2026-07-03T09:38:35+03:00 | 2026-07-03T20:44:53Z |

## Semantic comparison matrix

All policies below use `TO authenticated`, helper `public.is_content_staff(auth.uid())` (admin OR `content_manager`), and matching `USING` / `WITH CHECK` unless noted. No moderator/user widening. Formatting-only differences in the second file.

| Table | Policy | First | Second | Identical | Wider | Narrower | Unique |
| ----- | ------ | ----- | ------ | --------- | ----- | -------- | ------ |
| grades | Content staff manage grades | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| subjects | Content staff manage subjects | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| lessons | Content staff manage lessons | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| questions | Content staff manage questions | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| curriculum_tracks | Content staff manage tracks | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| governorates | Content staff manage governorates | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| governorate_curriculum_map | Content staff manage map | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| units | Content staff manage units | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| lesson_book_contents | Content staff manage book contents | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| lesson_explanations | Content staff manage explanations | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| lesson_assessments | Content staff manage assessments | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| lesson_resources | Content staff manage resources | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| assessment_questions | Content staff manage assessment questions | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| lesson_simulations | Content staff manage simulations | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| lesson_summaries | Content staff manage summaries | CREATE FOR ALL (no prior DROP) | CREATE FOR ALL | yes | — | — | — |
| exam_templates | Authenticated can read active templates | DROP+CREATE SELECT (`is_active` OR staff) | same | yes | — | — | — |
| exam_templates | Content staff manage templates | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| exam_template_questions | Authenticated can read questions of active templates | DROP+CREATE SELECT | same | yes | — | — | — |
| exam_template_questions | Content staff manage template questions | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| import_jobs | Content staff manage import jobs | FOR ALL; WITH CHECK staff AND (admin OR `import_type <> 'config'`) | same | yes | — | — | — |
| import_errors | Content staff manage import errors | CREATE FOR ALL | CREATE FOR ALL | yes | — | — | — |
| storage.objects | Content staff manage lesson files - select/insert/update/delete | four policies, buckets `lesson-pdfs`/`lesson-videos` | same | yes | — | — | — |

### Helpers / grants / functions

| Object | First | Second | Match |
| ------ | ----- | ------ | ----- |
| `is_full_admin(uuid)` SECURITY DEFINER | yes | yes | semantic yes |
| `is_content_staff(uuid)` = admin OR content_manager | yes | yes | semantic yes |
| REVOKE ALL from PUBLIC/anon + GRANT EXECUTE to authenticated (both helpers) | yes | yes | yes |
| `admin_get_lesson_media_urls(uuid)` + grants | yes | yes | semantic yes |
| ENABLE ROW LEVEL SECURITY | none (tables already RLS-enabled) | none | — |
| GRANT ALL TO authenticated | no | no | — |
| DROP TABLE / TRUNCATE / DML | no | no | — |

Shared objects: full CONTENT-MANAGER-RBAC-01A surface.

Unique objects in second: **none** (whitespace / compact formatting only).

Conflicts: every `CREATE POLICY` in the second file after the first already created the same names. First hard failure: `Content staff manage grades`. If grades alone were fixed with a no-op skip, the remaining 24 policy creates would still fail sequentially.

## Git history

1. Human commit `eb0392e` added `20260703121000_content_manager_rbac_policies.sql` as intentional CONTENT-MANAGER-RBAC-01A (helpers + content-staff RLS + storage + media RPC). Depends on enum migration `20260703120000_content_manager_enum.sql`.
2. Later the same day, Lovable/gpt-engineer bot commit `5fd1a9c` added UUID-named `20260703204450_…sql` as a compacted re-push of the same RBAC surface (paired with a parallel enum re-add `20260703204401_…sql` that uses `ADD VALUE IF NOT EXISTS` and therefore does not abort replay).
3. Because `121000` sorts before `204450`, fresh replay always hits the human file first, then fails on the bot duplicate at the first `CREATE POLICY`.

Intended purpose of the first file: establish content-staff authorization. Intended purpose of the second file: dashboard/schema sync duplicate of the same change — not an additive security hardening.

Docs references (`docs/CURSOR-INDEPENDENT-PRE-IMPORT-REVIEW-01.md`, units/answers hardening reports) treat `"Content staff manage …"` names as already established by the RBAC series; none require the bot file as a distinct creator.

## Later references

| Category | Locations |
| -------- | --------- |
| Policy names retained | `20260731120000_exam_answers_postgrest_leak_hardening.sql` (comment: staff manage questions preserved) |
| Policy names retained | `20260731180000_restrict_units_select_to_authenticated.sql` (comment: staff manage units unchanged) |
| Role exclusion (not policy recreate) | wallet top-up migrations exclude `content_manager` from payment admin paths |
| Static tests | `tests/security/units-select-authenticated-only.static.test.mjs` asserts staff manage units preserved |
| DROP of Content staff policy names after `121000` | **none found** |

Final security shape after fresh replay remains the first file’s policies (admin OR content_manager via `is_content_staff`; import_jobs config gated to full admin). No later migration replaces those names.

## Decision

**Option A** — second file is a full semantic duplicate, contains no unique additive objects, and is not historically required as independent DDL.

### Reconciliation

| Item | Value |
| ---- | ----- |
| Canonical policy source | `20260703121000_content_manager_rbac_policies.sql` |
| Strategy | Convert second file to documentation-only no-op; preserve timestamp/filename |
| Historical migration modified | `20260703204450_5223b435-1a4d-44ab-ad03-ab3d9a8f4432.sql` only |
| Timestamp preserved | yes |
| Unique policies preserved | n/a (none existed) |
| Authorization widened | **NO** |
| `CREATE POLICY IF NOT EXISTS` used | **no** |
| QB migration modified | **no** |
| import_jobs repair retained | **yes** (`20260628190000` no-op still present) |

### Post-repair SHA

| File | SHA-256 |
| ---- | ------- |
| First (unchanged) | `5C8035188769A816FFDA68CBCF9345F7F8F45B5B705BD2258AE36FD3E263EEAF` |
| Second before | `5966098F6D18119CE454CA0849E43A36ABD7E6342E67AB48078C1EA1F510A789` |
| Second after | `855DD45CC684A8AED71369F86E6A76C2CE065913E7641E9B23408EE50C6D23AD` |

## Impact

### Fresh local reset / replay

- `121000` creates helpers, grants, Content staff policies, media RPC, and storage policies once.
- `204450` records as a no-op documentation migration.
- No duplicate policy `42710`.
- Later migrations that mention Content staff policy names by comment or leave them untouched continue to see the expected names.

### Environments that already recorded `20260703204450`

- Supabase tracks migration versions by name; already-applied versions are not re-executed.
- Changing the historical file body does not rewrite remote schema, RLS, or data.
- No database repair is part of this package.
- If a remote somehow applied only the first file and never the second, a future `migration up` would apply the new no-op safely.

### Migration ledger / QB / PR layering

- Source-only repair layered on the `import_jobs` baseline repair branch (`fix/import-jobs-baseline-replay-19` / PR #49).
- Does not merge PR #48 or #49, deploy, publish, or apply SQL.
- Executable QB migration (`*qb01*`) is not present on this branch and was not added.

## Source tests

| Item | Value |
| ---- | ----- |
| Path | `tests/migrations/content-staff-rbac-baseline-replay.test.mjs` |
| Command | `node --test tests/migrations/content-staff-rbac-baseline-replay.test.mjs` |
| Assertions | Policy create counts; second file no-op; `is_content_staff` retained; no `USING (true)` on manage policies; no moderator/user widen; no `GRANT ALL TO authenticated`; no DROP TABLE/TRUNCATE/DML; import_jobs repair retained; QB absent; timestamps preserved |
| Claim | Text-level only — does **not** claim SQL compilation |

## Security Review

| Check | Result |
| ----- | ------ |
| Files changed | late duplicate migration → no-op; new source test; this report |
| Migrations changed? | yes (body of `20260703204450` only) |
| RLS changed on already-applied DBs? | no (historical file not re-run) |
| RPCs changed on already-applied DBs? | no |
| Authentication impact | no |
| Authorization impact (fresh replay) | no widening; duplicate CREATE removed |
| Sensitive data exposure | no |
| Privilege escalation risk | no |
| Production risk | none (source-only) |
| Ready for merge | after independent review |
| Ready for deploy | no (not a deploy package) |

## Recommended next action

`CONTENT-STAFF-RBAC-RECONCILIATION-INDEPENDENT-REVIEW-23`
