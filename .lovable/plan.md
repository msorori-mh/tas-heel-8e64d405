# 15B SHARED APPLY — تطبيق دفتر الأخطاء (طالب + أدمن) على القاعدة المشتركة

تطبيق الترحيل النهائي لدفتر الأخطاء المشتق، ثم التحقق الفعلي من سطح الطالب وسطح الأدمن، ثم الإغلاق بتقرير.

## 1. ما سيُطبَّق (مسجَّل قبل التنفيذ)

- الملف: `supabase/migrations-pending/20260817010000_my_mistakes_derived_model_15b.sql`
- SHA-256: `b3568c4a2a7e86df53de8e08f76a9476fb9e8a029d3875afdd18ee9137649727`
- سيُرسل النص حرفياً كما هو (نفس النص الذي اجتاز آخر بروفة PG17 لـ 15B + 15B_A) — بلا إعادة صياغة أو تنسيق.

تواقيع الدوال والصلاحيات الموجودة في النص:

```text
_my_mistakes_safe_options(jsonb)                                  REVOKE PUBLIC/anon → GRANT authenticated
list_my_mistakes(uuid,uuid,text,text,text,int,int)                REVOKE PUBLIC/anon → GRANT authenticated
get_my_mistake_detail(uuid)                                       REVOKE PUBLIC/anon → GRANT authenticated
get_admin_mistake_insights(uuid,uuid,uuid,uuid,text,
                           timestamptz,timestamptz,int)           REVOKE PUBLIC/anon → GRANT authenticated + حارس أدمن داخلي
```

- `NEW_MISTAKE_TABLE = NO`: النص لا يحتوي أي `CREATE TABLE` أو `MATERIALIZED VIEW` (مثبت باختبار ثابت).
- لا بيانات تجريبية، لا جلسات اختبار، لا جداول لقطات تجميعية.

## 2. عدّادات ما قبل التطبيق (قراءة فعلية من القاعدة المشتركة الآن)

```text
exam_sessions           = 0
exam_session_questions  = 0
exam_session_answers    = 0
question_revisions      = 0
question_targets        = 0
```

نتيجة مهمة: القاعدة المشتركة لا تحتوي بيانات محاولات بعد. لذلك التحقق بعد التطبيق سيكون على مستويين:

- على القاعدة المشتركة: تحقق سلوكي/صلاحيات فقط (ALLOW/DENY، حمولات فارغة صحيحة، لا أخطاء تنفيذ) — لأن أي "أخطاء" حقيقية غير موجودة، وإنشاء بيانات تجريبية ممنوع صراحة.
- على PostgreSQL 17 المحلي (fixtures البروفة): تحقق المنطق الكامل — repeated count، MASTERED_LATER، blank، correct-only مستبعد، النسخة التاريخية المثبتة، سؤال بلا درس، pagination فوق 1000، وتكافؤ الطالب/الأدمن.

## 3. بعد التطبيق — سطح الطالب

- تنفيذ `list_my_mistakes` / `get_my_mistake_detail` كـ anon على القاعدة المشتركة = DENY (تحقق عبر Data API بمفتاح anon).
- تنفيذها كطالب مسجَّل = ALLOW مع صفحة فارغة صحيحة (لا خطأ).
- عزل الطالب A عن B: مضمون بالتصميم (`auth.uid()` بلا أي معامل user id) ومُثبت في بروفة PG17.
- فحص `/my-mistakes` والمدخل من الصفحة الرئيسية داخل المعاينة.

## 4. بعد التطبيق — سطح الأدمن

- `/admin/learning-insights/mistakes` مقصور على الأدمن الكامل، وفلاتره (الصف/المنهج/المادة/الدرس/النطاق/التاريخ) تعمل.
- `get_admin_mistake_insights`: أدمن = ALLOW، طالب = DENY، anon = DENY.
- الحمولة تجميعية فقط: لا `user_id` ولا هوية طالب ولا دفتر أخطاء فردي.
- روابط بنك الأسئلة والدرس تعمل حيث توجد بيانات.

## 5. الأمان

- `PUBLIC`/`anon` execute = ZERO على الدوال الأربع (تأكيد من `information_schema.role_routine_grants`).
- سياسات `question_revisions` / `question_targets` / `question_options` تبقى كما هي بلا أي تعديل (الترحيل لا يمسّها).
- `answer_key` / `correct_option` / `is_correct` / `hidden_solution` = ZERO في كل الحمولات (اختبارات ثابتة + فحص نص الترحيل).

## 6. الانحدار (Regression)

تشغيل بعد التطبيق: بروفة PG17 لـ 15B الكاملة، اختبارات 15A Quick Review، الاختبارات الأمنية الثابتة كلها، حزمة `vitest` الكاملة (QB / TCS-2 / الاستيراد / الوزاري 14D–14H / الدروس المباشرة و PDF الخارجي)، فحص الأنواع، ثم البناء.

## 7. الإغلاق

- نقل الملف من `supabase/migrations-pending/` إلى `supabase/migrations/` بعد نجاح التطبيق (بلا تعديل بايت واحد).
- إنشاء `docs/reuse/TAMKEEN-MY-MISTAKES-DUAL-SURFACE-15B-SHARED-APPLY-REPORT.md` بكل الحقول المطلوبة (STUDENT_SURFACE … BLOCKERS) مع تسجيل الـ SHA المطبَّق وملاحظة أن القاعدة المشتركة خالية من بيانات المحاولات وقت التطبيق.
- الحكم النهائي: `TAMKEEN_MY_MISTAKES_DUAL_SURFACE_15B_SHARED_APPLY = PASS / FAIL`.

## ملاحظة تقنية

`STUDENT_ADMIN_METRIC_PARITY` سيُعتمد من بروفة PG17 المرجعية (نفس نص الترحيل، بصمة مطابقة)، لأن إثباته على القاعدة المشتركة يتطلب بيانات محاولات — وإنشاؤها ممنوع بقاعدة `DEMO_DATA = ZERO`. سيُوثَّق هذا صراحة في التقرير بدل ادّعاء تحقق ميداني لم يحدث.
