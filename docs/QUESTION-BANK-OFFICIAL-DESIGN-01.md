# QUESTION-BANK-OFFICIAL-DESIGN-01

التصميم الرسمي المتوافق مع Runtime الحالي + أدلة Excel الفعلية.

| حقل | قيمة |
|---|---|
| القرار المعماري | **NORMALIZED_WITH_COMPATIBILITY_LAYER** |
| Runtime baseline audited | `9d6eb603fead085f8fa86f29647a8c5e51cab2af` |
| Excel schemas observed | teacher_flat_ar_v0 · official_flat_v0 · legacy_flat_15col |
| official_normalized_v1 | **TARGET DESIGN ONLY — لا عيّنة Excel بعد** |
| Migration في هذه المهمة | **NO** |

---

## 1. القرار المعماري

| خيار | الحكم |
|---|---|
| EXTEND_EXISTING_TABLE_ONLY | مرفوض كنهائي — لا يغطي نص/accepted/media/targets بأمان |
| FULL_REPLACEMENT | مرفوض الآن — يكسر exams/quiz/practice |
| DUAL_WRITE من العميل | مرفوض |
| **NORMALIZED_WITH_COMPATIBILITY_LAYER** | **معتمد** — New → Legacy عبر RPC ذري فقط |

الكيانات الحالية `lesson_assessments` / `exam_templates` (+ junctions) **تُعاد استخدامها** — لا `question_sets` موازٍ في الإطلاق الأول.

---

## 2. أنواع الأسئلة — نطاق الإطلاق الواقعي

فرّق دائماً بين:

1. **الاسم التعليمي الظاهر** (مقالي، PARSE، إكمال فراغ…)
2. **`interaction_type` التقني**
3. **`grading_mode`**

```text
grading_mode:
  AUTO_SINGLE   — اختيار واحد / صح وخطأ
  AUTO_TEXT     — نص قصير بقواعد accepted answers صريحة
  MANUAL        — مصحح بشري (مقالي وغيرها)
```

### P0

| interaction_type | ملاحظات |
|---|---|
| SINGLE_CHOICE | MCQ؛ خيارات مطبّعة؛ تصحيح AUTO_SINGLE |
| SHORT_TEXT | يشمل إكمال الفراغ دلالياً عند الحاجة؛ AUTO_TEXT فقط بقواعد صريحة وإلا MANUAL |
| LONG_TEXT | مقالي؛ MANUAL؛ model answer + hint/explanation؛ **لا تدّعِ Rubric كاملاً من عيّنات Excel** |

- أسئلة الإعراب/الاستخراج/التعليل (PARSE/EXTRACT/EXPLAIN…) **لا تُحوَّل تلقائياً إلى MCQ**؛ تُعامل كـ LONG_TEXT/SHORT_TEXT + educational_label ما لم يوفّر القالب خيارات صريحة.

### P1

| TRUE_FALSE | خياران؛ AUTO_SINGLE |

### مؤجل

MULTIPLE_CHOICE/MULTI_SELECT، NUMERIC، MATCHING، ORDERING، TABLE_INPUT، IMAGE_LABELING، DRAWING_UPLOAD، CODE، CODE_OUTPUT، وبقية قائمة الـ26 غير المستخدمة بعيّنات كافية.

---

## 3. مخطط الكيانات (P0)

```text
questions (hub + legacy cache)
  ├── question_revisions          (أو ما يعادلها — انظر §7؛ حاجز قبل QB-01 إن تعذّر)
  ├── question_targets            (SUBJECT|UNIT|LESSON, is_primary)
  ├── question_options            (option_code, body, sort_order, is_correct)
  ├── question_accepted_answers   (SHORT_TEXT / AUTO_TEXT فقط في P0)
  ├── question_solutions          (model_answer, explanation, hint, common_mistakes?, reveal_policy)
  ├── question_media              (media_code, storage_path, alt_text_ar, mime_type, sort_order)
  └── stimulus_text               (نص اختياري على مستوى السؤال/التنقيح — P0 بسيط)

reuse:
  lesson_assessments + assessment_questions
  exam_templates + exam_template_questions
```

Stimulus مشترك متعدد الأسئلة: **ترقية لاحقة** (العيّنات تستخدم سياقاً لكل سؤال عبر `context_text`).

---

## 4. الإجابات والحلول

| مفهوم | التخزين | ملاحظات |
|---|---|---|
| Model answer | `question_solutions.model_answer` | MANUAL / مرجع مصحح |
| Accepted answers | `question_accepted_answers` | P0 لـ SHORT_TEXT/AUTO_TEXT فقط |
| Explanation / Hint | solutions | كشف حسب السياسة |
| Maximum score | points على السؤال/الربط | marks من Excel |
| Allow partial | metadata / grading | MANUAL أو قواعد نصية موثّقة |
| Simplified rubric | اختياري | **ليس** مدعوماً كاملاً من عيّنات Excel؛ حزمة قبل إطلاق تصحيح يدوي غني إن لزم |

`questions.explanation` يبقى **cache مشتق** أثناء التوافق.

---

## 5. التصحيح اليدوي (رسمي)

```text
Student submits response
  → status: pending_manual_review
Authorized grader reads response + permitted solution/rubric
  → records score + feedback
Optional second review/audit
  → final score immutable OR correction audited
```

| قاعدة | قرار |
|---|---|
| من يصحح؟ | **grader capability** — تُطابق في QB-01/05 على الأدوار الحالية (`admin` / `is_content_staff` أو توسيع لاحق). **لا تفترض** enum role اسمه `reviewer` موجوداً الآن |
| من يقرأ الحل النموذجي؟ | staff/grader حسب السياسة؛ ليس الطالب قبل الكشف |
| درجات جزئية | مسموحة عند `allow_partial` + MANUAL |
| Audit | كل تغيير درجة يُسجَّل (من، وقت، قيمة قديمة/جديدة، سبب) |
| طالب | لا يرى الحل/النموذج قبل سياسة الكشف |

---

## 6. Stimulus والوسائط (P0 أدنى)

| عنصر | قرار P0 |
|---|---|
| `stimulus_text` | اختياري لكل سؤال/تنقيح (من `context_text`) |
| وسائط السؤال | `question_media` منظم — ليس اسم ملف عشوائي فقط |
| حقول إلزامية للوسائط | `media_code`, `storage_path` (أو مرجع آمن), `alt_text_ar`, `mime_type`, `sort_order` |
| `requires_media` | إن true: منع النشر بلا ملف صالح + بديل وصفي؛ مع السماح بأن بعض الأسئلة لا تُحل دون صورة |
| التحميل | عند الحاجة؛ weak-internet: thumbnail أولاً |
| Offline | تضمين الوسائط المطلوبة ضمن ميزانية — لا استبعاد تلقائي دون قرار |
| Stimulus مشترك معقد | مؤجل |

---

## 7. استهداف الأسئلة (Resolve)

### UNIT

لا يُقبل رقم وحدة مجرد. أحد:

- `unit_code`، أو
- المجموعة الكاملة: `grade_code + semester + subject_code + unit_number`

### LESSON

- الرسمي: `lesson_code`
- Legacy adapter قد يقبل الاسم العربي **فقط** إذا التطابق فريد داخل `grade + semester + subject + unit` — وإلا **رفض ambiguous**

### is_repeated

مشتق من الروابط/الاستخدام — **ليس** مصدر حقيقة من القالب الرسمي.

### Legacy cache

`questions.lesson_id` / `subject_id` / `unit` (نص) = مشتقات من الهدف الأساسي عبر sync فقط.
`questions.unit` ليس SoT بعد تفعيل targets (انظر §8).

---

## 8. مصير الحقول القديمة

| حقل Legacy | الدور | بعد QB-09 |
|---|---|---|
| `options` | cache من `question_options` | مرشّح للحذف |
| `correct_index` | cache (تمثيل التخزين الداخلي الموثّق) | مرشّح للحذف |
| `explanation` | cache من solutions | مرشّح للحذف |
| `lesson_id` / `subject_id` | cache للهدف الأساسي | عبر targets |
| `unit` (text) | Legacy نصي مشتق مؤقتاً؛ **ليس SoT**؛ لا كتابة UI مباشرة؛ Read-only بعد QB-02+QB-07 | إيقاف ثم حذف لاحق |

المزامنة: **New → Legacy فقط** عبر `qb_sync_question_legacy` (ذري). ممنوع Dual Write من العميل.

---

## 9. النشر والنسخ (Versioning) — قرار صريح

حماية نتائج الطلاب تتطلب أكثر من `updated_at`.

**الاستراتيجية المفضّلة (ما لم يثبت تعارض قاتل مع exam attempts):**

```text
Published question revisions are immutable.
Editing a published/used question creates a new revision.
Exam attempts / session answers reference the exact revision used.
Option order and rendered payload are snapshotted when required.
```

مفاهيم:

- logical question identity (`question_code` / stable id)
- revision identity
- published revision / superseded / draft
- إعادة الاستيراد بـ `question_code` → تنقيح جديد لا طمس صامت لنسخة مستخدمة
- منع تعديل نسخة استُخدمت في محاولة اختبار

**حاجز:** إذا تعذّر دمج versioning بأمان مع `exam_session_answers.question_id` الحالية دون خطة هجرة واضحة → **HOLD قبل تطبيق QB-01** (موثّق في خطة التنفيذ). لا يُخفى.

---

## 10. عقد الاستيراد

```text
Upload → Parse → Normalize → Validate → Resolve Codes
  → Dry Run → Review → Atomic Apply (DRAFT only until QB-05)
  → Post-Apply Verify → Audit Log
```

قواعد إلزامية:

1. الرسمي لا يقبل ID رقمي يدوي.
2. `question_code` إلزامي في الرسمي/operational.
3. حالات Excel عند الإدخال: `DRAFT` | `READY_FOR_REVIEW` فقط.
4. `Published` يُرفض.
5. `متاح` يُرفض أو يُحوَّل في Legacy adapter فقط مع **تحذير**.
6. `فارغ` و`-` → NULL في Legacy adapters فقط.
7. صف فارغ بالكامل يُتجاهل؛ صف مزاح/غير متسق يُرفض.
8. `answer_data` غير مطلوب من المستخدم غير التقني.
9. `correct_index` **غير موجود** في official_normalized_v1؛ مسموح فقط في adapters مع اتفاقية معلنة.
10. `legacy_flat_15col` و dry-run التشغيلي: **1-based** (مثبت بالعيّنة والكود).
11. لا تحويل صامت 0↔1؛ التحويل إلى تمثيل DB الداخلي يُوثَّق في Apply.
12. الخيار الصحيح يُطبع إلى `option_code` + `is_correct`.
13. حتى اكتمال QB-05: **Apply ينشئ/يحدّث DRAFT فقط — لا نشر.**

---

## 11. الأمن

- طالب: نص + خيارات بلا `is_correct`؛ لا solutions/accepted/model قبل السياسة.
- Grader capability: قراءة حلول للتصحيح؛ لا كتابة بنك إلا لطاقم المحتوى.
- REVOKE عمودي + RPC SECURITY DEFINER + `search_path` صريح.
- لا الاعتماد على إخفاء الواجهة وحده.

---

## 12. مبادئ

Arabic-first · Mobile-first · Offline-aware · Weak Internet Optimized · RLS-first · Idempotent Imports · Dry Run Before Write · Auditability · Immutable published revisions
