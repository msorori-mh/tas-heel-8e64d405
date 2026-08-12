# IMPORT_MIGRATION_BLOCKER_CORRECTION_04A

نطاق ضيق: إغلاق H-1 وH-2 فقط، ثم إعادة تشغيل بروفة المرحلة 04 كاملة. لا Publish، لا تطبيق على قاعدة البيانات المُدارة، لا ربط أزرار Execute.

## ما تم التحقق منه فعلياً قبل الخطة

- `public.lesson_resources` في قاعدة البيانات المُدارة أعمدتها اليوم: `id, lesson_id, resource_type, title, url, description, sort_order, created_at`. **لا يوجد `code` ولا `resource_code`**.
- العقد الفيزيائي في سلسلة `content_html` (ترحيلان غير مطبَّقين: `20260808060000` و`20260809010000`) يعرّف العمود باسم **`resource_code`** مع فهرس فريد `idx_lesson_resources_code_per_lesson (lesson_id, resource_code) WHERE resource_code IS NOT NULL`، ودالة `normalize_resource_code`. لا وجود لأي عمود `code` في `lesson_resources` في أي ترحيل.
- ترحيل المرحلة 03 المعلّق يكتب إلى `resource_code` — أي أنه متوافق مع عقد `content_html`.
- التعارض الحقيقي في الوثائق لا في SQL: `src/lib/import/import-contract.ts` يربط حقل القالب `resource_code` بعمود قاعدة بيانات اسمه `code` ويسمّي القيد `lesson_resources_code_lesson_uniq`. هذا الوصف قديم ولا يطابق أي ترحيل.
- **H-2 غير صحيح**: `public.lessons` يملك بالفعل `CREATE UNIQUE INDEX lessons_subject_id_slug_key` على `(subject_id, slug)`، وعدد التكرارات = 0. لا فهرس ناقص.

## H-1 — توحيد هوية المورد على `resource_code`

القرار: العمود الفيزيائي الوحيد هو `resource_code`. لا يُنشأ عمود `code` في `lesson_resources`، ولا يُسمح بوجود الاثنين.

1. تصحيح `src/lib/import/import-contract.ts` (وثيقة العقد فقط، بلا تغيير سلوك):
   - `f("resource_code", "lesson_resources", "resource_code", ...)` بدل `"code"`.
   - اسم القيد → `idx_lesson_resources_code_per_lesson`.
   - تصحيح نص GAP-02 ليذكر `(lesson_id, resource_code)`.
2. إغلاق تبعية الترتيب داخل ترحيل المرحلة 03 نفسه، ليصبح مكتفياً ذاتياً وقابلاً للتطبيق على الشكل الحالي:
   - إضافة كتلة تمهيدية idempotent في أول الملف: `ADD COLUMN IF NOT EXISTS resource_code text` + دالة التطبيع + الفهرس الفريد الجزئي — بصيغة `IF NOT EXISTS` / `CREATE OR REPLACE` حتى لا تتعارض مع ترحيلَي `content_html` إذا طُبِّقا لاحقاً أو سابقاً.
   - إضافة حارس صريح يرفض التطبيق إذا وُجد عمود `code` في `lesson_resources` (منع الازدواج مستقبلاً).
3. تحديث `tests/import/import-contract-final-01.test.ts` وملف الفحوص المرتبطة بالخريطة لتثبيت `resource_code` كوجهة وحيدة، وإضافة فحص يفشل عند ظهور `code + resource_code` معاً.

## H-2 — فهرس `lessons(subject_id, slug)`

لا تعديل على SQL: القيد الفريد موجود أصلاً باسم `lessons_subject_id_slug_key`. الإجراء هو تصحيح التقرير:
- تحديث `docs/import/IMPORT-NON-PROD-MIGRATION-INDEPENDENT-REVIEW-04.md` لتسجيل H-2 كـ **NOT_A_DEFECT (خطأ في البروفة)** مع الدليل.
- تصحيح `tests/import/fixtures/pg17-baseline-schema.sql` بإضافة `UNIQUE (subject_id, slug)` على `lessons` حتى تطابق البروفة الواقع؛ هذا هو سبب النتيجة الخاطئة السابقة.

## إعادة تشغيل البروفة كاملة

- تحديث `tests/import/fixtures/pg17-baseline-schema.sql` (قيد slug) و`pg17-prereq-resource-code.sql` (يصبح اختبار توافق: تطبيقه قبل/بعد ترحيل 03 يجب أن ينجح في الحالتين).
- تعديل سيناريو A في `tests/import/run-pg17-import-staging-03-apply-rehearsal.mjs`: بعد الاكتفاء الذاتي لم يعد مسار `resources` ينكسر على الشكل الحالي — يتحول A4 من "فشل متوقع" إلى "نجاح تشغيلي".
- إضافة سيناريوهات: `content_html` قبل 03، و`content_html` بعد 03، وفحص عدم وجود `code` في `lesson_resources`، وفحص الفهرس الفريد على `lessons`.
- تشغيل المجموعة الموسّعة كاملة: fresh apply / re-apply / rebuild / atomicity / idempotency / BLOCKED_PUBLISHED / RBAC / allowlist / RLS+GRANT / contract mapping، إضافة إلى `npm run test:import-contract` و typecheck.

## بوابة الخروج

تقرير جديد `docs/import/IMPORT-MIGRATION-BLOCKER-CORRECTION-04A.md` يوثّق: H-1 CLOSED، H-2 CLOSED (NOT_A_DEFECT)، نتيجة المجموعة الموسّعة، صفر CRITICAL وصفر HIGH، وتطابق خريطة العقد مع الـschema ⇒ `READY_TO_APPLY_MIGRATION_TO_NON_PROD`.

## ملاحظة تقنية

الملف يبقى في `supabase/migrations-pending/` ولا يُنقل إلى `supabase/migrations/`. كل التعديلات SQL نصية داخل الملف المعلّق + ملفات اختبار/وثائق. لا استدعاء لأداة الترحيل.
