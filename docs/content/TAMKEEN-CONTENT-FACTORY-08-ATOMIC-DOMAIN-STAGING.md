# Content Factory 08 — Atomic Domain Staging

## القرار

`SOURCE_READY / PRODUCTION_NOT_APPLIED`

CF08 تحول الإصدار الموثق والمعتمد إلى خطة staging ذرية للقدرات السبع، دون لمس جداول الدرس الحية ودون نشر أو READY.

## العقد

- المدخل الوحيد: current package version بحالة `APPROVED_FOR_STAGING` وله CF07 bundle attestation مطابق.
- الخادم يعيد تنزيل ZIP الخاص ويعيد فحصه، ثم يبني سبعة records مرتبة بخريطة ثابتة إلى أهداف الدومين.
- PostgreSQL يعيد حساب SHA-256 من `bytea` لكل source/provenance/answers؛ لا يثق في hash أو mapping مرسل من العميل.
- batch + سبعة capabilities + answers companion الاختياري تكتب في transaction واحدة؛ أي اختلاف يعيد كل العملية.
- retry لنفس package/version يعيد idempotent بصفر كتابة.
- staging immutable، ولا توجد UPDATE/DELETE policies أو RPC تنفيذ حي.
- إجابات server-only في جدول منفصل لا يقرأه إلا admin؛ الطالب وcontent_manager لا يريانها.

## خريطة الأهداف

1. `officialBookContent → lesson_book_contents`
2. `tamkeenExplanationHtml → lesson_explanations`
3. `lessonSummaryHtml → lesson_summaries`
4. `mindMapHtml → lesson_resources:mindmap`
5. `labExperimentHtml → lesson_resources:experiment`
6. `officialBookQuestions → questions:official`
7. `selfTest → lesson_assessments:self_test`

وتثبت خريطة lifecycle: `officialBookContent, tamkeenExplanation, quickReview, mindMap, simulation, checkUnderstanding, lessonAssessment`.

## خارج النطاق

- الكتابة في `lesson_*`, `questions`, `assessment_*` الحية.
- resolve هوية الصف/المادة/الدرس على الإنتاج.
- REVIEW/READY أو student visibility أو publication.
- تطبيق migrations المعلقة.

## بوابة الخروج

اختبارات mapping والبايتات، rollback الذري، idempotency، RLS للإجابات، PG17، typecheck/build وWeb CI كاملة.
