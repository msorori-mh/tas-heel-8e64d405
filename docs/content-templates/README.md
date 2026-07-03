# نماذج تجهيز المحتوى — Content Prep Templates

> **الغرض:** تجهيز المحتوى من قبل فريق التحرير **قبل** تنفيذ Import System رسمي.  
> **غير مربوطة** بـ `public/import-templates/` أو لوحة admin import الحالية.

## كيفية الاستخدام

1. افتح الملف المناسب في Excel أو Google Sheets.
2. اقرأ شيت **«تعليمات»** أولاً.
3. عبّئ شيت البيانات — صف واحد مثال موجود مسبقاً.
4. احتفظ بالأكواد ثابتة ولا تغيّرها بعد الربط.

## ترتيب العمل المقترح

```
subjects → units → lessons → lesson_content → resources/videos/pdf
→ questions (quiz / bank / exam) → mind maps / lab simulations
→ curriculum_mapping (مرجع)
```

## ملفات الأسئلة

في `lesson_quiz_questions_template` و`question_bank_template` و`subject_exam_questions_template`:

> **⚠️** أعمدة «رقم الإجابة الصحيحة» و«شرح الإجابة» **للمحررين فقط** — لا تظهر للطلاب.

## إعادة التوليد

```bash
node scripts/generate-content-templates.mjs
```
