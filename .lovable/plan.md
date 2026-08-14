# 14E — محاولات النماذج الوزارية والنتائج (Attempts & Results)

الهدف: إغلاق الدورة الكاملة للنموذج الوزاري: بدء → إجابة → تسليم → تصحيح على الخادم → نتيجة → مراجعة آمنة، في وضعَي التدريب والمحاكاة، بلا أي تسريب للإجابة الصحيحة إلى العميل.

## ما تم التحقق منه فعلياً في المحرك الحالي

- `exam_sessions` يحمل بالفعل `ministerial_model_id`، `attempt_pin_mode`، `grading_status`، `expires_at`، `score`، `total_points`، `correct_answers`، `result_json`. الحالة enum: `in_progress | submitted | expired`.
- `create_ministerial_exam_session(model_id)` ينشئ Snapshot كاملاً في `exam_session_questions` (نص، خيارات معروضة، `payload_hash`، `pin_mode='REVISION_PINNED'`) وصفوف فارغة مسبقة في `exam_session_answers` لكل سؤال. التثبيت على `published_revision_id` وليس على أحدث نسخة.
- `answer_exam_question` يعمل ويقفل الجلسة، يتحقق من الملكية والانتهاء، ويحدّث `selected_index` فقط.
- الإجابة الصحيحة مخزّنة في `question_options.is_correct` (وسياسة SELECT عليها مقصورة على طاقم المحتوى)، والشروح في `question_solutions`، وربط الدرس عبر `question_targets`.
- `submit_exam_session` الحالي يصحّح عبر `questions.correct_index` + `exam_template_questions` — غير صالح للنماذج المثبّتة على نسخ QB.
- فجوة مؤكدة: وضع الجلسة (تدريب/محاكاة) غير محفوظ على الخادم — `mode` دائماً `ministry` والاختيار يعيش في الـURL فقط. لذلك الكشف الآمن لا يمكن تفويضه حالياً.

**ATTEMPT_ENGINE_REUSED = YES** (لا محرك محاولات جديد، ولا جداول `past_exam_attempts` موازية).
**NEW_MIGRATION_REQUIRED = YES** — لأسباب محدودة: تخزين وضع المحاولة، حالة الكشف لكل سؤال، ودوال التصحيح/الكشف/النتيجة.

## نطاق العمل

### أ) ترحيل معلّق واحد (لا تطبيق على القاعدة المشتركة في هذه المرحلة)

ملف: `supabase/migrations-pending/…_ministerial_attempts_results_14e.sql`

1. أعمدة قليلة فقط:
   - `exam_sessions.ministerial_attempt_mode text` (`training | strict`) + قيد، يُكتب عند الإنشاء فقط.
   - `exam_sessions.completed_at timestamptz`، وتوسيع `grading_status` إلى `IN_PROGRESS | GRADING | GRADED | MANUAL_REVIEW_PENDING`.
   - `exam_session_answers.revealed_at timestamptz` (تدريب فقط).
2. تعديل `create_ministerial_exam_session(_model_id, _mode text default 'training')` ليخزّن الوضع (بقاء التوقيع القديم متوافقاً).
3. `submit_ministerial_exam_session(_session_id)` — دالة جديدة مستقلة تماماً عن `submit_exam_session` القديم:
   - `SECURITY DEFINER`, `SET search_path`, قفل صف الجلسة `FOR UPDATE`.
   - **Idempotent**: إن كانت الجلسة `submitted/graded` تُعيد نفس النتيجة دون إعادة تصحيح.
   - التصحيح من `question_options.is_correct` للنسخة المثبّتة في `exam_session_questions.question_revision_id` فقط (لا اعتماد على أحدث نسخة).
   - Auto-grade لأنواع الاختيار الحتمية فقط (`single_choice`/`true_false` حسب `interaction_type` في النسخة المثبّتة)؛ أي نوع آخر يوسم `requires_manual_review` و`grading_status='MANUAL_REVIEW_PENDING'` بلا اختراع تصحيح.
   - يحسب: `answered/correct/wrong/blank/score/total_points/percentage/elapsed_seconds` ويكتبها في `exam_sessions` + `result_json`.
   - Fail-safe الوقت: تسليم بعد `expires_at` يُصحَّح على ما هو محفوظ ويُغلق كـ`expired` مُصحَّحة، لا يُفقد.
4. `reveal_ministerial_training_answer(_session_id, _session_question_id)`:
   - شروط: صاحب الجلسة + `ministerial_attempt_mode='training'` + السؤال ضمن Snapshot الجلسة + وجود إجابة مسجّلة فعلاً + مسار الطالب = مسار النموذج.
   - يعيد أقل حمولة: صحيح/خطأ، رمز الخيار الصحيح، الشرح المسموح نشره من `question_solutions`، ورابط الدرس من `question_targets`. ويضبط `revealed_at`.
5. `get_ministerial_session_result(_session_id)` و`list_ministerial_attempts()`:
   - النتيجة والمراجعة التفصيلية لا تُرجَع إلا بعد `submitted/graded`؛ في المحاكاة لا كشف أثناء الجلسة إطلاقاً.
   - عزل المسار مفروض في كل قراءة (مالك الجلسة + تطابق مسار النموذج مع مسار الطالب).
6. الصلاحيات: `REVOKE ... FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated` لكل دالة جديدة. لا توسيع لأي سياسة SELECT على `question_options` أو `question_revisions` أو `ministerial_exam_questions`.

### ب) الواجهة (توسعة 14D بلا إعادة كتابة)

- `src/lib/ministerial/ministerial-student-api.ts`: أغلفة للدوال الجديدة + خرائط أخطاء عربية.
- شاشة الجلسة: تمرير الوضع عند الإنشاء (لا الاعتماد على الـURL كمصدر حقيقة)، تفعيل التسليم الحقيقي مع حارس نقرة واحدة (`createSingleFlightGuard`)، مؤقت محسوب من `expires_at` الخادمي مع استئناف صحيح بعد الخروج والعودة.
- التدريب: بعد حفظ الإجابة يظهر زر "أظهر الإجابة" يستدعي RPC الكشف؛ لا شيء قبل الإجابة.
- صفحة نتيجة جديدة `/ministerial-exams/sessions/$sessionId/result`: الدرجة، النسبة، صحيح/خطأ/بدون إجابة، الزمن، المادة، السنة، الدور، المسار، اسم النموذج + مراجعة سؤال-بسؤال مع زر "راجع الدرس".
- سجل المحاولات داخل صفحة النموذج/المادة: التاريخ، الوضع، الدرجة، النسبة، الزمن، الحالة.
- لا رسوم بيانية (متروكة لـ14F)، لكن `result_json` يُصمَّم ليكفي تحليلات 14F (دقة حسب المادة/الدرس، تدريب مقابل محاكاة، اتجاه التحسن).

### ج) الاختبارات

- بروفة PG17 كاملة (`tests/import/run-pg17-…-14e-rehearsal.sh`) تغطي: التدريب (كشف بعد الإجابة PASS / قبلها DENY)، المحاكاة (كشف أثناء الاختبار DENY، تسليم→تصحيح PASS)، التثبيت (جلسة على R3 بعد نشر R4 تبقى R3)، الأمان (نتيجة طالب آخر / مسار آخر / anon = DENY)، التزامن (تسليم مزدوج = نتيجة واحدة، تسليم لحظة انتهاء الوقت حتمي).
- اختبارات ثابتة جديدة: `tests/security/ministerial-attempts-results-14e.static.test.mjs` — ANSWER_LEAK = ZERO.
- Regression: امتحانات عادية، QB، 14B/14C/14D، مسار الدروس/PDF، `tsgo --noEmit`.

### د) التقرير

`docs/ministerial-exams/PAST-MINISTERIAL-EXAMS-ATTEMPTS-RESULTS-14E-REPORT.md` بكل مفاتيح الحالة المطلوبة و`SHARED_DB_APPLIED=NO` وحكم `PASS_READY_FOR_APPLY` أو `NEEDS_REVISION`.

## خارج النطاق

تطبيق الترحيل على القاعدة المشتركة، الرسوم البيانية (14F)، الأسئلة المتكررة (14G)، العمل دون اتصال، وأي تعديل على 14D خارج نقاط التوصيل أعلاه.
