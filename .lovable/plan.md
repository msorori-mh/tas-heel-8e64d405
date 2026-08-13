# CONTENT_IMPORT_TEMPLATE_CONTRACT_SYNC_12A

إغلاق الفجوة بين "العقد المركزي" و"ملفات Excel الرسمية + فحص Validate" قبل أول دفعة محتوى حقيقية. لا تغيير في محرك الاستيراد ولا في قاعدة البيانات.

## المشكلة المؤكدة (من مراجعة الكود)

- مولّد القوالب `scripts/generate-content-templates.mjs` لا يُخرج `subject_code` في 04/05/06/07، ولا `explanation_code` في 05، ولا `resource_code` في 06، و`resource_url` فيه غير إلزامي — بينما العقد يعتبرها إلزامية ومنطق التنفيذ في القاعدة يقرأها فعلاً.
- `DRY_RUN_CONFIG` داخل `content-import-templates.ts` قائمة يدوية ثانية، ناقصة نفس الأعمدة ⇒ Validate = PASS لملف قد يفشل أو يفقد الهوية عند Execute.
- ترتيب الواجهة `CONTENT_IMPORT_UI_ORDER = [1..6, 9, 7, 8]` مستقل عن `IMPORT_EXECUTION_ORDER` الحقيقي `[1..7, 9, 8]`.
- مجلد قديم `public/import-templates/` (12 ملفاً) ما زال معروضاً في لوحة الاستيراد عبر `src/lib/import-template-catalog.ts` بجانب الحزمة المعتمدة `public/content-import-templates/`.
- العقد ما زال يصف `assessment_code` و`explanation_code` و`resource_code` كـ `planned_unique` ويشير إلى `migrations-pending`، بينما الأعمدة مطبّقة فعلاً على القاعدة (تم التحقق).

## ما سيتم تنفيذه

### 1. مصدر واحد لأعمدة القوالب
- اشتقاق `requiredColumns` و`knownColumns` لكل قالب من `IMPORT_ENTITY_CONTRACTS[key].fields` بدل القوائم اليدوية.
- إبقاء `infoWarnings` و`duplicateKeyColumn`/`compositeDuplicateKeys` مشتقّة من `naturalKey` في العقد.
- الإبقاء على واجهة `getContentImportDryRunConfig` كما هي حتى لا تتأثر المكونات.

### 2. مولّد القوالب مطابق للعقد
- إضافة `subject_code` (إلزامي) إلى 04، 05، 06، 07.
- إضافة `explanation_code` (إلزامي) إلى 05، و`resource_code` (إلزامي) + جعل `resource_url` إلزامياً في 06.
- مراجعة 01–03 و08–09 عموداً بعمود مقابل العقد، وتحديث صفوف الأمثلة والملاحظات العربية.
- إعادة توليد ملفات `public/content-import-templates/01..09`.

### 3. ترتيب رسمي واحد
- حذف `CONTENT_IMPORT_UI_ORDER` واشتقاق ترتيب العرض من `IMPORT_EXECUTION_ORDER`.
- تحديث `CONTENT_IMPORT_WORKFLOW_ORDER` إلى: `01 → 02 → 03 → 04 → 05 → 06 → 07 → 09 → (Review/Publish) → 08`، مع نص واضح في الواجهة بأن 08 لا يعمل قبل نشر أسئلة 09.

### 4. إغلاق ازدواج القوالب القديمة
- Audit لكل مراجع `public/import-templates/` و`import-template-catalog.ts`.
- إزالة الحزمة القديمة من لوحة الاستيراد (لا عرض ولا تنزيل)، ووسمها Deprecated في README مع الإبقاء على الملفات فقط كأرشيف غير معروض.

### 5. تحديث توصيف العقد ليطابق القاعدة
- تحويل `planned_unique` إلى `db_unique` لـ `explanations` و`resources` و`assessments` بأسماء القيود المطبّقة فعلياً بعد التحقق منها من القاعدة، وإزالة إشارات `migrations-pending`.
- تحديث قوائم `gaps` المغلقة و`IMPORT_GAP_RESOLUTIONS` لتعكس حالة "applied".

### 6. اختبارات حارسة جديدة
- أعمدة كل قالب مولَّد == أعمدة العقد (قراءة الـ xlsx فعلياً).
- `requiredColumns` في Dry-run == الحقول الإلزامية في العقد (parity كامل).
- ترتيب الواجهة == `IMPORT_EXECUTION_ORDER`.
- وجود هويات 04–07 الإلزامية (`subject_code`, `explanation_code`, `resource_code`, `assessment_code`).
- صف المثال في كل قالب رسمي يمر في Validate بنجاح.
- لا وجود لأي مرجع للحزمة القديمة داخل لوحة الإدارة.

## ملاحظات تقنية

- لا Migration في هذه المرحلة؛ التغيير كله في `src/lib/content-import/`, `src/lib/import/import-contract.ts`, `src/lib/import-template-catalog.ts`, `src/routes/_authenticated/admin.import.tsx`, `scripts/generate-content-templates.mjs`, وملفات الاختبارات.
- تحديث القيود في العقد سيتم فقط بعد استعلام قراءة يؤكد أسماء القيود المطبّقة فعلاً (`pg_indexes` / `pg_constraint`).
- الاختبارات الحالية `tests/import/*.test.ts` تعتمد على `planned_unique` و`draftRef`؛ ستُحدَّث ضمن نفس المرحلة.

## بوابة الخروج

| البند | المطلوب |
|---|---|
| TEMPLATE 01–09 CONTRACT MATCH | PASS |
| DRY-RUN / EXECUTE PARITY | PASS |
| OFFICIAL XLSX REGENERATED | PASS |
| LEGACY TEMPLATE CONFUSION | CLOSED |
| CANONICAL ORDER | SINGLE SOURCE |
| TESTS / TYPECHECK / BUILD | PASS |

بعدها فقط نعود إلى `FIRST_REAL_CONTENT_BATCH_12` بمسار Pilot: 01 → 02 → 03 → 04 → 05 → 06 → 07 بدون أسئلة.
