# QB02 Import Contract Oracle 50

Status: normative test oracle; no writer is implemented by this package.

Scope: question-bank import parsing, normalization, preview, validation, and future apply review.

Evidence base: repository at `93127008143fc9ab1e37096c47a60cf93809dcda`.

## Normative language and decision labels

`MUST`, `MUST NOT`, `SHOULD`, and `MAY` are normative. Decisions are deliberately classified as `READY_TO_APPROVE`, `NEEDS_OWNER_DECISION`, or `DEFER_TO_P1`. `READY_TO_APPROVE` is a proposed contract, not approval on the owner's behalf.

## Sources reviewed and current-state inventory

- `scripts/content-import/validate-content-package.mjs` and its declaration: offline/read-only package validation, 01–09 discovery, required columns, duplicate codes, references, resource types, and 1-based `correct_index` checks.
- `src/lib/content-import/*`: server dry-run, validation, template catalogue, constants, and types.
- `src/routes/_authenticated/admin.import.tsx` and `src/components/admin/*Import*`: authenticated admin surface, template download, dry-run and history UI.
- `public/content-import-templates/01..09` plus README, and the older `public/import-templates/01..12` family.
- Existing import runbooks/reports under `docs/`, QB-01 schema source, source tests, and canonical payload fixture.

Current limits are 5 MiB per uploaded workbook, 1,000 parsed data rows, and 10 valid preview rows. Current dry-run accepts `.xlsx`, validates server-side, and does not write. The local package validator has no equivalent byte/row cap. No question-bank import writer, preview/apply token protocol, resumability mechanism, or error workbook exists. These absences are requirements for future implementation, not behavior supplied here.

The numbered files are 01 subjects, 02 units, 03 lessons, 04 book contents, 05 explanations, 06 resources, 07 lesson assessments, 08 assessment-question links, and 09 questions. Dependency execution/display order is **01 → 02 → 03 → 04 → 05 → 06 → 09 → 07 → 08** because questions must exist before assessment links.

## Canonical target: `official_normalized_v1`

The normalized document MUST have this shape. Array order is semantic and zero-based internally.

```json
{
  "contract": "official_normalized_v1",
  "question_code": "Q-MATH-001",
  "revision": {
    "status": "DRAFT",
    "interaction_type": "SINGLE_CHOICE",
    "grading_mode": "AUTO_SINGLE",
    "question_text": "...",
    "stimulus_text": null,
    "max_score": 1,
    "allow_partial": false
  },
  "options": [{ "option_code": "A", "body": "...", "sort_order": 0, "is_correct": false }],
  "accepted_answers": [{ "answer_text": "...", "normalized_answer": "...", "sort_order": 0 }],
  "solutions": [],
  "solution_steps": [],
  "media": [],
  "targets": [{ "target_type": "LESSON", "target_code": "lesson-code", "is_primary": true }],
  "provenance": { "source_contract": "official_flat_v0", "source_row": 2 }
}
```

Allowed `interaction_type`: `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `SHORT_TEXT`, `LONG_TEXT`. Allowed `grading_mode`: `AUTO_SINGLE`, `AUTO_TEXT`, `MANUAL`. `SINGLE_CHOICE/AUTO_SINGLE` requires 2–6 options and exactly one correct option. `SHORT_TEXT/AUTO_TEXT` requires at least one accepted answer and no options. `LONG_TEXT/MANUAL` has no correct option or accepted answer. Imported revisions remain `DRAFT`; import MUST NOT approve or publish.

## Target primary semantics

When both subject and lesson codes are supplied, the lesson target MUST be `is_primary: true` and the subject target MUST be `is_primary: false`. When only a subject code is supplied, the normalized document MUST contain exactly one `SUBJECT` target with `is_primary: true` and MUST NOT invent a phantom lesson target.

## Complete source mappings

Blank means absent, not an empty semantic value. Headers are trimmed and compared as ASCII case-insensitive exact identifiers after BOM removal. Unknown columns produce `UNKNOWN_COLUMN`; security-sensitive unknown columns (`id`, UUID pointers, role/status/publish fields) block the file.

### `teacher_flat_ar_v0`

| Source field          | Target                   | Transform                                                                                                 |
| --------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| `رمز_السؤال`          | `question_code`          | Unicode NFC, trim; preserve case for display, compare canonical case-folded key                           |
| `نص_السؤال`           | `revision.question_text` | NFC, line-ending normalization; never formula-evaluate                                                    |
| `نوع_السؤال`          | interaction/grading      | `اختيار_واحد`→`SINGLE_CHOICE/AUTO_SINGLE`; `نص_تلقائي`→`SHORT_TEXT/AUTO_TEXT`; `مقالي`→`LONG_TEXT/MANUAL` |
| `الخيار_١..الخيار_٦`  | `options[].body`         | Arabic digit in header maps to 1..6; compact trailing blanks only                                         |
| `رقم_الإجابة_الصحيحة` | `options[].is_correct`   | accepts ASCII or Arabic-Indic integer 1..6, then subtracts one exactly once                               |
| `الإجابات_المقبولة`   | `accepted_answers`       | split LF only; trim, NFC, stable de-duplicate                                                             |
| `الشرح`               | `solutions[0].body`      | absent if blank                                                                                           |
| `الدرجة`              | `revision.max_score`     | normalize Arabic digits/decimal separator; finite positive decimal                                        |
| `السماح_بالجزئي`      | `revision.allow_partial` | strict `نعم/لا` or `TRUE/FALSE`, never truthiness                                                         |
| `رمز_المادة`          | subject target context   | exact code lookup                                                                                         |
| `رمز_الدرس`           | primary lesson target    | exact code lookup and must belong to subject when both supplied                                           |
| `رابط_الوسائط`        | `media[0].url`           | HTTPS allowlist policy; no fetch during preview                                                           |
| `نوع_الوسائط`         | `media[0].media_type`    | required when URL is present                                                                              |
| `نص_بديل`             | `media[0].alt_text`      | required for image media                                                                                  |

### `official_flat_v0`

| Source field                           | Target / transform                                                |
| -------------------------------------- | ----------------------------------------------------------------- |
| `question_code`                        | `question_code`, canonical duplicate comparison                   |
| `question_text`                        | `revision.question_text`, NFC and safe text                       |
| `interaction_type`                     | strict canonical enum                                             |
| `grading_mode`                         | strict canonical enum and compatible pair                         |
| `option_1..option_6`                   | ordered options A..F with zero-based `sort_order`                 |
| `correct_index`                        | source is **1-based**, ASCII/Arabic-Indic accepted; subtract once |
| `accepted_answers`                     | LF-delimited accepted answers                                     |
| `explanation`                          | `solutions[0].body`                                               |
| `stimulus_text`                        | `revision.stimulus_text`                                          |
| `max_score`                            | positive finite decimal                                           |
| `allow_partial`                        | strict boolean lexical mapping                                    |
| `subject_code`, `lesson_code`          | target lookup; lesson/subject consistency required                |
| `media_url`, `media_type`, `media_alt` | one media record after URL policy validation                      |

### `legacy_flat_15col`

The positional format MUST contain exactly 15 visible columns in this order; header aliases do not change position: `code`, `lesson_code`, `subject_code`, `question`, `answer_a`, `answer_b`, `answer_c`, `answer_d`, `correct_index`, `explanation`, `question_type`, `year`, `semester`, `sort_order`, `media_url`.

| Position | Target / transform                                                                                 |
| -------: | -------------------------------------------------------------------------------------------------- |
|        1 | `question_code`                                                                                    |
|      2–3 | lesson and subject target codes                                                                    |
|        4 | `revision.question_text`                                                                           |
|      5–8 | options A–D                                                                                        |
|        9 | **legacy source is 0-based** (0..3); do not subtract                                               |
|       10 | `solutions[0].body`                                                                                |
|       11 | `mcq`→`SINGLE_CHOICE/AUTO_SINGLE`; `auto_text`→`SHORT_TEXT/AUTO_TEXT`; `manual`→`LONG_TEXT/MANUAL` |
|    12–14 | provenance metadata (`year`, `semester`, `source_sort_order`), not revision semantics              |
|       15 | media URL with media type inferred only from a safe extension; ambiguous type is blocking          |

Legacy `auto_text` cannot encode accepted answers without an explicitly approved convention and therefore returns `LEGACY_INFORMATION_LOSS` (`NEEDS_OWNER_DECISION`). Legacy manual rows map without answer material. Extra, hidden, or reordered columns are file-blocking.

## Parsing and validation contract

The future parser MUST reject macro-enabled formats, encrypted files, external workbook links, formulas in any populated cell, merged cells intersecting the data region, hidden data sheets, hidden rows with data, and hidden required/semantic columns. It MUST inspect ZIP central-directory metadata before inflation, impose compressed/uncompressed and entry-count limits, and never resolve filesystem paths from workbook content. XLSX relationships and media URLs are data only and MUST NOT be fetched during preview.

Limits proposed for approval: `.xlsx` only; ≤5 MiB compressed file; ≤20 MiB total uncompressed XML; ≤200 ZIP entries; ≤1,000 data rows; ≤64 KiB per text cell; ≤256 columns; one visible data sheet plus optional visible instructions sheet. Limit breaches are file-blocking. Empty rows do not count; hidden populated rows do count toward limits and cause rejection.

Formula/CSV injection indicators (`=`, `+`, `-`, `@`, tab, CR at the first non-whitespace character) MUST be rejected for semantic input. Any downloadable error CSV/XLSX MUST neutralize all attacker-controlled cells with a leading apostrophe and MUST not preserve formulas. Unicode MUST be valid UTF-8/XML, NFC-normalized for canonical comparison, and reject NUL, unpaired surrogates, bidi override/isolate controls, and noncharacters. Arabic-Indic (`٠١٢٣٤٥٦٧٨٩`) and Eastern Arabic-Indic (`۰۱۲۳۴۵۶۷۸۹`) digits are accepted only in declared numeric fields; mixed numeral scripts in one token are rejected.

Preview responses are privileged editor data and MUST never reach student/public caches, logs, analytics, URLs, or client-visible error telemetry because correct answers and explanations are present. Authorization is checked server-side at upload, preview, and apply; content editor permission may draft, while publish permission is separate.

## Atomicity and lifecycle decision register

| Topic                 | Proposed invariant                                                                                                                        | Classification         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| file-level atomic     | One transaction per apply; any row failure rolls back every row and audit state records failure outside content transaction               | `READY_TO_APPROVE`     |
| row partial success   | Disabled; no checkbox or implicit partial mode                                                                                            | `READY_TO_APPROVE`     |
| preview token         | Opaque, single-use capability bound to actor, tenant/scope, contract, normalized content hash, authorization snapshot, and expiry ≤15 min | `READY_TO_APPROVE`     |
| apply token           | Separate idempotency key, minted only from a successful preview and consumed atomically                                                   | `READY_TO_APPROVE`     |
| content hash          | SHA-256 over a versioned canonical serialization of normalized rows and attachment manifest; compare constant-time                        | `READY_TO_APPROVE`     |
| retry                 | Same apply token + same hash returns the recorded result; changed hash is rejected                                                        | `READY_TO_APPROVE`     |
| resumability          | Not applicable inside an atomic file; upload transport resume is separate                                                                 | `DEFER_TO_P1`          |
| error workbook        | Sanitized, answer-restricted, short-lived artifact; exact format/retention needs owner choice                                             | `NEEDS_OWNER_DECISION` |
| rollback              | Automatic transaction rollback; no user-facing compensating rollback for successful imports in QB-02                                      | `READY_TO_APPROVE`     |
| duplicate import      | Same content hash/scope is replay-safe no-op; same code with changed payload never overwrites silently                                    | `READY_TO_APPROVE`     |
| duplicate-code policy | Reject, skip, or create a new draft revision requires product-owner choice; takeover is forbidden                                         | `NEEDS_OWNER_DECISION` |
| preview expiry        | 15 minutes proposed                                                                                                                       | `NEEDS_OWNER_DECISION` |

## Future Cursor QB-02 review checklist

- [ ] Diff contains no unrelated migration and preserves these contract names/version identifiers.
- [ ] All three adapters produce only `official_normalized_v1`; mapping tests cover every source and target field.
- [ ] `correct_index` conversion is exactly once: teacher/official 1-based, legacy 0-based.
- [ ] Parser applies byte, ZIP, entry, row, column, and cell limits before costly work.
- [ ] Formulas, macros, external links, hidden data, merged data cells, and malformed Unicode are rejected.
- [ ] Media and relationship targets cannot cause network access or path traversal during validation.
- [ ] Subject/lesson lookups are scoped and cross-relationship consistency is checked.
- [ ] Upload, preview, and apply independently authorize; import cannot grant roles or publish.
- [ ] Preview/apply tokens bind actor, scope, expiry, contract, hash, and auth snapshot.
- [ ] Apply recomputes canonical hash immediately before an atomic transaction.
- [ ] Replay returns the original result; changed payload/token combinations fail.
- [ ] Duplicate question codes cannot overwrite an existing question or published revision.
- [ ] Preview/error artifacts never expose answer keys outside authorized editor surfaces and are not cached.
- [ ] Error exports neutralize spreadsheet formulas and omit secrets/tokens.
- [ ] All validation codes come from the registry and severity/blocking matches it.
- [ ] The complete JSON oracle test passes; all security threat IDs and supported types are covered.
- [ ] Failure injection proves no partial writes; concurrency tests prove no TOCTOU/code takeover.
- [ ] Logs are metadata-only, redact content/answers/tokens, and retain actor plus content hash.
- [ ] Owner decisions remain feature-gated until explicitly recorded.

## Oracle usage

`QB02-IMPORT-VALIDATION-CODES-50.json` is the closed error/warning vocabulary. `QB02-IMPORT-TEST-VECTORS-50.json` is implementation-independent: adapters are judged by exact normalized output for positive cases and exact code/blocking/security expectations for adverse cases. The static test validates schema, IDs, code references, contract/type/mapping/index/security coverage, and the minimum vector count without executing SQL or connecting to a database.
