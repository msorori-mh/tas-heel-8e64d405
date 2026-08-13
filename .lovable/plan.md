# G1_PUBLISHED_REVISION_TARGET_BINDING_11

الهدف: إغلاق الفجوة G-1 بجعل ربط أسئلة التقييم (`assessment_questions`) يعتمد حصرياً على **وجهة (target) تخص النسخة المنشورة من السؤال**، بدل الأعمدة القديمة `questions.lesson_id/subject_id`.

بوابة هذه المرحلة: الكود + ملف الترحيل + البروفات + الاختبارات داخل المستودع فقط. **لن يُطبَّق أي ترحيل على قاعدة Lovable المشتركة** ضمن هذه المرحلة؛ يُوضع الملف تحت `supabase/migrations-pending/` وينتظر تفويضاً منفصلاً.

## الحالة الحالية (مؤكدة بالقراءة)

- `question_targets` (من ترحيل QB-01) يحتوي: `question_id, target_type, subject_id, unit_id, lesson_id, is_primary` — **بدون `revision_id`**، مع فهرس تفرد على `(question_id, target_type, coalesce(lesson_id,unit_id,subject_id))` وفهرس primary واحد لكل سؤال.
- `retarget_question` يحذف كل وجهات السؤال ويعيد كتابتها (mutable) — يؤثر على المنشور والمسودة معاً.
- `validate_assessment_question_link()` (تريغر على `assessment_questions`) يقارن `questions.lesson_id` / `questions.subject_id` مع درس التقييم — أي أنه يقبل مسودة ولا يعرف شيئاً عن النسخ.
- `publish_question_revision` يضبط `current_published_revision_id` عبر مسار idempotency، ولا يلمس الوجهات.

## نطاق العمل

### 1) ترحيل قاعدة البيانات (ملف pending جديد)

- إضافة `revision_id uuid` إلى `question_targets` مع FK إلى `question_revisions(id) ON DELETE CASCADE`.
- Backfill: لكل وجهة قائمة، اربطها بالنسخة المنشورة الحالية للسؤال؛ الوجهات اليتيمة (سؤال بلا نسخة منشورة) تُربط بأحدث نسخة مسودة أو تُحذف حسب نتيجة الجرد قبل التطبيق.
- جعل `revision_id NOT NULL` بعد الـbackfill.
- قيد تكامل: `revision_id` يجب أن تخص نفس `question_id` (تريغر تحقق، لأن FK المركب يحتاج مفتاحاً مركباً على `question_revisions`).
- تفرد جديد داخل النسخة: `(revision_id, target_type, coalesce(lesson_id,unit_id,subject_id))` بدل التفرد على مستوى السؤال، و`one primary per revision` بدل per question.
- تريغر يمنع تعديل/حذف وجهات نسخة **منشورة** (immutability مطابقة لبقية أبناء الـrevision).
- تعديل `retarget_question` ليعمل على نسخة مسودة محددة فقط (`p_revision_id`) ويرفض العمل على نسخة منشورة.
- تعديل `publish_question_revision`: التحقق قبل النشر من وجود وجهة واحدة primary على الأقل للنسخة المنشورة (validate_for_publish)، وعدم لمس وجهات النسخ السابقة (تبقى تاريخية).
- استبدال `validate_assessment_question_link()` بمنطق جديد:
  - يرفض إذا كان `questions.current_published_revision_id IS NULL` (مسودة → DENIED).
  - يقبل فقط عند وجود صف في `question_targets` بـ `revision_id = current_published_revision_id` ويطابق درس التقييم (`LESSON`) أو وحدته/مادته (`UNIT`/`SUBJECT` حسب هرمية الدرس).
  - لا يستخدم `questions.lesson_id/subject_id` إطلاقاً.
- عدم إعادة تعبئة الحقول القديمة في `questions` (مراجعة `qb_sync_question_legacy` والتأكد أنها لا تُستخدم كمصدر ربط).

### 2) مسار الاستيراد

- `qb_import_ingest_revision` (القالب 09): إدراج الوجهات مرتبطة بـ`revision_id` الخاصة بالمسودة المُنشأة.
- القالب 08 (`assessment_questions`): يبقى يرفض الأسئلة غير المنشورة، لكن رسالة الخطأ العربية في `src/lib/import/import-execute-messages.ts` تُحدَّث لتفرّق بين: «السؤال غير منشور»، و«لا توجد وجهة للنسخة المنشورة تطابق درس التقييم».
- تحديث `src/lib/import/import-contract.ts` (وثائق الاعتماديات) ليعكس أن القالب 08 يتطلب سؤالاً منشوراً + target مطابق.

### 3) البروفة المعزولة (Local PG 17)

سكربت جديد على نمط `tests/import/run-pg17-import-staging-03-apply-rehearsal.mjs`:
- baseline (شكل القاعدة الحالي) + QB-01 + الترحيل 11 → PASS.
- تطبيق مزدوج (idempotent) → PASS.
- backfill على بيانات تحاكي وجهات قديمة بلا `revision_id` → PASS.
- fail-closed: وجهة يتيمة/مخالفة تُوقف الترحيل.

### 4) E2E والاختبارات

سكربت `tests/e2e/content-import/run-g1-target-binding-e2e-11.ts` يغطي:
1. سؤال مسودة → ربط DENIED.
2. نسخة منشورة + target مطابق → ربط PASS.
3. نسخة منشورة + target يخص مسودة أحدث → DENIED.
4. نشر المسودة الأحدث → الـtarget الجديد يصبح صالحاً.
5. النسخة القديمة ووجهاتها تبقى تاريخية ولا تُغيّر الربط الحالي.
6. ZERO answer leakage (فحص طالب + Anonymous بـJWT حقيقي).
7. Regression كامل للقوالب 01–09 (تشغيل `run-unified-import-e2e-09.ts` بعد الترحيل في البروفة المعزولة).

### 5) سياسة retention لبقايا Staging (R-1)

توثيق قصير في `docs/import/` يثبّت: `import_jobs` سجل تدقيق دائم لا يُحذف؛ `import_staging_rows` تُنظَّف بعد N يوماً من الوصول لحالة نهائية؛ لا وظيفة تنظيف تلقائية تُفعَّل في هذه المرحلة (يدوي وموثق).

### 6) التقرير النهائي

`docs/import/G1-PUBLISHED-REVISION-TARGET-BINDING-11.md` يتضمن نتائج البروفات وE2E ومصفوفة القبول/الرفض، وينتهي بحالة `G1_11_CODE_AND_MIGRATION_READY` مع خطوة تالية معلّقة: تطبيق الترحيل على القاعدة المشتركة بتفويض منفصل.

## تفاصيل تقنية

- ملف الترحيل: `supabase/migrations-pending/2026xxxx_g1_published_revision_target_binding_11.sql` (لا يُنقل إلى `supabase/migrations/` ولا يُطبّق عبر أداة الترحيل في هذه المرحلة).
- كل الدوال المعدَّلة تبقى `SECURITY DEFINER` مع `SET search_path = public, pg_temp`، وتحافظ على نفس GRANTs الحالية.
- لا تغييرات على واجهة الطالب في هذه المرحلة.
