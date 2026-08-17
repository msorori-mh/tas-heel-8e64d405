# TAMKEEN_SUBJECT_TEXTBOOK_DUAL_MODE_REAL_E2E_21B1 — GATE REPORT

الحالة: **BLOCKED_REAL_BOOK_FILES_REQUIRED** (لم تُنشأ أي بيانات أو كائنات تخزين)

## G0 — PRODUCTION BASELINE
```
CURRENT_HEAD_SHA=02b8b961
SUBJECT_TEXTBOOK_ROWS=0
CURRENT_STORAGE_OBJECTS_FOR_TEXTBOOKS=0
LESSON_RESOURCES=40
COVERAGE_CONTRACT=READY
  coverage_type CHECK IN ('FULL_ACADEMIC_YEAR','SEMESTER_SPECIFIC')
  semester CHECK (FULL_ACADEMIC_YEAR AND semester IS NULL)
                 OR (SEMESTER_SPECIFIC AND semester IS NOT NULL AND semester IN (1,2))
ACL: authenticated SELECT=true / INSERT=false ; anon SELECT=false  → STUDENT_WRITE=ZERO
```

## PART A — FULL ACADEMIC YEAR
```
FULL_YEAR_SUBJECT=—
FULL_YEAR_BOOK_SOURCE_CONFIRMED=NO
BLOCKED_FULL_YEAR_REAL_BOOK_REQUIRED
```
لم يُعثر على أي ملف PDF لكتاب منهج كامل في أي مصدر حقيقي متاح:
- مصادر المشروع المرفوعة: أرشيف واحد فقط (القرآن الكريم — أول ثانوي).
- التخزين الإنتاجي `lesson-pdfs`: كل الكائنات ملفات دروس مفردة (أكبر ملف 3.19MB).

لم يُستخدم أي ملف تجريبي، والتزاماً بالحدود لم يُرفع أي شيء.

## PART B — SEMESTER-SPECIFIC (القرآن الكريم)
تحليل الأرشيف الفعلي `القرآن_الكريم_للصف_الأول_الثانوي.zip`:
```
PDF_COUNT=40
NON_LESSON_FILES=0        ← لا يوجد ملف كتاب فصل واحد مجمّع
SEM1_FILES=21 (ملفات دروس) SEM2_FILES=19 (ملفات دروس)
MAX_FILE_MB=3.19  TOTAL_MB=65.57
```
المادة تنقسم فعلاً إلى فصلين (وهو ما يثبت صحة نمط `SEMESTER_SPECIFIC` منتجياً)،
لكن **الملفات المتاحة دروس مفردة وليست كتاب الفصل**. لذلك:
```
SEM1_TEXTBOOK_ID=—
SEM2_TEXTBOOK_ID=—
BLOCKED_SEMESTER_SPECIFIC_REAL_BOOK_REQUIRED
```

## CONTRACT-LEVEL VERIFICATION (بدون كتابة إنتاجية)
تم إثباته مسبقاً في 21B-A2 على PG17 محلي بنفس مخطط الإنتاج:
```
FULL_YEAR_INSERT_OK / SEMESTER_SPECIFIC_INSERT_OK / TRACK_REUSE_OK (نفس storage_path لمسارين)
DENY: full-year+semester, semester-specific+NULL, semester=3, unknown coverage, duplicate scope
SEM1_COUNT=1 SEM2_COUNT=1 (عزل الفصول)
FULL_YEAR ظاهر في الفصلين (MATH_SEM1=3 / MATH_SEM2=3)
```
واجهات الأدمن/الطالب محدثة في الكود:
- الأدمن: اختيار نوع التغطية + حقل الفصل يظهر شرطياً فقط مع `SEMESTER_SPECIFIC`.
- الطالب: استعلام الاكتشاف يعرض كتب العام الكامل في التبويبين، وكتب الفصل في فصلها فقط.
- التنزيل/الكاش يعتمد `textbookId + version` ⇒ كتاب العام الكامل مفتاح كاش واحد للفصلين،
  وكتابا الفصول مفتاحان مستقلان. (RUNTIME E2E غير مثبت — يحتاج ملفات حقيقية.)

## RESULT KEYS
```
FULL_YEAR_SUBJECT=—
FULL_YEAR_TEXTBOOK_ID=—
FULL_YEAR_BOTH_SEMESTERS=NOT_TESTED_NO_REAL_FILE
FULL_YEAR_DOWNLOAD_ONCE=NOT_TESTED_NO_REAL_FILE
FULL_YEAR_OFFLINE=NOT_TESTED_NO_REAL_FILE
SEMESTER_SPECIFIC_SUBJECT=القرآن الكريم (منقسم فعلياً لفصلين — بلا ملف كتاب)
SEM1_TEXTBOOK_ID=— / SEM2_TEXTBOOK_ID=—
SEMESTER_ISOLATION=CONTRACT_PASS / RUNTIME_PENDING
SEMESTER_CACHE_ISOLATION=CONTRACT_PASS / RUNTIME_PENDING
GOVERNORATE=مشتق آلياً (22 محافظة) — الطالب لا يختار المسار
DERIVED_TRACK=من المحافظة (مأرب/تعز ⇒ عدن) — بلا تغيير هذه الجولة
RLS=PASS (SELECT للطالب فقط، لا كتابة، anon محجوب)
CROSS_GRADE=NOT_TESTED_NO_ROWS
CROSS_TRACK=NOT_TESTED_NO_ROWS
LESSON_RESOURCES=40 (unchanged)
QURAN_REGRESSION=UNCHANGED (40 درساً، لا حذف لأي PDF قديم)
18B=UNCHANGED
VERSION_RUNTIME_E2E=PENDING_REAL_NEW_VERSION
TEXTBOOK_ROWS_CREATED=0
STORAGE_OBJECTS_CREATED=0
OTHER_SUBJECTS_CHANGED=0
```

## DEPLOY GATE
```
DEPLOY_REQUIRED=YES   (واجهة التغطية المرنة موجودة في preview وغير منشورة)
HEAD_SHA=02b8b961
CHANGED_FILES=(مطبقة مسبقاً في 21B-A2)
  src/lib/textbooks/subject-textbook.server.ts
  src/lib/api/subject-textbook.functions.ts
  src/lib/textbooks/subject-textbook-client.ts
  src/components/admin/SubjectTextbooksManager.tsx
  src/components/textbooks/SubjectTextbooksSheet.tsx
TYPECHECK=PASS
BUILD=PASS (preview build حالي)
SECURITY_REVIEW=NO_NEW_FINDINGS (لا Schema/RLS/RPC جديدة)
```
موقوف عند: `APPROVED_21B1_FLEXIBLE_TEXTBOOK_UI_DEPLOY`

## BLOCKERS
1. مطلوب ملف PDF لكتاب منهج **كامل للعام الدراسي** لمادة حقيقية (Part A).
2. مطلوب ملفا PDF لكتاب **الفصل الأول** و**الفصل الثاني** للقرآن (Part B).

## الحكم
```
TAMKEEN_SUBJECT_TEXTBOOK_DUAL_MODE_REAL_E2E_21B1 = BLOCKED_REAL_BOOK_FILES_REQUIRED
```
