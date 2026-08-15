# TAMKEEN ← MUFADALA — Reuse Integration Readiness (15)

> نطاق هذا المستند: **مطابقة وتصنيف فقط**. لا Migration، لا DB writes، لا نقل ملفات.
> المصدر: `MUFADALA-TO-TAMKEEN-REUSE-AUDIT-15.md` (الحكم في المصدر: `MUFADALA_REUSE_AUDIT_15 = PASS`).
> المرجع في الحكم النهائي هو **الواقع الحالي لتمكين**، لا افتراضات تقرير مفاضلة.

---

## 0. ما تم فحصه فعلياً في تمكين

| المحور | الملفات/الكائنات المفحوصة | النتيجة |
|---|---|---|
| تصنيف المحتوى | `grades`, `subjects`, `units`, `lessons`, `curriculum_tracks`, `subject_curriculum_tracks`, TCS‑2 (`sub-*-NNN`) | موجود وناضج |
| الملخصات | جدول `lesson_summaries` (`summary`, `key_points`, `study_tip`) + `get_lesson_safe_extras` | موجود، لكن القراءة الحالية **لدرس واحد فقط** (`lessons.$lessonId.tsx`) |
| التقدّم | `user_progress` (`lesson_id`, `completed`, `completed_at`, `quiz_score`) | موجود |
| بوابة الوصول | `can_access_lesson`, `can_access_subject`, `has_active_subscription` + `src/lib/student-free-access.ts` (`STUDENT_FREE_ACCESS`) | موجود |
| التصحيح على الخادم | `grade_lesson_quiz`, `grade_unit_practice`, `answer_ministerial_exam_question`, `get_ministerial_session_result`, `get_ministerial_performance_overview` + مراحل 14D/14E/14F/14G/14H | موجود ومُحكم |
| الأخطاء (Mistakes) | `exam_session_answers.is_correct/grading_status/revealed_at`, `practice_attempt_responses`, `ministerial_*` | البيانات الخام موجودة، **لا يوجد دفتر أخطاء ولا RPC تجميعي** |
| Charts/Build | `recharts@^2.15.4`، لا `manualChunks` في `vite.config.ts` | لا قيد قائم |
| مكتبة الواجهة | shadcn كاملة (`card|badge|progress|skeleton|tabs|dialog`)، RTL + Cairo افتراضي | جاهزة |
| Quick Review / My Mistakes | لا يوجد أي أثر لهما في `src/` | غير مُنفَّذ (نقطة البداية) |

---

## 1. الأحكام المطلوبة

```
QUICK_REVIEW_READY = YES_WITH_ADAPTER
  الواجهة والمنطق النقي قابلان للنقل كما هما.
  المطلوب فقط: طبقة مزوّد بيانات تمكينية تُنتج ReviewItem/ReviewGroup
  من (lessons + lesson_summaries + user_progress) داخل حدود RLS الحالية.

MY_MISTAKES_READY = NO_NOT_YET
  نموذج دورة حياة الخطأ (wrong → reviewed → mastered) قابل للتبني مفاهيمياً،
  لكن لا يوجد في تمكين مخزن أخطاء ولا RPC تجميعي آمن.
  يتطلب مرحلة قاعدة بيانات مستقلة (خارج نطاق هذا المستند).
```

### BLOCKERS

```
BLOCKERS_ORIGINAL = 7   (B1..B7)

BLOCKERS_ALREADY_SOLVED = 4
  B1  تصنيف المحتوى — مُغلق. تمكين يملك grades/subjects/units/lessons + TCS-2 +
      curriculum_tracks + subject_curriculum_tracks (مادة مشتركة متعددة المسارات).
      العقد ReviewItem/ReviewGroup يُشتق مباشرة ولا يحتاج قراراً تصنيفياً جديداً.
  B2  بوابة الوصول — مُغلق. can_access_lesson / can_access_subject (RLS + RPC)
      + علم STUDENT_FREE_ACCESS للواجهة. لا حاجة لأي مقابل لـ useStudentAccess.
  B3  التصحيح على الخادم — مُغلق. تمكين يملك محرك تصحيح خادمي كامل
      (14D→14H): تثبيت النسخ، كشف الحل بعد التسليم فقط، is_correct محسوبة خادمياً،
      وتحليلات عبر RPC. بلوكر مفاضلة **غير صالح تلقائياً** في تمكين.
  B7  manualChunks/recharts — غير قائم. vite.config.ts لا يعرّف manualChunks.

BLOCKERS_STILL_VALID = 3
  B4  الخصوصية/Leaderboard — قائم كقرار منتج، لكنه خارج نطاق 15A/15B (مؤجل → REJECT الآن).
  B5  سقف 1000 صف في PostgREST — قائم وينطبق على أي استعلام قائمة جديد في 15A.
      الإلزام: range صريح / تقسيم حسب المادة / RPC خادمي.
  B6  رموز التصميم — قائم. كل ودجت منقول يحمل ألوان Tailwind خام
      (bg-green-100, text-blue-500) يجب تحويله إلى tokens تمكين قبل الدمج.
```

### الملفات

```
FILES_REUSE_AS_IS = 4
  src/lib/quickReviewFormat.ts        → src/lib/review/review-format.ts
      (chunkSummary, estimateReadMinutes — دوال نقية، بلا تبعيات)
  EmptyState  (مستخرج من QuickReview.tsx:591-621)  → src/components/common/EmptyState.tsx
  LoadingState (مستخرج :573-589)                   → src/components/common/ListSkeleton.tsx
  ChipButton  (مستخرج :538-571)                    → src/components/common/ChipButton.tsx
  ملاحظة: الاستنساخ الحرفي مشروط بإصلاح ألوان الرموز (B6) وحده.

FILES_ADAPT = 4
  QuickReview.tsx (Focus Mode :237-534) → <FocusReader items onClose onOpenItem />
      يُستخرج كمكوّن مستقل data-agnostic (swipe + keyboard RTL + back-button +
      hint في sessionStorage + scroll lock + safe-area). تعديلات إلزامية:
        · history.back() عند الإغلاق البرمجي (إصلاح خطر الـ sentinel المتراكم)
        · شارة العدّاد تعتمد المجموعة المُفلترة لا الكل
        · إزالة filteredLessons.length من deps
  QuickReviewCard.tsx → src/components/review/ReviewCard.tsx (props = ReviewItem)
  هيكل صفحة QuickReview (header + chips + progress + 4 فروع فارغة) → src/routes/_authenticated/quick-review.tsx
  نموذج صف الأخطاء + تبويبات all|unmastered|mastered (القسم 11) → مرجع تصميم 15B فقط

FILES_REJECT = 8
  useQuickReviewData.ts            (استعلامات مفاضلة بالكامل)
  useStudentAccess / useTrackSubjectIds / useContentFilter / contentFilter.ts
  src/pages/past-exam/types.ts     (q_correct / q_explanation — تسريب مفتاح الإجابة)
  SearchContent.tsx                (تحميل الكتالوج كاملاً للعميل)
  Leaderboard data model           (كشف بيانات طلاب آخرين)
  Notifications direct client update({is_read})
  filterQuestionRowsByCurrentTrack (فلترة مسار على العميل كحد أمني)
  StudentPerformance client percentile
```

### الترحيلات

```
MIGRATION_REQUIRED_15A = CONDITIONAL_NO
  لا حاجة لأي تغيير schema. المسار المفضّل: قراءة lessons + lesson_summaries + user_progress
  ضمن RLS القائم مع نطاق صريح (subject/semester) لتفادي B5.
  يصبح مطلوباً RPC واحد للقراءة المجمّعة (read-only, SECURITY DEFINER, بلا أي حقل إجابة)
  فقط إذا أثبت القياس أن سياسات lesson_summaries تمنع القراءة الجَمْعية حسب المادة،
  أو أن عدد الصفوف يتجاوز الحد الآمن. القرار يُتخذ بقياس، لا بافتراض.

MIGRATION_REQUIRED_15B = YES
  مطلوب في مرحلة لاحقة مستقلة:
   · مخزن دورة حياة الخطأ (wrong_count, last_wrong_at, last_reviewed_at, reviewed, mastered)
     أو عرض/RPC مشتق من exam_session_answers + practice_attempt_responses + الوزاري
   · RPC آمن get_my_mistakes بإسقاط أعمدة ثابت لا يحتوي أي مفتاح إجابة
   · RPC للكتابة mark_mistake_status (لا كتابة مباشرة من العميل)
   · GRANT + RLS لكل كائن جديد
```

### ترتيب التنفيذ الموصى به

```
RECOMMENDED_IMPLEMENTATION_ORDER =
  1. review-format.ts (نقي) + اختبار وحدة لـ chunkSummary/estimateReadMinutes
  2. primitives: EmptyState / ListSkeleton / ChipButton بـ tokens تمكين (يغلق B6)
  3. <FocusReader /> مستقل data-agnostic + عقد ReviewItem/ReviewGroup في src/lib/review/types.ts
  4. مزوّد بيانات تمكيني للمراجعة (نطاق صريح، مفتاح كاش يتضمن curriculum_track_id + subject_id) — يغلق B5
  5. صفحة /quick-review داخل _authenticated (read-only، بلا أي كتابة تقدّم)
  6. تحقق: أنواع + vitest + فحص ثابت "لا حقل إجابة في أي DTO مراجعة"
  7. (مرحلة منفصلة) 15B My Mistakes: تصميم DB أولاً ثم إعادة استخدام FocusReader
```

---

## 2. تصنيف كل توصية من التقرير داخل تمكين

| توصية مفاضلة | التصنيف في تمكين | السبب |
|---|---|---|
| `quickReviewFormat.ts` نقل حرفي | **REUSE_AS_IS** | دوال نقية بلا تبعيات |
| Focus Mode كقارئ مستقل | **ADAPT** | يُستخرج كـ `FocusReader` مع إصلاح 3 مخاطر معروفة |
| `QuickReviewCard` | **ADAPT** | إعادة ربط على `ReviewItem` + tokens |
| EmptyState / LoadingState / ChipButton | **REUSE_AS_IS** | بعد تحويل الألوان إلى tokens |
| عقد `ReviewItem`/`ReviewGroup` | **ADAPT** | يُشتق من تصنيف تمكين القائم؛ العقد نفسه غير موجود بعد |
| `useQuickReviewData` | **REJECT** | استعلامات ومجال مفاضلة |
| `useStudentAccess` وبدائل الوصول | **ALREADY_SOLVED_IN_TAMKEEN** | `can_access_lesson/subject` + RLS + STUDENT_FREE_ACCESS |
| "لا يوجد تصحيح خادمي" (B3) | **ALREADY_SOLVED_IN_TAMKEEN** | محرك 14D–14H خادمي بالكامل |
| Exam History (سجل الاختبارات) | **ALREADY_SOLVED_IN_TAMKEEN** | `/exams/history` + `/exams/history/$sessionId` منفّذان |
| Student Performance / تحليلات | **ALREADY_SOLVED_IN_TAMKEEN** | `get_ministerial_performance_overview` + `/ministerial-exams/performance` |
| Past Exam Stats card | **ADAPT** | التخطيط فقط، مصدر البيانات تمكيني |
| `past-exam/types.ts` | **REJECT** | يحمل `q_correct` |
| محرك الإنجازات (achievements engine) | **ADAPT** | تمكين يملك `badges`/`student_badges` خادمياً؛ يُستفاد من نمط `check(stats)` للعرض فقط |
| Leaderboard | **REJECT (مؤجل)** | قرار خصوصية غير متخذ، وخارج 15A/15B |
| Notifications (write patterns) | **REJECT** للكتابة، **ADAPT** لنمط setQueryData | الكتابة يجب أن تمر عبر RPC |
| Search الكامل على العميل | **REJECT** | مخالفة أداء وأمان |
| `mapAiHttpError` + `buildLocalFallback` | **ADAPT** | مفيدان لاحقاً، خارج 15A/15B |
| قيد `manualChunks`/recharts (B7) | **ALREADY_SOLVED_IN_TAMKEEN** | لا manualChunks في vite.config.ts |
| سقف 1000 صف (B5) | **ADAPT (إلزامي)** | ينطبق على كل استعلام جديد في 15A |
| ألوان Tailwind الخام (B6) | **ADAPT (إلزامي)** | مخالف لنظام تصميم تمكين |

---

## 3. حراس إلزاميون قبل أي نقل

1. Quick Review **قراءة فقط**: لا كتابة `user_progress` ولا أي كتابة أخرى.
2. لا يحتوي أي DTO مراجعة/أخطاء على حقل إجابة صحيحة أو شرح كاشف قبل التسليم.
3. كل استعلام قائمة له نطاق صريح ومفتاح كاش يتضمن `curriculum_track_id`.
4. عزل المسار الدراسي يبقى مفروضاً في القاعدة (RLS/RPC)، لا في العميل.
5. لا Migration ولا كتابة على القاعدة المشتركة ضمن 15A إلا بإذن صريح منفصل.

---

## الحكم

```
TAMKEEN_MUFADALA_REUSE_INTEGRATION_READINESS_15 = PASS_READY_FOR_IMPLEMENTATION
  15A Quick Review : جاهز للتنفيذ فوراً (UI + منطق نقي + مزوّد بيانات تمكيني، بلا Migration).
  15B My Mistakes  : غير جاهز — يحتاج مرحلة تصميم قاعدة بيانات مستقلة قبل أي نقل.
```
