# CURRICULUM_MASTER_DATA_RESET_AND_ADMIN_CRUD_12C

```text
Status : IN PROGRESS
12C.1 Audit    : DONE (below)
12C.2 Snapshot : DONE — /mnt/documents/reset-12c-snapshot/snapshot-12c.json
                 taken_at = 2026-08-13T22:16:56Z (before any write)
```

## 12C.1 — Audit البيانات الحالية

### أ. المواد (30)

| المجموعة | العدد | الأصل | الحكم |
| --- | --- | --- | --- |
| `*-grade-11-all` (quran, islamic, arabic, english, math, physics, chemistry, biology, computer) | 9 | بذرة بناء 2026-06-14 | TO_DELETE |
| `*-grade-12-all` (quran, islamic, arabic, english, math, chemistry, biology) | 7 | بذرة بناء 2026-06-14 | TO_DELETE |
| `math-g1-sanaa-grade-10-sanaa`, `physics-g3-sanaa-grade-12-sanaa` | 2 | بذرة بناء 2026-06-06 | TO_DELETE |
| `QA_C01_C02_SUBJECT` | 1 | QA صريحة («اختبار QA لا تستخدم») | TO_DELETE |
| مواد بلا `code` وبـ slug عربي مولّد (`اللغة-العربية-grqkki` … `المجتمع-اليمني-e3fwfc`) | 11 | أُنشئت يدوياً 2026-07-23/24 أثناء البناء | TO_DELETE |
| **الإجمالي** | **30** | | **30/30 TO_DELETE** |

المواد الـ11 بلا `code` تستحق تنبيهاً: هي دليل مباشر على أن الإنشاء اليدوي الحالي لا يفرض كوداً ثابتاً — وهذا ما تصلحه 12C.3.

### ب. باقي المحتوى

| جدول | العدد | الحكم |
| --- | --- | --- |
| `units` | 6 | TO_DELETE (كلها تحت مواد TO_DELETE) |
| `lessons` | 10 | TO_DELETE |
| `lesson_book_contents` | 6 | TO_DELETE |
| `lesson_summaries` | 6 | TO_DELETE |
| `lesson_explanations` / `lesson_resources` / `lesson_assessments` / `assessment_questions` | 0 | لا شيء |
| `questions` | 14 | TO_DELETE |
| `question_revisions` / `question_targets` / `question_options` / `question_media` | 0 | لا شيء |
| `exam_templates` | 4 | TO_DELETE (كلها `QA_C01_C02_*`) |
| `exam_template_questions` | 6 | TO_DELETE (روابط بين أسئلة QA وقوالب QA) |

### ج. الأسئلة الـ14 — الحكم مبني على أدلة لا على التقادم

- 10 أسئلة بأكواد `Q-000001…Q-000010` من 2026-06-06 (بذرة بناء: «ناتج 3 + 5 × 2»، «قانون نيوتن الثاني»).
- 4 أسئلة `QA_C01_C02_*` من 2026-06-26، مرتبطة بقوالب QA عبر `exam_template_questions`.
- **صفر** نسخ منشورة: `current_published_revision_id IS NULL` لكل الأسئلة الـ14.
- **صفر** ارتباط بـ `assessment_questions`.

الرابط الوحيد هو داخل مجموعة QA نفسها → تُحذف المجموعة كاملة معاً.

### د. صفر نشاط طالب (الدليل الحاسم)

```text
user_progress 0   exam_sessions 0   practice_attempts 0
unit_practice_attempts 0   practice_attempt_responses 0
certificates 0   student_points 0   student_badges 0
lesson_comments 0   subscriptions 0   weekly_schedule 0
```

لا يوجد أي كيان محتوى مرتبط بنشاط طالب أو باشتراك. الحذف لا يُفقد شيئاً حقيقياً.

### هـ. TO_KEEP

```text
grades 3            (grade-10, grade-11, grade-12)     مرجعي
curriculum_tracks 3 (sanaa, aden, other)               مرجعي
governorates 22                                        مرجعي
profiles 18                                            مستخدمون حقيقيون — لا يُمس
import_jobs 6 + import_staging_rows 51                 سجل تدقيق الاستيراد
audit_logs                                             سجل تدقيق
payment_methods / subscription_plans / wallet_*         تشغيلي — خارج النطاق
```

### و. BLOCKED_BY_REFERENCE

```text
(لا يوجد)
```

## بوابة التنظيف — النتيجة المطلوبة قبل 12C.5

```text
DEMO SUBJECTS TO DELETE      30/30
DEMO UNITS TO DELETE           6/6
DEMO LESSONS TO DELETE       10/10
DEMO BOOK CONTENTS            6/6
DEMO LESSON SUMMARIES         6/6
DEMO QUESTIONS               14/14
EXAM TEMPLATES TO DELETE       4/4
EXAM TEMPLATE QUESTIONS        6/6
PROTECTED USER DATA          0 affected
PUBLISHED QB REVISIONS       0 affected
STUDENT ACTIVITY             0 affected
BLOCKED_BY_REFERENCE         0
```

## 12C.2 — Snapshot

`/mnt/documents/reset-12c-snapshot/snapshot-12c.json` — لقطة كاملة (صفوف كاملة، لا عدّادات فقط) لـ:
`subjects, units, lessons, lesson_book_contents, lesson_summaries, questions,
exam_templates, exam_template_questions, grades, curriculum_tracks, governorates`.

أُخذت قبل أي كتابة، وتسمح بإعادة بناء أي صف محذوف حرفياً.

## 12C.5 — Controlled cleanup (DONE, 2026-08-13T23:0xZ)

نُفِّذ حصراً عبر `admin_curriculum_delete` من جلسة Full Admin حقيقية
(`msorori201201@gmail.com`)، مع `admin_curriculum_delete_preview` قبل كل كيان.
لم يُستخدم أي SQL حذف مباشر.

إصلاحان في الدوال قبل التنفيذ (كانا يُفشلان كل معاينة):
- `exam_session_questions` / `practice_attempt_questions` → العمود الصحيح `logical_question_id`
  (وأُضيف فحص `exam_session_answers`).
- أبناء النسخة (`question_options/media/solutions/accepted_answers`) مرتبطون بـ
  `question_revision_id` وليس `question_id` — صُحِّح في المعاينة والحذف معاً.

```text
exam_template            4/4   (+ exam_template_questions 6 كأثر تابع)
question                14/14
lesson                  10/10
unit                      6/6
subject                 30/30
blocked / archived        0
```

## 12C.6 — Clean baseline verify = PASS

```text
subjects 0   units 0   lessons 0   lesson_book_contents 0   lesson_summaries 0
lesson_explanations 0   lesson_resources 0   lesson_assessments 0
assessment_questions 0   questions 0   question_revisions 0   question_targets 0
question_options 0   exam_templates 0   exam_template_questions 0

profiles 18   grades 3   curriculum_tracks 3   governorates 22   (unchanged)
import_jobs 6 retained   audit_logs 72 (منها 64 curriculum_hard_delete)
student activity affected 0   stuck applying jobs 0
```

اختبار واجهة الطالب على الحالات الفارغة (`/app`, `/semesters`, `/grades`,
`/exams/history`, `/progress`, `/admin/curriculum`): لا 500، لا مسار مكسور،
لا تحميل لانهائي، console errors = 0.

## 12C.7 — Official templates = PASS

```text
public/content-import-templates = official (9 قوالب أُعيد توليدها)
public/import-templates         = not operational / not shown
                                  (بقي كـ labels للسجل فقط، وأُزيل رابط التنزيل)
admin UI                        = official package only
template-contract-sync-12a      23/23 PASS
import-contract-final-01        11/11 PASS
typecheck                       PASS
```

## النتيجة

```text
CURRICULUM_MASTER_DATA_RESET_AND_ADMIN_CRUD_12C = PASS
DATABASE CURRICULUM BASELINE = CLEAN
ADMIN CURRICULUM CRUD = READY
OFFICIAL IMPORT TEMPLATES = READY
FIRST_REAL_CONTENT_BATCH_12 = GO
```

