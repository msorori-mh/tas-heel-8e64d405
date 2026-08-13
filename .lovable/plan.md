# 12C.5 → 12C.6 → 12C.7 — تنفيذ التنظيف المضبوط والتحقق وإعادة توليد القوالب

الجرد الحالي مقروء من القاعدة الآن ومطابق للنطاق المعتمد:
subjects 30، units 6، lessons 10، questions 14، exam_templates 4، exam_template_questions 6،
profiles 18، grades 3، curriculum_tracks 3، governorates 22، import_jobs 6.

## 12C.5 — التنفيذ

الحذف يتم حصراً عبر `admin_curriculum_delete` المحمية بـ Full Admin، ولا يتم عبر SQL مباشر.
الدالة تتحقق من هوية المستخدم (`auth.uid()`)، لذلك لا يمكن استدعاؤها من Migration أو من اتصال قاعدة مباشر؛
سيتم تشغيلها من جلسة أدمن حقيقية على المعاينة (تشغيل مؤتمت لواجهة `/admin/curriculum`).

الترتيب العكسي الآمن:

```text
exam_template_questions + exam_templates (مجموعة QA)
→ questions (14)
→ lessons (10) ومعها book_contents / summaries
→ units (6)
→ subjects (30)
```

لكل كيان: `admin_curriculum_delete_preview` أولاً، ثم التنفيذ إذا كانت المعاينة
`student activity = 0` و`published revisions = 0`؛ أي كيان يعود بنشاط طالب يُؤرشف ولا يُحذف
(وسيُبلَّغ عنه صراحة). لا مساس بـ profiles / grades / curriculum_tracks / governorates /
import_jobs / audit_logs / subscriptions / wallet / payments.

إن تعذّر تنفيذ الحذف من جلسة الأدمن لأي سبب تقني، أتوقف وأبلغك بدل اللجوء إلى حذف مباشر يتجاوز الحارس.

## 12C.6 — التحقق

استعلام قراءة واحد يُخرج مصفوفة النتائج المطلوبة:

```text
subjects, units, lessons, lesson_book_contents, lesson_explanations,
lesson_resources, lesson_assessments, assessment_questions, questions,
question_revisions, question_targets, exam_templates, exam_template_questions = 0
student activity affected = 0
profiles 18 / grades 3 / curriculum_tracks 3 / governorates 22 = unchanged
import_jobs retained / audit_logs retained + deletion entries
stuck applying jobs = 0
```

ثم اختبار حساب طالب حقيقي على المعاينة (الرئيسية، الصفوف، المواد، الدروس، الامتحانات)
للتأكد أن حالات القوائم الفارغة تعمل بلا أخطاء وحدة (console errors = 0)، مع لقطات شاشة.

## 12C.7 — إعادة توليد القوالب

تشغيل مولدات القوالب الرسمية (`scripts/generate-content-templates.mjs`،
`scripts/generate-import-templates.ts`، `generate-interactive-templates.mjs`) وإعادة تشغيل
اختبار تطابق العقد `tests/import/template-contract-sync-12a.test.ts` مع typecheck/build.

## المخرجات

- تحديث `docs/import/CURRICULUM-MASTER-DATA-RESET-12C.md` بنتائج 12C.5/12C.6/12C.7.
- عند خروج كل الفحوص PASS: فتح `FIRST_REAL_CONTENT_BATCH_12` مباشرة بلا موافقة إضافية.
