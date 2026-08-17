-- 21B-A3 — post-apply verification gates (local PG17 only).
\set ON_ERROR_STOP on

INSERT INTO public.curriculum_tracks (id, track_name)
VALUES ('11111111-1111-1111-1111-111111111111', 'صنعاء'),
       ('22222222-2222-2222-2222-222222222222', 'عدن');
INSERT INTO public.subjects (id, name)
VALUES ('33333333-3333-3333-3333-333333333333', 'مادة أ'),
       ('44444444-4444-4444-4444-444444444444', 'مادة ب');

-- Six real fixtures must coexist for the SAME subject + track ----------
INSERT INTO public.subject_textbooks
  (subject_id, curriculum_track_id, title, storage_path, version, book_type, coverage_type, semester)
VALUES
 ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','الكتاب الأساسي',
  'subject-textbooks/33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000001.pdf',
  'v1','MAIN_TEXTBOOK','FULL_ACADEMIC_YEAR',NULL),
 ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','كتاب التمارين',
  'subject-textbooks/33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000002.pdf',
  'v1','EXERCISE_BOOK','FULL_ACADEMIC_YEAR',NULL),
 ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','الأساسي ف1',
  'subject-textbooks/33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000003.pdf',
  'v1','MAIN_TEXTBOOK','SEMESTER_SPECIFIC',1),
 ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','الأساسي ف2',
  'subject-textbooks/33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000004.pdf',
  'v1','MAIN_TEXTBOOK','SEMESTER_SPECIFIC',2),
 ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','تمارين ف1',
  'subject-textbooks/33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000005.pdf',
  'v1','EXERCISE_BOOK','SEMESTER_SPECIFIC',1),
 ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','تمارين ف2',
  'subject-textbooks/33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000006.pdf',
  'v1','EXERCISE_BOOK','SEMESTER_SPECIFIC',2);
\echo SIX_FIXTURES_COEXIST_OK

-- OTHER supported
INSERT INTO public.subject_textbooks
  (subject_id, curriculum_track_id, title, storage_path, version, book_type, coverage_type)
VALUES ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','ملحق',
  'subject-textbooks/33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000007.pdf',
  'v1','OTHER','FULL_ACADEMIC_YEAR');
\echo OTHER_BOOK_TYPE_OK

-- default book_type is MAIN_TEXTBOOK
INSERT INTO public.subject_textbooks (subject_id, title, storage_path, version)
VALUES ('44444444-4444-4444-4444-444444444444','كتاب افتراضي',
  'subject-textbooks/44444444-4444-4444-4444-444444444444/bbbbbbbb-0000-0000-0000-000000000001.pdf','v1');
SELECT 'DEFAULT_BOOK_TYPE=' || book_type FROM public.subject_textbooks
 WHERE subject_id='44444444-4444-4444-4444-444444444444';

-- same bytes reused for another track (no duplicated storage object)
INSERT INTO public.subject_textbooks
  (subject_id, curriculum_track_id, title, storage_path, version, book_type, coverage_type)
VALUES ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','الكتاب الأساسي',
  'subject-textbooks/33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000001.pdf',
  'v1','MAIN_TEXTBOOK','FULL_ACADEMIC_YEAR');
\echo TRACK_REUSE_OK

-- Invalid combinations must be rejected ---------------------------------
\set ON_ERROR_STOP off
INSERT INTO public.subject_textbooks (subject_id, title, storage_path, version, book_type)
VALUES ('44444444-4444-4444-4444-444444444444','نوع خاطئ',
  'subject-textbooks/44444444-4444-4444-4444-444444444444/cccccccc-0000-0000-0000-000000000001.pdf',
  'v1','WORKBOOK');
\echo EXPECT_DENY_UNKNOWN_BOOK_TYPE

INSERT INTO public.subject_textbooks (subject_id, title, storage_path, version, coverage_type, semester)
VALUES ('44444444-4444-4444-4444-444444444444','خطأ تغطية',
  'subject-textbooks/44444444-4444-4444-4444-444444444444/cccccccc-0000-0000-0000-000000000002.pdf',
  'v1','FULL_ACADEMIC_YEAR',1);
\echo EXPECT_DENY_FULLYEAR_WITH_SEMESTER

INSERT INTO public.subject_textbooks (subject_id, title, storage_path, version, coverage_type)
VALUES ('44444444-4444-4444-4444-444444444444','خطأ فصل',
  'subject-textbooks/44444444-4444-4444-4444-444444444444/cccccccc-0000-0000-0000-000000000003.pdf',
  'v1','SEMESTER_SPECIFIC');
\echo EXPECT_DENY_SEMESTER_SPECIFIC_NULL

-- exact duplicate record (same scope + same bytes)
INSERT INTO public.subject_textbooks
  (subject_id, curriculum_track_id, title, storage_path, version, book_type, coverage_type)
VALUES ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','عنوان مختلف تماماً',
  'subject-textbooks/33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000001.pdf',
  'v1','MAIN_TEXTBOOK','FULL_ACADEMIC_YEAR');
\echo EXPECT_DENY_DUPLICATE_RECORD
\set ON_ERROR_STOP on

-- Discovery -------------------------------------------------------------
SELECT 'SEM1_VISIBLE=' || count(*) FROM public.subject_textbooks
 WHERE subject_id='33333333-3333-3333-3333-333333333333'
   AND curriculum_track_id='22222222-2222-2222-2222-222222222222' AND is_active
   AND (coverage_type='FULL_ACADEMIC_YEAR' OR (coverage_type='SEMESTER_SPECIFIC' AND semester=1));
SELECT 'SEM2_VISIBLE=' || count(*) FROM public.subject_textbooks
 WHERE subject_id='33333333-3333-3333-3333-333333333333'
   AND curriculum_track_id='22222222-2222-2222-2222-222222222222' AND is_active
   AND (coverage_type='FULL_ACADEMIC_YEAR' OR (coverage_type='SEMESTER_SPECIFIC' AND semester=2));

-- Security surface unchanged --------------------------------------------
SELECT 'RLS=' || relrowsecurity FROM pg_class WHERE oid='public.subject_textbooks'::regclass;
SELECT 'ACL=' || array_to_string(relacl::text[], ' | ') FROM pg_class WHERE oid='public.subject_textbooks'::regclass;
SELECT 'BOOK_TYPE_NOT_NULL=' || (is_nullable='NO') FROM information_schema.columns
 WHERE table_name='subject_textbooks' AND column_name='book_type';
