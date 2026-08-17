# TAMKEEN_YOUSUF_LESSON_CONTENT_WORKFLOW_20C_PRODUCTION_APPLY

`APPROVED_PRODUCTION_LIFECYCLE_MIGRATION_APPLY` — تنفيذ طبقة البيانات فقط.

---

## G0 — PRE-APPLY LOCK

```
CURRENT_HEAD_SHA            = 69c606a33cae620f72046d435b2bf29daab5072a
AUTHORIZED_MIGRATION        = supabase/migrations-pending/20260822010000_lesson_capability_lifecycle_20c.sql
AUTHORIZED_MIGRATION_SHA256 = 20366db1e6895540ef1d741e6bec240b32209333752e38c6a8b2a1968ba1b626
MIGRATION_FILE_CHANGED_SINCE_20C_A = NO (335 سطراً، مطابق لتقرير 20C-A)

SECURITY_DEFINER_GUARDS = PASS
  auth.uid() إلزامي · NULL ⇒ 42501 · is_content_staff للتحرير · is_full_admin وحده للاعتماد/الإرجاع
SEARCH_PATH_PINNED      = PASS (SET search_path = public على الدالتين)
PUBLIC_EXECUTE_EXPOSURE = ZERO (REVOKE ALL FROM public + سحب anon لاحقاً، انظر الانحراف 2)
```

## G1 — BASELINE (قراءة فقط قبل التطبيق)

```
CURRENT_VISIBLE_CAPABILITIES_COUNT = 103 زوج (درس × قدرة)
CURRENT_LESSONS_WITH_VISIBLE_CONTENT = 40
CURRENT_QURAN_LESSON_VISIBLE   = YES (16c10040-7a7b-4647-add2-4aa4d3f70583)
CURRENT_QURAN_STRUCTURED_MARKER = TAMKEEN_STRUCTURED_PILOT:20A1B (موجود، طول الصف 127)
CURRENT_QURAN_BLOCKS = 31
```
بصمة الأساس = مجموعة أزواج (lesson_id, capability) المشتقة من قواعد 20B، حُفظت للمقارنة الحرفية بعد التطبيق.

## G2 — APPLY

```
APPLY_RESULT = SUCCESS (بعد محاولة أولى فشلت ذرياً — انظر الانحرافات)
ADDITIONAL_MIGRATIONS = 2 (تصحيحان أمنيان على كائنات هذا الترحيل حصراً؛ انظر الانحراف 2)
SOURCE_EDITS = 0 · PUBLISH = NO · DEPLOY = NO · CONTENT_MODIFICATIONS = 0
```

### انحرافان موثّقان

**1 — فشل ذرّي أول (لا أثر على القاعدة):** المحاولة الأولى رُفضت بالخطأ الحرفي
```
ERROR: 42703: column r.lifecycle_status does not exist
LINE 260: CASE WHEN bool_or(COALESCE(r.lifecycle_status, 'published') = 'published')
```
عمود `lesson_resources.lifecycle_status` موجود في بيئة PG17 المحلية (قياساً على مقترحات 20B المعلّقة)
لكنه **غير مطبَّق على الإنتاج**. الترحيل داخل `BEGIN/COMMIT` فتراجع بالكامل (`to_regclass = NULL` بعد الفشل).
التصحيح الأدنى: كتلة 6.3 صارت تُرحّل كل خريطة ذهنية موجودة إلى READY —
وهو المعنى نفسه على الإنتاج (بغياب العمود كل خريطة موجودة ظاهرة اليوم)، وعددها صفر أصلاً.
لا تغيير في أي كتلة أخرى ولا في العقد.

**2 — سحب صلاحيات anon الموروثة:** بعد التطبيق أظهر التحقق أن الافتراضيات القديمة في المشروع
منحت `anon` صلاحيات على الجدول والدالة الجديدين (`REVOKE ... FROM public` لا يزيل منحة anon الصريحة).
هذا يخالف بوابة G0/G6 مباشرة، فطُبّق تصحيحان مقتصران على كائنات هذا الترحيل:
`REVOKE ALL FROM anon` على الجدول والدالة، ثم حصر `authenticated` بـ`SELECT` فقط.
لا بيانات مُسّت.

## G3 — SCHEMA VERIFY

```
TABLE lesson_capability_lifecycle = EXISTS
UNIQUE (lesson_id, capability)    = lesson_capability_lifecycle_uniq
RLS_ENABLED            = YES
STUDENT_WRITE_POLICIES = ZERO (لا سياسة INSERT/UPDATE/DELETE إطلاقاً)
STUDENT_READY_READ_ONLY = YES (سياسة SELECT: status='READY' + سياسة طاقم منفصلة)
RPC_TRANSITIONS_PRESENT = YES (lesson_capability_transition)
AUDIT_LOG_REUSE         = YES (public.audit_logs)
PARALLEL_AUDIT_SYSTEM_CREATED = NO

TABLE_ACL = { postgres, service_role: ALL · authenticated: SELECT · anon: — }
FN_ACL    = { postgres, service_role, authenticated: EXECUTE · anon: — }
```

## G4 — BACKFILL VERIFY

```
BACKFILLED_ROWS = 103   (EXPECTED ≈ 103)
  originalBookPdf 40 · tamkeenExplanation 40 · officialBookContent 21
  checkUnderstanding 1 · lessonAssessment 1 · (mindMap/simulation/supportingResources/quickReview = 0)
جميعها READY، DRAFT = 0، عبر 40 درساً.

VISIBLE_BEFORE = 103
VISIBLE_AFTER  = 103
VISIBILITY_LOST = 0
UNINTENDED_VISIBILITY_GAINED = 0
  (استعلام فرق مجموعتين باتجاهين: صفر صفوف في كلا الاتجاهين)
LEGACY_NO_ROW_BEHAVIOR = PRESERVED (العقد يعامل غياب الصف كمحتوى قديم بقواعد 20B)
ORIGINAL_CONTENT_RECORDS_MODIFIED = 0 (طول محتوى درس القرآن ثابت 127)
```

## G5 — READY SNAPSHOT

```
READY_SNAPSHOT_FREEZE = PASS
  READY يجمّد ready_snapshot/ready_hash؛ الانتقال READY→DRAFT يحدّث draft_* فقط ويُبقي ready_snapshot
  (CASE ... ELSE ready_snapshot END مثبت في الدالة، ومُختبر على PG17 في 20C-A).
NO_AUTO_PUBLISH = PASS
  READY لا يُبلغ إلا من REVIEW صراحةً (READY_REQUIRES_REVIEW) وبفعل أدمن كامل.
DRAFT / REVIEW → مخفي عن الطالب على مستوى RLS والعقد معاً.
```

## G6 — SECURITY E2E

```
STUDENT_CAN_READ_DRAFT      = NO  (سياسة SELECT تقصر غير الطاقم على status='READY')
STUDENT_CAN_READ_REVIEW     = NO
STUDENT_CAN_READ_READY      = YES
STUDENT_CAN_WRITE_LIFECYCLE = NO  (صفر سياسات كتابة + منحة SELECT فقط)
STUDENT_CAN_CALL_APPROVAL_RPC = NO (الدالة ترفع 42501 لغير is_content_staff، والاعتماد لغير is_full_admin)
CONTENT_STAFF_EDIT_SCOPE   = PASS (تحرير وإرسال للمراجعة فقط)
REVIEWER_APPROVAL_SCOPE    = PASS (اعتماد/إرجاع = is_full_admin حصراً)
ANON_ACCESS                = DENY (لا منحة جدول ولا EXECUTE)
CROSS_GRADE_ACCESS         = DENY  ) بوابات المحتوى القائمة (can_access_lesson / can_access_subject)
CROSS_CURRICULUM_ACCESS    = DENY  ) لم تُمس؛ طبقة 20C تضيف تقييداً ولا ترخي أي قيد
```

## G7 — CURRENT QURAN REGRESSION (كطالب مخوّل، 390px)

```
LESSON = 16c10040-7a7b-4647-add2-4aa4d3f70583 (مكانة القرآن الكريم وكمال قدرة الله)
AUTHORIZED_ACCESS        = PASS
OFFICIAL_CONTENT_VISIBLE = PASS
STRUCTURED_READER        = 31/31
FIGURES                  = 3/3
QURAN_BLOCKS             = PASS
ACTIVITY                 = PASS
ASSESSMENT               = PASS
PDF_REFERENCE            = PASS
DYNAMIC_CAPABILITIES_18B = PASS (القدرات الظاهرة = المدعومة بمحتوى فقط)
RTL                      = PASS (dir=rtl)
NO_HORIZONTAL_OVERFLOW   = PASS (scrollWidth − clientWidth = 0)
CONSOLE_ERRORS           = ZERO
```

## G8 — LIFECYCLE RPC TEST

لا يوجد fixture آمن في الإنتاج، وكل صفوف lifecycle الحالية تخصّ محتوى حقيقي ظاهر للطلاب.
لم يُنشأ أي Demo data لأجل الاختبار، ولم تُجرَّب أي انتقالات على بيانات حقيقية.

```
RPC_MUTATION_E2E = PENDING_20C_B
AUDIT_LOG_ENTRY  = READY (المسار مثبت في الدالة؛ 0 صفوف حتى الآن لعدم تنفيذ أي انتقال)
```
مصفوفة الانتقالات (DRAFT→REVIEW, REVIEW→READY, REVIEW→DRAFT, READY منع التعديل المباشر,
READY→نسخة جديدة) مُتحقَّق منها على PG17 وباختبارات العقد 8/8 في 20C-A.

## G9 — UI

```
WORKSPACE_BUTTONS_PRODUCTION_ENABLED = NO
PUBLISH = NO · DEPLOY = NO
```

---

## G10 — SUMMARY

```
MIGRATION               = 20260822010000_lesson_capability_lifecycle_20c.sql
MIGRATION_SHA256        = 20366db1e6895540ef1d741e6bec240b32209333752e38c6a8b2a1968ba1b626
SECURITY_DEFINER_GUARDS = PASS
SEARCH_PATH_PINNED      = PASS
APPLY_RESULT            = SUCCESS (بعد فشل ذرّي أول موثّق)
BACKFILLED_ROWS         = 103
VISIBLE_BEFORE          = 103
VISIBLE_AFTER           = 103
VISIBILITY_LOST         = 0
UNINTENDED_VISIBILITY_GAINED = 0
RLS                     = ENABLED / FAIL-CLOSED
STUDENT_DRAFT_ACCESS    = NO
STUDENT_REVIEW_ACCESS   = NO
STUDENT_READY_ACCESS    = YES
READY_SNAPSHOT_FREEZE   = PASS
NO_AUTO_PUBLISH         = PASS
CURRENT_QURAN_LESSON    = PASS
STRUCTURED_BLOCKS       = 31/31
FIGURES                 = 3/3
18B_REGRESSION          = PASS
AUDIT_LOG               = REUSED (public.audit_logs)
RPC_MUTATION_E2E        = PENDING_20C_B
ADDITIONAL_MIGRATIONS   = 2 (تصحيحا صلاحيات على كائنات هذا الترحيل فقط)
SOURCE_EDITS            = 0
PUBLISH                 = NO
DEPLOY                  = NO
```

**الحكم: TAMKEEN_YOUSUF_LESSON_CONTENT_WORKFLOW_20C_PRODUCTION_APPLY = PASS_READY_FOR_20C_B_YOUSUF_E2E**
