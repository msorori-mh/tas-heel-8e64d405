# TAMKEEN_YOUSUF_LESSON_CONTENT_WORKFLOW_20C — PHASE 20C-A PREFLIGHT

المرجع: `TAMKEEN_LESSON_CONTENT_WORKSPACE_20B = PASS_READY_FOR_YOUSUF_WORKFLOW_IMPLEMENTATION`
`DRAFT_READY_MIGRATION_REQUIRED = YES` — هذه المرحلة **تحضير فقط**، بدون أي كتابة على قاعدة الإنتاج.

```
20C_BASE_SHA = db044e6e46a78e26162b8d3921b0d0845d32e978
```

---

## 1. LIFECYCLE_MODEL

`LIFECYCLE_MODEL = SINGLE_UNIFIED_TABLE (lesson_capability_lifecycle) keyed by (lesson_id, capability)`

راجعنا Proposal الـDraft/Ready من 20B و`content_review_state` القائم:
`content_review_state` مقيَّد بـ`entity_type ∈ (subjects, units, lessons, lesson_explanations, lesson_assessments, questions)`
وبنموذج `review_status × publication_status` على مستوى **الصف** لا على مستوى **القدرة**،
ولا يغطي `lesson_book_contents` / `lesson_summaries` / `lesson_resources` / `lesson_simulations`.
لذلك: **لا نموذج موازٍ جديد للمراجعة** — نُبقي `content_review_state` كما هو للاستيراد،
ونضيف طبقة واحدة صغيرة على مستوى القدرة، هي وحدها مصدر قرار ظهور المحتوى للطالب.

- `TABLES_CHANGED = 0` (لا عمود جديد على أي جدول محتوى)
- `COLUMNS_CHANGED = 0`
- `NEW_TABLES = public.lesson_capability_lifecycle`
- `NEW_INDEXES = lesson_capability_lifecycle_lesson_idx, lesson_capability_lifecycle_status_idx (+ UNIQUE (lesson_id, capability))`
- `NEW_CONSTRAINTS = capability_chk (9 قدرات), status_chk (DRAFT|REVIEW|READY), ready_chk (READY ⇒ ready_at NOT NULL), uniq(lesson_id, capability)`
- `MIGRATION_FILE = supabase/migrations-pending/20260822010000_lesson_capability_lifecycle_20c.sql`

## 2. STATUS CONTRACT

```
DRAFT   → أدمن/طاقم المحتوى فقط
REVIEW  → أدمن/مراجع فقط
READY   → القابل للعرض على الطالب
```

Metadata فعلي فقط: `reviewed_by/at`, `ready_by/at`, `draft_hash`, `draft_updated_at`,
`ready_snapshot`, `ready_hash`, `created_at`, `updated_at`.

`studentVisible` ليس حقلاً يدوياً — يُشتق في العقد من `present && status === READY`
(`applyLifecycleOverlay` في `src/lib/lessons/lesson-content-contract.ts`).

```
DRAFT = admin only
REVIEW = admin/reviewer only
READY = student-renderable
STUDENT_VISIBILITY_FAIL_CLOSED = YES
```

## 3. EXISTING PRODUCTION CONTENT — INVENTORY (read-only)

| Capability | دروس بها محتوى اليوم | ظاهر للطالب اليوم | الحالة الابتدائية بعد Backfill |
|---|---|---|---|
| officialBookContent | 21 | نعم | READY |
| tamkeenExplanation | 40 | نعم | READY |
| mindMap | 0 | — | READY إن كان published، وإلا DRAFT |
| simulation | 0 | — | READY |
| supportingResources | 0 | — | READY |
| quickReview | 0 | — | READY |
| checkUnderstanding | 1 | نعم | READY |
| lessonAssessment | 1 | نعم | READY |
| originalBookPdf | 40 | نعم | READY |
| studentPerformance | مشتقة | نعم | لا صف lifecycle |

```
BACKFILL_RULES =
  present AND student-visible today  → READY (grandfathered)
  mind map HTML بحالة draft/in_review (مخفية اليوم أصلاً) → DRAFT
  أي شيء غير موجود → لا صف إطلاقاً (ABSENT)
  studentPerformance → مستثناة من الـlifecycle
ROWS_AFFECTED (تقدير إنتاج حالي) = 103 صف lifecycle جديد
EXISTING_STUDENT_VISIBILITY_PRESERVED = YES
```

ضمانة إضافية ضد الاختفاء المفاجئ: العقد يعامل **غياب صف lifecycle** كمحتوى قديم
ويطبّق قواعد 20B كما هي — فلا يمكن لأي محتوى ظاهر اليوم أن يختفي بسبب الترحيل،
ولا يُعتبر أي محتوى READY تلقائياً إلا بقاعدة صريحة أعلاه.

## 4. CAPABILITY LIFECYCLES

```
OFFICIAL_CONTENT_LIFECYCLE = lesson_book_contents + lifecycle(officialBookContent)  → Edit→DRAFT→Preview→REVIEW→READY
EXPLANATION_LIFECYCLE      = lesson_explanations + lifecycle(tamkeenExplanation)
MIND_MAP_HTML_LIFECYCLE    = lesson_resources(HTML) + lifecycle(mindMap)  [MIND_MAP_FORMAT=HTML، لا نموذج Nodes]
QUICK_REVIEW_LIFECYCLE     = lesson_summaries + lifecycle(quickReview)
QUESTIONS_LIFECYCLE        = questions(lesson_id) + lifecycle(checkUnderstanding)
ASSESSMENT_LIFECYCLE       = lesson_assessments/exam_templates + lifecycle(lessonAssessment)
PDF_LIFECYCLE              = lesson_resources(is_primary)/book pdf_url + lifecycle(originalBookPdf)
PERFORMANCE                = مشتقة، بلا lifecycle تحريري
```

فجوة 20A1C مغلقة: لم يعد تعديل `lesson_book_contents.content` يظهر للطالب مباشرة —
يظهر فقط بعد `REVIEW → READY`. المحتوى المعتمد الحالي للدرس `lesson-g10-001-001`
يُرحَّل إلى READY ولا ينكسر.

```
READY_VERSION_PRESERVED_DURING_EDIT = YES
```
اعتماد أي قدرة يجمّد نسخة `ready_snapshot`. الانتقال `READY → DRAFT` يبدأ نسخة تعديل جديدة
**دون** المساس بـ`ready_snapshot`، فتبقى النسخة المعتمدة هي ما يراه الطالب. `NO AUTO-PUBLISH`.

## 5. ADMIN WORKSPACE / PREVIEW

```
ADMIN_WORKSPACE  = /admin/lesson-content/$lessonId (مركز واحد لكل القدرات — من 20B)
PREVIEW_AS_STUDENT = نفس Student Lesson Renderer + 18B، مع شارة «معاينة — غير منشور للطلاب»
```
الأفعال حسب الحالة (تُوصَّل بالـRPC بعد الـApply): DRAFT ⟶ [تحرير] [معاينة] [إرسال للمراجعة] ·
REVIEW ⟶ [معاينة] [اعتماد] [إرجاع للمسودة] · READY ⟶ [معاينة] [إنشاء نسخة تعديل جديدة].
واجهة يوسف لا تعرض أسماء جداول أو RPC أو أرقام قوالب أو revision ids.

## 6. CAPABILITY ORDER & READINESS

الترتيب العشري محفوظ حرفياً كما في 20B. القدرة غير READY تُحذف من واجهة الطالب تماماً (HIDDEN، لا «غير متوفر»).

```
BOOK_READY     = officialBookContent.present && status=READY
LEARNING_READY = BOOK_READY && tamkeenExplanation READY && quickReview READY
FULLY_READY    = LEARNING_READY && checkUnderstanding READY
```
`present` وحده لا يكفي — مثال: `mindMap.present=true, status=DRAFT` ⇒ لا LEARNING_READY ولا ظهور للطالب.

## 7. AUDIT & SECURITY

```
AUDIT_TRAIL = REUSE public.audit_logs
  action='lesson_capability_lifecycle_transition'
  metadata = { lesson_id, capability, from_status, to_status } + actor_id + created_at
STUDENT_CAN_READ_DRAFT  = NO   (سياسة SELECT: status='READY' فقط لغير الطاقم)
STUDENT_CAN_READ_REVIEW = NO
CONTENT_STAFF_CAN_EDIT  = is_content_staff (بدون توسيع صلاحيات)
REVIEWER_CAN_APPROVE    = is_full_admin فقط (اعتماد/إرجاع)
RLS_FAIL_CLOSED         = YES (لا سياسة INSERT/UPDATE/DELETE إطلاقاً — الكتابة عبر SECURITY DEFINER فقط)
```

## 8. VALIDATION

```
PG17 = PASS  (tests/question-bank/runtime/run-pg17-lesson-capability-lifecycle-20c.sh)
  APPLY=OK · SCHEMA_AND_BACKFILL=OK · READY_SNAPSHOT_PRESERVED=OK · ROLLBACK=OK
RLS_TESTS = PASS (RLS مفعّل، صفر سياسات كتابة، الطالب يرى READY فقط)
REGRESSION_TESTS = PASS (tests/student/lesson-capability-lifecycle-20c.test.ts — 8/8)
  A DRAFT hidden · B REVIEW hidden · C READY visible · D ready version preserved
  E reject→draft hidden · F admin preview sees present · H order preserved
  I/J legacy content (Quran + PDF) unchanged
CURRENT_QURAN_LESSON_PRESERVED = YES
PRODUCTION_DB_WRITE = NO
MIGRATION_APPLIED = NO
```

اختبارات L (تعقيم HTML للخريطة الذهنية) و M (عدم تسريب الإجابات) و N (عدم تجاوز الصف/المنهج)
مغطاة بالأنظمة القائمة (`tests/security/*`, بوابة HTML في 20B) ولم تتغير في 20C-A.

## 9. PILOT PLAN (بعد الـApply — بدون أي كتابة الآن)

الدرس: `lesson-g10-001-001` — القدرات المتوفرة فعلياً فقط:
📖 محتوى الكتاب الرسمي · 👨‍🏫 شرح تمكين · 📚 PDF (READY مُرحَّل)
ثم تجربة دورة كاملة: تعديل ⟶ DRAFT ⟶ معاينة ⟶ REVIEW ⟶ اعتماد ⟶ ظهور للطالب،
والتحقق من أن النسخة READY السابقة ظلت ظاهرة طوال فترة التعديل.
🗺️ الخريطة الذهنية HTML / 🧠 مراجعة سريعة / ✅ أسئلة / 🏆 تقييم تُختبر فقط عند توفرها فعلياً.

---

```
READY_FOR_PRODUCTION_LIFECYCLE_MIGRATION_APPLY = YES
```

**الحكم: TAMKEEN_YOUSUF_LESSON_CONTENT_WORKFLOW_20C = PASS_READY_FOR_PRODUCTION_LIFECYCLE_GATE**

بانتظار: `APPROVED_PRODUCTION_LIFECYCLE_MIGRATION_APPLY`
