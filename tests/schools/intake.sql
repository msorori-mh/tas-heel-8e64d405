-- TEST_ONLY disposable fixture, no real profiles are edited.
begin;
select set_config('school_test.intake_profile_hash',(select md5(string_agg(to_jsonb(p)::text,'' order by user_id)) from public.profiles p),true);
select set_config('school_test.intake_teacher_hash',(select md5(string_agg(to_jsonb(p)::text,'' order by user_id)) from academy.teacher_profiles p),true);
select set_config('school_test.intake_count',(select count(*)::text from public.schools),true);
select set_config('school_test.intake_audit',(select count(*)::text from school_private.school_audit),true);
set role anon;
select school_test.denied($q$select public.admin_intake_schools('[]',true)$q$,'42501','anon intake denied');
reset role;
select school_test.actor(3); set role authenticated;
select school_test.denied($q$select public.admin_intake_schools('[{}]',true)$q$,'42501','student intake denied');
select school_test.denied($q$select school_private.intake_schools('[{}]',true)$q$,'42501','private intake cannot bypass role');
reset role;
select school_test.actor(2); set role authenticated;
select school_test.denied($q$select public.admin_intake_schools('[{}]',false)$q$,'42501','content staff intake denied');
reset role;
select school_test.actor(1); set role authenticated;
select school_test.denied($q$select public.admin_intake_schools('{}',true)$q$,'22023','invalid top level rejected');
select school_test.denied($q$select public.admin_intake_schools('[]',true)$q$,'22023','empty intake rejected');
select school_test.denied($q$select public.admin_intake_schools((select jsonb_agg('{}'::jsonb) from generate_series(1,501)),true)$q$,'22023','oversized intake rejected');
select set_config('school_test.intake_rows','[
 {"source_row":2,"governorate":"محافظة أولى","district":"مديرية إدخال","name":"TEST_ONLY مدرسة ١","locality":""},
 {"source_row":4,"governorate_id":"10000000-0000-0000-0000-000000000001","district":"مديرية إدخال","name":"TEST_ONLY مَدرسة 1","locality":null},
 {"source_row":5,"governorate":"غير موجودة","district":"ع","name":"مدرسة","locality":""},
 {"source_row":6,"governorate":"محافظة أولى","district":"مديرية إدخال","name":12,"locality":"أ"}
]',true);
select set_config('school_test.intake_preview',public.admin_intake_schools(current_setting('school_test.intake_rows')::jsonb,false)::text,true);
select school_test.assert(current_setting('school_test.intake_preview')::jsonb->'rows'->0->>'status'='new','preview classifies valid new school');
select school_test.assert(current_setting('school_test.intake_preview')::jsonb->'rows'->1->>'status'='duplicate_file','preview preserves conservative Arabic digit identity');
select school_test.assert(current_setting('school_test.intake_preview')::jsonb->'rows'->2->'errors' ?& array['district','governorate'],'preview returns field errors');
select school_test.assert(current_setting('school_test.intake_preview')::jsonb->'rows'->3->'errors' ?& array['name','locality'],'invalid cell types and short locality rejected');
reset role;
select school_test.assert((select count(*)::text=current_setting('school_test.intake_count') from public.schools),'preview writes no schools');
select school_test.assert((select count(*)::text=current_setting('school_test.intake_audit') from school_private.school_audit),'preview writes no audit');
set role authenticated;
select set_config('school_test.intake_saved',public.admin_intake_schools(current_setting('school_test.intake_rows')::jsonb,true)::text,true);
select school_test.assert(current_setting('school_test.intake_saved')::jsonb->'rows'->0->>'status'='added','commit adds valid school');
select school_test.assert(current_setting('school_test.intake_saved')::jsonb->'rows'->2->>'status'='invalid','commit skips invalid row');
select school_test.assert(public.admin_intake_schools(current_setting('school_test.intake_rows')::jsonb,true)->'rows'->0->>'status'='exists','replay is idempotent');
select school_test.assert((select count(*)=1 from public.search_school_directory('10000000-0000-0000-0000-000000000001','TEST_ONLY مدرسة ١','')),'imported school searchable');
reset role;
select school_test.assert((select count(*)=current_setting('school_test.intake_count')::int+1 from public.schools),'only valid unique school inserted');
select school_test.assert((select count(*)=current_setting('school_test.intake_audit')::int+1 from school_private.school_audit),'one audit event and no replay audit');
select school_test.assert((select md5(string_agg(to_jsonb(p)::text,'' order by user_id))=current_setting('school_test.intake_profile_hash') from public.profiles p),'student profiles unchanged by intake');
select school_test.assert((select md5(string_agg(to_jsonb(p)::text,'' order by user_id))=current_setting('school_test.intake_teacher_hash') from academy.teacher_profiles p),'teacher profiles unchanged by intake');
select school_test.assert(not has_table_privilege('authenticated','public.schools','INSERT'),'intake grants no direct insert');
select count(*) as passed_checks from school_test.checks;
rollback;
