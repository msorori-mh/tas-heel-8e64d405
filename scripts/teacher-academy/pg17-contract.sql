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

select academy.admin_create_program(
  'إدارة صف الرياضيات بفاعلية',
  'برنامج عملي لمعلمي الرياضيات ضمن تجربة الأكاديمية المحدودة.',
  'SUBJECT_SPECIFIC',
  45,
  array[:'math_subject_id'::uuid]
) as version_id \gset

select academy.admin_add_lesson(
  :'version_id'::uuid,
  'تهيئة بيئة التعلم',
  'TEXT',
  'محتوى تدريبي آمن ومباشر لمعلم الرياضيات.',
  null,
  10
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

reset role;
