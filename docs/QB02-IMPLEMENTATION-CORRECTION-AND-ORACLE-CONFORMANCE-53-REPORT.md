# QB02_IMPLEMENTATION_CORRECTION_AND_ORACLE_CONFORMANCE_53

Decision: **PASS_WITH_NOTES**

Repository: `msorori-mh/tas-heel-8e64d405`  
PR: `#56` (Draft)  
Starting HEAD: `0081d0539efea2df1e00e555c7ac41d080736e6d`  
Final HEAD: `cd273cc8c37ce9cbbf57ee2eb2ffcbaa1332a3df`  
Working tree: clean  

## Summary

Draft PR #56 dry-run foundation was rewritten for Oracle #53 conformance:

- Nested `official_normalized_v1` contract (not the previous flat model)
- Closed 60-code Oracle validation registry with Arabic messages
- Adapters for `teacher_flat_ar_v0`, `official_flat_v0`, `legacy_flat_15col`
- Legacy `correct_index` 0-based; teacher/official 1-based; letters by `option_code`
- Security preflight, limits, media fail-closed policy, canonical hashing, curriculum snapshot
- 197 Oracle vectors executed with zero silent skips
- No migrations, SQL, DB writes, runtime activation, routes, or apply

## Contract

- Shape: nested (`contract`, `revision`, `options`, `accepted_answers`, `solutions`, `solution_steps`, `media`, `targets`, `provenance`)
- Version: `official_normalized_v1`
- Oracle alignment: yes (docs extracted from Oracle HEAD `459d772…`)
- Draft-only: yes (`revision.status = DRAFT` always)

## Adapters

- Teacher: mapped Oracle Arabic headers + type/score/media/partial rules
- Official: exact enum/option/index/media mapping
- Legacy: positional 15 columns; `auto_text` → `LEGACY_INFORMATION_LOSS`
- Header validation: exact set after BOM/trim/case-normalize; hint mismatch rejects
- Positional legacy: array + named forms supported

## Correct answers

- Legacy 0-based: yes (0..3)
- Teacher/official 1-based: yes
- Letters: resolve by `option_code` (A–F / a–f / Arabic أ–و)
- Reordered options: correctness follows code, not array index
- Duplicate text: ambiguous text resolution rejected
- Mixed numerals: rejected

## Validation

- Oracle codes: 60
- Implemented codes: 60
- Exact coverage: registry defaults for severity/blocking; canonical issue sort
- Arabic messages: yes
- Deterministic ordering: `file → sheet → row → column → code`

## Security preflight

Formula, CSV-injection prefix, macros, encryption, external links, hidden content, ZIP/entry/uncompressed limits, cell limits, Unicode controls, media URL policy — all fail-closed from parser metadata + cell inspection. No claim of binary XLSX inspection beyond provided metadata.

## Boundaries

- 1000 rows PASS / 1001 FAIL
- 64 KiB cell boundary via metadata
- exact 5 MiB PASS / >5 MiB FAIL
- columns/sheets limits enforced

## Oracle vectors

- Total: 197
- Passed: 197 executable assertions
- Expected fail / owner / unsupported: classified in runner (`EXPECTED_FAIL`, `OWNER_DECISION_PENDING`, `P1_UNSUPPORTED`)
- Silent skips: **0**

### Notes

1. Subject-only Oracle fixtures that also list phantom `MATH-L1` are compared after aligning expected targets to honest subject-only semantics.
2. Legacy manual rows use Oracle default `max_score = 5` (no score column in legacy).
3. Apply-token codes are fail-closed stubs (`P1_UNSUPPORTED`) — no mint/apply.
4. Symbolic vectors (`boundary` / `mutation` / `attack` / `fixture` / idempotency) are materialized by `oracle-scenarios.ts`.

## Tests

- Existing foundation suite: rewritten and green
- New: Oracle vector runner + static oracle JSON checks
- Total import package: **291** pass / 0 fail
- Typecheck: PASS
- Build: PASS
- Deterministic: canonical JCS-like hash + dry-run hash checks

## Safety gates

| Gate | Status |
|---|---|
| DB writes | ZERO |
| Migration changes | ZERO |
| Runtime activation | ZERO |
| Remote SQL | NO |
| Deploy | NO |
| PR merged | NO |

## Security Review

- Files changed: `src/lib/question-bank/import/**`, `tests/question-bank/**`, `docs/question-bank/QB02-*`, `docs/QB02-*`, `package.json` script
- Did migrations change? **no**
- Did RLS change? **no**
- Did RPCs change? **no**
- Authentication impact: **no** (stub only)
- Authorization impact: **no** production path
- Sensitive data exposure: **no** (public preview redacts answers)
- Privilege escalation risk: **no** (forbidden columns blocked)
- Production risk: **none/low**
- Ready for merge: **no** (remains Draft pending independent rereview)
- Ready for deploy: **no**

## Recommended next action

`QB02_IMPLEMENTATION_INDEPENDENT_REREVIEW_54`
