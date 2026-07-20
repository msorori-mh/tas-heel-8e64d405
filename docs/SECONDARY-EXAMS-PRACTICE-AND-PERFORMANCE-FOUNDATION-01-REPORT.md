# SECONDARY-EXAMS-PRACTICE-AND-PERFORMANCE-FOUNDATION-01

## النتيجة

**PASS للواجهة مع قيود قاعدة البيانات أدناه.** لا توجد ملاحظات CRITICAL أو HIGH أو MEDIUM ضمن التغييرات المنفذة. لم يحدث Deploy أو Publish أو Migration أو كتابة على بيانات إنتاجية.

## النطاق المنفذ

- تأكيد أن مساري التدريب والاختبار الرسمي يبدآن الجلسة عبر `start_exam_session` ولا ينشئان جلسة مباشرة.
- إضافة طمس دفاعي لـ `correct_index` و`explanation` في الواجهة حتى يعيد الخادم `reveal=true` صراحة.
- إضافة حارس synchronous single-flight إلى تسليم التدريب والاختبار الرسمي وتدريب الوحدة، لمنع نقرتين متزامنتين قبل تحديث React لحالة `pending`.
- إضافة رسالة آمنة عند فقد الاتصال تفرق بين عدم حفظ الإجابة وعدم التأكد من التسليم، من دون الادعاء بأن الطلب نجح.
- الحفاظ على المحاولات السابقة وإعادة المحاولة الحالية؛ لا تُمسح المحاولات المحفوظة عند إعادة تهيئة الواجهة.
- عدم إظهار مطالبة اشتراك عندما يعيد خادم قديم `subscription_required`؛ تظهر رسالة دعم عامة متوافقة مع الوصول المجاني.

## الاختبارات المباشرة

الأمر: `npm test`

- منع ظهور الإجابة والشرح قبل `reveal`.
- السماح بالكشف فقط بإذن صريح من الخادم.
- منع التسليم المزدوج المتزامن في الواجهة.
- رسالة آمنة عند فشل الشبكة أثناء التسليم.
- عدم طلب اشتراك عند بدء الامتحان في تجربة الوصول المجاني.
- رسائل رفض الصف والمنهج الصحيحين.

## تحقق الجودة

- الاختبارات: PASS.
- Lint scoped للملفات المعدلة: PASS.
- `git diff --check`: PASS.
- Typecheck الكامل: BLOCKED بسبب بيئة اعتماديات baseline: `package-lock.json` غير متزامن مع `package.json`، ونسخة `node_modules` المشتركة لا تحتوي `vite/client`. لم تُغيّر lockfile.
- Build: يعتمد على نفس بيئة الاعتماديات؛ يجب الاعتماد على Web CI أو clean install بعد إصلاح lockfile قبل الدمج.

## قيود وفجوات تحتاج تحققاً مستقلاً

- **NEEDS_USER_APPROVAL_FOR_SECURITY_MIGRATION إن فشل التحقق:** الحماية العميلة ليست بديلاً عن RPC. يجب اختبار `get_exam_session_state` بحساب طالب والتأكد أنه لا يعيد `correct_index` أو `explanation` قبل التسليم، وأن `submit_exam_session` idempotent على الخادم. أي إصلاح SQL/Migration خارج هذا PR ويتطلب موافقة صريحة.
- تحليل القوة والضعف التفصيلي يحتاج تصنيفاً موثوقاً للأسئلة (مهارة/موضوع/درس) وعقد بيانات معتمد. لم يُخترع قرار وظيفي؛ يسجل `NEEDS_USER_INPUT` للدورة التالية.
- تدريب الوحدة يجلب فقط الحقول العامة للسؤال (`id, lesson_id, question_text, options, question_type, sort_order`) ويصحح عبر RPC؛ لا يجلب مفتاح الإجابة.

## الملفات

- `src/lib/exam-client-safety.ts`
- `src/lib/exam-client-safety.test.ts`
- `src/lib/exam-start-errors.test.ts`
- `src/components/exams/ExamResultView.tsx`
- `src/routes/_authenticated/exams.training.$templateId.tsx`
- `src/routes/_authenticated/exams.strict.$templateId.tsx`
- `src/routes/_authenticated/units.$unitId.practice.tsx`
- `package.json`

## تأكيد السلامة التشغيلية

- Deploy/Publish: لا.
- Production writes: لا.
- Migration/RPC SQL: لا.
- تعديل بيانات طلاب: لا.
- تعديل دفع/محفظة/اشتراكات: لا.
