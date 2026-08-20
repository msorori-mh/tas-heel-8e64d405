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

## 9. CF10-R3 — BLOCKED (partial-READY lesson-scope leak)

R3 added a student visibility gate, but it opened the lesson as soon as **one** capability reached
`READY`. Because `can_access_lesson()` then authorizes every lesson-scoped table, the remaining
DRAFT capabilities (book content, explanations, summaries, resources, questions, assessments) were
readable through the Data API. Verdict: **R3=BLOCKED_PARTIAL_READY_LESSON_SCOPE_LEAK**.

## 10. CF10-R4 — source candidate (all-or-nothing gate + exact identity replay)

### Visibility (CRITICAL, closed)

- `lesson_student_visible()` now returns true for an editorially managed lesson **only** when at
  least one `REQUIRED` lifecycle row exists **and** no `REQUIRED` row is anything other than
  `READY`. `NA` rows never block; `DRAFT`/`REVIEW` rows always block.
- Legacy unmanaged lessons stay visible unchanged; content staff keep full DRAFT visibility.
- CF10 pins the seven capabilities for its own batch; a capability staged with a payload is
  recorded `REQUIRED`, a declared-absent one `NA`.

### Fail-closed replay / identity (HIGH, closed)

Reuse of an existing row is allowed only on an exact field-level match, otherwise
`CF10_IDENTITY_CONFLICT` / `CF10_CONTENT_HASH_CONFLICT` / `CF10_LIFECYCLE_CONFLICT` aborts the whole
transaction with no ledger row:

- lessons: `subject_id, title, unit_id IS NULL, is_free=true, semester, sort_order`
- binding resolution: exactly one authoritative binding or an explicit no-binding path; no
  ambiguity, no invented identity, no duplicate subject
- lesson_resources: `resource_type, title, url, description, sort_order, resource_code,
  html_resource_type, metadata sha256, is_primary`
- questions: `lesson_id, subject_id, code, text, type, options, correct_index = -1`
- question_revisions: `revision_number, status, interaction_type, grading_mode, question_text,
  source_payload_hash, payload_hash_version` and canonical `payload_hash` after options/targets
- question_options and the LESSON target: exact set, order, body, `is_correct=false`, lesson+subject
- official_question_answers and question_option_rationales: exact companion match
- lesson_assessments: `lesson_id, title, instructions, sort_order, assessment_code`
- lifecycle: `DRAFT` + expected applicability + `draft_hash`

### Counters

Every counter comes from real `ROW_COUNT` / `RETURNING`; the canonical `payload_hash` update is
counted explicitly. Exact replay performs **0 domain writes**; the ledger insert is recorded
separately and never inflates the domain count.

### R4 verification

- PG17 rehearsal CF04 → CF08 → CF09 → CF10: `PASS_CONTENT_FACTORY_10_PG17`, including
  all-DRAFT / 1-of-7 / 6-of-7 / 7-of-7 READY gate tests, a `REQUIRED` REVIEW re-close test, direct
  base-table queries under RLS, legacy-unmanaged parity, answer-leak = 0, no publish pointer, no
  assessment membership, and negative collision tests for every table above.
- Fixture mirrors production constraints and RLS, including staff-only RLS on the question-bank
  layer (`question_revisions`, `question_options`, `question_targets`,
  `official_question_answers`, `question_option_rationales`).
- Content-factory contract tests: 39/39 PASS. Typecheck: PASS.
- Full regression: 276/278 PASS (same two previously triaged category-B expectations).
- CF10-R4 migration SHA256:
  `52dfed80c2622c702b56939d8cfb563d988b14d147b13724b1071db27a37ebad`

R3=BLOCKED_PARTIAL_READY_LESSON_SCOPE_LEAK
R4=SOURCE_CANDIDATE
FINAL_VERDICT=PASS_CONTENT_FACTORY_10_R4_SOURCE_READY
PRODUCTION_WRITES=0
