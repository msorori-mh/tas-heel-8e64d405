# SECONDARY-EXAM-ANSWERS-POSTGREST-LEAK-HARDENING-01 — التقرير

- **المرحلة:** SECONDARY-EXAM-ANSWERS-POSTGREST-LEAK-HARDENING-01
- **الفرع:** `security/exam-answers-postgrest-leak-hardening-01` (من main @ `10cb220`)
- **التاريخ:** 2026-07-31

## القرار النهائي

**PASS_EXAM_ANSWERS_LEAK_HARDENING_PR_READY**

## أين كان التسريب؟ (نتيجة الـ Audit)

**الخلاصة المفصلية:** التسريب الموصوف في دورة الجاهزية (P0-1) كان **إيجاباً كاذباً في التحليل الثابت**. ذلك التحليل راجع سياسات RLS فقط واستنتج أن `questions` SELECT يعيد الصف كاملاً — لكنه لم يراعِ migration امتيازات الأعمدة:

- `supabase/migrations/20260622140000_questions_answer_column_grants.sql`
- `supabase/migrations/20260623030305_…sql` (أعاد التأكيد على نفس الحالة النهائية)

كلتاهما تسحبان SELECT على مستوى الجدول من `authenticated`/`anon` وتمنحان قائمة أعمدة آمنة فقط (بلا `correct_index`/`explanation`). ولا توجد أي migration لاحقة تعيد منح SELECT على مستوى الجدول، ولا `ALTER DEFAULT PRIVILEGES` في أي migration.

**تأكيد حي (anon، قراءة فقط) على قاعدة البيانات الفعلية:**
- `GET /rest/v1/questions?select=correct_index,explanation` → **401 / 42501** (مرفوع على مستوى الامتيازات، قبل RLS أصلاً).
- `GET /rest/v1/questions?select=id,question_text` → **401 / 42501** لـ anon (لا يقرأ شيئاً — كما هو مطلوب).
- `exam_template_questions` لـ anon → 200 مع **مصفوفة فارغة** (RLS).

إذن الحالة الحالية على main فعلياً محصّنة، وmigration هذه المرحلة **تعيد تأكيد الحالة النهائية بشكل idempotent** حتى لا تعتمد الحماية على ترتيب تطبيق migrations قديمة، وتضيف **حراسة ارتداد** تمنع أي migration مستقبلية من إعادة فتح العمودين silently.

## الجداول والسياسات المتأثرة (نتائج الفحص)

| العنصر | الحالة |
|---|---|
| `questions` — سياسة `"Questions viewable per access"` (authenticated) | صفوف مفلترة grade/track؛ الأعمدة الحساسة محجوبة بامتيازات الأعمدة |
| `questions` — `"Content staff manage questions"` FOR ALL | كتابة الطاقم محفوظة (INSERT/UPDATE/DELETE لا تتأثر بسحب SELECT) |
| `exam_template_questions` | جدول ربط فقط (لا أعمدة إجابات)؛ embedding إلى questions محكوم بنفس امتيازات الأعمدة |
| `assessment_questions` | جدول ربط فقط — لا تسريب |
| RPC `get_exam_session_state` | يصفّر `correct_index`/`explanation`/`is_correct`/`points_awarded`/`result_json` حتى `status <> 'in_progress'` (reveal بعد التسليم فقط) |
| RPC `get_lesson_quiz_questions` | يعيد الحمولة العامة فقط (بلا مفتاح الإجابة)، خلف auth + `can_access_lesson` |
| RPC `check_lesson_question` / `grade_lesson_quiz` | يكشفان الإجابة **بعد إجابة الطالب** — تجربة التغذية الراجعة التكوينية المقصودة للتدريب (لم تُمس) |
| الكود العميل (`src/`) | لا يوجد أي `.select()` يطلب `correct_index`/`explanation` من `questions` — بما فيه صفحات الإدارة (موثّق بتعليقات SECURITY) |
| مسارات الكتابة (import) | عبر `supabaseAdmin` (service role) من server functions فقط — تتجاوز RLS/الامتيازات ولا تتأثر |

## ما الذي غيّرته migration الجديدة؟

`supabase/migrations/20260731120000_exam_answers_postgrest_leak_hardening.sql` (idempotent):

1. `REVOKE SELECT ON public.questions FROM anon / authenticated` — **السطر الحرج**: منح SELECT على مستوى الجدول كان سيعيد فتح كل الأعمدة بصمت.
2. `GRANT SELECT (id, lesson_id, subject_id, question_text, options, question_type, year, sort_order, created_at, unit, semester, code)` لـ authenticated — حمولة الطالب العامة فقط.
3. `REVOKE SELECT (correct_index, explanation) ... FROM anon, authenticated` — حزام أمان صريح.
4. `GRANT ALL ... TO service_role` — مسارات الخادم (import/إدارة) محفوظة.

لا تغيير RLS policies ولا RPC bodies ولا بيانات ولا جداول مالية ولا storage ولا auth.

## إجابات أسئلة المرحلة

- **هل direct SELECT للطالب يمنع correct_index/explanation؟** نعم — امتيازات أعمدة (وليس إخفاء واجهة). طلب العمودين صراحة يرفضه Postgres، و`select=*` يعيد الأعمدة الممنوحة فقط.
- **هل الامتحانات والتدريب ما زالت تعمل؟** نعم — كل مسارات الطالب إما تقرأ الأعمدة الآمنة فقط (practice) أو تمر عبر RPCs security definer لا تتأثر بالسحب (exam state / lesson quiz). لم يتغير أي سطر كود عميل.
- **هل admin محفوظ؟** نعم — واجهة الإدارة لا تقرأ عمودي الإجابة أصلاً (موثّق في الكود)، والكتابة عبر service role / سياسة الطاقم لم تتغير.
- **هل anon ممنوع؟** نعم — مؤكد حياً (401/42501) وبالسياسات.
- **هل لا يوجد Deploy؟** لا.
- **هل لا يوجد SQL production؟** لا — الـ migration في PR فقط ولم تُطبَّق، والاستعلامان الحيان قراءة anon عامة فقط.
- **هل لا يوجد تعديل بيانات؟** لا.

## الفحوصات

| الفحص | النتيجة |
|---|---|
| `npm ci` | PASS (بعد قتل عملية `vite preview` يتيمة كانت تقفل `node_modules` — لا علاقة للكود) |
| `npx tsc --noEmit` | PASS |
| `npm test` | 8/8 PASS |
| `node tests/pwa/service-worker-policy.static.test.mjs` | 7/7 PASS |
| `node --test tests/security/*.mjs` | 18/18 PASS (8 القديمة + 10 الجديدة) |
| `npm run build` | PASS |
| Web CI على الـ PR | (يُحدَّث بعد فتح الـ PR) |

ملاحظة: `node --test tests/security/` بصيغة المجلد يفشل على Windows (خلل runner في تمرير المسار، وليس فشل اختبار) — الاستدعاء الصحيح بأسماء الملفات أو glob.

## الاختبارات الجديدة (10)

`tests/security/exam-answers-postgrest-leak-hardening.static.test.mjs`:
سحب SELECT على مستوى الجدول من العميل، قائمة الأعمدة الآمنة بالضبط (بلا correct_index/explanation)، السحب الصريح للعمودين، حفظ service_role، **حارس مستقبلي**: أي migration لاحقة تعيد منح SELECT على مستوى الجدول لعميل تفشل الاختبار، خلو الـ migration من تغييرات مالية/مدمرة، reveal بعد التسليم فقط في `get_exam_session_state`، خلو `get_lesson_quiz_questions` من مفتاح الإجابة، حماية `check_lesson_question` بـ auth + lesson access، وخلو كود العميل من select لأعمدة الإجابة.

## المتبقي (خارج نطاق PR)

- التحقق الحي بدور **authenticated** (طالب يجرّب قراءة العمودين) يتطلب حساب اختبار — TEST_ACCOUNTS_REQUIRED من دورة الجاهزية ما زال قائماً. الدليل الحالي: سلسلة migrations ثابتة + تأكيد anon حي + حارس ارتداد.
- `check_lesson_question` يكشف إجابة أسئلة الدرس عند الاستدعاء (بلا اشتراط إجابة مسجلة مسبقاً) — تصميم تكويني مقصود للتدريب؛ إن رغب المالك بتشديده (اشتراط محاولة مسجلة) يُعالج في مرحلة منفصلة.

## رابط PR

(يُحدَّث عند الإنشاء)
