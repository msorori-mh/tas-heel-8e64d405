-- TEST_ONLY: transaction rolled back in isolated PG17 fixture.
begin;
insert into public.schools(id,name,governorate_id,district,locality) values
 ('40000000-0000-0000-0000-000000000091','TEST_ONLY تحرير','10000000-0000-0000-0000-000000000001','مديرية تحرير','حي قديم'),
 ('40000000-0000-0000-0000-000000000092','TEST_ONLY مكرر','10000000-0000-0000-0000-000000000001','مديرية تحرير','');
update public.profiles set school_id='40000000-0000-0000-0000-000000000091' where user_id='00000000-0000-0000-0000-000000000003';
update academy.teacher_profiles set school_id='40000000-0000-0000-0000-000000000091' where user_id='00000000-0000-0000-0000-000000000005';
select set_config('school_test.edit_before',(select (school_private.school_summary('40000000-0000-0000-0000-000000000091')-'student_count'-'teacher_count'-'governorate_name')::text),true);
select set_config('school_test.edit_profiles',(select md5(string_agg((to_jsonb(p)-'school_name'-'school_district'-'school_locality')::text,'' order by user_id)) from public.profiles p),true);
select set_config('school_test.edit_teachers',(select md5(string_agg((to_jsonb(p)-'school_name'-'school_district'-'school_locality')::text,'' order by user_id)) from academy.teacher_profiles p),true);
set role anon;
select school_test.denied($q$select public.admin_edit_school(null,'{}','{}')$q$,'42501','anon edit denied');
reset role; select school_test.actor(3); set role authenticated;
select school_test.denied($q$select public.admin_edit_school(null,'{}','{}')$q$,'42501','student edit denied');
select school_test.denied($q$select school_private.edit_school(null,'{}','{}')$q$,'42501','private edit denies student');
reset role; select school_test.actor(2); set role authenticated;
select school_test.denied($q$select public.admin_edit_school(null,'{}','{}')$q$,'42501','content staff edit denied');
reset role; select school_test.actor(1); set role authenticated;
select school_test.assert(public.admin_edit_school('40000000-0000-0000-0000-000000000091',current_setting('school_test.edit_before')::jsonb,'{}')->'errors' ?& array['name','district','governorate'],'edit reports field errors');
select school_test.assert(public.admin_edit_school('40000000-0000-0000-0000-000000000091',current_setting('school_test.edit_before')::jsonb,
 '{"name":"TEST_ONLY مكرر","governorate_id":"10000000-0000-0000-0000-000000000001","district":"مديرية تحرير","locality":""}')->'errors' ? 'name','edit rejects duplicate identity');
select school_test.assert(public.admin_edit_school('40000000-0000-0000-0000-000000000091',current_setting('school_test.edit_before')::jsonb,
 '{"name":"TEST_ONLY تحرير","governorate_id":"10000000-0000-0000-0000-000000000002","district":"مديرية تحرير","locality":""}')->'errors' ? 'governorate','linked governorate change rejected');
select school_test.assert(public.admin_edit_school('40000000-0000-0000-0000-000000000091',current_setting('school_test.edit_before')::jsonb,
 '{"name":"TEST_ONLY الاسم المصحح","governorate_id":"10000000-0000-0000-0000-000000000001","district":"مديرية مصححة","locality":""}')->'school'->>'id'='40000000-0000-0000-0000-000000000091','edit keeps school ID');
select school_test.denied($q$select public.admin_edit_school('40000000-0000-0000-0000-000000000091',current_setting('school_test.edit_before')::jsonb,'{}')$q$,'40001','stale edit rejected');
reset role;
select school_test.assert((select school_name='TEST_ONLY الاسم المصحح' and school_district='مديرية مصححة' and school_locality='' and school_id='40000000-0000-0000-0000-000000000091' from public.profiles where user_id='00000000-0000-0000-0000-000000000003'),'student labels synchronized and link preserved');
select school_test.assert((select school_name='TEST_ONLY الاسم المصحح' and school_district='مديرية مصححة' and school_locality='' and school_id='40000000-0000-0000-0000-000000000091' from academy.teacher_profiles where user_id='00000000-0000-0000-0000-000000000005'),'teacher labels synchronized and link preserved');
select school_test.assert((select md5(string_agg((to_jsonb(p)-'school_name'-'school_district'-'school_locality')::text,'' order by user_id))=current_setting('school_test.edit_profiles') from public.profiles p),'student other fields unchanged');
select school_test.assert((select md5(string_agg((to_jsonb(p)-'school_name'-'school_district'-'school_locality')::text,'' order by user_id))=current_setting('school_test.edit_teachers') from academy.teacher_profiles p),'teacher other fields unchanged');
select school_test.assert((select count(*)=1 from school_private.school_audit where action='edit_school'),'edit audit once');
select school_test.assert(not has_table_privilege('authenticated','public.schools','UPDATE'),'no direct update grant');
select set_config('school_test.edit_unlinked',(school_private.school_summary('40000000-0000-0000-0000-000000000092')-'student_count'-'teacher_count'-'governorate_name')::text,true);
set role authenticated;
select school_test.assert(public.admin_edit_school('40000000-0000-0000-0000-000000000092',current_setting('school_test.edit_unlinked')::jsonb,
 '{"name":"TEST_ONLY مكرر","governorate_id":"10000000-0000-0000-0000-000000000002","district":"مديرية تحرير","locality":""}')->'school'->>'governorate_id'='10000000-0000-0000-0000-000000000002','unlinked school governorate editable');
reset role;
select set_config('school_test.edit_current',(school_private.school_summary('40000000-0000-0000-0000-000000000091')-'student_count'-'teacher_count'-'governorate_name')::text,true);
set role authenticated;
select school_test.assert(public.admin_edit_school('40000000-0000-0000-0000-000000000091',current_setting('school_test.edit_current')::jsonb,current_setting('school_test.edit_current')::jsonb)->'errors'='{}'::jsonb,'no op edit succeeds');
reset role;
select school_test.assert((select count(*)=2 from school_private.school_audit where action='edit_school'),'no op does not add audit');
-- Exercise real database paging with thousands, not a client-only slice.
insert into public.schools(name,governorate_id,district,locality)
 select 'TEST_ONLY مقياس '||lpad(n::text,4,'0'),'10000000-0000-0000-0000-000000000001','مديرية مقياس','' from generate_series(1,3000) n;
set role authenticated;
select school_test.assert(public.admin_school_directory('TEST_ONLY مقياس',null,119)->>'count'='3000' and jsonb_array_length(public.admin_school_directory('TEST_ONLY مقياس',null,119)->'rows')=25,'3000 school directory bounds page to 25');
select school_test.assert(public.admin_school_directory('TEST_ONLY مقياس',null,119)->'rows'->24->>'name'='TEST_ONLY مقياس 3000','stable last page');
select school_test.assert(public.admin_school_directory('TEST_ONLY مقياس 1500',null,0)->>'count'='1','server search count');
select school_test.assert(public.admin_school_directory('TEST_ONLY مقياس','10000000-0000-0000-0000-000000000002',0)->>'count'='0','server governorate filter');
reset role;
select count(*) as passed_checks from school_test.checks;
rollback;
