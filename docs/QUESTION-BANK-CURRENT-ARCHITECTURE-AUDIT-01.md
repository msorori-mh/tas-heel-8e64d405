# QUESTION-BANK-CURRENT-ARCHITECTURE-AUDIT-01

تدقيق البنية الفعلية لنظام الأسئلة والحلول — بدون Migration أو كتابة إنتاج.

| حقل | قيمة |
|---|---|
| التاريخ | 2026-07-31 |
| المستودع | `msorori-mh/tas-heel-8e64d405` |
| فرع التدقيق | `docs/question-bank-architecture-audit-01` |
| HEAD (`origin/main`) | `9d6eb603fead085f8fa86f29647a8c5e51cab2af` |
| working tree عند البدء | clean |
| طبيعة النسخة | مستودع GitHub التشغيلي (Lovable + وكلاء)، ليس مخططاً تاريخياً منفصلاً |
| Migration مطبّقة في هذه المهمة | **NO** |
| كتابة إنتاج | **ZERO** |

---

## A. حالة المستودع

```
origin  https://github.com/msorori-mh/tas-heel-8e64d405.git
HEAD    9d6eb60 Merge pull request #39 (QA preflight docs)
```

آخر migrations ذات الصلة بالأسئلة/الاستيراد/`code`:

| Migration | الموضوع |
|---|---|
| `20260606003842_…` | إنشاء `questions` (JSONB options + correct_index) |
| `20260606004422_…` | `unit` text + `semester` |
| `20260606004917_…` | assessments + RPCs درس + تقييد SELECT questions |
| `20260607234143_…` | exam_templates / sessions / get_exam_session_state |
| `20260615005248_…` | `questions.code` + partial unique |
| `20260622140000_…` / `20260731120000_…` | column grants — حجب `correct_index`/`explanation` |
| `20260628171431_…` + `20260628190000_…` | `import_jobs` / `import_errors` (تعريف مكرر) |
| `20260719204006_…` | `grade_unit_practice` / `start_exam_session` (free-access) |

### ملفات القالب المرجعية المطلوبة من المالك

| الملف | الحالة في المستودع |
|---|---|
| `قالب_لاستيراد_أسئلة_الثانوية.xlsx` | **غير موجود** |
| `نموذج_استيراد_الاسئله_للتجربة_فقط (2).xlsx` | **غير موجود** |
| `حل اسئله الدرس الاول -للتجربه.xlsx` | **غير موجود** |
| `القالب_الرسمي_الموحد_لاستيراد_أسئلة_الثانوية_v1.xlsx` | **غير موجود** |
| `نموذج_تطبيقي_موحد_لأسئلة_الثانوية_وحلولها_v1.xlsx` | **غير موجود** |

**الموجود فعلياً:** قوالب المحتوى التشغيلية `01`–`09` تحت `public/content-import-templates/` و`docs/content-templates/` (مولَّدة من `scripts/generate-content-templates.mjs`)، بما فيها `09_questions_template.xlsx` (MCQ + `correct_index`).

لا Edge Functions تحت `supabase/functions/` في هذا المستودع.

---

## B. جرد الكائنات

| الكائن | النوع | الملف المنشئ (أساس) | الأعمدة/الحقول الرئيسية | العلاقات | RLS / Grants | الاستخدام الفعلي |
|---|---|---|---|---|---|---|
| `subjects` | table | `20260606003842_…` | id, name, grade_id, code, … | ← units, lessons, questions | SELECT authenticated + staff ALL | واجهة طالب + إدارة + استيراد |
| `units` | table | نفس الموجة + لاحق | id, subject_id, title, … | ← lessons; practice | SELECT authenticated (`can_access_subject`) بعد #34 | طالب + إدارة |
| `lessons` | table | نفس الموجة | id, subject_id, unit_id, slug, … | ← questions, assessments, resources | column grants (بدون URLs حساسة) | درس + تدريب وحدة |
| `questions` | table | `20260606003842_…:82-94` | انظر §C | lesson_id?, subject_id?; junctions | SELECT صفوف + **column revoke** على الإجابات | بنك مركزي |
| `questions.options` | JSONB | إنشاء الجدول | مصفوفة نصوص خيارات | — | **مقروء للطالب** (عرض) | كل واجهات MCQ |
| `questions.correct_index` | INT NOT NULL | إنشاء الجدول | فهرس الخيار الصحيح | — | **محجوب** عن client SELECT | RPCs فقط |
| `questions.explanation` | TEXT | إنشاء الجدول | شرح بعد الإجابة | — | **محجوب** عن client SELECT | RPCs بعد كشف |
| `questions.code` | TEXT | `20260615005248_…:28` | رمز استيراد | unique partial | في allowlist القراءة | استيراد/idempotent |
| `questions.unit` | TEXT | `20260606004422_…:227` | تسمية نصية قديمة | **لا FK** | مقروء | نادر/legacy |
| `lesson_assessments` | table | `20260606004917_…:177` | lesson_id, title, … | → assessment_questions | staff + view per lesson | اختبار درس |
| `assessment_questions` | junction | `20260606004917_…:271` | assessment_id, question_id, points, sort_order | questions reusable | staff + view per lesson | ربط أسئلة الاختبار |
| `exam_templates` | table | `20260607234143_…:12` | mode, subject/unit/lesson, code, duration | → template_questions, sessions | active templates readable | محاكي/تدريب/صارم |
| `exam_template_questions` | junction | `20260607234143_…:52` | template_id, question_id, points | questions reusable | active templates | ترتيب الاختبار |
| `exam_sessions` | table | `20260607234143_…:85` | user, status, score, … | → answers | own sessions | محاكي |
| `exam_session_answers` | table | `20260607234143_…:132` | selected_index, is_correct (بعد تسليم) | question_id | own answers | محاكي |
| `unit_practice_attempts` | table | `20260606175402_…` | unit_id, score, answers JSON | عبر lessons | own attempts | تدريب وحدة |
| `import_jobs` / `import_errors` | tables | `20260628171431_…` (+ duplicate `…28190000_…`) | حالة dry-run/apply، أخطاء صفوف | created_by | content staff | `/admin/import` |
| `lesson_resources` | table | موجة المحتوى | resource_type, urls, … | lesson_id | staff + lesson access | وسائط الدرس (ليست بنك أسئلة) |
| `lesson_explanations` | table | موجة المحتوى | title, content | lesson_id | منفصل عن `questions.explanation` | شروح الدرس |
| `get_lesson_quiz_questions` | RPC | `20260606004917_…:457` | بدون correct/explanation | SECURITY DEFINER | طالب | quiz درس |
| `check_lesson_question` | RPC | `20260610005557_…:3` | يكشف correct+explanation فوراً | بعد إجابة | formative UX | `lessons.$lessonId.tsx` |
| `grade_lesson_quiz` | RPC | `20260606004917_…:430` | نتيجة + explanations | بعد تسليم دفعة | طالب | quiz |
| `grade_unit_practice` | RPC | `20260719204006_…` | score بلا explanation في الرد | server uses correct_index | طالب | practice |
| `get_exam_session_state` | RPC | `20260607234143_…:355` | reveal فقط إن status≠in_progress | gated | امتحانات |
| `answer_exam_question` / `submit_exam_session` / `start_exam_session` | RPCs | exam migrations | لا مفتاح إجابة قبل التسليم | gated | امتحانات |
| Edge Functions أسئلة | — | — | — | — | **غير موجودة** في المستودع |

### تفريق الحالات

| الحالة | أمثلة |
|---|---|
| في migrations + types + UI | `questions`, junctions, exam RPCs |
| في types ومستخدم | `code` على questions/exam_templates |
| legacy/ضعيف الاستخدام | `questions.unit` (نص بلا FK) |
| متوقع في قالب رسمي مقترح وغير موجود في DB | Options table, Solutions, Stimuli, Rubrics, QuestionTargets, QuestionSets كجداول مستقلة |
| تطبيق جزئي للاستيراد | dry-run محلي/خادمي موجود؛ apply الذري الكامل لبنك مطبّع **غير مبني** |

---

## C. تدقيق جدول `questions` — إجابات دقيقة

أعمدة الحالية (types `1420-1436` + migrations):

`id`, `code`, `question_text`, `question_type`, `options` (Json), `correct_index`, `explanation`, `lesson_id`, `subject_id`, `unit` (text), `semester`, `year`, `sort_order`, `created_at`

**لا يوجد `unit_id` على questions.**

| # | سؤال | الجواب |
|---|---|---|
| 1 | هل `options` مصدر حقيقة الخيارات؟ | **نعم حالياً** — JSONB إلزامي؛ الواجهة تقرأه مباشرة (practice/exams/admin). |
| 2 | هل `correct_index` مستخدم في التصحيح؟ | **نعم على الخادم** — كل RPCs التصحيح تقارن `selected_index = correct_index`. الواجهة تعرضه فقط بعد reveal. |
| 3 | هل توجد أسئلة بلا خيارات؟ | schema يفرض `options JSONB NOT NULL`؛ النموذج التشغيلي = MCQ بمصفوفة. لا دعم أسئلة بلا خيارات في DB. |
| 4 | أكثر من إجابة صحيحة؟ | **لا** — `correct_index INT` مفرد. |
| 5 | ربط بوحدة دون درس؟ | **جزئياً فقط عبر نص `unit` أو عبر دروس الوحدة**. لا FK `unit_id`. تدريب الوحدة يجلب عبر `lessons.unit_id` ثم `questions.lesson_id IN (…)`. |
| 6 | ربط بالمادة مباشرة؟ | **نعم** — `subject_id` اختياري؛ سياسات SELECT تدعم مسار subject-only. |
| 7 | سؤال مشترك بين دروس/وحدات؟ | **عبر junctions** (`assessment_questions`, `exam_template_questions`) يمكن إعادة استخدام `question_id`. الحقل `lesson_id` على السؤال نفسه مفرد (رابط «أساسي» فعلي ضعيف التوثيق). |
| 8 | مقالية وحلول؟ | **لا جدول حلول/rubric**. فقط `explanation` نصي بعد الكشف. لا SHORT_TEXT/LONG_TEXT محرَّك. |
| 9 | متى يظهر `explanation`؟ | بعد `check_lesson_question` / `grade_lesson_quiz`؛ في الامتحانات عبر `get_exam_session_state` فقط عندما `reveal=true` (بعد تسليم). |
| 10 | قراءة مباشرة قد تكشف الإجابة؟ | **محميّة بـ column grants** (`20260731120000_…:30-50`). العميل لا يملك SELECT على `correct_index`/`explanation`. الخطر المتبقي: أي GRANT جدولي لاحق، أو RPC formative يكشف فوراً (`check_lesson_question`) — مقصود للدرس. |
| 11 | أثر تعديل الجدول؟ | يكسر: quiz درس، practice وحدة، exams training/strict، admin questions، import 09، اختبارات الأمن الثابتة. |
| 12 | أعمدة `code` (IMPORT-SYSTEM-02)؟ | **موجودة** على `questions` (+ templates أخرى) ومستخدمة كمفتاح استيراد/`question_code` في dry-run وpreflight. |

### استخدام الواجهة (أدلة)

| مسار | السلوك | مرجع |
|---|---|---|
| درس — جلب أسئلة | RPC بدون مفتاح | `lessons.$lessonId.tsx` ~182-183 |
| درس — بعد إجابة | RPC يكشف | نفس الملف ~694-703 |
| تدريب وحدة | SELECT آمن بلا correct/explanation | `units.$unitId.practice.tsx:225-228` |
| امتحان | state + redact عميل | `exam-client-safety.ts`, exams.*.tsx |
| إدارة | تجنب select للإجابات في القوائم | `admin.questions.tsx:131-133` |

---

## D. نقاط القوة

1. فصل عمودي حقيقي لمفتاح الإجابة عن PostgREST.
2. محاكي الاختبارات بوابة `reveal` على مستوى الجلسة.
3. إعادة استخدام السؤال عبر junctions (assessments/exams).
4. `code` + dry-run + preflight محلي لمسار الاستيراد.
5. RLS + `can_access_lesson` / `can_access_subject` لحدود الصف/المنهج.
6. اختبارات أمنية ثابتة ضد ارتداد grants.

## E. الفجوات

1. لا جداول Options/Solutions/Targets/Stimuli/Rubrics/Media-for-questions.
2. نوع السؤال التشغيلي ≈ MCQ فقط (`question_type` تسمية فضفاضة، افتراضي `'lesson'`).
3. لا multi-correct / numeric tolerance / matching.
4. لا ربط رسمي متعدد الأهداف مع «أساسي واحد».
5. `questions.unit` نص legacy بلا سلامة مرجعية.
6. استيراد apply الذري الكامل للبنك المطبّع غير موجود؛ dry-run أقوى من apply.
7. تعريف مكرر لـ `import_jobs` في migrations.
8. قوالب Excel العربية الرسمية المطلوبة في المهمة **غير موجودة** في المستودع.
9. لا Edge Functions للاستيراد/التصحيح في هذا الريبو.

## F. التعارضات / المخاطر

| مخاطرة | المستوى | ملاحظة |
|---|---|---|
| مصدر حقيقة واحد اليوم = JSON + correct_index | متوسط | أي تطبيع بلا طبقة توافق يكسر RPCs |
| `check_lesson_question` يكشف فوراً | منخفض/مقصود | لا يُخلط مع سياسة الامتحان الصارم |
| ظهور `options` للطالب | مقبول لـ MCQ | لا يصلح لتخزين `is_correct` داخل JSON لاحقاً دون حجب |
| ازدواج SoT أثناء انتقال سيئ | عالٍ إن نُفّذ بلا sync | يجب قرار sync أحادي الاتجاه |
| كسر exams عند حذف correct_index مبكراً | عالٍ | التقاعد آخر حزمة فقط |

---

## G. سيناريوهات التحقق النظري (ملخص)

| # | سيناريو | الوضع الحالي |
|---|---|---|
| 1 | MCQ قديم JSON | **مدعوم** — المسار الأساسي |
| 2 | متعدد صحيح | **غير مدعوم** |
| 3 | مقالي + rubric | **غير مدعوم** |
| 4 | رقمي + tolerance | **غير مدعوم** |
| 5 | مرتبط بدرس | **مدعوم** |
| 6 | وحدة دون درس | **ضعيف** — عبر دروس الوحدة أو نص unit |
| 7 | مشترك بين دروس | **عبر junctions** فقط |
| 8 | بصورة | وسائط الدرس منفصلة؛ لا media للسؤال |
| 9 | Stimulus مشترك | **غير موجود** |
| 10 | اختبار درس مرتب | **مدعوم** (assessment_questions.sort_order) |
| 11 | عشوائي | **غير واضح/غير مركزي** في RPC |
| 12 | إعادة استيراد بنفس code | مقصود عبر `code` — يعتمد على apply |
| 13 | تعديل بـ question_code | مصمم في الاستيراد؛ يحتاج apply |
| 14 | فشل جزئي apply | يحتاج معاملة ذرية (غير مكتملة) |
| 15 | طالب يقرأ الإجابة قبل التسليم | **مرفوض** على PostgREST؛ exams gated |
| 16 | غير مخول يستورد | staff/admin على import UI |
| 17 | واجهة قديمة أثناء انتقال | ممكنة فقط مع compatibility layer |

---

## H. القرار التمهيدي (يُفصَّل في وثيقة التصميم)

البنية الحالية **حية ومعتمدة تشغيلياً** على `options` + `correct_index` + RPCs.
التوصية: **`NORMALIZED_WITH_COMPATIBILITY_LAYER`** — لا استبدال فوري ولا تمديد JSON فقط لكل متطلبات القالب الرسمي.

انظر:

- `docs/QUESTION-BANK-OFFICIAL-DESIGN-01.md`
- `docs/QUESTION-BANK-TEMPLATE-COMPATIBILITY-MATRIX-01.md`
- `docs/QUESTION-BANK-IMPLEMENTATION-PLAN-01.md`
