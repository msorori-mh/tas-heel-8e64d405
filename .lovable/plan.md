# CURRICULUM_CONTENT_ENTRY_READINESS_13

إغلاق تشغيلي قبل تسليم النظام لموظف المحتوى (يوسف). **لن تُكتب أي بيانات منهج في قاعدة البيانات** — مراجعة، إصلاح واجهات، وتوثيق فقط.

## ما تم التحقق منه فعلياً الآن

- أعمدة `group_code` و `group_name` **موجودة في جدول subjects** (DB ✅).
- لكنها **غير موجودة** في عقد الاستيراد `src/lib/import/import-contract.ts` ولا في قالب 01 ولا في نافذة إضافة/تعديل المادة → قرار SUBJECT_AS_BRANCH **غير مطبق تشغيلياً**.
- الحذف الصلب ما زال مباشراً عبر PostgREST في: `SubjectDeleteDialog.tsx`، `UnitDeleteDialog.tsx`، `LessonDeleteDialog.tsx` (`.from(...).delete()`) — مسار حذف ثانٍ غير محمي بجانب `admin_curriculum_delete`.
- ما زال في `/admin/import` قسم أزرار معطلة بشارة «قريباً».

## نطاق العمل

### 1. إغلاق SUBJECT_AS_BRANCH
- إضافة `group_code` (اختياري) و `group_name` (اختياري) إلى عقد قالب 01 وإعادة توليد القالب.
- تحديث `SubjectEditDialog`: عند الإنشاء `subject_code` إلزامي + حقول التجميع؛ عند التعديل `subject_code` و `group_code` للقراءة فقط، `name` و `group_name` قابلان للتعديل.

### 2. توحيد مسار الحذف
- تحويل حوارات حذف المادة/الوحدة/الدرس لاستخدام `admin_curriculum_delete_preview` + `admin_curriculum_delete` فقط، وإزالة أي `.delete()` مباشر من واجهة الإدارة.

### 3. تنظيف مركز الاستيراد `/admin/import`
- حذف قسم «قريباً» وأي بقايا POC المحافظات.
- اشتقاق ترتيب قائمة نوع القالب من `IMPORT_EXECUTION_ORDER` (01→02→…→07→09→08).
- تصحيح صياغة التسلسل: «07 إنشاء التقييم ← 09 استيراد الأسئلة كمسودات ← مراجعة ← نشر ← 08 الربط».
- تحسين جدول سجل العمليات بأعمدة مسماة: Rows / Inserted / Updated / Skipped / Blocked / Errors / Status، وإزالة عبارة «تفاصيل الأخطاء لاحقاً».
- زر تنزيل حزمة القوالب الرسمية التسعة كاملة + رابط دليل التعبئة.

### 4. التوثيق
- `docs/import/NAMING-CONVENTION.md`: اتفاقية رسمية لأكواد subject/unit/lesson/explanation/resource/assessment/question.
- `docs/import/DATA-DICTIONARY-AR.md`: قاموس عربي لكل عمود في القوالب 01–09 (إلزامي/اختياري، النوع، المرجع، مثال).
- `docs/import/CONTENT-OPERATOR-GUIDE-AR.md`: دليل مختصر لموظف المحتوى بترتيب العمل والبوابات.

### 5. التحقق النهائي
- مراجعة القوالب 01–09 حرفياً مقابل العقد (اختبارات القوالب الحالية).
- تأكيد أن دور `content_manager` يكفي للإدخال دون Full Admin (قراءة سياسات RLS والدوال).
- تأكيد دعم الهرم Subject→Unit→Lesson و Subject→Lesson (درس بلا وحدة).
- تشغيل الاختبارات + typecheck، وإخراج التقرير النهائي `docs/import/CURRICULUM-CONTENT-ENTRY-READINESS-13.md` مع الحكم `CONTENT_ENTRY_OPERATOR_READY = YES/NO` وقائمة الموانع المتبقية إن وُجدت.

## ملاحظات تقنية
- لا Migration جديدة متوقعة إلا إذا لزم تعديل دالة `admin_curriculum_delete` لدعم الحذف من الحوارات؛ في تلك الحالة تُعرض للموافقة قبل التطبيق.
- لا `INSERT` على أي جدول منهج.
