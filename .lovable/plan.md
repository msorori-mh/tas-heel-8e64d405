# QUESTION_IMPORT_QB_BINDING_08 — إغلاق القالب 09 عبر بنك الأسئلة

الهدف: فتح استيراد الأسئلة (Template 09) بمسار واحد فقط هو مسار بنك الأسئلة (مسودة → مراجعة → نشر)، دون أي كتابة عامة مباشرة على جدول الأسئلة، ودون المساس بالقوالب 01–08 التي اعتُمدت تشغيلياً.

## الوضع الحالي (تم التحقق منه)

- `import_execute_template` يرفض `questions` صراحة برمز `QUESTION_BANK_WORKFLOW_REQUIRED` (حاجز آمن مقصود).
- عقد الاستيراد `import-contract.ts` يعلّم القالب 09 بـ `questionBankWorkflow: true` ومفتاحه الطبيعي `question_code`.
- أساس بنك الأسئلة موجود في قاعدة البيانات: `question_revisions` (DRAFT → READY_FOR_REVIEW → APPROVED → PUBLISHED → SUPERSEDED/REJECTED)، الأبناء (`question_options`, `question_accepted_answers`, `question_solutions`, `question_targets`)، هاش قانوني `payload_hash`، مؤشر النسخة المنشورة على `questions`، وحرّاس عدم قابلية التعديل، ودوال الصلاحيات `can_edit_question_bank` / `can_review_question_content` / `can_publish_question_revision`، ودالة `publish_question_revision`.
- توجد طبقة تحقق TypeScript كاملة للأسئلة في `src/lib/question-bank/import/` (محوّلات، تطبيع، بصمة محتوى، فحص مسبق) لكنها **غير مربوطة** بمسار الاستيراد التشغيلي (staging/execute) ولا توجد دالة قاعدة بيانات تُنشئ مسودة نسخة من صف مُجهَّز.

الفجوة الوحيدة إذن: **الربط (Binding)** بين staging والـ QB workflow.

## ما سيُنفَّذ

### 1) Migration: دالة استيعاب الأسئلة داخل بنك الأسئلة

دالة جديدة `qb_import_ingest_revision(...)` (SECURITY DEFINER) تُستدعى من داخل `import_execute_template` فقط لصفوف القالب 09، وتقوم بـ:

- التحقق من صلاحية المشغّل عبر `can_edit_question_bank` (لا صلاحية = رفض).
- إيجاد/إنشاء "غلاف السؤال" في `questions` عبر `code` فقط بالحقول الهيكلية (الربط بالمادة/الدرس/الوحدة)، **بدون** كتابة `correct_index` أو نص السؤال أو الخيارات عبر المسار العام.
- إنشاء نسخة `question_revisions` جديدة بحالة `DRAFT` تحمل النص والخيارات والإجابة الصحيحة والشرح في جداول الأبناء، مع `source_payload_hash` = بصمة الصف القادمة من staging.
- منطق القرار لكل صف:
  - لا يوجد سؤال بهذا الكود → `INSERTED` (سؤال + مسودة نسخة 1).
  - يوجد سؤال ونفس البصمة (تكرار حرفي) → `SKIPPED` (لا كتابة إطلاقاً).
  - يوجد سؤال ببصمة مختلفة ولا توجد نسخة منشورة → تحديث/إنشاء مسودة جديدة `NEW_REVISION`.
  - يوجد سؤال ببصمة مختلفة وله نسخة منشورة → **لا استبدال**: تُنشأ نسخة جديدة `DRAFT` (`NEW_REVISION`) وتبقى النسخة المنشورة كما هي، وتُسجَّل الحالة `BLOCKED_PUBLISHED_NEW_REVISION` في تقرير المهمة.
- لا تُنشر أي نسخة إطلاقاً من مسار الاستيراد؛ النشر يبقى حصراً عبر `publish_question_revision` بصلاحية النشر.

### 2) فتح المسار في `import_execute_template`

استبدال رمي `QUESTION_BANK_WORKFLOW_REQUIRED` بتفريعة تُمرّر الصفوف المُجهَّزة إلى `qb_import_ingest_revision` داخل نفس المعاملة (Atomicity كما في 01–08). يبقى الرفض قائماً إذا لم يملك المشغّل صلاحية بنك الأسئلة، برمز واضح `QUESTION_BANK_CAPABILITY_REQUIRED`.

### 3) التحقق والتجهيز (Validate + Stage) للقالب 09

- تمرير صفوف القالب 09 عبر مُطبِّع بنك الأسئلة الموجود (`src/lib/question-bank/import/`) قبل التجهيز: تحويل `correct_index` من 1-based إلى 0-based، تطبيع Unicode، رفض الخيارات المكررة/الفارغة، رفض `correct_index` خارج المدى، رفض تكرار `question_code` داخل الملف.
- تخزين البصمة القانونية (`content_fingerprint`) في صف الـ staging لاستخدامها في قرار idempotency عند التنفيذ.
- رسائل الأخطاء بالعربية عبر `import-execute-messages.ts`.

### 4) واجهة الإدارة

- إتاحة القالب 09 في لوحة الاستيراد بنفس تدفق فحص → تجهيز → تنفيذ، مع تسمية واضحة أن النتيجة **مسودات بانتظار المراجعة** وليست أسئلة منشورة.
- عرض ملخص: مُضاف / متخطّى / نسخة جديدة على سؤال منشور، مع رابط لمسار المراجعة.

### 5) اختبارات E2E تشغيلية (Non-Prod)

سكربت `tests/e2e/question-import/run-question-import-e2e-08.ts` بحساب حقيقي (RLS مفعّلة) يغطي بوابة الخروج:
- تحقق القالب 09 ينجح ويرفض الصفوف غير الصالحة.
- التجهيز ينجح ويحفظ البصمة.
- الاستيراد يُنشئ مسودة نسخة وليس سؤالاً منشوراً.
- إعادة رفع الملف نفسه = تخطٍّ كامل (zero writes).
- تعديل سؤال منشور = نسخة جديدة مسودة + النسخة المنشورة سليمة.
- محاولة كتابة الإجابة الصحيحة مباشرة عبر المسار العام = مرفوضة.
- عدم تسريب الإجابة الصحيحة/المسودات للطالب عبر أي RPC عامة.
- خطأ في منتصف الملف = صفر كتابات (Atomicity).

توثيق النتائج في `docs/import/QUESTION-IMPORT-QB-BINDING-08.md`.

## المحظورات المحفوظة

- لا `upsert` عام على `questions`.
- لا كتابة إجابة صحيحة خارج نسخة بنك الأسئلة.
- لا استبدال سؤال منشور.
- لا تسريب إجابات للطلاب.
- Production خارج النطاق؛ التنفيذ على Non-Prod فقط.

## تفاصيل تقنية

- Migration واحدة جديدة: `qb_import_ingest_revision` + تعديل `import_execute_template` (نفس ملف الدالة، إعادة تعريف كاملة).
- ملفات جديدة: `src/lib/import/question-import-binding.server.ts` (تطبيع + بصمة قبل التجهيز)، وربطه من `import-staging.server.ts` كفرع خاص بالقالب 09.
- لا تغيير على منطق القوالب 01–08؛ يُعاد تشغيل اختبارات 07 للتأكد من عدم الانحدار.
