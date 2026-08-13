# CONTENT_AND_QUESTION_UNIFIED_OPERATIONAL_E2E_09 — Unified Package E2E (Non-Prod)

**Verdict: PASS — 40/40 checks.** Non-Prod only. No publish, no production change.

## What was run

One coherent package (subject → unit → 2 lessons → book content, explanation,
2 resources, assessment, 3 questions) staged into a single `import_jobs` row and
executed end-to-end with a real staff JWT (magic-link minted), then read back as a
real student and as anonymous. Service-role is used only for read-back assertions
and teardown.

- Harness: `tests/e2e/content-import/run-unified-import-e2e-09.ts`
  (guarded by `RUN_CONTENT_IMPORT_E2E=1`)
- Fixtures: `scripts/content-import/generate-e2e-fixtures.mjs` → `u09_*.xlsx`,
  every code prefixed `e2e-u9-`

```bash
RUN_CONTENT_IMPORT_E2E=1 E2E_STAFF_USER_ID=<staff-uuid> E2E_STUDENT_USER_ID=<student-uuid> \
  node --import tsx tests/e2e/content-import/run-unified-import-e2e-09.ts
```

## The four mandatory corrections

1. **Dependency order, not numeric order.** The runner derives execution order from
   `IMPORT_EXECUTION_ORDER` / `orderTemplatesByDependency` and asserts it equals the
   contract order; the numeric 01→09 filenames are never used for sequencing.
   Observed: `subjects → units → lessons → book_contents → explanations → resources →
   assessments → questions (→ assessment_questions)`.
2. **Student check is a gate.** `E2E_STUDENT_USER_ID` is required; without it the run
   exits `UNIFIED_E2E_INCOMPLETE` (not PASS). Checks 22–28 cover draft invisibility
   (list, by-id, content RPC) and answer-leak surfaces (options, accepted answers,
   revisions, legacy `correct_index`/`options`), for both student and anonymous.
3. **Atomicity is per-template.** A broken template rolls back entirely (zero partial
   rows), aborts the templates after it, and leaves every previously committed template
   untouched — verified by identical domain counts before/after the failure.
4. **Teardown keeps the audit trail.** Only `e2e-u9-` domain entities are deleted;
   `import_jobs` (including the failed one) are retained, and no job is left `applying`.

## Results

| Pass | Result |
| --- | --- |
| 1 — first unified import (8 templates, one job) | PASS — 12 rows inserted |
| 2 — exact replay | PASS — 0 inserted / 0 updated, all SKIP, no new revision |
| 3 — partial update (1 lesson, 1 question) | PASS — 1 updated / 1 skipped; new DRAFT revision, previous preserved; approved lesson reset to `pending` |
| 4 — existing question + new target | PASS — `TARGET_ADDED`, no new revision |
| 5 — broken file inside the package | PASS — `SUBJECT_NOT_FOUND`, template rolled back, later templates never started, job terminal `failed`, staged rows not re-executable |
| 6 — student / anonymous visibility | PASS — no draft content, no answer key, no auto-publish |
| 7 — teardown | PASS — baseline restored, import_jobs retained |

## Gap found

**G-1 — template 08 (`assessment_questions`) cannot link imported questions.**
By design, `qb_import_ingest_revision` creates the question root as an identity shell
with no legacy `lesson_id`/`subject_id` (that binding is exactly what would expose a
draft to students), and `qb_sync_question_legacy` is still a stub. The link trigger
`validate_assessment_question_link` therefore refuses with *"Question must belong to the
same subject as the assessment lesson"*.

This is correct fail-closed behaviour, not a regression: the harness asserts the refusal
and that zero links are written. Consequence for operations: an assessment can only be
linked to questions that already exist in the legacy binding (i.e. after a publish path
populates it). Closing G-1 means deciding, in a later phase, whether publishing a
question revision should populate the legacy root binding.

## Boundaries

- Non-Prod only; nothing was published.
- Teardown matches `e2e-u9-` codes/slugs plus the shared `e2e-` question purge.
