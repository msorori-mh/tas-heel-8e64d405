# CONTENT-IMPORT-DRY-RUN-PACKAGE-PREP-01 — التقرير (TASK 03)

- **الفرع:** `docs/content-import-dry-run-package-prep-01`
- **main @** `0338e7f` • **التاريخ:** 2026-07-31
- **المتطلب السابق:** TASK 01/02 مكتملتان عبر PR #34 (PASS_PRE_IMPORT_STABILITY_AND_TEMPLATES_PR_READY) — لم يُكرَّر عملهما.

## القرار

**PASS_CONTENT_IMPORT_DRY_RUN_PACKAGE_PREP_PR_READY**

## ما أُنجز

مراجعة مسار dry-run الحالي (`/admin/import` ← `dryRunContentImport` server fn محمية بـ `requireContentStaffAuth` ← تحليل xlsx ← `validateContentImportSheet` — قراءة فقط كاملة، لا كتابة DB)، ثم إنشاء دليل التشغيل:

**`docs/CONTENT-IMPORT-DRY-RUN-RUNBOOK-01.md`** ويغطي كل البنود المطلوبة:

1. **ترتيب الإدخال:** 01 → 02 → 03 → 04 → 05 → 06 → 09 → 07 → 08 (مطابق لـ `CONTENT_IMPORT_WORKFLOW_ORDER`).
2. **تشغيل dry-run لكل قالب** من `/admin/import` (خطوة بخطوة، حدود 5MB/1000 صف).
3. **قراءة النتيجة:** جدول الأخطاء المانعة (9 أكواد) وجدول التحذيرات غير المانعة (6 أكواد تشمل تحذيرات التسمية الثلاثة الجديدة) مع إجراء كل حالة.
4. **التحقق من أسماء المواد المقسمة** (الصيغة، القيم المعتمدة، معاملة تحذيرات التسمية كأخطاء قبل الاستيراد).
5. **التحقق من سلسلة الربط** grade → subject → unit → lesson → questions → exam_template بجدول وصلة-بـ-وصلة (مع توضيح أن dry-run يفحص داخل الملف والتحقق بين الملفات يدوي بالأكواد).
6. **Checklist قبل import:** تغطي كل البنود المطلوبة (لا وحدات QA، توحيد الأسماء، عدم تكرار subject/unit/lesson/question codes، ربط نماذج الاختبار بأسئلة) + شروط الإغلاق (migration الوحدات + تفويض المالك).
7. **ما بعد dry-run الناجح** (تسليم المالك ← تفويض ← smoke طالب).

## الملفات المعدلة

| الملف | التغيير |
|---|---|
| `docs/CONTENT-IMPORT-DRY-RUN-RUNBOOK-01.md` | جديد — دليل التشغيل |
| `docs/CONTENT-IMPORT-DRY-RUN-PACKAGE-PREP-01-REPORT.md` | جديد — هذا التقرير |

لا تغييرات كود إطلاقاً.

## الفحوصات

- baseline بداية المهمة (main @ 0338e7f): npm ci PASS • tsc PASS • npm test 19/19 • PWA 7/7 • build PASS.
- نهاية المهمة: التغييرات markdown فقط — لا أثر ممكن على tsc/tests/build؛ أُعيد تأكيد tsc + npm test + PWA (انظر سجل الفحوص الختامي للطابور).

## لم يُنفَّذ (امتثال)

لا Deploy • لا Publish • لا SQL production • لا data write • لا import فعلي • لا merge • لا حذف QA.

## المتبقي حسب الخطة

TASK 04 (release stability snapshot) ثم خطوات المالك: دمج PR #34 ← تطبيق migration الوحدات ← تنظيف QA ← dry-run فعلي على ملفات يوسف.
