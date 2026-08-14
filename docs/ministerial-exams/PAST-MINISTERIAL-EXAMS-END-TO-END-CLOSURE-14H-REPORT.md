# PAST_MINISTERIAL_EXAMS_END_TO_END_CLOSURE_14H — تقرير الإغلاق التشغيلي

مرحلة تحقق وإغلاق (Closure/Verification). لم تُضف أي ميزة جديدة، ولم يُعد تصميم أي جدول،
ولم يُنشأ محرك محاولات جديد، ولم تتغير TCS-2 ولا معمارية المادة المشتركة.

## 1. أدوات الإثبات

| الأداة | الملف |
| --- | --- |
| مشغّل البروفة المعزولة (PG17) | `tests/import/run-pg17-ministerial-e2e-closure-14h-rehearsal.sh` |
| سيناريو E2E الكامل | `tests/import/fixtures/pg17-ministerial-e2e-closure-14h-smoke.sql` |

يعيد المشغّل بناء السلسلة كاملة 14A→14G على عنقود PostgreSQL 17 مؤقت (يُحذف بعد التشغيل)،
ثم يقود الـ RPCs الحقيقية من إنشاء النموذج حتى التحليلات.

**النتيجة: 101/101 assertion = PASS.**

القاعدة المشتركة لم تستقبل أي بيانات وزارية وهمية في هذه المرحلة (تحقق للقراءة فقط في القسم 6).

## 2. الأعطال المكتشفة والتغييرات الإنتاجية المطبَّقة (Production Changes ≠ Verification)

هذا القسم وحده يوثّق ما **تغيّر فعلياً على القاعدة المشتركة** في 14H. كل ما عداه في هذا التقرير
تحقق للقراءة فقط. لكل إصلاح: اسم التغيير + بصمة الملف + النص المطبق + السبب + التحقق بعد التطبيق.

### CHANGE-14H-01 — `ministerial_session_nullable_score_14h_defect01`

| البند | القيمة |
| --- | --- |
| اسم التغيير | `CHANGE-14H-01 / DEFECT-14H-01` |
| الملف | `supabase/migrations/20260816010000_ministerial_session_nullable_score_14h_defect01.sql` |
| SHA-256 | `3ec278600371f2598121a69e687fec29cb716094fad2a2c62c70d3b9e671812e` |
| النوع | DDL على أعمدة قائمة (لا جدول جديد، لا بيانات) |
| حالة التطبيق | مُطبَّق على القاعدة المشتركة بنص الملف حرفياً |

**النص المطبق (الجُمَل التنفيذية):**

```sql
ALTER TABLE public.exam_sessions ALTER COLUMN correct_answers DROP NOT NULL;
ALTER TABLE public.exam_sessions ALTER COLUMN score DROP NOT NULL;

COMMENT ON COLUMN public.exam_sessions.correct_answers IS '...';
COMMENT ON COLUMN public.exam_sessions.score IS '...';
```

**سبب الإصلاح:** 14E يكتب عمداً `correct_answers = NULL` (منع أي مؤشر تجميعي عن مفتاح الإجابة)
و`score = NULL` أثناء انتظار التصحيح اليدوي، بينما كان العمودان `NOT NULL DEFAULT 0` منذ محرك
الامتحانات الأصلي (`20260607234143`)، فكان كل استدعاء لـ `create_ministerial_exam_session`
و`submit_ministerial_exam_session` يفشل بخطأ 23502 — أي أن المسار الوزاري كله معطّل في الإنتاج.
النطاق الأدنى: إسقاط `NOT NULL` عن هذين العمودين فقط؛ القيم الافتراضية وقيود `>= 0` ومسار
الامتحانات العادي بلا تغيير.

**Post-Apply Verification (استعلام قراءة على القاعدة المشتركة):**

```
information_schema.columns → correct_answers.is_nullable = YES
                             score.is_nullable          = YES
CHECK (>= 0)                = باقية كما هي
بيانات مضافة                = 0 صفوف
```

### CHANGE-14H-02 — `ministerial_analytics_grading_status_14h_defect02`

| البند | القيمة |
| --- | --- |
| اسم التغيير | `CHANGE-14H-02 / DEFECT-14H-02` |
| الملف | `supabase/migrations/20260816010500_ministerial_analytics_grading_status_14h_defect02.sql` |
| SHA-256 | `4894e5c3846c4e451c98b7915be29ed889ba5fbe155114e5fdd448750c479e69` |
| النوع | `CREATE OR REPLACE FUNCTION` لدالة تحليلات واحدة (لا تغيير في التوقيع ولا في مفاتيح الحمولة) |
| حالة التطبيق | مُطبَّق على القاعدة المشتركة بنص الملف حرفياً |

**النص المطبق (جوهر التغيير داخل `public.get_ministerial_performance_overview()`):**

```sql
-- قبل:  and es.grading_status = 'GRADED'      -- على مستوى الجلسة
-- بعد:  and es.grading_status = 'COMPLETED'   -- (شرطان اثنان فقط)
```

بقي فلتر `'GRADED'` على مستوى **الإجابة** (`exam_session_answers.grading_status`) كما هو، لأنه المفردة
الصحيحة هناك.

**سبب الإصلاح:** مفردات حالة الجلسة المعتمدة في QB-01 هي
`IN_PROGRESS | SUBMITTED_PENDING_GRADING | PARTIALLY_GRADED | COMPLETED`، و14E يكتب `COMPLETED`،
فكان شرط الجلسة `'GRADED'` لا يطابق أي صف: `graded_attempts_count = 0` وكل المتوسطات `NULL`
لكل الطلاب — أي أن صفحة تحليلات الأداء 14F فارغة دائماً في الإنتاج.

**Post-Apply Verification (استعلام قراءة على القاعدة المشتركة):**

```
pg_proc → get_ministerial_performance_overview()  موجودة، تعريف واحد
md5(pg_get_functiondef)                          = 90a81efbba9894248f2297bc458e109b
تحتوي 'COMPLETED' (مستوى الجلسة)                  = true
تحتوي 'GRADED'    (مستوى الإجابة فقط)             = true
has_function_privilege('anon', …, 'execute')     = false
بيانات مضافة                                     = 0 صفوف
```

### ما لم يتغيّر إنتاجياً في 14H

لا جداول جديدة، ولا أعمدة جديدة، ولا سياسات RLS معدّلة، ولا GRANTs جديدة، ولا صفّ بيانات واحد
على القاعدة المشتركة. كل ملفات `tests/` و`docs/` في هذا التقرير أدوات تحقق فقط ولا أثر لها على الإنتاج.


## 3. تصحيحات بيئة الاختبار المعزولة (لا تمس الإنتاج)

- `tests/import/fixtures/pg17-prereq-13c-14b-dependencies.sql`: إضافة `exam_templates.code` ونوع `exam_session_status`
  ليطابق الإنتاج.
- `tests/import/fixtures/pg17-prereq-qb-runtime.sql`: `exam_sessions.mode/status` أصبحا من نوعي الـ enum كما في الإنتاج.

## 4. مصفوفة الإغلاق

```
OPERATOR_FLOW           = PASS   (M01 → M02 → Publish عبر RPC فقط، رموز TCS-2 مولّدة، لا كتابة مباشرة)
M01_M02_IDEMPOTENCY     = PASS   (إعادة التشغيل الحرفي = SKIP بلا تكرار؛ الحذف من الدفعة لا يزيل عضوية)
TRACK_ISOLATION         = PASS   (مادة مشتركة صنعاء+عدن: كل طالب يرى مسار​ه فقط، والرابط المباشر وإنشاء الجلسة مرفوضان)
TRAINING_FLOW           = PASS   (كشف قبل الإجابة مرفوض، بعدها مسموح، ثم قفل الإجابة، شرح ودرس مرتبطان)
STRICT_FLOW             = PASS   (لا كشف، مؤقّت خادم ثابت بعد الخروج والعودة، تسليم مزدوج/نافذتين = نتيجة واحدة)
EXACT_REVISION_HISTORY  = PASS   (نشر R2 لاحقاً لا يغيّر لقطة/تصحيح/كشف/حل/درس النموذج والجلسات القائمة على R1)
SERVER_GRADING          = PASS   (التصحيح كله على الخادم، ولا مدخلات تصحيح من العميل)
MANUAL_GRADING          = PASS   (جلسة مختلطة: التلقائي مصحّح، اليدوي PENDING_MANUAL_REVIEW، لا نسبة نهائية، is_final=false)
RESULTS_HISTORY         = PASS   (الدرجة/النسبة/الصحيح/الخطأ/الفراغ/الزمن/المادة/السنة/الدور/المراجعة/الدرس + سجل المحاولات)
PERFORMANCE_14F         = PASS   (العدادات والنِّسَب والتحسن والزمن، التدريب مقابل الصارم، حسب المادة والدرس والدروس الضعيفة)
REPEATED_14G            = PASS   (نفس السؤال في 3 نماذج صنعاوية + نموذج عدني ⇒ occurrence_count = 3 لطالب صنعاء)
ANSWER_LEAK             = ZERO   (حالة الجلسة، النتيجة، result_json، التحليلات، والأسئلة المتكررة بلا أي مفتاح إجابة)
ANON_EXECUTE            = ZERO   (كل RPC وزاري حساس محجوب عن anon وPUBLIC؛ الدوال الداخلية محجوبة عن authenticated)
CROSS_STUDENT_ACCESS    = DENY   (حالة الجلسة ونتيجتها لطالب آخر مرفوضتان)
GENERIC_SESSION_BYPASS  = CLOSED (create_exam_session_with_snapshot على قالب وزاري مرفوض)
UI_MOBILE_RTL           = PASS   (7 صفحات وزارية: RTL، Mobile-first، حالات تحميل/فراغ/أخطاء عربية، نصوص V1 دقيقة)
SHARED_DB_TEST_DATA     = ZERO   (نماذج 0، عضويات 0، جلسات وزارية 0؛ بيانات المنهج لم تتغير)
BLOCKERS                = NONE
```

### REGRESSION

```
question bank (source/hash/import)   PASS   (37 + 438 + vectors)
01–09 content import                 PASS مع عطلين سابقين خارج نطاق 14H (انظر أدناه)
TCS-2 / shared subjects / groups     PASS
direct lessons without units         PASS
external PDF lessons                 PASS
14B / 14C / 14D / 14E / 14F / 14G    PASS (ضمن بروفة 14H الكاملة)
typecheck (tsgo)                     PASS
```

عطلان **سابقان لهذه المرحلة** وخارج نطاق النماذج الوزارية (لم تُلمس شفرتهما هنا):

1. `src/lib/content-import-subject-names.test.ts` — اختباران يتوقعان `pass` بينما صار المُحقِّق يعيد `warn`
   بسبب رسالة INFO عن اشتقاق `subjects.slug`.
2. `tests/import/import-staging-execution-03.test.ts` — قائمة metadata المسموحة في SQL ينقصها `is_primary`.

يُنصح بمعالجتهما في مسار الاستيراد لا في مسار الوزاري.

## 5. تفاصيل سيناريو E2E المنفذ

مادة واحدة مشتركة بين صنعاء وعدن، و4 نماذج (صنعاء 2022/2024/2025 + عدن 2025)، و3 أسئلة
(سؤالان تلقائيان وسؤال يُصحَّح يدوياً)، و4 محاولات (تدريب، صارم، صارم منتهي الوقت، جلسة مختلطة).
تشمل الأدلة: منع النشر عن `content_manager` والسماح لـ `publisher`، تثبيت النسخة الدقيقة عند العضوية،
تطابق القالب مع العضوية، إعادة التشغيل الحرفي، ورفض أي عمود يحمل إجابة داخل M02.

## 6. تحقق القاعدة المشتركة (قراءة فقط)

```
ministerial_exam_models      = 0
ministerial_exam_questions   = 0
جلسات وزارية                 = 0
curriculum_tracks / subjects = لم تتغير
anon EXECUTE على دوال التحليلات = false
get_ministerial_performance_overview = النسخة المصحّحة (COMPLETED)
exam_sessions.correct_answers / score = nullable
```

## الحكم النهائي

```
MINISTERIAL_EXAMS_END_TO_END_CLOSURE_14H = PASS_PRODUCTION_READY
```

المسار الوزاري جاهز تشغيلياً: الخطوة التالية إدخال المحتوى الدراسي الحقيقي، ثم أول نموذج وزاري
حقيقي عبر M01/M02، دون أي توسعة برمجية إضافية للـ Backend الوزاري.
