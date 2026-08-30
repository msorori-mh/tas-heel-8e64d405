\set ON_ERROR_STOP on

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'Teacher Academy contract failed: %', p_message;
  end if;
end;
$$;

insert into academy.capability_grants (user_id, capability, granted_by)
select
  '00000000-0000-0000-0000-000000000001'::uuid,
  capability,
  '00000000-0000-0000-0000-000000000001'::uuid
from unnest(array[
  'ACADEMY_CATALOG_MANAGE',
  'ACADEMY_TEACHERS_VIEW',
  'ACADEMY_PROGRESS_VIEW'
]) as capability;

select id as math_subject_id from academy.subjects where code = 'MATHEMATICS' \gset
select id as english_subject_id from academy.subjects where code = 'ENGLISH' \gset

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);

select academy.admin_create_program_v2(
  'إدارة صف الرياضيات بفاعلية',
  'برنامج عملي لمعلمي الرياضيات ضمن تجربة الأكاديمية المحدودة.',
  'محتوى تدريبي تفصيلي يساعد معلم الرياضيات على تهيئة بيئة تعلم منظمة وتطبيق إجراءات صفية واضحة.',
  array['يهيئ بيئة تعلم منظمة'],
  array[]::text[],
  array['أكمل الدرس قبل التقييم'],
  'SUBJECT_SPECIFIC',
  45,
  :'math_subject_id'::uuid
) as version_id \gset

select academy.admin_save_structured_lesson(
  null,
  :'version_id'::uuid,
  'تهيئة بيئة التعلم',
  'TEXT',
  null,
  10,
  jsonb_build_array(
    jsonb_build_object('section_type', 'OBJECTIVE', 'title', 'الهدف', 'content', 'تهيئة بيئة التعلم'),
    jsonb_build_object('section_type', 'CONTENT', 'title', 'الشرح', 'content', 'محتوى تدريبي آمن ومباشر لمعلم الرياضيات.'),
    jsonb_build_object('section_type', 'SUMMARY', 'title', 'الخلاصة', 'content', 'خطوات صفية واضحة وقابلة للتطبيق.')
  )
) as lesson_id \gset

select academy.admin_save_assessment(:'version_id'::uuid, 'التقييم النهائي', 70);
select academy.admin_add_assessment_question(
  :'version_id'::uuid,
  'ما الخيار الصحيح؟',
  'الإجابة الصحيحة',
  'خيار ثان',
  'خيار ثالث',
  'خيار رابع',
  'a'
) as question_id \gset

select academy.admin_publish_program(:'version_id'::uuid);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
insert into academy.teacher_profiles (
  user_id, full_name, primary_subject_id, governorate_id, school_name, phone
) values (
  auth.uid(), 'معلم الرياضيات', :'math_subject_id'::uuid,
  '00000000-0000-0000-0000-000000000100'::uuid, 'مدرسة الاختبار', '+967700000001'
);

select pg_temp.assert_true(
  (select count(*) = 1 from academy.list_visible_programs()),
  'the mathematics teacher must see the mathematics program'
);

select academy.self_enroll(:'version_id'::uuid) as enrollment_id \gset
select academy.complete_lesson(:'lesson_id'::uuid);

select pg_temp.assert_true(
  (select count(*) = 1 from academy.get_assessment(:'version_id'::uuid)),
  'the completed enrollment must expose its assessment'
);

select * from academy.submit_assessment(
  :'version_id'::uuid,
  jsonb_build_object(:'question_id', 'a')
) \gset

select pg_temp.assert_true(
  :'passed'::boolean and :'score'::integer = 1 and :'total'::integer = 1,
  'the correct answer must pass with a score of one out of one'
);
select pg_temp.assert_true(
  (select count(*) = 1 from academy.list_my_certificates()),
  'a passing teacher must receive exactly one certificate'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
insert into academy.teacher_profiles (
  user_id, full_name, primary_subject_id, governorate_id, school_name, phone
) values (
  auth.uid(), 'معلم اللغة الإنجليزية', :'english_subject_id'::uuid,
  '00000000-0000-0000-0000-000000000100'::uuid, 'مدرسة الاختبار', '+967700000002'
);

select pg_temp.assert_true(
  (select count(*) = 0 from academy.list_visible_programs()),
  'an English teacher must not see the mathematics-only program'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
select pg_temp.assert_true(
  not academy.i_have_google_identity(),
  'the email-only fixture must not satisfy the Google identity guard'
);

do $$
begin
  insert into academy.teacher_profiles (
    user_id, full_name, primary_subject_id, governorate_id, school_name, phone
  ) values (
    auth.uid(), 'معلم بريد فقط', (select id from academy.subjects where code = 'ENGLISH'),
    '00000000-0000-0000-0000-000000000100'::uuid, 'مدرسة الاختبار', '+967700000004'
  );
  raise exception 'an email-only account unexpectedly created a teacher profile';
exception
  when insufficient_privilege then
    if sqlerrm not like '%row-level security%' then
      raise;
    end if;
end;
$$;

select pg_temp.assert_true(
  (select count(*) = 0 from academy.teacher_profiles where user_id = auth.uid()),
  'the rejected email-only profile must leave no row behind'
);

reset role;
set role anon;
select pg_temp.assert_true(
  (select count(*) = 1 from academy.verify_certificate(:'certificate_code')),
  'anonymous certificate verification must return the issued certificate'
);

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from academy.admin_list_progress()
    where teacher_name = 'معلم الرياضيات' and certificate_valid
  ),
  'academy progress admin must see the valid mathematics certificate'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from academy.admin_report_programs(null, null)
    where program_version_id = :'version_id'::uuid
      and enrolled_count = 1
      and completed_count = 1
      and completion_rate = 100
      and pass_rate = 100
      and valid_certificate_count = 1
  ),
  'program report must aggregate the completed enrollment, passing attempt and certificate'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from academy.admin_report_lesson_engagement(:'version_id'::uuid, null, null)
    where lesson_id = :'lesson_id'::uuid
      and enrolled_count = 1
      and completed_count = 1
      and completion_rate = 100
      and not_completed_count = 0
  ),
  'lesson engagement report must show the completed lesson exactly once'
);

select pg_temp.assert_true(
  (
    select default_program_minutes = 60 and default_pass_percentage = 75
    from academy.admin_get_settings()
  ),
  'academy settings must start with documented defaults'
);

select academy.admin_update_settings(
  'أكاديمية تمكين',
  'support@example.test',
  '+967700000099',
  90,
  80,
  'أكاديمية تمكين',
  'مدير الأكاديمية',
  'المدير',
  'Google Meet',
  'الدخول قبل الموعد بعشر دقائق.'
);

select pg_temp.assert_true(
  (
    select default_program_minutes = 90
      and default_pass_percentage = 80
      and default_live_provider = 'Google Meet'
    from academy.admin_get_settings()
  ),
  'academy settings update must persist through the guarded RPC'
);

select academy.admin_set_user_capabilities(
  'english-teacher@example.test',
  array['ACADEMY_PROGRESS_VIEW']
);

select pg_temp.assert_true(
  (select count(*) = 2 from academy.admin_list_academy_admins()),
  'adding a scoped academy admin must expose two active admin accounts'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select pg_temp.assert_true(
  (select count(*) = 1 from academy.admin_report_programs(null, null)),
  'a progress-only admin must be allowed to read reports'
);

do $$
begin
  perform * from academy.admin_get_settings();
  raise exception 'progress-only admin unexpectedly read academy settings';
exception
  when insufficient_privilege then
    if sqlerrm not like '%ACADEMY_CATALOG_MANAGE_REQUIRED%' then
      raise;
    end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);

do $$
begin
  perform academy.admin_set_user_capabilities(
    'academy-admin@example.test',
    array['ACADEMY_TEACHERS_VIEW', 'ACADEMY_PROGRESS_VIEW']
  );
  raise exception 'academy admin unexpectedly removed its own catalog capability';
exception
  when insufficient_privilege then
    if sqlerrm not like '%ACADEMY_ADMIN_SELF_LOCKOUT_BLOCKED%' then
      raise;
    end if;
end;
$$;

select pg_temp.assert_true(
  academy.i_have_capability('ACADEMY_CATALOG_MANAGE'),
  'self-lockout protection must preserve the current catalog capability'
);

select academy.admin_set_user_capabilities('english-teacher@example.test', array[]::text[]);

select pg_temp.assert_true(
  (select count(*) = 1 from academy.admin_list_academy_admins()),
  'revoking the scoped test admin must restore the original admin set'
);

select pg_temp.assert_true(
  (
    select count(*) = 4
      and count(*) filter (where action = 'PROGRAM_PUBLISHED') = 1
      and count(*) filter (where action = 'SETTINGS_UPDATED') = 1
      and count(*) filter (where action = 'CAPABILITY_GRANTED') = 1
      and count(*) filter (where action = 'CAPABILITY_REVOKED') = 1
    from academy.admin_list_audit_log(75)
  ),
  'audit log must record the exact publish, settings, grant and revoke events'
);

select pg_temp.assert_true(
  (
    select count(*) = 20
    from pg_tables
    where schemaname = 'academy' and rowsecurity
  ),
  'all twenty academy tables must have RLS enabled'
);

reset role;
