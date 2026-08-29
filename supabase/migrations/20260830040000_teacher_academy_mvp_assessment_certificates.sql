-- Teacher Academy MVP assessment and certificates.

begin;

create table academy.assessments (
  id uuid primary key default gen_random_uuid(),
  program_version_id uuid not null unique references academy.program_versions(id) on delete cascade,
  title text not null check (length(btrim(title)) between 2 and 180),
  pass_percentage integer not null default 70 check (pass_percentage between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger academy_assessments_set_updated_at
before update on academy.assessments
for each row execute function academy.set_updated_at();

create table academy.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references academy.assessments(id) on delete cascade,
  question_text text not null check (length(btrim(question_text)) between 3 and 2000),
  option_a text not null check (length(btrim(option_a)) between 1 and 1000),
  option_b text not null check (length(btrim(option_b)) between 1 and 1000),
  option_c text not null check (length(btrim(option_c)) between 1 and 1000),
  option_d text not null check (length(btrim(option_d)) between 1 and 1000),
  correct_option text not null check (correct_option in ('a', 'b', 'c', 'd')),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  unique (assessment_id, display_order)
);

create index academy_assessment_questions_assessment_idx
  on academy.assessment_questions (assessment_id, display_order);

create table academy.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references academy.enrollments(id) on delete cascade,
  assessment_id uuid not null references academy.assessments(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  score integer not null check (score >= 0),
  total integer not null check (total > 0 and score <= total),
  passed boolean not null,
  completed_at timestamptz not null default now(),
  unique (enrollment_id, assessment_id, attempt_number)
);

create index academy_assessment_attempts_enrollment_idx
  on academy.assessment_attempts (enrollment_id, completed_at desc);

create table academy.certificates (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null unique references academy.enrollments(id) on delete restrict,
  certificate_code text not null unique check (certificate_code ~ '^TAM-[A-F0-9]{20}$'),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete restrict,
  revocation_reason text check (
    revocation_reason is null or length(btrim(revocation_reason)) between 3 and 500
  ),
  check (
    (revoked_at is null and revoked_by is null and revocation_reason is null)
    or
    (revoked_at is not null and revoked_by is not null and revocation_reason is not null)
  )
);

create index academy_certificates_code_idx
  on academy.certificates (certificate_code);

create or replace function academy.require_draft_assessment_parent()
returns trigger
language plpgsql
set search_path = pg_catalog, academy
as $$
declare
  v_program_version_id uuid;
begin
  if tg_table_name = 'assessments' then
    if tg_op = 'DELETE' then
      v_program_version_id := old.program_version_id;
    else
      v_program_version_id := new.program_version_id;
    end if;
  elsif tg_table_name = 'assessment_questions' then
    select assessments.program_version_id into v_program_version_id
    from academy.assessments assessments
    where assessments.id = case
      when tg_op = 'DELETE' then old.assessment_id
      else new.assessment_id
    end;
  else
    raise exception 'UNSUPPORTED_ACADEMY_ASSESSMENT_TABLE';
  end if;

  if not exists (
    select 1
    from academy.program_versions versions
    where versions.id = v_program_version_id
      and versions.status = 'DRAFT'
  ) then
    raise exception 'PUBLISHED_ACADEMY_ASSESSMENT_IS_IMMUTABLE';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger academy_assessments_require_draft
before insert or update or delete on academy.assessments
for each row execute function academy.require_draft_assessment_parent();

create trigger academy_assessment_questions_require_draft
before insert or update or delete on academy.assessment_questions
for each row execute function academy.require_draft_assessment_parent();

create or replace function academy.protect_published_program_version()
returns trigger
language plpgsql
set search_path = pg_catalog, academy
as $$
begin
  if old.status = 'PUBLISHED' then
    raise exception 'PUBLISHED_PROGRAM_VERSION_IS_IMMUTABLE';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.status = 'PUBLISHED' then
    if new.audience_type = 'SUBJECT_SPECIFIC' and not exists (
      select 1 from academy.program_version_subjects targets
      where targets.program_version_id = new.id
    ) then
      raise exception 'SUBJECT_TARGET_REQUIRED';
    end if;

    if new.audience_type = 'ALL_TEACHERS' and exists (
      select 1 from academy.program_version_subjects targets
      where targets.program_version_id = new.id
    ) then
      raise exception 'ALL_TEACHERS_VERSION_CANNOT_HAVE_SUBJECT_TARGETS';
    end if;

    if not exists (
      select 1
      from academy.courses courses
      join academy.modules modules on modules.course_id = courses.id
      join academy.lessons lessons on lessons.module_id = modules.id
      where courses.program_version_id = new.id
    ) then
      raise exception 'PROGRAM_LESSON_REQUIRED';
    end if;

    if not exists (
      select 1
      from academy.assessments assessments
      join academy.assessment_questions questions on questions.assessment_id = assessments.id
      where assessments.program_version_id = new.id
    ) then
      raise exception 'PROGRAM_ASSESSMENT_QUESTION_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

create or replace function academy.admin_get_assessment(p_program_version_id uuid)
returns table (
  assessment_id uuid,
  assessment_title text,
  pass_percentage integer,
  question_id uuid,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_option text,
  display_order integer
)
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select
    assessments.id,
    assessments.title,
    assessments.pass_percentage,
    questions.id,
    questions.question_text,
    questions.option_a,
    questions.option_b,
    questions.option_c,
    questions.option_d,
    questions.correct_option,
    questions.display_order
  from academy.assessments assessments
  left join academy.assessment_questions questions on questions.assessment_id = assessments.id
  where academy.i_have_capability('ACADEMY_CATALOG_MANAGE')
    and assessments.program_version_id = p_program_version_id
  order by questions.display_order;
$$;

create or replace function academy.admin_save_assessment(
  p_program_version_id uuid,
  p_title text,
  p_pass_percentage integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_assessment_id uuid;
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from academy.program_versions versions
    where versions.id = p_program_version_id and versions.status = 'DRAFT'
  ) then
    raise exception 'DRAFT_PROGRAM_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if length(btrim(p_title)) not between 2 and 180
     or p_pass_percentage not between 1 and 100 then
    raise exception 'INVALID_ASSESSMENT_INPUT' using errcode = '22023';
  end if;

  insert into academy.assessments (program_version_id, title, pass_percentage)
  values (p_program_version_id, btrim(p_title), p_pass_percentage)
  on conflict (program_version_id) do update
    set title = excluded.title,
        pass_percentage = excluded.pass_percentage
  returning id into v_assessment_id;

  return v_assessment_id;
end;
$$;

create or replace function academy.admin_add_assessment_question(
  p_program_version_id uuid,
  p_question_text text,
  p_option_a text,
  p_option_b text,
  p_option_c text,
  p_option_d text,
  p_correct_option text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_assessment_id uuid;
  v_question_id uuid;
  v_next_order integer;
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  select assessments.id into v_assessment_id
  from academy.assessments assessments
  join academy.program_versions versions on versions.id = assessments.program_version_id
  where assessments.program_version_id = p_program_version_id
    and versions.status = 'DRAFT';

  if v_assessment_id is null then
    raise exception 'DRAFT_ASSESSMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if length(btrim(p_question_text)) not between 3 and 2000
     or length(btrim(p_option_a)) not between 1 and 1000
     or length(btrim(p_option_b)) not between 1 and 1000
     or length(btrim(p_option_c)) not between 1 and 1000
     or length(btrim(p_option_d)) not between 1 and 1000
     or p_correct_option not in ('a', 'b', 'c', 'd') then
    raise exception 'INVALID_ASSESSMENT_QUESTION' using errcode = '22023';
  end if;

  select coalesce(max(display_order), -1) + 1 into v_next_order
  from academy.assessment_questions questions
  where questions.assessment_id = v_assessment_id;

  insert into academy.assessment_questions (
    assessment_id, question_text, option_a, option_b, option_c, option_d,
    correct_option, display_order
  )
  values (
    v_assessment_id, btrim(p_question_text), btrim(p_option_a), btrim(p_option_b),
    btrim(p_option_c), btrim(p_option_d), p_correct_option, v_next_order
  )
  returning id into v_question_id;

  return v_question_id;
end;
$$;

create or replace function academy.admin_delete_assessment_question(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  delete from academy.assessment_questions questions
  using academy.assessments assessments, academy.program_versions versions
  where questions.id = p_question_id
    and assessments.id = questions.assessment_id
    and versions.id = assessments.program_version_id
    and versions.status = 'DRAFT';

  if not found then
    raise exception 'DRAFT_ASSESSMENT_QUESTION_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

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
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select
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
  if auth.uid() is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'INVALID_ASSESSMENT_SUBMISSION' using errcode = '22023';
  end if;

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
       where answer.value not in ('a', 'b', 'c', 'd')
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
  select v_attempt_id, v_score, v_total, v_passed, v_certificate_id, v_certificate_code;
end;
$$;

create or replace function academy.list_my_certificates()
returns table (
  certificate_id uuid,
  certificate_code text,
  program_title text,
  issued_at timestamptz,
  valid boolean
)
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select
    certificates.id,
    certificates.certificate_code,
    versions.title,
    certificates.issued_at,
    certificates.revoked_at is null
  from academy.certificates certificates
  join academy.enrollments enrollments on enrollments.id = certificates.enrollment_id
  join academy.program_versions versions on versions.id = enrollments.program_version_id
  where enrollments.user_id = auth.uid()
  order by certificates.issued_at desc;
$$;

create or replace function academy.verify_certificate(p_certificate_code text)
returns table (
  certificate_code text,
  teacher_name text,
  program_title text,
  issued_at timestamptz,
  valid boolean
)
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select
    certificates.certificate_code,
    profiles.full_name,
    versions.title,
    certificates.issued_at,
    certificates.revoked_at is null
  from academy.certificates certificates
  join academy.enrollments enrollments on enrollments.id = certificates.enrollment_id
  join academy.teacher_profiles profiles on profiles.user_id = enrollments.user_id
  join academy.program_versions versions on versions.id = enrollments.program_version_id
  where certificates.certificate_code = upper(btrim(p_certificate_code));
$$;

create or replace function academy.admin_list_progress()
returns table (
  enrollment_id uuid,
  teacher_name text,
  program_title text,
  enrollment_status text,
  completed_lessons integer,
  total_lessons integer,
  certificate_id uuid,
  certificate_code text,
  certificate_valid boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, academy
as $$
begin
  if not academy.i_have_capability('ACADEMY_PROGRESS_VIEW') then
    raise exception 'ACADEMY_PROGRESS_VIEW_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    enrollments.id,
    profiles.full_name,
    versions.title,
    enrollments.status::text,
    count(distinct progress.lesson_id)::integer,
    count(distinct lessons.id)::integer,
    certificates.id,
    certificates.certificate_code,
    case when certificates.id is null then null else certificates.revoked_at is null end
  from academy.enrollments enrollments
  join academy.teacher_profiles profiles on profiles.user_id = enrollments.user_id
  join academy.program_versions versions on versions.id = enrollments.program_version_id
  left join academy.courses courses on courses.program_version_id = versions.id
  left join academy.modules modules on modules.course_id = courses.id
  left join academy.lessons lessons on lessons.module_id = modules.id
  left join academy.lesson_progress progress
    on progress.enrollment_id = enrollments.id and progress.lesson_id = lessons.id
  left join academy.certificates certificates on certificates.enrollment_id = enrollments.id
  group by enrollments.id, profiles.full_name, versions.title, certificates.id, enrollments.enrolled_at
  order by enrollments.enrolled_at desc;
end;
$$;

create or replace function academy.admin_revoke_certificate(
  p_certificate_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
begin
  if not academy.i_have_capability('ACADEMY_PROGRESS_VIEW') then
    raise exception 'ACADEMY_PROGRESS_VIEW_REQUIRED' using errcode = '42501';
  end if;

  if length(btrim(p_reason)) not between 3 and 500 then
    raise exception 'INVALID_REVOCATION_REASON' using errcode = '22023';
  end if;

  update academy.certificates
  set revoked_at = now(), revoked_by = auth.uid(), revocation_reason = btrim(p_reason)
  where id = p_certificate_id and revoked_at is null;

  if not found then
    raise exception 'ACTIVE_CERTIFICATE_NOT_FOUND' using errcode = 'P0002';
  end if;
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
  limit 1;

  if v_enrollment_id is null then
    raise exception 'ACTIVE_ENROLLMENT_REQUIRED' using errcode = '42501';
  end if;

  insert into academy.lesson_progress (enrollment_id, lesson_id)
  values (v_enrollment_id, p_lesson_id)
  on conflict (enrollment_id, lesson_id) do nothing;
end;
$$;

alter table academy.assessments enable row level security;
alter table academy.assessment_questions enable row level security;
alter table academy.assessment_attempts enable row level security;
alter table academy.certificates enable row level security;

revoke all on academy.assessments, academy.assessment_questions,
  academy.assessment_attempts, academy.certificates
  from public, anon, authenticated;
revoke all on all functions in schema academy from public, anon, authenticated;

grant usage on schema academy to anon;
grant execute on function academy.i_have_capability(text) to authenticated;
grant execute on function academy.profile_is_complete(uuid) to authenticated;
grant execute on function academy.list_visible_programs() to authenticated;
grant execute on function academy.self_enroll(uuid) to authenticated;
grant execute on function academy.admin_list_programs() to authenticated;
grant execute on function academy.admin_create_program(text, text, text, integer, uuid[]) to authenticated;
grant execute on function academy.admin_update_draft_program(uuid, text, text, text, integer, uuid[]) to authenticated;
grant execute on function academy.admin_publish_program(uuid) to authenticated;
grant execute on function academy.admin_list_teachers() to authenticated;
grant execute on function academy.admin_set_teacher_status(uuid, text) to authenticated;
grant execute on function academy.admin_list_lessons(uuid) to authenticated;
grant execute on function academy.admin_add_lesson(uuid, text, text, text, text, integer) to authenticated;
grant execute on function academy.admin_delete_lesson(uuid) to authenticated;
grant execute on function academy.list_my_learning() to authenticated;
grant execute on function academy.get_learning_lessons(uuid) to authenticated;
grant execute on function academy.complete_lesson(uuid) to authenticated;
grant execute on function academy.admin_get_assessment(uuid) to authenticated;
grant execute on function academy.admin_save_assessment(uuid, text, integer) to authenticated;
grant execute on function academy.admin_add_assessment_question(uuid, text, text, text, text, text, text)
  to authenticated;
grant execute on function academy.admin_delete_assessment_question(uuid) to authenticated;
grant execute on function academy.get_assessment(uuid) to authenticated;
grant execute on function academy.submit_assessment(uuid, jsonb) to authenticated;
grant execute on function academy.list_my_certificates() to authenticated;
grant execute on function academy.verify_certificate(text) to anon, authenticated;
grant execute on function academy.admin_list_progress() to authenticated;
grant execute on function academy.admin_revoke_certificate(uuid, text) to authenticated;
grant execute on all functions in schema academy to service_role;

commit;
