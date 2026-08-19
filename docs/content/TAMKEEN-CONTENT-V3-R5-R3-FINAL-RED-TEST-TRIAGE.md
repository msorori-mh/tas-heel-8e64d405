# TAMKEEN — CONTENT V3 / R5-R3 FINAL RED TEST TRIAGE & APPLY GATE FREEZE

REVIEWED_SHA: 3659efec04f05c933edff6ecaf1d5eb760a5c70a
SCOPE: read-only triage. No production writes, no migration apply, no change to R5 or 21H.
PRODUCTION_WRITES = 0

## 1. tests/import/no-direct-curriculum-delete.test.ts

Command: `bunx vitest run tests/import/no-direct-curriculum-delete.test.ts`

Actual failure (1 of 3 assertions):

```
has zero direct PostgREST DELETE calls on curriculum tables
expected [ …(3) ] to deeply equal []
+ "src/components/admin/LessonExplanationsDialog.tsx → lesson_explanations"
+ "src/components/admin/LessonResourcesDialog.tsx → lesson_resources"
+ "src/lib/lessons/lesson-pdf-upload.server.ts → lesson_resources"
```

Provenance: neither the test nor the three offending files were touched by
R5/R5-R2/R5-R3 (`git log -1 -- …` → `cb9084f`, i.e. before this branch's work).
The three deletes were introduced by the explicitly approved admin task
"تمكين الأدمن من حذف الموارد الإضافية والشروحات" (admin-only, RLS-guarded,
supporting resources / explanations / uploaded lesson PDFs), not by a bypass of
`admin_curriculum_delete` (which is still the only path for
subjects/units/lessons/questions and remains asserted by the third test, PASS).

Classification: **B — historical expectation now invalid** (the guard was written
before admins were granted supporting-resource deletion). Not a security defect:
the deletes are admin-surface only and go through RLS; curriculum entities proper
are untouched.

## 2. tests/student/lesson-journey-no-original-pdf-21b4e.test.ts

Command: `bunx vitest run tests/student/lesson-journey-no-original-pdf-21b4e.test.ts`

Actual failure (1 of 13 assertions; the other 12 PASS):

```
9./10. officialBookContent first, assessment last among content steps
expected 'supportingResources' to be 'lessonAssessment'
```

Assertion-by-assertion analysis against R5:

| Assertion | Result | R5 relation |
| --- | --- | --- |
| 1. `originalBookPdf` out of FINAL/ORDER, legacy flag false | PASS | R5 retires the same capability set |
| 2. no original-PDF UI step | PASS | — |
| 3. PDF not in progress denominator | PASS | — |
| 4./5. readiness independent of the PDF | PASS | matches R5 snapshot contract |
| 8. supporting non-primary resources preserved | PASS | R5 retires `supportingResources` only from the V3 contract, data preserved |
| 9./10. ordering: assessment last | **FAIL** | not an R5 concern — `STUDENT_CAPABILITY_ORDER` is source-side (21G) |
| 11./12. visibility filtering | PASS | — |
| 13./14. 18B + 20C contracts | PASS | — |
| 15. 21B4B/C/D sources untouched | PASS | — |

Root cause: the 21G Content V3 student journey deliberately places
`supportingResources` **after** `lessonAssessment` (order: officialBookContent →
tamkeenExplanation → quickReview → mindMap → simulation → checkUnderstanding →
lessonAssessment → supportingResources → studentPerformance). The 21B4E-era
assertion "assessment is the last content step" predates that reordering.
`STUDENT_CAPABILITY_ORDER` is byte-identical at base `c36e302` and was last
modified in `cb9084f`, so the red is pre-existing and untouched by R5-R3.

Classification: **B — historical expectation superseded by the approved 21G V3
ordering.** Not A (no capability leaked, no PDF re-entry, no readiness/progress
impact), not C, not D.

## 3. Decision

SOURCE_CHANGE_REQUIRED = NO. Both reds are stale assertions against approved,
later decisions; changing R5, 21H, the contract or the admin delete surface to
satisfy them would regress approved behaviour. They are recorded here as known
red and left untouched under the "do not modify main without need" constraint.

## 4. Verification run at REVIEWED_SHA

| Gate | Command | Result |
| --- | --- | --- |
| R5 contract tests | `node --test tests/migrations/content-v3-legacy-20c-reconciliation-r5.test.mjs` | 20/20 PASS |
| Full regression | `bunx vitest run` | 276/278 PASS (only the 2 triaged reds; 56 "failed files" are `.mjs` `node:test` files under the vitest runner — known runner split, class C) |
| QB golden vectors | `node scripts/question-bank/verify-question-bank-hash-vectors.mjs` | 12/12 PASS (JCS canonicalize@3.0.0) |
| Typecheck | `bunx tsgo --noEmit` | PASS |
| Build | `bun run build` | PASS |

## 5. Migration hashes (unchanged)

- R5: `supabase/migrations-pending/20260819130000_content_v3_legacy_20c_reconciliation_r5.sql`
  SHA256 `4d7b1dc3ffd5154cecb3a49ade260b62534893d83876c582f988ab28b1b95cf3`
- 21H: `supabase/migrations-pending/20260818210000_content_v3_21h_hardened_preflight.sql`
  SHA256 `3d8cdd27a24ea9f0e998ba14e26adcb87dd0ff6b62fcc3fbd9b790114dd631e3`

FINAL_VERDICT = PASS_R5_R3_READY_FOR_PRODUCTION_SCHEMA_APPLY_GATE
