# TAMKEEN — CONTENT V3 / R5-R3 FINAL EVIDENCE CONSISTENCY

BASE_SHA: c36e3024d79708cdb354716624abd310b48f9695
SCOPE: source-only forward fix on top of R5-R2. No production writes, no migration apply.
PRODUCTION_WRITES = 0
MIGRATION_21H_CHANGED = NO (SHA256 `3d8cdd27a24ea9f0e998ba14e26adcb87dd0ff6b62fcc3fbd9b790114dd631e3`)

## 1. Snapshot / hash atomic consistency (fail-closed)

`supabase/migrations-pending/20260819130000_content_v3_legacy_20c_reconciliation_r5.sql`
now aborts the whole transaction, before any UPDATE, when a READY row is
internally inconsistent:

| Guard | Raised error | Condition |
| --- | --- | --- |
| Hash without snapshot | `R5_READY_HASH_WITHOUT_SNAPSHOT` | `ready_hash IS NOT NULL` while `ready_snapshot IS NULL` |
| Hash conflict | `R5_READY_SNAPSHOT_HASH_MISMATCH` | stored `ready_hash <> v3_capability_snapshot_hash(ready_snapshot)` |
| Empty snapshot | `R5_EMPTY_READY_SNAPSHOT` | snapshot is not reconcilable (R5-R2, retained) |
| Post-state re-check | `R5_READY_SNAPSHOT_HASH_MISMATCH_POST` | any mismatch remaining after remediation |

Evidence selection is stored-first: the effective snapshot is
`COALESCE(l.ready_snapshot, v3_capability_snapshot(...))` and the hash is always
derived from that same value, so a stored snapshot can never be hashed from a
recomputed one.

## 2. Approval identity consistency

`evidence_origin = 'AUDITED_APPROVAL'` is now only assigned when the audit row
matches the lifecycle row exactly:

- `ready_by IS NULL OR ready_by = audit.actor_id`
- `ready_at IS NULL OR ready_at = audit.approved_at`

Any conflict falls back to `LEGACY_20C_ROW_APPROVER`, keeps the original
`ready_by` / `ready_at`, and never invents an approver. `ready_by` is only
filled from the audit row when the row is audited.

## 3. Audit target scope

`public.v3_capability_audited_approval()` now filters
`a.target_type = 'lesson_capability'` (the real production contract) in addition
to the action and REVIEW→READY transition check, so unrelated audit rows can no
longer promote a capability.

## 4. Executable negative tests (PG17)

`scripts/content-v3/pg17/` — `fixture-legacy-20c.sql`, `rehearse-r5.sh`,
`assert-r5.sql`:

| Scenario | Result |
| --- | --- |
| Empty READY snapshot | `EMPTY_SNAPSHOT_FAIL_CLOSED=PASS` (rollback) |
| Hash present, snapshot missing | `MISSING_SNAPSHOT_WITH_EXISTING_HASH_FAIL_CLOSED=PASS` (rollback) |
| Snapshot / hash mismatch | `SNAPSHOT_HASH_MISMATCH_FAIL_CLOSED=PASS` (rollback) |
| Audited approver conflict | `ROW_APPROVER_CONFLICT_PRESERVED=1`, `AUDITED_APPROVAL_ACTOR_MISMATCH=0` |
| Wrong `target_type` audit row | `AUDIT_TARGET_TYPE_ENFORCED=YES` |
| DRAFT→READY promotion | `DRAFT_TO_READY_REJECTED=1` |
| Stored snapshot provenance | `STORED_SNAPSHOT_HASHED_FROM_STORED=1` |

Full rehearsal (fixture → R5 → 21H → postverify → assertions): `PG17_REHEARSAL=PASS`,
`UNEXPECTED_VISIBILITY_GAIN=0`, `UNEXPECTED_VISIBILITY_LOSS=0`, `ANSWER_LEAK=0`.

## 5. Postverify (read-only) gates added

`scripts/content-v3/postverify-21h.sql` (SHA256 `f7474b78d28f1bf5de1ff57e7cd1894a19da27c885c713c6370ba267d798dfa7`)
now also fails on `MISSING_SNAPSHOT_WITH_EXISTING_HASH`,
`READY_SNAPSHOT_HASH_MISMATCH`, and `AUDITED_APPROVAL_ACTOR_MISMATCH`.

## 6. Test results

- `tests/migrations/content-v3-legacy-20c-reconciliation-r5.test.mjs`: **20/20 PASS**
  (`node --test`), including 5 new R5-R3 contract tests.
- PG17 binary rehearsal: PASS (run as non-root; `initdb` cannot run as root).
- Pre-existing red, unrelated to R5-R3 and untouched by this change:
  `tests/import/no-direct-curriculum-delete.test.ts` and
  `tests/student/lesson-journey-no-original-pdf-21b4e.test.ts`; plus the known
  runner split (node:test files fail under vitest and vitest files fail under
  `node --test`).

## 7. Files changed

- `supabase/migrations-pending/20260819130000_content_v3_legacy_20c_reconciliation_r5.sql`
  (SHA256 `4d7b1dc3ffd5154cecb3a49ade260b62534893d83876c582f988ab28b1b95cf3`)
- `scripts/content-v3/postverify-21h.sql`
- `scripts/content-v3/pg17/fixture-legacy-20c.sql`
- `scripts/content-v3/pg17/assert-r5.sql`
- `scripts/content-v3/pg17/rehearse-r5.sh`
- `tests/migrations/content-v3-legacy-20c-reconciliation-r5.test.mjs`
- `docs/content/TAMKEEN-CONTENT-V3-R5-R3-FINAL-EVIDENCE-CONSISTENCY.md`

FINAL_VERDICT = PASS_R5_R3_SOURCE_READY_FOR_INDEPENDENT_REVIEW
