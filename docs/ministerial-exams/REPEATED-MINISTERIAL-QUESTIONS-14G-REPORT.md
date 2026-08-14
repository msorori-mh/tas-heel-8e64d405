# REPEATED_MINISTERIAL_QUESTIONS_14G — تقرير التنفيذ

الحالة: **جاهز للتطبيق (Pending Apply)** — الترحيل ما زال في `supabase/migrations-pending/`.

## 1. النطاق الحاكم

```
Repeated Analytics Scope = subject_id + curriculum_track_id
Identity (V1)            = canonical question_id
```

طالب صنعاء لا يرى تكرارات نماذج عدن، والعكس — حتى لو كانت نفس المادة ونفس السؤال.

## 2. الملفات

| الملف | الدور |
| --- | --- |
| `supabase/migrations-pending/20260815020000_ministerial_analytics_14f_14g.sql` | `list_repeated_ministerial_subjects()` + `list_repeated_ministerial_questions()` |
| `src/lib/ministerial/ministerial-analytics-api.ts` | استدعاء الـRPCs |
| `src/routes/_authenticated/ministerial-exams.repeated.index.tsx` | قائمة المواد التي فيها تكرار |
| `src/routes/_authenticated/ministerial-exams.repeated.$subjectId.tsx` | «السؤال X تكرر 5 مرات» + [افتح أحدث نموذج] [راجع الدرس] |
| `tests/import/fixtures/pg17-ministerial-analytics-14fg-smoke.sql` | بذور + تأكيدات |

## 3. الهوية والظهور

- **الهوية** هي `question_id` القانوني: نفس السؤال ولو تغيّرت صياغته بين سنة وأخرى يُعدّ تكرارًا واحدًا.
- **كل ظهور يحتفظ بنسخته المثبتة** `ministerial_exam_questions.published_revision_id`، فقائمة `occurrences` تعرض النموذج والسنة والدور مع نسخة ذلك العام بالذات.
- **نص العرض** يأتي من نسخة واحدة حتمية: أحدث سنة، ثم أحدث `published_at`، ثم `model_id` — حتى لا يتغير الترتيب بين نداءين.
- `occurrence_count` = عدد النماذج المميزة (`count(DISTINCT model_id)`) وليس عدد الصفوف.
- **رابط الدرس** مشتق من `question_targets` المرتبطة بنسخة العرض، فيعمل زر «راجع الدرس» على الدرس الحالي للطالب.
- المرشّحات: حد أدنى للتكرار (`>= 2` دائمًا كحد أدنى صلب) وسنة بداية اختيارية.

## 4. الحماية

- `SECURITY DEFINER` + `SET search_path = public, pg_temp`؛ `REVOKE` من `PUBLIC`/`anon`؛ `GRANT` لـ`authenticated`.
- `auth.uid()` مطلوب؛ المسار الدراسي مأخوذ من ملف الطالب لا من معامل واردة.
- بوابة إضافية `public.can_access_subject()` على المادة المطلوبة.
- تُقرأ النماذج المنشورة غير المؤرشفة فقط (`status = 'published' AND archived_at IS NULL`).
- المخرجات تحتوي نص السؤال والمثير فقط — **لا خيارات، ولا إجابة صحيحة، ولا حل، ولا `is_correct`**. مراجعة السؤال كاملًا تمر عبر مسار حل النموذج المحمي في 14D/14E.

## 5. نتيجة البروفة

```
bash tests/import/run-pg17-ministerial-analytics-14fg-rehearsal.sh
RESULT: 14F/14G REHEARSAL = PASS   (24/24 assertions)
```

من ضمنها لـ14G: اكتشاف السؤال المتكرر داخل مسار عدن (2021 R3 + 2024 R1)، عدم ظهوره لطالب صنعاء، `occurrence_count = 2` بعدد النماذج، احتفاظ كل ظهور بنسخة سنته (نسختان مختلفتان)، حتمية نسخة العرض (أحدث سنة)، قائمة السنوات، ظهور رابط الدرس، احترام حد التكرار ومرشّح السنة، تجميع المواد، خلوّ المخرجات من مفاتيح الإجابة، ورفض `anon`.

## 6. لا بيانات تجريبية

لا `INSERT` في الترحيل؛ البذور محصورة في البروفة المعزولة.
