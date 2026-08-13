# G1_PUBLISHED_REVISION_TARGET_BINDING_11 — Report

**Verdict: PASS (rehearsal only).**
**Scope guard: the migration was NOT applied to the shared production datastore.**
It lives in `supabase/migrations-pending/` and was rehearsed exclusively on a
disposable local PostgreSQL 17 cluster.

## What changed

`question_targets` now belongs to an exact revision, not to a question:

```text
question_targets.revision_id ──(composite FK: revision_id, question_id)──▶ question_revisions
                                                                             │
publish_question_revision ── requires exactly 1 primary target on the revision
                                                                             ▼
                        questions.current_published_revision_id
                                                                             │
assessment_questions insert ── accepts only a target whose revision_id equals
                               the question's current published revision
```

Legacy `questions.lesson_id` / `questions.subject_id` no longer participate in
any binding decision.

## Deliverables

| File | Role |
| --- | --- |
| `supabase/migrations-pending/20260814010000_g1_published_revision_target_binding_11.sql` | The pending migration |
| `tests/import/run-pg17-g1-target-binding-11-rehearsal.sh` | Full rehearsal runner |
| `tests/import/fixtures/pg17-prereq-qb-runtime.sql` | Chain prerequisites (exam roots, audit sink, legacy validator) |
| `tests/import/fixtures/pg17-g1-target-binding-smoke.sql` | Runtime binding matrix (S1–S9) |
| `tests/import/fixtures/pg17-g1-target-binding-backfill-seed-ok.sql` + `-verify.sql` | Deterministic backfill |
| `tests/import/fixtures/pg17-g1-target-binding-backfill-seed-ambiguous.sql` | Fail-closed backfill |

## Rehearsal method

One disposable cluster, one pre-stage-11 base database built from the exact
chain (baseline fixture → QB-01 → import 03 → the six follow-up migrations),
then three databases cloned from that base:

| DB | Purpose |
| --- | --- |
| `smoke` | apply stage 11 twice (idempotency) + runtime matrix |
| `bf_ok` | deterministic legacy targets must backfill exactly |
| `bf_ambig` | ambiguous legacy targets must abort the migration |

## Results — 31/31 PASS

**Schema / idempotency**
- A1 stage-11 applies on the exact chain
- A2 stage-11 is re-appliable

**Publish gate**
- S1 publish denied with no target (`QB_PUBLISH_TARGET_REQUIRED`)
- S2a publish denied with 0 primary targets (`QB_PUBLISH_PRIMARY_TARGET_REQUIRED`)
- S2b a second primary target on the same revision is rejected by unique index

**Identity**
- S3 a target can never reference another question's revision (composite FK)
- S7 structural assertions: `revision_id NOT NULL`, composite FK, shape CHECK,
  question-scoped uniqueness indexes removed, revision-scoped ones present,
  legacy 3-arg `retarget_question` gone, legacy assessment validator gone

**Binding matrix**
- S4a draft question is not bindable (`QUESTION_PUBLISH_REQUIRED`)
- S4b published revision + matching target is bindable
- S4c non-matching lesson denied (`QUESTION_TARGET_MISMATCH`)
- S4d targets of a PUBLISHED revision are immutable
- S4e a newer DRAFT target grants nothing while unpublished
- S4f publishing the newer revision moves eligibility to its own target
- S4g the now-SUPERSEDED revision's target grants no new binding
- S4h superseded targets survive as immutable history
- S4i / S5 legacy `questions.lesson_id` / `subject_id` cannot grant a binding

**Targeting API**
- S6a `retarget_question(question, revision, targets, reason)` binds to a draft
- S6b LESSON target with `unit_id IS NULL` accepted (lesson directly under subject)
- S6c retargeting a published revision is refused
- S8 deleting a draft revision cascades its targets (teardown unblocked)

**Real workflow (Template 09 → Draft → Review → Publish → Template 08)**
- S9a ingest creates a DRAFT revision
- S9b ingest binds the target to that exact draft revision as primary
- S9c the imported draft is not bindable by template 08
- S9d after publish, template 08 binding succeeds on the targeted lesson

**Backfill**
- BF1 target of a published question binds to its published revision
- BF2 a newer draft revision does not capture the legacy target
- BF3 single-revision question binds deterministically
- BF4 no target row created or deleted by the backfill
- D1 ambiguous data aborts with `G1_BACKFILL_AMBIGUOUS_TARGETS`
- D2 the aborted transaction leaves no partial schema and deletes no data

## The 7 hardening points

| # | Requirement | Status |
| --- | --- | --- |
| 1 | revision_id ↔ question_id closed by a DB constraint | Composite FK `question_targets_revision_question_fk` (S3, S7) |
| 2 | Fail-closed backfill, no auto-delete, no guessing | Two gates: pre-flight inventory + post-update NULL check (BF1–BF4, D1–D2) |
| 3 | Immutability for PUBLISHED / SUPERSEDED | Trigger `qb_guard_targets_revision_immutable` (S4d, S4h) |
| 4 | Exactly one primary target before publish | `_qb_assert_revision_targets_publishable` + partial unique index (S1, S2a, S2b) |
| 5 | Real workflow 09 → Draft → Review → Publish → 08 | S9a–S9d |
| 6 | Lesson attached directly to a subject | QB-01's `unit_id NOT NULL` CHECK for LESSON targets dropped and replaced (S4f, S6b) |
| 7 | R-1 staging retention | Policy only — staging rows are purged manually after 7 days; no automatic job added in this stage |

## Notes for the production apply stage

1. The migration runs in a single transaction and is fail-closed: on the shared
   datastore it either completes or changes nothing.
2. Run the pre-flight inventory query first on real data; if it reports
   ambiguous questions, those targets must be resolved by a human before applying.
3. QB-01's anonymous `question_targets` CHECK is dropped by this migration. Any
   report or code that assumed "LESSON target implies unit_id" must be reviewed.
4. `retarget_question` changes signature from `(uuid, jsonb, text)` to
   `(uuid, uuid, jsonb, text)`. There are no application callers today.
