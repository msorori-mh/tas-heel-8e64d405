# FIRST_REAL_CONTENT_BATCH_12 — Batch Record (in progress)

```text
Batch Code   : PROD-B12-20260813-01
Job slug     : prod-b12-20260813-01
Questions    : NO
Auto publish : NO
Expected     : INSERT-only (UPDATE = 0, SKIP = 0, BLOCKED = 0)
Status       : awaiting content files → Validate → Prepare → PREVIEW GATE
```

## Step 1 — Batch identity: FIXED (above)

## Step 2 — Logical snapshot: TAKEN

Timestamp (UTC): **2026-08-13T20:46:10Z** — taken **before** any write, from the
shared production database.

Location: `/mnt/documents/batch-12-snapshot/`

| File | Rows (excl. header) |
| --- | --- |
| `subjects.csv` | 30 |
| `units.csv` | 6 |
| `lessons.csv` | 10 |
| `lesson_book_contents.csv` | 6 |
| `lesson_explanations.csv` | 0 |
| `lesson_resources.csv` | 0 |
| `lesson_assessments.csv` | 0 |
| `content_review_state.csv` | 0 |
| `import_jobs.csv` | 6 |

Because the batch is INSERT-only, rollback does not need to restore old values:
every new entity is identifiable by the batch's natural keys, and the snapshot
proves exactly which rows pre-existed.

## Step 3 — Baseline counts: RECORDED

| Table | Baseline |
| --- | --- |
| `subjects` | 30 |
| `units` | 6 |
| `lessons` | 10 |
| `lesson_book_contents` | 6 |
| `lesson_explanations` | 0 |
| `lesson_resources` | 0 |
| `lesson_assessments` | 0 |
| `content_review_state` | 0 |
| `import_jobs` | 6 (0 in `applying`) |
| `questions` | 14 |
| `question_revisions` / `question_targets` / `assessment_questions` | 0 / 0 / 0 |

## Existing content inventory (why this batch is INSERT-only)

No subject in the database is complete. `lesson_explanations`,
`lesson_resources` and `lesson_assessments` are empty database-wide.

| Subject code | Units | Lessons | Book | Expl | Res | Assess |
| --- | --- | --- | --- | --- | --- | --- |
| `physics-g3-sanaa-grade-12-sanaa` | 1 | 3 | 3 | 0 | 0 | 0 |
| `math-g1-sanaa-grade-10-sanaa` | 1 | 3 | 3 | 0 | 0 | 0 |
| `biology-grade-12-all` | 1 | 1 | 0 | 0 | 0 | 0 |
| `quran-grade-12-all` | 1 | 1 | 0 | 0 | 0 | 0 |
| `QA_C01_C02_SUBJECT` (QA) | 2 | 2 | 0 | 0 | 0 | 0 |

Therefore the first batch introduces a **new** subject tree. Its
`subject_code` / `unit_code` / `lesson_code` come exclusively from the real
content files — none are invented here.

Valid parent codes available in the database for building the files:

- curriculum tracks: `sanaa`, `aden`, `other`
- grades: `grade-10`, `grade-11`, `grade-12`

## Steps 4–12 — pending

| # | Step | Owner | Status |
| --- | --- | --- | --- |
| 4 | Validate each template in `/admin/import` | user | pending files |
| 5 | Prepare (staging) → job id + preparedHash | user | pending |
| 6 | **PREVIEW GATE** — batch code, subject/unit/lesson codes + names, row count per template, planned actions; must read INSERT-only | agent | pending |
| 7 | Execute (once) | user | blocked by gate |
| 8 | Admin verification: full tree, `content_review_state` = pending/draft, no auto publish | agent | pending |
| 9 | Real student verification: lists, direct-by-id, content RPC → zero exposure | agent | pending |
| 10 | Exact replay → ALL SKIPPED | user + agent | pending |
| 11 | `import_jobs` review → terminal state, zero `applying` | agent | pending |
| 12 | Closing report | agent | pending |

### Stop conditions before Execute

Any `UPDATE`, `NEW_REVISION`, `BLOCKED_PUBLISHED`, or unexplained `SKIP` in the
preview halts the batch and triggers a code-collision review.
