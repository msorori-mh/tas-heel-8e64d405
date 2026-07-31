# QUESTION-BANK-TEMPLATE-COMPATIBILITY-MATRIX-01

بعد HOLD-CORRECTION-09 / Design Freeze.

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

## حقول تقنية لا تُعرض لفريق المحتوى

```text
selected_index
selected_option_code (internal mapping)
payload_hash / payload_hash_version
question_revision_id
attempt_pin_mode
exam_session_question_id
practice_attempt_question_id
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
