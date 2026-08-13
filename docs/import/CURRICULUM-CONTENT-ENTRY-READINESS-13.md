# CURRICULUM_CONTENT_ENTRY_READINESS_13 — تقرير الإغلاق

الوضع: **CONTENT_ENTRY_OPERATOR_READY = YES**
CURRICULUM DATA WRITES = 0 · PRODUCTION CONTENT INSERT = 0 · NEW MIGRATION APPLIED = 0

## بوابة الإغلاق

| البند | النتيجة | الدليل |
| --- | --- | --- |
| SUBJECT_AS_BRANCH OPERATIONAL | PASS | `subject_code` يُحدد عند الإنشاء ثم يقفل (`assert_natural_code_immutable`)؛ `group_code` يُقبل من NULL ثم يقفل (`assert_subject_group_code_immutable`)؛ `group_name` قابل للتعديل مع تحقق التناسق (`assert_subject_group_name_consistent`) وأخطاء عربية في `SubjectEditDialog`. |
| SAFE ADMIN CRUD | PASS | كل مسارات الحذف تمر بـ `CurriculumDeleteDialog` → RPC `admin_curriculum_delete` مع معاينة الأثر ومنع الحذف عند وجود نشاط طالب. |
| DIRECT DELETE BYPASS ZERO | PASS | `tests/import/no-direct-curriculum-delete.test.ts` — 3/3 PASS، صفر استدعاء `.from(<curriculum>).delete()` في `src/`. |
| CONTENT_MANAGER MATRIX VERIFIED | PASS | `docs/import/CONTENT-MANAGER-PERMISSION-MATRIX.md` مع نقطة الفرض لكل صف. |
| OFFICIAL 01–09 TEMPLATES | PASS | `public/content-import-templates/` (9 ملفات) + اختبارات `template-contract-sync-12a`. |
| DATA DICTIONARY / NAMING / OPERATOR GUIDE | PASS | `DATA-DICTIONARY-AR.md`، `NAMING-CONVENTION.md`، `OPERATOR-RUNBOOK-AR.md` (محدَّث ببوابة المراجعة والنشر). |
| IMPORT CENTER LEGACY UX CLOSED | PASS | حذف نصوص «قريباً» و POC؛ الصفحة أصبحت صفحة تشغيل. |
| TEMPLATE ORDER SINGLE SOURCE | PASS | شريط الخطوات مشتق من `IMPORT_EXECUTION_ORDER` عبر `CONTENT_IMPORT_WORKFLOW_STEPS`. |
| سجل العمليات كامل | PASS | القالب، الملف، الصفوف، مُدرج، مُحدّث، متجاوَز، محجوب، أخطاء، الحالة، المشغّل، التاريخ. |
| TESTS / TYPECHECK | PASS | tsgo نظيف؛ 60 اختبار node + 26 اختبار vitest. |

## ما أُضيف في هذه المرحلة

- تحقق fail-closed في المعاينة: `GROUP_NAME_REQUIRED` و `GROUP_NAME_CONFLICT` لقالب المواد.
- رسائل عربية لحُرّاس قاعدة البيانات في حوار تعديل المادة.
- اختبار «صفر مسار حذف مباشر» على كل كيانات المنهج.
- شريط ترتيب الاستيراد الرسمي (01→07 ← مراجعة ← نشر ← 09 → 08) في مركز الاستيراد.
- حزمة المشغّل الرسمية: `public/operator-pack/tamkeen-content-operator-pack.zip` (9 قوالب + 3 أدلة) وزر تحميلها، وتُبنى بـ `node scripts/build-operator-pack.mjs`.
- مصفوفة صلاحيات `content_manager`.

## ملاحظة على الترحيل المعلق

`supabase/migrations-pending/20260814020000_content_entry_readiness_13.sql` (دعم حقول التجميع في `import_execute_template`) **لم يُطبَّق** — بقي معلقاً وفق قاعدة NEW MIGRATION = NOT EXPECTED. يُطبَّق بإشارة صريحة قبل أول دفعة محتوى حقيقية تستخدم `group_code` عبر القالب 01.
