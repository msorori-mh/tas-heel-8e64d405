# QA-RESIDUE-CLEANUP-PREFLIGHT-01

- **الغرض:** تجهيز خطة تنظيف بقايا QA **بدون حذف فعلي**
- **التاريخ:** 2026-07-31
- **main SHA عند الإعداد:** `19f0bc46e9ac71d2b39cfb482e01cd377807eb85`
- **الحالة:** PREFLIGHT ONLY — لا SQL write، لا حذف، لا import، لا deploy

---

## 1. بقايا QA المعروفة

من جرد CONTENT-DATA-READINESS-AUDIT-01 (PR #33) ولقطة #37:

| المعرف الظاهر | الوصف |
|---|---|
| `QA_C01_C02_FREE_UNIT` | وحدة بعنوان تقريباً: «QA_C01_C02_FREE_UNIT — اختبار QA لا تستخدم» |
| `QA_C01_C02_PAID_UNIT` | وحدة بعنوان تقريباً: «QA_C01_C02_PAID_UNIT — اختبار QA لا تستخدم» |
| أي اسم يحتوي | `اختبار QA لا تستخدم` و/أو `QA_` |
| مادة QA مرتبطة | مذكورة سابقاً كـ subject id يبدأ بـ `b40d2dd5…` — **أكد بالـ SELECT قبل أي حذف** |

قاعدة المطابقة المقترحة (read-only):
- `title/name ILIKE '%QA_%'`
- أو `ILIKE '%اختبار QA لا تستخدم%'`
- أو `ILIKE '%QA_C01_C02%'`

---

## 2. الجداول المحتمل ارتباطها

| جدول | لمسه في التنظيف؟ | ملاحظة |
|---|---|---|
| `subjects` | نعم إن كانت مادة QA | أصل السلسلة |
| `units` | نعم | البقايا المؤكدة حياً سابقاً |
| `lessons` | نعم إن وُجدت تحت وحدات QA | |
| `questions` | نعم إن مربوطة بدرس/مادة QA | `ON DELETE RESTRICT` من بعض روابط القوالب |
| `exam_templates` | نعم إن قوالب QA | |
| `exam_template_questions` | نعم أولاً | روابط القوالب |
| `exam_sessions` | نعم إن وُجدت على قوالب QA | قبل حذف القوالب (`ON DELETE RESTRICT` على template) |
| `exam_session_answers` | نعم مع الجلسات | |
| `unit_practice_attempts` | نعم إن مرتبطة بوحدات QA | |
| `user_progress` | نعم إن دروس QA | لا يوجد جدول باسم `lesson_progress` — استخدم `user_progress` |
| `lesson_resources` / `lesson_book_contents` / `lesson_summaries` / `lesson_simulations` / `lesson_explanations` / `lesson_assessments` / `assessment_questions` | نعم إن دروس QA | غالباً CASCADE من lessons |
| `wallets` / `wallet_*` / `payment_*` / `subscriptions` | **لا تُمس مطلقاً** | خارج النطاق |
| `profiles` / `auth` / `storage` | **لا تُمس** | خارج النطاق |

---

## 3. SQL read-only للتحقق

شغّل بحساب admin/service في SQL editor **SELECT فقط**. لا تنسخ مسودات DELETE إلا بعد موافقة المالك.

```sql
-- QA-RESIDUE-CLEANUP-PREFLIGHT-01 — READ ONLY COUNTS
-- Safe: SELECT only. Do not modify.

-- 3.1 عدّ المواد QA
SELECT count(*) AS qa_subjects
FROM public.subjects s
WHERE s.name ILIKE '%QA_%'
   OR s.name ILIKE '%اختبار QA لا تستخدم%'
   OR s.name ILIKE '%QA_C01_C02%';

-- 3.2 عدّ الوحدات QA
SELECT count(*) AS qa_units
FROM public.units u
WHERE u.title ILIKE '%QA_%'
   OR u.title ILIKE '%اختبار QA لا تستخدم%'
   OR u.title ILIKE '%QA_C01_C02%';

-- 3.3 عدّ الدروس تحت وحدات/مواد QA
SELECT count(*) AS qa_lessons
FROM public.lessons l
WHERE l.title ILIKE '%QA_%'
   OR l.title ILIKE '%اختبار QA لا تستخدم%'
   OR l.unit_id IN (
        SELECT id FROM public.units u
        WHERE u.title ILIKE '%QA_%'
           OR u.title ILIKE '%اختبار QA لا تستخدم%'
           OR u.title ILIKE '%QA_C01_C02%'
      )
   OR l.subject_id IN (
        SELECT id FROM public.subjects s
        WHERE s.name ILIKE '%QA_%'
           OR s.name ILIKE '%اختبار QA لا تستخدم%'
           OR s.name ILIKE '%QA_C01_C02%'
      );

-- 3.4 عدّ الأسئلة المرتبطة بـ QA
SELECT count(*) AS qa_questions
FROM public.questions q
WHERE q.lesson_id IN (
        SELECT l.id FROM public.lessons l
        WHERE l.unit_id IN (
          SELECT id FROM public.units u
          WHERE u.title ILIKE '%QA_%' OR u.title ILIKE '%اختبار QA لا تستخدم%' OR u.title ILIKE '%QA_C01_C02%'
        )
        OR l.subject_id IN (
          SELECT id FROM public.subjects s
          WHERE s.name ILIKE '%QA_%' OR s.name ILIKE '%اختبار QA لا تستخدم%' OR s.name ILIKE '%QA_C01_C02%'
        )
      )
   OR q.subject_id IN (
        SELECT id FROM public.subjects s
        WHERE s.name ILIKE '%QA_%' OR s.name ILIKE '%اختبار QA لا تستخدم%' OR s.name ILIKE '%QA_C01_C02%'
      );

-- 3.5 عدّ قوالب الاختبار QA (بالعنوان أو subject)
SELECT count(*) AS qa_exam_templates
FROM public.exam_templates t
WHERE t.title ILIKE '%QA_%'
   OR t.title ILIKE '%اختبار QA لا تستخدم%'
   OR t.subject_id IN (
        SELECT id FROM public.subjects s
        WHERE s.name ILIKE '%QA_%' OR s.name ILIKE '%اختبار QA لا تستخدم%' OR s.name ILIKE '%QA_C01_C02%'
      );

-- 3.6 الروابط التابعة (أمثلة)
SELECT count(*) AS qa_exam_template_questions
FROM public.exam_template_questions etq
WHERE etq.template_id IN (
  SELECT t.id FROM public.exam_templates t
  WHERE t.title ILIKE '%QA_%'
     OR t.title ILIKE '%اختبار QA لا تستخدم%'
     OR t.subject_id IN (
          SELECT id FROM public.subjects s
          WHERE s.name ILIKE '%QA_%' OR s.name ILIKE '%اختبار QA لا تستخدم%' OR s.name ILIKE '%QA_C01_C02%'
        )
);

SELECT count(*) AS qa_exam_sessions
FROM public.exam_sessions es
WHERE es.template_id IN (
  SELECT t.id FROM public.exam_templates t
  WHERE t.title ILIKE '%QA_%'
     OR t.title ILIKE '%اختبار QA لا تستخدم%'
     OR t.subject_id IN (
          SELECT id FROM public.subjects s
          WHERE s.name ILIKE '%QA_%' OR s.name ILIKE '%اختبار QA لا تستخدم%' OR s.name ILIKE '%QA_C01_C02%'
        )
);

SELECT count(*) AS qa_unit_practice_attempts
FROM public.unit_practice_attempts upa
WHERE upa.unit_id IN (
  SELECT id FROM public.units u
  WHERE u.title ILIKE '%QA_%' OR u.title ILIKE '%اختبار QA لا تستخدم%' OR u.title ILIKE '%QA_C01_C02%'
);

SELECT count(*) AS qa_user_progress
FROM public.user_progress up
WHERE up.lesson_id IN (
  SELECT l.id FROM public.lessons l
  WHERE l.unit_id IN (
    SELECT id FROM public.units u
    WHERE u.title ILIKE '%QA_%' OR u.title ILIKE '%اختبار QA لا تستخدم%' OR u.title ILIKE '%QA_C01_C02%'
  )
);

-- 3.7 قائمة تعريفية قبل أي قرار حذف
SELECT 'subject' AS kind, s.id::text, s.name AS label
FROM public.subjects s
WHERE s.name ILIKE '%QA_%' OR s.name ILIKE '%اختبار QA لا تستخدم%' OR s.name ILIKE '%QA_C01_C02%'
UNION ALL
SELECT 'unit', u.id::text, u.title
FROM public.units u
WHERE u.title ILIKE '%QA_%' OR u.title ILIKE '%اختبار QA لا تستخدم%' OR u.title ILIKE '%QA_C01_C02%'
UNION ALL
SELECT 'lesson', l.id::text, l.title
FROM public.lessons l
WHERE l.title ILIKE '%QA_%' OR l.title ILIKE '%اختبار QA لا تستخدم%'
   OR l.unit_id IN (
        SELECT id FROM public.units u
        WHERE u.title ILIKE '%QA_%' OR u.title ILIKE '%اختبار QA لا تستخدم%' OR u.title ILIKE '%QA_C01_C02%'
      )
ORDER BY 1, 3;
```

---

## 4. SQL cleanup draft — DO NOT RUN WITHOUT OWNER APPROVAL

```sql
-- ============================================================
-- DO NOT RUN WITHOUT OWNER APPROVAL
-- QA-RESIDUE-CLEANUP-PREFLIGHT-01 — DRAFT ONLY
-- Scope: delete ONLY rows matched by explicit QA predicates.
-- Forbidden: wallets / payments / subscriptions / auth / storage.
-- Run inside a transaction; verify counts; COMMIT only after owner OK.
-- ============================================================

BEGIN;

-- 0) Freeze candidate IDs (review these result sets before DELETE)
CREATE TEMP TABLE qa_subject_ids AS
SELECT id FROM public.subjects
WHERE name ILIKE '%QA_%' OR name ILIKE '%اختبار QA لا تستخدم%' OR name ILIKE '%QA_C01_C02%';

CREATE TEMP TABLE qa_unit_ids AS
SELECT id FROM public.units
WHERE title ILIKE '%QA_%' OR title ILIKE '%اختبار QA لا تستخدم%' OR title ILIKE '%QA_C01_C02%'
   OR subject_id IN (SELECT id FROM qa_subject_ids);

CREATE TEMP TABLE qa_lesson_ids AS
SELECT id FROM public.lessons
WHERE unit_id IN (SELECT id FROM qa_unit_ids)
   OR subject_id IN (SELECT id FROM qa_subject_ids)
   OR title ILIKE '%QA_%' OR title ILIKE '%اختبار QA لا تستخدم%';

CREATE TEMP TABLE qa_template_ids AS
SELECT id FROM public.exam_templates
WHERE subject_id IN (SELECT id FROM qa_subject_ids)
   OR title ILIKE '%QA_%' OR title ILIKE '%اختبار QA لا تستخدم%';

CREATE TEMP TABLE qa_question_ids AS
SELECT id FROM public.questions
WHERE lesson_id IN (SELECT id FROM qa_lesson_ids)
   OR subject_id IN (SELECT id FROM qa_subject_ids);

-- SAFETY GATE: abort if candidate sets look too large / include real content
-- Owner must manually inspect SELECT * FROM qa_*_ids before proceeding.
-- Example hard stop if unexpected volume:
-- DO $$ BEGIN
--   IF (SELECT count(*) FROM qa_unit_ids) > 10 THEN
--     RAISE EXCEPTION 'QA candidate volume unexpected — abort';
--   END IF;
-- END $$;

-- 1) Exam link/session residue first
DELETE FROM public.exam_session_answers
WHERE session_id IN (
  SELECT id FROM public.exam_sessions WHERE template_id IN (SELECT id FROM qa_template_ids)
);

DELETE FROM public.exam_sessions
WHERE template_id IN (SELECT id FROM qa_template_ids);

DELETE FROM public.exam_template_questions
WHERE template_id IN (SELECT id FROM qa_template_ids)
   OR question_id IN (SELECT id FROM qa_question_ids);

DELETE FROM public.exam_templates
WHERE id IN (SELECT id FROM qa_template_ids);

-- 2) Progress / practice tied to QA lessons/units
DELETE FROM public.user_progress
WHERE lesson_id IN (SELECT id FROM qa_lesson_ids);

DELETE FROM public.unit_practice_attempts
WHERE unit_id IN (SELECT id FROM qa_unit_ids)
   OR subject_id IN (SELECT id FROM qa_subject_ids);

-- 3) Questions (after template links removed — RESTRICT safe)
DELETE FROM public.questions
WHERE id IN (SELECT id FROM qa_question_ids);

-- 4) Lessons (child lesson_* tables often CASCADE)
DELETE FROM public.lessons
WHERE id IN (SELECT id FROM qa_lesson_ids);

-- 5) Units
DELETE FROM public.units
WHERE id IN (SELECT id FROM qa_unit_ids);

-- 6) QA subjects last
DELETE FROM public.subjects
WHERE id IN (SELECT id FROM qa_subject_ids);

-- VERIFY (still inside transaction): real content counts must be unchanged
-- SELECT count(*) FROM public.units WHERE title NOT ILIKE '%QA_%';
-- SELECT count(*) FROM public.subjects WHERE name NOT ILIKE '%QA_%';

-- OWNER DECISION:
ROLLBACK;   -- default for preflight rehearsal
-- COMMIT;  -- only after explicit owner approval + verification
```

---

## 5. ترتيب التنظيف الآمن

1. جمع ومراجعة IDs المرشحة (read-only)
2. روابط الاختبارات: `exam_template_questions`
3. جلسات/إجابات اختبار QA: `exam_session_answers` → `exam_sessions` → `exam_templates`
4. تقدم/تدريب: `user_progress` → `unit_practice_attempts`
5. الأسئلة: `questions`
6. الدروس وملحقاتها: `lessons` (+ CASCADE للموارد إن وُجد)
7. الوحدات: `units`
8. المواد QA: `subjects`
9. إعادة SELECT للتأكد أن المحتوى الحقيقي لم يُمس
10. **لا تلمس** wallets / payments / subscriptions

---

## 6. المخاطر

| المخاطرة | التخفيف |
|---|---|
| حذف محتوى حقيقي بالخطأ | مطابقة ضيقة + TEMP ID tables + سقف عدّ + مراجعة يدوية للقائمة |
| كسر FK | الترتيب أعلاه؛ احذف روابط RESTRICT قبل الأسئلة/القوالب |
| تقدم طالب على تجارب QA | احذف `user_progress` / `unit_practice_attempts` / `exam_sessions` أولاً |
| ILIKE واسع جداً | راجع كل صف مرشح؛ لا تعتمد على `%QA%` وحده إن ظهرت أسماء حقيقية |
| لمس مالية | محظور صراحة — لا تدرج جداول wallet/payment |

---

## 7. تأكيد الامتثال لهذه المهمة

| بند | الحالة |
|---|---|
| حذف شيء | **لا** |
| SQL write منفّذ | **لا** |
| import | **لا** |
| deploy | **لا** |
| migration apply | **لا** |
| تعديل Auth/Storage/Payment | **لا** |

**القرار التالي للمالك فقط:** بعد مراجعة أعداد read-only، الموافقة الصريحة على تشغيل مسودة التنظيف (أو رفضها).
