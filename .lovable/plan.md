# IMPORT_NON_PROD_MIGRATION_APPLY_05 → E2E 07

تفويض مُستلم: تطبيق على بيئة Non-Prod فقط، بلا نشر إنتاجي.

## 05 — تطبيق الترحيل

- تطبيق `supabase/migrations-pending/20260813010000_import_staging_and_execution_03.sql` بالنص الحرفي (byte-for-byte) عبر أداة الترحيل، ثم نقل الملف إلى `supabase/migrations/` بنفس الاسم ليصبح جزءاً من السجل الرسمي.
- بوّابة `SCHEMA_DRIFT` داخل الملف ستوقف التطبيق تلقائياً إن وُجد عمود `lesson_resources.code` — لا التفاف عليها.

## 05.B — تحقق ما بعد التطبيق

فحص للقراءة فقط يؤكد:
- وجود `import_staging_rows` و`content_review_state` مع RLS مفعّل، وسياسات SELECT فقط، وبلا أي صلاحية لـ `anon`.
- كل الدوال (`import_stage_rows`, `import_execute_template`, `import_finalize_job`, `content_review_set_state`, …) بـ `SECURITY DEFINER` و`search_path = public, pg_temp`.
- وجود `lesson_resources.resource_code` والفهرس الفريد لكل درس، وأعمدة الهوية للشروحات والتقييمات.
- تشغيل linter الأمني ومعالجة أي تحذير ناتج عن هذا الترحيل.

## 05.C — Smoke

- إعادة تشغيل بروفة PG17 واختبارات العقد للتأكد من عدم وجود انحراف بعد التطبيق.
- Smoke تشغيلي على Non-Prod: prepare → execute لقالب واحد صغير (resources) والتأكد من الذرّية و idempotency.

## 06 — ADMIN_IMPORT_PREPARE_EXECUTE_WIRING

- ربط `/admin/import` بمسار فعلي من ثلاث خطوات: Dry-run (كما هو) → «تجهيز» (`import_stage_rows`) → «تنفيذ» (`import_execute_template`) عبر `createServerFn` محمي بصلاحية الأدمن/مدير المحتوى.
- عرض حالة الوظيفة، عدد الصفوف المُجهّزة، ونتيجة التنفيذ (مُدرج/محدَّث/مرفوض) مع رسائل خطأ عربية مبنية على `import-error-codes`.
- زر التنفيذ يبقى معطلاً حتى ينجح الـ Dry-run ويكون الملف نفسه (نفس الهاش) هو المُجهَّز.

## 07 — CONTENT_IMPORT_OPERATIONAL_E2E

- تشغيل السلسلة الكاملة للقوالب 01–09 بالترتيب المعتمد على Non-Prod ببيانات درس واحد تجريبي.
- التحقق من ظهور المحتوى في واجهات الأدمن، ومن أن حالة المراجعة تمنع الظهور للطالب قبل الاعتماد.
- إصلاح أي مانع يظهر وإعادة التشغيل حتى PASS، ثم تقرير في `docs/import/`.

## ملاحظات تقنية

- لا Publish ولا تطبيق على الإنتاج ضمن هذا المسار.
- الاستيراد يمر حصراً عبر RPCs؛ لا كتابة مباشرة من العميل.
- الأسئلة (قالب 09) تبقى خارج مسار الـ upsert العام كما ينص الترحيل.
