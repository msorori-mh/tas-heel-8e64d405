# TAMKEEN CONTENT FACTORY 10 — Domain Materialization (Source Only)

**Status:** SOURCE-READY / NOT APPLIED TO PRODUCTION
**Production writes:** 0 (no migration applied, no data inserted, no publish, no READY)

## 1. Scope

CF10 closes the last gap of the Content Factory chain: turning a CF08 signed/staged bundle
into real domain rows, atomically, in `DRAFT` state only.

Chain: CF04 (package staging) → CF07 (verified bundle intake) → CF08 (atomic domain staging)
→ CF09 (authoritative identity binding) → **CF10 (domain materialization)**.

Explicitly out of scope and structurally impossible in the RPC:
- creating `subjects`, `grades`, `curriculum_tracks`, `units`, or track bindings
- any `DELETE`
- any storage mutation
- any `REVIEW` / `READY` transition or publication

## 2. Deliverables

| File | Purpose |
| --- | --- |
| `supabase/migrations-pending/20260819230000_content_factory_10_domain_materialization.sql` | Ledger table + `golden_lesson_materialize_domain_batch` RPC |
| `scripts/content-factory/pg17/content-factory-10-fixture.sql` | PG17 domain schema fixture + rich second package |
| `scripts/content-factory/pg17/content-factory-10-assert.sql` | Executable PG17 assertions |
| `scripts/content-factory/pg17/rehearse-content-factory-04.sh` | CF04 → CF10 rehearsal pipeline |
| `tests/content-factory/content-factory-10.static.test.mjs` | Static contract tests |

## 3. RPC contract

`public.golden_lesson_materialize_domain_batch(_batch_id, _actor_id, _mode, _expected_plan_sha256, _idempotency_key)`

- `DRY_RUN` — returns the deterministic write plan and its SHA-256, performs **zero** writes.
- `EXECUTE` — requires the exact plan hash from the dry run plus an idempotency key (≥ 8 chars).
- Service-role execute only; `anon` / `authenticated` are revoked. Actor must hold `admin`.
- Advisory transaction lock per batch; the whole materialization is one transaction.

Preconditions (all fail-closed):
- batch exists and its `verified_bundle_sha256` matches the attested package version
- exactly 7 staged capabilities, every payload hash re-verified against its bytes
- answer companion present
- subject resolved to exactly one existing row; any CF09 binding must agree
- no answer-bearing tokens in student-visible payloads (`cf10_assert_no_answer_leak`)

Idempotency: the ledger row is authoritative. A replay compares the caller's expected hash and
key against the **pinned** ledger values (the freshly computed plan is not comparable after the
lesson exists), returns `idempotent: true`, and writes nothing. Any divergence raises
`CF10_REPLAY_CONFLICT`.

## 4. Capability → target mapping

| Capability | Target | Natural key |
| --- | --- | --- |
| officialBookContent | `lesson_book_contents` | `lesson_id` |
| tamkeenExplanationHtml | `lesson_explanations` | `lesson_id`, `<lessonCode>-EXP` |
| lessonSummaryHtml | `lesson_summaries` | `lesson_id` |
| mindMapHtml | `lesson_resources` (mindmap) | `lesson_id`, resource code |
| labExperimentHtml | `lesson_resources` (experiment) | `lesson_id`, resource code |
| officialBookQuestions | `questions` + `question_revisions` | `questions.code` |
| selfTest | `lesson_assessments` + `assessment_questions` | assessment code |

Read-before-write everywhere; a changed payload over an existing row raises
`CF10_CONTENT_HASH_CONFLICT` instead of silently overwriting.

## 5. Answer separation

Student-visible rows are written answer-free: `questions.correct_index = -1`,
`question_options.is_correct = false`. Answers and rationales land only in
`official_question_answers` and `question_option_rationales`, pinned to the published revision.
Lifecycle rows are created as `DRAFT` with no `ready_at` / `ready_hash` / `ready_snapshot`.

## 6. Verification

PG17.9 rehearsal, full chain CF04 → CF08 → CF09 → CF10:

```
PASS_CONTENT_FACTORY_04_PG17
PASS_CONTENT_FACTORY_08_PG17
PASS_CONTENT_FACTORY_09_PG17
PASS_CONTENT_FACTORY_10_PG17
```

Assertions cover: dry-run purity, plan-hash gate, missing idempotency key, non-admin rejection,
authorized execute, idempotent replay, replay conflict, lesson creation exactly once, no subject
creation, resources/questions/options/assessment writes, zero answer leak, DRAFT-only lifecycle,
and ledger immutability.

Defects found and fixed during rehearsal:
1. `pg_advisory_xact_lock(bigint, bigint)` does not exist — switched to the single-key form.
2. `assessment_id` / `revision_id` PL/pgSQL variables shadowed column names — renamed.
3. Replay compared a state-dependent plan hash — replay now resolves against the pinned ledger.

## 7. Operational next step

Applying CF07–CF10 to production remains gated behind the existing
`HOLD_PRODUCTION_PREFLIGHT` verdict (owner-role access to the migrations table and RLS function
execution, plus PITR confirmation). CF10 changes nothing about that gate.

## 8. CF10-R2 — production schema contract remediation

The first CF10 candidate is **BLOCKED_BY_PRODUCTION_SCHEMA_CONTRACT**. Independent review against
the live schema proved four defects:

1. `question_revisions.status` was written as lowercase `'published'`; the production check
   constraint accepts only `DRAFT, READY_FOR_REVIEW, APPROVED, PUBLISHED, SUPERSEDED, REJECTED`.
2. Even uppercase `PUBLISHED` is impossible here: the production constraint additionally demands
   `published_at`, `published_by` and `payload_hash`, and the trigger
   `qb_guard_question_revision_lifecycle` forbids inserting `APPROVED/PUBLISHED/SUPERSEDED`
   revisions outright.
3. Publishing a revision and moving `questions.current_published_revision_id` contradicted the
   authorized DRAFT-only / no-publish scope.
4. The PG17 fixture did not reproduce those constraints, indexes or deferred triggers, so the
   original `PASS` was false confidence.

R2 is the corrected candidate:

- `question_revisions` are inserted as `'DRAFT'` only; `published_at`, `published_by` and
  `questions.current_published_revision_id` are never written, and final assertions abort the
  transaction if any PUBLISHED revision or pointer exists.
- `payload_hash` is computed with the production canonical contract
  `public._qb_compute_revision_payload_hash` (`canonical_payload_v1`); `source_payload_hash`
  carries the staged capability sha256.
- Every draft revision gets its `question_targets` LESSON row, so a later publish stage has a
  publishable target without CF10 touching lifecycle state.
- Answers and rationales stay revision-pinned in `official_question_answers` /
  `question_option_rationales` (server-only tables); student-visible rows stay answer-free.
- `assessment_questions` membership is **deferred**: `validate_assessment_question_link` requires a
  PUBLISHED revision plus a matching published target, which DRAFT-only materialization cannot and
  must not satisfy. The result JSON reports `assessment_membership_deferred: true`.
- The PG17 fixture now mirrors production constraints, unique keys, grants, canonical hash
  functions and QB guard triggers (`qb_guard_question_revision_lifecycle`,
  `qb_assert_published_pointer_consistency`, `qb_guard_current_published_revision_pointer`,
  `qb_guard_revision_children_immutable`, `qb_guard_targets_revision_immutable`,
  `reject_v3_answer_layer_mutation`, `validate_assessment_question_link`).
- New negative rehearsal tests prove that lowercase `'published'`, a direct PUBLISHED insert and a
  manual published-pointer update are all rejected, leaving zero rows behind.

### R2 verification

- PG17 rehearsal CF04 → CF08 → CF09 → CF10: `PASS_CONTENT_FACTORY_10_PG17`.
- Static/contract tests: 36/36 PASS.
- Full regression: 276/278 PASS (the two failures are the previously triaged category-B
  expectations: `no-direct-curriculum-delete` and `lesson-journey-no-original-pdf-21b4e`).
- Typecheck: PASS. Build: PASS.
- CF10-R2 migration SHA256:
  `8c4adffc89604626a2fab22f4353a198e73e4998a9acc26dbfbd17ef1201e8d2`
- R5 SHA256 unchanged: `4d7b1dc3ffd5154cecb3a49ade260b62534893d83876c582f988ab28b1b95cf3`
- 21H SHA256 unchanged: `3d8cdd27a24ea9f0e998ba14e26adcb87dd0ff6b62fcc3fbd9b790114dd631e3`

FINAL_VERDICT=PASS_CONTENT_FACTORY_10_R2_SOURCE_READY
PRODUCTION_WRITES=0
