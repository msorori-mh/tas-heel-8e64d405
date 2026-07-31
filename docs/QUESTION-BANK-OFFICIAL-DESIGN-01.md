# QUESTION-BANK-OFFICIAL-DESIGN-01

التصميم الرسمي المتوافق مع البنية الحالية لبنك أسئلة الثانوية.

| حقل | قيمة |
|---|---|
| القرار المعماري | **NORMALIZED_WITH_COMPATIBILITY_LAYER** |
| أساس التدقيق | `docs/QUESTION-BANK-CURRENT-ARCHITECTURE-AUDIT-01.md` |
| HEAD المرجعي | `9d6eb603fead085f8fa86f29647a8c5e51cab2af` |
| Migration في هذه المهمة | **NO** |

---

## 1. القرار المعماري

### الخيارات المقيَّمة

| خيار | الحكم |
|---|---|
| `EXTEND_EXISTING_TABLE_ONLY` | مرفوض كحل نهائي — لا يغطي multi-correct / targets / rubrics / stimuli بأمان |
| `FULL_REPLACEMENT` | مرفوض الآن — يكسر exams + lesson quiz + practice + import |
| `DUAL_WRITE_TRANSITION` (كتابة حرة من العميل لكلا المصدرين) | مرفوض — خطر SoT مزدوج |
| **`NORMALIZED_WITH_COMPATIBILITY_LAYER`** | **معتمد** |

### الأسباب

1. الواجهات وRPCs تعتمد `options`/`correct_index`/`explanation` اليوم.
2. القالب الرسمي المقترح يحتاج تطبيعاً (Options/Solutions/Targets/…).
3. أمن الإجابات يعتمد column grants + SECURITY DEFINER — يجب الحفاظ عليه.
4. يمكن إضافة جداول جديدة مع **مزامنة أحادية** نحو Legacy كـ cache مشتق حتى اكتمال QB-08.

---

## 2. مخطط الكيانات (المرحلة المستهدفة)

```text
questions (hub — يبقى)
  ├── question_targets          (SUBJECT | UNIT | LESSON, is_primary)
  ├── question_options          (option_code, body, sort_order, is_correct)
  ├── question_solutions        (model_answer, explanation, hint, common_mistakes, reveal_policy)
  ├── question_solution_steps   (اختياري)
  ├── question_rubrics          (للمقالي — مؤجل تشغيلياً)
  ├── question_stimuli          + question_stimulus_links
  ├── question_media            (metadata → Storage)
  └── (legacy cache على questions.options / correct_index / explanation / lesson_id / subject_id)

question reuse in sets (الكيانات الحالية تُبقى):
  lesson_assessments + assessment_questions
  exam_templates + exam_template_questions
  (لا ننشئ question_sets موازياً في QB-01؛ نُقيّم لاحقاً كـ view/API فقط)
```

**مبدأ:** سؤال واحد، روابط أهداف متعددة، مجموعات اختبار تعيد الاستخدام عبر junctions القائمة.

---

## 3. تعريف الجداول الجديدة (تعاقدي — للتوثيق)

> التنفيذ الفعلي في حزم QB-* لاحقاً. مسودة SQL: `docs/migration-drafts/QUESTION-BANK-SCHEMA-FOUNDATION-01.NOT_APPLIED.sql`

### 3.1 `question_targets`

| عمود | نوع | قيد |
|---|---|---|
| id | uuid PK | |
| question_id | uuid FK → questions | ON DELETE CASCADE |
| target_type | text | `SUBJECT` \| `UNIT` \| `LESSON` |
| subject_id / unit_id / lesson_id | uuid nullable | يطابق النوع |
| is_primary | boolean | **قيود:** واحد primary لكل سؤال |
| created_at | timestamptz | |

الغرض: استبدال الاعتماد الوحيد على `questions.lesson_id`/`subject_id` مع الإبقاء عليهما كـ cache للرابط الأساسي أثناء الانتقال.

### 3.2 `question_options`

| عمود | نوع | قيد |
|---|---|---|
| id | uuid PK | |
| question_id | uuid FK | |
| option_code | text | فريد ضمن السؤال (A/B/C أو رموز) |
| body | text | |
| sort_order | int | |
| is_correct | boolean | |
| created_at | timestamptz | |

**سياسة أمن:** `is_correct` **لا يُمنَح** لـ `authenticated` SELECT. القراءة عبر RPC فقط.

### 3.3 `question_solutions`

| عمود | نوع | ملاحظة |
|---|---|---|
| question_id | uuid PK/FK | 1:1 ابتدائياً |
| model_answer | text | |
| explanation | text | يُزامَن → `questions.explanation` |
| hint | text | |
| common_mistakes | text/jsonb | |
| reveal_policy | text | `AFTER_ANSWER` \| `AFTER_SUBMIT` \| `NEVER_STUDENT` \| `STAFF_ONLY` |

### 3.4 وسائط / Stimulus (QB لاحق)

- `question_stimuli`, `question_stimulus_items`, `question_media`
- لا تُنفَّذ Storage policies في هذه المهمة.

### 3.5 إضافات اختيارية على `questions` (بدون حذف)

حقول آمنة للإضافة لاحقاً (nullable):

- `status` (`DRAFT` \| `READY_FOR_REVIEW` \| `PUBLISHED` \| `ARCHIVED`)
- `difficulty`, `default_points`, `time_limit_seconds`
- `interaction_type` (`SINGLE_CHOICE` …) — منفصل عن `question_type` legacy

**لا تُحذف:** `options`, `correct_index`, `explanation`, `lesson_id`, `subject_id` في أي حزمة قبل QB-09.

---

## 4. طبقة التوافق (إلزامية)

### 4.1 دور الحقول القديمة

| حقل Legacy | الدور في المرحلة 1–6 | الدور بعد QB-09 |
|---|---|---|
| `options` | **Cache مشتق** من `question_options` مرتب | مرشّح للحذف |
| `correct_index` | **Cache مشتق** (أول/وحيد is_correct) لـ RPCs الحالية | مرشّح للحذف |
| `explanation` | **Cache مشتق** من `question_solutions.explanation` | مرشّح للحذف |
| `lesson_id` / `subject_id` | **Cache** للهدف الأساسي | يُستبدل بـ targets |
| `unit` (text) | **Legacy نصي فقط** — انظر §4.1.1 | إيقاف قراءة ثم حذف لاحق |

**قاعدة ذهبية:** مصدر الحقيقة بعد Backfill = الجداول المطبّعة. Legacy للقراءة/RPCs القديمة فقط عبر sync.

### 4.1.1 مصير `questions.unit`

| قاعدة | القرار |
|---|---|
| الطبيعة | حقل نصي Legacy فقط — **ليس** مصدر حقيقة بعد تفعيل `question_targets` |
| الربط الرسمي للوحدة | عبر `question_targets.unit_id` عندما `target_type = 'UNIT'` |
| الاشتقاق المؤقت | يُملأ من عنوان/تسمية هدف UNIT الأساسي (أو ما يعادله) لأغراض توافق الواجهات القديمة فقط عبر `qb_sync_question_legacy` |
| كتابة الواجهة | **ممنوعة** مباشرة إلى `questions.unit` |
| Read-only | بعد اكتمال QB-02 وQB-07 |
| الإيقاف والتحقق | ضمن QB-09: إثبات عدم قراءة تشغيلية ثم قرار حذف |
| الحذف | **لا يُحذف** في QB-01 أو QB-02 |

الاسم النصي للوحدة غير كافٍ كمرجع دائم (تكرار/تغيير هجاء/غياب سلامة مرجعية). أي ربط وحدة رسمي يجب أن يستخدم `unit_id` داخل `question_targets`.

### 4.2 نموذج المزامنة المعتمد

**Sync من الجداول الجديدة → Legacy** عبر دالة/RPC ذرية واحدة (`qb_sync_question_legacy(question_id)`)، تُستدعى من:

- Apply الاستيراد
- حفظ لوحة الإدارة
- Backfill

**ممنوع:** كتابة الواجهة مباشرة إلى Legacy وNew كعمليتين منفصلتين بدون RPC.

للقراءة الانتقالية: الإبقاء على RPCs الحالية التي تقرأ Legacy؛ لاحقاً تُحدَّث لتقرأ المطبّع داخلياً مع نفس العقد الخارجي.

### 4.3 مراحل الانتقال

1. QB-01: إضافة البنية الجديدة (فارغة) + RLS صارم
2. QB-02: تشغيل طبقة التوافق (sync New → Legacy فقط)
3. QB-07: Backfill + Reconciliation من JSON/correct_index/explanation/lesson/subject/`unit` النصي
4. QB-03/04: تحويل الاستيراد للكتابة المطبّعة + sync (بعد نجاح QB-07 فقط)
5. QB-05: تحويل لوحة الإدارة
6. QB-06/08: تحويل واجهات الطالب/التصحيح تدريجياً
7. QB-09: إثبات صفر قراءة SoT من Legacy (بما فيها `questions.unit`)
8. Migration منفصلة لحذف Legacy (مستقبلاً فقط — ليست جزءاً من QB-01/02)

---

## 5. أنواع الأسئلة

| النوع | التصنيف الحالي |
|---|---|
| SINGLE_CHOICE | **مدعوم حالياً** (عملياً كل MCQ) |
| TRUE_FALSE | **قابل بدعم بسيط** (خياران) |
| MULTIPLE_CHOICE | **يحتاج محرك + schema** (multi is_correct) |
| SHORT_TEXT / LONG_TEXT | **مؤجل** (+ rubrics) |
| NUMERIC | **مؤجل** (+ tolerance) |
| MATCHING / ORDERING / TABLE_INPUT / IMAGE_LABELING / DRAWING_UPLOAD / CODE / CODE_OUTPUT | **مؤجل** — محرك عرض جديد |

`question_type` الحالي (`lesson` وغيرها) يبقى حقل legacy للتصنيف الإداري حتى يُستبدل بـ `interaction_type`.

---

## 6. Question Sets والاختبارات — القرار

| الاستخدام | الكيان المعتمد | هل نوحّد تحت `question_sets`؟ |
|---|---|---|
| تدريب/اختبار الدرس | `lesson_assessments` + `assessment_questions` | **لا الآن** — إبقاء |
| محاكي / تدريب / صارم | `exam_templates` + `exam_template_questions` | **لا الآن** — إبقاء |
| بنك المادة | أسئلة بـ target SUBJECT + فلترة | API/تجميع |
| مراجعة الوحدة | عبر دروس الوحدة / practice الحالي | إبقاء مسار practice |

**قرار:** لا نظام `question_sets` موازٍ في QB-01–04. إن لزم لاحقاً، يكون **واجهة تجميع/View** فوق junctions القائمة، وليس نسخ أسئلة.

---

## 7. سياسة ظهور الحل

| السياق | السياسة |
|---|---|
| Quiz درس (formative) | `AFTER_ANSWER` عبر `check_lesson_question` |
| تسليم quiz دفعة | `AFTER_SUBMIT` عبر `grade_lesson_quiz` |
| امتحان صارم/تدريبي | `AFTER_SUBMIT` فقط (`reveal` في session state) |
| تدريب وحدة | نتيجة بدون شرح حالياً — يمكن `AFTER_SUBMIT` لاحقاً |
| طالب قبل الموعد | **ممنوع** قراءة is_correct / model_answer / explanation |

---

## 8. الأمن وRLS (تصميم)

### صلاحيات المحتوى

- طالب: قراءة حمولة العرض فقط (نص + خيارات بلا `is_correct`).
- مصحح/معلم (إن وُجد دور): حلول حسب سياسة — حالياً يُقارب عبر content staff/admin.
- Content staff / admin فقط: إنشاء/تعديل/استيراد.
- لا كتابة من عميل الطالب إلى بنك الأسئلة.

### فصل الإجابات

- الإبقاء على **REVOKE عمودي** (وما يعادله على `question_options.is_correct` و`question_solutions.*`).
- RPCs SECURITY DEFINER للتصحيح والكشف.
- عدم وضع `is_correct` داخل JSON `options` المعروض للطالب.

### التدقيق

تسجيل في `import_jobs` / `import_errors` / `audit_logs`:

- الممثل، اسم الملف، hash، dry-run، أعداد الصفوف، created/updated/skipped، batch id، أسباب الرفض، وقت الاعتماد.

---

## 9. عقد الاستيراد الرسمي

```text
Upload → Parse → Normalize → Validate → Resolve Codes
  → Dry Run → Review → Atomic Apply → Post-Apply Verify → Audit Log
```

### شروط إلزامية

1. الرموز `code`/`slug` لا UUID يدوي في Excel.
2. لا نشر مباشر من Excel → حالات أولية `DRAFT` / `READY_FOR_REVIEW`.
3. Idempotent على `question_code`.
4. منع التكرار داخل الملف وDB.
5. تحقق علاقات الأوراق (targets/options/solutions).
6. مجموع الدرجات لمجموعات الاختبار.
7. إجابة صحيحة واحدة على الأقل للأسئلة الآلية (SINGLE).
8. **القالب الرسمي الجديد:** بدون عمود `correct_index` — يعتمد `option_code` + `is_correct`.
9. القالب التشغيلي الحالي `09_*` يبقى مدعوماً في مرحلة التوافق عبر محوّل إلى options + sync.
10. Apply داخل Transaction؛ خطأ حرج → ROLLBACK كامل.
11. وسائط: تحقق امتداد/حجم/استخدام؛ لا رفع يتيم.

---

## 10. تدفقات

### طالب

1. طلب أسئلة عبر RPC/SELECT الآمن
2. عرض عربي Mobile-first
3. إجابة
4. تصحيح خادمي
5. كشف الحل حسب السياسة
6. ضعيف الشبكة: لا تحميل وسائط ثقيلة قبل الحاجة؛ fallback نصي

### إدارة

1. استيراد dry-run
2. مراجعة الأخطاء
3. Apply ذري
4. مراجعة تحريرية
5. نشر (تغيير status) منفصل عن الاستيراد

### Offline / Weak Internet

- cache حمولة الأسئلة الآمنة (بدون مفاتيح) وفق سياسة PWA الحالية (امتحانات denylist).
- لا اعتماد offline لجلسات الامتحان الصارم.
- صور: thumbnail أولاً، signed URL عند الحاجة، alt text عربي.

### Storage (مقترح — بلا تطبيق الآن)

- bucket محتوى تعليمي موجود/مقترح للأسئلة: `question-media` (خاص).
- مسار: `{subject_code}/{question_code}/{file}`
- metadata في `question_media`؛ منع تنفيذي للامتدادات الخطرة في طبقة الاستيراد.

---

## 11. استراتيجية عدم كسر النظام

| مرحلة | واجهة الطالب القديمة | الامتحانات | الاستيراد |
|---|---|---|---|
| QB-01–02 | تعمل على Legacy | تعمل | dry-run كما هو |
| QB-03–04 | تعمل | تعمل | كتابة مطبّعة + sync |
| QB-05–06 | تعمل / RPCs تُحدَّث داخلياً | تعمل | كامل |
| QB-08 | تنتقل للقراءة المطبّعة الآمنة | تُحدَّث تدريجياً | — |
| QB-09 | بعد إثبات | بعد إثبات | إيقاف محوّل correct_index |

---

## 12. مبادئ حاكمة (مُلتزَم بها)

Arabic-first • Mobile-first • Offline-first (ضمن حدود الامتحان) • Weak Internet Optimized • RLS-first • Idempotent Imports • Dry Run Before Write • Auditability
