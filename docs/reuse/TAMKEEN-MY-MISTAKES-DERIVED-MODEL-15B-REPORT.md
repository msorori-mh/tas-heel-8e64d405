# TAMKEEN_MY_MISTAKES_DERIVED_MODEL_15B — تقرير التنفيذ

المرجع: `docs/reuse/MY-MISTAKES-EXISTING-DATA-REUSE-AUDIT-15B0.md`
الحكم السابق: `MY_MISTAKES_EXISTING_DATA_REUSE_AUDIT_15B.0 = PASS_MIGRATION_REQUIRED`
القرار المعماري الملزم المطبَّق: **`NEW_MISTAKE_TABLE = NO`**

---

## 1. ما نُفِّذ

| الطبقة | الملف |
|---|---|
| Migration (Pending فقط) | `supabase/migrations-pending/20260817010000_my_mistakes_derived_model_15b.sql` |
| API عميل (قراءة فقط) | `src/lib/mistakes/my-mistakes-api.ts` |
| بطاقة الخطأ | `src/components/mistakes/MistakeCard.tsx` |
| الصفحة | `src/routes/_authenticated/my-mistakes.tsx` (`/my-mistakes`) |
| مدخل الرئيسية | `src/components/home/MyMistakesEntry.tsx` |
| اختبار أمان ثابت | `tests/security/my-mistakes-15b.static.test.mjs` |
| بروفة PG17 | `tests/import/run-pg17-my-mistakes-15b-rehearsal.sh` + `tests/import/fixtures/pg17-my-mistakes-15b-smoke.sql` |

الـMigration تحتوي **دوال فقط**: لا `CREATE TABLE`، لا `CREATE POLICY`، لا `GRANT SELECT` على أي جدول،
ولا أي نسخ لنص السؤال أو الإجابات أو الصواب/الخطأ إلى تخزين جديد.

---

## 2. عقد الـRPCs

### `list_my_mistakes(_subject_id, _lesson_id, _attempt_scope, _status, _sort, _limit, _offset)`
- `_attempt_scope ∈ {ALL, ORDINARY, MINISTERIAL}` · `_status ∈ {ALL, WRONG, BLANK, REPEATED, MASTERED_LATER}`
  · `_sort ∈ {recent, most_repeated}` — أي قيمة أخرى ⇒ `RAISE EXCEPTION`.
- `_limit` يُقصّ خادمياً إلى 1..100، و`_offset ≥ 0`، والردّ يحمل `total` و`has_more` و`subjects` (facets للمواد).
- عناصر الردّ: `question_id, display_revision_id, question_text, subject_id, subject_name, lesson_id,
  lesson_title, wrong_count, blank_count, occurrence_count, first_mistake_at, last_mistake_at,
  latest_state, latest_attempt_type, latest_attempt_scope, latest_session_id, has_repeated_mistake,
  can_review_lesson, can_open_attempt`.

### `get_my_mistake_detail(_question_id)`
- بيانات السؤال الآمنة + `displayed_options` (من اللقطة، `option_code`+`body` فقط) + اختيار الطالب
  التاريخي + قائمة `occurrences` (جلسة، تاريخ، نوع محاولة، revision، حالة) + حالة الإتقان.
- لا تُرجع الإجابة الصحيحة ولا `is_correct` ولا أي حل مخفي.

لا يوجد `_user_id` في أي توقيع؛ الهوية من `auth.uid()` حصراً.

---

## 3. تعريف الحالات (كما نُفِّذ)

- **WRONG** — إجابة مصحَّحة نهائياً `is_correct = false`.
- **BLANK** — السؤال داخل جلسة مصحَّحة (`status ∈ {submitted, expired}` و`grading_status='GRADED'`)
  بلا صف إجابة أو بلا `selected_option_code`/`response_text`.
- **PENDING** — `requires_manual_review` أو إجابة غير `GRADED` ⇒ **لا تُحسب خطأً ولا صواباً**.
- **REPEATED** — `occurrence_count > 1` لنفس `logical_question_id`.
- **MASTERED_LATER** — يوجد occurrence صحيح **بعد** آخر خطأ. الخطأ التاريخي لا يُمحى:
  `wrong_count/blank_count/occurrence_count/first_mistake_at/last_mistake_at` تبقى كما هي، وتتغير
  `latest_state` فقط.

---

## 4. سلامة النسخة التاريخية

كل occurrence مصدره: `exam_sessions → exam_session_questions.question_revision_id (pinned) →
نتيجة التصحيح المخزّنة`. لا إعادة تصحيح، ولا استخدام لـ`current_published_revision_id`.
نسبة المادة/الدرس تُشتق من `question_targets` الخاصة **بنفس** الـrevision المثبَّتة، لذلك نشر R4
لا ينقل خطأ R3 إلى درس آخر. `display_revision_id` يُرجَع صراحةً لأحدث occurrence معروض.

البروفة تثبت ذلك: خطأ على R3 (هدفه «الدرس الأول») بعد نشر R4 (هدفه «الدرس الثاني») يبقى
`display_revision_id = R3` و`lesson_id = الدرس الأول`.

---

## 5. الأمان

- `SECURITY DEFINER` + `SET search_path = public, pg_temp` + `auth.uid() IS NOT NULL` في الدالتين.
- `REVOKE ALL … FROM PUBLIC` و`FROM anon`، و`GRANT EXECUTE … TO authenticated` للدوال الثلاث
  (بما فيها المساعِدة `_my_mistakes_safe_options`).
- لا `SELECT` مباشر جديد على `question_revisions` / `question_targets` / `question_options` /
  `ministerial_exam_questions`، ولا توسيع لأي RLS.
- عزل المسار الوزاري محفوظ (14D–14H): كل جلسة وزارية تُفلتر بـ
  `ministerial_exam_models.curriculum_track_id = current_student_track_id()` ⇒ cross-track = DENY.
- الواجهة لا تقرأ `exam_session_*` مباشرة؛ كل شيء عبر الـRPCs.
- «راجع المحاولة» تعيد التوجيه إلى مسار النتيجة القائم (عادي: `/exams/history/$sessionId`،
  وزاري: `/ministerial-exams/sessions/$sessionId/result`) الخاضع لسياسة الكشف الحالية — بلا bypass جديد.

---

## 6. الأداء والفهارس

الاستعلام يقصّ أولاً بجلسات الطالب (`idx_exam_sessions_user_status_created`) ثم ينضم إلى اللقطة
والإجابات عبر مفاتيحها. التجميع والترقيم على الخادم بالكامل. لم يُضَف أي Index جديد.
**Performance finding (مسجَّل، غير مطبَّق):** عند تفعيل مسار التدريب أو نمو المحاولات، المرشح الأول
`practice_attempts(user_id, submitted_at DESC)` ثم `exam_session_questions(logical_question_id)` —
يُضاف فقط بعد إثبات EXPLAIN على حجم إنتاجي.

**نطاق V1:** `exam_sessions` فقط (عادي + وزاري تدريب + وزاري محاكاة). مسار
`practice_attempts` **غير مُدّعى** في V1، و`unit_practice_attempts` مستبعد نهائياً (لا يثبّت النسخة).

---

## 7. الواجهة

`/my-mistakes` — Mobile-first + RTL، معادة الاستخدام من 15A: `ChipButton`, `EmptyState`,
`ListSkeleton`, ونمط البطاقة. تبويبات: الكل · أخطأت فيها · تركتها فارغة · متكررة · أتقنتها لاحقاً.
مرشّحات: نوع المحاولة · المادة · الأحدث/الأكثر تكراراً. البطاقة تعرض نص السؤال، المادة، الدرس،
عدد مرات الخطأ، آخر خطأ، الحالة، وأزرار «راجع الدرس» و«راجع المحاولة».
لم تُنفَّذ «أعد التدريب على هذا السؤال» (تتطلب محرك جلسة جديد) — مؤجلة كما نصّت الخطة.

---

## 8. نتائج البروفة (PostgreSQL 17 معزول)

`bash tests/import/run-pg17-my-mistakes-15b-rehearsal.sh` ⇒ **RESULT: 15B REHEARSAL = PASS** (35/35 assertions،
مع تطبيق الـMigration مرتين للتحقق من الـidempotency).

| السيناريو المطلوب | النتيجة |
|---|---|
| student A mistake | ALLOW ✔ |
| student B mistake | DENY ✔ |
| anon | DENY ✔ (list + detail + عدم وجود EXECUTE) |
| wrong question | INCLUDED ✔ |
| blank question | INCLUDED ✔ (بلا صف إجابة) |
| correct-only question | EXCLUDED ✔ |
| same question wrong 3 times | `occurrence_count = 3` ✔ |
| wrong then correct | `MASTERED_LATER` مع بقاء التاريخ ✔ |
| R3 wrong / publish R4 | occurrence + lesson من R3 ✔ |
| ministerial Sanaa student / Aden model history | DENY ✔ |
| question without lesson | NOT DROPPED ✔ |
| pagination > 1000 records | `total = 1210`، offset 1100 يعيد 100 صف، لا اقتطاع ✔ |
| answer key / is_correct / hidden solution payload | ZERO ✔ |

---

## 9. الانحدار

| البند | النتيجة |
|---|---|
| Quick Review 15A | PASS |
| ordinary exams / QB / TCS-2 / ministerial 14D–14H | PASS (لا تغيير في مساراتها) |
| direct lessons / PDF lessons | PASS (لا تغيير) |
| static security (15B) | 13/13 PASS |
| vitest (tests/security + tests/review + tests/import) | 95/95 PASS |
| typecheck (`tsgo --noEmit`) | PASS |
| build | PASS |

ملاحظة: ملفات `*.test.mjs`/`qb02-*` التي يبلغ عنها vitest بـ"No test suite found" حالة سابقة
لهذه المرحلة ولم تتغيّر بها.

---

## 10. البطاقة النهائية

```
DERIVED_MODEL        = YES (RPC فوق بيانات المحاولات القائمة)
NEW_TABLE_CREATED    = NO
RPC_LIST             = list_my_mistakes(uuid, uuid, text, text, text, int, int)
RPC_DETAIL           = get_my_mistake_detail(uuid)
CANONICAL_IDENTITY   = exam_session_questions.logical_question_id
HISTORICAL_REVISION  = PINNED (question_revision_id + target الخاص بها)
MASTERED_LATER       = YES (لا يمحو التاريخ، يغيّر الحالة فقط)
ORDINARY_EXAMS       = SUPPORTED
MINISTERIAL_EXAMS    = SUPPORTED (training + strict)
TRACK_ISOLATION      = ENFORCED (cross-track DENY)
PAGINATION           = SERVER_SIDE (limit ≤ 100 + offset + total + has_more)
ANSWER_LEAK          = ZERO
PG17                 = PASS (35/35)
STATIC_SECURITY      = PASS (13/13)
TYPECHECK            = PASS
BUILD                = PASS
MIGRATION_REQUIRED   = YES (RPCs فقط، Pending)
SHARED_DB_APPLIED    = NO
SHARED_DB_WRITES     = NO
BLOCKERS             = NONE
```

**الحكم: `TAMKEEN_MY_MISTAKES_DERIVED_MODEL_15B = PASS_READY_FOR_APPLY`**

الخطوة التالية تحتاج تفويضاً صريحاً:
`MY_MISTAKES_DERIVED_MODEL_15B_SHARED_APPLY = AUTHORIZED`.
