# TAMKEEN-SUBJECT-TEXTBOOKS-21B — PRODUCTION APPLY REPORT

التاريخ: 2026-08-17 (UTC)

## G0 — PRE-APPLY LOCK

- HEAD_SHA=ac826c5697c3577e818d814fb6be5e43a8b11e64
- MIGRATION=20260823010000_subject_textbooks_21b.sql
- MIGRATION_SHA256=be01d172c9d3cde668ce298226dd35edf4fe1781f8b088dee35b9ff690a0a68e
- الملف مطابق حرفياً للنسخة التي اجتازت: PG17_FRESH_APPLY=PASS / PG17_RERUN=PASS / PG17_RLS=PASS / PG17_ROLLBACK=PASS
- الدوال المطلوبة موجودة في الإنتاج قبل التطبيق: `can_access_subject`, `user_can_access_subject_curriculum`, `current_student_track_id`, `is_content_staff`, `update_updated_at_column`

## APPLY_RESULT

APPLY_RESULT=SUCCESS

## G1 — SCOPE

اقتصر التطبيق على نموذج `subject_textbooks` (جدول + قيود + فهارس + Triggers + RLS + GRANTs).
لم يُحذف أو يُعدَّل: `lesson_resources`، أي PDF قائم، Structured Lesson Content، 18B، Question Bank.

## G2 — SECURITY

- SUBJECT_TEXTBOOKS_TABLE=EXISTS
- RLS_ENABLED=YES (سياستا SELECT فقط، لا سياسات كتابة إطلاقاً → fail-closed)
- ANON_WRITE=ZERO (وanon SELECT=DENY أيضاً)
- STUDENT_WRITE=ZERO — ملاحظة: بعد التطبيق الأول أظهر الفحص أن `authenticated` ورث INSERT/UPDATE/DELETE من Default Privileges على schema `public` (الكتابة كانت محجوبة بالـ RLS أصلاً). طُبِّقت ترحيلة تشديد ضمن نطاق 21B نفسه لسحب هذه الصلاحيات.
- الصلاحيات النهائية: authenticated = SELECT فقط، anon = لا شيء، service_role = ALL
- STUDENT_READ_SCOPE = `is_active` AND `can_access_subject` AND `user_can_access_subject_curriculum` AND (track NULL أو = مسار الطالب)
- CROSS_GRADE_TEXTBOOK_ACCESS=DENY (عبر `can_access_subject`)
- CROSS_TRACK_TEXTBOOK_ACCESS=DENY (عبر شرط المسار + Trigger `assert_subject_textbook_binding`)

## G3 — STORAGE BOUNDARY

- STORAGE_MUTATIONS=0
- TEXTBOOK_OBJECTS_CREATED=0
- لا Bucket جديد، لا نقل أو نسخ بايتات.

## G4 — EXISTING CONTENT REGRESSION

- LESSON_RESOURCES_COUNT_BEFORE=40
- LESSON_RESOURCES_COUNT_AFTER=40
- LESSON_PDFS_PRESERVED=YES
- lesson_book_contents: 21 قبل = 21 بعد
- lesson_explanations: 40 (بدون تغيير)
- lesson_capability_lifecycle: 104 صف (بدون تغيير في الحالات)
- QURAN_LESSON_01=PASS (لا تغيير على صفوفه)
- STRUCTURED_READER=31/31 (لم يُمسّ payload الدرس الذهبي)
- FIGURES=3/3
- DYNAMIC_CAPABILITIES_18B=PASS
- VISIBILITY_LOST=0
- UNINTENDED_VISIBILITY_GAINED=0 (الجدول الجديد فارغ)

## G5 — SCHEMA VERIFY

- TRACK_BINDING=PASS (FK + Trigger منع mismatch)
- SEMESTER_CONSTRAINT=PASS (`semester IN (1,2)` أو NULL)
- VERSIONING_FIELDS=PASS (`version` NOT NULL)
- HASH_FIELD=PASS (`sha256` بقيد شكل `^[0-9a-f]{64}$`)
- ACTIVE_STATE=PASS (`is_active` NOT NULL DEFAULT true)
- SORT_ORDER=PASS
- MULTI_BOOK_SUPPORT=PASS (التفرد على subject+track+semester+storage_path فقط)
- BYTE_DEDUPLICATION_MODEL=SUPPORTED (نفس `storage_path` قابل للربط بأكثر من نطاق/مسار)
- الفهارس: pkey, scope_path_uidx, subject_idx, active_idx (partial)

## G6 — ADMIN SECURITY

- ADMIN_CONTENT_STAFF_ACCESS=PASS — كل الكتابة تمر عبر server functions مع `requireSupabaseAuth` + `assertContentStaff` ثم service_role.
- UNAUTHORIZED_USER_MUTATION=DENY (لا GRANT كتابة، ولا سياسة كتابة).
- لم يتم أي Deploy/Publish.

## G7 — STUDENT CONTRACT (source-level)

- TEXTBOOK_DOWNLOAD_OPTIONAL=YES
- AUTO_DOWNLOAD=NO
- الحالات المدعومة: NOT_DOWNLOADED / DOWNLOADING / DOWNLOADED / UPDATE_AVAILABLE
- LESSON_ORIGINAL_PDF_LEGACY_COMPATIBILITY=YES

## G8 — MIGRATION HISTORY

- MIGRATION_APPLIED=1 (ترحيلة 21B الأساسية)
- ADDITIONAL_MIGRATIONS=1 (ترحيلة تشديد GRANT داخل نفس نطاق 21B، مطلوبة لتحقيق STUDENT_WRITE=ZERO)
- PRODUCTION_MIGRATION_HISTORY_UPDATED=YES
- MANUAL_POST_MIGRATION_SQL_REQUIRED=NO
- أُزيل ملف `supabase/migrations-pending/20260823010000_subject_textbooks_21b.sql` بعد تسجيله في تاريخ الترحيلات.

## G9 — NO DATA

- SUBJECT_TEXTBOOK_ROWS_CREATED_BY_THIS_TASK=0
- TEXTBOOK_ROWS_CREATED=0

## PUBLISH / DEPLOY

- PUBLISH=NO
- DEPLOY=NO

## BLOCKERS

BLOCKERS=NONE

## الحكم

TAMKEEN_SUBJECT_TEXTBOOKS_21B_PRODUCTION_MIGRATION_APPLY = PASS_READY_FOR_21B_TEXTBOOK_E2E
