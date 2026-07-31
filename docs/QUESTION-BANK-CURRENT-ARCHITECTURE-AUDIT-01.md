# QUESTION-BANK-CURRENT-ARCHITECTURE-AUDIT-01

تدقيق البنية الفعلية لنظام الأسئلة والحلول + أدلة ملفات Excel الفعلية — بدون Migration أو كتابة إنتاج.

| حقل | قيمة |
|---|---|
| التاريخ | 2026-07-31 |
| المستودع | `msorori-mh/tas-heel-8e64d405` |
| فرع التوثيق (آخر تجميد) | `docs/qb-01-design-freeze-source-only-07` |
| **Runtime architecture baseline audited** | `9d6eb603fead085f8fa86f29647a8c5e51cab2af` |
| **Documentation on main (PR #46 merge)** | `6e35245ed73eb4c3c8ea76a2c010d8e4d7b0348c` |
| **Design freeze** | `docs/QB-01-DESIGN-FREEZE-DECISION-07.md` |
| Migration مطبّقة في هذه المهمة | **NO** |
| كتابة إنتاج | **ZERO** |

---

## A. حالة Runtime (ملخص ثابت)

المستودع التشغيلي على GitHub (Lovable + وكلاء). لا Edge Functions تحت `supabase/functions/`.

آخر migrations ذات الصلة: إنشاء `questions` (JSONB `options` + `correct_index`)، `unit` text، assessments/exams RPCs، column grants على `correct_index`/`explanation`، `questions.code`، `import_jobs`.

### أعمدة `questions` الحالية (types)

`id`, `code`, `question_text`, `question_type`, `options` (Json), `correct_index`, `explanation`, `lesson_id`, `subject_id`, `unit` (text), `semester`, `year`, `sort_order`, `created_at` — **لا `unit_id`**.

### حقائق تشغيلية مثبتة

| الادعاء | الدليل | النتيجة |
|---|---|---|
| `options` مصدر حقيقة الخيارات حالياً | types + UI practice/exams | VERIFIED |
| `correct_index` للتصحيح الخادمي | RPCs grade/check/exam | VERIFIED |
| حجب الإجابة عن PostgREST | `20260731120000_…` column grants | VERIFIED |
| exam reveal بعد التسليم | `get_exam_session_state` `v_reveal` | VERIFIED |
| dry-run التشغيلي `correct_index` **1-based (1–6)** | `content-import-validators.ts:96-117` | VERIFIED |
| Runtime DB/UI/RPC `correct_index` **0-based** | UI `=== i`؛ RPC equality بلا ±1؛ `selected_index` يسمح 0 | **LOCKED** (Design Freeze 07) |
| تحويل الاستيراد | Excel 1-based → option_code → sync cache 0-based | **LOCKED** — ممنوع صامت |
| قوالب المحتوى 01–09 في الريبو | `public/content-import-templates/` | VERIFIED |
| محاولات بلا revision/snapshot | `exam_session_answers` = question_id+selected_index فقط | VERIFIED — Model A مطلوب بعد القطع |

---

## B. ملفات Excel المرجعية (تحليل مستقل)

> مصدر القراءة: نسخة محلية للمراجعة فقط (ليست مساراً رسمياً دائماً داخل Git).
> **لم تُنسَخ ملفات Excel إلى المستودع.**

| الملف | الحجم | SHA-256 | المخطط المكتشف |
|---|---:|---|---|
| `حل اسئله الدرس الاول -للتجربه.xlsx` | 15548 | `8c26a1647d552bf5929b3f026b247437ddfbea2d251df30adc3851c3fd379484` | **teacher_flat_ar_v0** |
| `قالب_لاستيراد_أسئلة_الثانوية.xlsx` | 12239 | `f6e2fbf9f106260f91cdac206ed392cf6f18688255affc6b879f92f7c10b113d` | **official_flat_v0** |
| `نموذج_استيراد_الاسئله_للتجربة_فقط (2).xlsx` | 12117 | `981a834eecdbd66f522962237184be7787708896d26de140a1bf2b072765366d` | **legacy_flat_15col** |

ملفات بأسماء `القالب_الرسمي_الموحد_…v1` / `نموذج_تطبيقي_موحد_…v1`: **ما زالت غير موجودة** كعيّنات.
`official_normalized_v1` = **تصميم مستهدف فقط** (لا عيّنة Excel بعد).

### B.1 teacher_flat_ar_v0

| Observed fact | Inferred requirement | Owner decision | Deferred |
|---|---|---|---|
| ورقة واحدة `ورقة2`، أبعاد 19×29، **18** صف بيانات | محول معلم عربي مسطّح | اعتماد كـ adapter | — |
| 29 عموداً بما فيها `correct_answer`, `acceptable_answers`, `explanation`, `hint`, `allow_partial`, `status` | دعم نصي/مقالي + تلميح/شرح | P0 SHORT/LONG | Rubric كامل |
| **لا عمود `question_code`** | توليد/رفض عند الاستيراد الرسمي | رفض في الرسمي؛ Legacy adapter قد يولّد بقرار | — |
| `question_type`: مقالي≈16، إكمال فراغ≈1، وصف مزاح بنوع «لغويات» (ليس اختياراً نظيفاً) | P0: LONG_TEXT / SHORT_TEXT / SINGLE_CHOICE | نعم | 26 نوعاً |
| `unit` رقمي `1`؛ `lesson` نص عربي «الأول» | Resolve غير فريد بالرقم وحده | unit_code أو (grade+semester+subject+unit_number) | — |
| `status` = «متاح» (ومع صف واحد status فارغ/None) | ليس DRAFT/READY_FOR_REVIEW | رفض أو تحويل Legacy بتحذير فقط | — |
| قيم `-` بكثافة في خيارات/وسائط (empty_like≈180) | تطبيع إلى NULL | نعم في adapters | — |
| صفوف خيارات `-` مع أسئلة مقالية | ليست MCQ | grading_mode MANUAL/AUTO_TEXT | — |

### B.2 official_flat_v0

| Observed fact | Inferred requirement | Owner decision | Deferred |
|---|---|---|---|
| أوراق: `Questions`, `Media`, `QuestionTypes` | قالب متعدد الأوراق | نعم | — |
| `Questions` 4×32، **3** صفوف عيّنة؛ `id` رقمي 1001–1003 | IDs يدوية مرفوضة رسمياً | **رفض** id يدوي؛ إلزام `question_code` | — |
| `status=Published` في العيّنة | نشر من Excel خطر | **رفض Published** عند الإدخال | — |
| أنواع عيّنة: MCQ / PARSE / FILL | taxonomy تعليمي ≠ interaction_type | فصل الاسم/التفاعل/التصحيح | PARSE كدلالة فوق LONG/SHORT |
| ورقة `QuestionTypes` = **26** نوعاً؛ **لا Data Validation** على Questions | القائمة مرجع تعليمي لا عقد إطلاق | لا تُثبَّت 26 في CHECK | أغلبها مؤجل |
| `correct_answer` = `B` أو نص؛ `answer_data` = `{}` | لا تعتمد answer_data على المستخدم | option_code / accepted_answers | — |
| `Media`: `question_id,file_type,file_name` (صف واحد) | وسائط بالسؤال | media_code + storage_path | Stimulus مشترك |

### B.3 legacy_flat_15col

| Observed fact | Inferred requirement | Owner decision | Deferred |
|---|---|---|---|
| ورقة 12×15؛ **10** صفوف بيانات؛ الصف 12 فارغ بالكامل | تجاهل الصف الفارغ | نعم | — |
| أعمدة: `option_1..4`, `correct_index`, `context_text`, `question_image`, `lesson_code`, `is_repeated`, `topic` | أقرب للتشغيل الحالي | adapter legacy | — |
| `correct_index` ∈ {1,2,3} للـ mcq و«فارغ» للمقالي | **1-based** في العيّنة | تحويل صريح إلى option_code ثم cache **0-based** | — |
| `lesson_code` مثل `L_PHY_01` | مرجع درس رسمي | إلزامي للـ LESSON | — |
| `فارغ` في context/options/image/index | تطبيع NULL | نعم | — |
| صور: `mitochondria.png`, `yemen_strait_map.png` | requires_media | P0 media | — |
| `is_repeated` 0/1 | مشتق لا SoT | DERIVED | — |

---

## C. Actual Excel Evidence and Data Quality Findings

1. **اختلاف المخططات الثلاثة** — لا يمكن محول واحد صامت.
2. **غياب `question_code`** في ملف المعلم؛ IDs رقمية في official_flat_v0.
3. **حالات نشر غير مقبولة عند الإدخال:** `Published` / `متاح`.
4. **قيم فراغ نصية:** `-` و`فارغ` يجب تطبيعها؛ ليست إجابات.
5. **صف فارغ أخير** في legacy يجب تجاهله؛ صف status=None في المعلم يحتاج رفض/إصلاح.
6. **مراجع وحدة/درس ضعيفة:** رقم وحدة أو اسم عربي دون نطاق كامل → ambiguous.
7. **وسائط وسياق:** `context_text` / `question_image` / ورقة Media مستخدمة فعلياً → ليست اختياراً نظرياً.
8. **تمثيل الإجابة:** حرف خيار (`B`) vs `correct_index` vs نص نموذجي vs `acceptable_answers`.
9. **26 نوعاً في قائمة** دون validation ودون عيّنات كافية → لا تُفرض كـ P0.
10. **فجوة 1-based Excel vs 0-based Runtime** — **مغلقة تصميماً** في Freeze 07 (تحويل صريح عبر option_code؛ cache 0-based).

---

## D. نقاط قوة / فجوات Runtime (مختصر)

**قوة:** column grants؛ exam reveal؛ junctions لإعادة الاستخدام؛ `code` + dry-run 1-based موثّق.

**فجوات:** لا جداول options/solutions/targets/media/accepted_answers؛ لا versioning منشور؛ لا مسار تصحيح يدوي؛ apply الذري للبنك المطبّع غير مكتمل؛ `questions.unit` نص legacy.

---

## E. سيناريوهات موسّعة (انظر خطة التنفيذ للتفاصيل)

مقالي + model answer؛ SHORT + accepted؛ جزئي؛ صورة؛ stimulus نصي؛ بلا code؛ Published؛ صف مزاح؛ فارغ؛ correct_index 1-based/غامض؛ وحدة برقم؛ درس عربي مكرر؛ تعديل منشور مستخدم؛ revision؛ مراجع يقرأ فقط؛ طالب يقرأ مبكراً؛ تغيير درجة مع audit؛ فشل وسائط؛ ضعف اتصال.

---

## F. القرار التمهيدي → تجميد تنفيذي

`NORMALIZED_WITH_COMPATIBILITY_LAYER` + **QB-01 Design Freeze 07**:

- Revision-scoped children
- Attempt pinning Model A
- Legacy cache `correct_index` = 0-based
- Capabilities على `is_content_staff` دون enum reviewer

تطبيق Migration ما زال محظوراً حتى حزمة executable منفصلة.

انظر:

- `docs/QB-01-DESIGN-FREEZE-DECISION-07.md`
- `docs/QUESTION-BANK-OFFICIAL-DESIGN-01.md`
- `docs/QUESTION-BANK-TEMPLATE-COMPATIBILITY-MATRIX-01.md`
- `docs/QUESTION-BANK-IMPLEMENTATION-PLAN-01.md`
- `docs/migration-drafts/QUESTION-BANK-SCHEMA-FOUNDATION-01.NOT_APPLIED.sql`
