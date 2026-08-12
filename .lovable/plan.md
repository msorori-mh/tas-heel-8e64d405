# IMPORT_EXECUTION_READINESS_GAP_CLOSURE_02

مرحلة **غير إنتاجية**: لا Migration، لا كتابة في قاعدة البيانات، لا Publish. الهدف إغلاق الفجوات السبع تصميمياً وتوثيقياً وباختبارات حارسة، بحيث يصبح فتح Migration لاحقاً خطوة تنفيذ فقط بلا قرارات مفتوحة.

## القرارات المقترحة لكل فجوة

| # | الفجوة | القرار المقترح |
|---|---|---|
| 1 | `lesson_assessments.code` غير موجود | إضافة العمود + فهرس فريد جزئي — يُصاغ كـ SQL مسودة غير مطبّق |
| 2 | لا تفرد على `lesson_explanations` / `lesson_resources` | مفتاح طبيعي `(lesson_id, sort_order)` + عمود `row_hash` للكشف عن التغيير |
| 3 | لا أعمدة مراجعة/نشر | جدول جانبي واحد `content_review_state` (entity_type + entity_id) بدل إضافة عمودين لستة جداول |
| 4 | `lesson_resources.url` NOT NULL | جعل `resource_url` مطلوباً في القالب 06 (تغيير قالب فقط، بلا Schema) |
| 5 | 7 أعمدة بلا وجهة في القالب 06 | عمود `metadata jsonb` على `lesson_resources` تُجمَّع فيه — مع إبقاء القالب كما هو |
| 6 | `lesson_code` وحده غير كافٍ في 04–07 | إضافة `subject_code` إلزامي لهذه القوالب (نطاق تحليل داخل المادة) |
| 7 | `subjects.slug` مطلوب وغير موجود في القالب 01 | اشتقاق حتمي `slug = normalize(subject_code)` موثّق ومُختبَر |

## المخرجات

1. **`src/lib/import/import-contract.ts`**
   - حقل `gapResolution` لكل كيان: القرار، النوع (`template_change` / `schema_change` / `derivation`)، وحالته (`closed_design`).
   - إضافة `subject_code` للمفاتيح الطبيعية في القوالب 04–07، وجعل `resource_url` مطلوباً.
   - دالة `deriveSubjectSlug(subjectCode)` حتمية.
   - `ROW_HASH_FIELDS` لكل كيان (أساس الـ Idempotency).

2. **`src/lib/import/import-error-codes.ts`**
   - أكواد جديدة: `MISSING_SUBJECT_SCOPE`, `AMBIGUOUS_LESSON_CODE`, `MISSING_RESOURCE_URL`, `ASSESSMENT_CODE_UNSUPPORTED`, `REVIEW_STATE_UNAVAILABLE`, `DUPLICATE_NATURAL_KEY_IN_FILE`.

3. **`src/lib/import/import-staging-design.ts`** (جديد، بيانات فقط)
   - وصف جداول Staging المقترحة (`import_staging_rows`, `content_review_state`) كـ TypeScript types + ثوابت، بلا أي SQL منفّذ.
   - آلة حالة Execute: `parsed → validated → planned → applied|blocked`.

4. **`docs/migration-drafts/IMPORT-EXECUTION-READINESS-02.NOT_APPLIED.sql`**
   - مسودة SQL كاملة (أعمدة، فهارس، GRANT، RLS) بامتداد صريح NOT_APPLIED — للمراجعة فقط.

5. **`docs/import/IMPORT-CONTRACT-FINAL-01.md`**
   - القسم 6 يتحول من «فجوات مفتوحة» إلى «فجوات مغلقة تصميمياً» مع 7/7 قرارات + إشارة للمسودة.
   - قسم جديد: تصميم Staging / Execute / Review.

6. **الاختبارات الحارسة** (`tests/import/`)
   - 7/7 فجوات لها `gapResolution` بحالة `closed_design`.
   - لا مسار يسمح باستبدال صف منشور (إعادة تأكيد `BLOCKED_PUBLISHED`).
   - `subject_code` موجود في المفاتيح الطبيعية للقوالب 04–07.
   - `deriveSubjectSlug` حتمية ومتوافقة مع قيد `subjects.slug`.
   - مسودة SQL غير مربوطة بأي مسار تنفيذ (اختبار ثابت على اسم الملف/الامتداد).
   - مسار بنك الأسئلة (`questionBankWorkflow`) لم يتغير.
   - رسم التبعية ما زال مطابقاً للـ FKs الفعلية.

## ما لن يحدث في هذه المرحلة

- لا `supabase--migration` ولا أي DDL منفّذ.
- لا كتابة/تعديل بيانات محتوى.
- لا تفعيل زر Execute في `/admin/import` (يبقى Dry-run فقط).
- لا Publish.

## بوابة الخروج

`7/7 CLOSED` + `bun run test:import-contract` أخضر + مراجعة أمنية بلا CRITICAL/HIGH + مسودة SQL جاهزة للاعتماد.
