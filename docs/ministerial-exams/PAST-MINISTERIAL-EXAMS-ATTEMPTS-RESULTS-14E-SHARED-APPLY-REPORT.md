# PAST_MINISTERIAL_EXAMS_ATTEMPTS_RESULTS_14E_SHARED_APPLY — تقرير التطبيق على القاعدة المشتركة

التاريخ: 2026-08-14 (UTC)
الحكم النهائي: **PASS**

## 1. Migrations المطبقة (بالنص المعتمد، دون تعديل)

| # | الملف | SHA-256 |
|---|-------|---------|
| 1 | `supabase/migrations/20260814222506_6efb5704-26e4-41df-b56b-5abec69f5f4b.sql` (14E core) | `61c75ede0eb08fe59422cbc10f9795c03e98cd082b741ad74c15789f398d6242` |
| 2 | `supabase/migrations/20260814222944_a75fe867-2d64-4872-bfcf-597caa7f38df.sql` (14E reveal verdict patch) | `7f3801a2697c950bda8e978f886b43d12fcc96505b602969a7fa425a7e7b315b` |

لا توجد ملفات pending متبقية لـ14E (`supabase/migrations-pending/` لا يحوي أي ملف 14E).

## 2. الحالة قبل/بعد التطبيق

| القياس | قبل | بعد |
|--------|-----|-----|
| `exam_sessions` | 0 | 0 |
| `exam_session_answers` | 0 | 0 |
| `ministerial_exam_models` | 0 | 0 |
| جلسات وزارية | 0 | 0 |

لم يُنشأ أي نموذج وزاري أو جلسة أو بيانات Demo. لم تُمسّ بيانات المناهج.

### توقيعات/صلاحيات الدوال بعد التطبيق (مقتطف)

| الدالة | Args | SECDEF | search_path | EXECUTE |
|--------|------|--------|-------------|---------|
| `create_ministerial_exam_session` | `_model_id uuid, _mode text` (defaults=1) | ✔ | public, pg_temp | authenticated, service_role |
| `answer_ministerial_exam_question` | `_session_id, _session_question_id, _option_code` | ✔ | public, pg_temp | authenticated, service_role |
| `reveal_ministerial_training_answer` | `_session_id, _session_question_id` | ✔ | public, pg_temp | authenticated, service_role |
| `submit_ministerial_exam_session` | `_session_id` | ✔ | public, pg_temp | authenticated, service_role |
| `get_ministerial_session_result` | `_session_id` | ✔ | public, pg_temp | authenticated, service_role |
| `get_ministerial_session_state` | `_session_id` | ✔ | public, pg_temp | authenticated, service_role |
| `list_ministerial_attempts` | `_model_id` | ✔ | public, pg_temp | authenticated, service_role |
| `_ministerial_session_guard` / `_ministerial_is_correct` | داخلية | ✔ | public, pg_temp | **service_role فقط** (لا authenticated ولا anon) |

## 3. نتائج التحقق (16 بنداً)

| # | البند | النتيجة | الدليل |
|---|-------|---------|--------|
| 1 | `ministerial_attempt_mode` يدعم training/strict | PASS | عمود + CHECK على `exam_sessions`، ويُسجّل عبر `create_ministerial_exam_session` |
| 2 | التوافق مع الاستدعاء بمعامل واحد | PASS | `pronargdefaults = 1` (لا Overload مكرر) |
| 3 | reveal قبل الإجابة = DENY | PASS | `ANSWER_REQUIRED_BEFORE_REVEAL` (42501) |
| 4 | الإجابة بعد reveal = DENY | PASS | `ANSWER_ALREADY_REVEALED_LOCKED` (42501) |
| 5 | reveal في strict = DENY | PASS | `REVEAL_NOT_ALLOWED_IN_STRICT` (42501) |
| 6 | submit Idempotent | PASS | `FOR UPDATE` + إعادة `result_json` المخزّن عند إعادة الاستدعاء |
| 7 | الجلسة المنتهية تُصحح على المحفوظ | PASS | `v_expired` يحسب من `expires_at`، والتصحيح يمر على الإجابات المخزنة فقط، والزمن محدود بـ`LEAST(now(), expires_at)` |
| 8 | تثبيت النسخة | PASS | التصحيح يقرأ `exam_session_questions.question_revision_id` من اللقطة، لا من النسخة المنشورة الحالية |
| 9 | الدرجات من اللقطة | PASS | `esq.max_score` مصدر الدرجة الوحيد |
| 10 | `correct_answers` بلا مفتاح إجابات | PASS | تُضبط `NULL` عند الإنشاء وعند التسليم |
| 11 | `result_json` بلا مفتاح صحيح | PASS | مفاتيحه إحصائية فقط (`answered/correct_count/score/percentage/...`) |
| 12 | أسئلة المراجعة اليدوية | PASS | `PENDING_MANUAL_REVIEW` + `percentage/score/correct_count = NULL` + `is_final = false` |
| 13 | وصول مستخدم آخر / مسار آخر | PASS | `_ministerial_session_guard`: `forbidden` عند اختلاف `user_id`، و`ministerial_model_not_available` عند اختلاف `curriculum_track_id` |
| 14 | anon EXECUTE على الدوال الحساسة | PASS (ZERO) | لا `anon=X` على أي دالة وزارية؛ الدوال الداخلية لـ`service_role` فقط |
| 15 | انحدار الامتحانات العادية | PASS | دوال `create_exam_session_with_snapshot` / `answer_exam_question` / `submit_exam_session` / `get_exam_session_state` بلا تغيير في التوقيع أو الصلاحيات |
| 16 | ANSWER_LEAK | ZERO | حالة الجلسة المفتوحة لا تُعيد أي مفتاح؛ الكشف بعد الإجابة فقط في التدريب؛ النتائج بعد التسليم فقط |

## 4. Post-Apply Regression

- `bunx vitest run`: **80/80 tests PASS** (44 ملفاً يُبلغ عنه "No test suite found" — وضع سابق قائم قبل 14E ولا علاقة له بالمرحلة).
- `tests/security/ministerial-attempts-results-14e.static.test.mjs`: 5/5 PASS.
- `tests/security/ministerial-student-experience-14d.static.test.mjs`: 6/6 PASS (لا انحدار على 14D).
- `tsgo --noEmit`: نظيف.

## 5. ملاحظات

- الدوال القديمة للامتحانات العادية ما زالت تمنح `anon` صلاحية EXECUTE (وضع موروث سابق لـ14E، خارج نطاق هذه المرحلة، مرشّح للتشديد في مرحلة تنظيف لاحقة).
- لا يمكن تنفيذ اختبار ديناميكي End-to-End حالياً لعدم وجود أي نموذج وزاري منشور (0 نماذج)؛ التحقق أعلاه تعاقدي على مستوى الكتالوج وأجسام الدوال، ويُعاد تشغيله دينامياً فور إدخال أول نموذج.

**PAST_MINISTERIAL_EXAMS_ATTEMPTS_RESULTS_14E_SHARED_APPLY = PASS**
