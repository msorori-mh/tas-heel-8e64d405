# PAST_MINISTERIAL_EXAMS_STUDENT_EXPERIENCE_14D — تقرير التنفيذ

التاريخ: 2026-08-14
المراجع الملزمة: 14A (Architecture) · 14B (Foundation) · 14C.2 (Admin Import) · TCS-2 · `subject_curriculum_tracks`
النطاق: تجربة الطالب (استعراض + فتح النماذج) فقط. لا بيانات وزارية على القاعدة المشتركة. لا تعديل على مسار استيراد المحتوى.

---

## 1) MIGRATION (مانع حقيقي — مبرَّر)

الخطة كانت "لا Migration إلا لمانع حقيقي". ظهر مانعان:

1. **RLS غير كافية للعزل**: السياسة السابقة `Authenticated read published ministerial models` كانت `status='published'` فقط ⇒ طالب صنعاء يستطيع قراءة نموذج عدن عبر PostgREST مباشرة.
2. **`get_exam_session_state` لا يخدم الجلسات الوزارية**: يقرأ من `exam_template_questions` + `questions` (المسار القديم)، بينما الجلسة الوزارية مبنية على `exam_session_questions` (Snapshot / REVISION_PINNED) ⇒ كان سيُرجع 0 أسئلة.

الترحيل المطبَّق: `supabase/migrations/20260814214232_c35530ab-85f2-4cc7-98e8-f66d3d59d55e.sql`

| العنصر | الوصف |
|---|---|
| POLICY `Students read own-track published ministerial models` | `published` + `can_access_subject(subject_id)` + `profiles.curriculum_track_id = model.curriculum_track_id` |
| `list_ministerial_subjects()` | مواد لديها نماذج منشورة لمسار الطالب + عدد النماذج + أحدث سنة |
| `list_ministerial_models(_subject_id)` | نماذج المادة لمسار الطالب: السنة، الدور، الـvariant، عدد الأسئلة، المدة، حالة آخر محاولة |
| `get_ministerial_model_overview(_model_id)` | تفاصيل نموذج واحد قبل البدء (يرفض نموذج مسار آخر بـ `ministerial_model_not_available`) |
| `get_ministerial_session_state(_session_id)` | حالة الجلسة من الـSnapshot فقط، `reveal = false` دائماً |

كلها `SECURITY DEFINER` + `SET search_path = public` + `REVOKE ... FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated`.
لم تُنشأ جداول جديدة، ولم تُلمس بيانات المنهج، ولا توجد صفوف Demo.

---

## 2) الواجهة

| الملف | الدور |
|---|---|
| `src/lib/ministerial/ministerial-student-api.ts` | غلاف RPC + تسميات الأدوار + تنسيق المدة + خرائط الأخطاء |
| `src/routes/_authenticated/ministerial-exams.index.tsx` | قائمة المواد (عدد النماذج + أحدث سنة) |
| `src/routes/_authenticated/ministerial-exams.$subjectId.tsx` | نماذج المادة (سنة — دور — نموذج، عدد الأسئلة، المدة، حالة المحاولة) |
| `src/routes/_authenticated/ministerial-exams.models.$modelId.tsx` | شاشة ما قبل البدء + تعليمات + اختيار الوضع |
| `src/routes/_authenticated/ministerial-exams.sessions.$sessionId.tsx` | تجربة التدريب/المحاكاة |
| `src/components/home/MinisterialExamsEntry.tsx` | مدخل الصفحة الرئيسية — للصف الثالث الثانوي (`grade-12`) فقط |

- **Training**: سؤال واحد في كل مرة، Previous/Next، شريط تقدّم، بلا مؤقت.
- **Strict**: مؤقت تنازلي، شبكة أسئلة (مُجاب/غير مُجاب)، تنقّل، تأكيد تسليم، قفل تلقائي عند انتهاء الوقت.
- بدء الجلسة حصراً عبر `create_ministerial_exam_session(_model_id)`؛ لا استخدام لـ`create_exam_session_with_snapshot`.
- الأسئلة تُقرأ من Snapshot الجلسة فقط؛ لا SELECT مباشر على `ministerial_exam_questions` أو `question_revisions` أو الحلول.
- RTL، Mobile-first، حمولة صغيرة (RPC واحدة لكل شاشة)، بلا preload لكل المحتوى.

---

## 3) BLOCKERS مسجّلة لـ14E

1. **Safe reveal path غير جاهز** — لا يوجد مسار خادمي معتمد لكشف الإجابة/التفسير للنماذج الوزارية. لذلك واجهة التدريب جاهزة **بدون** أي كشف، ولا تُحمَّل إجابات صحيحة للعميل إطلاقاً.
2. **التصحيح والنتيجة** — `submit_exam_session` يصحّح عبر `questions.correct_index` + `exam_template_questions` (المسار القديم) وهو غير صالح للنماذج المثبَّتة على نسخ QB. لذلك زر التسليم يعرض تأكيداً وتنبيهاً صريحاً بأن التصحيح يأتي في 14E، ولا يُستدعى RPC تصحيح خاطئ. الإجابات محفوظة على الخادم عبر `answer_exam_question`.
3. **Offline** = FUTURE فقط؛ لا تخزين محلي لأي محتوى وزاري (مُختبَر ثابتاً).
4. **Entitlement/Paywall**: لم تُخترع بوابة جديدة. الوصول محكوم بـ`can_access_subject` (الصف + المسار) داخل RPCs/RLS، وهو نقطة التوسعة الوحيدة عند حسم سياسة الاشتراك للنماذج الوزارية (مرحلة monetization منفصلة).

---

## 4) نتائج الاختبارات

**اختبارات أمان جديدة**: `tests/security/ministerial-student-experience-14d.static.test.mjs` — 6/6 PASS.

| الاختبار | النتيجة |
|---|---|
| RLS: نموذج بمسار مختلف غير مرئي (`profiles.curriculum_track_id` شرط في السياسة) | PASS |
| فتح رابط نموذج مسار آخر مباشرة ⇒ `ministerial_model_not_available` | PASS |
| المادة المشتركة: محتوى مشترك + نماذج بمسار الطالب فقط | PASS (بحكم شرط `curriculum_track_id` مع `can_access_subject`) |
| SELECT مباشر على `ministerial_exam_questions` من العميل | DENY (لا سياسة SELECT لغير Content staff) + ممنوع ثابتاً في الكود |
| bypass عبر منشئ جلسة عام | DENY (لا استدعاء له في مسار الطالب — مُختبَر ثابتاً) |
| إنشاء جلسة وزارية آمنة | PASS (`create_ministerial_exam_session` مع بوابتَي المادة والمسار) |
| تسريب إجابات قبل الكشف | ZERO (`get_ministerial_session_state` لا يُرجع أي حقل إجابة/حل) |

**Regression**: `bunx vitest run tests/student tests/security` ⇒ 15/15 PASS (ملفات `node:test` غير معنية بمشغّل vitest).
تم تصحيح مسار ملف الترحيل في اختبار 13F بعد نقله إلى `supabase/migrations/`.
`bunx tsgo --noEmit` ⇒ PASS. تشغيل حي على `/ministerial-exams` بحساب طالب ⇒ حالة فارغة سليمة، بلا أخطاء Console.

---

## الحكم

**PAST_MINISTERIAL_EXAMS_STUDENT_EXPERIENCE_14D = PASS**
(مع Blockers مسجّلة أعلاه لمرحلة 14E: safe reveal + التصحيح والنتائج.)
