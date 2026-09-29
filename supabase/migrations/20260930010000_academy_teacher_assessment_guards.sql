-- Teacher audit: ordered progress and bounded assessment attempts.
-- Apply only through the normal reviewed migration release; no live data rewrite.
begin;

create or replace function academy.require_assessment_access(p_program_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_enrollment_id uuid;
  v_status text;
  v_recent integer;
  v_last timestamptz;
begin
  -- Serializes parallel submissions for the same teacher/program.
  select e.id, e.status into v_enrollment_id, v_status
  from academy.enrollments e
  join academy.teacher_profiles p on p.user_id = e.user_id and p.status = 'ACTIVE'
  where e.user_id = auth.uid() and e.program_version_id = p_program_version_id
    and e.status in ('ACTIVE', 'COMPLETED')
  for update of e;
  if v_enrollment_id is null then
    raise exception 'ACTIVE_ENROLLMENT_REQUIRED' using errcode = '42501';
  end if;
  if v_status = 'COMPLETED' or exists (
    select 1 from academy.assessment_attempts a where a.enrollment_id = v_enrollment_id and a.passed
  ) then
    raise exception 'ASSESSMENT_ALREADY_PASSED' using errcode = '42501';
  end if;
  if exists (
    select 1 from academy.courses c join academy.modules m on m.course_id = c.id
    join academy.lessons l on l.module_id = m.id
    where c.program_version_id = p_program_version_id
      and not exists (select 1 from academy.lesson_progress p
        where p.enrollment_id = v_enrollment_id and p.lesson_id = l.id)
  ) then
    raise exception 'COMPLETE_LESSONS_BEFORE_ASSESSMENT' using errcode = '42501';
  end if;
  select count(*)::integer, max(a.completed_at) into v_recent, v_last
  from academy.assessment_attempts a
  where a.enrollment_id = v_enrollment_id and a.completed_at > clock_timestamp() - interval '24 hours';
  if v_recent >= 3 then
    raise exception 'ASSESSMENT_ATTEMPT_LIMIT' using errcode = '42501';
  end if;
  if v_last > clock_timestamp() - interval '15 minutes' then
    raise exception 'ASSESSMENT_COOLDOWN' using errcode = '42501';
  end if;
  return v_enrollment_id;
end;
$$;
revoke all on function academy.require_assessment_access(uuid) from public, anon, authenticated;

create or replace function academy.get_assessment(p_program_version_id uuid)
returns table (
  assessment_id uuid,
  title text,
  pass_percentage integer,
  question_id uuid,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  display_order integer
)
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
begin
  perform academy.require_assessment_access(p_program_version_id);
  return query select
    assessments.id,
    assessments.title,
    assessments.pass_percentage,
    questions.id,
    questions.question_text,
    questions.option_a,
    questions.option_b,
    questions.option_c,
    questions.option_d,
    questions.display_order
  from academy.enrollments enrollments
  join academy.teacher_profiles profiles
    on profiles.user_id = enrollments.user_id and profiles.status = 'ACTIVE'
  join academy.assessments assessments
    on assessments.program_version_id = enrollments.program_version_id
  join academy.assessment_questions questions
    on questions.assessment_id = assessments.id
  where enrollments.user_id = auth.uid()
    and enrollments.program_version_id = p_program_version_id
    and enrollments.status <> 'CANCELLED'
  order by questions.display_order;
end;
$$;

create or replace function academy.submit_assessment(
  p_program_version_id uuid,
  p_answers jsonb
)
returns table (
  attempt_id uuid,
  score integer,
  total integer,
  passed boolean,
  certificate_id uuid,
  certificate_code text
)
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_enrollment_id uuid;
  v_assessment_id uuid;
  v_pass_percentage integer;
  v_total integer;
  v_score integer;
  v_attempt_number integer;
  v_attempt_id uuid;
  v_passed boolean;
  v_certificate_id uuid;
  v_certificate_code text;
begin
  if auth.uid() is null or jsonb_typeof(p_answers) is distinct from 'object' then
    raise exception 'INVALID_ASSESSMENT_SUBMISSION' using errcode = '22023';
  end if;

  perform academy.require_assessment_access(p_program_version_id);

  select enrollments.id, assessments.id, assessments.pass_percentage
  into v_enrollment_id, v_assessment_id, v_pass_percentage
  from academy.enrollments enrollments
  join academy.teacher_profiles profiles
    on profiles.user_id = enrollments.user_id and profiles.status = 'ACTIVE'
  join academy.assessments assessments
    on assessments.program_version_id = enrollments.program_version_id
  where enrollments.user_id = auth.uid()
    and enrollments.program_version_id = p_program_version_id
    and enrollments.status in ('ACTIVE', 'COMPLETED');

  if v_enrollment_id is null then
    raise exception 'ACTIVE_ENROLLMENT_REQUIRED' using errcode = '42501';
  end if;

  if exists (
    select 1
    from academy.courses courses
    join academy.modules modules on modules.course_id = courses.id
    join academy.lessons lessons on lessons.module_id = modules.id
    where courses.program_version_id = p_program_version_id
      and not exists (
        select 1 from academy.lesson_progress progress
        where progress.enrollment_id = v_enrollment_id and progress.lesson_id = lessons.id
      )
  ) then
    raise exception 'COMPLETE_LESSONS_BEFORE_ASSESSMENT' using errcode = '42501';
  end if;

  select count(*)::integer into v_total
  from academy.assessment_questions questions
  where questions.assessment_id = v_assessment_id;

  if v_total = 0
     or (select count(*) from jsonb_object_keys(p_answers)) <> v_total
     or exists (
       select 1 from jsonb_each_text(p_answers) answer
       where answer.value is null or answer.value not in ('a', 'b', 'c', 'd')
     )
     or exists (
       select 1 from jsonb_object_keys(p_answers) as keys(answer_key)
       where not exists (
         select 1 from academy.assessment_questions questions
         where questions.assessment_id = v_assessment_id
           and questions.id::text = keys.answer_key
       )
     ) then
    raise exception 'ALL_VALID_ANSWERS_REQUIRED' using errcode = '22023';
  end if;

  select count(*)::integer into v_score
  from academy.assessment_questions questions
  where questions.assessment_id = v_assessment_id
    and p_answers ->> questions.id::text = questions.correct_option;

  v_passed := (v_score * 100) >= (v_total * v_pass_percentage);

  select coalesce(max(attempt_number), 0) + 1 into v_attempt_number
  from academy.assessment_attempts attempts
  where attempts.enrollment_id = v_enrollment_id
    and attempts.assessment_id = v_assessment_id;

  insert into academy.assessment_attempts (
    enrollment_id, assessment_id, attempt_number, answers, score, total, passed
  ) values (
    v_enrollment_id, v_assessment_id, v_attempt_number, p_answers, v_score, v_total, v_passed
  ) returning id into v_attempt_id;

  if v_passed then
    update academy.enrollments
    set status = 'COMPLETED', completed_at = coalesce(completed_at, now())
    where id = v_enrollment_id;

    insert into academy.certificates (enrollment_id, certificate_code)
    values (
      v_enrollment_id,
      'TAM-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 20))
    )
    on conflict (enrollment_id) do update set enrollment_id = excluded.enrollment_id
    returning id, certificates.certificate_code
    into v_certificate_id, v_certificate_code;
  end if;

  return query
  select v_attempt_id, case when v_passed then v_score else null::integer end, v_total, v_passed, v_certificate_id, v_certificate_code;
end;
$$;

create or replace function academy.complete_lesson(p_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_enrollment_id uuid;
begin
  select enrollments.id into v_enrollment_id
  from academy.enrollments enrollments
  join academy.teacher_profiles profiles
    on profiles.user_id = enrollments.user_id and profiles.status = 'ACTIVE'
  where enrollments.user_id = auth.uid()
    and enrollments.status in ('ACTIVE', 'COMPLETED')
    and enrollments.program_version_id = academy.program_version_for_lesson(p_lesson_id)
  limit 1 for update of enrollments;

  if v_enrollment_id is null then
    raise exception 'ACTIVE_ENROLLMENT_REQUIRED' using errcode = '42501';
  end if;

  -- Previously completed lessons remain idempotent, including old certificates.
  if exists (select 1 from academy.lesson_progress p
    where p.enrollment_id = v_enrollment_id and p.lesson_id = p_lesson_id) then return; end if;
  if exists (
    select 1
    from academy.lessons target
    join academy.modules tm on tm.id = target.module_id
    join academy.courses tc on tc.id = tm.course_id
    join academy.courses c on c.program_version_id = tc.program_version_id
    join academy.modules m on m.course_id = c.id
    join academy.lessons l on l.module_id = m.id
    where target.id = p_lesson_id
      and (c.display_order, m.display_order, l.display_order) < (tc.display_order, tm.display_order, target.display_order)
      and not exists (select 1 from academy.lesson_progress p
        where p.enrollment_id = v_enrollment_id and p.lesson_id = l.id)
  ) then
    raise exception 'PREVIOUS_LESSONS_REQUIRED' using errcode = '42501';
  end if;

  insert into academy.lesson_progress (enrollment_id, lesson_id)
  values (v_enrollment_id, p_lesson_id)
  on conflict (enrollment_id, lesson_id) do nothing;
end;
$$;

revoke all on function academy.get_assessment(uuid), academy.submit_assessment(uuid,jsonb), academy.complete_lesson(uuid) from public, anon;
grant execute on function academy.get_assessment(uuid), academy.submit_assessment(uuid,jsonb), academy.complete_lesson(uuid) to authenticated;
commit;
