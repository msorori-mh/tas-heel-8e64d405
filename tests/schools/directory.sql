select school_test.assert((select count(*)=0 from public.schools),'migration does not approve legacy names');
select school_test.assert((select count(*)=4 from public.profiles where school_id is null),'migration preserves all student profiles');
select school_test.assert((select count(*)=1 from academy.teacher_profiles where school_id is null),'migration preserves teacher profile');
select school_test.assert(public.school_identity_key(' مَدْرَسة  النـور ١ ') = public.school_identity_key('مدرسة النور 1'),'conservative Arabic/space/digit identity');
select school_test.assert(public.school_identity_key('مدرسة النور 1') <> public.school_identity_key('مدرسة النور 2'),'school numbers remain meaningful');
select school_test.assert(public.school_identity_key('الأمل') <> public.school_identity_key('الامل') and public.school_search_key('الأمل')=public.school_search_key('الامل'),'broad search does not become identity');
select school_test.assert(not has_table_privilege('anon','public.schools','SELECT'),'anonymous directory denied');
select school_test.assert(not has_table_privilege('authenticated','school_private.school_audit','SELECT'),'audit private');
select school_test.assert((select bool_and(relrowsecurity) from pg_class where oid in ('public.schools'::regclass,'school_private.school_audit'::regclass)),'new tables have RLS');

set role anon;
select school_test.denied($q$select * from public.search_school_directory('10000000-0000-0000-0000-000000000001','','')$q$,'42501','anon search denied');
select school_test.denied($q$select public.admin_school_review_queue()$q$,'42501','anon review denied');
reset role;
select school_test.actor(3); set role authenticated;
select school_test.assert((select count(*)=1 from public.profiles),'student cannot read others proposals');
select school_test.denied($q$insert into public.schools(name,governorate_id,district,locality) values('مزورة','10000000-0000-0000-0000-000000000001','مديرية','حي')$q$,'42501','student cannot approve directory');
select school_test.denied($q$select public.admin_school_review_queue()$q$,'42501','student review denied');
select school_test.denied($q$select school_private.review_queue('',null,0)$q$,'42501','private review cannot bypass admin check');
select school_test.denied($q$select public.admin_school_details(gen_random_uuid())$q$,'42501','student counts and profile details denied');
update public.profiles set school_name='مدرسة النور',school_district='مديرية أولى',school_locality='حي أول' where user_id=auth.uid();
select school_test.assert((select count(*)=0 from public.schools),'proposal saves without becoming public');
reset role;
select school_test.actor(2); set role authenticated;
select school_test.denied($q$select public.admin_school_directory()$q$,'42501','content manager cannot manage schools');
reset role;
select school_test.actor(1); set role authenticated;
select school_test.assert((public.admin_school_review_queue()->>'count')::int=5,'admin sees both legacy students and teacher');
select public.admin_review_school_profile('student','00000000-0000-0000-0000-000000000003',
 '{"school_id":null,"school_name":"مدرسة النور","governorate_id":"10000000-0000-0000-0000-000000000001","school_district":"مديرية أولى","school_locality":"حي أول"}',
 '{"name":"مدرسة النور","governorate_id":"10000000-0000-0000-0000-000000000001","district":"مديرية أولى","locality":"حي أول"}');
select school_test.assert((select count(*)=1 from public.schools),'review creates one approved school');
select school_test.assert((public.admin_school_review_queue()->>'count')::int=4,'review only relinks exact reviewed profile');
select school_test.denied($q$select public.admin_review_school_profile('student','00000000-0000-0000-0000-000000000004','{}','{}')$q$,'40001','stale review denied');
select school_test.denied($q$select public.admin_review_school_profile('student','00000000-0000-0000-0000-000000000004',
 '{"school_id":null,"school_name":"مدرسة النور","governorate_id":"10000000-0000-0000-0000-000000000001","school_district":null,"school_locality":null}',
 '{"name":"مدرسة خاطئة","governorate_id":"10000000-0000-0000-0000-000000000002","district":"مديرية أخرى","locality":"حي آخر"}')$q$,'23514','review different governorate rejected');
select school_test.assert((select count(*)=1 from public.schools),'failed review rolls back catalog insertion');
select public.admin_review_school_profile('student','00000000-0000-0000-0000-000000000004',
 '{"school_id":null,"school_name":"مدرسة النور","governorate_id":"10000000-0000-0000-0000-000000000001","school_district":null,"school_locality":null}',
 '{"name":"مَدْرَسة النور","governorate_id":"10000000-0000-0000-0000-000000000001","district":"مديرية أولى","locality":"حي أول"}');
select school_test.assert((select count(*)=1 from public.schools),'identical normalized location/name reused');
select public.admin_review_school_profile('teacher','00000000-0000-0000-0000-000000000005',
 '{"school_id":null,"school_name":"مدرسة النور","governorate_id":"10000000-0000-0000-0000-000000000001","school_district":null,"school_locality":null}',
 '{"name":"مدرسة النور","governorate_id":"10000000-0000-0000-0000-000000000001","district":"مديرية ثانية","locality":"حي ثان"}');
select school_test.assert((select count(*)=2 from public.schools),'same name distinct district stays separate');
select school_test.assert(jsonb_array_length(public.admin_student_school_filter_options()->'schools')=1,'student options use approved identities only');
select school_test.assert((public.admin_student_school_filter_options()->>'pending_schools')::int=2,'pending count explicit without name pollution');
select school_test.assert((public.admin_list_students_by_school(0,20,null,null,null,null,true)->>'count')::int=2,'pending student filter');
select school_test.assert((public.admin_list_students_by_school(0,20,null,null,null,(select id from public.schools where district='مديرية أولى'),false)->>'count')::int=2,'student filter uses school ID');
reset role;

select school_test.actor(7); set role authenticated;
update public.profiles set school_id=(select id from public.schools where district='مديرية ثانية') where user_id=auth.uid();
select school_test.assert((select school_name='مدرسة النور' and school_district='مديرية ثانية' and school_locality='حي ثان' from public.profiles where user_id=auth.uid()),'selected school fills canonical display and location');
select school_test.denied($q$update public.profiles set school_id=(select id from public.schools where district='مديرية أولى'),governorate_id='10000000-0000-0000-0000-000000000002' where user_id=auth.uid()$q$,'23514','cross-governorate selection denied');
select school_test.assert((select count(*)=2 from public.search_school_directory('10000000-0000-0000-0000-000000000001','نـُور','')),'Arabic search suggestions');
select school_test.assert((select count(*)=0 from public.search_school_directory('10000000-0000-0000-0000-000000000001','%','')),'search treats percent literally');
select school_test.assert((select count(*)=1 from public.search_school_directory('10000000-0000-0000-0000-000000000001','نور','ثانية')),'district narrows search');
reset role;

select school_test.actor(6); set role authenticated;
select school_test.denied($q$select academy.save_my_teacher_profile_with_school('TEST_ONLY مستخدم','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','مدرسة','777000003',null,'مديرية','حي')$q$,'42501','non-Google teacher denied');
reset role;
select school_test.actor(5); set role authenticated;
select academy.save_my_teacher_profile_with_school('TEST_ONLY معلم','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','مدرسة النور','777000001',
 (select id from public.schools where district='مديرية ثانية'),'مديرية ثانية','حي ثان');
select school_test.assert((select school_id is not null from academy.teacher_profiles where user_id=auth.uid()),'Google teacher profile retains school selection');
select school_test.denied($q$select academy.save_my_teacher_profile_with_school('TEST_ONLY اسم غير محفوظ','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','مدرسة النور','777000001',
 (select id from public.schools where district='مديرية ثانية'),'مديرية ثانية','حي ثان')$q$,'23514','teacher invalid school rolls back whole profile save');
select school_test.assert((select full_name='TEST_ONLY معلم' from academy.teacher_profiles where user_id=auth.uid()),'teacher failed save preserves name');
reset role;

select school_test.actor(1); set role authenticated;
select school_test.denied($q$select public.admin_merge_schools((select id from public.schools where district='مديرية ثانية'),(select id from public.schools where district='مديرية أولى'),'{}','{}')$q$,'40001','merge needs current reviewed snapshots');
select school_test.denied($q$select public.admin_merge_schools((select id from public.schools limit 1),(select id from public.schools limit 1),'{}','{}')$q$,'22023','self merge denied');
select public.admin_merge_schools((select id from public.schools where district='مديرية ثانية'),(select id from public.schools where district='مديرية أولى'),
 public.admin_school_details((select id from public.schools where district='مديرية ثانية')),public.admin_school_details((select id from public.schools where district='مديرية أولى')));
select school_test.assert((select count(*)=1 from public.schools),'merged source removed from public choices');
select school_test.assert((public.admin_school_directory()->'rows'->0->>'student_count')::int=3 and (public.admin_school_directory()->'rows'->0->>'teacher_count')::int=1,'merge relinks both roles and updates counts');
select school_test.assert((public.admin_school_review_queue()->>'count')::int=1,'merge preserves unrelated pending profile');
reset role;
select school_test.assert((select count(*)=2 from public.schools),'merged source retained physically');
select school_test.assert((select count(*)=4 from public.profiles) and (select count(*)=1 from academy.teacher_profiles),'merge never deletes profiles');
select school_test.assert((select count(*)=4 from school_private.school_audit),'review and merge audited');
select school_test.assert((select jsonb_array_length(before_data->'profiles')=2 from school_private.school_audit where action='merge_schools'),'audit records exact affected profile links');

-- A cached client may still hold the source ID. The trigger follows the alias.
select set_config('school_test.old_id',(select id::text from public.schools where merged_into is not null),false);
select school_test.actor(8); set role authenticated;
update public.profiles set school_id=current_setting('school_test.old_id')::uuid where user_id=auth.uid();
select school_test.assert((select school_id <> current_setting('school_test.old_id')::uuid and school_district='مديرية أولى' from public.profiles where user_id=auth.uid()),'cached merged ID resolves to active identity');
update public.profiles set school_name='مدرسة النور ٢' where user_id=auth.uid();
select school_test.assert((select school_id is null and school_name='مدرسة النور ٢' from public.profiles where user_id=auth.uid()),'older text-editing clients become pending and retain numbering');
select school_test.assert((select count(*)=1 from public.schools),'older clients cannot add catalog duplicates');
reset role;
select school_test.assert((select count(*)=0 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='school_private' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')),'no anonymous privileged school functions');
select count(*) as passed_checks from school_test.checks;
