# TAMKEEN-SUBJECT-TEXTBOOK-SCOPE-CORRECTION-21B-A1 — PRODUCTION APPLY

## G0 — PRE-APPLY LOCK
- HEAD_SHA = `e763a2c55138814d06b76487b10a35fdabdea59c`
- MIGRATION = `docs/migrations-pending/20260820010000_subject_textbook_scope_correction_21b_a1.sql`
- MIGRATION_SHA256 = `e13247b358cab61f2d9e70432451fce3cc11ddfc96f72248001df28a0c9da0c1`
- نفس النسخة المعتمدة (UPGRADE/IDEMPOTENT/FRESH/RLS/ROLLBACK = PASS) — طُبِّقت حرفياً بلا تعديل.

## G1 — BASELINE
- ROWS_BEFORE = 0
- لا كتب إنتاجية متأثرة.

## G2/G3 — SCHEMA VERIFY (بعد التطبيق)
- APPLY_RESULT = SUCCESS
- SEMESTER_IN_TEXTBOOK_IDENTITY = NO
- SEMESTER_IN_UNIQUE_CONSTRAINT = NO
  - `subject_textbooks_scope_path_uidx (subject_id, COALESCE(curriculum_track_id,'000…0'), storage_path)`
  - `subject_textbooks_subject_idx (subject_id, sort_order)`
- FULL_YEAR_TEXTBOOK_MODEL = YES (`coverage = 'FULL_ACADEMIC_YEAR'` + `CHECK (semester IS NULL)`)
- TRACK_BINDING = PASS (FK → curriculum_tracks, ON DELETE RESTRICT)
- SUBJECT_BINDING = PASS (FK → subjects, ON DELETE CASCADE)
- VERSIONING = PASS (`version`)
- SHA256_FIELD = PASS (`sha256` بقيد الشكل)
- ACTIVE_STATE = PASS (`is_active` + partial index)
- MULTI_BOOK_SUPPORT = PASS (تعدد الصفوف لنفس المادة عبر `storage_path` مختلف + `sort_order`)

## G4 — RLS / SECURITY
- RLS_ENABLED = YES
- ACL: `authenticated=r`, `service_role=arwdDxtm`, `anon = (none)`
- ANON_WRITE = ZERO، ANON_READ = ZERO
- STUDENT_WRITE = ZERO
- AUTHORIZED_STUDENT_READ = `is_active AND can_access_subject AND user_can_access_subject_curriculum AND (track IS NULL OR track = current_student_track_id())`
- CROSS_GRADE_ACCESS = DENY
- CROSS_TRACK_ACCESS = DENY
- لا توسعة صلاحيات ناتجة عن إزالة semester.

## G5 — OFFLINE CONTRACT
- DOWNLOAD_ONCE_FOR_BOTH_SEMESTERS = YES
- SAME_TEXTBOOK_ID_BOTH_SEMESTERS = YES
- SAME_STORAGE_OBJECT_BOTH_SEMESTERS = YES
- SAME_LOCAL_CACHE_KEY_BOTH_SEMESTERS = YES (`resourceId = textbook.id`)
- NO_DUPLICATE_LOCAL_BYTES = YES
- VERSION_UPDATE_APPLIES_TO_BOTH_SEMESTERS = YES

## G6 — ADMIN / STUDENT CONTRACT
- Admin: لا اختيار فصل عند الرفع (SubjectTextbooksManager).
- Student: تبويب الفصل الأول/الثاني يحيلان إلى نفس الكتاب (استعلام بالمادة فقط).
- DEPLOY = NO

## G7 — REGRESSION
- SUBJECT_TEXTBOOK_ROWS_AFTER = 0
- LESSON_RESOURCES_COUNT_UNCHANGED = YES (40)
- CURRENT_QURAN_LESSON = PASS (بلا مساس)
- STRUCTURED_READER = 31/31، FIGURES = 3/3، 18B = PASS (لا تغيير في الكود/البيانات)
- VISIBILITY_LOST = 0، UNINTENDED_VISIBILITY_GAINED = 0
- STORAGE_MUTATIONS = 0

## G8 — MIGRATION HISTORY
- MIGRATION_APPLIED = 1
- PRODUCTION_MIGRATION_HISTORY_UPDATED = YES
- ADDITIONAL_MIGRATIONS = 0
- MANUAL_SQL_REQUIRED = NO
- ملف pending أُزيل بعد التطبيق.

## G9 — NO DATA
- TEXTBOOK_ROWS_CREATED = 0
- STORAGE_OBJECTS_CREATED = 0

## BLOCKERS
- لا يوجد. (تحذيرات linter العامة موروثة وسابقة لهذه الترحيلة، ولا علاقة لها بجدول الكتب.)

PUBLISH = NO / DEPLOY = NO

## الحكم

TAMKEEN_SUBJECT_TEXTBOOK_SCOPE_CORRECTION_21B_A1_PRODUCTION_APPLY = PASS_READY_FOR_21B1_REAL_TEXTBOOK_E2E
