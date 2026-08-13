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

## الخطوات التالية (بالترتيب المعتمد)

```text
12C.4 group_code/group_name migration   ← مُفوَّض بعد 12C.1 + 12C.2
12C.3 Secured RPC CRUD + /admin/curriculum
12C.5 Cleanup عبر الواجهة الجديدة
12C.6 Verify clean baseline
12C.7 Regenerate templates + tests
```
