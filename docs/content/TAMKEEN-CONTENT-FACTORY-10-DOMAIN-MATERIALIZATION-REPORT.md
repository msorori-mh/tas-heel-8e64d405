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

FINAL_VERDICT=PASS_CONTENT_FACTORY_10_SOURCE_READY
PRODUCTION_WRITES=0
