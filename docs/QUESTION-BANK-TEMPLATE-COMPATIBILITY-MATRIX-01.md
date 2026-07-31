# QUESTION-BANK-TEMPLATE-COMPATIBILITY-MATRIX-01

مصفوفة توافق أوراق القالب الرسمي المقترح مع البنية الحالية والمقترحة.

| حقل | قيمة |
|---|---|
| HEAD | `9d6eb603fead085f8fa86f29647a8c5e51cab2af` |
| ملفات القالب العربي الرسمي في الريبو | **غير موجودة** — المصفوفة مبنية على مفاهيم الأوراق المذكورة في المهمة + القالب التشغيلي `09_questions_template.xlsx` |
| حالات التوافق | `DIRECT_MATCH` \| `PARTIAL_MATCH` \| `LEGACY_JSON` \| `MISSING` \| `CONFLICT` \| `NOT_REQUIRED` |

---

## 0. القالب التشغيلي الحالي (موجود) — ورقة أسئلة مسطّحة

مصدر الأعمدة: `src/lib/content-import/content-import-templates.ts:244-271` + `09_questions_template.xlsx`.

| حقل القالب الحالي | المفهوم | الكائن الحالي | التوافق | الفجوة | القرار |
|---|---|---|---|---|---|
| `question_code` | رمز السؤال | `questions.code` | DIRECT_MATCH | — | الإبقاء كمفتاح idempotent |
| `question_text` | نص السؤال | `questions.question_text` | DIRECT_MATCH | — | الإبقاء |
| `option_1`…`option_6` | خيارات | `questions.options` JSON | LEGACY_JSON | ليس جدولاً مطبّعاً | محوّل → `question_options` + sync JSON |
| `correct_index` | الإجابة | `questions.correct_index` | LEGACY_JSON / CONFLICT مع القالب الرسمي الجديد | الرسمي يجب ألا يحتوي correct_index | محوّل توافق فقط؛ الرسمي يستخدم `is_correct` |
| `explanation` | شرح | `questions.explanation` | PARTIAL_MATCH | لا model_answer/hint/mistakes | → `question_solutions` + sync |
| `lesson_code` | هدف درس | `questions.lesson_id` عبر resolve | PARTIAL_MATCH | هدف واحد | → `question_targets` (+ cache lesson_id) |
| `subject_code` | هدف مادة | `questions.subject_id` | PARTIAL_MATCH | — | → targets |
| `review_status` | حالة | — | MISSING | لا عمود status | إضافة `questions.status` لاحقاً |
| (لا unit_code) | هدف وحدة | — | MISSING | لا unit_id على questions | targets UNIT |

---

## 1. Questions (القالب الرسمي المقترح)

| حقل مفاهيمي | الكائن الحالي | التوافق | الفجوة | القرار |
|---|---|---|---|---|
| question_code | `questions.code` | DIRECT_MATCH | — | استخدامه |
| stem / question_text | `questions.question_text` | DIRECT_MATCH | — | استخدامه |
| interaction_type | `questions.question_type` | PARTIAL_MATCH / CONFLICT | القيم الحالية ليست SINGLE_CHOICE… | عمود جديد `interaction_type`؛ legacy يبقى |
| status | — | MISSING | — | إضافة nullable |
| difficulty / points / time | — | MISSING | — | إضافة اختيارية |
| year / semester / sort_order | موجودة | DIRECT_MATCH | — | الإبقاء على questions |
| tags | — | MISSING | — | مؤجل أو jsonb |

**حقول تُضاف على `questions` دون كسر:** status, interaction_type, difficulty, default_points (كلها nullable).
**حقول يجب أن تكون جداول مستقلة:** options, solutions, targets, media, stimuli, rubrics.

---

## 2. QuestionTargets

| المفهوم | الحالي | التوافق | الفجوة | القرار |
|---|---|---|---|---|
| SUBJECT | `questions.subject_id` | PARTIAL_MATCH | هدف واحد، بلا is_primary رسمي | جدول `question_targets` |
| UNIT | `questions.unit` نص / عبر lessons | CONFLICT / MISSING | لا FK unit_id | targets.unit_id |
| LESSON | `questions.lesson_id` | PARTIAL_MATCH | مفرد | targets + cache |
| متعدد الروابط | junctions للامتحان فقط | PARTIAL_MATCH | ليس نموذج أهداف عاماً | targets N:1 سؤال |
| primary فقط | عُرف ضمني | MISSING | — | قيد unique partial |

---

## 3. Options

| المفهوم | الحالي | التوافق | الفجوة | القرار |
|---|---|---|---|---|
| قائمة خيارات | `questions.options` JSONB | LEGACY_JSON | لا option_code | `question_options` |
| اختيار صحيح | `correct_index` | LEGACY_JSON | فهرس لا رمز | `is_correct` + option_code |
| متعدد صحيح | — | MISSING | INT مفرد | دعم لاحق MULTIPLE_CHOICE |
| إخفاء is_correct عن الطالب | revoke على correct_index | PARTIAL_MATCH | JSON options مكشوف | لا تُخزَّن الصحة داخل JSON المعروض |

---

## 4. AcceptedAnswers

| المفهوم | الحالي | التوافق | القرار |
|---|---|---|---|
| إجابات مقبولة لنص/رقم | — | MISSING | جدول لاحق `question_accepted_answers` (QB مؤجل للأنواع غير MCQ) |
| MCQ | correct_index / is_correct | PARTIAL_MATCH | عبر Options |

---

## 5. Solutions / SolutionSteps

| المفهوم | الحالي | التوافق | القرار |
|---|---|---|---|
| explanation | `questions.explanation` | PARTIAL_MATCH | `question_solutions.explanation` + sync |
| model_answer | — | MISSING | عمود جديد |
| hint | — | MISSING | عمود جديد |
| common_mistakes | — | MISSING | عمود جديد |
| reveal_policy | ضمني في RPC | PARTIAL_MATCH | عمود صريح |
| solution steps | — | MISSING | `question_solution_steps` اختياري |
| lesson_explanations | جدول منفصل لمحتوى الدرس | NOT_REQUIRED كبديل | **لا يُخلط** مع حلول الأسئلة |

---

## 6. Rubrics

| المفهوم | الحالي | التوافق | القرار |
|---|---|---|---|
| معايير تصحيح مقالي | — | MISSING | مؤجل — حزمة بعد دعم LONG_TEXT |

---

## 7. Stimuli

| المفهوم | الحالي | التوافق | القرار |
|---|---|---|---|
| مثير مشترك لعدة أسئلة | — | MISSING | `question_stimuli` + روابط |
| نص مشترك مكرر في question_text | عمل يدوي | LEGACY_JSON | ترحيل تدريجي |

---

## 8. Media

| المفهوم | الحالي | التوافق | القرار |
|---|---|---|---|
| صورة/ملف للسؤال | — | MISSING | `question_media` + Storage لاحقاً |
| وسائط الدرس | `lesson_resources` | NOT_REQUIRED كبديل كامل | تبقى لوسائط الدرس فقط |
| local_asset_path في استيراد الموارد | قالب 06 | PARTIAL_MATCH | نمط مماثل لوسائط الأسئلة |

---

## 9. QuestionSets / QuestionSetItems

| المفهوم | الحالي | التوافق | القرار |
|---|---|---|---|
| مجموعة مرتبة | `lesson_assessments` + `assessment_questions` | PARTIAL_MATCH | **إعادة استخدام** — لا جدول موازٍ في QB-01 |
| محاكي اختبار | `exam_templates` + `exam_template_questions` | PARTIAL_MATCH | **إعادة استخدام** |
| set عشوائي | — | MISSING | خاصية لاحقة على القالب |
| نسخ السؤال لكل اختبار | يجب تجنبه | CONFLICT إن نُسخ | فرض إعادة الاستخدام بـ question_id |

---

## 10. خلاصة قرارات التوافق

| ورقة | الحكم الإجمالي |
|---|---|
| Questions | PARTIAL_MATCH → توسيع خفيف + جداول تابعة |
| QuestionTargets | MISSING → جدول جديد أساسي |
| Options | LEGACY_JSON → تطبيع + sync |
| AcceptedAnswers | MISSING (غير MCQ) |
| Solutions / Steps | PARTIAL_MATCH / MISSING |
| Rubrics | MISSING (مؤجل) |
| Stimuli | MISSING |
| Media | MISSING (مع نمط lesson_resources كمرجع) |
| QuestionSets | PARTIAL_MATCH عبر assessments/exams — **NOT_REQUIRED** كجداول جديدة فوراً |

### تعارض حرج يجب إدارته

`correct_index` في القالب التشغيلي الحالي **مطلوب** (`content-import-templates.ts:119,250`) بينما القالب الرسمي المستهدف **يمنع** `correct_index`.
**القرار:** محوّل استيراد ثنائي الوضع — `legacy_flat_09` و`official_normalized_v1` — حتى QB-09.
