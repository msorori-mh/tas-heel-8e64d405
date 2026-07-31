# QUESTION-BANK-TEMPLATE-COMPATIBILITY-MATRIX-01

بعد HOLD-CORRECTION-11 / Design Freeze.

| طبقات | teacher_flat_ar_v0 · official_flat_v0 · legacy_flat_15col · official_normalized_v1 (TARGET ONLY) |

---

## correct_index (مغلق)

```text
Excel / dry-run: 1-based
→ option_code
→ question_options.is_correct (revision)
→ Legacy cache questions.correct_index = 0-based
```

Official normalized: **لا عمود correct_index**. ممنوع التحويل الصامت.

---

## Accepted answers P0

| Policy | QB-01 |
|---|---|
| EXACT | ALLOWED |
| TRIM | ALLOWED |
| TRIM_COLLAPSE | ALLOWED |
| CASEFOLD_AR | **DEFERRED_TO_P1 / NOT ALLOWED IN QB-01** |

Ambiguity / diacritics / hamza folding → MANUAL.

---

## Payload hash (مغلق)

```text
PAYLOAD_HASH_DECISION: PASS
canonical_payload_v1 + JCS RFC 8785 + UTF-8 + LF + SHA-256 hex
```

- Missing keys forbidden; missing values → `null`.
- Empty string ≠ null; empty array ≠ null.
- Array order: option_code / (sort_order+normalized_answer+policy) / solution_code / media_code / …
- Golden vectors: `docs/QUESTION-BANK-PAYLOAD-HASH-GOLDEN-VECTORS-01.md`.

لا تُعرض حقول الـHash لفريق المحتوى.

---

## Backfill classification (مغلق)

```text
INVALID > HISTORICAL_OR_ACTIVE_USAGE > UNUSED_VALID
```

| Excel / legacy row issue | Import/backfill outcome |
|---|---|
| Empty question_text / bad options / OOB correct_index / ambiguous correct | `HOLD_ROW` |
| Valid + SQL usage evidence | R1 `PUBLISHED` |
| Valid + verified unused | R1 `DRAFT` |
| Valid + unverifiable usage path | `HOLD_REVIEW` |

`status=Published` / «متاح» من Excel **مرفوض كفعل نشر** — النشر فقط عبر `publish_question_revision`.

---

## حقول تقنية لا تُعرض لفريق المحتوى

```text
selected_index
selected_option_code (internal mapping)
payload_hash / payload_hash_version
question_revision_id
logical_question_id
attempt_pin_mode
exam_session_question_id
practice_attempt_question_id
session_grading_status
```

المحتوى يرى: question_code، نص السؤال، خيارات، إجابات مقبولة نصية، حالات DRAFT/READY_FOR_REVIEW فقط عند الاستيراد.

---

## حقول → هدف (مختصر)

| Source | Target | Decision |
|---|---|---|
| question_code | questions.code | SUPPORTED_P0 |
| id numeric | — | REJECTED |
| options / option_* | question_options (revision) | NORMALIZED |
| correct_index | → option_code (adapters) | LEGACY_ADAPTER_ONLY |
| acceptable_answers | question_accepted_answers | SUPPORTED_P0 |
| explanation/hint | question_solutions | SUPPORTED_P0 |
| context_text | stimulus_text | SUPPORTED_P0 |
| media | question_media | SUPPORTED_P0 |
| answer_data | — | REJECTED (user UX) |
| Published/متاح | — | REJECTED as publish |
| is_repeated | derived | DERIVED |

---

## أنواع

P0: SINGLE_CHOICE / SHORT_TEXT / LONG_TEXT. P1: TRUE_FALSE. الباقي DEFERRED.

---

## Target retarget (مغلق مع ملاحظات)

```text
TARGET_SCOPE_DECISION: PASS_WITH_NOTES
```

LESSON/UNIT/SUBJECT يجب أن تطابق التسلسل الهرمي؛ لا Cross-grade صامت؛ يؤثر على المستقبل فقط.
