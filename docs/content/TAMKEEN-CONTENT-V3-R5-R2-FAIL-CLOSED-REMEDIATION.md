# TAMKEEN_CONTENT_V3_R5_R2_FAIL_CLOSED_REMEDIATION

Source-only remediation of the R5 legacy 20C reconciliation candidate.
No production write, no migration applied, migration 21H untouched.

BASE_SHA: c64a7389bf185aa5cba1656cb70411a790bd1cb5

## 1. AUDITED_APPROVAL is exact

`public.v3_capability_audited_approval(lesson_id, capability)` accepts an audit
row **only** when all of the following hold literally:

- `action = 'lesson_capability_lifecycle_transition'`
- `target_id = lesson_id`
- `metadata->>'capability' = capability`
- `metadata->>'from_status' = 'REVIEW'`
- `metadata->>'to_status' = 'READY'`
- `actor_id IS NOT NULL`

Deterministic pick: `ORDER BY created_at DESC, id DESC LIMIT 1`.
A `DRAFT -> READY` transition never grants approval (rehearsed, see §7).

## 2. ready_at provenance

| Case | ready_by | ready_at |
| --- | --- | --- |
| existing `ready_at` | unchanged | unchanged |
| AUDITED_APPROVAL | audit `actor_id` | audit `created_at` |
| row already had an approver (`LEGACY_20C_ROW_APPROVER`) | unchanged | observed baseline time |
| `LEGACY_20C_VISIBLE_BASELINE` | stays `NULL` | observed baseline time |

`LEGACY_20C_VISIBLE_BASELINE` claims a measured visible baseline and nothing
else. A `NOT VALID`-then-`VALIDATE`d CHECK constraint
(`..._legacy_baseline_no_approver_chk`) makes an approver on such a row
impossible at the schema level, so no human approval can ever be implied.

## 3. Published revision snapshot

`checkUnderstanding` now uses an INNER JOIN:

```sql
JOIN public.question_revisions rev
  ON rev.id = q.current_published_revision_id
 AND rev.question_id = q.id
WHERE rev.id IS NOT NULL AND rev.status = 'PUBLISHED'
```

A question without a valid current published revision is structurally excluded,
so `revisionId = null` cannot be produced. A pre-UPDATE precondition raises
`R5_PUBLISHED_REVISION_NULL` if it ever were, and postverify re-checks the
stored snapshots.

## 4. Retired capabilities

`public.v3_retired_capabilities()` returns
`['originalBookPdf','supportingResources']`, kept in sync with
`V3_RETIRED_CAPABILITIES` in `src/lib/lessons/capability-mapping.ts` (asserted by
test). For every retired row: demoted out of `READY`, row and snapshot retained,
`retirement_origin = 'LEGACY_20C'`, linked content untouched. A CHECK constraint
forbids a retired capability from becoming `READY` again. 21H then sets
`applicability = 'NA'` on the same rows.

## 5. Empty snapshot fail-closed

All preconditions run in a single DO block **before the first UPDATE**:

1. `R5_EMPTY_READY_SNAPSHOT` — any non-retired `READY` row whose snapshot is
   NULL or has an empty payload aborts the transaction.
2. `R5_PUBLISHED_REVISION_NULL` — any snapshot entry without a published
   revision aborts the transaction.

The only escape is an explicit operator allow-list of reviewed lifecycle ids:
`SET tamkeen.r5_manual_review_allowlist = '<uuid>,<uuid>'`. Unset (default) means
any unreconcilable row is a hard stop. No `ready_hash` is ever created without
content. Everything is one transaction, so any failure rolls back completely
(rehearsed: the aborted run leaves no schema change).

## 6. Canonical JSON naming

`_v3_jcs` is dropped and replaced by `public._v3_canonical_json_v1`, documented
as **project-defined deterministic canonical JSON, NOT RFC 8785 / JCS** (number
serialization follows PostgreSQL `jsonb` text output). Guarantees: recursive key
sort under `COLLATE "C"`, explicit array ordering `WITH ORDINALITY`, UTF-8
hashing (`sha256(convert_to(..., 'UTF8'))`), deterministic null handling.

## 7. Reproducible PostgreSQL 17 evidence

`scripts/content-v3/pg17/rehearse-r5.sh` — executable, committed, throwaway
local cluster (PostgreSQL 17.9), never touches production:

fixture (measured production counts + negative rows)
→ **R5 without allow-list (must abort)**
→ R5 with reviewed allow-list
→ READ-ONLY production preflight
→ unchanged 21H
→ postverify
→ visibility diff + assertions

Negative scenarios exercised by the fixture:

- `DRAFT -> READY` audit does **not** grant AUDITED_APPROVAL.
- `REVIEW -> READY` audit does, and the newest matching row wins over an older one.
- a row with `ready_at IS NULL` takes the audit `created_at`.
- a question with no published revision, and one with a `DRAFT` revision, never
  enter the snapshot.
- `supportingResources` in `READY` is retired.
- an unreconcilable `READY` row aborts the migration; only after explicit
  allow-listing is it demoted to `REVIEW` / `NEEDS_MANUAL_REVIEW`.

Measured rehearsal output:

```
17.9
FIXTURE_READY_ROWS=106
EMPTY_SNAPSHOT_FAIL_CLOSED=PASS
READY_ROWS_WITHOUT_VALID_EVIDENCE=0
RETIRED_READY_ROWS=0
RETIRED_ROWS_RETAINED=41 (deleted=0)
LIFECYCLE_ROWS_TOTAL=106
READY_BY_PRESENT=3 INVENTED_READY_BY=0
AUDIT_REVIEW_TO_READY_ONLY ready_at=2026-07-01 10:00:00+00
DRAFT_TO_READY_REJECTED=1
MANUAL_REVIEW_ROWS=1 (fixture-only, production=0)
UNEXPECTED_VISIBILITY_GAIN=0 UNEXPECTED_VISIBILITY_LOSS=0
ANSWER_LEAK=0
PUBLISHED_REVISION_NULL=0
EMPTY_READY_SNAPSHOT=0
HASH_NONDETERMINISM=0
RLS=PASS
PG17_REHEARSAL=PASS
```

## 8. Preserved constraints

No lifecycle row deleted; no fabricated `ready_by`; identity_status stays
UNRESOLVED; FULLY_READY=false; production_apply=false; preflight/postverify run
`SET TRANSACTION READ ONLY`; 21H bytes unchanged; zero production writes.

## Verdict

```
FINAL_VERDICT=PASS_R5_R2_SOURCE_READY_FOR_INDEPENDENT_REVIEW
BASE_SHA=c64a7389bf185aa5cba1656cb70411a790bd1cb5
R5_R2_SHA=<assigned by the reviewing commit>
AUDIT_REVIEW_TO_READY_ONLY=ENFORCED
READY_AT_FROM_AUDIT=ENFORCED
PUBLISHED_REVISION_NULL=0
RETIRED_CAPABILITIES_HANDLED=originalBookPdf,supportingResources
EMPTY_SNAPSHOT_FAIL_CLOSED=ENFORCED (rehearsed rollback)
INVENTED_READY_BY=0
MIGRATION_21H_SHA256=3d8cdd27a24ea9f0e998ba14e26adcb87dd0ff6b62fcc3fbd9b790114dd631e3
MIGRATION_21H_CHANGED=NO
PG17_FIXTURE=EXECUTABLE (scripts/content-v3/pg17/rehearse-r5.sh, PostgreSQL 17.9)
VISIBILITY_GAIN=0
VISIBILITY_LOSS=0 (excluding the fixture-only unreconcilable row)
ANSWER_LEAK=0
TESTS=R5 contract 15/15, regression 209/209, question-bank golden vectors 12/12, PG17 rehearsal PASS
TYPECHECK=PASS
BUILD=PASS
PRODUCTION_WRITES=0
REPORT=docs/content/TAMKEEN-CONTENT-V3-R5-R2-FAIL-CLOSED-REMEDIATION.md
```

Known environment-only failures, unrelated to this change and pre-existing on
BASE_SHA: PowerShell-based PG17 guard tests (no `pwsh` in this environment),
baseline-replay tests that read `supabase/migrations/` (applied-migration
directory absent in this worktree), and `.mjs` node:test files when run through
`vitest` instead of `node --test`.

Branch/commit handling is performed by the platform; this worktree applies no
migration and performs no push.
