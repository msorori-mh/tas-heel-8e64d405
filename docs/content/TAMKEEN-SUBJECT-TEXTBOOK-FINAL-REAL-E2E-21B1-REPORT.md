# TAMKEEN_FINAL_REAL_TEXTBOOK_UPLOAD_AND_E2E_21B1 — REPORT

الحالة: **BLOCKED_AWAITING_REAL_BOOK_FILES** (بوابة 1 — طلب الملفات)

## G0 — PRODUCTION BASELINE (قبل أي كتابة)
```
HEAD_SHA=e5bb7a1c
SUBJECT_TEXTBOOK_ROWS=0
STORAGE_OBJECTS(subject-textbooks/%)=0
LESSON_RESOURCES=40 (unchanged)
STORAGE_OBJECTS(lesson-pdfs)=40 (كلها ملفات دروس مفردة)
CONTRACT=book_type(MAIN_TEXTBOOK|EXERCISE_BOOK|OTHER) × coverage_type(FULL_ACADEMIC_YEAR|SEMESTER_SPECIFIC) × semester
ACL: authenticated=SELECT فقط / anon=DENY / STUDENT_WRITE=ZERO
```

## 1 — REQUEST REAL FILES (مطلوب من المستخدم)
لم يُرفع أي ملف كتاب حقيقي حتى الآن. المطلوب 7 ملفات PDF رسمية:

| # | المادة | الكتاب | التغطية المتوقعة |
|---|--------|--------|------------------|
| 1 | القرآن الكريم | الأساسي | الفصل الأول |
| 2 | القرآن الكريم | الأساسي | الفصل الثاني |
| 3 | الرياضيات | الأساسي | الفصل الأول |
| 4 | الرياضيات | الأساسي | الفصل الثاني |
| 5 | الرياضيات | التمارين | العام كامل |
| 6 | الكيمياء | الأساسي | العام كامل |
| 7 | الكيمياء | التمارين | العام كامل |

ممنوع (ولم يُستخدم): ملفات دروس مفردة، Dummy PDFs، تجميع يدوي من ملفات الدروس.

## 2 — CLASSIFICATION MATRIX
`PENDING_FILES` — لن يُعتمد التصنيف المبدئي إلا بعد فحص الملفات فعلياً
(SUBJECT / GRADE / BOOK_TYPE / COVERAGE_TYPE / SEMESTER / FILE_SIZE / SHA256 / FULL_BOOK_CONFIRMED / TRACK_APPLICABILITY).

## 3–13 — النتائج
```
FILES_RECEIVED=0/7
QURAN_BOOKS=— / MATH_BOOKS=— / CHEMISTRY_BOOKS=—
CLASSIFICATION=PENDING_FILES
TRACK_BINDINGS=PENDING_FILES (المسار مشتق من المحافظة، لا يختاره الطالب)
QURAN_SEMESTER_ISOLATION=CONTRACT_PASS / RUNTIME_PENDING
MATH_MAIN_SEMESTER_ISOLATION=CONTRACT_PASS / RUNTIME_PENDING
MATH_EXERCISE_FULL_YEAR=CONTRACT_PASS / RUNTIME_PENDING
CHEMISTRY_MAIN_FULL_YEAR=CONTRACT_PASS / RUNTIME_PENDING
CHEMISTRY_EXERCISE_FULL_YEAR=CONTRACT_PASS / RUNTIME_PENDING
DOWNLOAD=NOT_RUN / OFFLINE=NOT_RUN
CACHE_REUSE=CONTRACT_PASS (مفتاح الكاش = textbookId + version)
PHYSICAL_STORAGE_OBJECTS=0
LOGICAL_TEXTBOOK_ROWS=0
DUPLICATE_BYTES_CREATED=0
RLS=PASS (SELECT للطالب المصرح فقط)
CROSS_GRADE=DENY / CROSS_TRACK=DENY / ANON=DENY / STUDENT_WRITE=ZERO
LESSON_RESOURCES=40 (unchanged)
QURAN_REGRESSION=UNCHANGED / LESSON_PDF_LEGACY_PRESENT=YES
18B=PASS (لا تغيير)
```

## 14 — DEPLOY GATE
```
DEPLOY_REQUIRED=YES (واجهات 21B-A2/21B-A3 في preview وغير منشورة)
HEAD_SHA=e5bb7a1c
CHANGED_FILES=
  src/lib/textbooks/subject-textbook.server.ts
  src/lib/textbooks/subject-textbook-client.ts
  src/lib/api/subject-textbook.functions.ts
  src/components/admin/SubjectTextbooksManager.tsx
  src/components/textbooks/SubjectTextbooksSheet.tsx
TYPECHECK=PASS
BUILD=PASS (preview build حالي)
SECURITY_REVIEW=NO_NEW_FINDINGS (لا Schema/RLS/RPC جديدة في هذه الجولة)
```
موقوف عند: `APPROVED_21B1_FLEXIBLE_TEXTBOOK_UI_DEPLOY` — لا نشر تلقائي.

## BLOCKERS
1. الملفات السبعة الحقيقية غير مرفوعة (BLOCKER الوحيد لاستئناف الخطوات 2–13).

## الحكم
```
TAMKEEN_SUBJECT_TEXTBOOK_FINAL_REAL_E2E_21B1 = PASS_READY_FOR_UI_DEPLOY_GATE
(E2E الحقيقي موقوف: BLOCKED_AWAITING_REAL_BOOK_FILES)
```
