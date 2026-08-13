# CURRICULUM_MASTER_DATA_RESET_AND_ADMIN_CRUD_12C

```text
CURRENT CURRICULUM DATA = DEMO / DISPOSABLE
FIRST_REAL_BATCH_12     = HOLD UNTIL CLEAN MASTER DATA
```

## الجرد الفعلي للقاعدة (مقروء الآن، وليس تقديراً)

| جدول | العدد | التصنيف |
| --- | --- | --- |
| `subjects` | 30 | مرشّح للحذف (Demo) |
| `units` | 6 | مرشّح للحذف |
| `lessons` | 10 | مرشّح للحذف |
| `lesson_book_contents` | 6 | مرشّح للحذف |
| `lesson_explanations` / `lesson_resources` / `lesson_assessments` / `assessment_questions` | 0 / 0 / 0 / 0 | فارغة أصلاً |
| `questions` | 14 | مرشّح للحذف (الأسئلة الـ14 القديمة) |
| `question_revisions` / `question_targets` | 0 / 0 | فارغة |
| `exam_templates` | 4 | يجب فحص ارتباطها بالأسئلة الـ14 قبل الحذف |
| `user_progress` / `exam_sessions` / `practice_attempts` / `unit_practice_attempts` / `certificates` | 0 | لا يوجد أي أثر طالب على المحتوى |
| `grades` / `curriculum_tracks` / `governorates` | 3 / 3 / 22 | مرجعي — يُراجع ويُبقى |
| `profiles` | 18 | مستخدمون حقيقيون — لا يُمس |
| `import_jobs` / `audit_logs` | 6 / — | سجل تدقيق — يُبقى |

نقطة حاسمة: كل جداول نشاط الطالب أصفار. أي حذف للمحتوى التجريبي **لا يُفقد أي تقدّم طالب**.

## الحالة الحالية لواجهة الإدارة (مفحوصة)

- توجد صفحات `/admin/subjects` و`/admin/units` و`/admin/lessons` مع نوافذ حذف.
- الحذف اليوم يتم **مباشرة من المتصفح عبر PostgREST**، و`SubjectDeleteDialog` يعدّ الأبناء ويمنع الحذف إذا كان هناك أي ابن — لا يوجد حذف متتالٍ ولا معاينة أثر كاملة ولا تسجيل في `audit_logs`.
- لا توجد صفحة `/admin/curriculum` شجرية.
- لا يوجد عمود `group_code` / `group_name` في `subjects`.

هذا بالضبط ما تعالجه 12C.

---

## 12C.1 — Audit البيانات التجريبية

تقرير مقروء في `docs/import/CURRICULUM-MASTER-DATA-RESET-12C.md` يصنف كل صف من الـ30 مادة والـ6 وحدات والـ10 دروس والـ14 سؤالاً: الكود، الاسم، الأصل (بذرة بناء / QA / e2e)، ووجود أي ارتباط خارجي (قوالب امتحانات، تقدّم، جلسات).

مخرج إلزامي: قائمة صريحة `TO_DELETE` وقائمة `TO_KEEP`. لا حذف قبل اعتمادك لهذه القائمة.

## 12C.2 — Snapshot قبل أي حذف

لقطة CSV منطقية كاملة لكل جدول محتوى إلى `/mnt/documents/reset-12c-snapshot/` + تسجيل العدّادات الأساسية. نفس أسلوب لقطة الدفعة 12 التي نجحت سابقاً.

## 12C.3 — Admin Curriculum CRUD (جوهر المرحلة)

صفحة جديدة `/admin/curriculum` تعرض الهرم كشجرة:

```text
الصف الثالث الثانوي
└── مسار صنعاء
    ├── اللغة العربية (مجموعة)
    │   ├── النحو والصرف   [+] [تعديل] [حذف] [عرض]
    │   └── البلاغة
    └── الفيزياء
        └── الوحدة 1
            └── الدرس 1 → محتوى / شروحات / موارد / تقييمات
```

لكل مستوى: إضافة، تعديل، حذف، عرض، واستيراد Excel للمستوى نفسه.

قواعد ملزمة:

1. **فصل الاسم عن الكود**: `name/title` قابل للتعديل دائماً. `subject_code` / `unit_code` / `lesson_code` / `assessment_code` تُعرض للقراءة فقط في شاشة التعديل. قابلة للتعيين مرة واحدة عند الإنشاء فقط.
2. **الحذف ليس PostgREST مباشراً**: يمر عبر RPC/Server Function واحدة محمية بـ Full Admin، ذرّية، ومسجّلة في `audit_logs`.
3. **معاينة أثر قبل الحذف**: RPC للقراءة فقط تُرجع العدّ الكامل للأبناء:

```text
المادة: الفيزياء
سيُحذف: 1 مادة، 4 وحدات، 23 درساً، 23 محتوى، 18 شرحاً،
        12 مورداً، 6 تقييمات، 85 مسودة سؤال
```

الحذف مرفوض دائماً (fail-closed) إذا وُجد: تقدّم طالب، جلسة امتحان، محاولة تدريب، شهادة، أو أي نسخة سؤال **منشورة**. هذه الحالة تتطلب أرشفة لا حذفاً.

4. **مصفوفة الصلاحيات**:

```text
Full Admin       : CRUD كامل + Hard delete + Import + Review + Publish
Content Manager  : Add/Edit + Import + Review — بلا hard delete
Reviewer         : Review فقط
Publisher        : Publish فقط
authenticated    : لا DELETE ولا UPDATE مباشر عبر PostgREST
```

سياسات RLS للكتابة على جداول المحتوى تُراجَع لتؤكد هذا الفصل.

## 12C.4 — دعم تجميع المواد المتفرعة (الآن، قبل البيانات الحقيقية)

ترحيل صغير:

```sql
subjects.group_code  text  null
subjects.group_name  text  null
```

+ عمودان اختياريان في القالب 01 + حقلان في شاشة إنشاء/تعديل المادة.

قاعدة Validate ملزمة من قرار 12B:

```text
نفس (grade, curriculum_track, group_code) ⇒ نفس group_name   وإلا رفض الملف
group_code ≠ صلاحية: ممنوع في RLS / can_access_subject / question_targets
```

الاستخدام: تجميع بصري في واجهة الطالب والإدارة والتقارير فقط.

## 12C.5 — التنظيف المُتحكَّم

يُنفَّذ عبر واجهة الحذف الجديدة نفسها (لا SQL يدوي)، بترتيب التبعية العكسي:

```text
assessment_questions → question_targets/revisions → questions
→ lesson_assessments → lesson_resources → lesson_explanations
→ lesson_book_contents → lessons → units → subjects
```

يُبقى دون مساس: `profiles`، الاشتراكات، المحفظة والمدفوعات، `import_jobs`، `audit_logs`، `grades`، `curriculum_tracks`، `governorates`.

`exam_templates` الأربعة: يُفحص ارتباطها بالأسئلة الـ14 أولاً؛ إن كانت قوالب بناء تجريبية تُحذف ضمن نفس التصنيف، وإلا تُعزل وتُذكر في التقرير.

## 12C.6 — التحقق من الأساس النظيف

```text
subjects = 0   units = 0   lessons = 0   content = 0
assessments = 0   questions = 0   QB revisions = 0
grades = 3   curriculum_tracks = 3   governorates = 22
profiles = 18 (بلا تغيير)   import_jobs = محفوظ   audit_logs = محفوظ + قيود الحذف
```

+ فحص طالب حقيقي: لا شاشة مكسورة بعد التفريغ (حالات القوائم الفارغة تعمل).

## 12C.7 — إعادة توليد القوالب الرسمية النظيفة

إعادة توليد `public/content-import-templates/` بعد إضافة عمودي التجميع، وإعادة تشغيل حارس `tests/import/template-contract-sync-12a.test.ts` + مجموعة الاستيراد كاملة.

---

## بوابة الخروج

```text
12C.1 Audit معتمد منك
12C.2 Snapshot محفوظ
12C.3 /admin/curriculum يعمل: CRUD + معاينة أثر + حذف ذرّي مسجّل
12C.4 group_code/group_name مطبّقان + Validate + منع استخدامهما في الصلاحيات
12C.5 حذف Demo فقط — صفر مساس ببيانات المستخدمين
12C.6 Baseline نظيف مُتحقق منه
12C.7 قوالب مُعاد توليدها + كل الاختبارات PASS
→ عندها فقط: FIRST_REAL_CONTENT_BATCH_12 = GO
```

## نقطة تحتاج قرارك أثناء التنفيذ

الحذف بعد بدء المحتوى الحقيقي: أقترح أن أي مادة/درس **مرتبط بتقدّم طالب** لا يُحذف أبداً بل يُؤرشَف (`is_active = false`). سأطبّق هذا المنع الآن داخل RPC الحذف ما لم توجّه بغير ذلك.

## ترتيب التنفيذ الفعلي

الترحيل (12C.4) يُطلب أولاً لأن أدوات الترحيل تتطلب موافقتك المنفصلة، ثم يُبنى فوقه CRUD والواجهة، ثم يجري التنظيف. لن يُحذف أي صف قبل اعتمادك لقائمة `TO_DELETE` في 12C.1.
