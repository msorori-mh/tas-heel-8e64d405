# QUESTION-BANK-OFFICIAL-DESIGN-01

التصميم الرسمي — متوافق مع **QB-01 Design Freeze** (`docs/QB-01-DESIGN-FREEZE-DECISION-07.md`).

| حقل | قيمة |
|---|---|
| القرار المعماري | **NORMALIZED_WITH_COMPATIBILITY_LAYER** |
| Design freeze | QB-01-DESIGN-FREEZE-DECISION-07 |
| Runtime baseline audited | `9d6eb603fead085f8fa86f29647a8c5e51cab2af` |
| Docs base HEAD | `6e35245ed73eb4c3c8ea76a2c010d8e4d7b0348c` |
| Migration apply | **NO** (هذه الحزمة توثيق فقط) |

---

## 1. المعمارية

**New revision SoT → Legacy cache فقط** عبر `qb_sync_question_legacy` (ذري).
لا Dual Write من العميل.
`lesson_assessments` / `exam_templates` يُعاد استخدامهما — لا `question_sets` موازٍ في الإطلاق الأول.

---

## 2. الهوية والنسخ

| طبقة | الكيان |
|---|---|
| منطقي | `questions` (`id`, `code`, `current_published_revision_id`, …) |
| نسخة | `question_revisions` (محتوى السؤال + grading_mode + stimulus_text + …) |

حالات Revision: `DRAFT` | `READY_FOR_REVIEW` | `APPROVED` | `PUBLISHED` | `SUPERSEDED` | `REJECTED`.

قواعد: Published/used immutable؛ التعديل = revision جديدة؛ إعادة الاستيراد بـ `question_code` = DRAFT جديد؛ `updated_at` ≠ versioning؛ لا hard-delete لتاريخ المحاولات.

---

## 3. Revision-scoped children

ترتبط بـ **`question_revision_id`**: options، accepted_answers، solutions، media، rubrics.
`question_targets` على **`question_id`** في P0 (استهداف منهج مستقر).

SoT للصحة: `option_code` + `is_correct` على النسخة.
**ممنوع** إبقاء خيارات/حلول قابلة للتغيير على logical id مع ادعاء Immutable.

---

## 4. أنواع الأسئلة و`grading_mode`

فرّق: `educational_label` / `interaction_type` / `grading_mode`.

| | |
|---|---|
| P0 | `SINGLE_CHOICE`, `SHORT_TEXT`, `LONG_TEXT` |
| P1 | `TRUE_FALSE` |
| مؤجل | MULTI_SELECT، NUMERIC، MATCHING، … وبقية قائمة الـ26 |

`grading_mode`: `AUTO_SINGLE` | `AUTO_TEXT` | `MANUAL`.
PARSE/EXTRACT/EXPLAIN لا تُحوَّل تلقائياً إلى MCQ.

---

## 5. correct_index — مغلق

```text
Runtime / Legacy cache: 0-based
Legacy Excel / dry-run: 1-based
Official import: option_code only
Excel 1-based → option_code → is_correct → sync cache 0-based
```

لا تحويل صامت. لا `OWNER_DECISION_REQUIRED` لهذه الاتفاقية.

---

## 6. Attempt pinning — Model A

`exam_session_questions`: يثبت `question_revision_id` + نص السؤال + stimulus + `rendered_options` + `option_order_mapping` + hash.
الإجابات ترتبط بالـ snapshot؛ MCQ عبر `selected_option_code`؛ النص عبر `response_text` — **ليس** `selected_index` كـ SoT.
المحاولات القديمة: `pin_mode=LEGACY`؛ لا إعادة تفسير درجات.

---

## 7. إجابات وحلول وتصحيح يدوي

- Model answer / hint / explanation على revision.
- `question_accepted_answers` لـ SHORT_TEXT/AUTO_TEXT فقط.
- تدفق يدوي: `PENDING_MANUAL_REVIEW` → مراجعة → `FINALIZED` + `question_response_reviews` audit.
- الجلسة: `submitted_pending_grading` / `partially_graded` / `completed`.
- لا كتابة صامتة لمقالي في `user_progress.quiz_score`.

---

## 8. Stimulus / Media

`stimulus_text` على revision.
`question_media` revision-scoped؛ bucket تصميمي `question-media` (غير مُنشأ هنا)؛ `alt_text_ar`؛ `requires_media` يمنع النشر بلا ملف صالح.

---

## 9. Capabilities (بدون enum reviewer/grader)

`can_edit_question_bank` | `can_review_question_content` | `can_publish_question_revision` | `can_grade_manual_response` | `can_read_hidden_solutions`

P0: تُبنى على `is_content_staff` / admin. المصحح لا يعدّل البنك.

---

## 10. عقد الاستيراد

`question_code` إلزامي؛ لا id يدوي؛ Excel in = DRAFT|READY_FOR_REVIEW؛ رفض Published؛ Apply = DRAFT فقط حتى QB-05؛ adapters تعلن اتفاقية correct_index؛ فارغ/- → NULL في legacy adapters؛ صف مزاح يُرفض.

---

## 11. أمن

طالب: بلا `is_correct` / accepted / solutions قبل السياسة.
REVOKE PUBLIC؛ SECURITY DEFINER + `search_path`؛ deny-by-default RLS. انظر مصفوفة freeze §15.

---

## 12. مبادئ

Arabic-first · Mobile-first · Offline-aware · Weak Internet Optimized · RLS-first · Idempotent Imports · Dry Run Before Write · Auditability · Immutable published revisions · New→Legacy only
