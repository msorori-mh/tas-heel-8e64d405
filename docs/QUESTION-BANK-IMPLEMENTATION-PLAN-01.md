# QUESTION-BANK-IMPLEMENTATION-PLAN-01

خطة تنفيذ مرحلية لبنك الأسئلة — حزم صغيرة، كل حزمة قابلة لـ PASS/HOLD.

| حقل | قيمة |
|---|---|
| القرار | NORMALIZED_WITH_COMPATIBILITY_LAYER |
| الاعتماد | وثائق AUDIT + DESIGN + MATRIX |
| Migration في هذه المهمة | **NO** |

---

## خريطة الحزم

```text
QB-01 Schema Foundation
  → QB-02 Compatibility Layer
    → QB-03 Import Dry Run (official + legacy modes)
      → QB-04 Atomic Apply
        → QB-05 Admin Review Workflow
        → QB-06 Student Safe Read API
          → QB-07 Legacy Backfill (يمكن موازاة جزئية مع 03 بعد 02)
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
| الاختبارات | static: لا GRANT لـ is_correct؛ لا DROP لـ options/correct_index؛ types compile |
| المخاطر | قيود FK خاطئة؛ نسيان revoke عمودي |
| PASS | جداول موجودة، Legacy كما هو، exams/practice/quiz خضراء |
| HOLD | أي تعديل يكسر SELECT allowlist الحالي أو يحذف أعمدة |
| يعتمد على | لا شيء |

---

## QB-02 — Compatibility Layer

| بند | محتوى |
|---|---|
| النطاق | RPC/دالة `qb_sync_question_legacy(question_id)`؛ كتابة مشتقة إلى `options`/`correct_index`/`explanation`/`lesson_id`/`subject_id`؛ منع كتابتين غير متزامنتين من UI |
| الملفات | migration functions؛ اختبارات وحدة SQL/static |
| المخاطر | SoT مزدوج إن كُتب Legacy مباشرة بعد التفعيل |
| PASS | تحديث options المطبّعة ينعكس على Legacy؛ RPCs القديمة تصلح كما هي |
| HOLD | اختلاف نتائج التصحيح قبل/بعد sync |
| يعتمد على | QB-01 |

---

## QB-03 — Import Dry Run

| بند | محتوى |
|---|---|
| النطاق | دعم وضعين: `legacy_flat_09` و`official_normalized_v1`؛ Validate/Resolve Codes؛ رفض correct_index في الوضع الرسمي؛ تقارير أخطاء بلا كتابة |
| الملفات | `src/lib/content-import/*`؛ preflight script؛ docs قوالب |
| المخاطر | قبول ملفات رسمية غير مكتملة الخيارات |
| PASS | dry-run يمر على عينات؛ لا DB writes |
| HOLD | غموض في تخطيط الأعمدة أو تعارض المصفوفة |
| يعتمد على | QB-01 (للمعرفة)، يمكن تطوير المحوّل قبل apply |

---

## QB-04 — Atomic Apply

| بند | محتوى |
|---|---|
| النطاق | Transaction: upsert questions + options + solutions + targets؛ استدعاء sync؛ تحديث `import_jobs`؛ ROLLBACK عند خطأ حرج |
| الملفات | server apply path / Edge أو RPC SECURITY DEFINER؛ admin import |
| المخاطر | تطبيق جزئي؛ تضارب codes؛ أداء ملفات كبيرة |
| PASS | إعادة نفس الملف idempotent؛ فشل صف حرج يمنع الكل (أو سياسة دفعات موثّقة) |
| HOLD | أي مسار service_role من العميل مباشرة |
| يعتمد على | QB-02, QB-03 |

---

## QB-05 — Admin Review Workflow

| بند | محتوى |
|---|---|
| النطاق | حالات DRAFT → READY_FOR_REVIEW → PUBLISHED؛ مراجعة حلول/خيارات؛ منع نشر Excel مباشر |
| الملفات | `admin.questions.tsx` ومكوّنات مراجعة |
| المخاطر | عرض is_correct لغير المخوّلين |
| PASS | طاقم فقط يعدّل؛ طالب لا يرى مسارات الإدارة |
| يعتمد على | QB-04 |

---

## QB-06 — Student Safe Read API

| بند | محتوى |
|---|---|
| النطاق | RPCs/Views تعرض خيارات بلا `is_correct`؛ سياسات حلول حسب reveal؛ الإبقاء على عقد exams الحالي |
| الملفات | migrations RPC؛ عميل طالب إن لزم |
| المخاطر | تسريب عبر view؛ كسر get_exam_session_state |
| PASS | اختبارات أمنية + smoke؛ لا correct قبل التسليم |
| يعتمد على | QB-01, QB-02 |

---

## QB-07 — Legacy Backfill

| بند | محتوى |
|---|---|
| النطاق | نقل كل صفوف questions → options/solutions/targets؛ التحقق العددي؛ إعادة sync |
| الملفات | scripts one-shot (مشغّل بموافقة)؛ تقارير |
| المخاطر | خيارات فارغة؛ correct_index خارج النطاق؛ أسئلة بلا lesson/subject |
| PASS | count مطابقة؛ عيّنة تصحح كما قبل |
| HOLD | فقدان بيانات أو اختلاف درجات |
| يعتمد على | QB-02 (يمكن بعد QB-01 مباشرة بحذر) |

---

## QB-08 — UI Migration

| بند | محتوى |
|---|---|
| النطاق | إدارة تقرأ/تكتب المطبّع؛ واجهات طالب تبقى على RPCs؛ دعم TRUE_FALSE/تحضيرات MULTIPLE لاحقاً |
| الملفات | routes admin + exams/lessons حسب الحاجة |
| المخاطر | كسر Mobile UX؛ رجوع لـ select مباشر للإجابات |
| PASS | نفس سيناريوهات الامتحان/الدرس خضراء |
| يعتمد على | QB-05, QB-06, QB-07 |

---

## QB-09 — Verification and Legacy Retirement

| بند | محتوى |
|---|---|
| النطاق | إثبات صفر اعتماد SoT على JSON؛ إيقاف محوّل correct_index في الاستيراد الرسمي؛ Migration **منفصلة** لحذف أعمدة Legacy فقط بعد موافقة صريحة |
| الملفات | tests؛ migration مستقبلية |
| المخاطر | كسر مسارات قديمة غير مكتشفة |
| PASS | فترة مراقبة + اختبارات؛ ثم قرار حذف |
| HOLD | أي مسار إنتاج ما زال يكتب Legacy كـ SoT |
| يعتمد على | QB-08 |

---

## ترتيب مقترح للتنفيذ الفعلي (بعد موافقة المالك)

1. QB-01
2. QB-02
3. QB-07 (backfill مبكر لتقليل الفجوة)
4. QB-03 → QB-04
5. QB-05 / QB-06
6. QB-08
7. QB-09 (متأخر ومتعمد)

## خارج النطاق لكل الحزم حتى إشعار

- Deploy / Publish
- حذف بيانات QA (مهمة منفصلة)
- Storage policies جديدة دون حزمة وسائط
- أنواع MATCHING/CODE/…
- إنشاء `question_sets` موازٍ لـ exam_templates

## الحزمة التالية الموصى بها الآن

**QB-01** — بعد اعتماد المالك لهذه الوثائق ومراجعة مسودة SQL التوثيقية.
