\set ON_ERROR_STOP on

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'Teacher Academy postverify failed: %', p_message;
  end if;
end;
$$;

\if :{?academy_admin_email}
\else
  \echo 'academy_admin_email is required'
  \quit 3
\endif

select pg_temp.assert_true(
  (
    select count(*) = 15
    from pg_class classes
    join pg_namespace namespaces on namespaces.oid = classes.relnamespace
    where namespaces.nspname = 'academy'
      and classes.relname in (
        'subjects', 'teacher_profiles', 'capability_grants', 'programs', 'program_versions',
        'program_version_subjects', 'enrollments', 'courses', 'modules', 'lessons',
        'lesson_progress', 'assessments', 'assessment_questions', 'assessment_attempts',
        'certificates'
      )
      and classes.relrowsecurity
  ),
  'all 15 academy tables must exist with RLS enabled'
);

select pg_temp.assert_true(
  (
    select count(*) = 0
    from information_schema.role_table_grants
    where table_schema = 'academy' and grantee = 'anon'
  ),
  'anon must not have direct academy table grants'
);

select pg_temp.assert_true(
  (
    select count(*) = 0
    from information_schema.routine_privileges
    where routine_schema = 'academy' and grantee = 'PUBLIC'
  ),
  'PUBLIC must not execute academy routines'
);

select pg_temp.assert_true(
  (
    select count(*) = 1 and bool_and(routine_name = 'verify_certificate')
    from information_schema.routine_privileges
    where routine_schema = 'academy' and grantee = 'anon'
  ),
  'verify_certificate must be the only academy routine executable by anon'
);

select pg_temp.assert_true(
  (select count(*) = 9 from academy.subjects where is_active),
  'the nine MVP subjects must be active'
);

insert into academy.capability_grants (user_id, capability, granted_by)
select users.id, capabilities.capability, users.id
from auth.users users
cross join unnest(array[
  'ACADEMY_CATALOG_MANAGE',
  'ACADEMY_TEACHERS_VIEW',
  'ACADEMY_PROGRESS_VIEW'
]) as capabilities(capability)
where lower(users.email) = lower(:'academy_admin_email')
on conflict (user_id, capability) where revoked_at is null do nothing;

select pg_temp.assert_true(
  (
    select count(*) = 3
    from academy.capability_grants grants
    join auth.users users on users.id = grants.user_id
    where lower(users.email) = lower(:'academy_admin_email')
      and grants.revoked_at is null
  ),
  'the academy administrator must have all three active academy capabilities'
);

select pg_temp.assert_true(
  (
    select count(*) = 12
    from pg_proc procedures
    join pg_namespace namespaces on namespaces.oid = procedures.pronamespace
    where namespaces.nspname = 'academy'
      and procedures.proname in (
        'list_visible_programs', 'self_enroll', 'list_my_learning', 'get_learning_lessons',
        'complete_lesson', 'get_assessment', 'submit_assessment', 'list_my_certificates',
        'verify_certificate', 'admin_list_programs', 'admin_list_teachers', 'admin_list_progress'
      )
  ),
  'all 12 launch-critical academy RPCs must exist exactly once'
);
