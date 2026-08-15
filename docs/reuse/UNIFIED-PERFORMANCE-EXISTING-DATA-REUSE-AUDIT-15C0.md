# UNIFIED_PERFORMANCE_EXISTING_DATA_REUSE_AUDIT_15C.0

مرحلة تدقيق فقط: لا Migration، لا كتابة على القاعدة، لا تنفيذ ميزة، لا واجهة نهائية.

---

## 1. مصادر البيانات الحالية (مفحوصة فعلياً)

| المصدر | الأعمدة الحاكمة | الصلاحية للأداء الموحد |
| --- | --- | --- |
| `exam_sessions` | `user_id, template_id, mode(training/strict/ministry), status, score, total_points, is_final, grading_status, ministerial_model_id, ministerial_attempt_mode, started_at, submitted_at, completed_at` | **المصدر الرئيسي**. يغطي العادي والوزاري في جدول واحد — لا حاجة لتوحيد مصدرين. |
| `exam_session_questions` | `question_revision_id, logical_question_id, max_score, pin_mode` | تثبيت النسخة التاريخية لكل سؤال معروض. |
| `exam_session_answers` | `is_correct, final_score, max_score, grading_status, requires_manual_review, answered_at` | يميّز صحيح/خطأ/فراغ/بانتظار تصحيح يدوي. |
| `question_targets` | `revision_id, lesson_id, unit_id, subject_id, is_primary` | نسبة السؤال إلى الدرس **عبر revision** = صحة تاريخية مضمونة. |
| `user_progress` | `user_id, lesson_id, completed, quiz_score, completed_at` | تقدّم المحتوى (completion progress). |
| `unit_practice_attempts` / `practice_attempts` | نتائج تدريب الوحدة والدرس | مصدر ثانوي (تدريب غير امتحاني). |
| `subjects/units/lessons` | التسمية والتسلسل | العرض فقط. |

### ما يمكن استخراجه اليوم بدون أي جدول جديد

| المؤشر | متاح؟ | المصدر |
| --- | --- | --- |
| attempts_count | نعم | `exam_sessions` |
| avg / best / latest_percentage | نعم | `score / total_points * 100` |
| improvement trend | نعم | فارق متوسط النصف الأول/الأخير زمنياً (نفس منطق 14F) |
| training vs strict | نعم | `mode` + `ministerial_attempt_mode` |
| ordinary vs ministerial | نعم | `ministerial_model_id IS NULL` |
| performance by subject | نعم | القالب/النموذج ← المادة |
| performance by lesson | نعم | `exam_session_questions.question_revision_id → question_targets.revision_id` |
| completion progress | نعم | `user_progress` مقابل دروس المسار |
| weak / strong lessons | نعم | دقة الدرس (عتبة 60%) |
| wrong rate / blank rate | نعم | `exam_session_answers` مقابل عدد الأسئلة المعروضة |
| repeated mistakes / mastered later | نعم | منطق 15B نفسه |
| average elapsed time | نعم | `submitted_at - started_at` |

**النتيجة:** البيانات الحالية كافية بالكامل. لا مؤشر مطلوب يفتقر إلى مصدر.

---

## 2. Reuse First — تصنيف المكونات

| العنصر | التصنيف | السبب |
| --- | --- | --- |
| `get_ministerial_performance_overview()` (14F) | **ADAPT** | منطقه هو المعيار الذهبي (نِسَب، pinned revision، استبعاد اليدوي، `submitted+expired`)، لكنه مقيّد بالوزاري ومسار الطالب. يُعمَّم بنفس التعريفات إلى دالة موحدة. |
| `current_student_track_id()` | **REUSE_AS_IS** | عزل المسار جاهز ومختبر. |
| منطق تجميع 15B (`list_my_mistakes` / `get_admin_mistake_insights`) | **REUSE_AS_IS** | `mistake_patterns` في العقد الموحد يستدعي 15B بدل إعادة حسابه. |
| `src/lib/ministerial/ministerial-analytics-api.ts` (الأنواع + `formatPercentage/formatElapsed`) | **REUSE_AS_IS** | تُرفع إلى `src/lib/performance/` كطبقة عرض مشتركة. |
| مكوّنات 15A (`ReviewCard`, `ListSkeleton`, `EmptyState`, `StateMessage`, `Breadcrumbs`) | **REUSE_AS_IS** | نفس نظام التصميم والـTokens. |
| `ProgressSummary` + `AchievementsSection` + `useHomeDashboard` / `get_dashboard_stats` | **ADAPT** | تصبح قسم "التقدّم في المحتوى" داخل `/performance` بدل حساب ثانٍ. |
| أشرطة/بطاقات الأداء في `ministerial-exams.performance.tsx` (`StatCard`, `Bar`, `LessonRow`) | **ADAPT** | تُستخرج كمكونات مشتركة، وتبقى الصفحة الوزارية تستهلكها. |
| أنماط Performance UI من مفاضلة | **ADAPT** (البصري فقط) |ن تُنقل الـLayout patterns مع Design Tokens الخاصة بتمكين. |
| أي نمط مفاضلة يحمّل نتائج طلاب آخرين للعميل (percentile/leaderboard) | **REJECT** | خرق خصوصية وحِمل شبكة. |
| `lessonProgressStats.ts` (مفاضلة) | **REJECT** | `user_progress` + `get_dashboard_stats` يغطيان نفس الشيء؛ نسخه = طبقة حساب ثالثة. |
| حساب أي مؤشر داخل العميل | **REJECT** | التعريف يعيش في SQL فقط. |

**القاعدة الملزمة:** كل مؤشر يُعرَّف مرة واحدة في SQL، والعميل يعرض فقط.

---

## 3. Unified Student Contract المقترح

RPC واحدة رئيسية:

```
get_student_unified_performance(_scope text default 'all')  -- 'all' | 'ordinary' | 'ministerial'
returns jsonb
```

الشكل:

```jsonc
{
  "summary": { "attempts_count", "graded_attempts_count", "pending_manual_count",
               "avg_percentage", "best_percentage", "latest_percentage",
               "improvement_percentage_points", "avg_elapsed_seconds" },
  "progress": { "total_lessons", "completed_lessons", "progress_percent" },
  "assessment_performance":  { "attempts", "avg_percentage", "best_percentage",
                               "by_mode": [{ "mode", "attempts", "avg_percentage" }] },
  "ministerial_performance": { "attempts", "avg_percentage", "best_percentage",
                               "by_mode": [...] },
  "by_subject": [{ "subject_id", "subject_name", "attempts", "avg_percentage", "best_percentage" }],
  "by_lesson":  [{ "lesson_id", "lesson_title", "asked", "auto_graded",
                   "correct", "wrong", "blank", "manual_pending", "accuracy" }],
  "strengths":  [{ "lesson_id", "lesson_title", "asked", "accuracy" }],   // accuracy >= 80
  "weaknesses": [{ "lesson_id", "lesson_title", "asked", "accuracy" }],   // accuracy < 60
  "mistake_patterns": { "total_mistakes", "repeated_mistakes", "mastered_later",
                        "wrong_rate", "blank_rate", "unlinked_questions_count" },
  "recommendations_inputs": { "weak_lesson_ids", "repeated_mistake_lesson_ids",
                              "incomplete_lesson_ids" }   // مدخلات فقط، بلا AI في 15C
}
```

**القرار:** RPC واحدة (`jsonb`) وليس عدة نداءات + تجميع في العميل.
السبب: طلب شبكي واحد لصفحة كاملة (ضعف الإنترنت هو المبدأ الحاكم)، ولا يُنزَّل أي dataset خام. الطلبات الثقيلة/المفصّلة (قائمة الأخطاء المرقّمة) تبقى في RPCs 15B الحالية عند الطلب فقط.

`by_lesson` تُقيَّد بحدّ أعلى (Top N حسب عدد الأسئلة) داخل SQL؛ التفاصيل الكاملة عبر RPC مرقّم منفصل عند الحاجة.

---

## 4. Student Surface (لاحقاً — غير منفّذ الآن)

`/performance`: متوسط الأداء، أفضل نتيجة، اتجاه التحسن، التقدم في المحتوى، حسب المادة، حسب الدرس، نقاط القوة، يحتاج مراجعة، أخطاء متكررة، تدريب مقابل محاكاة/عادي. تُغذّى كلها من نداء واحد أعلاه. تبقى `/ministerial-exams/performance` كعرض مركَّز على الوزاري ويصبح مصدرها هو نفس التعريفات.

---

## 5. Admin Surface (لاحقاً)

`/admin/learning-insights/performance` عبر `get_admin_performance_insights(...)` (تجميعي فقط):
متوسط الأداء حسب الصف / المسار / المادة / الدرس، معدل الإكمال، أضعف المواد، أضعف الدروس، نسب الخطأ والفراغ، اتجاهات التحسن، ومقارنة العادي بالوزاري.

V1 = Aggregates only: لا أسماء طلاب، لا `user_id` lists، لا دفتر طالب فردي. كل مجموعة تُعرض فقط عند `students_count >= 3` (نفس نهج 15B) لمنع إعادة التعرّف.

---

## 6. Student / Admin Metric Parity

Source of Truth واحد: دوال SQL داخلية مشتركة يستهلكها الطرفان، بنفس التعريفات:

- **percentage** = `score / NULLIF(total_points,0) * 100`.
- **attempt inclusion** = `status IN ('submitted','expired') AND is_final AND grading_status='GRADED'`.
- **manual pending** = مستبعد من المتوسطات والاتجاه، ويُعرض كعدّاد `pending_manual_count`.
- **expired + graded** = مُحتسب.
- **lesson attribution** = عبر `question_revision_id → question_targets.revision_id` (primary target أولاً).
- **historical pinned revision** = دائماً؛ لا ربط بأحدث نسخة.

أي مؤشر إداري يُشتق من نفس الدالة الداخلية، لا من استعلام مستقل. يُختبر بحارس تكافؤ (نفس dataset ⇒ نفس الأرقام) كما في 15B.

---

## 7. Historical Correctness

مضمونة بنفس آلية 14F/15B: كل نسبة سؤال/درس تُحسب من `exam_session_questions.question_revision_id`، فلا يتغيّر تاريخ الطالب عند نشر نسخة جديدة. السؤال بلا هدف درس لا يُسقَط بل يُعدّ في `unlinked_questions_count`.

---

## 8. Manual Grading

`requires_manual_review = true` أو `grading_status <> 'GRADED'`:
خارج المتوسط النهائي، خارج الاتجاه، خارج مقام الدقة، ويظهر كـ`manual_pending` / `pending_manual_count` فقط. لا نتيجة جزئية تُعامل كنهائية.

---

## 9. Percentage Normalization

كل مقارنة بالنسبة المئوية. `total_points` يختلف بين القوالب والنماذج، لذا المقارنة بالدرجة الخام ممنوعة. `total_points = 0/NULL` ⇒ المحاولة خارج المتوسطات.

---

## 10. الأداء والمقياس

- **Joins المتوقعة:** `exam_sessions → exam_session_questions → exam_session_answers → question_targets → lessons/subjects`.
- **الفهارس الموجودة:** `idx_exam_sessions_user_status_created (user_id,status,created_at DESC)`، `idx_exam_session_answers_session`، `exam_session_questions_id_session_uidx`، `question_targets_revision_idx`. تغطي مسار الطالب بالكامل.
- **الفجوة الوحيدة:** التجميع الإداري عبر الزمن يمسح `exam_sessions` بدون فهرس زمني عام ⇒ `NEW_INDEX` مقترح واحد: `(created_at DESC)` أو `(ministerial_model_id, created_at DESC)` جزئي. يُقاس بـ`EXPLAIN` قبل الإضافة، ولا يُضاف قبل ثبوت الحاجة.
- **سقف 1000 صف:** لا ينطبق — RPC تجميعية ترجع أعداداً ونِسَباً، والقوائم التفصيلية مرقّمة (نفس نمط 15A/15B).
- **تكلفة التجميع المتكرر:** يُحتوى بـ`staleTime` في React Query (دقيقتان للطالب، خمس للأدمن).
- **MATERIALIZED_READ_MODEL / NEW_TABLE:** غير مبرَّر عند الحجم الحالي (بيانات المحاولات على القاعدة المشتركة = 0 حتى الآن). يُعاد التقييم فقط إذا تجاوز زمن RPC 800ms على بيانات حقيقية.

---

## 11. الأمن

- الطالب: `SECURITY DEFINER` + `SET search_path = public, pg_temp`، **بلا معامل `user_id`**؛ النطاق `auth.uid()` فقط. `auth.uid() IS NULL ⇒ unauthorized`.
- الأدمن: حارس دور (`has_role`/`is_content_staff` حسب العقد) داخل الدالة، ومخرجات تجميعية فقط.
- `REVOKE ALL ... FROM PUBLIC, anon` + `GRANT EXECUTE ... TO authenticated`.
- عزل المسار الوزاري عبر `current_student_track_id()` باقٍ كما هو.
- ممنوع في المخرجات: مفتاح الإجابة، `correct_option_code`، `question_options`، `is_correct` خام على مستوى سؤال معروض، الحلول المخفية.
- لا تصحيح في العميل، ولا percentile مبني على تحميل نتائج طلاب آخرين (**REJECT**).

---

## 12. الخلاصة

```
CURRENT_DATA_SUFFICIENT=YES
14F_REUSABLE=YES (ADAPT — تعميم نفس التعريفات)
15B_REUSABLE=YES (REUSE_AS_IS — mistake_patterns)
15A_REUSABLE=YES (REUSE_AS_IS — UI/الحالات/الترقيم)
ORDINARY_EXAMS_SUPPORTED=YES
MINISTERIAL_SUPPORTED=YES
LESSON_PROGRESS_SUPPORTED=YES
STUDENT_CONTRACT=get_student_unified_performance(_scope) -> jsonb (نداء واحد)
ADMIN_CONTRACT=get_admin_performance_insights(...) -> jsonb (تجميعي فقط، عتبة k>=3)
STUDENT_ADMIN_METRIC_PARITY=ENFORCED (دوال SQL داخلية مشتركة + حارس تكافؤ)
HISTORICAL_REVISION_SAFE=YES (pinned revision → question_targets.revision_id)
MANUAL_GRADING_SAFE=YES (مستبعد من avg/trend، يظهر كعدّاد)
PERCENTAGE_NORMALIZED=YES
NEW_TABLE_REQUIRED=NO
NEW_RPC_REQUIRED=YES (2: student + admin، وشيء من الدوال الداخلية المشتركة)
NEW_INDEX_REQUIRED=CONDITIONAL (فهرس زمني واحد للتجميع الإداري، بعد EXPLAIN فقط)
MIGRATION_REQUIRED=YES (RPCs فقط — لا جداول، لا بيانات)
PERFORMANCE_RISK=LOW
SECURITY_RISK=LOW
BLOCKERS=NONE
RECOMMENDED_ARCHITECTURE=Derived read-model عبر RPCs محسوبة فوق exam_sessions/answers/user_progress، بمصدر حقيقة واحد يشترك فيه سطح الطالب وسطح الأدمن، مع إعادة استخدام 14F كتعريف مرجعي و15B كمصدر أنماط الأخطاء.
```

**الحكم: UNIFIED_PERFORMANCE_EXISTING_DATA_REUSE_AUDIT_15C.0 = PASS_MIGRATION_REQUIRED**

(البيانات كافية ولا جدول تحليلات جديد؛ الترحيل القادم مخصص حصراً لدوال القراءة الآمنة.)
