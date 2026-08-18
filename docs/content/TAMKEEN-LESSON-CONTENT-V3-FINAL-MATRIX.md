# TAMKEEN — Lesson Content V3 · Final Matrix

مصفوفة واحدة موحّدة (تحل محل التقارير الصغيرة المتفرقة).

## 1) القدرات النهائية السبع

| # | Capability | المالك | المصدر (legacy key) | Profile | Applicability افتراضياً |
|---|------------|--------|---------------------|---------|--------------------------|
| 1 | officialBookContent | OFFICIAL | officialBookContent | — (structured) | REQUIRED |
| 2 | tamkeenExplanationHtml | TAMKEEN | tamkeenExplanation | STATIC | REQUIRED |
| 3 | lessonSummaryHtml | TAMKEEN | quickReview | STATIC | REQUIRED |
| 4 | mindMapHtml | TAMKEEN | mindMap | STATIC | REQUIRED |
| 5 | labExperimentHtml | TAMKEEN | simulation | INTERACTIVE | OPTIONAL |
| 6 | officialBookQuestions | OFFICIAL | checkUnderstanding | — | REQUIRED |
| 7 | selfTest | TAMKEEN | lessonAssessment | — | REQUIRED |

خارج العقد: `originalBookPdf` (Legacy/Subject-level)، `studentPerformance` (مشتق)، `supportingResources` (اختياري وليس خطوة إلزامية).

## 2) مصفوفة الاختبارات (`src/lib/lessons/content-v3.test.ts` — 27 اختباراً، كلها ناجحة)

| المجال | ما يُثبته | الحالة |
|--------|-----------|--------|
| HTML STANDARD | ربط كل قدرة ببروفايلها | PASS |
| HTML STANDARD | JS ممنوع في STATIC ومسموح في INTERACTIVE داخل sandbox الحالي | PASS |
| HTML STANDARD | رفض أي CDN خارجي في البروفايلين | PASS |
| HTML STANDARD | إلزام RTL + viewport (mobile-first) | PASS |
| HTML STANDARD | كشف تسريب الإجابات داخل HTML (أنماط موحّدة مع مدقق الخادم) | PASS |
| HTML STANDARD | Workflow: UPLOAD→VALIDATE→DRAFT→PREVIEW→REVIEW→READY خطوة واحدة بعد نجاح التحقق | PASS |
| OFFICIAL QUESTIONS | دعم 8 أنواع أسئلة حقيقية | PASS |
| OFFICIAL QUESTIONS | لا إجابة نموذجية في أول payload للعميل | PASS |
| OFFICIAL QUESTIONS | لا كشف قبل "تأكد من إجابتك" | PASS |
| OFFICIAL QUESTIONS | fail-closed عند revision mismatch أو درس غير جاهز | PASS |
| OFFICIAL QUESTIONS | المقالي = مقارنة فقط بلا تصحيح آلي | PASS |
| SELF TEST | تثبيت revision على المحاولة | PASS |
| SELF TEST | rationale لا يصل قبل الكشف | PASS |
| SELF TEST | rationale يظهر عبر reveal payload فقط | PASS |
| READINESS | 7 قدرات فقط، بلا PDF/performance/resources | PASS |
| READINESS | فصل OFFICIAL عن TAMKEEN | PASS |
| READINESS | BOOK/LEARNING/ASSESSMENT/FULLY لدرس مكتمل | PASS |
| READINESS | التجربة ليست إلزامية افتراضياً، وتصبح إلزامية عند REQUIRED | PASS |
| READINESS | N/A = مستوفاة ومخفية | PASS |
| READINESS | fail-closed عند غياب محتوى الكتاب | PASS |
| READINESS | ASSESSMENT_READY محجوب بدون أسئلة/اختبر نفسك | PASS |
| READINESS | DRAFT مخفي عن الطالب | PASS |
| STUDENT UX | الترتيب V3 الحرفي | PASS |
| STUDENT UX | ترتيب العقد المشترك مطابق لـ V3 وبلا PDF | PASS |
| STUDENT UX | لا بطاقات فارغة ولا "غير متوفر" | PASS |
| STUDENT UX | progress ديناميكي حسب القدرات الفعلية | PASS |
| ADMIN | عرض 7 قدرات مع applicability + lifecycle + source | PASS |
| ADMIN | بيانات PDF القديمة محفوظة وغير ظاهرة للطالب | PASS |

## 3) Regressions (`npm test` = 209/209 PASS)

18B · 20B · 20C · 20D · 21B textbooks · 21B4B · 21B4C · 21B4D · 21B4E · 21B4F · 21B4G — جميعها ناجحة بعد التغيير.

## 4) Gaps

**SYSTEM_GAP (خلف بوابة الإنتاج):** أعمدة/جداول applicability + rationale + official answers غير مطبّقة على الإنتاج (draft SQL موجود).

**CONTENT_GAP (ليس عيباً في النظام):** لا يوجد بعد محتوى حقيقي لكل قدرة في كل درس (خصوصاً labExperimentHtml وrationale لكل خيار). لم يُؤلَّف أي محتوى تعليمي من الوكيل.
