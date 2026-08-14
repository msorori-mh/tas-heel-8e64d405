# PAST_MINISTERIAL_EXAMS_ARCHITECTURE_14A

المرحلة: **Design / Audit فقط** — لا Migration، لا DB writes، لا UI.
التاريخ: 2026-08-14 — **مُعاد الاعتماد بعد `SHARED_CURRICULUM_SUBJECT_MAPPING_13C` (TCS-2 ALIGNED)**.
المرجع الأساسي: بنية تمكين الحالية + أفكار (لا كود) من مستودع Mufadhala.

> **المبدأ الحاكم بعد 13C:**
> ```text
> Shared Subject ≠ Shared Ministerial Exam
> Subject identity           = TCS-2 (track-independent)
> Subject availability       = subject_curriculum_tracks
> Ministerial exam identity  = track-specific
> Question curriculum target = subject / unit / lesson (بلا مسار)
> Ministerial provenance     = model membership
> ```
> عزل صنعاء/عدن لم يعد على مستوى المادة، بل على مستوى **النموذج الوزاري**.

---

## 1) AUDIT — البنية الحالية في تمكين

### 1.1 Master data
- `grades(id, slug, name, category, sort_order, curriculum_track_id)`
- `curriculum_tracks(id, track_code, track_name, is_active)` — القيم الفعلية: `sanaa` / `aden` / `other`
- `subjects(id, grade_id, slug, name, semester, curriculum_track_id, code, group_code, group_name)`
  - بعد 12B/13: **Subject-as-Branch** — كل فرع مادة مستقل بكود صريح، و`group_code` للعرض فقط.
  - بعد 13B/13C: `subjects.code` بمخطط **TCS-2** لا يحمل المسار إطلاقاً.
- `subject_curriculum_tracks(subject_id, curriculum_track_id, is_active, ...)` — **مصدر التوفّر الوحيد**.
  - ملاحظة حاكمة (مصحّحة): المادة **قد تكون مشتركة** بين صنعاء وعدن، لذلك `subjects.curriculum_track_id` **لا يصلح** كأساس لعزل النماذج الوزارية. العزل يُبنى على `ministerial_exam_models.curriculum_track_id` مقابل ارتباطات المادة النشطة.
- `units`, `lessons` تحت `subjects`.

### 1.2 بنك الأسئلة (QB-01/02، مغلق ومعتمد)
- `questions` (الكيان المنطقي) + `current_published_revision_id`
- `question_revisions(question_id, revision_number, status, interaction_type, grading_mode, question_text, stimulus_text, max_score, payload_hash, published_at, ...)`
- `question_options`, `question_solutions`, `question_solution_steps`, `question_accepted_answers`, `question_media`
- `question_targets(question_id, revision_id, target_type, subject_id, unit_id, lesson_id, is_primary)`
  - بعد 11/11A: **Composite FK + immutability** للنسخ المنشورة، و`_qb_assert_revision_targets_publishable`.
- ضوابط: `can_publish_question_revision`, `qb_guard_question_revision_lifecycle`, `qb_has_capability`, `can_read_hidden_solutions`.

### 1.3 الاختبارات الحالية
- `exam_templates(id, title, mode, subject_id, unit_id, lesson_id, duration_seconds, is_active, code)` مع `exam_template_questions(template_id, question_id, sort_order, points)`
- `exam_sessions(user_id, template_id, mode exam_mode, status exam_session_status, started_at, expires_at, submitted_at, score, result_json, ...)`
- `exam_session_questions(...)` = **snapshot مجمّد** لكل نسخة سؤال: `question_revision_id`, `rendered_question_text`, `rendered_options`, `option_order_mapping`, `max_score`, `payload_hash`, `pin_mode`
- `exam_session_answers(...)` = الإجابات + التصحيح (`auto_score`, `manual_score`, `final_score`, `grading_status`)
- RPCs: `create_exam_session_with_snapshot`, `answer_exam_question`, `get_exam_session_state`, `submit_exam_session` — لا تُرجع الإجابة الصحيحة قبل التسليم (مؤكَّد في E2E-09).
- `exam_mode` enum يحتوي أصلاً: `training | strict | ministry` ← **`ministry` موجود ولم يُستثمر بعد**.

### 1.4 الوصول والاشتراك
`has_active_subscription`, `can_access_subject`, `can_access_lesson`, بوابة C-02 على بدء الجلسة، RLS على كل الجداول + GRANTs.

---

## 2) أفكار Mufadhala المستفاد منها (مفاهيم فقط)

| فكرة Mufadhala | القرار في تمكين |
|---|---|
| `PastExams` قائمة نماذج بالسنوات | نتبناها كـ **catalog للنماذج** فوق البنية الحالية |
| `PastExamPractice` | تُنفَّذ عبر `exam_sessions` بوضع `training` |
| `TrainingMode` / `StrictMode` | موجودان أصلاً في `exam_mode` |
| `past_exam_attempts` | **مرفوض كجدول جديد** — `exam_sessions` تغطيه |
| repeated past questions | نتبنى الفكرة، لكن عبر **view تحليلي** لا جدول مكرر |
| `PastExamStatsCard` | مخرَج قراءة من view + RPC |
| `AdminPastExams` (CRUD مباشر من العميل) | **مرفوض** — الإنشاء عبر مسار الاستيراد/RPC فقط |
| direct question storage داخل الامتحان | **مرفوض قطعياً** — الأسئلة من `question_revisions` المنشورة فقط |

---

## 3) ARCHITECTURE_DECISION

**القرار: توسعة `exam_templates` بطبقة "ميتاداتا وزارية" منفصلة، بدل بناء منظومة امتحانات ثانية موازية.**

- النموذج الوزاري = صف `exam_templates` بـ `mode = 'ministry'`، **بلا أي تغيير في سلوك القوالب العادية**.
- تُضاف بيانات الهوية الوزارية في جدول واحد جديد 1:1 اسمه `ministerial_exam_models` (بدل حشو أعمدة في `exam_templates`)، لتجنّب خلط المسؤوليات.
- الأسئلة تُربط عبر جدول ربط وزاري مخصّص يحمل حقول المصدر (`original_question_number`, `section_code`, `marks`, ...) لأن `exam_template_questions` الحالي لا يتحملها ولا نريد تعديله.
- المحاولات = `exam_sessions` + `exam_session_questions` + `exam_session_answers` كما هي (snapshot + منع تسريب الإجابة مجاناً).

سبب الرفض للبديل «منظومة مستقلة كاملة»: يضاعف مسارات التصحيح والـ RLS وسيؤدي حتماً إلى تكرار تخزين الإجابات — وهو ما تم منعه في QB-01.

---

## 4) TABLES_TO_REUSE

| الجدول | الدور في النماذج الوزارية |
|---|---|
| `exam_templates` | الحاوية الرسمية للنموذج (`mode='ministry'`, `subject_id`, `duration_seconds`, `is_active`, `code`) |
| `exam_sessions` | كل محاولة طالب (training أو strict) |
| `exam_session_questions` | snapshot مجمّد للنسخة المنشورة |
| `exam_session_answers` | الإجابات والتصحيح |
| `questions` / `question_revisions` / `question_options` / `question_solutions` | المصدر الوحيد لنص السؤال والإجابة والشرح |
| `question_targets` | ربط السؤال بالمادة/الوحدة/الدرس |
| `subjects` / `grades` / `curriculum_tracks` | مصدر العزل بين المسارات |
| `subscriptions` + `has_active_subscription` / `can_access_subject` | بوابات الوصول |

**لا** يُعاد استخدام: `exam_template_questions` للنماذج الوزارية (يبقى للقوالب العادية).

---

## 5) NEW_TABLES_REQUIRED

### 5.1 `ministerial_exam_models` (1:1 مع exam_template)
```
id                    uuid pk
exam_template_id      uuid not null unique  -> exam_templates(id)
curriculum_track_id   uuid not null         -> curriculum_tracks(id)
subject_id            uuid not null         -> subjects(id)
academic_year         int  not null         -- 2025
exam_round            text not null         -- 'main' | 'second' | 'makeup' (enum مقترح ministerial_exam_round)
model_variant_code    text not null default 'main'  -- main | a | b | supplementary-01  (ثابت، جزء من الهوية)
model_label           text                  -- "النموذج الأول" (عرض فقط، قابل للتعديل)
total_marks           numeric
official_duration_min int
source_reference      text                  -- اسم/رقم الوثيقة الرسمية
source_document_url   text                  -- storage path (خاص)
is_published          boolean not null default false
created_at / created_by / updated_at
```
قيود:
- `UNIQUE (subject_id, curriculum_track_id, academic_year, exam_round, model_variant_code)` ← **هوية النموذج**.
  - `model_variant_code` ثابت و`NOT NULL` (لا مشاكل NULL داخل UNIQUE)، بينما `model_label` نص عرض قابل للتغيير ولا يدخل في الهوية.
- **لا عمود `grade_id`**: الصف يُستنتج من `subjects.grade_id` — لا تكرار ولا خطر تعارض (`subject = G12` بينما `model.grade = G11`).
- **MODEL_VALIDITY_GATE** (trigger، بديل شرط `subject.track == model.track` القديم):
  ```text
  ministerial_exam_models.curriculum_track_id
  MUST EXIST IN subject_curriculum_tracks(subject_id, curriculum_track_id)
  AND that assignment MUST be active
  ```
  ⇒ مادة بلا ارتباطات مسار، أو ارتباط غير نشط = DENY.
- `academic_year BETWEEN 2000 AND extract(year from now())+1`.

بذلك: الفيزياء مادة واحدة مشتركة (`sub-g12-001` بمسارَي صنعاء وعدن)، ومع ذلك «وزاري صنعاء 2025» و«وزاري عدن 2025» **صفّان مستقلان تماماً**.

### 5.2 `ministerial_exam_questions` (ربط + ميتاداتا المصدر)
```
id                       uuid pk
model_id                 uuid not null -> ministerial_exam_models(id) on delete cascade
question_id              uuid not null -> questions(id)
question_revision_id     uuid not null -> question_revisions(id)   -- يجب أن تكون status='published'
original_question_number text not null -- "3-ب" كما في الورقة
section_code             text          -- 'A' | 'B' | 'ESSAY'
sort_order               int  not null
marks                    numeric not null
source_page              int
source_reference         text
created_at / created_by
```
قيود:
- `UNIQUE (model_id, sort_order)` و`UNIQUE (model_id, original_question_number)`
- **Composite FK** `(question_id, question_revision_id) -> question_revisions(question_id, id)` (نفس نمط G1-11).
- Trigger `assert_ministerial_question_publishable`: النسخة `published`، و`question_targets` الخاصة بها تشير إلى **نفس `subject_id`** للنموذج.
  - **لا يُشترط تطابق مسار على السؤال**: `question_targets` لا تحمل `curriculum_track_id` وهذا مقصود. سؤال المادة المشتركة صالح أكاديمياً للمسارين، وواقعة «ورد في وزاري صنعاء 2025» تُخزَّن هنا (ministerial membership/occurrence) لا في بنك الأسئلة. أي محاولة لجعل بنك الأسئلة Track-specific = مرفوضة.
- Append-only بعد `is_published=true` (guard على نمط `qb_guard_revision_children_immutable`).
- **ممنوع** أي عمود `correct_answer` / `explanation` هنا.

### 5.3 `ministerial_exam_attempt_link` (اختياري خفيف)
بدل `ministerial_exam_attempts`: عمود واحد `exam_sessions.ministerial_model_id uuid null` كافٍ ومفضّل (بدون جدول ثالث). إن رُفض تعديل `exam_sessions`، البديل جدول ربط نحيف:
```
exam_session_id uuid pk -> exam_sessions(id)
model_id        uuid not null -> ministerial_exam_models(id)
```
**التوصية: العمود، لا الجدول.**

### 5.4 view تحليلي (لا جدول)
`v_ministerial_repeated_questions` — انظر §10.

---

## 6) QUESTION_REVISION_BINDING

- الربط دائماً بـ `(question_id, question_revision_id)` لنسخة **منشورة**.
- عند بدء الجلسة يستدعي الطالب نفس RPC الحالي `create_exam_session_with_snapshot` (يُوسَّع ليقبل `p_ministerial_model_id`) فيُجمّد snapshot في `exam_session_questions` مع `payload_hash`.
- تحديث سؤال لاحقاً ⇒ نسخة جديدة ⇒ **لا يتغير النموذج التاريخي** إلا بقرار صريح من محرر المحتوى (نموذج غير منشور فقط).
- لا تخزين ثانٍ لأي إجابة/شرح — مصدرها الوحيد `question_solutions` / `question_options.is_correct` عبر RPC.

---

## 7) TRACK_ISOLATION

العزل بعد 13C يقوم على **بوابتين خادميتين** (لا فلترة UI):

```text
MODEL_VALIDITY_GATE
model.curriculum_track_id ∈ active subject_curriculum_tracks(model.subject_id)

STUDENT_VISIBILITY_GATE
profile.curriculum_track_id = model.curriculum_track_id
```

1. المادة قد تكون مشتركة — لا عزل على مستواها.
2. النموذج الوزاري track-specific دائماً (البوابة الأولى، trigger).
3. RLS للطالب: البوابة الثانية + `subjects.grade_id = profile.grade_id` + `can_access_subject`. **المنع خادمي بالكامل.**
4. كل التحليلات (repeated questions) مقيّدة بـ `curriculum_track_id` داخل الاستعلام نفسه.

مثال حاكم — فيزياء مشتركة (صنعاء + عدن)، طالب صنعاء:
```text
محتوى الفيزياء        ✅
وزاري صنعاء 2025      ✅
وزاري عدن 2025        ❌ DENY
```

---

## 8) TRAINING_MODE

- `exam_sessions.mode = 'training'`, `ministerial_model_id` مضبوط.
- بلا `expires_at` (أو مؤقت إرشادي غير ملزم).
- كشف فوري للصواب/الخطأ + الشرح **بعد الإجابة على السؤال** عبر RPC مخصص يُرجع الحل لسؤال أُجيب عنه فقط.
- تنقّل حر، حفظ تلقائي، إمكانية استئناف.
- لا يدخل في إحصاءات «الأداء الرسمي» للنموذج.

## 9) STRICT_MODE

- `mode = 'strict'` (أو `'ministry'` للنماذج الوزارية الرسمية — يُقترح استخدام `ministry` لتمييز محاكي الوزارة عن strict العام).
- `expires_at = started_at + official_duration_min` محسوبة **على الخادم**؛ العميل يعرض العدّاد فقط.
- تنقّل بين الأسئلة مسموح، **بلا أي كشف**: `get_exam_session_state` لا يُرجع `is_correct` ولا الحل قبل `status='submitted'`.
- Single-flight على `answer_exam_question` (موجود) + رفض أي إجابة بعد `expires_at`.
- التسليم: `submit_exam_session` يحسب النتيجة خادمياً؛ المراجعة النهائية (Review) تُتاح فقط بعد التسليم وحسب `can_read_hidden_solutions` / سياسة النموذج.
- محاولة واحدة نشطة لكل (user, model) في وضع strict.

---

## 10) REPEATED_QUESTION_MODEL

بدون تخزين مكرر — view + RPC:
```
v_ministerial_repeated_questions:
  question_id,
  curriculum_track_id,
  grade_id,
  subject_group_code,           -- لتجميع فروع المادة
  appearances_count,            -- count(distinct model_id)
  years        int[],           -- array_agg(distinct academic_year)
  first_year, last_year
GROUP BY question_id, curriculum_track_id, grade_id, subject_group_code
```
قواعد:
- **الإحصاء المعروض للطالب دائماً بحدود (subject + curriculum_track)**: «فيزياء — صنعاء: تكرر 4 مرات (2021، 2023، 2024، 2025)». ظهور نفس السؤال في عدن **لا يُحتسب** ضمن رقم صنعاء، حتى لو كانت المادة مشتركة.
- Cross-track analytics متاحة **للإدارة فقط** لاحقاً، وليست المعنى المعروض للطالب.
- `grade_id` في الـ view يُشتق من `subjects.grade_id` (لا يُخزَّن على النموذج).
- «تشابه» الأسئلة عبر السنوات يُلتقط بـ `questions.id` نفسه (المستورد يعيد استخدام نفس السؤال المنطقي) أو لاحقاً بـ `payload_hash` كإشارة ترشيح للمراجع البشري — **لا مطابقة آلية تلقائية**.
- بطاقة الإحصاء للطالب تقرأ عبر RPC `get_ministerial_repeated_stats(subject_id)` بدون كشف نص الإجابة.

---

## 11) RLS_MODEL

`ministerial_exam_models`
- `SELECT` لـ `authenticated` عندما `is_published = true` **و** المسار/الصف مطابقان للملف الشخصي **و** `can_access_subject(auth.uid(), subject_id)` (بوابة الاشتراك، مع سماح لأول مادة/نموذج مجاني إن وُجدت سياسة free-tier).
- `SELECT/INSERT/UPDATE` كامل لـ `is_content_staff()` / `is_full_admin()`.
- لا `anon` إطلاقاً. GRANTs: `SELECT` لـ authenticated، `ALL` لـ service_role.

`ministerial_exam_questions`
- **لا SELECT مباشر للطالب** (منع سحب قائمة الأسئلة خارج الجلسة). الطالب يصل للأسئلة حصراً عبر snapshot الجلسة.
- `SELECT/ALL` لطاقم المحتوى فقط.

`exam_sessions` وأبناؤها: تبقى السياسات الحالية (`user_id = auth.uid()`) دون تغيير.

Answer-leak review:
- لا أعمدة إجابات في الجداول الجديدة ⇒ لا سطح تسريب جديد عبر PostgREST.
- خطر متبقٍ وحيد: لو أُعطي الطالب `SELECT` على `ministerial_exam_questions` لكان بإمكانه ربطها بـ `question_options` — لذلك المنع أعلاه إلزامي، وتبقى سياسة `question_options` كما هي (مقيدة).
- `source_document_url` (صورة الورقة الأصلية) قد تحتوي نموذج الإجابة ⇒ bucket خاص + وصول طاقم فقط، أو ملف منفصل للإجابات لا يُنشر.

---

## 12) IMPORT_REQUIREMENTS

- لا CRUD من العميل. الإنشاء عبر مسار الاستيراد المعتمد (12A/13/13A) + RPC خادمية.
- قالبان جديدان يُضافان لكتالوج القوالب:
  1. `10-ministerial-exam-models` — أعمدة: `model_code`, `subject_code`, `track_code` (**مسار واحد فقط للنموذج**), `academic_year`, `exam_round`, `model_variant_code`, `model_label`, `total_marks`, `official_duration_min`, `source_reference`.
  2. `11-ministerial-exam-questions` — أعمدة: `model_code`, `question_code`, `original_question_number`, `section_code`, `sort_order`, `marks`, `source_page`.
- انتبه للفرق: قالب المواد يستخدم `track_codes` (قائمة توفّر)، بينما قالب النماذج الوزارية يستخدم `track_code` **مفرداً وإلزامياً**.
- أكواد النماذج **System-owned** ضمن امتداد TCS-2: مقترح `mex-g12-001-2025-main` (مبني على `subject_code` + السنة + الدور + المتغيّر، والمسار عمود مستقل لا جزء من الكود)، يولّده مولّد القوالب السياقي لا المشغّل. أكواد TCS-1 مرفوضة.
- **لا يُسلَّم قالب النماذج الوزارية للمشغّل قبل إغلاق 14B/14D.**
- ترتيب التنفيذ: المحتوى (01→07) ← الأسئلة (09→08) ← **النماذج (10) ← ربط الأسئلة (11)**.
- Idempotency عبر `import_jobs` + hash الصف كما هو قائم.
- شرط بوابة: كل `question_code` يجب أن يكون له revision منشورة قبل مرحلة 11، وإلا يفشل الصف بخطأ واضح.

---

## 13) OFFLINE_IMPLICATIONS

- وضع Training: يمكن تخزين snapshot الجلسة في IndexedDB والإجابة أوفلاين ثم مزامنة `answer_exam_question` بترتيب — مقبول.
- وضع Strict/Ministry: **لا دعم أوفلاين**؛ التوقيت والتسليم خادميان. عند انقطاع الشبكة تُعرض رسالة `safeExamMutationMessage` الحالية ولا يُسمح بإعادة المحاولة الأعمى (منطق `canRetryAfterServerReconciliation` قائم).
- تخزين مؤقت للنماذج (metadata فقط) عبر SW مسموح؛ **تخزين الأسئلة أو الحلول ممنوع**.

---

## 14) BLOCKERS

| # | Blocker | الشدة | الحل |
|---|---|---|---|
| B-1 | `exam_sessions` تحتاج عمود `ministerial_model_id` (تعديل جدول قائم مغلق) | متوسط | عمود nullable + FK، بلا تغيير سلوك القوالب الحالية |
| B-2 | `create_exam_session_with_snapshot` تعتمد `template_id` + `exam_template_questions` | عالٍ | توسيع الدالة لتقرأ من `ministerial_exam_questions` عند وجود model، مع الحفاظ على التوقيع القديم |
| B-3 | لا يوجد enum لـ `exam_round` | منخفض | إنشاء `ministerial_exam_round` |
| B-4 | تعريف «السؤال المتكرر» يفترض إعادة استخدام نفس `question_id` عبر السنوات — يحتاج انضباط المشغّل | متوسط | توثيق في دليل المشغّل + أداة ترشيح بالـ hash |
| B-5 | `source_document_url` قد يسرّب نموذج الإجابة | عالٍ | bucket خاص، لا رابط عام، لا كشف للطالب |
| B-6 | جداول المحتوى فارغة حالياً (بعد 12C) — لا بيانات لاختبار حقيقي | منخفض | يبدأ بعد أول دفعة محتوى حقيقية |

**لا Blocker يمنع الانتقال إلى مرحلة التنفيذ.**

---

## 15) IMPLEMENTATION_PHASES

| المرحلة | المحتوى | المخرج |
|---|---|---|
| **14B** | Migration schema: enum + الجدولان + العمود + القيود + Triggers + RLS + GRANTs، وبروفة PG17 معزولة | migration معلّق + تقرير PASS |
| **14C** | توسعة RPCs: `create_exam_session_with_snapshot` (ministerial)، `get_ministerial_models`, `get_ministerial_repeated_stats` | RPC + اختبارات منع التسريب |
| **14D** | مسار الاستيراد: قالبا 10 و11 + مولّد الأكواد TCS-1 + تحقق النشر | قوالب + E2E |
| **14E** | واجهة الإدارة (قراءة/نشر عبر RPC فقط) | AdminMinisterialExams |
| **14F** | واجهة الطالب: قائمة النماذج، Training، Strict/Ministry، بطاقة الإحصاءات | UI + smoke tests |
| **14G** | تدقيق أمني نهائي: answer-leak، RLS replay، بوابات الاشتراك | تقرير إغلاق |

---

## الحكم النهائي

**PAST_MINISTERIAL_EXAMS_ARCHITECTURE_14A = PASS**

البنية الحالية تسمح بإعادة استخدام كامل لمنظومة الجلسات والتصحيح وبنك الأسئلة، ويكفي جدولان جديدان + عمود ربط واحد لتحقيق هوية النموذج الوزاري والعزل التام بين مسارات المناهج، دون أي تخزين ثانٍ للإجابات ودون نقل أي بنية من Mufadhala.
