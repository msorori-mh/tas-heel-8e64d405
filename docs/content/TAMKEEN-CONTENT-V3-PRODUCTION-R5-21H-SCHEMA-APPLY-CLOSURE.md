# TAMKEEN — CONTENT V3 PRODUCTION SCHEMA APPLY (R5 → 21H) — CLOSURE

- SOURCE_SHA: `3659efec04f05c933edff6ecaf1d5eb760a5c70a`
- Scope authorized: schema apply only (R5 then 21H). No Iron lesson import, no curriculum/content writes, no READY publishing, no SQL edits.
- Result: **HOLD_PRODUCTION_PREFLIGHT** — apply gate not opened. Zero production writes performed.

## 1. Source freeze

Byte-level SHA256 verification (PASS, both match the authorized values):

| File | SHA256 | Match |
|---|---|---|
| `supabase/migrations-pending/20260819130000_content_v3_legacy_20c_reconciliation_r5.sql` | `4d7b1dc3ffd5154cecb3a49ade260b62534893d83876c582f988ab28b1b95cf3` | YES |
| `supabase/migrations-pending/20260818210000_content_v3_21h_hardened_preflight.sql` | `3d8cdd27a24ea9f0e998ba14e26adcb87dd0ff6b62fcc3fbd9b790114dd631e3` | YES |

- PostgreSQL: **17.6** (`server_version_num=170006`), database `postgres`. PASS.
- Operator roles actually available in this environment:
  - `sandbox_exec` (psql): non-superuser, **cannot read `supabase_migrations`**, **cannot execute database functions**.
  - `supabase_read_only_user` (read tool): can read `supabase_migrations`, **cannot execute `can_access_lesson`** (`42501 permission denied for function can_access_lesson`).
- No role available to this operator satisfies the mandatory step‑1 requirement: *owner role able to read `schema_migrations` **and** execute `can_access_lesson`*.
- Backup/PITR recency: **NOT VERIFIABLE** from this operator surface (managed backend; no backup/PITR introspection exposed).
- Advisory lock for the apply operation: not taken — apply was never entered.

## 2. Read-only baseline (executed, `BEGIN; SET TRANSACTION READ ONLY; … ROLLBACK;`)

`scripts/content-v3/production-preflight-readonly.sql` output:

- Object presence: `lessons` = present, `lesson_capability_lifecycle` = present, `lesson_capability_transition(...)` = present, `touch_lesson_capability_lifecycle()` = present; `question_option_rationales`, `official_question_answers`, `get_lesson_official_questions(uuid)`, `reveal_official_question_answer(uuid,uuid)` = **absent** (21H targets, expected pre-apply).
- `20C_STATE=PRESENT`; lifecycle known_column_count = 14 (expected max 17).
- duplicate_lifecycle_keys = 0; orphan_or_invalid_lesson_capability_rows = 0.
- `STOP_PRODUCTION_STATE_INCOMPATIBLE READY_rows_without_current_evidence = 206`.
- `20C READY_rows_without_content = 0`.
- legacy_retired_lifecycle_rows = 40 (`final_contract=EXCLUDED_RETAINED_AS_HISTORY`).
- `STOP_PRODUCTION_STATE_INCOMPATIBLE originalBookPdf_rows_still_ready = 40`.
- lifecycle_policy_count = 2; duplicate_or_overlapping relations/functions = 0.
- Script then aborted with `ERROR: permission denied for schema supabase_migrations` (privilege stop, inside the read-only transaction; rolled back).

Independent read-only cross-check (`supabase_read_only_user`):

| Metric | Value |
|---|---|
| lifecycle rows total | 104 |
| status distribution | READY = 104 (no DRAFT/REVIEW rows) |
| READY rows with `ready_snapshot` | 0 |
| READY rows with `ready_hash` but no snapshot (unprovable provenance) | 0 |
| READY snapshot/hash conflicts | 0 |
| retired-capability READY rows (`originalBookPdf`, `supportingResources`) | 40 |
| `schema_migrations` rows | 88 (latest `20260817220835`) |
| R5 in migration history | NO |
| 21H in migration history | NO |

- Visibility set/hash per role sample and `can_access_lesson` baseline: **NOT CAPTURED** — function execution is denied to every role reachable by this operator.
- Manual review allowlist: **empty** (as required); no documented row exists for allow-listing.

## 3. Stop decision

Mandatory step‑2 stop conditions triggered:

1. **Insufficient privileges** — no owner role available: `supabase_migrations` unreadable from the psql operator, and `can_access_lesson` unexecutable from every reachable role, so the required `can_access_lesson` and migration-history baselines cannot be recorded before apply.
2. **Backup/PITR freshness unverifiable** — step‑1 precondition cannot be evidenced.
3. **Unreconcilable-READY count not computable read-only** — the reconcilability test depends on `public.v3_capability_snapshot()` / `v3_capability_snapshot_is_reconcilable()`, which are created *by* R5 and do not exist in production; the required "unreconcilable = 0, allowlist empty" evidence therefore cannot be produced before apply. 64 non-retired READY rows currently carry no stored snapshot and would all be reconciled at apply time.

Per the authorized runbook the apply gate stays closed. **R5 was not applied. 21H was not applied. No migration history rows were written. No content, curriculum, or lifecycle rows were modified.**

## 4. What is needed to re-run the gate

- An owner/operator DB role (or an operator-run session) that can read `supabase_migrations.schema_migrations` and execute `public.can_access_lesson`, so the full read-only baseline including visibility/RLS sampling can be recorded.
- Written confirmation of a recent backup / PITR window immediately before apply.
- With that role, re-run `scripts/content-v3/production-preflight-readonly.sql` to completion, then apply R5 (byte-identical) in one transaction, verify the six post-apply gates, then apply 21H in an independent transaction, then run `postverify-21h.sql` and `visibility-diff-21h.sql`.

## 5. Final status block

```
FINAL_VERDICT=HOLD_PRODUCTION_PREFLIGHT
SOURCE_SHA=3659efec04f05c933edff6ecaf1d5eb760a5c70a
POSTGRES=17.6 (170006)
BACKUP_PITR=UNVERIFIABLE
R5_SHA256=4d7b1dc3ffd5154cecb3a49ade260b62534893d83876c582f988ab28b1b95cf3
R5_APPLIED=NO
R5_MIGRATION_HISTORY=ABSENT
21H_SHA256=3d8cdd27a24ea9f0e998ba14e26adcb87dd0ff6b62fcc3fbd9b790114dd631e3
21H_APPLIED=NO
21H_MIGRATION_HISTORY=ABSENT
READY_WITHOUT_EVIDENCE=206 (preflight metric) / 104 rows with NULL ready_snapshot
RETIRED_READY_ROWS=40
INVENTED_READY_BY=0
SNAPSHOT_HASH_MISMATCH=0
AUDITED_APPROVAL_MISMATCH=NOT_EVALUABLE_PRE_APPLY
VISIBILITY_GAIN=NOT_RUN
VISIBILITY_LOSS=NOT_RUN
ANSWER_LEAK=NOT_RUN
RLS=NOT_EVALUABLE (can_access_lesson execution denied)
CONTENT_WRITES=0
REPORT=docs/content/TAMKEEN-CONTENT-V3-PRODUCTION-R5-21H-SCHEMA-APPLY-CLOSURE.md
```
