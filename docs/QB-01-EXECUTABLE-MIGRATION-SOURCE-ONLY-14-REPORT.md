# QB-01-EXECUTABLE-MIGRATION-SOURCE-ONLY-14 — Report

## Identity

| Field | Value |
|---|---|
| Repository | `msorori-mh/tas-heel-8e64d405` |
| Branch | `feat/qb-01-executable-migration-source-only-14` |
| Base HEAD | `5b67114694ba86057a2325569df417abff5c2cb4` |
| Package | QB-01-EXECUTABLE-MIGRATION-SOURCE-ONLY-14 |

## Migration source

| Field | Value |
|---|---|
| Filename | `supabase/migrations/20260801120000_qb01_question_bank_schema_foundation.sql` |
| Previous SHA-256 (package 14) | `2484ea223a2dabde973f4c4e611ea6a12adc68be86992bb23625c203bafc3062` |
| SHA-256 (HOLD-15 closure / package 16) | `889801185955de851abc5df300ac69c5cc23c99ca92f90d018503781a0759008` |
| SHA-256 (PUBLISH-EXECUTOR-39 / superseded) | `37fba8bf37c80a461409dfcff15aace06814b344e9b13ee4ed766c171a513496` |
| SHA-256 (PUBLISH-INVARIANTS-39B) | `c1c26af41f6f4485a1f7dc05c1dc06e14372ef8ac550f8fad365d278a7f8cff3` |
| Under `supabase/migrations` | YES |
| Applied by this package | **NO** (local disposable Docker compilation only) |
| Remote SQL / remote DB writes | **ZERO** |

Header:

```text
-- QB-01 QUESTION BANK SCHEMA FOUNDATION
-- SOURCE CREATED AND REVIEWED LOCALLY
-- NOT APPLIED TO ANY DATABASE BY THIS PACKAGE
-- DEFAULT RUNTIME MODE REMAINS LEGACY
```

## Schema objects created

### Tables
- `question_bank_runtime_config` (seeded `id=1`, `attempt_pin_mode='LEGACY'`)
- `question_bank_capability_grants`
- `question_bank_rpc_idempotency`
- `question_revisions`
- `question_options`
- `question_accepted_answers`
- `question_solutions`
- `question_solution_steps`
- `question_media`
- `question_targets`
- `exam_session_questions`
- `practice_attempts`
- `practice_attempt_questions`
- `practice_attempt_responses`
- `question_response_reviews`

### Altered tables
- `questions`: `created_by`, `archived_at`, `archived_by`, `current_published_revision_id` (+ composite FK)
- `exam_sessions`: `attempt_pin_mode` DEFAULT `LEGACY`, `grading_status` DEFAULT `IN_PROGRESS`
- `exam_session_answers`: revision-pin / grading / score columns + score/shape CHECKs

### Views
- `v_question_responses_unified` (read-only analytics UNION; `security_invoker`)

### Functions / RPCs
- Triggers: `qb_enforce_published_pointer_on_questions`, `qb_enforce_published_revision_status`
- Helpers: `qb_has_capability`, `can_edit_question_bank`, `can_review_question_content`, `can_publish_question_revision`, `can_grade_manual_response`, `can_read_hidden_solutions`
- RPCs: `publish_question_revision`, `retarget_question`, `grant_question_bank_capability`, `revoke_question_bank_capability`, `set_question_bank_attempt_pin_mode`
- Fail-closed stubs: `create_exam_session_with_snapshot`, `create_practice_attempt_with_snapshot`, `qb_sync_question_legacy`

### Triggers
- `trg_qb_enforce_published_pointer`
- `trg_qb_enforce_published_revision_status`

### Policies
RLS enabled on all new tables; staff/capability-scoped policies; student-safe session snapshot SELECT; no open SELECT on `is_correct` / solutions / accepted answers.

### Grants
- `REVOKE ALL … FROM PUBLIC` on SECURITY DEFINER functions and sensitive tables
- Selective `GRANT EXECUTE` / `GRANT SELECT` to `authenticated`
- Snapshot create stubs **not** granted to authenticated (service_role / definer path only)
- `questions` column grants re-asserted (keep `correct_index` / `explanation` revoked)

### Indexes (selected)
- Active capability grant partial unique
- One PUBLISHED revision per question
- Target dedupe + one primary
- Exam/practice snapshot order uniqueness

## Frozen decisions represented

| Decision | Representation |
|---|---|
| Logical/revision identity | `questions` hub + `question_revisions` |
| Published pointer | Composite FK DEFERRABLE + publish RPC + defensive triggers |
| Revision-scoped children | options / accepted_answers / solutions / steps / media |
| Response model | Hybrid exam extensions + practice tables + unified view |
| Attempt snapshots | `exam_session_questions` / `practice_attempt_questions` |
| Cutover config | Singleton runtime config DEFAULT LEGACY |
| Capabilities | Grants table + 5 helpers + admin grant/revoke |
| Manual grading | `question_response_reviews` dual FK XOR |
| Accepted answers | EXACT / TRIM / TRIM_COLLAPSE only |
| Media | Metadata table only — **no bucket** |
| Targets | Logical `question_id` + `retarget_question` |
| Legacy 0-based cache | Documented; `qb_sync_question_legacy` stub |

## Hash harness

| Item | Path / value |
|---|---|
| Builder | `scripts/question-bank/canonical-payload-v1.mjs` |
| Verifier | `scripts/question-bank/verify-question-bank-hash-vectors.mjs` |
| Generator | `scripts/question-bank/generate-golden-vectors.mjs` |
| Fixture | `tests/fixtures/question-bank/canonical-payload-v1.json` |
| JCS | `canonicalize@3.0.0` (RFC 8785) |
| Digests locked | YES (12 vectors) |
| npm script | `test:question-bank-hash` |
| Test result | **PASS** |

## Source tests

| Item | Value |
|---|---|
| File | `tests/question-bank/qb01-migration-source.test.ts` |
| npm script | `test:question-bank-source` |
| Assertions | package-14 + HOLD-15 + 39B (no caller introspection, fingerprint idempotency, payload/child/snapshot immutability) |
| Result | **27/27 PASS** (source); runtime 39B suite **22/22 PASS** ×2 fresh compiles |

## Independent Review 15 HOLD Closure

Closes `HOLD_QB_01_MIGRATION_SOURCE_INDEPENDENT_REVIEW_15`.

### Prior bypass (root cause)

1. **Direct revision status update** — `GRANT UPDATE` + RLS `FOR ALL` allowed client roles to flip `status` to `PUBLISHED`/`SUPERSEDED`.
2. **Direct published pointer update** — clients could `UPDATE questions.current_published_revision_id` when table privileges permitted.
3. **Client-settable GUC** — triggers trusted a custom session setting via `current_setting` / `set_config`, which any session can set. Transaction-local ≠ SECURITY DEFINER-only.

### Corrections

| Area | Fix |
|---|---|
| Client-settable GUC | Removed entirely (no custom publish session setting remains in migration) |
| Lifecycle enforcement | Trigger validates legal transitions + PUBLISHED/SUPERSEDED metadata; **no caller introspection** |
| Pointer enforcement | Trigger validates same-question + `PUBLISHED` shape; client `UPDATE` of pointer column revoked |
| Column privileges | `REVOKE UPDATE(status, published_*, superseded_at, payload_hash*)` from authenticated/anon/service_role; pointer column revoked likewise |
| RLS policies | INSERT `DRAFT` only; UPDATE limited to `DRAFT`/`READY_FOR_REVIEW`/`REJECTED` (not `APPROVED`) |
| Publish RPC | Single public `publish_question_revision` (auth.uid + capability + validation + locked updates + fingerprint idempotency + audit) |
| Private executor | Removed (`DROP` legacy internal executor); validator EXECUTE revoked from anon/authenticated/service_role |
| Payload immutability | Parent + children frozen at `APPROVED`/`PUBLISHED`/`SUPERSEDED` |
| Snapshot immutability | Attempt snapshot payload UPDATE rejected after INSERT; DELETE/CASCADE cleanup retained |
| Publish validation | `_qb_validate_revision_for_publish`: SINGLE_CHOICE / AUTO_TEXT / MANUAL / media rules |
| Cross-session FK | Composite FKs on exam/practice answers |
| Capability scope | P0 GLOBAL-only |
| Grader response scope | Assigned-grader SELECT only |

### Why the mechanism is not client-bypassable

- No custom GUC gate; no caller/owner/OID/name introspection in triggers.
- Clients lack column privileges for lifecycle/pointer writes.
- RLS blocks editor UPDATE of `APPROVED`/`PUBLISHED` revisions.
- Payload/child/snapshot triggers reject mutations even from privileged writers that skip RLS (fail-closed invariants).
- Public publish RPC derives actor solely from `auth.uid()`.

## PUBLISH-INVARIANTS-39B — caller introspection removed + payload freeze

### Supersedes package 39

Package 39 attempted `to_regprocedure`/OID ownership allowlisting. That approach is **rejected**: PostgreSQL cannot reliably prove the calling function inside a trigger, and shared-owner SECURITY DEFINER would still share the allowlist. 39B removes caller introspection entirely.

### Selected design

```text
authenticated → publish_question_revision
  → auth.uid()
  → capability
  → request_fingerprint idempotency
  → validate
  → supersede prior / publish / set pointer
  → audit
```

Triggers enforce **transition and data invariants only**.

### Local evidence

Recorded in package 39B verification (fresh compilation ×2, positive/negative runtime suite).

## Not executed / not included

- Migration apply (`db push` / `migration up` / `db reset` / Dashboard SQL / psql)
- Backfill of Revision #1 for existing questions
- Storage bucket / Storage policies
- Runtime UI or existing exam/practice API activation
- Changing default `attempt_pin_mode` away from `LEGACY`
- Deploy / publish / merge

## Apply gates (blocked until all true)

1. SQL compilation in isolated local PostgreSQL/Supabase
2. Re-run migration on empty / schema-only clone
3. Dependency-order review
4. Independent RLS/RPC security review
5. Separate backfill package (QB-02)
6. Production-readonly preflight
7. Explicit owner approval
8. Runtime config remains `LEGACY`
9. No new runtime path published/activated

## Validation performed

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `npm run test:question-bank-hash` | PASS |
| `npm run test:question-bank-source` | PASS |
| SQL executed | NO |
| Database connection (write) | NO |
| Database writes | ZERO |

## Security Review

- Files changed: migration + harness + fixtures + tests + docs + `package.json` / lockfile
- Did migrations change? **yes** (source file added; not applied)
- Did RLS change? **yes** (new tables/policies in source)
- Did RPCs change? **yes** (new SECURITY DEFINER RPCs in source)
- Authentication impact: **no** (uses `auth.uid()`)
- Authorization impact: **yes** (capability model; admin-only grant/revoke)
- Sensitive data exposure: **mitigated in source** (student denied on answers/solutions; column grants retained)
- Privilege escalation risk: **low** (fail closed; REVOKE PUBLIC; publish requires capability)
- Production risk: **none** until apply
- Ready for merge: **yes as Draft source-only**
- Ready for deploy: **no**

## Recommended next action

`QB01_PR48_INDEPENDENT_FINAL_REVIEW_41`
