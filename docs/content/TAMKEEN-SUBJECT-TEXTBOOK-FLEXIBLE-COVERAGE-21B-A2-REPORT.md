# 21B-A2 — Subject Textbook Flexible Coverage (APPLIED)

## Product rule
كتب المنهج لها شكلان حقيقيان:
1. `FULL_ACADEMIC_YEAR` — كتاب واحد يغطي الفصلين (`semester IS NULL`).
2. `SEMESTER_SPECIFIC` — كتاب مرتبط بفصل واحد (`semester IN (1,2)`)، مثل القرآن الكريم.

`semester` بيانات نطاق (scope metadata) وليست هوية إلزامية.

## Schema (production)
- `coverage` (21B-A1) → removed. `coverage_type` (NOT NULL, default `FULL_ACADEMIC_YEAR`).
- `subject_textbooks_coverage_type_valid`: القيمتان فقط.
- `subject_textbooks_semester_valid`:
  `(FULL_ACADEMIC_YEAR AND semester IS NULL) OR (SEMESTER_SPECIFIC AND semester IS NOT NULL AND semester IN (1,2))`
  — صيغة `IS NOT NULL` صريحة لأن `semester IN (1,2)` مع NULL تعطي NULL وتمرّ من CHECK.
- Uniqueness: `(subject_id, COALESCE(track,'0..0'), storage_path, COALESCE(semester,0))`.
- Discovery index: `(subject_id, coverage_type, semester, sort_order)`.
- ACL: student = SELECT فقط، لا كتابة لـ `authenticated`، `anon` = ZERO.

## Local PG17 gate results
```
BASELINE_OK / UPGRADE=PASS / IDEMPOTENT=PASS
FULL_YEAR_INSERT_OK / SEMESTER_SPECIFIC_INSERT_OK / MULTI_BOOK_OK / TRACK_REUSE_OK
DENY: full-year+semester, semester-specific+NULL, semester=3, unknown coverage, duplicate scope
SEM1_COUNT=1 SEM2_COUNT=1 MATH_SEM1=3 MATH_SEM2=3 RLS=true COVERAGE_COLUMN_GONE=true
ROLLBACK=PASS / REPLAY_AFTER_ROLLBACK=PASS
```
Rollback ترتيبه إلزامي: إسقاط `subject_textbooks_subject_idx` قبل إسقاط عمود `coverage_type`.

## Code contract
- `src/lib/textbooks/subject-textbook.server.ts`: `TextbookCoverage`, `normalizeCoverage()`, حقول `coverageType/semester` في الربط والاستنساخ والقراءة.
- `src/lib/api/subject-textbook.functions.ts`: Zod يقبل `coverageType` + `semester (1|2|null)`.
- `src/components/admin/SubjectTextbooksManager.tsx`: اختيار نوع التغطية + حقل الفصل الظاهر شرطياً.
- `src/lib/textbooks/subject-textbook-client.ts` + `SubjectTextbooksSheet.tsx`: عرض كتب العام الكامل دائماً، وكتب الفصل في فصلها فقط.

## Data impact
`subject_textbooks` rows = 0 قبل وبعد التطبيق. لا تغيير في التخزين ولا في `lesson_resources`.
