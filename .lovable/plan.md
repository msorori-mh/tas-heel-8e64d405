# QUESTION_IMPORT_QB_BINDING_08 — ربط استيراد الأسئلة ببنك الأسئلة (Non-Prod)

الهدف: إغلاق القالب 09 (Questions) بربطه بمسار بنك الأسئلة المعتمد، بحيث ينتهي الاستيراد عند **Draft Revision** فقط — بدون نشر، وبدون أي كتابة عامة على جدول الأسئلة، وبدون أي تسريب للإجابات.

## 1. دالة الإدخال الداخلية `qb_import_ingest_revision`

ترحيل جديد ينشئ دالة `SECURITY DEFINER` غير قابلة للاستدعاء من العميل:
- `REVOKE EXECUTE ... FROM anon, authenticated` ومنح `service_role` فقط؛ لا تُستدعى إلا من داخل `import_execute_template`.
- المدخلات: معرّف المهمة + صف staging واحد (question_code، النص، الخيارات، الإجابة الصحيحة، الشرح، الوجهة، الهاش).
- الخطوات داخل نفس المعاملة:
  1. **إعادة التحقق من البصمة** (`row_hash`) مقابل الحمولة المخزّنة — عدم التطابق ⇒ `HASH_MISMATCH` وإسقاط المعاملة.
  2. **قفل التزامن على `question_code`** عبر `pg_advisory_xact_lock(hashtext(question_code))` ثم `SELECT ... FOR UPDATE` على السؤال إن وُجد.
  3. إنشاء/جلب سجل السؤال الجذري (بدون أعمدة إجابات حساسة في المسار العام).
  4. إنشاء `question_revisions` بحالة `draft` + الأبناء (`question_options`, `question_accepted_answers`, `question_solutions`) عبر نفس مسار QB-01 مع احتساب `payload_hash` القانوني.
  5. تسجيل الوجهة في `question_targets`.

## 2. قواعد الحالة (State rules)

| الحالة | النتيجة |
|---|---|
| `payload_hash` مطابق لأحدث Revision (منشورة أو مسودة) | `SKIPPED` — لا كتابة (Exact replay idempotent) |
| سؤال منشور والمحتوى تغيّر | تبقى النسخة المنشورة كما هي + إنشاء **Draft Revision جديدة** ⇒ `updated` |
| سؤال جديد | إنشاء سؤال + Draft Revision ⇒ `inserted` |
| خطأ في أي صف | Rollback كامل للقالب — صفر كتابات نطاق |

لا نشر إطلاقاً من مسار الاستيراد: النشر يبقى حصراً عبر `publish_question_revision` بعد المراجعة.

## 3. ربط القالب 09 بمسار Validate → Stage → Draft

- `import_execute_template`: بدل رفع `QUESTION_BANK_WORKFLOW_REQUIRED` للقالب 09، تُحوَّل صفوفه إلى حلقة تستدعي `qb_import_ingest_revision` لكل صف، وتُرجع نفس شكل النتيجة (`inserted/updated/skipped/blocked_published`).
- في الكود: تعديل `import-execution-state.ts` و`import-staging.server.ts` بحيث يصبح القالب 09 مسموحاً بالتنفيذ عبر مساره الخاص فقط (يبقى `assertGenericUpsertAllowed` مانعاً لأي upsert عام)، وتحديث `import-contract.ts` / `import-execute-messages.ts` برسائل عربية جديدة (بصمة غير مطابقة، تعارض تزامن، مسودة أُنشئت بانتظار المراجعة).
- واجهة `ContentImportDryRunPanel` / `admin.import.tsx`: إظهار القالب 09 كمسار "مسودة بانتظار المراجعة" بدل "مرفوض".

## 4. الأمان ومنع التسريب

- لا تغيير على صلاحيات الطالب: `question_revisions`، `question_options.is_correct`، `question_accepted_answers`، `question_solutions` تبقى محجوبة عن `authenticated` غير المخوّل.
- اختبار انحدار أمني يؤكد أن الطالب لا يرى مسودات ولا إجابات صحيحة عبر أي مسار (RPC، Data API، snapshot).

## 5. الاختبارات وبوابة الخروج

توسيع `tests/e2e/content-import/run-content-import-e2e-07.ts` بمشغّل جديد للمرحلة 08 + fixtures للقالب 09 في `scripts/content-import/generate-e2e-fixtures.mjs`:
- Template 09 E2E (إدخال، مسودة، حالة المهمة)
- Exact replay ⇒ SKIPPED
- Concurrency على نفس `question_code` (جلستان متوازيتان)
- Atomic rollback عند صف فاسد ⇒ صفر كتابات
- سؤال منشور يبقى منشوراً + مسودة جديدة
- تسريب إجابات للطالب = صفر
- إعادة تشغيل انحدار كامل 01–08 (32/32)

النتيجة عند نجاح الكل: `CONTENT_AND_QUESTION_IMPORT_NON_PROD_READY`. البيئة: Non-Prod فقط، Production خارج النطاق.
