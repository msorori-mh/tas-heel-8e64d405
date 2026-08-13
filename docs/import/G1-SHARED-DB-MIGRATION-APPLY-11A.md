# G1_SHARED_DB_MIGRATION_APPLY_11A — Report

**Verdict: PASS.** Migration 11 is applied to the shared Lovable database.
This was the first real production schema write of the import programme.

## 1. Pre-apply state (read-only, verified before any write)

| Metric | Value |
| --- | --- |
| `question_targets` | 0 rows |
| `question_revisions` | 0 rows |
| `assessment_questions` | 0 rows |
| `questions` (legacy) | 14 rows |
| `question_targets.revision_id` | absent |
| Ambiguous backfill rows | 0 |
| Anonymous QB-01 shape CHECK | `question_targets_check` (recorded by name) |

Consequence: the fail-closed backfill had no work to do, and no existing
assessment link could break.

## 2. Migration identity

| Artifact | SHA-256 |
| --- | --- |
| `migrations-pending/20260814010000_g1_published_revision_target_binding_11.sql` (pre-apply) | `5cafd5301f87a497b786188711d01e7f5aad87ace63ada3b890ce2c2b265b3db` |
| Applied migration `supabase/migrations/20260813201920_99aedcc6-49ad-4dac-aed7-7f3bda1621cb.sql` | `83b074abb218bc01dd8dd345cd653cd41260b31ea60c975c554fa55337737c02` |

`diff` of the two files reports a single difference: the applied file has no
trailing newline. Byte-for-byte the SQL is identical (931 lines, same content).
No manual SQL was executed outside migration files. The pending file was removed
after the apply; `migrations-pending/` now holds only the import-03 file.

## 3. Post-apply schema verification

| Check | Result |
| --- | --- |
| `question_targets.revision_id` NOT NULL | PASS |
| Composite FK `question_targets_revision_question_fk` | PASS |
| `question_revisions_id_question_uniq` | PASS |
| `question_targets_shape_chk` present | PASS |
| Legacy `question_targets_check` removed | PASS |
| `question_targets_revision_dedupe_uidx` / `_one_primary_per_revision_uidx` / `_revision_idx` | PASS (3/3) |
| Legacy `question_targets_dedupe_uidx` / `_one_primary_uidx` removed | PASS (0 left) |
| Trigger `trg_qb_targets_revision_immutable` | PASS |
| Trigger `trg_validate_assessment_question_link` | PASS |
| `_qb_assert_revision_targets_publishable` exists | PASS |
| `retarget_question(uuid,uuid,jsonb,text)` exists, 3-arg overload gone | PASS |
| All stage-11 functions `SECURITY DEFINER` + fixed `search_path` | PASS |
| `questions` still 14 rows, zero row loss anywhere | PASS |

### Grant correction (follow-up migration)

Supabase's default-grant event trigger re-granted `EXECUTE` to `anon`,
`authenticated` and `service_role` on every function the migration recreated —
behaviour that does not exist on the local PG17 rehearsal cluster. A follow-up
migration restored the intended matrix:

| Function | Final ACL |
| --- | --- |
| `publish_question_revision` | `authenticated` only |
| `retarget_question` | `authenticated` only |
| `_qb_assert_revision_targets_publishable` | none (internal) |
| `qb_guard_targets_revision_immutable` | none (trigger) |
| `validate_assessment_question_link` | none (trigger) |
| `qb_import_ingest_revision` | `service_role` only |

Database linter warnings dropped from 126 to 120 (the six `anon`-executable
SECURITY DEFINER findings introduced by the apply are gone). The remaining 120
are pre-existing and unrelated to stage 11.

## 4. Regression found and fixed: `qb_e2e_purge_questions`

The first E2E run scored 16/18. Root cause: the test-only purge RPC disabled
user triggers on `question_revisions` and `questions`, but the new immutability
trigger lives on `question_targets`, so deleting the targets of a PUBLISHED
revision raised `QB_TARGET_IMMUTABLE_REVISION` and left rows behind, which then
failed the two downstream checks.

Fix: the purge RPC now also disables/re-enables user triggers on
`question_targets`. It still refuses any prefix other than `e2e-` and is
executable by `service_role` only. No production data path is affected.

## 5. E2E on the shared database

Actor: full-admin staff account; student actor: an existing test account.
Both suites clean up after themselves and retain `import_jobs`.

| Suite | Result |
| --- | --- |
| `run-question-import-e2e-08.ts` (Template 09) | **18/18 PASS** |
| `run-unified-import-e2e-09.ts` (unified package) | **40/40 PASS — UNIFIED_IMPORT_E2E_09_PASS** |

Key stage-11 assertions observed on production schema:

- draft-only question cannot be linked to an assessment —
  `QUESTION_PUBLISH_REQUIRED`, zero links written (check 07)
- import never auto-publishes; `current_published_revision_id` NULL for all
  imported questions (check 28)
- publishing preserves history; a content change lands as a new DRAFT
- a new target on an existing question is `TARGET_ADDED` with no new revision
- zero answer leakage to student and anonymous roles
- `qb_import_ingest_revision` is not callable by a staff client

## 6. Post-run integrity

| Metric | Value |
| --- | --- |
| `questions` | 14 (unchanged) |
| `questions` with `e2e-%` code | 0 |
| `question_revisions` / `question_targets` / `assessment_questions` | 0 / 0 / 0 |
| `e2e-%` subjects / lessons | 0 / 0 |
| `import_jobs` | 6 retained |
| jobs stuck in `applying` | 0 |

## 7. Recorded behaviour note (intentional, not a defect)

The 14 legacy questions have no `current_published_revision_id`. After 11A they
are **not eligible** to be linked to any new assessment until they are migrated
into the QB revision path and published with exactly one primary target. This is
the intended fail-closed behaviour of G-1. It must not be worked around by
reusing `questions.lesson_id` / `questions.subject_id`.

## 8. Rollback plan (still valid)

`question_targets` and `question_revisions` are empty, so a reverse migration
can drop `revision_id`, the composite FK, the revision-scoped indexes, the
shape CHECK and the immutability trigger, and restore the previous
`validate_assessment_question_link` and 3-arg `retarget_question`, with zero
data loss. The forward migration itself ran in a single transaction.

## Exit gate

```text
Migration apply                         PASS
Migration SHA match                     PASS (content identical)
Schema constraints/indexes              PASS
RLS/functions/grants                    PASS
question_targets.revision_id NOT NULL   PASS
Legacy target indexes removed           PASS
retarget_question old overload removed  PASS
questions count remains 14              PASS
No unintended row loss                  PASS
e2e draft binding denied                PASS
publish then binding                    PASS
published target immutable              PASS
answer leakage                          ZERO
E2E cleanup                             PASS
import_jobs retained                    PASS
no regression                           PASS (one test-only purge RPC repaired)

= G1_SHARED_DB_MIGRATION_APPLY_11A_PASS
```

Next: `FIRST_REAL_CONTENT_BATCH_12` — one small real subject, no questions, no
auto-publish.
