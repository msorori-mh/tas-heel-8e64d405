# POST-IMPORT-READONLY-VALIDATION-PACKAGE-01 — حزمة تحقق ما بعد الاستيراد (read-only)

> **الغرض:** التحقق أن المحتوى دخل قاعدة البيانات بشكل صحيح بعد أي import فعلي.
> **كل الاستعلامات هنا SELECT فقط — لا INSERT/UPDATE/DELETE/TRUNCATE.**
> **التشغيل:** المالك (أو من يفوّضه) عبر Supabase SQL Editor أو psql بصلاحية قراءة.
> **لم تُنفَّذ ولا تُنفَّذ من هذا المستودع — توثيق فقط.**

شغّل الأقسام بالترتيب. القاعدة: **أي نتيجة غير صفرية في أقسام 2 و4 = لا يُعلن نجاح الاستيراد.**

---

## 1. عدد الصفوف الرئيسي

```sql
SELECT
  (SELECT count(*) FROM grades)                  AS grades,
  (SELECT count(*) FROM curriculum_tracks)       AS curriculum_tracks,
  (SELECT count(*) FROM subjects)                AS subjects,
  (SELECT count(*) FROM units)                   AS units,
  (SELECT count(*) FROM lessons)                 AS lessons,
  (SELECT count(*) FROM questions)               AS questions,
  (SELECT count(*) FROM exam_templates)          AS exam_templates_all,
  (SELECT count(*) FROM exam_templates WHERE is_active) AS exam_templates_active,
  (SELECT count(*) FROM exam_template_questions) AS exam_template_questions;
```

المرجع المتوقع للصف الأول: subjects ≥ 8 (المواد المعتمدة)، والبقية بحسب ملفات يوسف.

---

## 2. مشاكل الربط (يجب أن تكون كلها صفراً)

```sql
-- 2أ. مواد بلا وحدات
SELECT s.id, s.name FROM subjects s
WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.subject_id = s.id)
ORDER BY s.sort_order;

-- 2ب. وحدات بلا دروس
SELECT u.id, u.title, u.subject_id FROM units u
WHERE NOT EXISTS (SELECT 1 FROM lessons l WHERE l.unit_id = u.id)
ORDER BY u.subject_id, u.sort_order;

-- 2ج. دروس بلا موارد (إن كان المحتوى يلزم مورداً لكل درس)
SELECT l.id, l.title FROM lessons l
WHERE NOT EXISTS (SELECT 1 FROM lesson_resources r WHERE r.lesson_id = l.id)
ORDER BY l.title;

-- 2د. دروس بلا أسئلة (تغطية التدريب — مراجعة وليست مانعة بالضرورة)
SELECT l.id, l.title FROM lessons l
WHERE NOT EXISTS (SELECT 1 FROM questions q WHERE q.lesson_id = l.id)
ORDER BY l.title;

-- 2هـ. أسئلة يتيمة (لا درس ولا مادة)
SELECT q.id, left(q.question_text, 60) AS question_preview
FROM questions q
WHERE q.lesson_id IS NULL AND q.subject_id IS NULL;

-- 2و. نماذج اختبار بلا أسئلة
SELECT t.id, t.title, t.is_active FROM exam_templates t
WHERE NOT EXISTS (
  SELECT 1 FROM exam_template_questions etq WHERE etq.template_id = t.id
);

-- 2ز. روابط نماذج تشير لأسئلة مفقودة (يجب ألا يحدث مع FK — تأكيد)
SELECT etq.id, etq.template_id, etq.question_id
FROM exam_template_questions etq
LEFT JOIN questions q ON q.id = etq.question_id
WHERE q.id IS NULL;
```

---

## 3. تقسيم المواد

```sql
-- 3أ. فواصل غير موحدة في أسماء المواد (يجب أن تكون صفراً)
SELECT id, name FROM subjects
WHERE name ~ '[‐‑‒–—―−]';

-- 3ب. الهجاء غير المعتمد «الإسلامية - ...» (يجب أن يكون صفراً)
SELECT id, name FROM subjects
WHERE name LIKE 'الإسلامية - %';

-- 3ج. هجاءات متعددة لنفس العائلة (راجع يدوياً — يجب ألا يظهر تكرار عائلة)
SELECT split_part(name, ' - ', 1) AS main_category, count(*)
FROM subjects
GROUP BY 1
ORDER BY 1;

-- 3د. المواد الثماني المعتمدة للصف الأول (يجب أن تظهر الثماني كلها)
SELECT name, sort_order, color, icon
FROM subjects
WHERE grade_id = (SELECT id FROM grades WHERE slug = 'grade-10')
  AND name IN (
    'التربية الإسلامية - القرآن الكريم وعلومه',
    'التربية الإسلامية - السيرة النبوية',
    'التربية الإسلامية - الفقه والحديث الشريف',
    'اللغة العربية - النحو والصرف',
    'اللغة العربية - القراءة والنصوص',
    'اللغة العربية - الأدب والبلاغة والنقد',
    'الاجتماعيات - التاريخ',
    'الاجتماعيات - الجغرافيا'
  )
ORDER BY sort_order;
```

القيم المرجعية: sort_order 1–8، الألوان #27ae60 / #2c3e50 / #d35400، icon = BookOpen
(`docs/SUBJECT-GROUPING-GRADE-10-YEMEN-CONTENT-GUIDE.md`).

---

## 4. بقايا QA (يجب أن تكون صفراً قبل إعلان الجاهزية)

```sql
SELECT 'subject' AS kind, id::text, name AS label FROM subjects WHERE name ILIKE '%QA\_%' ESCAPE '\'
UNION ALL SELECT 'unit', id::text, title FROM units WHERE title ILIKE '%QA\_%' ESCAPE '\'
UNION ALL SELECT 'lesson', id::text, title FROM lessons WHERE title ILIKE '%QA\_%' ESCAPE '\'
UNION ALL SELECT 'question', id::text, left(question_text, 60) FROM questions WHERE question_text ILIKE '%QA\_%' ESCAPE '\'
UNION ALL SELECT 'exam_template', id::text, title FROM exam_templates WHERE title ILIKE '%QA\_%' ESCAPE '\'
UNION ALL SELECT 'unit_named', id::text, title FROM units WHERE title LIKE '%اختبار QA لا تستخدم%'
UNION ALL SELECT 'subject_named', id::text, name FROM subjects WHERE name LIKE '%اختبار QA لا تستخدم%';
```

> المعروف حالياً قبل التنظيف: «QA_C01_C02_FREE_UNIT» و«QA_C01_C02_PAID_UNIT» — تنظيفها بموافقة المالك فقط.

---

## 5. حكم الجاهزية للإطلاق المحدود

```sql
-- 5أ. سلسلة كاملة واحدة على الأقل: grade → subject → unit → lesson → question → exam_template
SELECT g.slug AS grade, s.name AS subject, u.title AS unit, l.title AS lesson,
       t.title AS exam_template
FROM grades g
JOIN subjects s ON s.grade_id = g.id
JOIN units u ON u.subject_id = s.id
JOIN lessons l ON l.unit_id = u.id
JOIN questions q ON q.lesson_id = l.id
JOIN exam_templates t ON t.is_active
JOIN exam_template_questions etq ON etq.template_id = t.id
LIMIT 5;

-- 5ب. نموذجا اختبار نشطان على الأقل (تدريبي + صارم) للإطلاق المحدود
SELECT mode, count(*) FROM exam_templates WHERE is_active GROUP BY mode;
```

### معايير الإعلان

- [ ] قسم 2 كل نتائجه صفرية (باستثناء 2د مراجعة يدوية).
- [ ] قسم 3: صفر فواصل غير موحدة، صفر «الإسلامية -»، الثماني مواد حاضرة بالقيم المعتمدة.
- [ ] قسم 4: صفر بقايا QA.
- [ ] قسم 5أ: صف واحد على الأقل يربط السلسلة كاملة.
- [ ] قسم 5ب: نموذج تدريبي واحد + نموذج صارم واحد نشطان على الأقل.

إن تحقق كل ذلك ⇒ المحتوى جاهز لـ **smoke الطالب** (`docs/STUDENT-LIMITED-RELEASE-SMOKE-PACKAGE-01.md`).
