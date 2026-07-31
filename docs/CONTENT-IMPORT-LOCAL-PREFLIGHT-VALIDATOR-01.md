# CONTENT-IMPORT-LOCAL-PREFLIGHT-VALIDATOR-01 — فاحص حزمة المحتوى المحلي

> فحص **محلي offline** لملفات المحتوى **قبل** رفعها أو تشغيل dry-run على الخادم.
> قراءة فقط: يحلّل ملفات xlsx ولا يتصل بالإنتاج ولا ينفّذ أي import.

## أين يضع يوسف الملفات

ضع ملفات القوالب التسعة المعبّأة في مجلد واحد (مثال: `content-package-grade10/`)، مع الحفاظ على بادئة الترقيم في اسم كل ملف:

```
content-package-grade10/
  01_subjects_template.xlsx
  02_units_template.xlsx
  03_lessons_template.xlsx
  04_lesson_book_contents_template.xlsx
  05_lesson_explanations_template.xlsx
  06_lesson_resources_template.xlsx
  07_lesson_assessments_template.xlsx
  08_assessment_questions_template.xlsx
  09_questions_template.xlsx
```

(الاسم بعد البادئة `01_`…`09_` حر، لكن البادئة إلزامية للتعرف على القالب.)

## كيف يشغّل الفحص

من جذر المستودع:

```bash
npm run content:preflight -- content-package-grade10
# أو مباشرة:
node scripts/content-import/validate-content-package.mjs content-package-grade10
```

- خروج `0` = لا أخطاء مانعة (قد توجد تحذيرات).
- خروج `1` = أخطاء مانعة — **لا تنتقل إلى dry-run قبل إصلاحها**.

## الأخطاء المانعة (errors)

| الكود | المعنى |
|---|---|
| `DIR_NOT_FOUND` | المجلد غير موجود |
| `FILE_MISSING` | قالب من 01–09 غير موجود في المجلد |
| `DUPLICATE_TEMPLATE_FILE` | أكثر من ملف لنفس القالب |
| `PARSE_ERROR` | الملف ليس xlsx صالحاً |
| `MISSING_COLUMN` | عمود مطلوب غائب عن القالب |
| `EMPTY_FILE` | لا صفوف بيانات |
| `MISSING_VALUE` | حقل مطلوب فارغ في صف |
| `DUPLICATE_CODE` | تكرار `subject_code` / `unit_code` / `lesson_code` / `assessment_code` / `question_code` |
| `INVALID_RESOURCE_TYPE` | `resource_type` خارج: video \| mindmap \| experiment \| pdf \| link |
| `INVALID_CORRECT_INDEX` / `CORRECT_INDEX_NO_OPTION` | رقم إجابة غير صالح أو يشير لخيار فارغ |
| `UNKNOWN_REFERENCE` | ربط بكود غير معرّف (grade → subject → unit → lesson → question → assessment) |

## التحذيرات غير المانعة (warnings)

| الكود | المعنى | الإجراء |
|---|---|---|
| `EXTRA_FILE` | ملف xlsx لا يتبع تسمية القوالب | احذفه أو أعد تسميته |
| `LINK_SKIPPED` | تعذّر فحص ربط لغياب القالب المُشار إليه | أكمل الحزمة |
| `UNKNOWN_GRADE_SLUG` | `grade_slug` غير مألوف | القيم: grade-10 \| grade-11 \| grade-12 |
| `NONSTANDARD_SEPARATOR` | فاصل غير موحد (– — − ‐ ―) | حوّله إلى `" - "` |
| `NONSTANDARD_PARENT_SPELLING` | «الإسلامية - ...» | المعتمد: «التربية الإسلامية - ...» |
| `PARENT_SPELLING_MISMATCH` | هجاءان لنفس المادة الكبرى | وحّد الاسم حرفياً |

> تحذيرات التسمية لا توقف الفحص، لكنها **تكسر تجميع المواد في واجهة الطالب** — عاملها كأخطاء قبل dry-run.

## متى يُمنع الانتقال إلى dry-run؟

- أي خطأ (❌) ⇒ ممنوع. أصلح وأعد الفحص.
- PASS مع تحذيرات تسمية ⇒ ممنوع عملياً حتى تصفّرها.
- PASS نظيف أو بتحذيرات غير تسميّة مبررة ⇒ انتقل إلى dry-run على `/admin/import` وفق `docs/CONTENT-IMPORT-DRY-RUN-RUNBOOK-01.md`.

## العلاقة بـ dry-run الخادمي

الفاحص المحلي يغطي بنية الحزمة والربط بين الملفات والتسمية والأكواد. dry-run الخادمي (يحتاج حساب طاقم) يضيف تدقيق الأعمدة الكامل لكل قالب وحالة المراجعة. الترتيب الصحيح: **preflight محلي → إصلاح → dry-run خادمي → تسليم المالك**.
