-- Disposable PG17 fixture only. Roll back to preserve the concurrency test baseline.
begin;
update public.profiles set school_id=null, school_name='TEST_ONLY optional locality',
 school_district=null, school_locality=null
 where user_id in ('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000008');
update academy.teacher_profiles set school_id=null, school_name='TEST_ONLY optional locality',
 school_district=null, school_locality=null where user_id='00000000-0000-0000-0000-000000000005';
select set_config('school_test.optional_student',
 (select school_private.profile_school_snapshot(to_jsonb(p))::text from public.profiles p where user_id='00000000-0000-0000-0000-000000000008'),true);
select set_config('school_test.optional_second',
 (select school_private.profile_school_snapshot(to_jsonb(p))::text from public.profiles p where user_id='00000000-0000-0000-0000-000000000007'),true);
select set_config('school_test.optional_teacher',
 (select school_private.profile_school_snapshot(to_jsonb(p))::text from academy.teacher_profiles p where user_id='00000000-0000-0000-0000-000000000005'),true);
select set_config('school_test.optional_school',
 '{"name":"TEST_ONLY optional locality","governorate_id":"10000000-0000-0000-0000-000000000001","district":"مديرية اختبار"}',true);
select school_test.actor(1);
set role authenticated;
select school_test.denied($q$select public.admin_review_school_profile('student','00000000-0000-0000-0000-000000000008',
 current_setting('school_test.optional_student')::jsonb,
 current_setting('school_test.optional_school')::jsonb || '{"locality":"أ"}')$q$,'23514','one-character supplied locality rejected');
select school_test.denied($q$select public.admin_review_school_profile('student','00000000-0000-0000-0000-000000000008',
 current_setting('school_test.optional_student')::jsonb,
 current_setting('school_test.optional_school')::jsonb || jsonb_build_object('locality',repeat('أ',121)))$q$,'23514','overlong locality rejected');
select school_test.denied($q$select public.admin_review_school_profile('student','00000000-0000-0000-0000-000000000008',
 current_setting('school_test.optional_student')::jsonb,
 current_setting('school_test.optional_school')::jsonb || '{"district":""}')$q$,'23514','district remains required');
select public.admin_review_school_profile('student','00000000-0000-0000-0000-000000000008',
 current_setting('school_test.optional_student')::jsonb,
 current_setting('school_test.optional_school')::jsonb || '{"locality":"   "}');
select school_test.assert((select count(*)=1 from public.schools where name='TEST_ONLY optional locality' and locality='' and locality_key=''),'blank locality stored canonically');
select public.admin_review_school_profile('teacher','00000000-0000-0000-0000-000000000005',
 current_setting('school_test.optional_teacher')::jsonb,
 current_setting('school_test.optional_school')::jsonb || '{"locality":null}');
select public.admin_review_school_profile('student','00000000-0000-0000-0000-000000000007',
 current_setting('school_test.optional_second')::jsonb,
 current_setting('school_test.optional_school')::jsonb);
select school_test.assert((select count(*)=1 from public.schools where name='TEST_ONLY optional locality'),'null and omitted locality reuse empty identity');
select school_test.assert((select count(*)=2 from public.profiles where school_name='TEST_ONLY optional locality' and school_id is not null and school_locality=''),'student profiles link without locality');
select school_test.assert((select count(*)=1 from academy.teacher_profiles where school_name='TEST_ONLY optional locality' and school_id is not null and school_locality=''),'teacher profile links without locality');
select school_test.assert((select count(*)=1 from public.search_school_directory('10000000-0000-0000-0000-000000000001','TEST_ONLY optional locality','')),'school without locality remains searchable');
reset role;
-- Supplied locations still distinguish otherwise identical names.
insert into public.schools(name,governorate_id,district,locality)
 values('TEST_ONLY optional locality','10000000-0000-0000-0000-000000000001','مديرية اختبار','حي معلوم');
select school_test.assert((select count(*)=2 from public.schools where name='TEST_ONLY optional locality'),'known locality remains a distinct identity');
select school_test.assert((select count(*)=3 from school_private.school_audit where action='review_profile' and after_data->'school'->>'school_name'='TEST_ONLY optional locality'),'optional-locality approvals are audited');
select count(*) as passed_checks from school_test.checks;
rollback;
