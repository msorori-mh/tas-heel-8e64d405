# إغلاق مسار استيراد المحتوى والأسئلة (PRIORITY_1)

تم اعتماد التوقف عن أعمال «أكاديمية معلم الثانوية». هذه الخطة تكمل من آخر نقطة فعلية في نظام الاستيراد.

## الوضع الحالي (تم التحقق منه في الكود)

- قوالب محتوى الدروس 01–09 معرّفة في `src/lib/content-import/content-import-templates.ts` مع أعمدة مطلوبة وقواعد تحقق.
- Dry-run يعمل فعلياً لقوالب 01–09 (`content-import-dry-run.functions.ts`) — تحقق فقط، بلا كتابة ولا سجل وظيفة.
- Dry-run المحافظات يكتب سجلاً في `import_jobs` / `import_errors` (`import-dry-run.functions.ts` + `import-dry-run-persist.server.ts`).
- بنك الأسئلة يملك طبقة تحقق ناضجة (`src/lib/question-bank/import/`): كشف المخطط، الترميز، الوسائط، ZIP preflight، أكواد أخطاء، Preview، وhash قانوني — لكن **بدون أي server function للتنفيذ**.
- واجهة `/admin/import` تعرض التحميل + Dry-run فقط، وتصرّح أن «التنفيذ الفعلي غير مفعّل».
- الجداول الموجودة: `import_jobs` و `import_errors` فقط — لا يوجد جدول Staging للصفوف.

الفجوة الأساسية: لا يوجد مسار Execute → Review → Publish، ولا Idempotency فعلي، ولا ربط dry-run لقوالب 01–09 بسجل وظيفة.

## المراحل

### 1) إغلاق عقد الاستيراد (Import Contract Final Closure)
- توثيق عقد نهائي واحد `docs/import/IMPORT-CONTRACT-FINAL-01.md` يجمع: قوالب يوسف 01–09، أنواع الأسئلة المدعومة، الأعمدة المطلوبة/الاختيارية، قواعد التحقق، جدول أكواد الأخطاء الموحّد، وقاعدة Idempotency.
- توحيد أكواد الأخطاء بين مسار المحتوى (`content-import-validators`) ومسار الأسئلة (`validation-codes.ts`) في قائمة واحدة.
- تثبيت مفاتيح الهوية: `subject_code`, `unit_code`, `lesson_code`, `assessment_code`, `question_code` كمفاتيح طبيعية للـ upsert.
- Idempotency: بصمة محتوى للصف (payload hash) + مفتاح طبيعي ⇒ إعادة رفع نفس الملف = 0 إدراج / 0 تحديث.

### 2) طبقة التنفيذ (Staging + Execute)
- Migration (لن تُنفَّذ إلا بأمر صريح منك): جدول `import_staging_rows` (job_id, template_key, row_number, natural_key, payload jsonb, row_hash, status) + أعمدة كود طبيعي مفقودة مثل `assessments.assessment_code`، مع GRANT وRLS لطاقم المحتوى فقط.
- ربط dry-run لقوالب 01–09 بـ `import_jobs` مثل مسار المحافظات، وحفظ الصفوف في Staging.
- Server function `executeContentImport` بصلاحية `requireContentStaffAuth`: يقرأ Staging لوظيفة محققة فقط، ويُنفّذ upsert بترتيب التبعية 01→02→03→04→05→06→09→07→08 داخل RPC واحدة لكل قالب، ويحدّث العدادات (inserted/updated/skipped).

### 3) واجهة Admin للاستيراد والمراجعة
- تحويل `ContentImportDryRunPanel` إلى Wizard: رفع → فحص → عرض الأخطاء (جدول قابل للفرز حسب الصف/العمود/الكود) → Preview أول 10 صفوف → زر «تنفيذ الاستيراد» (يظهر فقط عند status=validated).
- صفحة مراجعة `/admin/content-review` تعرض ما تم استيراده بحالة `draft` مع اعتماد/رفض جماعي ثم النشر (`review_status = published`).
- `ImportJobsHistory` يعرض وظائف التنفيذ أيضاً مع تفاصيل الوظيفة وأخطائها.

### 4) رفع محتوى الدروس والأسئلة
- تشغيل السلسلة الكاملة على مادة واحدة كاملة كعيّنة: صفوف → مواد → وحدات → دروس → محتوى الدرس → موارد → أسئلة → تقييمات.

### 5) Operational E2E
- ملف صحيح ⇒ يمر إلى Publish.
- ملف خاطئ (أعمدة ناقصة، correct_index غير صالح، lesson_code غير موجود) ⇒ يُرفض بأخطاء مفهومة وبدون كتابة.
- ملف مكرر ⇒ 0 إدراج (Idempotency).
- تحقق نهائي: الطالب يرى المحتوى المنشور تحت المادة/الوحدة/الدرس الصحيح ومع منهج/صف مطابقين.

### 6) Production Content Launch — لاحقاً وبأمر صريح فقط.

## قيود التنفيذ
- كل Migration أو كتابة على Production تحتاج أمراً صريحاً منك قبل التنفيذ.
- لا Publish ضمن هذه المراحل.
- لا عمل على أكاديمية المعلم.

## ملاحظة تنفيذية
سأنفّذ المراحل بالترتيب وأتوقف عند حدود Migration لطلب موافقتك.
