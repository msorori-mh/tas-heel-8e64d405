# QUESTION-BANK-IMPLEMENTATION-PLAN-01

خطة تنفيذ مرحلية لبنك الأسئلة — حزم صغيرة، كل حزمة قابلة لـ PASS/HOLD.

| حقل | قيمة |
|---|---|
| القرار | NORMALIZED_WITH_COMPATIBILITY_LAYER |
| الاعتماد | وثائق AUDIT + DESIGN + MATRIX |
| Migration في هذه المهمة | **NO** |

---

## الترتيب التنفيذي الرسمي (مصدر الحقيقة للجدولة)

> الأرقام `QB-0x` تسميات وظيفية ثابتة. **ترتيب التنفيذ** أدناه هو الملزم عند التعارض مع أي رسم قديم.

```text
QB-01 Schema Foundation
QB-02 Compatibility Layer
QB-07 Legacy Backfill and Reconciliation
QB-03 Import Dry Run
QB-04 Atomic Apply
QB-05 Admin Review Workflow
QB-06 Student Safe Read API
QB-08 UI Migration
QB-09 Verification and Legacy Retirement
```

### قواعد الجدولة

1. **QB-07** يحمل رقماً وظيفياً تاريخياً، لكنه **يُنفَّذ مباشرة بعد QB-02** وقبل أي استيراد مطبّع.
2. **لا يبدأ الاستيراد الجديد (QB-03/QB-04)** قبل اكتمال Backfill وReconciliation في QB-07.
3. **لا تُعلَن الجداول الجديدة مصدر حقيقة تشغيلية** قبل نجاح التحقق من التطابق (عدّ + عيّنة تصحيح) في QB-07.
4. المزامنة المعتمدة بعد الانتقال: **New → Legacy فقط** عبر RPC ذري — لا Dual Write من العميل، ولا اعتماد `Legacy → New` كمسار كتابة مستمر بعد QB-07.
5. لا حذف لأعمدة Legacy (`options` / `correct_index` / `explanation` / `lesson_id` / `subject_id` / `unit`) قبل QB-09.

### خريطة الاعتماد (مطابقة للترتيب الرسمي)

```text
QB-01 Schema Foundation
  → QB-02 Compatibility Layer
    → QB-07 Legacy Backfill and Reconciliation
      → QB-03 Import Dry Run
        → QB-04 Atomic Apply
          → QB-05 Admin Review Workflow
          → QB-06 Student Safe Read API
            → QB-08 UI Migration
              → QB-09 Verification and Legacy Retirement
```

---

## QB-01 — Schema Foundation

| بند | محتوى |
|---|---|
| النطاق | جداول `question_targets`, `question_options`, `question_solutions` (+ steps اختياري)؛ أعمدة nullable على `questions` (`status`, `interaction_type`)؛ RLS صارم؛ **بدون** حذف Legacy؛ **بدون** كسر RPCs |
| الملفات | migrations جديدة؛ تحديث types؛ docs |
| migrations المتوقعة | نعم (لاحقاً بموافقة) — مسودة: `docs/migration-drafts/QUESTION-BANK-SCHEMA-FOUNDATION-01.NOT_APPLIED.sql` |
| الاختبارات | static + سلبية/إيجابية لأمن الأعمدة (انظر Acceptance أدناه) |
| المخاطر | قيود FK خاطئة؛ نسيان revoke عمودي؛ سياسات طالب واسعة |
| PASS | جداول موجودة، Legacy كما هو، exams/practice/quiz خضراء، **مصفوفة RLS/GRANT كاملة ومختبرة** |
| HOLD | أي تعديل يكسر SELECT allowlist الحالي أو يحذف أعمدة؛ **أو** مصفوفة RLS/GRANT غير كاملة/غير مختبرة للخيارات والحلول والأهداف |
| يعتمد على | لا شيء |

### Acceptance Criteria — RLS / GRANT (إلزامي لـ QB-01)

يجب استيفاء كل البنود قبل اعتبار QB-01 ناجحاً أو تطبيق هجرته:

- RLS enabled على جميع الجداول الجديدة.
- لا توجد سياسة طالب مباشرة على `question_solutions`.
- لا توجد سياسة طالب تسمح بقراءة `question_options.is_correct`.
- لا يحصل `authenticated` أو `anon` على SELECT للأعمدة السرية.
- قراءة الطالب تتم عبر View أو RPC آمنة ومحددة الأعمدة.
- وظائف SECURITY DEFINER تضبط `search_path` صراحة.
- EXECUTE يمنح فقط للأدوار المطلوبة.
- يتم REVOKE للـ PUBLIC قبل GRANT الانتقائي.
- مسؤولو المحتوى فقط يستطيعون INSERT/UPDATE.
- أي جدول بلا سياسة مناسبة يبقى deny-by-default.
- اختبارات سلبية تثبت رفض الطالب لقراءة الحلول والإجابات.
- اختبارات إيجابية تثبت أن RPC الآمنة تعيد نص السؤال والخيارات دون مفاتيح الإجابة.

**شرط HOLD صريح:** يُمنع تطبيق QB-01 إذا لم تكن مصفوفة RLS/GRANT كاملة ومختبرة للخيارات والحلول والأهداف.

---

## QB-02 — Compatibility Layer

| بند | محتوى |
|---|---|
| النطاق | RPC/دالة `qb_sync_question_legacy(question_id)`؛ كتابة مشتقة إلى `options` / `correct_index` / `explanation` / `lesson_id` / `subject_id` / `unit` (نص مشتق اختيارياً من هدف UNIT)؛ منع كتابتين غير متزامنتين من UI |
| الملفات | migration functions؛ اختبارات وحدة SQL/static |
| المخاطر | SoT مزدوج إن كُتب Legacy مباشرة بعد التفعيل |
| PASS | تحديث المطبّع ينعكس على Legacy؛ RPCs القديمة تصلح كما هي؛ الواجهة لا تكتب Legacy مباشرة |
| HOLD | اختلاف نتائج التصحيح قبل/بعد sync؛ أو Dual Write من العميل |
| يعتمد على | QB-01 |

---

## QB-07 — Legacy Backfill and Reconciliation

| بند | محتوى |
|---|---|
| النطاق | نقل كل صفوف `questions` → `question_options` / `question_solutions` / `question_targets`؛ اشتقاق `unit` النصي عند الحاجة؛ التحقق العددي؛ إعادة sync New→Legacy؛ تقرير reconciliation |
| الملفات | scripts one-shot (مشغّل بموافقة)؛ تقارير |
| المخاطر | خيارات فارغة؛ `correct_index` خارج النطاق؛ أسئلة بلا lesson/subject؛ اختلاف درجات |
| PASS | count مطابقة؛ عيّنة تصحح كما قبل؛ **إعلان SoT للمطبّع مسموح بعده فقط** |
| HOLD | فقدان بيانات أو اختلاف درجات أو فشل reconciliation |
| يعتمد على | QB-02 |
| ملاحظة التسمية | الرقم QB-07 تاريخي؛ **التنفيذ بعد QB-02 وقبل QB-03** |

---

## QB-03 — Import Dry Run

| بند | محتوى |
|---|---|
| النطاق | دعم وضعين: `legacy_flat_09` و`official_normalized_v1`؛ Validate/Resolve Codes؛ رفض `correct_index` في الوضع الرسمي؛ تقارير أخطاء بلا كتابة |
| الملفات | `src/lib/content-import/*`؛ preflight script؛ docs قوالب |
| المخاطر | قبول ملفات رسمية غير مكتملة الخيارات |
| PASS | dry-run يمر على عينات؛ لا DB writes |
| HOLD | غموض في تخطيط الأعمدة أو تعارض المصفوفة؛ أو محاولة تشغيله قبل نجاح QB-07 |
| يعتمد على | QB-07 (بعد اكتمال Backfill/Reconciliation) |

---

## QB-04 — Atomic Apply

| بند | محتوى |
|---|---|
| النطاق | Transaction: upsert questions + options + solutions + targets؛ استدعاء sync New→Legacy؛ تحديث `import_jobs`؛ ROLLBACK عند خطأ حرج |
| الملفات | server apply path / Edge أو RPC SECURITY DEFINER؛ admin import |
| المخاطر | تطبيق جزئي؛ تضارب codes؛ أداء ملفات كبيرة |
| PASS | إعادة نفس الملف idempotent؛ فشل صف حرج يمنع الكل (أو سياسة دفعات موثّقة) |
| HOLD | أي مسار service_role من العميل مباشرة؛ أو تطبيق قبل QB-07 |
| يعتمد على | QB-02, QB-03, QB-07 |

---

## QB-05 — Admin Review Workflow

| بند | محتوى |
|---|---|
| النطاق | حالات DRAFT → READY_FOR_REVIEW → PUBLISHED؛ مراجعة حلول/خيارات؛ منع نشر Excel مباشر |
| الملفات | `admin.questions.tsx` ومكوّنات مراجعة |
| المخاطر | عرض `is_correct` لغير المخوّلين |
| PASS | طاقم فقط يعدّل؛ طالب لا يرى مسارات الإدارة |
| يعتمد على | QB-04 |

---

## QB-06 — Student Safe Read API

| بند | محتوى |
|---|---|
| النطاق | RPCs/Views تعرض خيارات بلا `is_correct`؛ سياسات حلول حسب reveal؛ الإبقاء على عقد exams الحالي |
| الملفات | migrations RPC؛ عميل طالب إن لزم |
| المخاطر | تسريب عبر view؛ كسر `get_exam_session_state` |
| PASS | اختبارات أمنية + smoke؛ لا correct قبل التسليم |
| يعتمد على | QB-01, QB-02, QB-07 |

---

## QB-08 — UI Migration

| بند | محتوى |
|---|---|
| النطاق | إدارة تقرأ/تكتب المطبّع؛ واجهات طالب تبقى على RPCs؛ دعم TRUE_FALSE/تحضيرات MULTIPLE لاحقاً |
| الملفات | routes admin + exams/lessons حسب الحاجة |
| المخاطر | كسر Mobile UX؛ رجوع لـ select مباشر للإجابات |
| PASS | نفس سيناريوهات الامتحان/الدرس خضراء |
| يعتمد على | QB-05, QB-06 |

---

## QB-09 — Verification and Legacy Retirement

| بند | محتوى |
|---|---|
| النطاق | إثبات صفر اعتماد SoT على JSON وعلى `questions.unit` كنص مرجعي؛ إيقاف محوّل `correct_index` في الاستيراد الرسمي؛ Migration **منفصلة** لحذف أعمدة Legacy فقط بعد موافقة صريحة |
| الملفات | tests؛ migration مستقبلية |
| المخاطر | كسر مسارات قديمة غير مكتشفة |
| PASS | فترة مراقبة + اختبارات؛ ثم قرار حذف |
| HOLD | أي مسار إنتاج ما زال يكتب Legacy كـ SoT |
| يعتمد على | QB-08 |

---

## قائمة التنفيذ السريعة (بعد موافقة المالك)

1. QB-01
2. QB-02
3. QB-07 (Backfill + Reconciliation)
4. QB-03
5. QB-04
6. QB-05 / QB-06
7. QB-08
8. QB-09 (متأخر ومتعمد)

## خارج النطاق لكل الحزم حتى إشعار

- Deploy / Publish
- حذف بيانات QA (مهمة منفصلة)
- Storage policies جديدة دون حزمة وسائط
- أنواع MATCHING/CODE/…
- إنشاء `question_sets` موازٍ لـ `exam_templates`

## الحزمة التالية الموصى بها الآن

**QB-01** — بعد اعتماد المالك لهذه الوثائق ومراجعة مسودة SQL التوثيقية، وبشرط اكتمال مصفوفة RLS/GRANT قبل أي apply.
