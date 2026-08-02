# QB-02 Cursor Implementation Review Checklist 50

Reviewer: ______ Commit/PR: ______ Date: ______ Oracle version: `QB02-IMPORT-TEST-VECTORS-50`

This checklist reviews a future QB-02 implementation against the independent oracle. It does not approve unresolved owner decisions.

## Scope and contracts

- [ ] The implementation diff and deployment plan contain no unrelated changes.
- [ ] It declares and version-checks `teacher_flat_ar_v0`, `official_flat_v0`, `legacy_flat_15col`, and `official_normalized_v1` exactly.
- [ ] Every source field in the oracle mapping manifest is handled explicitly; no positional or implicit fallback exists.
- [ ] Only normalized drafts are produced; import cannot approve or publish.
- [ ] Teacher and official indices convert 1-based → 0-based exactly once; legacy remains 0-based.
- [ ] `SINGLE_CHOICE/AUTO_SINGLE`, `SHORT_TEXT/AUTO_TEXT`, and `LONG_TEXT/MANUAL` invariants are enforced.

## Parser and limits

- [ ] Outer file type and compressed byte limit are checked before parsing.
- [ ] ZIP entry count, expansion ratio, and total uncompressed bytes are bounded before inflation.
- [ ] Row, column, and decoded-cell limits match the approved contract.
- [ ] Formula cells are rejected based on formula metadata even when a cached value exists.
- [ ] Macro parts, external links, encrypted workbooks, unsafe ZIP paths, and data-region merges are rejected.
- [ ] Hidden sheets, populated hidden rows, and hidden semantic columns are rejected.
- [ ] Unicode is strictly decoded/NFC-normalized and forbidden controls/noncharacters are rejected.
- [ ] Arabic-Indic and Eastern Arabic-Indic numeric input is contract-aware; mixed numeral scripts fail.
- [ ] Scientific notation cannot silently change identifiers or answer text.

## Authorization and confidentiality

- [ ] Upload, preview, and apply each perform fresh server-side authorization.
- [ ] Actor scope includes the target subject/lesson/tenant; cross-scope lookup cannot succeed.
- [ ] Input cannot set IDs, roles, status, approver, publisher, hashes, or audit fields.
- [ ] Answer-bearing preview uses `Cache-Control: no-store` and cannot reach student/public APIs.
- [ ] Logs, traces, analytics, URLs, exceptions, and error exports omit answers, explanations, tokens, and raw cells.
- [ ] Error CSV/XLSX neutralizes spreadsheet formulas in every attacker-controlled cell.
- [ ] Preview performs no DNS, HTTP, file relationship, or media fetch.

## Preview/apply integrity and atomicity

- [ ] Preview token is opaque, short-lived, single-use, and bound to actor, scope, contract, authorization snapshot, and canonical content hash.
- [ ] Apply uses a separate idempotency key and recomputes the versioned normalized hash.
- [ ] Changed bytes, normalization version, scope, permissions, references, or hash invalidate apply.
- [ ] Existing code plus changed payload cannot silently overwrite or take over a question.
- [ ] Same apply key/hash returns the original recorded result without an additional write.
- [ ] Same apply key with a different hash is rejected.
- [ ] One file applies in one transaction; injected failure at first/middle/final row rolls everything back.
- [ ] Concurrent apply tests prove uniqueness/locking closes the preview-to-apply TOCTOU window.

## Oracle execution

- [ ] `node --test tests/question-bank/qb02-import-oracle-50.test.mjs` passes.
- [ ] Every one of the 197 oracle vectors is connected to an executable adapter test.
- [ ] Exact normalized output is asserted, not snapshot-updated without review.
- [ ] Exact validation codes plus row/file blocking are asserted.
- [ ] T01–T25 each pass both independent security variants.
- [ ] Boundary tests cover 5 MiB, 1,000 rows, 64 KiB cells, 256 columns, and option/index limits.
- [ ] Performance tests report bounded memory/time without relaxing security limits.

## Owner decision gate

- [ ] Duplicate-code behavior is explicitly approved and recorded.
- [ ] Preview expiry is explicitly approved and recorded.
- [ ] Media allowlist/fetch/storage policy is explicitly approved and recorded.
- [ ] Error workbook format, retention, and access policy are explicitly approved and recorded.
- [ ] `DEFER_TO_P1` items are absent or feature-gated.

Final review decision: `PASS` / `PASS_WITH_NOTES` / `HOLD`

Notes and evidence links: ______
