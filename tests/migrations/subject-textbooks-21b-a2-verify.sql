-- 21B-A2 — post-apply verification gates (local PG17 only).
\set ON_ERROR_STOP on

INSERT INTO public.curriculum_tracks (id, track_name)
VALUES ('11111111-1111-1111-1111-111111111111', 'صنعاء'),
       ('22222222-2222-2222-2222-222222222222', 'عدن');
INSERT INTO public.subjects (id, name)
VALUES ('33333333-3333-3333-3333-333333333333', 'رياضيات'),
       ('44444444-4444-4444-4444-444444444444', 'القرآن الكريم');

-- A) FULL_ACADEMIC_YEAR (math, one book both semesters)
INSERT INTO public.subject_textbooks (subject_id, curriculum_track_id, title, storage_path, version, coverage_type)
VALUES ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222',
        'كتاب الرياضيات',
        'subject-textbooks/33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000001.pdf',
        'v1', 'FULL_ACADEMIC_YEAR');
\echo FULL_YEAR_INSERT_OK

-- B) SEMESTER_SPECIFIC 1 and 2 (Quran, two distinct books)
INSERT INTO public.subject_textbooks (subject_id, curriculum_track_id, title, storage_path, version, coverage_type, semester)
VALUES ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222',
        'القرآن — الفصل الأول',
        'subject-textbooks/44444444-4444-4444-4444-444444444444/bbbbbbbb-0000-0000-0000-000000000001.pdf',
        'v1', 'SEMESTER_SPECIFIC', 1),
       ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222',
        'القرآن — الفصل الثاني',
        'subject-textbooks/44444444-4444-4444-4444-444444444444/bbbbbbbb-0000-0000-0000-000000000002.pdf',
        'v1', 'SEMESTER_SPECIFIC', 2);
\echo SEMESTER_SPECIFIC_INSERT_OK

-- C) multiple books inside the same coverage (core + appendix)
INSERT INTO public.subject_textbooks (subject_id, curriculum_track_id, title, storage_path, version, coverage_type, sort_order)
VALUES ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222',
        'ملحق التمارين',
        'subject-textbooks/33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000002.pdf',
        'v1', 'FULL_ACADEMIC_YEAR', 1);
\echo MULTI_BOOK_OK

-- D) same bytes reused for a second track (no duplicated storage object)
INSERT INTO public.subject_textbooks (subject_id, curriculum_track_id, title, storage_path, version, coverage_type)
VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
        'كتاب الرياضيات',
        'subject-textbooks/33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000001.pdf',
        'v1', 'FULL_ACADEMIC_YEAR');
\echo TRACK_REUSE_OK

-- E) invalid combinations must be rejected
\set ON_ERROR_STOP off
INSERT INTO public.subject_textbooks (subject_id, title, storage_path, version, coverage_type, semester)
VALUES ('33333333-3333-3333-3333-333333333333', 'خطأ 1',
        'subject-textbooks/33333333-3333-3333-3333-333333333333/cccccccc-0000-0000-0000-000000000001.pdf',
        'v1', 'FULL_ACADEMIC_YEAR', 1);
\echo EXPECT_DENY_FULLYEAR_WITH_SEMESTER

INSERT INTO public.subject_textbooks (subject_id, title, storage_path, version, coverage_type, semester)
VALUES ('33333333-3333-3333-3333-333333333333', 'خطأ 2',
        'subject-textbooks/33333333-3333-3333-3333-333333333333/cccccccc-0000-0000-0000-000000000002.pdf',
        'v1', 'SEMESTER_SPECIFIC', NULL);
\echo EXPECT_DENY_SEMESTER_SPECIFIC_NULL

INSERT INTO public.subject_textbooks (subject_id, title, storage_path, version, coverage_type, semester)
VALUES ('33333333-3333-3333-3333-333333333333', 'خطأ 3',
        'subject-textbooks/33333333-3333-3333-3333-333333333333/cccccccc-0000-0000-0000-000000000003.pdf',
        'v1', 'SEMESTER_SPECIFIC', 3);
\echo EXPECT_DENY_SEMESTER_3

INSERT INTO public.subject_textbooks (subject_id, title, storage_path, version, coverage_type)
VALUES ('33333333-3333-3333-3333-333333333333', 'خطأ 4',
        'subject-textbooks/33333333-3333-3333-3333-333333333333/cccccccc-0000-0000-0000-000000000004.pdf',
        'v1', 'YEARLY');
\echo EXPECT_DENY_UNKNOWN_COVERAGE

-- duplicate exact scope row
INSERT INTO public.subject_textbooks (subject_id, curriculum_track_id, title, storage_path, version, coverage_type)
VALUES ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222',
        'تكرار',
        'subject-textbooks/33333333-3333-3333-3333-333333333333/aaaaaaaa-0000-0000-0000-000000000001.pdf',
        'v1', 'FULL_ACADEMIC_YEAR');
\echo EXPECT_DENY_DUPLICATE_SCOPE
\set ON_ERROR_STOP on

-- F) discovery rules
SELECT 'SEM1_COUNT=' || count(*) FROM public.subject_textbooks
 WHERE subject_id='44444444-4444-4444-4444-444444444444' AND is_active
   AND (coverage_type='FULL_ACADEMIC_YEAR' OR (coverage_type='SEMESTER_SPECIFIC' AND semester=1));
SELECT 'SEM2_COUNT=' || count(*) FROM public.subject_textbooks
 WHERE subject_id='44444444-4444-4444-4444-444444444444' AND is_active
   AND (coverage_type='FULL_ACADEMIC_YEAR' OR (coverage_type='SEMESTER_SPECIFIC' AND semester=2));
SELECT 'MATH_SEM1=' || count(*) FROM public.subject_textbooks
 WHERE subject_id='33333333-3333-3333-3333-333333333333' AND is_active
   AND (coverage_type='FULL_ACADEMIC_YEAR' OR (coverage_type='SEMESTER_SPECIFIC' AND semester=1));
SELECT 'MATH_SEM2=' || count(*) FROM public.subject_textbooks
 WHERE subject_id='33333333-3333-3333-3333-333333333333' AND is_active
   AND (coverage_type='FULL_ACADEMIC_YEAR' OR (coverage_type='SEMESTER_SPECIFIC' AND semester=2));

-- G) security surface unchanged
SELECT 'RLS=' || relrowsecurity FROM pg_class WHERE oid='public.subject_textbooks'::regclass;
SELECT 'ACL=' || array_to_string(relacl::text[], ' | ') FROM pg_class WHERE oid='public.subject_textbooks'::regclass;
SELECT 'COVERAGE_COLUMN_GONE=' || (count(*)=0) FROM information_schema.columns
 WHERE table_name='subject_textbooks' AND column_name='coverage';
