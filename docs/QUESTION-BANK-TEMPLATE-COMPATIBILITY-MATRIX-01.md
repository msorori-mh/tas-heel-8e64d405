# QUESTION-BANK-TEMPLATE-COMPATIBILITY-MATRIX-01

مصفوفة توافق بعد **QB-01 Design Freeze**.

| حقل | قيمة |
|---|---|
| Design freeze | `docs/QB-01-DESIGN-FREEZE-DECISION-07.md` |
| طبقات | `teacher_flat_ar_v0` · `official_flat_v0` · `legacy_flat_15col` · **`official_normalized_v1` (TARGET ONLY)** |

قرارات الحقل: `SUPPORTED_P0` | `SUPPORTED_P1` | `DERIVED` | `NORMALIZED` | `LEGACY_ADAPTER_ONLY` | `REJECTED` | `DEFERRED`

---

## 0. طبقات

| الطبقة | ملاحظة |
|---|---|
| teacher_flat_ar_v0 | بلا question_code؛ status=متاح؛ `-` كثيف |
| official_flat_v0 | id رقمي؛ Published؛ Media؛ 26 types قائمة فقط |
| legacy_flat_15col | option_1..4؛ **correct_index 1-based** في العيّنة |
| operational_09 | dry-run 1-based 1–6 |
| official_normalized_v1 | TARGET؛ `option_code`؛ DRAFT/READY_FOR_REVIEW؛ بلا correct_index |

---

## 1. correct_index — مغلق

| مصدر | الاتفاقية |
|---|---|
| Runtime DB / UI / RPC | **0-based** |
| legacy Excel + dry-run | **1-based** |
| official_normalized_v1 | **لا عمود** — `option_code` + `is_correct` على revision |
| Sync legacy cache | يكتب **0-based** فقط |

```text
Excel 1-based → option position → option_code → is_correct
→ qb_sync_question_legacy → questions.correct_index (0-based)
```

ممنوع التحويل الصامت. **لا OWNER_DECISION_REQUIRED** لهذه الاتفاقية.

---

## 2. حقول → هدف (مختصر مجمّد)

| Source | Target | Decision |
|---|---|---|
| question_code | `questions.code` | SUPPORTED_P0 |
| id numeric | — | REJECTED |
| question_text | `question_revisions.question_text` | SUPPORTED_P0 |
| question_type | educational_label + interaction_type + grading_mode | NORMALIZED |
| option_* | `question_options` (revision) | NORMALIZED |
| correct_index | → option_code (adapters only) | LEGACY_ADAPTER_ONLY |
| correct_answer | option_code / model / accepted | NORMALIZED |
| acceptable_answers | `question_accepted_answers` (revision) | SUPPORTED_P0 |
| explanation / hint | `question_solutions` (revision) | SUPPORTED_P0 |
| context_text | `stimulus_text` on revision | SUPPORTED_P0 |
| question_image / Media | `question_media` (revision) | SUPPORTED_P0 |
| answer_data | — | REJECTED (user UX) |
| lesson_code | targets + resolve | SUPPORTED_P0 |
| unit number alone | — | REJECTED |
| lesson AR name | resolve if unique else reject | LEGACY_ADAPTER_ONLY |
| status Published/متاح | — | REJECTED as publish |
| is_repeated | derived | DERIVED |
| allow_partial | revision meta | SUPPORTED_P0 |

---

## 3. أنواع P0/P1

| Label | interaction_type | grading_mode | Decision |
|---|---|---|---|
| مقالي / essay | LONG_TEXT | MANUAL | P0 |
| إكمال فراغ / FILL | SHORT_TEXT (± semantic) | AUTO_TEXT if rules else MANUAL | P0 |
| اختيار / MCQ | SINGLE_CHOICE | AUTO_SINGLE | P0 |
| PARSE/EXTRACT/… | LONG/SHORT + label | MANUAL | لا MCQ تلقائي |
| TRUE_FALSE | TRUE_FALSE | AUTO_SINGLE | P1 |
| باقي الـ26 | — | — | DEFERRED |

---

## 4. أدوار الطبقات

| طبقة | دور |
|---|---|
| teacher_flat_ar_v0 | Legacy adapter؛ تطبيع `-`؛ رفض/تحذير متاح |
| official_flat_v0 | رفض id/Published؛ map Media عبر code |
| legacy_flat_15col | 1-based معلن؛ lesson_code؛ context/image |
| official_normalized_v1 | TARGET — revision fields؛ option_code؛ بلا correct_index |
