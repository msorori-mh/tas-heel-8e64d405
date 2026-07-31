# QUESTION-BANK-TEMPLATE-COMPATIBILITY-MATRIX-01

مصفوفة توافق مبنية على **أدلة Excel الفعلية** + القالب التشغيلي في الريبو + التصميم المستهدف.

| حقل | قيمة |
|---|---|
| Runtime baseline | `9d6eb603fead085f8fa86f29647a8c5e51cab2af` |
| طبقات المخطط | `teacher_flat_ar_v0` · `official_flat_v0` · `legacy_flat_15col` · **`official_normalized_v1` (TARGET ONLY — لا عيّنة Excel بعد)** |

قرارات الحقل: `SUPPORTED_P0` | `SUPPORTED_P1` | `DERIVED` | `NORMALIZED` | `LEGACY_ADAPTER_ONLY` | `REJECTED` | `DEFERRED` | `OWNER_DECISION_REQUIRED`

---

## 0. ملخص الطبقات

| الطبقة | المصدر | ملاحظة |
|---|---|---|
| teacher_flat_ar_v0 | `حل اسئله الدرس الاول -للتجربه.xlsx` | 29 عموداً؛ بلا question_code؛ status=متاح |
| official_flat_v0 | `قالب_لاستيراد_أسئلة_الثانوية.xlsx` | Questions+Media+QuestionTypes(26)؛ Published؛ id رقمي |
| legacy_flat_15col | `نموذج_استيراد_الاسئله_للتجربة_فقط (2).xlsx` | option_1..4 + correct_index 1-based |
| operational_09 (ريبو) | `09_questions_template.xlsx` + validators | question_code + correct_index 1–6 |
| official_normalized_v1 | تصميم فقط | لا ملف عيّنة؛ يمنع correct_index وid اليدوي وPublished |

---

## 1. جدول الحقول المكتشفة → الهدف

| Source field | Source schema(s) | Observed meaning | Target | Normalization | Req/Opt | Validation | Package | Decision |
|---|---|---|---|---|---|---|---|---|
| question_code | operational_09 / normalized | رمز idempotent | `questions.code` | trim/lower policy | Req (رسمي) | unique؛ إلزامي في الرسمي | QB-03/04 | SUPPORTED_P0 |
| id (numeric) | official_flat_v0, legacy | معرف يدوي | — | drop | — | **رفض** في الرسمي | QB-03 | REJECTED |
| question / question_text | all | نص السؤال | `questions.question_text` | trim | Req | non-empty | QB-03/04 | SUPPORTED_P0 |
| question_type (AR/EN codes) | teacher/official/legacy | اسم تعليمي | display label + map→`interaction_type` + `grading_mode` | dictionary per adapter | Req | known map or reject | QB-03 | NORMALIZED |
| question_category | teacher/official | تصنيف محتوى | optional metadata jsonb/tag | trim | Opt | — | QB-05 | SUPPORTED_P1 |
| keywords / tags | teacher/official | كلمات | metadata | split | Opt | — | QB-05 | DEFERRED/P1 |
| bloom_level | teacher/official | مستوى بلوم | metadata | map AR/EN | Opt | — | QB-05 | DEFERRED |
| time_seconds | teacher/official | زمن مقترح | `time_limit_seconds` | int>0 | Opt | — | QB-01 | SUPPORTED_P1 |
| difficulty | teacher/official | صعوبة | `difficulty` | map | Opt | — | QB-01 | SUPPORTED_P1 |
| marks | teacher/official | درجة | `default_points` / set points | number | Req-ish | >0 | QB-01/04 | SUPPORTED_P0 |
| shuffle_options | teacher/official | خلط | flag on question/set | bool | Opt | — | QB-05 | SUPPORTED_P1 |
| allow_partial | teacher/official | درجات جزئية | manual grading meta | bool | Opt | only MANUAL/AUTO_TEXT | QB-01/06 | SUPPORTED_P0 |
| option_a..e / option_1..4 | teacher/official/legacy/09 | خيارات | `question_options` | skip `-`/`فارغ`؛ codes A.. / O1.. | Req if SINGLE | ≥2 options for MCQ | QB-01/03 | NORMALIZED |
| correct_index | legacy/09 | فهرس صحيح | → `option_code` is_correct | **Excel/dry-run = 1-based**؛ تحويل صريح إلى تمثيل داخلي | Req MCQ legacy | 1..n وoption موجود | QB-03/04 | LEGACY_ADAPTER_ONLY |
| correct_answer | teacher/official/legacy | حرف/نص | MCQ→option_code؛ نص→model/accepted | parse letter vs text | Cond | conflict rules | QB-03 | NORMALIZED |
| acceptable_answers | teacher/official | بدائل نصية | `question_accepted_answers` | split؛ trim | Opt SHORT_TEXT | non-empty tokens | QB-01/03 | SUPPORTED_P0 |
| explanation | all | شرح | `question_solutions.explanation` | trim | Opt | staff-only until reveal | QB-01 | SUPPORTED_P0 |
| hint | teacher/official | تلميح | `question_solutions.hint` | trim | Opt | reveal policy | QB-01 | SUPPORTED_P0 |
| answer_data | official | JSON تقني | — | ignore/reject if user-facing | — | غير مطلوب للمعلّم | QB-03 | REJECTED (user UX) |
| attachment / image/audio/video / question_image | all | وسائط | `question_media` | فارغ→NULL؛ يتطلب ملفاً إن requires_media | Cond | mime/ext/size | QB-01/03 | SUPPORTED_P0 |
| context_text | legacy | مثير نصي للسؤال | `stimulus_text` per-question | trim؛ فارغ→NULL | Opt | — | QB-01 | SUPPORTED_P0 |
| Media.question_id/file_* | official Media | ربط وسائط | `question_media` via question_code (لا id) | remap id→code في adapter فقط إن فريد | Cond | file exists | QB-03 | LEGACY_ADAPTER_ONLY→NORMALIZED |
| subject / grade / semester | teacher/official | نطاق | resolve → targets | codes preferred | Cond | complete tuple | QB-03 | NORMALIZED |
| unit (number/text) | teacher/official | رقم/اسم وحدة | `question_targets.unit_id` | **لا رقم وحده** | Cond | unit_code أو tuple كامل | QB-03 | NORMALIZED |
| lesson (AR name) | teacher/official | اسم درس | resolve lesson_code | unique within grade+sem+subject+unit else reject | Cond | ambiguous→error | QB-03 | LEGACY_ADAPTER_ONLY |
| lesson_code | legacy/09 | رمز درس | primary LESSON target | exact | Cond | must exist | QB-03 | SUPPORTED_P0 |
| status / Published / متاح | teacher/official | حالة نشر | Excel in: DRAFT\|READY_FOR_REVIEW only | map/reject | Req | Published/متاح **رفض** (أو تحذير Legacy فقط) | QB-03/04 | REJECTED as publish |
| is_repeated | legacy | تكرار ظاهري | DERIVED من الروابط | ignore as SoT | — | — | QB-03 | DERIVED |
| topic | legacy | موضوع | metadata | trim | Opt | — | QB-05 | SUPPORTED_P1 |
| QuestionTypes (26 codes) | official | قائمة تعليمية | reference taxonomy | لا تُثبّت كلها P0 | — | — | QB-05 | DEFERRED (most) |

---

## 2. أنواع الأسئلة: Observed → P0/P1/Deferred

| Observed label | Schemas | interaction_type (P0 map) | grading_mode | Decision |
|---|---|---|---|---|
| مقالي / essay / ESSAY | teacher, legacy, types | LONG_TEXT | MANUAL | SUPPORTED_P0 |
| إكمال فراغ / FILL | teacher, official | SHORT_TEXT (أو دلالي FILL فوقه) | AUTO_TEXT إن قواعد صريحة وإلا MANUAL | SUPPORTED_P0 |
| اختيار / MCQ / mcq | all | SINGLE_CHOICE | AUTO_SINGLE | SUPPORTED_P0 |
| PARSE / EXTRACT / EXPLAIN… | official types | غالباً LONG_TEXT + label تعليمي | MANUAL | لا تُعامل كـ MCQ تلقائياً |
| TRUE_FALSE | types list | TRUE_FALSE | AUTO_SINGLE | SUPPORTED_P1 |
| MULTI_SELECT / MATCH / ORDER / … | types list only | — | — | DEFERRED |

`official_normalized_v1` يخزّن: `interaction_type` + `grading_mode` + `educational_label` منفصلين.

---

## 3. correct_index — اتفاقيات

| مصدر | الاتفاقية | Evidence |
|---|---|---|
| legacy_flat_15col عيّنة | **1-based** (1→option_1 …) | صفوف ci=1/2/3 مع خيارات |
| operational dry-run / preflight | **1-based 1–6** | `content-import-validators.ts` |
| generate-import-templates note | **1-based** | `scripts/generate-import-templates.ts` |
| مقارنات UI exams (i من map) | غالباً **0-based** مقابل DB | exams routes |
| official_normalized_v1 | **لا correct_index** — `option_code`+`is_correct` | تصميم |

**قاعدة:** كل adapter يعلن الاتفاقية؛ **ممنوع التحويل الصامت**. Apply يجب أن يوثّق التحويل إلى تمثيل التخزين الداخلي صراحة (OWNER_DECISION_REQUIRED إن بقي غموض DB).

---

## 4. قرارات الطبقات الأربع

| الطبقة | دورها |
|---|---|
| teacher_flat_ar_v0 | Legacy adapter للمعلّم؛ توليد/رفض codes؛ تطبيع `-`؛ رفض/تحذير «متاح» |
| official_flat_v0 | Legacy adapter؛ رفض id وPublished؛ map Media؛ لا تفرض 26 نوعاً |
| legacy_flat_15col | أقرب للتشغيل؛ 1-based؛ lesson_code؛ context/image |
| official_normalized_v1 | **TARGET DESIGN ONLY** — question_code؛ DRAFT/READY_FOR_REVIEW؛ options/solutions/accepted/media؛ بلا correct_index |
