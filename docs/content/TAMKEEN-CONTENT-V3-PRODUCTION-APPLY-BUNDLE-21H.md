# TAMKEEN Content V3 — Production Apply Bundle 21H

This is an apply package only. Codex did not apply it to production.

## 1. Exact source lock

```text
CURRENT_R3_SOURCE_SHA=f42c22b9f013834b78347bf125d0742363dc27e0
CURRENT_R3_MIGRATION_SHA256=3D8CDD27A24EA9F0E998BA14E26ADCB87DD0FF6B62FCC3FBD9B790114DD631E3
WORK_BRANCH=codex/21h-r4-release-metadata
BASE_R3_SHA=f42c22b9f013834b78347bf125d0742363dc27e0
```

## 2. Exact migration

Apply exactly this file, byte-for-byte, after the prerequisite and read-only
gates:

```text
supabase/migrations-pending/20260818210000_content_v3_21h_hardened_preflight.sql
SHA256=3D8CDD27A24EA9F0E998BA14E26ADCB87DD0FF6B62FCC3FBD9B790114DD631E3
```

Historical migration identities (not current):

- R1: `E451B3F571D0DA197475BF44E793BF49B45F9CC08E822AC735C9D12FC1318F40`
- R2: `78F8E642A8DB60CCA3909FCC0A7CB4124B753A122FAB92380E086EA85B02CD34`

The current R3 candidate is the SHA above.

R2 closes the two PostgreSQL 17 runtime findings: the visibility-diff
`UNION ALL` now has an explicit `text` output contract, and
`reveal_official_question_answer` resolves `lesson_id` from `practice_attempts
(pa)`, not an undefined `q` alias. No production apply, deploy, merge, remote
database, storage, OAuth, data, or fixture change is included.

Do not apply the duplicate/legacy 20C files listed in the preflight report as
part of this bundle. The bundle candidate creates the lifecycle table without
backfill rows and includes the corrected V3 answer layer/RPCs.

## 3. Exact order

1. Verify the source SHA and migration SHA.
2. Run `scripts/content-v3/production-preflight-readonly.sql` with a
   production read-only role.
3. Run `scripts/content-v3/visibility-diff-21h.sql` and retain the baseline.
4. Confirm Question Bank revision-pinning prerequisites and the absence of the
   old non-pinned answer-layer tables.
5. Apply the exact migration in one PostgreSQL transaction through the approved
   production operator.
6. Run `scripts/content-v3/postverify-21h.sql` read-only.
7. Run `scripts/content-v3/visibility-diff-21h.sql` again and compare to the
   retained baseline.

## 4. Expected rows and data effects

```text
NEW_LIFECYCLE_ROWS=0
NEW_OFFICIAL_ANSWER_ROWS=0
NEW_OPTION_RATIONALE_ROWS=0
LEGACY_ROWS_DELETED=0
LEGACY_ROWS_RENAMED=0
CONTENT_ROWS_COPIED=0
```

The only possible existing-row update is deterministic applicability
normalization for lifecycle rows: `simulation → OPTIONAL`, and
`supportingResources/originalBookPdf → NA`. The operator must record the exact
affected count from the read-only baseline before apply.

## 5. Required SQL assertions

Use these exact files after apply:

- `scripts/content-v3/postverify-21h.sql`
- `scripts/content-v3/visibility-diff-21h.sql`

Assertions include enum/column presence, RLS enabled, no PUBLIC/anon access to
answer rows or reveal execution, pinned function search paths, revision-pinned
foreign keys, no derived-performance lifecycle row, no legacy-reference
capability marked applicable, and no unproven READY backfill.

## 6. Expected visibility diff

```text
UNCHANGED=all legacy-visible V3 capability rows
EXPECTED_GAIN=0
SECURITY_FIX=allowed, but must not change visibility
UNEXPECTED_VISIBILITY_GAIN=0
UNEXPECTED_VISIBILITY_LOSS=0
```

The comparison is predicate-based and includes official content, explanations,
summaries, mind maps, experiments, questions, and assessments. PDF,
supporting resources, and derived performance are excluded from the V3 journey.

## 7. Rollback / roll-forward guidance

- If the transaction fails, PostgreSQL rolls back the whole migration; do not
  manually delete partial objects.
- If postverify fails, stop student rollout and preserve the read-only evidence.
- Do not drop answer or lifecycle history as a rollback shortcut.
- Correct content by creating a new revision and using the existing lifecycle
  transition flow; published revision history is immutable.
- If a true rollback is required, use the operator's approved database backup/
  restore procedure or a reviewed compensating migration. No destructive
  rollback is included in this source-only bundle.

## 8. Exact STOP conditions

Stop immediately on:

- source or migration SHA mismatch;
- missing Question Bank/practice-attempt prerequisites;
- existing old answer-layer schema;
- any unproven READY lifecycle row;
- any answer, correct option, rationale, or model-answer field in the initial
  question/self-test payload;
- unauthorized, replayed, malformed, or revision-mismatched reveal accepted;
- any RLS/grant/search_path assertion failure;
- any unexpected visibility gain or loss;
- golden lesson content/hash change or absence;
- PostgreSQL version other than 17;
- any production write outside the exact approved migration transaction.

## 9. Security contract at handoff

```text
MODEL_ANSWER_NOT_IN_INITIAL_CLIENT_PAYLOAD=PASS_STATIC
INITIAL_SELF_TEST_NO_CORRECT_OPTION=PASS_STATIC
INITIAL_SELF_TEST_NO_RATIONALE=PASS_STATIC
EXPLICIT_AUTHORIZED_SERVER_CONTROLLED_REVEAL=PASS_STATIC_CANDIDATE
FAIL_CLOSED=PASS_STATIC_CANDIDATE
EXACT_REVISION_PINNING=PASS_STATIC_CANDIDATE
```

Runtime/network-level confirmation remains the responsibility of the PG17
rehearsal and the production read-only operator gate.

## R4 metadata closure addendum

```text
QWEN_R3:
CRITICAL=0
HIGH hash identity finding=CLOSED
MEDIUM documentation consistency finding=CLOSED
QWEN_REVIEW_AFTER_R4=NOT_CLAIMED
```

This records finding closure and does not claim a post-R4 Qwen review.
