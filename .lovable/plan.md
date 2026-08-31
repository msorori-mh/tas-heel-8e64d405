# خطة: دعم تجارب معملية متعددة في مكوّن «التجربة المعملية»

## الهدف
السماح لفريق المحتوى برفع أكثر من تجربة معملية واحدة لنفس الدرس عبر مسار الحزمة الذهبية، مع الحفاظ على كل ضمانات CF10/CF11 (بصمات، حراس تسريب الإجابات، idempotency) ودون تعديل أي بيانات محتوى موجودة.

## الوضع الحالي (تم التحقق منه)
- عقد Golden Lesson V1 يفترض **artifact واحداً لكل capability**: `Partial<Record<GoldenCapability, …>>` في `golden-lesson-file-contract.ts`، ونفس النمط في `golden-lesson-contract.ts`.
- جدول `lesson_resources` في الإنتاج **لا يملك أي قيد unique** يمنع تعدد صفوف `experiment` لنفس الدرس — التعدد ممكن بنيوياً.
- واجهة `GoldenLessonPackageBuilder.tsx` تقبل ملفاً واحداً لكل مكوّن (`accept` دون `multiple`).
- `LessonResourcesDialog.tsx` يسمح يدوياً بإضافة موارد `experiment` متعددة، لكن خارج مسار الحزمة الذهبية (بدون staging/attestation).
- materialization في CF10/CF11 يشتق `resource_code` واحداً للتجربة من كود الدرس.

## التغييرات المقترحة

### 1. العقد والتحقق (`src/lib/content-factory/`)
- `golden-lesson-contract.ts`: توسيع `GoldenLessonArtifact` ليحمل `instanceIndex?: number` اختياري (غيابه = المثال الوحيد، توافقية خلفية كاملة مع حزم V1 الحالية).
- `golden-lesson-file-contract.ts`: السماح بملفات متعددة (`multiple`) لمكوّن `labExperimentHtml` فقط؛ بقية المكونات تبقى ملفاً واحداً.
- التحقق: كل ملف تجربة يمر بنفس فحوص HTML الحالية (شبكة = NONE، حجم ≤ 5MB) وبصمة SHA-256 مستقلة لكل ملف.

### 2. واجهة البناء (`GoldenLessonPackageBuilder.tsx`)
- حقل «التجربة المعملية» يقبل عدة ملفات ويعرضها كقائمة (اسم + حجم + بصمة) مع حذف فردي وزر «إضافة تجربة أخرى».
- عنوان فرعي لكل تجربة (اختياري، افتراضي: «تجربة 1، تجربة 2…»).
- manifest المُصدَّر يضم artifact لكل تجربة: `capability: labExperimentHtml` مع `instanceIndex: 0,1,2…`.

### 3. Staging والنشر (CF10/CF11)
- `golden-lesson-domain-staging.ts` و`lesson-component-publishing-v2.functions.ts`: لكل artifact تجربة يُنشأ صف `lesson_resources` منفصل بـ `resource_code` مشتق: `<LESSON>-LAB-01`، `-LAB-02`… (الأول يحتفظ بالكود الحالي بدون لاحقة إن كان وحيداً، لضمان idempotency مع النشرات السابقة).
- إعادة المحاولة تبقى idempotent: مطابقة بالبصمة + الكود، ولا تعديل لأي صف منشور.
- لا تغيير في حراس تسريب الإجابات أو عقود HTML.

### 4. عرض الطالب
- عارض الدرس يعرض موارد `experiment` مرتبة بـ `sort_order` — تحقق أنه يعرض القائمة كاملة وليس «أول مورد» فقط، وإصلاح إن لزم (UI فقط).

### 5. الاختبارات
- اختبار مركز: بناء manifest بتجربتين → staging → materialization ينتج صفّي `lesson_resources` بكودين مستقلين، وإعادة التشغيل لا تضاعف شيئاً.
- اختبار توافقية: حزمة V1 قديمة (تجربة واحدة بدون instanceIndex) تمر دون تغيير سلوك.
- `bunx tsgo --noEmit` + تشغيل اختبارات content-factory الموجودة.

### 6. قاعدة البيانات
- **لا migrations ولا تعديل بيانات.** الجدول جاهز بنيوياً للتعدد.

## خارج النطاق
- تجارب مضافة يدوياً عبر `LessonResourcesDialog` (تبقى كما هي).
- تعدد بقية المكونات الستة (تبقى ملفاً واحداً لكل منها).
- أي نشر أو تعديل بيانات دروس حقيقية.
