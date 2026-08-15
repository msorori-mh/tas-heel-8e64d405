# TAMKEEN_MY_MISTAKES_DUAL_SURFACE_15B — تقرير السطحين (طالب + أدمن)

الحالة: **PASS_READY_FOR_APPLY**
النطاق: `TAMKEEN_MY_MISTAKES_DERIVED_MODEL_15B` (سطح الطالب) + `TAMKEEN_MY_MISTAKES_ADMIN_INSIGHTS_15B_A` (سطح الأدمن).

## 1. القرار المعماري

- `NEW_MISTAKE_TABLE = NO`. لا جدول أخطاء، لا Materialized View، لا نسخ للنص أو الإجابات.
- السطحان يشتقّان من نفس المصدر: `exam_sessions` + `exam_session_questions` + `exam_session_answers`
  مع التثبيت التاريخي على `question_revision_id` وهدف تلك النسخة (`question_targets`).
- الترحيل مخصص فقط لدوال `SECURITY DEFINER`:
  - `list_my_mistakes` (طالب، مصفّح من الخادم)
  - `get_my_mistake_detail` (طالب)
  - `get_admin_mistake_insights` (أدمن، تجميعي فقط)

## 2. سطح الأدمن

- المسار: `/admin/learning-insights/mistakes` — مقصور على الأدمن الكامل
  (`useRequireAdminSection("full")` + استبعاده من قوائم مدير المحتوى في `admin-route-access.ts`).
- الفلاتر: الصف، المنهج، المادة، الدرس، نطاق المحاولات (عادي/وزاري/الكل)، من/إلى تاريخ.
- المخرجات: ملخص عام، الأسئلة الأكثر خطأً، أعلى نسبة ترك (Blank)، الدروس الأضعف،
  المواد الأضعف، التوزيع حسب الصف والمنهج.
- الروابط التشغيلية: بنك الأسئلة وصفحة الدرس لمعالجة الضعف مباشرة.

## 3. الخصوصية

- لا هويات: لا `user_id`/`student_id`/الاسم/الهاتف/البريد في أي حمولة أو واجهة.
- لا مفتاح إجابة: لا `is_correct`، لا `correct_option_code`، لا إجابات مقبولة، لا حلول مخفية.
- عزل المسار الوزاري مطبَّق في السطحين بنفس المنطق.
- `anon` ممنوع من تنفيذ كل الدوال؛ `authenticated` فقط، مع حارس أدمن داخل الدالة الإدارية.

## 4. التكافؤ (Parity)

اختبار `STUDENT_ADMIN_METRIC_PARITY` داخل بروفة PG17 يقارن عدّادات الطالب (`list_my_mistakes`)
بعدّادات الأدمن لنفس السؤال (`top_questions`) ويؤكد تطابق مرات الخطأ/الترك والإتقان اللاحق.

## 5. البروفة والاختبارات

- `bash tests/import/run-pg17-my-mistakes-15b-rehearsal.sh` → **RESULT: 15B REHEARSAL = PASS**
  (تشغيل الترحيل مرتين لإثبات Idempotency + سيناريو الدخان الكامل بما فيه DENY للطالب و ALLOW للأدمن).
- `tests/security/my-mistakes-15b.static.test.mjs` — PASS.
- `tests/security/my-mistakes-admin-insights-15b-a.static.test.mjs` — PASS (تسريب صفر، خصوصية، لا جداول جديدة، حراسة الأدمن).
- فحص الأنواع TypeScript: PASS.

## 6. ملفات هذه المرحلة

- `supabase/migrations-pending/20260817010000_my_mistakes_derived_model_15b.sql`
- `src/lib/mistakes/my-mistakes-api.ts`, `src/lib/mistakes/admin-mistake-insights-api.ts`
- `src/routes/_authenticated/my-mistakes.tsx`, `src/routes/_authenticated/admin.learning-insights.mistakes.tsx`
- `src/components/mistakes/MistakeCard.tsx`, `src/components/home/MyMistakesEntry.tsx`
- `tests/import/fixtures/pg17-my-mistakes-15b-smoke.sql`, `tests/import/run-pg17-my-mistakes-15b-rehearsal.sh`
- `tests/security/my-mistakes-15b.static.test.mjs`, `tests/security/my-mistakes-admin-insights-15b-a.static.test.mjs`

## 7. الحكم

`TAMKEEN_MY_MISTAKES_ADMIN_INSIGHTS_15B_A = PASS` — جاهز للتطبيق على القاعدة المشتركة
عند إصدار تفويض `SHARED_APPLY`.
