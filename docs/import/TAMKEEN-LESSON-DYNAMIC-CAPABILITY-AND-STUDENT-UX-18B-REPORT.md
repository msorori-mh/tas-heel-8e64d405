# TAMKEEN_LESSON_DYNAMIC_CAPABILITY_AND_STUDENT_UX_FIX_18B — تقرير الإغلاق

الحكم النهائي: **LESSON_DYNAMIC_CAPABILITY_AND_STUDENT_UX_FIX_18B = PASS**

النطاق: UI + منطق اشتقاق مشترك + اختبارات. **بدون أي تغيير في قاعدة البيانات.**

## 1. المشكلة

صفحة الدرس كانت مبنية على رحلة ثابتة من 7 خطوات تُعرض لكل درس مهما كان محتواه:
بطاقات فارغة (خريطة ذهنية، تجربة عملية، فيديو، اختبار) على دروس القرآن، نسبة تقدم
مضللة (المقام 7 دائماً)، عناوين هيراركية طويلة تكسر عرض الجوال، ولا إشارة للمشغّل
تشرح سبب عدم اكتمال الدرس.

## 2. الحل المعماري

مصدر حقيقة واحد: `src/lib/lessons/lesson-capabilities.ts` (منطق نقي، بلا React ولا DB).

لكل درس تُشتق قائمة `LessonCapability` بالحقول: `type`, `available`, `studentVisible`,
`trackable`, `completed`, `label`, `action`, `source`, `readinessIssue`, `count`.

الأنواع: PRIMARY_CONTENT, SUMMARY, EXPLANATION, MINDMAP, PRACTICAL, VIDEO,
ASSESSMENT, LESSON_EXAM, EXTRA_RESOURCES.

القواعد الملزمة المطبَّقة:

- وجود صف في الجدول لا يعني قدرة متاحة: `isValidResourceUrl` يرفض الفارغ وغير http(s)
  ويقبل المراجع المُدارة (`supabase-storage://`, `lesson-internal://`).
- **مدخل أساسي واحد فقط**: نص الكتاب + PDF أساسي ⇒ بطاقة واحدة، والملف داخلها.
- `available ≠ trackable`: مقام التقدم = المتاح والظاهر والقابل للتتبع فقط، بلا NaN.
- تفكيك العنوان الهيراركي للعرض فقط (`parseLessonTitle`)، وأي عنوان لا يُفكَّك يُعاد كما هو.
- بوابات الوصول لم تتغير: الملخص والأسئلة مجانيان كما في `get_lesson_safe_extras`،
  وبقية الإثراءات خلف الاشتراك.
- لا قدرة مشتقة من اسم المادة إطلاقاً (يحرسها اختبار ثابت).

## 3. واجهة الطالب

`src/routes/_authenticated/lessons.$lessonId.tsx`: العرض حلقة على
`visibleLessonCapabilities`، ترقيم ديناميكي `index + 1` بلا فجوات، المحتوى الأساسي
(داخلي أو PDF عبر العارض الداخلي 18C) في بطاقة واحدة مفتوحة افتراضياً، ودرس بلا محتوى
أساسي يعرض رسالة واحدة واضحة بدل شبكة بطاقات فارغة.

## 4. إشارة الأدمن

`src/routes/_authenticated/admin.lessons.tsx` يستخدم نفس المحرك (مع تجاوز بوابة الاشتراك):
عمود «الجاهزية» يعرض `READY` أو السبب بالعربية
(`PRIMARY_CONTENT_MISSING`, `PRIMARY_RESOURCE_INVALID`, `DELIVERY_MODE_MISMATCH`,
`CONTENT_NOT_STUDENT_VISIBLE`)، ومؤشرات الأعمدة مشتقة من القدرات لا من وجود الصفوف.

## 5. التحقق

- `tests/student/lesson-dynamic-capabilities-18b.test.ts` — 14/14 PASS.
- `tests/student/lesson-dynamic-capabilities-18b.static.test.mjs` — 6/6 PASS (الحراس).
- `tests/student/` — 29/29 PASS.
- `tsgo --noEmit` نظيف.

## 6. المفاتيح النهائية

```
FIXED_SEVEN_STEP_UI=REMOVED
QURAN_IRRELEVANT_ACTIVITIES=ZERO
PRIMARY_CONTENT_MAPPING=IN_APP_OR_VALID_PRIMARY_RESOURCE
EXACTLY_ONE_PRIMARY_ACTION=ENFORCED
DYNAMIC_CAPABILITIES=YES
DYNAMIC_STEP_NUMBERING=YES
DYNAMIC_PROGRESS=YES
TRACKABLE_PROGRESS_ONLY=YES
EMPTY_RESOURCE_SPAM=ZERO
LESSON_TITLE_NORMALIZATION=PRESENTATION_ONLY
BREADCRUMB_DEDUPLICATION=YES
STUDENT_READY_CONTRACT=VALID_PRIMARY_CONTENT_ONLY
ADMIN_STUDENT_READY_SIGNAL=YES
DELIVERY_MODE_MISMATCH_SIGNAL=WARNING_NOT_FAILURE
QUICK_REVIEW_READY_DISTINCTION=SEPARATE_FROM_LESSON_READY
DIRECT_LESSONS=SUPPORTED
UNIT_LESSONS=SUPPORTED
PDF_LESSONS=IN_APP_VIEWER_18C
IN_APP_CONTENT=SUPPORTED
PLAYWRIGHT_VISUAL=PREVIOUSLY_VERIFIED_18B_PASS
STATIC_GUARDS=PASS
TESTS=29/29 PASS
TYPECHECK=PASS
BUILD=PASS
MIGRATION_REQUIRED=NO
SHARED_DB_WRITES=ZERO
BULK_DATA_CHANGE=ZERO
RLS_CHANGES=ZERO
RPC_CHANGES=ZERO
BLOCKERS=NONE
```

## 7. خارج النطاق

استرجاع محتوى القرآن (04 ثم 06) مسار مستقل في 18A/18A1. تتبّع فتح PDF أو مشاهدة الفيديو
كأحداث إكمال غير مدعوم اليوم، لذلك هذه القدرات خارج مقام التقدم بدل تزييف الإكمال.
