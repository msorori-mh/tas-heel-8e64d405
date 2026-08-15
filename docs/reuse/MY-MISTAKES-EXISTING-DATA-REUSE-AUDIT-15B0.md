# MY_MISTAKES_EXISTING_DATA_REUSE_AUDIT_15B.0

مرحلة تدقيق فقط: لا Migration، لا كتابة في القاعدة، لا تنفيذ ميزة، لا واجهة نهائية.
كل ما يلي مبني على فحص فعلي للـ schema والفهارس وسياسات RLS على القاعدة المشتركة.

---

## 1. مصادر البيانات الحالية (Audit فعلي)

### 1.1 مسار الاختبارات (عادي + وزاري) — موجود وكافٍ

| الجدول | ما يقدّمه لدفتر الأخطاء |
|---|---|
| `exam_sessions` | `user_id`, `template_id`, `mode` (training/strict/ministry), `ministerial_model_id`, `ministerial_attempt_mode`, `status`, `submitted_at`, `completed_at`, `is_final`, `grading_status`, `result_json` |
| `exam_session_questions` | **اللقطة المثبّتة**: `logical_question_id` (الهوية القانونية)، `question_revision_id` (النسخة التاريخية)، `question_order`, `rendered_question_text`, `rendered_options`, `option_order_mapping`, `max_score`, `payload_hash` |
| `exam_session_answers` | `exam_session_question_id`, `question_id`, `selected_option_code`, `response_text`, `is_correct`, `grading_status`, `final_score`/`max_score`, `requires_manual_review`, `answered_at`, `revealed_at`, `finalized_at` |

### 1.2 مسار التدريب على الدرس/الوحدة — موجود بنفس البنية

`practice_attempts` (`user_id`, `attempt_type`, `lesson_assessment_id`, `unit_id`) +
`practice_attempt_questions` (`logical_question_id`, `question_revision_id`, snapshot) +
`practice_attempt_responses` (`selected_option_code`, `final_score`, `grading_status`).
لا يوجد عمود `is_correct` هنا؛ الصواب يُشتق من `final_score` مقابل `max_score` (منطق خادمي).

### 1.3 مسار قديم غير قابل للاعتماد

`unit_practice_attempts` يخزّن `answers`/`per_question` كـ JSONB بلا `question_revision_id`.
**الحكم: مستثنى من V1** (لا يحقق شرط تثبيت النسخة التاريخية).

### 1.4 القدرة على استخراج المطلوب

| المعلومة | متاح؟ | المصدر |
|---|---|---|
| السؤال الذي أخطأ فيه | نعم | `answers.is_correct=false` أو `final_score < max_score` (خادمياً) |
| السؤال المتروك فارغاً | نعم | anti-join: `exam_session_questions` LEFT JOIN `exam_session_answers` ⇒ لا صف / `selected_option_code IS NULL` |
| عدد مرات الخطأ لنفس السؤال | نعم | تجميع على `exam_session_questions.logical_question_id` |
| آخر مرة أخطأ فيها | نعم | `max(answers.answered_at / sessions.submitted_at)` |
| آخر نتيجة | نعم | آخر occurrence حسب التاريخ |
| المادة | نعم | `question_targets(revision_id).subject_id` أو `exam_templates.subject_id` |
| الدرس | نعم | `question_targets(revision_id).lesson_id/unit_id` (مع `is_primary`) |
| نوع الاختبار | نعم | `sessions.mode` + `ministerial_model_id` + `ministerial_attempt_mode` + `practice_attempts.attempt_type` |
| النسخة المثبتة | نعم | `exam_session_questions.question_revision_id` |
| هل أتقنه لاحقاً | نعم | أحدث occurrence لنفس `logical_question_id` صحيح ⇒ `later_mastered` |

**ملاحظة حاكمة:** `question_targets` و`question_revisions` سياستهما `SELECT` **للطاقم فقط** —
الطالب لا يستطيع قراءتهما مباشرة. لذلك المادة/الدرس/نص النسخة يجب أن تمرّ عبر
`SECURITY DEFINER` RPC. هذا وحده يجعل `NEW_RPC_REQUIRED = YES`.

---

## 2. Canonical Error Identity

الهوية المعتمدة: **`exam_session_questions.logical_question_id`** (= `questions.id`).
`exam_session_answers.question_id` يحمل نفس القيمة لكن `logical_question_id` هو المصدر
المضمون بقيد NOT NULL وبالربط مع اللقطة، فيُعتمد هو.

لكل occurrence يُحفظ (اشتقاقاً، لا تخزيناً): `question_revision_id`, `session_id`,
`session_question_id`, `attempt_at`, `subject_id`, `lesson_id`, `attempt_type`, `state`.

لا استخدام لنص السؤال كهوية. لا fuzzy matching في 15B.

---

## 3. Historical Correctness

- الصواب/الخطأ يُقرأ من نتيجة التصحيح التاريخية المخزّنة وقت المحاولة
  (`answers.is_correct` / `final_score` / `grading_status`)، لا يُعاد حسابه.
- النص والخيارات المعروضة تُقرأ من `exam_session_questions.rendered_*` أو من
  `question_revisions` بالـ`question_revision_id` **المثبّت في اللقطة**.
- لا إعادة تصحيح بأحدث Revision. إذا كانت المحاولة على R3 وصار المنشور R4،
  يبقى الخطأ منسوباً إلى R3، ويجوز عرض شارة «تم تحديث السؤال» بمقارنة
  `questions.current_published_revision_id`.
- `requires_manual_review` / `grading_status <> 'FINAL'` ⇒ الحالة `pending`
  ولا تُحسب خطأً.

`HISTORICAL_REVISION_SAFE = YES` (بشرط القراءة من اللقطة حصراً).

---

## 4. Safe Student Payload (تصميم فقط — بدون تنفيذ)

RPCs مقترحة (`SECURITY DEFINER`, `search_path` مثبت, `EXECUTE` لـ`authenticated` فقط،
وتفلتر داخلياً بـ`auth.uid()`):

- `list_my_mistakes(_bucket, _subject_id, _lesson_id, _source, _sort, _limit, _offset)`
- `get_my_mistake_detail(_question_id)`

الحمولة المسموحة: `question_id`, `display_revision_id`, `question_text`,
`displayed_options` (كما عُرضت في اللقطة)، `my_selected_option_code`,
`state ∈ {wrong, blank, repeated, later_mastered, pending}`, `occurrence_count`,
`subject`, `lesson`, `source_attempt_type`, `last_attempt_at`.

**ممنوع في الحمولة:** `is_correct` الخام، مفتاح الإجابة، `correct_option_code`،
`question_accepted_answers`، `question_solutions` المخفية، أي `final_score` يُستنتج منه
المفتاح لسؤال لم يُكشف. كشف الحل لاحقاً يمرّ حصراً عبر السياسة الآمنة القائمة
(`reveal_ministerial_training_answer` وسياسة `reveal_policy`).

`ANSWER_LEAK_RISK = LOW` عند الالتزام بهذا العقد؛ يصبح مرتفعاً لو استُخدم PostgREST
مباشرة على `exam_session_answers` (الطالب يقرأ `is_correct` لصفوفه اليوم).
⇒ الواجهة يجب ألا تقرأ هذه الجداول مباشرة.

---

## 5. Derived vs Persisted

| المعيار | A) DERIVED RPC | B) PERSISTED TABLE |
|---|---|---|
| التكرار | لا تكرار | تكرار كامل لبيانات موجودة |
| الاتساق | مصدر واحد للحقيقة | خطر انحراف عند التصحيح اليدوي/إعادة الفتح |
| الصحة التاريخية | مضمونة من اللقطة | تحتاج نسخ `revision_id` وصيانته |
| الأداء | جيد على الحجم المتوقع | أفضل نظرياً فقط عند ملايين الصفوف |
| Pagination | `limit/offset` داخل RPC | مماثل |
| Offline مستقبلاً | RPC واحدة قابلة للتخزين المؤقت في العميل | لا ميزة إضافية |
| القابلية للتوسع | تُرقّى لاحقاً إلى Materialized read model دون تغيير العقد | هجرة وصيانة دائمة |
| الأمان | نقطة تحكم واحدة | سطح هجوم إضافي + RLS جديدة |
| الصيانة | منخفضة | مرتفعة (triggers/backfill) |

**التوصية: A — DERIVED (RPC فوق البيانات الحالية).** لا مبرر لجدول جديد لمجرد سهولة
الاستعلام. يُعاد التقييم فقط عند تجاوز p95 لزمن الاستعلام 300ms على حجم إنتاجي حقيقي.

---

## 6. الأداء وسقف 1000 صف

الحالة الراهنة على القاعدة المشتركة: `exam_sessions=0`, `exam_session_questions=0`,
`exam_session_answers=0`, `practice_attempts=0` (لا بيانات إنتاجية بعد ⇒ لا خطر فوري).

الفهارس المتاحة والمفيدة:
- `idx_exam_sessions_user_status_created (user_id, status, created_at DESC)` — يقصّ جلسات الطالب أولاً.
- `idx_exam_session_answers_session (session_id)` و`exam_session_answers_unique (session_id, question_id)`.
- `exam_session_questions_id_session_uidx (exam_session_id, id)` و`..._question_order_key`.
- `question_targets_revision_idx (revision_id)` — يغطي اشتقاق المادة/الدرس.

الفجوات:
- لا فهرس على `exam_session_questions(logical_question_id)` — التجميع يتم بعد
  التقييد بجلسات الطالب، فمقبول في V1.
- `practice_attempts` بلا فهرس على `user_id` — **مرشّح لفهرس جديد** عند تفعيل مسار التدريب.

⇒ `NEW_INDEX_REQUIRED = NO_FOR_V1 / LIKELY_LATER` (فهرس `practice_attempts(user_id, submitted_at DESC)` ثم
`exam_session_questions(logical_question_id)` عند الحاجة).

سقف 1000 صف (B5) يُغلق داخل RPC عبر `limit/offset` إلزاميين + تجميع على الخادم،
لا عبر جلب كل الصفوف للعميل (نفس نهج `fetchAllPaged` في 15A لكن مع تجميع خادمي).

---

## 7. دلالات المنتج — V1 المقترح

**Buckets:** أخطأت فيها · تركتها فارغة · أخطأت فيها أكثر من مرة · أتقنتها لاحقاً.
(+ حالة `pending` للأسئلة قيد التصحيح اليدوي، تُعرض محايدة).

**Filters:** المادة · الدرس · نوع المحاولة · وزاري/عادي · الأكثر تكراراً · الأحدث.

**Actions:** راجع الدرس (رابط الدرس عبر `question_targets`) · افتح آخر محاولة
(صفحة نتيجة الجلسة القائمة).

**OUT_OF_SCOPE في 15B V1:** «أعد التدريب على السؤال نفسه» — يتطلب محرك توليد جلسة
تدريب من مجموعة أسئلة مختارة (اختيار Revision، تثبيت لقطة، تصحيح، سياسة كشف)،
وهو محرك جديد وليس إعادة استخدام.

---

## 8. إعادة الاستخدام من مفاضلة

يُعاد استخدام: Focus Mode الناتج عن 15A (`FocusReader`)، أنماط البطاقات
(`ReviewCard`)، الأنماط البصرية لسجل الاختبارات، وحالات Empty/Loading/Error
(`EmptyState`, `ListSkeleton`, `ChipButton`).

لا يُنقل: الاستعلامات المباشرة القديمة على القاعدة، أنماط مفتاح الإجابة في العميل،
أي افتراضات تخص الجامعات/التخصصات.

---

## 9. Security Audit

| الادعاء | الإثبات في البنية الحالية |
|---|---|
| الطالب A لا يقرأ أخطاء الطالب B | `exam_sessions.user_id = auth.uid()` في السياسة، و`exam_session_answers`/`exam_session_questions` مقيدة عبر EXISTS على الجلسة المملوكة؛ الـRPC ستفلتر بـ`auth.uid()` داخلياً ولن تقبل `_user_id` كمُدخل |
| عزل المسار الوزاري | يبقى عبر بوابات 14D؛ الأخطاء لا تكشف نماذج خارج مسار الطالب لأن مصدرها جلسات الطالب نفسه فقط |
| رفض anon | لا سياسة `TO anon` على أي من الجداول المعنية، والـRPC ستُمنح لـ`authenticated` فقط |
| لا قراءة مباشرة لعضويات حساسة | `question_revisions` و`question_targets` مقصورتان على الطاقم؛ الوصول عبر `SECURITY DEFINER` بحمولة مقصوصة |
| لا تسريب إجابة | الحمولة تستثني `is_correct` والمفاتيح والحلول المخفية؛ الكشف عبر السياسة القائمة فقط |
| لا تصحيح في العميل | لا حساب صواب/خطأ في الواجهة؛ الحالة تصل جاهزة من الخادم |
| لا replay بأحدث نسخة | العرض من `question_revision_id` المثبت في اللقطة |

مخاطرة مفتوحة واحدة: قراءة العميل المباشرة لـ`exam_session_answers.is_correct` ممكنة اليوم
بحكم السياسة. تشديدها (View آمنة/إلغاء القراءة المباشرة) يُسجَّل كبند تنفيذي في 15B.1.

---

## 10. النتيجة

```
CURRENT_DATA_SUFFICIENT=YES
DERIVED_MODEL_POSSIBLE=YES
NEW_TABLE_REQUIRED=NO
NEW_RPC_REQUIRED=YES (list_my_mistakes, get_my_mistake_detail)
NEW_INDEX_REQUIRED=NO_FOR_V1 (مرشّحان لاحقاً: practice_attempts(user_id), exam_session_questions(logical_question_id))
HISTORICAL_REVISION_SAFE=YES
ORDINARY_EXAMS_SUPPORTED=YES
MINISTERIAL_SUPPORTED=YES (training + strict)
LESSON_TARGET_AVAILABLE=YES (question_targets عبر revision_id، مع fallback إلى exam_templates)
ANSWER_LEAK_RISK=LOW (بشرط منع القراءة المباشرة من العميل)
PERFORMANCE_RISK=LOW
RECOMMENDED_ARCHITECTURE=DERIVED_READ_MODEL_VIA_SECURITY_DEFINER_RPC
MIGRATION_REQUIRED=YES (RPC-only: دوال + منح صلاحيات، بلا جداول جديدة)
BLOCKERS=NONE
```

**الحكم: MY_MISTAKES_EXISTING_DATA_REUSE_AUDIT_15B.0 = PASS_MIGRATION_REQUIRED**

النموذج المشتق ممكن وآمن ولا يحتاج جدول أخطاء جديد، لكن إغلاق المرحلة التنفيذية
يستلزم ترحيلاً محدوداً بإنشاء RPCs فقط، لأن `question_revisions` و`question_targets`
غير مقروءتين للطالب، ولأن الحمولة الآمنة لا يمكن تكوينها من العميل.

**مستثنى من V1:** `unit_practice_attempts` (بلا تثبيت نسخة)، و«إعادة التدريب على
السؤال نفسه» (OUT_OF_SCOPE).
