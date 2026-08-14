# LESSON_EXTERNAL_PDF_DELIVERY_13F — تسليم الدرس كملف خارجي (PDF / Google Drive)

الحالة: **PASS_READY_FOR_APPLY** — الترحيل معلّق في `supabase/migrations-pending/20260815010000_lesson_external_pdf_delivery_13f.sql` ولم يُطبَّق على القاعدة المشتركة.

## المشكلة
بعض الدروس محتواها ملف PDF على Google Drive. سابقاً كانت صفحة الدرس تعرض "لم يُضف محتوى الكتاب" لأن `lesson_book_contents` فارغ.

## القرار التصميمي
- **لا عمود URL جديد على `lessons`.** `lesson_resources.url` يبقى المصدر الوحيد.
- `lessons.delivery_mode` ∈ (`in_app_content`, `external_resource`) — القيمة الافتراضية `in_app_content` فلا يتأثر أي درس حالي.
- `lesson_resources.is_primary` (مورد واحد لكل درس عبر Partial unique index) هو ما يحدد "محتوى الدرس".
- **مشتق تلقائياً**: Trigger `sync_lesson_delivery_mode` يضبط `delivery_mode` حسب وجود مورد أساسي؛ ولا حاجة لإعادة كتابة `import_execute_template`.
- **أقل تعديل على القالب 06**: عمود واحد جديد `is_primary` داخل allowlist الميتاداتا (GAP-05)، وTrigger يسقطه إلى العمود الحقيقي.

## RPCs
| الدالة | الصلاحية | الغرض |
|---|---|---|
| `admin_set_primary_lesson_resource(_lesson_id, _resource_id)` | `is_content_staff` فقط | تعيين/إلغاء المورد الأساسي |
| `get_lesson_primary_resource(_lesson_id)` | authenticated + `can_access_lesson` | قراءة آمنة للمورد الأساسي |

## واجهة الطالب
`src/routes/_authenticated/lessons.$lessonId.tsx` يعرض بطاقة `ExternalLessonDelivery` أعلى رحلة التعلم:
- روابط Drive تُطبَّع إلى `/preview` داخل iframe و`/view` عند الفتح في تبويب جديد.
- الروابط غير الصالحة أو غير https تُرفض ولا تُعرض.
- خطوة "اقرأ الدرس" تشير إلى الملف الخارجي بدل رسالة "غير متوفر".
- البوابة الحالية `canAccessEnhancements` تحمي الرابط كما هي.

## واجهة الإدارة
`LessonResourcesDialog`: مربع اختيار "محتوى الدرس الأساسي" لكل مورد، والحفظ يستدعي RPC أعلاه.

## عدم الكسر
- القراءة في الطالب والإدارة تفشل بهدوء (fallback) قبل تطبيق الترحيل.
- 9/9 اختبارات `tests/student/lesson-external-pdf-delivery-13f.test.ts` + 88 اختبار vitest ناجحة، وفحص الأنواع نظيف.
