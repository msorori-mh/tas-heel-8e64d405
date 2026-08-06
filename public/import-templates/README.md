# قوالب استيراد تمكين (Excel)

قوالب Excel الرسمية لاستيراد المحتوى التعليمي والإعدادات في تطبيق **تمكين**.

> **مهم:** الاستيراد الفعلي (رفع، معاينة، تنفيذ) **لم يُفعَّل بعد** في التطبيق. هذه المرحلة توفر القوالب فقط كأصول ثابتة (`/import-templates/*.xlsx`).

## ترتيب الاستخدام

ارفع/املأ القوالب **بهذا الترتيب** (كل ملف يعتمد على الأكواد في الملفات السابقة):

| # | الملف | الغرض |
|---|--------|--------|
| 01 | `01_curriculum_tracks_template.xlsx` | مسارات المناهج |
| 02 | `02_governorates_template.xlsx` | المحافظات |
| 03 | `03_governorate_curriculum_map_template.xlsx` | ربط المحافظات بالمناهج |
| 04 | `04_grades_template.xlsx` | الصفوف |
| 05 | `05_subjects_template.xlsx` | المواد |
| 06 | `06_units_template.xlsx` | الوحدات |
| 07 | `07_lessons_template.xlsx` | الدروس |
| 08 | `08_lesson_contents_template.xlsx` | محتوى الدروس (4 شيتات) |
| 09 | `09_questions_template.xlsx` | بنك الأسئلة |
| 10 | `10_exam_templates_template.xlsx` | قوالب الاختبارات + ربط الأسئلة |
| 11 | `11_subscription_plans_template.xlsx` | خطط الاشتراك |
| 12 | `12_payment_methods_template.xlsx` | وسائل الدفع |

## أعمدة `code` والربط

- **لا تستخدم UUIDs** في Excel — استخدم أكواداً نصية (`subject_code`, `unit_code`, `question_code`, …).
- أعمدة `code` في قاعدة البيانات تُستخدم لاحقاً للـ **upsert** ومنع التكرار:
  - `subjects.code`, `units.code`, `questions.code`, `exam_templates.code`
- الدروس تُربط عبر **`lesson_slug`** (عمود `lessons.slug`).

## قالب الأسئلة (حساس)

ملف `09_questions_template.xlsx` يحتوي أعمدة **للأدمن فقط**:

- `correct_index` — الإجابة الصحيحة (1-based)
- `explanation` — شرح الإجابة

هذه الأعمدة **لا تُعرض للطلاب** في التطبيق. لا ترفع هذا الملف إلا عبر مسار استيراد أدمن (سيُبنى لاحقاً).

## إعادة توليد القوالب

```bash
npm run generate:import-templates
```

يُحدّث الملفات في هذا المجلد من `scripts/generate-import-templates.ts`.

## قواعد عامة

- بيانات الأمثلة **تجريبية فقط** — ليست بيانات إنتاج.
- UTF-8؛ استخدم أرقاماً إنجليزية في الأعمدة الرقمية.
- `TRUE` / `FALSE` للقيم المنطقية.
- اجعل أعمدة النص/الأرقام الطويلة بصيغة **Text** في Excel لتفادي scientific notation.
- كل ملف `.xlsx` يتضمن شيت **README** داخلي يشرح الأعمدة.

## مراجع

- `docs/import-system-analysis.md` — التحليل الكامل لنظام الاستيراد
