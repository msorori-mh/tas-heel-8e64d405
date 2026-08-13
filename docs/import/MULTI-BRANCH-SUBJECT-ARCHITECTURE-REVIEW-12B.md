# MULTI_BRANCH_SUBJECT_ARCHITECTURE_REVIEW_12B — قرار معماري معتمد

```text
ARCHITECTURE            : SUBJECT_AS_BRANCH
GROUPING KEY            : (grade, curriculum_track, group_code)
group_code              : optional, display/report only
legacy subject hierarchy: unchanged
subject_branches table  : NOT CREATED
Status                  : APPROVED_WITH_GUARDS (2026-08-13)
Migration               : deferred — بعد FIRST_REAL_CONTENT_BATCH_12 = PASS
```

## 1. الحالة الفعلية في القاعدة (مفحوصة)

- `units.subject_id` NOT NULL، ولا يوجد `parent_id` في `units` — لا تداخل بين الوحدات.
- `lessons.subject_id` NOT NULL و`lessons.unit_id` NULL-able.
- لا يوجد أي مستوى Branch في الـ schema ولا في `src/lib/import/import-contract.ts`.

| الشكل الهرمي | مدعوم اليوم |
| --- | --- |
| Subject → Unit → Lesson | نعم |
| Subject → Lesson | نعم (`unit_id = NULL`) |
| Subject → Branch → Unit → Lesson | لا (يُمثَّل بـ Subject لكل فرع) |
| Subject → Branch → Lesson | لا (يُمثَّل بـ Subject لكل فرع) |

## 2. الجواب على السؤال المعماري

المناهج الحقيقية تحتاج **فرعاً منطقياً**، لا **جدولاً جديداً**.

اللغة العربية في الثانوية اليمنية تُدرَّس ككتب مستقلة (النحو والصرف، البلاغة، الأدب والنصوص،
المطالعة/القراءة)، والتربية الإسلامية كذلك (القرآن والتلاوة، التفسير، الحديث، الفقه، العقيدة).
كل فرع حاوية تعليمية كاملة: وحدات + دروس + محتوى + تقييمات + أسئلة + تقدّم.
وهذه بالضبط خصائص `subjects`. لذلك الفرع = Subject.

```text
اللغة العربية (group_code = arabic)
├─ arabic-nahw-grade-12-sanaa
├─ arabic-balagha-grade-12-sanaa
├─ arabic-adab-grade-12-sanaa
└─ arabic-reading-grade-12-sanaa
```

الأسباب:

1. كل منطق المنصة مربوط بـ `subject_id`: RLS، `can_access_subject`، `user_progress`،
   الاشتراك، قوالب الامتحانات، `question_targets`. مستوى رابع يعيد فتح ما أُغلق في 11A و12A.
2. الفرع يحمل نفس أبعاد المادة (صف + مسار منهج + وحدات + دروس + تقييمات).
3. نظام الاستيراد كله (العقد، المفاتيح الطبيعية، `subject_code` في 04–07، اشتقاق الـ slug)
   يبقى دون أي تعديل — صفر ارتداد على 12A.

## 3. الضوابط الملزِمة على `group_code`

### 3.1 مفتاح التجميع مركّب — وليس `group_code` وحده

التجميع الصحيح هو:

```text
(grade, curriculum_track, group_code)
```

`arabic` للصف العاشر مسار صنعاء ≠ `arabic` للصف الثاني عشر مسار عدن.
أي تجميع في الواجهة أو التقارير يجب أن يستخدم المفتاح المركّب كاملاً.

### 3.2 قاعدة Validate إلزامية

```text
نفس (grade, curriculum_track, group_code) ⇒ نفس group_name
```

أي اختلاف في `group_name` داخل نفس المفتاح المركّب = رفض الملف في Validate
(`GROUP_NAME_CONFLICT`)، قبل أي Prepare.

### 3.3 `group_code` ليس صلاحية

يُمنع منعاً باتاً استخدامه في:

```text
RLS policies
can_access_subject
question_targets
assessment ↔ question binding
```

هذه تبقى على `subject_id` حصراً. استخدامه محصور في:

```text
UI grouping
navigation
report aggregation
```

## 4. ملاحظة تجارية (Entitlement) — مفتوحة، غير حاجزة

إذا بيعت «اللغة العربية كاملة» مستقبلاً، يجب ألا تتحول إلى أربعة اشتراكات.
القاعدة المستقبلية:

```text
Entitlement may cover: single subject OR subject group
```

لا تُحل الآن ولا تعطّل استيراد المحتوى؛ تُحسم قبل أي تسعير على مستوى المادة.

## 5. تصحيح شرط إعادة النظر في جدول Branch

الامتحان الموحّد أو الدرجة المجمّعة **ليسا** سبباً كافياً:

```text
Exam Template
├─ questions from arabic-nahw
├─ questions from arabic-balagha
├─ questions from arabic-adab
└─ questions from arabic-reading
```

قابل للتمثيل اليوم عبر `question_targets` + التجميع عبر `group_code`.

جدول `subject_branches` يُعاد النظر فيه فقط عند ظهور **سلوك فعلي لا يمكن تمثيله بمجموعة
Subjects** (مثل حالة تجعل الفرع كياناً ذا دورة حياة/صلاحية مستقلة عن المادة والاشتراك معاً).

## 6. خطة التنفيذ (مؤجلة عمداً)

| # | خطوة | التوقيت |
| --- | --- | --- |
| 1 | تثبيت هذا القرار وثائقياً | تم الآن |
| 2 | `FIRST_REAL_CONTENT_BATCH_12` لمادة بسيطة غير متفرعة | التالي — لا يحتاج `group_code` |
| 3 | ترحيل صغير: `subjects.group_code` / `subjects.group_name` (nullable) | بعد Batch 12 = PASS |
| 4 | عمود اختياري في القالب 01 + قاعدة Validate 3.2 | مع الخطوة 3 |
| 5 | تجميع بصري في واجهة الطالب | مع الخطوة 3 |
| 6 | أول مادة متفرعة (العربية) كتجربة محدودة | بعد الخطوة 5 |

## الحالة

```text
Import Engine                     COMPLETE
Official Templates                READY
Simple Subject Import             READY
Subject-as-Branch Architecture    APPROVED
Grouping Fields                   BEFORE FIRST BRANCHED SUBJECT
First Real Pilot                  NEXT
Arabic / Islamic Studies          AFTER GROUPING SUPPORT
```
