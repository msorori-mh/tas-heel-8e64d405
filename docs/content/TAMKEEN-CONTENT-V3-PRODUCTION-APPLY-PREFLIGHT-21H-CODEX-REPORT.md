# TAMKEEN Content V3 — Production Apply Preflight 21H (Codex)

Date: 2026-08-19 (Asia/Riyadh)

## Executive verdict

`PASS_CODEX_PREFLIGHT_READY_PENDING_PG17`

The source-only preflight is ready for independent review. No production
migration, production data mutation, storage write, deploy, merge to `main`,
publish, or OAuth change was performed.

The final operational gates are a real PostgreSQL 17 rehearsal and the
production read-only baseline/visibility diff by the Production Operator.

## G0 — source lock

```text
CURRENT_R3_SOURCE_SHA=f42c22b9f013834b78347bf125d0742363dc27e0
CURRENT_R3_MIGRATION_SHA256=3D8CDD27A24EA9F0E998BA14E26ADCB87DD0FF6B62FCC3FBD9B790114DD631E3
LOCKED_SOURCE_SHA=f42c22b9f013834b78347bf125d0742363dc27e0
WORK_BRANCH=codex/21h-r4-release-metadata
WORKTREE=C:\projects\tas-heel-content-v3-21h-codex
CLEAN_START=YES
```

The requested SHA existed locally. The worktree was created directly from the
SHA; `main` was not checked out or modified.

## G1 — reports and contract extracted

The two required V3 reports were read completely. Their design is preserved:

| Contract | Result |
|---|---|
| Final student capabilities | `officialBookContent`, `tamkeenExplanationHtml`, `lessonSummaryHtml`, `mindMapHtml`, `labExperimentHtml`, `officialBookQuestions`, `selfTest` |
| Applicability | `REQUIRED`, `OPTIONAL`, `NA` |
| Readiness | `BOOK_READY`, `LEARNING_READY`, `ASSESSMENT_READY`, `FULLY_READY` |
| Question architecture | Existing Question Bank + Assessments/Targets; no second question system |
| Official answer layer | Server-only companion layer, revealed only after an authorized submitted attempt |
| HTML | Existing zip → preflight → security scan → CSP/bridge → managed-assets sandbox |
| Outside V3 | `originalBookPdf`, derived `studentPerformance`, optional `supportingResources` |
| Source baseline reported | 209/209 and `tsgo --noEmit` clean (not independently reproducible in this dependency environment) |

## G2 — migration inventory and revision

The source contains overlapping 20C copies plus the original 21F draft. The
old 20C full migration performs broad `READY` backfill based on row presence;
that is not sufficient evidence of historical student visibility. The old 21F
draft leaves the reveal RPC commented out, has nullable/unpinned answer rows,
and revokes the grants needed for its own admin RLS policies.

| File | SHA-256 | Purpose / finding | Apply decision |
|---|---|---|---|
| `supabase/migrations/20260817175640_96ac4baa-ef05-47d8-b6c8-c1dd5fe00f0f.sql` | `62E70F58D7ECCA37576EFD2EFE18FA990A374C669F6E56DDEB6E2B1F274B4CF4` | 20C lifecycle table, RPC, indexes, broad legacy-to-READY backfill | Do not use as the 21H apply bundle; historical source copy retained |
| `supabase/migrations/20260817175734_6eaeef43-4195-4a74-8923-794694f1c5bc.sql` | `82CDC9C50C75737A6024D2D9B4D0C40330EB2614702D7276D7414802F3D64174` | 20C grant reassertion | Superseded/overlapping |
| `supabase/migrations/20260817175754_7010857d-e670-4ced-bff9-4ff349b32645.sql` | `4F6A667F4FA2DE6E70CFDE081EC221C9CFE6EF263D1C3C19AE4B2923C163F6FF` | 20C authenticated grant churn | Superseded/overlapping |
| `supabase/migrations/20260817180713_d6e26173-b450-459a-a065-e7d878902b19.sql` | `1990091905D82A33F0CF94AA5D2D3E7773528EA1CDF7749DDE0A3C6E1B27B8CC` | 20C hardening/search_path/grants | Superseded/overlapping |
| `supabase/migrations-pending/20260822010000_lesson_capability_lifecycle_20c.sql` | `235841E9FD532032A22870F31F82B719C059DEEB2B3EF54B123D0E186850EA37` | Duplicate 20C table/RPC/backfill | Do not apply |
| `supabase/migrations-pending/20260822020000_lesson_capability_lifecycle_20c_grants_hardening.sql` | `4B35D3B6FB210C81523BBF99A9A05D5C8FA3645996A689F7EC9C4A2EADAC5498` | Duplicate 20C grant hardening | Do not apply |
| `docs/content/drafts/21F-capability-applicability-and-rationale.draft.sql` | `45B674574195D3E79F031F5AEFFF6051FB65EC0667291240169772E7F378F7D9` | Original 21F draft; no completed reveal RPC | Reference only; superseded |
| `supabase/migrations-pending/20260818210000_content_v3_21h_hardened_preflight.sql` | `3D8CDD27A24EA9F0E998BA14E26ADCB87DD0FF6B62FCC3FBD9B790114DD631E3` | Additive lifecycle/applicability + revision-pinned answer layer + safe initial/reveal RPCs | Only 21H apply candidate |

The revised candidate is transactional, has no destructive DDL, creates no
lifecycle backfill rows, and fails before DDL if an unsafe old answer-layer
shape is already present. Its only data update is deterministic applicability
normalization on existing lifecycle rows: simulation → `OPTIONAL`, and legacy
reference-only rows → `NA`.

## G3/G4 — schema and legacy mapping

The mapping is deterministic and lossless:

| V3 capability | Legacy source |
|---|---|
| `officialBookContent` | `lesson_book_contents` |
| `tamkeenExplanationHtml` | `lesson_explanations` / HTML explanation resource |
| `lessonSummaryHtml` | `lesson_summaries` / `quickReview` |
| `mindMapHtml` | `lesson_resources` mindmap, existing HTML pipeline |
| `labExperimentHtml` | `lesson_simulations` / experiment resource |
| `officialBookQuestions` | published Question Bank revision + existing lesson targets/assessments |
| `selfTest` | existing assessments/practice attempts, revision-pinned |

No legacy table or content row is deleted, renamed, or copied into a second
system. `supportingResources`, `originalBookPdf`, and
`studentPerformance` do not become required V3 journey steps.

The candidate deliberately leaves absent lifecycle rows absent. This preserves
the existing legacy visibility rule and avoids inventing `READY` evidence.

## G5 — 20C lifecycle preservation

`DRAFT`, `REVIEW`, and `READY` remain the same states. Student visibility is
READY-only, with the existing frozen `ready_snapshot` overlay preserving an
approved version while a new draft is edited. READY requires:

- `REVIEW → READY` only;
- a non-null snapshot and hash;
- an authenticated full-admin transition;
- an audit-log entry.

The postverify script explicitly stops on a `READY` row with neither
`ready_by` nor `ready_snapshot`, which detects the unsafe broad backfill in the
old 20C copies.

## G6/G7/G14 — question and self-test secrecy

The candidate provides:

- `get_lesson_official_questions(uuid)`: published revision only; explicit
  public-safe fields only (`id`, text, text-only options, sort order,
  `revision_id`); no `correct_index`, correctness, rationale, or model answer.
- `reveal_official_question_answer(uuid, uuid)`: fail-closed; caller-owned
  attempt; attempt and response both submitted; exact revision pin; V3
  capability gate; answer-layer row must exist.
- Answer rows are revision-pinned with composite foreign keys and immutable
  history triggers. Corrections require a new question revision.
- No answer/rationale rows are backfilled by the migration.

The TypeScript serializer now rejects additional answer-bearing keys including
`correct_answer`, `answer_key`, `hidden_explanation`, `solution`, and
`accepted_answers`. Empty submissions are denied before reveal. The V3 contract
now points the official-question capability at the revision-pinned RPC; the
legacy `get_lesson_quiz_questions` RPC remains a legacy surface and must not be
used as the V3 initial payload.

## G8 — RLS / grants matrix

| Object | ANON_READ/WRITE | AUTH_READ | AUTH_WRITE | CONTENT_STAFF | ADMIN | SERVICE_ROLE |
|---|---|---|---|---|---|---|
| `lesson_capability_lifecycle` | none | READY rows; staff may read all | none directly | transition RPC | transition approval RPC | all |
| `question_option_rationales` | none | RLS deny | RLS deny | deny | RLS-managed | all |
| `official_question_answers` | none | RLS deny | RLS deny | deny | RLS-managed | all |
| initial-question RPC | no execute | execute only after lesson access | n/a | same fail-closed access | same | explicit service use only |
| reveal RPC | no execute | execute, but owned submitted attempt required | n/a | no answer without owned attempt | same | explicit service use only |
| immutable trigger helper | no execute | no execute | no execute | no execute | no execute | trigger owner path |

All sensitive functions set `search_path = public, pg_temp`. RLS is enabled on
the three V3 tables. The postverify SQL checks PUBLIC/anon execute/read grants,
RLS enablement, and sensitive function search paths.

## G9 — static HTML security

The existing single sandbox pipeline is retained. Static profiles deny JS;
interactive profiles allow JS only inside the existing restricted sandbox and
bridge. The unified scanner continues to enforce CSP/managed assets, RTL,
responsive viewport, no CDN/external network, and answer-leak patterns. No new
bridge, CDN, storage path, or HTML package system was introduced.

## G10 — PG17

```text
PG17=BLOCKED_PG17_ENVIRONMENT
```

No local PostgreSQL 17 server or `psql` was available. No Docker or heavy tool
was installed. The complete local-only runner is:

`scripts/content-v3/pg17-runner.ps1`

It refuses non-local connection strings, requires server version 17, runs the
caller-supplied prerequisite files, the exact candidate, then postverify. It
has not been run against production.

## G11 — production read-only baseline

No safe production read-only credentials or Supabase CLI were available:

```text
PRODUCTION_READONLY=NOT_AVAILABLE
PRODUCTION_BASELINE_PENDING_OPERATOR=YES
```

The operator script is `scripts/content-v3/production-preflight-readonly.sql`.
It reports counts only for the requested tables, golden-lesson row presence,
schema object presence, and server version. It does not select PII, question
text, answers, or secrets.

## G12 — golden Quran lesson

Local approved source verification:

```text
LESSON_ID=16c10040-7a7b-4647-add2-4aa4d3f70583
LESSON_CODE=lesson-g10-001-001
STRUCTURED_BLOCKS=31
APPROVED_FIGURES=3
AUTO_PUBLISH=false
CONTENT_MUTATION=NONE
```

No summary, mind map, self-test, or answers were authored. The production
operator must compare the production content/hash with the approved manifest;
if absent, classify it as `CONTENT_GAP`, not `SYSTEM_GAP`.

## G13 — visibility diff

The deterministic SQL is `scripts/content-v3/visibility-diff-21h.sql`.
It compares capability-level predicates, not raw row counts, and classifies
`UNCHANGED`, `EXPECTED_GAIN`, `SECURITY_FIX`, `UNEXPECTED_GAIN`, and
`UNEXPECTED_LOSS`. The candidate's expected result is:

```text
VISIBLE_BEFORE = legacy predicate result
VISIBLE_AFTER_EXPECTED = VISIBLE_BEFORE
UNEXPECTED_VISIBILITY_GAIN = 0
UNEXPECTED_VISIBILITY_LOSS = 0
EXPECTED_GAIN = 0
```

The production operator must retain the before/after result sets. Any
unexpected gain or loss is a hard stop.

## G15/G16 — failure safety and performance

`IDEMPOTENT=YES` for object creation, grants, policies, indexes, and function
replacement. It intentionally does not silently replay content backfill;
there is no content backfill. Existing unsafe answer tables fail closed before
the migration proceeds. PostgreSQL transaction rollback covers the whole
candidate.

Risk assessment:

| Operation | Lock/risk | Duration class |
|---|---|---|
| additive enum/column | brief table metadata lock | LOW |
| lifecycle/answer tables and indexes | metadata + index build | LOW/MEDIUM |
| applicability normalization | row updates on existing lifecycle rows only | LOW for expected small lifecycle table |
| function/policy replacement | catalog lock | LOW |
| content backfill | none | LOW |

The operator must use the preflight counts to confirm the lifecycle row volume
before applying. No `CONCURRENTLY` index is required for the expected small
new tables, and the candidate remains one transaction.

## G17 — verification results

```text
V3_RELEVANT_TESTS=37/37 PASS
21H_STATIC_CONTRACT_TESTS=5/5 PASS
FULL_NPM_REGRESSION=NOT_REPRODUCED (worktree dependency install unavailable)
TYPECHECK=BLOCKED_BY_BASELINE_DEPENDENCY/TYPE_ERRORS; no touched V3 file error observed
BUILD=BLOCKED_BY_MISSING_DEPENDENCY (rou3)
PHYSICAL_ANDROID=NOT_REQUIRED
```

The source report's prior 209/209 result is retained as reported evidence, not
re-stated as an independently reproduced Codex run.

## STOP conditions

Stop before apply if any of the following occurs:

1. PostgreSQL is not version 17 or the runner is not local for rehearsal.
2. Any old 20C broad-backfill file is selected instead of the 21H candidate.
3. Existing answer tables have the old non-revision-pinned shape.
4. A READY lifecycle row lacks deterministic approval evidence.
5. The visibility diff reports unexpected gain/loss.
6. Any initial payload contains an answer key, correctness, rationale, or model answer.
7. Revision pinning or the owned submitted-attempt check fails.
8. Production read-only baseline is missing or schema prerequisites are absent.
9. Golden official content changes or is absent; classify content absence as `CONTENT_GAP`.

## Final Codex fields

```text
FINAL_VERDICT=PASS_CODEX_PREFLIGHT_READY_PENDING_PG17
CURRENT_R3_SOURCE_SHA=f42c22b9f013834b78347bf125d0742363dc27e0
CURRENT_R3_MIGRATION_SHA256=3D8CDD27A24EA9F0E998BA14E26ADCB87DD0FF6B62FCC3FBD9B790114DD631E3
SOURCE_SHA=f42c22b9f013834b78347bf125d0742363dc27e0
WORK_BRANCH=codex/21h-r4-release-metadata
MIGRATION_FILES=supabase/migrations-pending/20260818210000_content_v3_21h_hardened_preflight.sql
MIGRATION_SHA256=3D8CDD27A24EA9F0E998BA14E26ADCB87DD0FF6B62FCC3FBD9B790114DD631E3
PG17=BLOCKED_PG17_ENVIRONMENT
PRODUCTION_READONLY=NOT_AVAILABLE; PRODUCTION_BASELINE_PENDING_OPERATOR=YES
VISIBILITY_DIFF=READY_TO_RUN; EXPECTED_UNCHANGED; UNEXPECTED_GAIN=0; UNEXPECTED_LOSS=0
ANSWER_LEAK=PASS_STATIC_SOURCE_AND_SQL; RUNTIME_PENDING_OPERATOR/PG17
RLS=PASS_STATIC_CANDIDATE; POSTVERIFY_PENDING_PG17/PRODUCTION
TESTS=37/37 V3 RELEVANT + 5/5 21H STATIC PASS; FULL REGRESSION ENV-BLOCKED
TYPECHECK=ENV/BASELINE ERRORS; NO TOUCHED V3 FILE ERROR OBSERVED
BUILD=ENV-BLOCKED (missing rou3)
REPORT=docs/content/TAMKEEN-CONTENT-V3-PRODUCTION-APPLY-PREFLIGHT-21H-CODEX-REPORT.md
```

## R4 metadata closure addendum

R1/R2 migration identities are historical only:

```text
R1_MIGRATION_SHA256=E451B3F571D0DA197475BF44E793BF49B45F9CC08E822AC735C9D12FC1318F40
R2_MIGRATION_SHA256=78F8E642A8DB60CCA3909FCC0A7CB4124B753A122FAB92380E086EA85B02CD34
```

```text
QWEN_R3:
CRITICAL=0
HIGH hash identity finding=CLOSED
MEDIUM documentation consistency finding=CLOSED
QWEN_REVIEW_AFTER_R4=NOT_CLAIMED
```

This addendum closes metadata consistency only. It does not claim that Qwen
performed a review after R4.
