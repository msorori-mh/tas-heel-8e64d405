# CONTENT_IMPORT_TEMPLATE_CONTRACT_SYNC_12A

**الحالة:** CLOSED
**الغرض:** إزالة الانحراف بين العقد المركزي (`import-contract.ts`)، وإعدادات الفحص (Dry-run)، وملفات Excel الرسمية، قبل أول دفعة محتوى حقيقية.

## 1. مصدر الحقيقة الواحد

`IMPORT_ENTITY_CONTRACTS` هو الآن المصدر الوحيد لأعمدة القوالب:

- `templateColumnsForEntity(key)` → كل أعمدة Excel.
- `requiredTemplateColumnsForEntity(key)` → الأعمدة الإلزامية.
- `ImportFieldMapping.templateField` يستثني الحقول الداخلية المشتقة من الملف.

`DRY_RUN_CONFIG` و`requiredBaseColumns` و`compositeDuplicateKeys` تُشتق كلها من العقد
(`content-import-templates.ts`)، فلم يعد ممكناً أن يقبل الفحص ملفاً يرفضه التنفيذ.

## 2. تصحيح مولّد القوالب

| القالب | الأعمدة المضافة |
|---|---|
| 04 محتوى الكتاب | `subject_code` (إلزامي) |
| 05 الشروحات | `subject_code`، `explanation_code` (إلزاميان) |
| 06 الموارد | `subject_code`، `resource_code` (إلزاميان)، و`resource_url` صار إلزامياً |
| 07 التقييمات | `subject_code` (إلزامي) |
| 09 بنك الأسئلة | `question_type`، `year`، `semester`، `sort_order` |

مخرجات المولّد صارت تُكتب مباشرة في `public/content-import-templates/` (المسار المنشور)،
وأُلغي المجلد المزدوج `docs/content-templates/`.

## 3. ترتيب رسمي واحد

`IMPORT_EXECUTION_ORDER` = `01 → 02 → 03 → 04 → 05 → 06 → 07 → 09 → 08`.
`CONTENT_IMPORT_WORKFLOW_ORDER` و`CONTENT_IMPORT_TEMPLATES_DISPLAY_ORDER` تُشتقان منه،
فالواجهة والتنفيذ يعرضان الترتيب نفسه دائماً. القالب 09 يسبق 08 لأن الربط لا يقبل إلا
نسخة سؤال منشورة (Review/Publish بينهما).

## 4. إغلاق ازدواج القوالب

حُذف كتالوج `public/import-templates/` القديم من واجهة `/admin/import`
(بقي `IMPORT_TEMPLATE_CATALOG` لغرض تسمية وظائف الاستيراد في سجل المهام فقط).
لم يعد للمشغّل إلا حزمة واحدة قابلة للتنزيل: 01–09.

## 5. توصيف العقد يطابق القاعدة

الفجوات التالية صارت `status: "applied"` مع ذكر كائنات القاعدة المثبتة:

| الفجوة | كائنات مطبقة (تم التحقق منها) |
|---|---|
| GAP-01 | `lesson_assessments.assessment_code`، `lesson_assessments_code_uniq` |
| GAP-02 | `lesson_explanations_code_lesson_uniq`، `idx_lesson_resources_code_per_lesson` |
| GAP-03 | `public.content_review_state` |
| GAP-05 | `lesson_resources.metadata` |

## 6. الاختبارات الحارسة

`tests/import/template-contract-sync-12a.test.ts` — 23/23 PASS:

- لا فجوات مفتوحة.
- ترتيب التنفيذ يغطي كل قالب مرة واحدة، و09 قبل 08.
- ترتيب الواجهة = ترتيب التنفيذ.
- إعداد Dry-run لكل قالب = العقد (أعمدة + مفتاح طبيعي)، وكل عمود هوية إلزامي.
- رؤوس ملفات XLSX الفعلية = أعمدة العقد بالضبط.

اختبارات سابقة محدثة: `import-contract-final-01` 11/11، `import-execution-readiness-02` 16/16،
`import-slug-security-02b` 8/8، `import-staging-execution-03` 25/25.

## 7. بوابة الخروج

| المعيار | النتيجة |
|---|---|
| القوالب = العقد | PASS |
| تكافؤ Dry-run / Execute | PASS |
| إعادة توليد XLSX | PASS (9 ملفات) |
| ترتيب موحد | PASS |
| الاختبارات | PASS (83 اختباراً) |

`OFFICIAL_TEMPLATE_PACKAGE = SAFE` — يمكن استئناف `FIRST_REAL_CONTENT_BATCH_12`.
