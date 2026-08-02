# QB02 Import Security Threat Model 50

## Assets and trust boundaries

Assets are question/answer confidentiality, draft and published revision integrity, curriculum scoping, editor authorization, audit evidence, service availability, and deterministic replay. Boundaries are: untrusted workbook → bounded parser; parser → normalized preview; authorized browser → server endpoints; preview store → apply transaction; import service → question-bank write API; and server → downloadable error artifact. Workbook cells, filenames, ZIP paths, relationships, URLs, cached formula results, and legacy codes are attacker-controlled.

The importer is an administrative ingestion boundary, not a trusted batch job. A valid spreadsheet is not authorization. Preview is sensitive because it includes answer material. The future writer must use a narrowly privileged server path and may create drafts only.

## Threat register

| ID                            | Threat                                                            | Required control                                                                    | Failure               |
| ----------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------- |
| `T01_ANSWER_LEAK`             | Answer/explanation leaks in preview, logs, cache, or error export | editor-only response; `no-store`; field redaction; no content analytics/logging     | file block / incident |
| `T02_FORMULA_INJECTION`       | XLSX formula executes or cached result is trusted                 | reject every formula cell; never calculate                                          | file block            |
| `T03_CSV_INJECTION`           | exported attacker text becomes spreadsheet formula                | apostrophe-neutralize `= + - @ TAB CR`; export as text                              | safe export           |
| `T04_PATH_TRAVERSAL`          | ZIP/relationship/local media path escapes sandbox                 | reject absolute, drive, UNC, `..`, encoded traversal; no extraction to caller paths | file block            |
| `T05_MEDIA_URL_POISONING`     | SSRF, credentials, script/data/file URL, DNS rebinding            | HTTPS allowlist, no preview fetch, canonical host/IP checks at controlled fetcher   | row block             |
| `T06_DUPLICATE_CODE_TAKEOVER` | existing code silently overwritten                                | scoped uniqueness, explicit owner policy, never implicit update                     | file block            |
| `T07_CROSS_SUBJECT`           | target question linked to wrong subject                           | scoped lookup plus target ownership check                                           | row block             |
| `T08_CROSS_LESSON`            | lesson exists but belongs to another subject/tenant               | assert lesson→subject relationship                                                  | row block             |
| `T09_UNAUTHORIZED_IMPORT`     | non-editor imports                                                | server authorization at every phase                                                 | file block            |
| `T10_PRIVILEGE_ESCALATION`    | workbook fields set role/status/publisher                         | deny sensitive columns; draft-only service API                                      | file block            |
| `T11_IMPORT_REPLAY`           | token/request repeats content                                     | atomic idempotency key and recorded result                                          | no duplicate write    |
| `T12_PARTIAL_WRITE`           | failure leaves subset committed                                   | single transaction, injected-failure tests                                          | rollback all          |
| `T13_STALE_VALIDATION`        | references or permissions change after preview                    | bind auth/reference snapshot and revalidate at apply                                | apply block           |
| `T14_TOCTOU`                  | payload/code changes between preview and apply                    | canonical hash binding, locking/unique constraints                                  | apply block           |
| `T15_HASH_MISMATCH`           | apply bytes normalize differently or are swapped                  | versioned canonical hash recomputed before write                                    | apply block           |
| `T16_INDEX_BASE`              | 1-based source treated as 0-based or twice converted              | contract-specific adapter and boundary tests                                        | row block             |
| `T17_NUMERAL_AMBIGUITY`       | Arabic/English digit confusion                                    | numeric-field-only normalization; reject mixed scripts                              | row block             |
| `T18_HIDDEN_DATA`             | hidden rows/columns conceal payload                               | inspect and reject populated hidden rows/semantic columns/sheets                    | file block            |
| `T19_MERGED_CELLS`            | merged cells change row meaning                                   | reject merges in data region                                                        | file block            |
| `T20_WORKBOOK_FORMULAS`       | formula/cached value bypasses text checks                         | inspect formula metadata, not displayed value                                       | file block            |
| `T21_OVERSIZED_CELLS`         | memory/UI/log exhaustion                                          | 64 KiB decoded text limit before normalization/logging                              | file block            |
| `T22_ZIP_BOMB`                | compression bomb/entry flood                                      | central-directory ratio, entry, compressed/uncompressed caps                        | file block            |
| `T23_XLSX_EXTERNAL_LINKS`     | parser/fetcher follows relationship                               | reject external relationships; disable resolution                                   | file block            |
| `T24_MACROS`                  | VBA/active content                                                | `.xlsx` only; reject macro parts/content types                                      | file block            |
| `T25_MALFORMED_UNICODE`       | spoofing, parser split, control injection                         | strict decode, NFC, reject invalid/control/noncharacter sequences                   | row/file block        |

## Abuse flows and verification

High-risk chain: an attacker obtains editor credentials, uploads a workbook containing hidden formula-driven answer data and an SSRF media URL, previews it, changes an existing question code, then replays a stale token. Defense must be layered: independent authorization, structural active-content rejection, semantic validation, scoped duplicate protection, no network fetch, token/hash binding, apply-time revalidation, atomicity, and replay storage. No single workbook validation result authorizes a write.

Security tests use `security_expectation` as a machine-readable assertion. `deny_before_parse` means authorization or outer byte/type checks prevent parser work; `reject_file` and `reject_row` require no normalized record to reach a writer; `redact_answers` asserts confidentiality; `no_network` asserts zero DNS/HTTP; `rollback_all` asserts transactional failure; `replay_same_result` asserts idempotency.

## Residual risks and decisions

- Media host allowlist and whether media is copied, proxied, or merely referenced: `NEEDS_OWNER_DECISION`.
- Duplicate code handling for a permitted editor: `NEEDS_OWNER_DECISION`; silent replacement remains forbidden regardless.
- Error workbook format/retention/access expiry: `NEEDS_OWNER_DECISION`.
- Antivirus/CDR scanning beyond structural XLSX controls: `DEFER_TO_P1`.
- Large-file asynchronous import/resume: `DEFER_TO_P1`.
- Atomic file application, draft-only output, token/hash binding, authorization at all phases, and no network during preview: `READY_TO_APPROVE`.

## Security acceptance gate

Release is HOLD until all T01–T25 vectors pass, owner decisions are explicitly recorded and feature-gated, concurrency/failure injection demonstrates atomicity and TOCTOU resistance, and an independent review confirms that answer-bearing responses and artifacts are unavailable to students and public caches.
