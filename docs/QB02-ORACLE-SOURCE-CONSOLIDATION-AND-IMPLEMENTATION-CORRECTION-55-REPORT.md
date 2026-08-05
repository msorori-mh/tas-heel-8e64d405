# QB02_ORACLE_SOURCE_CONSOLIDATION_AND_IMPLEMENTATION_CORRECTION_55

## Decision

**PASS_WITH_NOTES**

## Oracle PR (#53)

| Field | Value |
| --- | --- |
| Starting HEAD | `459d77217320ee0063d65bbd88ea56ca7109bffe` |
| Base before | `feat/qb-01-executable-migration-source-only-14` |
| Base after | `main` |
| Scope | Docs + Oracle integrity test only (6 files) |
| Integrity tests | `tests/question-bank/qb02-import-oracle-50.test.mjs` (full) |
| Merge commit | `37ca13666b720a1acba91f884910e4d0b35ad54c` (normal merge, not squash/rebase) |
| Phantom MATH-L1 | Corrected in Oracle fixtures as subject-only targets (`6f4af33`) |

## Implementation PR (#56)

| Field | Value |
| --- | --- |
| Starting HEAD | `6a726a499a8ac33025e29fdec597321b4163d7af` |
| Final HEAD | `d971c7f5883f1d55d3814cfc476c277c8424f873` |
| Branch | `feat/qb02-official-normalized-v1-import-foundation-49` |
| State | Draft, not merged |
| Scope | `src/lib/question-bank/import/**`, `tests/question-bank/**`, docs report, package deps |

## Oracle source

| Check | Result |
| --- | --- |
| Single source | Yes — Oracle docs/test from `main` after PR #53 |
| Duplicates removed | Yes — local Oracle copies yielded to main on merge |
| Full integrity test restored | Yes — 262-line `qb02-import-oracle-50.test.mjs` |
| Phantom fixture corrected | Yes — in Oracle itself, not Implementation expected output |

## Vectors (197)

| Kind | Count |
| --- | --- |
| REAL_ADAPTER | 42 |
| REAL_VALIDATOR | 0 |
| REAL_PREFLIGHT | 13 |
| REAL_BOUNDARY | 29 |
| REAL_MUTATION | 19 |
| PARSER_INTEGRATION | 0 *(CSV parser covered outside Oracle runner)* |
| P1_UNSUPPORTED_FAIL_CLOSED | 94 |
| OWNER_DECISION_PENDING | 0 |
| Fabricated | 0 |
| Silent skips | 0 |

Real behavioral (adapter+preflight+boundary+mutation) = **103**. Remaining **94** are honest fail-closed unsupported (real rejection via unsupported filetype preflight), not fabricated PASS.

## Mutation suite

| Field | Value |
| --- | --- |
| Total | 10 |
| Killed | 10 |
| Survived | 0 |

Covers: legacy 0-based index, letter→option_code, max rows 1000, max cell 64KiB, INVALID_SCORE registry, mixed numerals, NFC, unknown type rejection, invalid score non-coercion, cross-lesson curriculum denial.

## Parser

| Control | Status |
| --- | --- |
| XLSX | Implemented (ExcelJS + ZIP) |
| CSV | Implemented |
| Binary inspection | ZIP load + entry scan |
| ZIP | Entry count, uncompressed size, path traversal |
| Relationships | Conservative name detection; full XML target parse = P1 |
| Macros | `vbaProject.bin` detection |
| Encryption | Unreadable package → encrypted fail-closed |
| External links | Named-part detection; deep target parse = P1 |
| Hidden content | Sheets/rows/columns observed into metadata |
| Formula | Cell formulas + CSV injection markers |
| Limits | Wired to DEFAULT_IMPORT_LIMITS |
| Unsupported controls | Classified P1_UNSUPPORTED_FAIL_CLOSED; no false completeness |

## Curriculum

| Field | Status |
| --- | --- |
| Grade / Semester / Unit | Owner-gated — not in Oracle normalized target types |
| Subject / Lesson | Validated against catalog |
| Catalog required | Operational dry-run requires non-empty `catalog.subjects` |
| Cross-subject / cross-lesson | Fail-closed |

## Replay (in-memory dry-run only)

| Decision | Behavior |
| --- | --- |
| ACCEPTABLE_DRAFT | New code / new content |
| REPLAY_SAFE_NOOP | Same code + same content fingerprint |
| IMPORT_REPLAY_CONFLICT | Same code + different content |
| DUPLICATE_CONTENT | Different codes + same fingerprint (policy warning decision) |
| FILE_BLOCK | Duplicate code in file / other file-blocking |

No DB write.

## Canonicalization

| Field | Value |
| --- | --- |
| Comparator | Unicode code-point (`compareCodePoints`) |
| Locale independent | Tested en-US / ar-YE / tr-TR |
| Content fingerprint | `contentFingerprint` |
| Provenance hash | Excluded from content fingerprint; carried in row provenance |
| Accepted-set hash | Dry-run `accepted_set_hash` |
| Parser hash | `parser_result_hash` attestation |

## Tests

| Suite | Result |
| --- | --- |
| Import suite | 307 pass / 0 fail / 0 skip |
| Oracle integrity | Pass |
| QB-01 source | 37 pass |
| QB-01 hash | 12 vectors OK |
| Typecheck | Pass |
| Build | Pass |
| `git diff --check` | Pass |

## Boundaries enforced (behavioral)

1000/1001 rows, 64KiB cell, 5MiB file, column/ZIP limits via preflight + tests.

## Notes (PASS_WITH_NOTES)

1. Grade/semester/unit relationship validation awaits owner-approved Oracle target fields.
2. Deep OOXML relationship XML parsing remains P1 until a hardened XML reader is selected.
3. 94 Oracle vectors remain `P1_UNSUPPORTED_FAIL_CLOSED` by design (honest), not silent skips.
4. PR #56 stays Draft; PR #58 untouched; no deploy/runtime activation.

## Security Review

- Files changed: import foundation, parser, oracle runner, tests, report, `jszip` dependency
- Migrations changed: **no**
- RLS changed: **no**
- RPCs changed: **no**
- Authentication impact: **no**
- Authorization impact: dry-run authorized-subject + operational catalog required
- Sensitive data exposure: preview marked sensitive / `NO_STORE`
- Privilege escalation risk: **no**
- Production risk: **low** (dry-run foundation only)
- Ready for merge: **no** (await independent rereview)
- Ready for deploy: **no**

## Constraints honored

- DB writes: ZERO
- Migration changes: ZERO
- Runtime activation: ZERO
- SQL: NO
- Deploy: NO
- PR #56 merged: NO
- PR #58 modified: NO
- Force push: NO

## Recommended next action

`QB02_IMPLEMENTATION_INDEPENDENT_REREVIEW_56`
