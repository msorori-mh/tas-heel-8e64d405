# 14F + 14G — تحليل الأداء الوزاري والأسئلة المتكررة (تنفيذ متوازٍ)

## ما تم التحقق منه قبل الخطة

- `exam_sessions` تحتوي فعلاً على: `ministerial_model_id`, `ministerial_attempt_mode`, `is_final`, `grading_status`, `result_json`, `score`, `total_points`, `started_at`, `completed_at` — إذن لا حاجة لجدول محاولات جديد.
- `submit_ministerial_exam_session` هي التي تكتب `result_json` (تحوي attempt_mode والأعداد والنتيجة)، والتصحيح يتم على الخادم.
- `ministerial_exam_models` تحمل `subject_id` و`curriculum_track_id` و`academic_year` و`round_code` و`model_label` — وهي مصدر النطاق (subject + track).
- `ministerial_exam_questions` تحمل `question_id` + `published_revision_id` (تثبيت تاريخي) — إذن هوية «نفس السؤال» = `question_id`، والظهور يحتفظ بالنسخة.
- `question_targets` تحمل `lesson_id`/`unit_id`/`is_primary` — مصدر زر «راجع الدرس» ومصدر التحليل حسب الدرس.
- لا يوجد حالياً أي RPC للتحليل أو للتكرار (لا `%analytics%` ولا `%repeated%` في قائمة الدوال).

## 14F — تحليل أداء الطالب في الوزاري

### طبقة الخادم (RPC واحدة رئيسية)

`get_ministerial_performance_overview()` — SECURITY DEFINER، بلا معطيات، تعمل دائماً على `auth.uid()` فقط:

- المصدر: `exam_sessions` حيث `ministerial_model_id IS NOT NULL` و`user_id = auth.uid()` والحالة `submitted`.
- عزل المسار: JOIN مع `ministerial_exam_models` وتقييد `curriculum_track_id` بمسار الطالب من `profiles` (الجلسات القديمة خارج المسار لا تُحتسب).
- المخرجات (JSONB واحد لتقليل الطلبات على الشبكة الضعيفة):
  - `summary`: attempts_count, avg_score, best_score, latest_score, improvement_trend (فرق متوسط آخر 3 محاولات عن السابقة), avg_elapsed_seconds.
  - `by_mode`: training vs strict (عدد ومتوسط).
  - `by_subject`: subject_id, subject_name, attempts, avg_percentage, best_percentage.
  - `by_lesson`: عبر `exam_session_answers` + `exam_session_questions` + `question_targets` (primary) → lesson_id, lesson_title, asked, correct, wrong, blank, accuracy.
  - `weak_lessons`: أضعف الدروس (accuracy < 60% مع 3 أسئلة على الأقل).
  - `patterns`: نسبة الفراغات، نسبة الخطأ، الأسئلة قيد التصحيح اليدوي.
- لا تُعاد أي `correct_option_code` ولا نص حل ولا `is_correct` خام على مستوى السؤال — فقط أعداد مجمّعة.

### الواجهة

صفحة جديدة `/ministerial-exams/performance` (Route: `_authenticated/ministerial-exams.performance.tsx`):
- بطاقات علوية: متوسط النتيجة، أفضل نتيجة، عدد المحاولات، اتجاه المستوى (سهم + نسبة).
- «حسب المادة»: قائمة بأشرطة تقدم بسيطة.
- «حسب الدرس»: تبويب داخلي (قوي / يحتاج مراجعة) مع رابط الدرس.
- «التدريب مقابل المحاكاة»: مقارنة صفّين.
- حالة فارغة عربية عند عدم وجود محاولات، وSkeletons خفيفة، Mobile-first + RTL، بلا مكتبات رسوم ثقيلة (أشرطة CSS فقط).
- مدخل من صفحة الوزاري الرئيسية ومن `/progress`.

## 14G — الأسئلة الوزارية الأكثر تكراراً

### طبقة الخادم

`list_repeated_ministerial_questions(_subject_id uuid, _min_occurrences int default 2, _year_from int default null)` — SECURITY DEFINER:
- النطاق الحاسم: `subject_id + curriculum_track_id` لمسار الطالب من `profiles`؛ نماذج عدن لا ترفع عدّاد صنعاء.
- تُحتسب النماذج المنشورة فقط.
- التجميع: `GROUP BY meq.question_id` مع `count(distinct model_id)` كـ occurrence_count.
- لكل سؤال: نص السؤال من النسخة الأحدث المثبّتة (بدون خيارات صحيحة/حلول)، `occurrences[]` تحوي model_id, model_code, academic_year, round_code, model_label, published_revision_id، بالإضافة إلى الدرس المرتبط من `question_targets` (primary).
- لا مفتاح إجابة ولا حلول في الحمولة إطلاقاً.

`list_repeated_ministerial_subjects()` — عدد الأسئلة المتكررة لكل مادة داخل مسار الطالب (لبناء شاشة الاختيار).

### الواجهة

صفحة `/ministerial-exams/repeated` + `/ministerial-exams/repeated/$subjectId`:
- بطاقة لكل سؤال: النص، «تكرر N مرات»، شرائح السنوات/الأدوار.
- زرّان: «تدرب على السؤال» (يفتح أحدث نموذج يحوي السؤال) و«راجع الدرس» (من question_targets).
- فلاتر: المادة، السنة من، الحد الأدنى للتكرار.
- بلا كشف أي إجابة، Mobile-first + RTL.

## الأمان والاختبارات

- كل الوصول عبر RPC آمنة فقط؛ لا SELECT مباشر من الواجهة على `ministerial_exam_questions` أو `question_revisions`.
- `anon` DENY، وبيانات طالب آخر DENY (لا معطى user_id في أي RPC).
- اختبار ثابت جديد `tests/security/ministerial-analytics-14fg.static.test.mjs`: منع أي `correct_option_code` / `is_correct` / `answer_key` في مسارات 14F/14G، ومنع الاستعلام المباشر على جداول العضوية.
- تشغيل اختبارات الانحدار 14B/14C/14D/14E + typecheck.
- لا بيانات Demo على القاعدة المشتركة.

## ملاحظة عن الترحيلات

الـ RPCs الأربع تُكتب كملف SQL واحد تحت `supabase/migrations-pending/` ولا تُطبّق على القاعدة المشتركة إلا بعد مراجعتك واعتمادك صراحة (كما في 14E). لذلك ستظهر الصفحات مع حالات فارغة/رسالة «قيد التفعيل» حتى الاعتماد.

## التقارير

- `docs/ministerial-exams/PAST-MINISTERIAL-EXAMS-PERFORMANCE-ANALYTICS-14F-REPORT.md`
- `docs/ministerial-exams/REPEATED-MINISTERIAL-QUESTIONS-14G-REPORT.md`
