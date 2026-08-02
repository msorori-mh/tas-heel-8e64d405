# QB02-OFFICIAL-NORMALIZED-V1-IMPORT-FOUNDATION-49 — Report

## Identity

| Field | Value |
|---|---|
| Repository | `msorori-mh/tas-heel-8e64d405` |
| Branch | `feat/qb02-official-normalized-v1-import-foundation-49` |
| Base | `origin/main` (post PR #48 merge `8134c61`) |
| Package | QB02-OFFICIAL-NORMALIZED-V1-IMPORT-FOUNDATION-49 |

## Prerequisite — QB-01 merge

| Field | Value |
|---|---|
| PR #48 | MERGED |
| Original HEAD | `93127008143fc9ab1e37096c47a60cf93809dcda` |
| Merge commit | `8134c610c41cb08a02f4deca48f6b3dfb4171a72` |
| Post-merge fresh replay ×2 | PASS |
| Remote SQL / deploy | ZERO / NO |

## Scope

Dry-run foundation only for question-bank Excel → `official_normalized_v1`.

### Included

- Contract `official_normalized_v1`
- Adapters: `teacher_flat_ar_v0`, `official_flat_v0`, `legacy_flat_15col`
- Correct-answer path: letter / 1-based index / Arabic digits / option text → `option_code` → `is_correct` → legacy **0-based** `correct_index`
- Stable validation codes + Arabic messages + error export model
- Dry-run pipeline: detect → adapt → validate → preview → summary → accepted_set_hash
- Fixtures + 100+ `node:test` cases
- Determinism: same input → same fingerprints/hashes

### Excluded (hard)

- DB INSERT/UPDATE
- New Supabase migrations
- Production / remote writes
- Runtime feature activation
- Changes to `/admin/import` content/structure dry-run lanes
- Changes to templates 01–09 contracts

## Module layout

```text
src/lib/question-bank/import/
  official-normalized-v1.ts
  validation-codes.ts
  errors.ts
  correct-answer.ts
  validate.ts
  dry-run.ts
  adapters/{detect,legacy-flat-15col,teacher-flat-ar-v0,official-flat-v0}.ts
  index.ts

tests/question-bank/import/qb02-import-foundation.test.ts
tests/fixtures/question-bank/import/legacy-flat-sample.json
```

## Correct-index contract

```text
Excel / adapters: 1-based (or A/B/C/D / Arabic digits / option text)
→ option_code
→ options[].is_correct
→ legacy_correct_index_0_based (derived only; never an Excel column on official_normalized_v1)
```

`correct_index = 0` from Excel is rejected as `QB_IMPORT_ZERO_BASED_INDEX_SUSPECT`.

## Validation codes (stable)

Includes required codes from the package brief plus extras:

`QB_IMPORT_REQUIRED_QUESTION_TEXT`, `QB_IMPORT_UNKNOWN_QUESTION_TYPE`, `QB_IMPORT_INVALID_CORRECT_OPTION`, `QB_IMPORT_DUPLICATE_QUESTION_CODE`, `QB_IMPORT_UNKNOWN_SUBJECT`, `QB_IMPORT_UNKNOWN_LESSON`, `QB_IMPORT_OPTION_COUNT_INVALID`, `QB_IMPORT_MANUAL_GRADING_REQUIRES_SOLUTION`, `QB_IMPORT_MEDIA_REFERENCE_MISSING`, `QB_IMPORT_COLUMN_SHIFT_DETECTED`, `QB_IMPORT_FORMULA_CELL_NOT_ALLOWED`, `QB_IMPORT_DUPLICATE_CONTENT`, …

Each issue returns: code, Arabic message, file, sheet, row, column, severity, row_blocking, file_blocking, suggested_fix.

## Tests

| Suite | Command | Result |
|---|---|---|
| Import foundation | `npm run test:question-bank-import` | ≥100 cases |

## Compatibility

| Surface | Impact |
|---|---|
| Content import 01–09 | Untouched |
| `/admin/import` | Untouched |
| Legacy `questions.correct_index` | Derived field only in normalized model |
| QB-01 schema / LEGACY runtime | Untouched |
| Migrations | None |

## Security Review

- Files changed: new TS import foundation + tests + docs + package.json script
- Did migrations change? **no**
- Did RLS / RPCs change? **no**
- Authentication / Authorization impact: **no**
- Sensitive data exposure: **no** (dry-run in-memory only)
- Privilege escalation risk: **none**
- Production risk: **none**
- Ready for merge: **Draft review only**
- Ready for deploy: **no**

## Recommended next action

`QB02_IMPORT_FOUNDATION_INDEPENDENT_REVIEW`
