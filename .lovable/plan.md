# خطة تحميل حزمة Content V3 إلى الإنتاج (Migration + Content Import)

الهدف: نقل حزمة `chemistry-g12-iron-v3` إلى الإنتاج بشكل مطابق للـschema الفعلي المقاس اليوم، وبأقل عدد ممكن من عمليات الكتابة، مع رفع الحاجزين اللذين أوقفا Preflight أمس.

## 1. الحالة الفعلية المقاسة (أساس الخطة)

- PostgreSQL 17 — مطابق.
- `lesson_capability_lifecycle` موجود بـ14 عمودًا (بدون `applicability`) و104 صفوف READY بلا `ready_snapshot`/`ready_hash`، و40 صفًا لقدرة `originalBookPdf` المستبعدة من عقد V3.
- طبقة الإجابات (`question_option_rationales`, `official_question_answers`) والدالتان `get_lesson_official_questions` / `reveal_official_question_answer` غير موجودة — أي أن migration 21H هو أول من ينشئها، ولا يوجد schema إجابات قديم غير آمن.
- الهوية الإنتاجية: الصف الثالث الثانوي `03780461-126a-4c63-bd1b-493098582dd9`، مسار صنعاء `cbbe62a4-...15619`، مسار عدن `7751f472-...ac629e`… وعدد مواد الصف الثالث = **صفر** (لا كيمياء، لا درس حديد).
- الحزمة تعلن `capability_order` سباعية بلا PDF، و`production_apply: false`، و`identity_status: UNRESOLVED`.
- الكتب الثلاثة مُتحقَّق منها: صنعاء وعدن **ملف واحد بايتيًا** (195 صفحة)، وكتاب الأنشطة منفصل (51 صفحة).

## 2. المرحلة أ — رفع حاجزَي Preflight (migration واحد فقط)

migration مستقل يُطبَّق **قبل** 21H، مهمته توثيقية لا تغيّر ما يراه الطالب:

1. تثبيت الـ104 صفوف READY القديمة: تعبئة `ready_by` من `audit_logs` عند توفره وإلا حساب فاعل نظامي موثق، و`ready_snapshot`/`ready_hash` من المحتوى الحيّ الحالي (نفس المصادر التي يفحصها Preflight: `lesson_book_contents`, `lesson_explanations`, `lesson_summaries`, `lesson_resources`, `questions`, `lesson_assessments`). لا يتغير `status` لأي صف، فلا مكسب ولا خسارة رؤية.
2. تقاعد الـ40 صف `originalBookPdf`: نقلها إلى جدول أرشيف `lesson_capability_lifecycle_retired` ثم حذفها من الجدول الحيّ. لا يُحذف أي محتوى PDF — الكتب باقية على مستوى المادة في `subject_textbooks`.
3. إعادة تشغيل Preflight للتحقق من `READY_rows_without_current_evidence=0` و`legacy_originalBookPdf_lifecycle_rows_present=0`.

كما نحتاج قبل ذلك صلاحيات مشغّل تقرأ `supabase_migrations.schema_migrations` وتنفّذ `can_access_lesson`، وإلا يبقى قياس فارق الرؤية مستحيلًا و`visibility-diff` يفشل كما فشل أمس.

## 3. المرحلة ب — تطبيق 21H كما هو

يُطبَّق ملف `20260818210000_content_v3_21h_hardened_preflight.sql` بايت-لبايت دون تعديل (SHA مثبت ومطابق)، في transaction واحدة. لا يُطبَّق أي ملف 20C تاريخي مكرر. بعده مباشرة `postverify-21h.sql` + `visibility-diff-21h.sql`، وأي فشل يعني توقف ولا حذف.

## 4. المرحلة ج — هوية الكيمياء (أقل كتابة ممكنة)

كتابة بيانات عبر أداة الإدخال، لا عبر migration، وكلها idempotent بمفاتيح فريدة:

- مادة الكيمياء تحت الصف الثالث الثانوي بـ`code` ثابت (`CHEM-G12`) و`slug` فريد.
- ربطها بالمسارين عبر `subject_curriculum_tracks` (المفتاح المركب يمنع التكرار).
- درس «الحديد Fe»: `unit_id` يبقى NULL — العمود يقبل NULL والحزمة لا تعلن وحدة رسمية، فلا نخترع وحدة.
- `is_free = true` ولا أي بوابة اشتراك.
- `semester` و`sort_order` من مصدر الحزمة فقط؛ إن لم يثبتهما المصدر تبقى القيمة الافتراضية وتُسجَّل كـPENDING بدل التخمين.

## 5. المرحلة د — الكتب والتخزين

- سطل خاص (غير عام) لكتب المواد، والوصول عبر روابط موقّعة كما هو قائم اليوم.
- الملف الواحد المشترك بين صنعاء وعدن يُرفع مرة واحدة، ويُشار إليه من صفّين في `subject_textbooks` (صنعاء/عدن) بنفس `sha256` — لأن التطابق مثبت بالـhash وليس افتراضًا.
- كتاب الأنشطة: صف واحد `book_type = EXERCISE_BOOK` بتغطية مشتركة.
- قاعدة صارمة: لا استبدال صامت لأي مسار تخزين موجود بملف مختلف الـhash.
- الكتب تبقى خارج الرحلة السباعية؛ هي مرجع على مستوى المادة فقط.

## 6. المرحلة هـ — ربط القدرات السبع كمسودة

كل قدرة تُكتب في جدولها الطبيعي الموجود فعلًا: المحتوى الرسمي في `lesson_book_contents`، الشرح في `lesson_explanations`، الملخص في `lesson_summaries`، الخريطة والمختبر في `lesson_resources` (`html_resource_type` = mindmap/experiment)، الأسئلة الرسمية واختبار النفس عبر `questions` + `question_revisions` + `question_options` مع `current_published_revision_id`، والتقييم عبر `lesson_assessments` + `assessment_questions`.

قواعد الكتابة:

- محتوى HTML يُنقل كما هو من الحزمة دون إعادة صياغة.
- الإجابات والتبريرات تذهب حصريًا إلى `official_question_answers` و`question_option_rationales` المرتبطين بـ`revision_id`، ولا تظهر في أي payload أولي.
- كل صفوف دورة الحياة تُنشأ **DRAFT** فقط، ثم REVIEW، ثم READY بعد معاينة فعلية — لا قفزة مباشرة إلى READY.
- ملكية المنهج تبقى PENDING إن لم تثبتها metadata الإنتاجية.

## 7. ضمانات «لا كتابة غير لازمة»

- كل خطوة كتابة مسبوقة بقراءة تتحقق من عدم وجود الصف (upsert على مفتاح فريد).
- migrationان اثنان فقط طوال العملية: تثبيت الإرث + 21H المعتمد. كل ما تبقى بيانات.
- لا حذف ولا إعادة تسمية لأي محتوى قائم؛ القرآن ودروسه لا تُمَس.
- عدّاد كتابة متوقع يُسجَّل قبل التنفيذ ويُقارن بالفعلي في التقرير.

## 8. القبول

Preflight نظيف، `UNEXPECTED_VISIBILITY_GAIN=0` و`LOSS=0`، `ANSWER_LEAK=0`، القدرات السبع ظاهرة بالترتيب لحساب طالب دون أي paywall، واختبار على 390x844 و1280x900.
