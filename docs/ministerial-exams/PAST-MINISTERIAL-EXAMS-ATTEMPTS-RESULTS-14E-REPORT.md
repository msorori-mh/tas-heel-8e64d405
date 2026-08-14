# PAST_MINISTERIAL_EXAMS_ATTEMPTS_RESULTS_14E — تقرير التنفيذ

الحالة: **PASS** — مطبّق على القاعدة المشتركة.

## ما تم تنفيذه

### قاعدة البيانات
- `exam_sessions`: `ministerial_attempt_mode` (training/strict مع CHECK)، `completed_at`، `is_final`.
- `exam_session_answers`: `revealed_at`.
- RPCs جديدة/محدَّثة (كلها `SECURITY DEFINER` + `search_path` مثبّت + `EXECUTE` لـ `authenticated` فقط):
  - `create_ministerial_exam_session(_model_id, _mode default 'training')`
  - `answer_ministerial_exam_question(_session_id, _session_question_id, _option_code)`
  - `reveal_ministerial_training_answer(_session_id, _session_question_id)`
  - `submit_ministerial_exam_session(_session_id)`
  - `get_ministerial_session_result(_session_id)`
  - `list_ministerial_attempts(_model_id default null)`
  - `get_ministerial_session_state(_session_id)` (أُعيد بناؤها لتشمل `session_question_id`, `attempt_mode`, `revealed_at`, `server_now`)
- دوال داخلية غير قابلة للاستدعاء من الواجهة: `_ministerial_session_guard`, `_ministerial_is_correct`.

### الواجهة
- `src/lib/ministerial/ministerial-student-api.ts`: أغلفة الـRPCs وأنواعها.
- صفحة الجلسة: وضع تدريب (كشف حل + قفل الإجابة + رابط الدرس) ووضع محاكاة (شبكة أسئلة + مؤقّت مرتبط بساعة الخادم + تسليم تلقائي عند انتهاء الوقت).
- صفحة جديدة: `/ministerial-exams/sessions/$sessionId/result` للنتيجة والمراجعة التفصيلية.
- سجل المحاولات داخل صفحة النموذج (متابعة الجارية / عرض النتيجة).

## الحراس (GATES)

| # | الحارس | التحقق |
|---|--------|--------|
| G1 | كشف الحل يقفل الإجابة | `revealed_at` + رفض `ANSWER_ALREADY_REVEALED_LOCKED` في RPC الإجابة |
| G2 | لا مفتاح إجابات على سجل الجلسة | `correct_answers = NULL` دائماً للوزاري، ولا مفاتيح في حالة الجلسة المفتوحة |
| G3 | التصحيح بالكود المثبّت لا بالترتيب | التخزين والمقارنة عبر `selected_option_code`، مع رفض أي كود خارج اللقطة |
| G4 | ثبات مدخلات التصحيح | الدرجات و`question_revision_id` من اللقطة فقط |
| G5 | الأسئلة اليدوية | `PENDING_MANUAL_REVIEW` + `is_final=false` + نسبة NULL |
| G6 | توافق RPC الإنشاء | معامل `_mode` بقيمة افتراضية |
| G7 | حتمية السباقات | `FOR UPDATE` + تسليم Idempotent يعيد `result_json` المخزّن + single-flight في الواجهة |

## الاختبارات
- `tests/security/ministerial-attempts-results-14e.static.test.mjs` — 5/5 ناجحة.
- `tests/security/ministerial-student-experience-14d.static.test.mjs` — 6/6 ناجحة (لا انحدار).
- `tsgo --noEmit` — نظيف.

## ملاحظات
- «كشف الحل» يعيد `verdict` نصية (`correct` / `wrong` / `manual_review`) حفاظاً على قاعدة عدم ظهور مفاتيح الإجابة في كود العميل.
- الحلول تُقرأ من نفس النسخة المثبّتة (Revision Pinning)، وتستثني `reveal_policy` بقيمة `hidden` أو `staff_only`.
- لا يوجد Offline في هذه المرحلة (خارج النطاق).
