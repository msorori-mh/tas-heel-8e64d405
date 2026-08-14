# PAST_MINISTERIAL_EXAMS_ARCHITECTURE_14A — إعادة الاعتماد على أعتمد إعادة اعتماد `14A` على أساس `TCS-2`، والخطة صحيحة معماريًا. لكن قبل إرسالها للتنفيذ أوصي بتثبيت **3 تصحيحات صغيرة لكنها مهمة** حتى لا نحمل خطأ إلى 14B.

```text
PAST_MINISTERIAL_EXAMS_ARCHITECTURE_14A
= GO_FOR_REAPPROVAL_TCS2

```

أهم قرار أصبح:

```text
Subject identity            = track-independent
Subject availability        = subject_curriculum_tracks
Ministerial exam identity   = track-specific
Question curriculum target  = subject/lesson
Ministerial provenance      = model membership

```

وهذا الفصل هو الصحيح.

### التصحيحات الثلاثة

1. **لا تجعل** `model_label` **وحده جزءًا تقنيًا من Natural Key إذا كان مجرد اسم عرض.** الأفضل أن تكون للنموذج هوية ثابتة مثل:

```text
model_variant_code = main | a | b | supplementary-01
model_label        = "النموذج أ" / "الدور الأول" / ...

```

فتصبح الهوية:

```text
subject_id
+ curriculum_track_id
+ academic_year
+ exam_round
+ model_variant_code

```

لأن `model_label` قد يتغير لغويًا، وقد يكون NULL، وPostgreSQL يحتاج معالجة خاصة للـNULL داخل UNIQUE. `model_variant_code` ثابت، و`model_label` قابل للتعديل.

2. **لا تثبت في دليل يوسف الفاصل** `sanaa|aden` **إذا كان عقد Template 01 الفعلي يستخدم فاصلة.** في خطة 13C الأصلية كان:

```text
track_codes = sanaa,aden

```

لذلك يجب أن يكون الدليل والقالب والعقد من **مصدر واحد**. الصياغة الأفضل في الوثيقة:

```text
track_codes = حسب الصيغة المعرفة في IMPORT CONTRACT

```

ثم يولّد المثال آليًا من العقد. لا نريد أن يصبح الدليل يقول `|` بينما Parser ينتظر `,`.

3. أضف قاعدة مفاهيمية مهمة للأسئلة الوزارية:

```text
question_targets لا تحمل curriculum_track_id

```

وهذا مقصود.

إذا كان السؤال صالحًا أكاديميًا للمادة المشتركة:

```text
Question
→ Shared Subject / Lesson

```

ويمكن إدراجه في نموذج صنعاء أو عدن أو كليهما.

أما حقيقة:

```text
هذا السؤال ورد في وزاري صنعاء 2025

```

فلا تخزن في `question_targets`، بل في:

```text
ministerial model membership / occurrence

```

وبالتالي لا نحول بنك الأسئلة إلى Track-specific من جديد.

---

## نقطة مهمة حول الطالب

أوافق على اختبار:

```text
طالب صنعاء يرى نموذج عدن = DENY

```

ولكن يجب أن يكون المنع **Server-side** وليس فلتر UI:

```text
student track
→ ministerial_exam_models.curriculum_track_id
→ must match

```

ومع:

```text
model.track_id
∈ active subject_curriculum_tracks(subject_id)

```

أي نحتاج بوابتين:

```text
MODEL_VALIDITY_GATE:
model track assigned to subject

STUDENT_VISIBILITY_GATE:
student track == model track

```

فحتى لو كانت المادة مشتركة:

```text
Physics
├── Sanaa
└── Aden

```

طالب صنعاء:

```text
Physics content       ✅
Sanaa 2025 exam       ✅
Aden 2025 exam        ❌

```

---

## لا أنصح بتخزين `grade_id` مرة ثانية في النموذج

طالما:

```text
subject
→ grade

```

فالأفضل أن يستنتج النموذج الصف من المادة ولا نكرر:

```text
grade_id

```

داخل `ministerial_exam_models` إلا إذا ظهر سبب تقني قوي لاحقًا.

الهوية الأنظف:

```text
subject_id
curriculum_track_id
academic_year
exam_round
model_variant_code

```

وبذلك لا يوجد خطر:

```text
subject = Grade 12
model.grade = Grade 11

```

---

## repeated questions

أضف للوثيقة أن Student-facing repeated analytics تكون افتراضيًا:

```text
subject
+ curriculum_track

```

مثلاً:

```text
فيزياء — صنعاء
السؤال X:
2021
2023
2024
2025
→ تكرر 4 مرات

```

ولا تدخل ظهور نفس السؤال في عدن ضمن رقم صنعاء.

يمكن لاحقًا للإدارة الحصول على Cross-track analytics، لكن هذا ليس المعنى الذي نعرضه للطالب.

---

## بالنسبة لإعادة استخدام `exam_templates`

أوافق على إبقاء القرار السابق:

```text
exam_templates(mode='ministry')

```

وعدم إنشاء Exam Engine ثانٍ.

والنموذج الوزاري يكون Metadata/Provenance layer فوق محرك الاختبارات الحالي:

```text
Ministerial Model
       ↓
Exam Template
       ↓
Published QB Revisions
       ↓
Exam Session
       ↓
Questions / Answers

```

وهذا أفضل بكثير من نسخ بنية مفاضلة وإنشاء:

```text
past_exam_attempts
past_exam_questions with correct_answer

```

من جديد.

---

## اختبارات 14B المعتمدة

أضيف فقط على قائمتك:

```text
Shared subject + Sanaa model                   ALLOW
Shared subject + Aden model                    ALLOW
Same subject/year/round, different track       ALLOW

Model track not assigned to subject            DENY
Inactive subject-track assignment              DENY
Subject with zero assignments                  DENY

Published shared-subject question              ALLOW
Question target requires track                 MUST NOT EXIST

Sanaa student → Sanaa model                    ALLOW
Sanaa student → Aden model                     DENY
Aden student → Sanaa model                     DENY

Same subject+track+year+round+variant           DENY DUPLICATE
Same tuple but different variant_code           ALLOW

Repeated count Sanaa                           excludes Aden occurrences
Repeated count Aden                            excludes Sanaa occurrences

Correct answers before permitted reveal         DENY
Direct client answer access                     DENY

```

---

## تعليمات يوسف

أوافق تمامًا على إضافة النص:

> **لا تنشئ نسخة من المادة لكل مسار إذا كان المحتوى واحداً؛ استخدم مادة واحدة وحدد جميع المسارات التي تتاح فيها من القالب السياقي.**

ثم:

```text
محتوى واحد:
Subject واحدة
Tracks = Sanaa + Aden
Units/Lessons/Questions = مرة واحدة

محتوى مختلف:
Subject Variant A → Sanaa
Subject Variant B → Aden

```

وأضيف له تنبيهًا:

> اشتراك المادة بين المسارات لا يعني اشتراك النماذج الوزارية؛ النماذج الوزارية تُدار لكل مسار بصورة مستقلة.

لكن **لا نعطي يوسف الآن قالب استيراد النماذج الوزارية** حتى تنتهي 14B/مرحلة الاستيراد الخاصة بها.

---

## القرار النهائي

بعد هذه التعديلات:

```text
SHARED SUBJECT MODEL                  ALIGNED
TCS-2                                 ALIGNED
SUBJECT TRACK ASSIGNMENTS             SOURCE OF AVAILABILITY
MINISTERIAL MODEL TRACK               REQUIRED
QUESTION TARGET TRACK                 NOT REQUIRED
TRACK ISOLATION                       MODEL LEVEL
EXAM ENGINE                           REUSED
QB PUBLISHED REVISION                 REUSED
ANSWER DUPLICATION                     REJECTED
PAST_EXAM_ATTEMPTS PARALLEL ENGINE     REJECTED
OPERATOR DOCUMENTATION                UPDATED
DB WRITES                             ZERO
MIGRATIONS                            ZERO

```

والحكم المطلوب من Lovable:

```text
PAST_MINISTERIAL_EXAMS_ARCHITECTURE_14A
= RE-APPROVED (TCS-2 ALIGNED)

NEXT:
PAST_MINISTERIAL_EXAMS_FOUNDATION_14B

```

بهذا تكون 14A قاعدة معمارية نظيفة يمكن أن نبني عليها 14B دون الرجوع مرة أخرى لمسألة «هل المادة نفسها تخص صنعاء أم عدن؟»؛ المادة يمكن أن تكون مشتركة، **لكن الامتحان الوزاري يظل دائمًا خاصًا بمساره**.TCS-2

بعد اعتماد `SHARED_CURRICULUM_SUBJECT_MAPPING_13C = PASS`، أصبح تصميم 14A الحالي مبنياً على افتراض قديم: أن المسار محفوظ داخل `subjects.curriculum_track_id` (مادة لكل مسار). هذا لم يعد صحيحاً — التوفّر صار في `subject_curriculum_tracks`.

هذه المرحلة **تصميم/توثيق فقط**: لا Migration، لا كتابة على القاعدة، لا UI. المخرجات مستندات معتمدة يُبنى عليها التنفيذ في مرحلة لاحقة (14B).

## 1) تحديث وثيقة 14A إلى النموذج المشترك

في `docs/ministerial-exams/PAST-MINISTERIAL-EXAMS-ARCHITECTURE-14A.md`:

- تصحيح قسم AUDIT: المادة قد تكون مشتركة بين صنعاء وعدن؛ العزل لم يعد على مستوى `subjects` بل على مستوى **النموذج الوزاري نفسه**.
- تثبيت المبدأ صراحة:
  ```text
  Shared Subject ≠ Shared Ministerial Exam
  subject  = identity (TCS-2, track-independent)
  model    = (subject_id, curriculum_track_id, academic_year, exam_round, model_label)
  ```
- استبدال شرط الاتساق القديم (subject.track == model.track) بالبوابة الجديدة:
  ```text
  ministerial_exam_models.curriculum_track_id
  MUST EXIST IN subject_curriculum_tracks(subject_id, curriculum_track_id)
  AND that assignment MUST be active
  ```
- تشديد `assert_ministerial_question_publishable`: يكفي أن يشير `question_targets` إلى نفس `subject_id` — لا يجوز اشتراط تطابق مسار على السؤال، لأن سؤال المادة المشتركة صالح للمسارين. عزل المسار يتم على مستوى النموذج فقط.
- إبقاء بقية القرارات كما اعتُمدت: إعادة استخدام `exam_templates(mode='ministry')`، `exam_sessions/questions/answers`، رفض تخزين الإجابات داخل جداول الوزاري، رفض `past_exam_attempts`، `exam_sessions.ministerial_model_id` بدل جدول ربط ثالث.

## 2) حالات اختبار الخروج (تُضاف للوثيقة، تُنفَّذ في 14B)

```text
مادة مشتركة + نموذج صنعاء 2025        ALLOW
مادة مشتركة + نموذج عدن 2025          ALLOW  (صفّان مستقلان)
نموذج بمسار غير مرتبط بالمادة          DENY
نموذج على مادة بلا ارتباطات مسار       DENY
سؤال منشور مستهدف للمادة المشتركة      ALLOW في المسارين
طالب صنعاء يرى نموذج عدن              DENY
تكرار (مادة, مسار, سنة, دور, نموذج)    DENY (UNIQUE)
```

## 3) تحديث تعليمات المشغّل (يوسف)

إضافة الجملة الحاكمة صراحةً، وبنفس الصياغة، في:

- `docs/import/OPERATOR-RUNBOOK-AR.md` (قسم جديد "المادة المشتركة بين المسارات" قبل الخطوات)
- `docs/import/NAMING-CONVENTION.md` (تعزيز البند الموجود)

النص:

```text
لا تنشئ نسخة من المادة لكل مسار إذا كان المحتوى واحداً؛
استخدم مادة واحدة وحدد جميع المسارات التي تتاح فيها من القالب السياقي.
```

مع توضيح الحالتين:

- محتوى واحد → مادة واحدة، `track_codes = sanaa|aden`، والوحدات والدروس والأسئلة تُدخل مرة واحدة.
- محتوى مختلف فعلاً → مادتان مستقلتان، كل واحدة بمسارها.
- أي قالب TCS-1 قديم مرفوض: الحزمة الرسمية الوحيدة هي القوالب التسعة المولّدة بـ TCS-2.

وتحديث ترويسة مرحلة الرنبوك إلى `SHARED_CURRICULUM_SUBJECT_MAPPING_13C` وإعادة توليد حزمة المشغّل (ZIP) لتحمل النصوص المحدثة.

## تفاصيل تقنية

- لا تغيير على `src/` باستثناء ما يلزم لإعادة توليد حزمة المشغّل من الأدلة المحدثة (`scripts/build-operator-pack.mjs` يقرأ الملفات كما هي، فالأرجح لا تعديل كود).
- لا استدعاء لأداة الترحيل في هذه المرحلة؛ نصوص SQL المقترحة تبقى داخل الوثيقة فقط.
- مخرَج المرحلة: `PAST_MINISTERIAL_EXAMS_ARCHITECTURE_14A = RE-APPROVED (TCS-2 aligned)` وتحديد 14B كمرحلة التنفيذ (Migration + RPC + UI).