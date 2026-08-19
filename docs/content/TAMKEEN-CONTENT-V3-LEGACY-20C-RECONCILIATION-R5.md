# TAMKEEN_CONTENT_V3_LEGACY_20C_RECONCILIATION_R5

Source-only remediation for `HOLD_PRODUCTION_PREFLIGHT`. **No production write was performed.**

## A — Classification of the 104 legacy READY rows

Measured read-only against production `lesson_capability_lifecycle`:

| capability | rows | class |
| --- | --- | --- |
| officialBookContent | 21 | legacy 20C, source content present, reconcilable |
| tamkeenExplanation | 40 | legacy 20C, source content present, reconcilable |
| originalBookPdf | 40 | retired capability under V3 (`NA`) |
| quickReview | 1 | legacy 20C, reconcilable |
| checkUnderstanding | 1 | legacy 20C, reconcilable |
| lessonAssessment | 1 | legacy 20C, reconcilable |

`ready_by` is present on only the rows that genuinely carry it (2 in the fixture mirror); none is invented.

## B — Visibility baseline

Visibility was measured inside `BEGIN … ROLLBACK` from the real predicates
(`can_access_lesson` → `can_access_subject` → `profiles.grade_uuid` + `curriculum_track_id`),
not from assumptions. Result: retiring `originalBookPdf` removes **0** student-visible
capabilities, because no lesson depends on it as its only content path.

## C — Remediation migration (candidate, unapplied)

`supabase/migrations-pending/20260819130000_content_v3_legacy_20c_reconciliation_r5.sql`
SHA256 `0ac77353daeddc702e8f1f697305943c664d9413bf6b4f0fe7a2d14715edf407`

- Adds provenance columns `evidence_origin`, `retirement_origin` with CHECK constraints.
- Pins a rebuilt `ready_snapshot` + `ready_hash` for legacy rows, stamped
  `evidence_origin = 'LEGACY_20C_VISIBLE_BASELINE'` — an explicit "grandfathered,
  not human-reviewed" marker. `ready_by`/`reviewed_by` are never fabricated.
- `v3_capability_snapshot_is_reconcilable()` gates the pinning: a capability whose
  source payload is empty cannot be pinned and is instead flagged
  `evidence_origin = 'NEEDS_MANUAL_REVIEW'`, which the READY evidence constraint rejects
  (production currently has 0 such rows).
- `originalBookPdf` rows are demoted to `REVIEW` with `retirement_origin = 'LEGACY_20C'`;
  no row and no underlying `lesson_resources` data is deleted.

## D — PG17 rehearsal

`scripts/content-v3/pg17/rehearse-r5.sh` runs Fixture → R5 → 21H (byte-for-byte,
SHA256 `3d8cdd27a24ea9f0e998ba14e26adcb87dd0ff6b62fcc3fbd9b790114dd631e3`) → Postverify → assertions
on a throwaway PostgreSQL 17.9 cluster.

```
FIXTURE_READY_ROWS=105          (104 production-matched + 1 unreconcilable negative row)
READY_WITHOUT_EVIDENCE=0
ORIGINAL_BOOK_PDF_V3_APPLICABLE=0
ORIGINAL_BOOK_PDF_ROWS=40 (deleted=0)
LIFECYCLE_ROWS_TOTAL=105
READY_BY_PRESENT=2 READY_BY_INVENTED=0
MANUAL_REVIEW_ROWS=1 (fixture-only; production=0)
VISIBILITY_GAIN=0 VISIBILITY_LOSS=0
ANSWER_LEAK=0
REVISION_PINNING_UNPINNED=0
HASH_NONDETERMINISM=0
RLS=PASS
PG17_REHEARSAL=PASS
```

Postverify on the rehearsed cluster: `visibility_runtime_gate` 64 ready/applicable,
41 denied, 40 excluded `NA`; answer layers empty; `lesson_resources_preserved=40`;
`rls_grants_expected=t`.

## E — Tests

- `tests/migrations/content-v3-legacy-20c-reconciliation-r5.test.mjs`: 9/9 pass
  (contract, no invented reviewer, reconcilability branch, fixture/assert gates).
- `tsgo --noEmit`: clean. Build: OK.
- Full vitest run: 276/278 pass. The 2 failures are pre-existing and unrelated to R5:
  admin delete dialogs added in the 20D/QURAN work (`no-direct-curriculum-delete`)
  and the `STUDENT_CAPABILITY_ORDER` tail assertion in the 21B4E contract test.

## Verdict

`FINAL_VERDICT=PASS_R5_SOURCE_READY_FOR_INDEPENDENT_REVIEW`

Applying R5 and 21H to production remains a separate, owner-approved gate.
