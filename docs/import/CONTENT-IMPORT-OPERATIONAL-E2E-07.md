# CONTENT_IMPORT_OPERATIONAL_E2E_07 — Operational E2E (Non-Prod)

**Verdict: PASS — 32/32 checks.** Non-Prod only. No publish, no production change.

## What was run

Real pipeline, real staff JWT (magic-link minted for the admin account, so RLS and
the RPC operator guard both applied). No service-role shortcuts on any write path;
service-role is used only for read-back assertions and for teardown.

- Harness: `tests/e2e/content-import/run-content-import-e2e-07.ts`
  (guarded by `RUN_CONTENT_IMPORT_E2E=1`)
- Fixtures: `scripts/content-import/generate-e2e-fixtures.mjs` →
  `tests/e2e/content-import/fixtures/` — every domain code prefixed `e2e-`

Command:

```bash
RUN_CONTENT_IMPORT_E2E=1 E2E_STAFF_USER_ID=<staff-uuid> \
  node --import tsx tests/e2e/content-import/run-content-import-e2e-07.ts
```

## Results

| Scenario | Result |
| --- | --- |
| Templates 01–08, validate → prepare → execute | PASS — 10 rows inserted, 0 updated, 0 blocked |
| Review state after import (`pending` / `draft`) | PASS |
| Exact replay of all 8 files (idempotency) | PASS — 0 inserted, 0 updated, all SKIP |
| Invalid file (missing column + unknown grade) | PASS — validation fails, zero domain writes |
| Published-row mutation | PASS — `BLOCKED_PUBLISHED`, row content unchanged |
| Template 09 (questions) | PASS — `QUESTION_BANK_WORKFLOW_REQUIRED`, zero question writes |
| Student exposure of draft content | PASS — anonymous list, direct-by-id and content RPC all return nothing |
| Teardown | PASS — no `e2e-*` rows remain, domain counts back to baseline |

Template 06 (`resources`) covers the `metadata` jsonb path; template 03 covers both the
unit-linked and the unit-less lesson.

## Defects found and fixed during the run

**D-1 — child rows were not idempotent (execution function).**
`book_contents`, `resources` and `assessment_questions` have no review-state identity,
so the existing row was only resolved *inside* the write branch, after the action had
already been decided as `INSERT`. Replaying the same file therefore re-applied the row
and reported it as an insert. Fixed by resolving the child target *before* the action
decision and skipping when an identical `natural_key` + `row_hash` was already applied.
Applied to Non-Prod as a `CREATE OR REPLACE` of `public.import_execute_template`, and
mirrored into `supabase/migrations-pending/20260813010000_import_staging_and_execution_03.sql`.

**D-2 — crash on the execute-error path (`import-staging.server.ts`).**
The best-effort finalize used `.catch()` on the Supabase RPC thenable, which does not
expose `.catch`; any execute error turned into `TypeError: ... .catch is not a function`
and masked the real database error. Replaced with `try/catch`.

## Notes / boundaries

- The question bank stays outside the import pipeline. Template 08 links to questions
  that must already exist, so the harness seeds two bank rows directly against the e2e
  lesson and deletes them in teardown. Template 09 remains refused.
- `content_review_set_state` was used to publish only the isolated `e2e-` subject, purely
  to exercise the published gate; it was removed again in teardown.
- Teardown only ever matches `code`/`slug` starting with `e2e-`.

## Next

Publish and Production remain out of scope for this phase.
