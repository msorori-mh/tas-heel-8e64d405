# TAMKEEN Content V3 21H — R1 Operational Hardening

```text
BASE_SHA=8b53c8d9da8038eb3085eb547a28e476f3078b38
R1_HEAD=COMMIT_HEAD_REPORTED_IN_FINAL_VERDICT
BRANCH=codex/21h-r1-operational-hardening
QWEN_RESULT=PASS_QWEN_REVIEW_WITH_NOTES
```

No production, merge, deploy, database write, or storage write was performed.
The migration candidate was not changed.

## Qwen MEDIUM findings

### 1. M1 — Visibility diff was loss-only and presence-based

STATUS=CLOSED_STATIC_READY_TO_VERIFY

ROOT_CAUSE: The previous query derived `after_expected` as a filtered subset of
legacy presence rows, so gain branches were unreachable. It also omitted the
lesson-access and published-revision predicates used by the student RPC.

FILES_CHANGED:

- `scripts/content-v3/visibility-diff-21h.sql`
- `tests/migrations/content-v3-21h-preflight-contract.test.mjs`
- `tests/migrations/content-v3-21h-r1-hardening.test.mjs`

FIX: The diff now computes `BEFORE_VISIBLE` and
`AFTER_EXPECTED_VISIBLE` from explicit access, content, lifecycle,
applicability, and published-revision semantics. It reports `UNCHANGED`,
`EXPECTED_GAIN`, `SECURITY_FIX`, `UNEXPECTED_GAIN`, and `UNEXPECTED_LOSS`, with
independent `UNEXPECTED_GAIN_COUNT` and `UNEXPECTED_LOSS_COUNT` gates. The
operator status remains `READY_TO_VERIFY`; this code does not claim runtime
proof.

TEST: R1 semantic/static suite 21/21; combined previous static + R1 suite
26/26; visibility gain, loss, unchanged, and security-fix fixtures pass.

RESIDUAL_RISK: A PG17/production read-only operator must retain the before and
after result sets and confirm both unexpected counts are zero.

### 2. M2 — Pre-existing 20C production state was under-checked

STATUS=CLOSED_STATIC_READY_TO_VERIFY

ROOT_CAUSE: The previous preflight reported object existence and one lifecycle
row count, but did not inspect the 20C state shape, evidence, duplicates,
orphans, grants, policies, function definitions, or legacy capability rows.

FILES_CHANGED:

- `scripts/content-v3/production-preflight-readonly.sql`
- `scripts/content-v3/postverify-21h.sql`
- `tests/migrations/content-v3-21h-r1-hardening.test.mjs`

FIX: The read-only preflight now checks 20C lifecycle objects and variants,
unexpected columns/relations/functions, duplicate keys, orphan rows,
invalid lesson-capability combinations, READY evidence, legacy
`originalBookPdf` lifecycle rows, migration-history variants, actual function
signatures/definitions, policies, and grants. Any incompatible pre-existing
state raises `STOP_PRODUCTION_STATE_INCOMPATIBLE`; no repair is attempted.
Postverify mirrors the lifecycle, RLS, grant, preservation, revision-pin, and
no-auto-publish assertions.

TEST: Static contract suite confirms duplicate 20C, incompatible function,
orphan, legacy capability, and STOP-gate coverage.

RESIDUAL_RISK: The preflight has not been run against production by this
worktree; operator output is still required before any apply decision.

### 3. M3 — PG17 localhost guard used an unanchored substring

STATUS=CLOSED

ROOT_CAUSE: The previous runner accepted any connection string containing a
local-looking substring, including a remote host with `localhost` in query
text.

FILES_CHANGED:

- `scripts/content-v3/pg17-runner.ps1`
- `tests/migrations/content-v3-21h-r1-hardening.test.mjs`

FIX: The runner parses URI and keyword connection forms, validates the actual
host/hostaddr against explicit local targets (`localhost`, `127.0.0.1`, or
IPv6 loopback), rejects ambiguous/multi-host targets, and emits
`PG17_TARGET_CLASS=LOCAL_ONLY`. Failure emits
`STOP_NON_LOCAL_DATABASE_TARGET` before `psql` lookup or connection.

TEST: Localhost, 127.0.0.1, and ::1 acceptance plus remote hostname, Supabase
host, missing-host, query-text, and ambiguous-target rejection pass.

RESIDUAL_RISK: The runner still requires an operator-approved local rehearsal;
no remote target can pass the guard.

### 4. M4 — RPC gate and visibility snapshot semantics disagreed

STATUS=CLOSED_STATIC_AND_SOURCE_CONTRACT

ROOT_CAUSE: The RPC required `status='READY'`, while the application contract
and old diff treated a DRAFT/REVIEW row with a snapshot as student-visible.

FILES_CHANGED:

- `src/lib/lessons/lesson-content-contract.ts`
- `src/lib/lessons/lesson-lifecycle.test.ts`
- `tests/student/lesson-capability-lifecycle-20c.test.ts`
- `scripts/content-v3/visibility-diff-21h.sql`
- `scripts/content-v3/postverify-21h.sql`
- `tests/migrations/content-v3-21h-r1-hardening.test.mjs`

FIX: The canonical student/reveal contract is now explicit: missing lifecycle
row is grandfathered; an existing row is visible/revealable only when
`READY` and not `NA`; DRAFT and REVIEW are denied even with a snapshot;
questions use the published pinned revision; reveal additionally requires the
submitted attempt and exact revision answer. The diff models the old snapshot
exception as `after_observed_visible` so any divergence is an
`UNEXPECTED_GAIN`, while postverify checks the same predicate and revision
gate.

TEST: DRAFT, REVIEW, READY, REQUIRED, OPTIONAL, N/A, missing answer companion,
pinned revision, and unpublished revision contracts pass in the R1 suite and
the full V3 source tests.

RESIDUAL_RISK: Runtime RLS/RPC confirmation remains pending a permitted local
PG17 rehearsal or production read-only verification.

## Handoff status

```text
MIGRATION_CHANGED=NO
MIGRATION_SHA256=E451B3F571D0DA197475BF44E793BF49B45F9CC08E822AC735C9D12FC1318F40
VISIBILITY_DIFF=READY_TO_VERIFY_NOT_PROVEN
20C_PREFLIGHT=HARDENED_READ_ONLY_STOP_GATE_READY
PG17_GUARD=PASS_STATIC_AND_SUBPROCESS_GUARDS
RPC_SNAPSHOT_ALIGNMENT=ALIGNED_READY_ONLY
TESTS=26/26 R1+static; 37/37 V3 relevant; 209/209 full regression
TYPECHECK=PASS (tsc --noEmit)
BUILD=PASS (vite build)
PG17=NOT_RUN_DB_WRITE_PROHIBITED; local PostgreSQL 17 service detected, but the runner applies the migration and this mission prohibits DB writes
REPORT=docs/content/TAMKEEN-CONTENT-V3-21H-R1-OPERATIONAL-HARDENING-REPORT.md
```

The migration SHA-256 was verified from the committed Git blob. Build output
warnings were dependency bundler warnings only; the build exited successfully.
