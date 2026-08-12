# المرحلة 03 — Staging + Execute (داخل المستودع فقط)

الهدف: تحويل تصميم المرحلة 02/02B إلى تنفيذ حقيقي داخل المستودع: ملف Migration فعلي، طبقة Staging على الخادم، ومحرّك `executeContentImport`، مع اختبارات شاملة. **بدون تطبيق Migration، وبدون Publish، وبدون أي كتابة على الإنتاج.**

## 1. ملف Migration حقيقي (لا يُطبَّق)

`supabase/migrations/20260813010000_import_staging_and_execution_03.sql`

- `lesson_assessments.code` + فهرس فريد عام.
- `lesson_explanations.code` و`lesson_resources.code` + فهارس فريدة لكل درس (sort_order يبقى خارج الهوية).
- `lesson_resources.metadata jsonb NOT NULL DEFAULT '{}'` + trigger allowlist **مفعّل** (لا تعليق).
- `content_review_state` (review + publication مربوطة بـ `content_hash`) + trigger تصفير المراجعة عند تغيّر الهاش **مفعّل**.
- `import_staging_rows` مع `row_hash`، `natural_key`، `planned_action`، والفهارس المتفق عليها.
- GRANT/RLS: لا `anon` إطلاقاً؛ قراءة Staging لمالك الـ Job فقط + سياسة منفصلة للأدمن الكامل؛ الكتابة عبر `service_role`/full admin فقط.

### إغلاق المرجع متعدد الأشكال (S4 — MEDIUM) بطريقة fail-closed
- trigger تحقق وجود على `(entity_type, entity_id)` يرفض أي صف لا يقابله كيان فعلي داخل الـ allowlist (بحث مباشر لكل نوع، بدون SQL ديناميكي).
- تنظيف تلقائي: triggers حذف على كل جدول كيان تُزيل صف المراجعة المقابل، فلا تبقى حالة يتيمة.
- مسار الكتابة الوحيد المسموح من التطبيق هو RPC بـ SECURITY DEFINER يعيد فحص الدور.

### S3 (MEDIUM) و S5 (LOW)
- S3: عزل ملكية Staging منقول حرفياً إلى الـ Migration ومغطّى باختبار.
- S5: كل trigger أمني يخرج مُفعّلاً؛ اختبار ثابت (static test) يفشل إذا وُجد `-- CREATE TRIGGER` معلّق داخل مجلد `supabase/migrations`.

## 2. طبقة Staging على الخادم

`src/lib/import/import-staging.server.ts` + `import-staging.functions.ts`

- ربط قوالب 01–09 بـ `import_jobs`: كل dry-run ناجح يكتب صفوف Staging (`payload` مُطبَّع، `resolved_refs`، `planned_action`، `row_hash`).
- إعادة استخدام العقد الحالي: `import-contract.ts`، `import-error-codes.ts`، `subject-slug.ts` (SHA-256 + fail closed عند التصادم).
- التحقق من الدور داخل الخادم عبر `import-auth.server.ts`.

## 3. محرّك التنفيذ `executeContentImport`

آلة الحالة: `validated → planned → applying → applied | failed` (وفق `EXECUTION_TRANSITIONS` الموجودة).

- معاملة واحدة لكل قالب؛ فشل صف واحد يُرجع القالب بالكامل (rollback) ويوقف القوالب اللاحقة.
- إعادة تحقق إلزامية داخل المعاملة (نتائج dry-run غير موثوقة).
- `BLOCKED_PUBLISHED` يُفحص **قبل** أي Domain Write ولا يُطبَّق أبداً.
- Idempotency: نفس المفتاح + نفس الهاش → `skipped`؛ مسودة متغيّرة → `UPDATE_DRAFT`/`NEW_REVISION`؛ محتوى منشور متغيّر → `BLOCKED_PUBLISHED`.
- الأسئلة لا تمر عبر generic upsert — تُوجَّه إلى Question Bank workflow المعتمد.

## 4. الاختبارات

`tests/import/import-staging-execution-03.test.ts` + اختبارات ثابتة على ملف الـ Migration:

- triggers مفعّلة، لا GRANT لـ anon، وجود كل فهرس متفق عليه.
- عزل ملكية Staging، fail-closed للمرجع متعدد الأشكال، تنظيف عند الحذف.
- انتقالات آلة الحالة، rollback ذرّي، مصفوفة Idempotency، حاجز BLOCKED_PUBLISHED، وتوجيه الأسئلة.

## بوابة الخروج
Migration مُراجَع + triggers ACTIVE + RLS/GRANT + fail-closed + عزل الملكية + rollback + idempotency + BLOCKED_PUBLISHED + مسار بنك الأسئلة محفوظ + MEDIUM ×2 مغلقة + tests/typecheck/build PASS ⇒ `READY_FOR_NON_PROD_MIGRATION_APPLY_REVIEW`.

**ممنوع في هذه المرحلة:** تطبيق الـ Migration، أي كتابة إنتاجية، أو Publish.
