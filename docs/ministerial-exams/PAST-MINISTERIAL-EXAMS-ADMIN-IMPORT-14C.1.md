# PAST_MINISTERIAL_EXAMS_ADMIN_IMPORT_14C.1

المرحلة: **Design / Contract Closure فقط** — لا Migration مطبّقة، لا UI منفّذة، لا بيانات (إنتاجية أو وهمية).
التاريخ: 2026-08-14
المراجع الإلزامية: `PAST-MINISTERIAL-EXAMS-ARCHITECTURE-14A.md` (TCS-2 aligned)، `PAST-MINISTERIAL-EXAMS-FOUNDATION-14B-SHARED-APPLY-REPORT.md`، `src/lib/content-codes/tcs2.ts`، محرك الاستيراد الحالي (`src/lib/content-import/*`)، بنك الأسئلة QB-01/02.

---

## 0) AUDIT — ما هو مطبّق فعلاً على القاعدة المشتركة

| الكيان | الحالة | الملاحظات الحاكمة |
|---|---|---|
| `ministerial_exam_models` | موجود | `template_id UNIQUE` → `exam_templates`، `model_code UNIQUE`، Natural UK = `(subject_id, curriculum_track_id, academic_year, round_code, variant_code)`، `status ∈ draft/published` + شرط `published_at/by` |
| `ministerial_exam_questions` | موجود | `(model_id, question_id) UNIQUE`، `published_revision_id NOT NULL` → `question_revisions`، `sort_order`, `marks > 0`, `source_question_code` |
| `exam_templates(mode='ministry')` | موجود | محرك الاختبار مُعاد استخدامه؛ لا محرك ثانٍ |
| `exam_template_questions` | موجود | مصدر ترتيب/درجات الجلسة |
| `exam_sessions.ministerial_model_id` | موجود (nullable) + index | يربط الجلسة بالنموذج |
| `assert_ministerial_model_track_valid` | trigger | MODEL_VALIDITY_GATE: المادة مرتبطة بالمسار في `subject_curriculum_tracks` و`is_active` |
| `assert_ministerial_model_template_match` | trigger | القالب `mode='ministry'` ونفس `subject_id` |
| `assert_ministerial_question_publishable` | function | النسخة `PUBLISHED` وتخص السؤال، والسؤال يخص مادة النموذج |
| `assert_ministerial_membership_valid` | trigger | يفرض ما سبق على كل صف عضوية |
| `can_publish_ministerial_model` | function | draft + عضوية غير فارغة + تطابق تام بين `exam_template_questions` و`ministerial_exam_questions` |
| `publish_ministerial_model` | RPC | `is_content_staff` + بوابة النشر + idempotent (draft → published فقط) |
| `create_ministerial_exam_session` | RPC | مسار البدء الوحيد للنماذج |
| `assert_exam_template_not_ministry_bypassed` | function + مرقّع في `start_exam_session` | يمنع بدء قالب وزاري من المسار العام |
| `question_revisions` / `question_targets` | QB-01/02 مغلق | النشر والتثبيت والـ payload hash |
| admin/import | قوالب 01–09 + Staging/Execute + Dry-run | محرك عام قابل لإعادة الاستخدام |
| RBAC | `is_content_staff`, `is_full_admin`, `qb_has_capability`, `question_bank_capability_grants` | أساس مصفوفة الصلاحيات |

**فجوة مكتشفة (مهمة):** لا يوجد اليوم أي مسار كتابة إداري للنماذج سوى DML مباشر عبر RLS (`is_content_staff` FOR ALL). هذا لا يكفي لعقد 14C ويجب استبداله بـ RPCs في 14C.2 (انظر `NEW_MIGRATION_REQUIRED`).

---

## 1) ADMIN_UX_DECISION

**القرار: قسم إداري مستقل** — `/admin/ministerial-exams` (وليس داخل `/admin/import`).
السبب: دورة حياة مختلفة (Draft → Membership → Publish)، وصلاحيات مختلفة، وقوالب مستقلة عن سلسلة 01–09.

الصفحة:
```
/admin/ministerial-exams                القائمة + الفلاتر
/admin/ministerial-exams/$modelId       تفاصيل نموذج + إدارة الأسئلة + Preview + Publish
/admin/ministerial-exams/import         مولّد سياقي + Validate/Prepare/Execute لـ M01/M02
```

القائمة تعرض: الكود، المادة، الصف، المسار، السنة، الدور، الـ variant، الحالة، عدد الأسئلة، آخر تحديث.
الفلاتر: الصف، المادة، المسار، السنة، الدور، الحالة.

Actions: `Create Draft`، `Import M01`، `Manage Questions`، `Import M02`، `Preview`، `Publish`، `Unpublish/Archive` (وفق السياسة أدناه).
**لا حذف مباشر من العميل** — أي حذف يمر عبر RPC إدارية بـ guards + audit.

روابط تنقّل فقط من `/admin/import` نحو القسم الوزاري (بدون خلط القوالب).

---

## 2) حزمة القوالب — منفصلة عن 01–09

```
M01_ministerial_models
M02_ministerial_model_questions
```
لا تُستخدم الأرقام 10/11 إطلاقاً (تفادياً للالتباس مع Legacy). المفاتيح داخلياً: `m01_ministerial_models`, `m02_ministerial_model_questions`، ملفات: `ministerial-M01-models.xlsx`, `ministerial-M02-model-questions.xlsx`، وتُقدَّم في حزمة مشغّل منفصلة (Ministerial Operator Pack) لا داخل حزمة المحتوى.

ترتيب التنفيذ الإلزامي: `M01 → M02`.

---

## 3) M01_CONTRACT — النماذج

| العمود | إلزامي | القيم |
|---|---|---|
| `subject_code` | نعم | TCS-2 `sub-*` موجود فعلياً |
| `track_code` | نعم | `sanaa` \| `aden` \| `other` |
| `academic_year` | نعم | 2000..2100 |
| `exam_round_code` | نعم | `r1` \| `r2` \| `r3` \| `makeup` |
| `model_variant_code` | نعم | `[a-z0-9-]{1,20}` (مثل `main`, `a`, `b`, `supplementary-01`) |
| `model_label` | لا | نص عرض عربي، قابل للتعديل دائماً |
| `duration_minutes` | لا | يُمرَّر لقالب الاختبار (افتراضي من سياسة النظام) |

**لا يُدخل المشغّل الكود.** `ministerial_model_code` يُولَّد آلياً.

Validation (كلها Fail-Closed):
1. `subject_code` موجود ويطابق TCS-2 — **TCS-1 مرفوض** (`TCS1_CODE_REJECTED`).
2. `track_code` موجود و`curriculum_tracks.is_active = true`.
3. ارتباط `(subject, track)` موجود ونشط في `subject_curriculum_tracks` (نفس MODEL_VALIDITY_GATE).
4. `exam_round_code` ضمن enum `ministerial_exam_round_code`.
5. `model_variant_code` يطابق النمط ولا يحوي مسافات/عربية.
6. Natural key `(subject, track, year, round, variant)` غير مكرر داخل الملف ولا في القاعدة (إلا كـ safe update لمسودة).
7. الصف يُستنتج من المادة — لا يُدخل ولا يُخزَّن مكرراً.

**M01 ينشئ Draft فقط**: صف `exam_templates(mode='ministry', is_active=true)` + صف `ministerial_exam_models(status='draft')`. **لا auto-publish إطلاقاً.**

Update semantics: مسودة قائمة → تحديث آمن لـ `model_label`/`duration` فقط. تغيير `subject/track/year/round/variant` = هوية جديدة، ويُرفض ضمنياً على أي هوية منشورة (`MODEL_IDENTITY_IMMUTABLE`).

---

## 4) M02_CONTRACT — عضوية الأسئلة

الغرض الوحيد: **ربط أسئلة منشورة سلفاً** بالنموذج. لا إنشاء محتوى.

| العمود | إلزامي | ملاحظات |
|---|---|---|
| `ministerial_model_code` | نعم | يجب أن يكون موجوداً و`draft` |
| `question_code` | نعم | TCS-2 `q-*` منشور |
| `original_question_number` | نعم | رقم السؤال في الورقة الأصلية |
| `section_code` | لا | قسم الورقة (أول/ثاني…) |
| `marks` | نعم | > 0 |
| `source_page` | لا | رقم الصفحة |
| `source_reference` | لا | مرجع نصي |
| `display_order` | نعم | فريد داخل النموذج |

**أعمدة محظورة صراحة** (وجود أي منها = رفض الملف كله `M02_FORBIDDEN_COLUMN`):
`question_text`, `stimulus_text`, `options`, `option_*`, `correct_answer`, `answer`, `explanation`, `solution`, `solution_steps`, `accepted_answers`, `media*`.

سبب الرفض: تمكين لا تخزّن الإجابات خارج بنك الأسئلة إطلاقاً (رفضاً لنمط Mufadhala `past_exam_questions with correct_answer`).

---

## 5) REVISION_RESOLUTION

```
question_code
  → questions (بالكود)
  → questions.current_published_revision_id
  → revision.status = PUBLISHED
  → questions.subject_id == model.subject_id
  → question_targets(revision_id) يشمل مادة النموذج
```
أي خطوة تفشل ⇒ الصف `blocked` مع سبب صريح:
`QUESTION_NOT_FOUND` / `QUESTION_NOT_PUBLISHED` / `QUESTION_SUBJECT_MISMATCH` / `TARGET_SUBJECT_MISMATCH` / `TCS1_CODE_REJECTED`.

`question_targets` لا تحمل `curriculum_track_id` — العزل يقع على مستوى النموذج فقط (14A §3).

---

## 6) REVISION_PINNING (EXACT_REVISION_PINNING من 14B)

- Prepare يثبّت `resolved_revision_id` + `payload_hash` لكل صف داخل صفوف الـ staging، مع بصمة إجمالية `prepare_fingerprint`.
- Execute يعيد التحقق: إن اختلفت `current_published_revision_id` أو `payload_hash` لأي سؤال ⇒ **FAIL CLOSED** للمعاملة كاملة برمز `REVISION_DRIFT_DETECTED` وطلب Prepare جديد.
- ممنوع الترقية الصامتة إلى نسخة أحدث.
- صلاحية Prepare محدودة زمنياً (افتراضي 60 دقيقة) ثم `PREPARE_EXPIRED`.
- العضوية تُكتب دائماً بـ `published_revision_id` المثبّت (لا بـ `current_published_revision_id` وقت الكتابة).

---

## 7) IDEMPOTENCY

- المفتاح المنطقي لـ M01 = Natural key؛ لـ M02 = `(model_id, question_id)`.
- إعادة تشغيل نفس الملف حرفياً: `0 duplicate models`, `0 duplicate memberships`، والصفوف تُحتسب `skipped_identical`.
- إعادة التشغيل مع `marks/display_order` مختلفة على مسودة = `updated_metadata` (لا صف جديد).
- كل Execute يسجّل `import_jobs` + `import_errors` مع `idempotency_key` (بصمة محتوى الملف + الهدف)، على نمط `question_bank_rpc_idempotency` الحالي.
- المعاملة الواحدة لكل ملف: تنجح كاملة أو تتراجع كاملة.

---

## 8) PREVIEW (قبل Execute)

```
MODEL
  subject (كود + اسم) | grade | track | year | round | variant
  generated model_code | status | template mode/active

QUESTIONS
  rows_total
  resolved_questions
  resolved_revision_ids (مع hash مختصر)
  memberships_to_insert
  metadata_to_update
  skipped_identical
  blocked (بالسبب)
  errors (بالسطر)
PARITY
  template_questions vs membership (delta)
PUBLISH_READINESS: can_publish = true/false + السبب
```
Preview قراءة فقط ولا يكتب أي صف في الجداول النهائية.

---

## 9) PUBLISH_FLOW

الواجهة **لا تعيد بناء أي قاعدة حماية**؛ تستدعي حصراً:
```
can_publish_ministerial_model(model_id)   → للعرض/التعطيل
publish_ministerial_model(model_id)       → للتنفيذ
```
البوابات المُتحقق منها داخل القاعدة: ارتباط مادة/مسار نشط، القالب `ministry` ونشط ومطابق للمادة، عضوية غير فارغة، تطابق تام template/membership، نسخ منشورة، تطابق مادة الهدف، والتثبيت الدقيق للنسخ.

**فجوة يجب سدّها في 14C.2:** `can_publish_ministerial_model` الحالي لا يقارن `exam_template_questions` بـ `published_revision_id` المثبّت (يقارن `question_id` فقط) ولا يتحقق من `is_active` للقالب. يُضاف شرطا Parity على مستوى النسخة + نشاط القالب.

Unpublish/Archive: لا يوجد اليوم. السياسة المعتمدة: `unpublish` مسموح فقط لصلاحية `ministerial_publish` وفقط إذا لا توجد `exam_sessions` مرتبطة؛ خلاف ذلك `archive` (إخفاء من الطالب مع بقاء السجل). ينفّذ عبر RPC مع audit.

---

## 10) REMOVE_MEMBERSHIP_POLICY

- M02 **إضافي (additive) افتراضاً**: غياب سؤال من ملف جديد **لا** يحذفه.
- الإزالة عملية إدارية صريحة: `ministerial_membership_remove_preview` ثم `ministerial_membership_remove_execute`، على المسودات فقط، مع سبب إلزامي وكتابة `audit_logs`.
- إزالة من نموذج منشور ممنوعة (يُنشأ variant جديد بدلاً منها).
- لا حذف من العميل مباشرة.

---

## 11) PERMISSION_MATRIX

| العملية | content_manager | ministerial_publish (capability) | full admin |
|---|---|---|---|
| عرض النماذج والمسودات | ✅ | ✅ | ✅ |
| إنشاء/تعديل Draft | ✅ | ✅ | ✅ |
| M01/M02 Validate / Prepare / Execute | ✅ | ✅ | ✅ |
| Preview | ✅ | ✅ | ✅ |
| Publish | ❌ | ✅ | ✅ |
| Unpublish / Archive | ❌ | ✅ | ✅ |
| Remove membership (مسودة) | ❌ | ✅ | ✅ |
| Delete model / destructive | ❌ | ❌ | ✅ (guards + audit) |

- `ministerial_publish` قدرة **منفصلة** تُمنح فردياً عبر `question_bank_capability_grants` (نفس نمط QB) ولا تُشتق من `is_content_staff`.
- **لا توسعة عالمية لصلاحيات `content_manager`.**
- ملاحظة تنفيذية: `publish_ministerial_model` الحالي يسمح لأي `is_content_staff` بالنشر ⇒ يجب تضييقه في 14C.2 إلى القدرة المنفصلة.

---

## 12) STUDENT_ISOLATION (يُتحقق منه في Preview/E2E)

```
student.curriculum_track_id == model.curriculum_track_id   ⇒ ALLOW
otherwise                                                  ⇒ DENY (server-side)
```
حتى لو كانت المادة مشتركة: طالب صنعاء لا يرى نموذج عدن. لا واجهة طالب في 14C، لكن كل بروفة E2E إدارية تتضمن حالتي ALLOW/DENY.

---

## 13) IMPORT_ENGINE_REUSE

يُعاد استخدام: `import_jobs`, `import_staging_rows`, `import_errors`, نمط Validate→Prepare→Execute، الـ dry-run panel، ومولّد القوالب السياقي (`ContextualTemplateGenerator`).
**لا يُعاد استخدام:** كتالوج قوالب المحتوى 01–09 ولا `import_execute_template` (دوال M01/M02 مستقلة).
المولّد السياقي الوزاري: المشغّل يختار Grade → Subject → Track → Year → Round → Variant، ثم يولّد النظام M01 مع الأكواد جاهزة، وM02 مع `ministerial_model_code` مملوءاً مسبقاً.

**CODE_GENERATION:** الصيغة المعتمدة هي المطبّقة فعلاً في `tcs2.ts`:
```
mex-{gradeShort}-{trackCode}-{subjectNo:003}-{year:4}-{roundCode}-{variantCode}
مثال: mex-g12-sanaa-001-2025-r1-main
```
(ملاحظة: المثال الوارد في طلب 14C.1 `mex-g12-001-sanaa-...` يخالف الترتيب المطبّق والمُختبَر؛ اعتُمد ترتيب `tcs2.ts` مصدراً وحيداً للحقيقة لتفادي كسر التحقق القائم.)

---

## 14) NEW_MIGRATION_REQUIRED = **YES** (تُكتب وتُطبّق في 14C.2، ليس الآن)

مطلوب:
1. RPCs: `ministerial_m01_validate/prepare/execute`, `ministerial_m02_validate/prepare/execute` (SECURITY DEFINER, transactional).
2. حقول Prepare/Pinning: `prepare_fingerprint`, `resolved_revision_id`, `prepared_at` على صفوف الـ staging الوزارية.
3. أعمدة M02 الوصفية على `ministerial_exam_questions`: `original_question_number`, `section_code`, `source_page`, `source_reference`.
4. `model_label` على `ministerial_exam_models`.
5. قدرة `ministerial_publish` + تضييق `publish_ministerial_model`.
6. تشديد `can_publish_ministerial_model` (parity على مستوى `published_revision_id` + `template.is_active`).
7. `unpublish/archive` RPC + `status='archived'`.
8. `ministerial_membership_remove_*` + audit.
9. تضييق RLS: منع DML المباشر من العميل على الجدولين (كتابة عبر RPC فقط).

---

## 15) BLOCKERS

| # | الوصف | الأثر | الحل |
|---|---|---|---|
| B-1 | `publish_ministerial_model` يسمح لأي content staff | توسعة صلاحية غير مقصودة | قدرة `ministerial_publish` منفصلة (14C.2) |
| B-2 | Parity الحالي على `question_id` فقط | نسخة قديمة/جديدة قد تمر | مقارنة `published_revision_id` (14C.2) |
| B-3 | RLS يسمح بـ DML مباشر للطاقم على الجدولين | تجاوز البوابات من العميل | حصر الكتابة في RPCs (14C.2) |
| B-4 | لا `model_label` ولا حقول M02 الوصفية | العقد غير قابل للتنفيذ حرفياً | إضافة الأعمدة (14C.2) |
| B-5 | لا Unpublish/Archive | لا تراجع تشغيلي | RPC + `archived` (14C.2) |
| B-6 | تعارض ترتيب مثال كود `mex` في الطلب | لبس تشغيلي | اعتُمد ترتيب `tcs2.ts` ووُثّق أعلاه |

كل الـ Blockers **تصميمية ومحلولة داخل نطاق 14C.2**، ولا يمنع أيٌّ منها اعتماد العقد.

---

## الحكم

```
PAST_MINISTERIAL_EXAMS_ADMIN_IMPORT_14C.1 = PASS_READY_FOR_IMPLEMENTATION
NEW_MIGRATION_REQUIRED                    = YES (14C.2)
SHARED DB CHANGES IN THIS STEP            = NONE
DATA WRITTEN                              = NONE
```
