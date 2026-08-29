-- Teacher Academy MVP learning content and progress.

begin;

create table academy.courses (
  id uuid primary key default gen_random_uuid(),
  program_version_id uuid not null references academy.program_versions(id) on delete cascade,
  title text not null check (length(btrim(title)) between 2 and 180),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_version_id, display_order)
);

create trigger academy_courses_set_updated_at
before update on academy.courses
for each row execute function academy.set_updated_at();

create table academy.modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references academy.courses(id) on delete cascade,
  title text not null check (length(btrim(title)) between 2 and 180),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, display_order)
);

create trigger academy_modules_set_updated_at
before update on academy.modules
for each row execute function academy.set_updated_at();

create table academy.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references academy.modules(id) on delete cascade,
  title text not null check (length(btrim(title)) between 2 and 180),
  lesson_type text not null check (lesson_type in ('TEXT', 'VIDEO', 'LINK')),
  content text not null default '' check (length(content) <= 50000),
  resource_url text check (
    resource_url is null
    or (length(resource_url) <= 2000 and resource_url ~ '^https://')
  ),
  duration_minutes integer not null default 10 check (duration_minutes between 1 and 1440),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, display_order),
  check (
    (lesson_type = 'TEXT' and length(btrim(content)) > 0)
    or
    (lesson_type in ('VIDEO', 'LINK') and resource_url is not null)
  )
);

create index academy_lessons_module_idx
  on academy.lessons (module_id, display_order);

create trigger academy_lessons_set_updated_at
before update on academy.lessons
for each row execute function academy.set_updated_at();

create table academy.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references academy.enrollments(id) on delete cascade,
  lesson_id uuid not null references academy.lessons(id) on delete restrict,
  completed_at timestamptz not null default now(),
  unique (enrollment_id, lesson_id)
);

create index academy_lesson_progress_enrollment_idx
  on academy.lesson_progress (enrollment_id, completed_at desc);

create or replace function academy.program_version_for_module(p_module_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select courses.program_version_id
  from academy.modules modules
  join academy.courses courses on courses.id = modules.course_id
  where modules.id = p_module_id;
$$;

create or replace function academy.program_version_for_lesson(p_lesson_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select courses.program_version_id
  from academy.lessons lessons
  join academy.modules modules on modules.id = lessons.module_id
  join academy.courses courses on courses.id = modules.course_id
  where lessons.id = p_lesson_id;
$$;

create or replace function academy.require_draft_content_parent()
returns trigger
language plpgsql
set search_path = pg_catalog, academy
as $$
declare
  v_program_version_id uuid;
begin
  if tg_table_name = 'courses' then
    if tg_op = 'DELETE' then
      v_program_version_id := old.program_version_id;
    else
      v_program_version_id := new.program_version_id;
    end if;
  elsif tg_table_name = 'modules' then
    select courses.program_version_id into v_program_version_id
    from academy.courses courses
    where courses.id = case when tg_op = 'DELETE' then old.course_id else new.course_id end;
  elsif tg_table_name = 'lessons' then
    if tg_op = 'DELETE' then
      v_program_version_id := academy.program_version_for_module(old.module_id);
    else
      v_program_version_id := academy.program_version_for_module(new.module_id);
    end if;
  else
    raise exception 'UNSUPPORTED_ACADEMY_CONTENT_TABLE';
  end if;

  if not exists (
    select 1
    from academy.program_versions versions
    where versions.id = v_program_version_id
      and versions.status = 'DRAFT'
  ) then
    raise exception 'PUBLISHED_ACADEMY_CONTENT_IS_IMMUTABLE';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger academy_courses_require_draft
before insert or update or delete on academy.courses
for each row execute function academy.require_draft_content_parent();

create trigger academy_modules_require_draft
before insert or update or delete on academy.modules
for each row execute function academy.require_draft_content_parent();

create trigger academy_lessons_require_draft
before insert or update or delete on academy.lessons
for each row execute function academy.require_draft_content_parent();

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
      select 1
      from academy.program_version_subjects targets
      where targets.program_version_id = new.id
    ) then
      raise exception 'SUBJECT_TARGET_REQUIRED';
    end if;

    if new.audience_type = 'ALL_TEACHERS' and exists (
      select 1
      from academy.program_version_subjects targets
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
  end if;

  return new;
end;
$$;

create or replace function academy.admin_list_lessons(p_program_version_id uuid)
returns table (
  lesson_id uuid,
  title text,
  lesson_type text,
  content text,
  resource_url text,
  duration_minutes integer,
  display_order integer
)
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select
    lessons.id,
    lessons.title,
    lessons.lesson_type,
    lessons.content,
    lessons.resource_url,
    lessons.duration_minutes,
    lessons.display_order
  from academy.courses courses
  join academy.modules modules on modules.course_id = courses.id
  join academy.lessons lessons on lessons.module_id = modules.id
  where academy.i_have_capability('ACADEMY_CATALOG_MANAGE')
    and courses.program_version_id = p_program_version_id
  order by courses.display_order, modules.display_order, lessons.display_order;
$$;

create or replace function academy.admin_add_lesson(
  p_program_version_id uuid,
  p_title text,
  p_lesson_type text,
  p_content text,
  p_resource_url text,
  p_duration_minutes integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_course_id uuid;
  v_module_id uuid;
  v_lesson_id uuid;
  v_next_order integer;
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from academy.program_versions versions
    where versions.id = p_program_version_id
      and versions.status = 'DRAFT'
  ) then
    raise exception 'DRAFT_PROGRAM_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if length(btrim(p_title)) not between 2 and 180
     or p_lesson_type not in ('TEXT', 'VIDEO', 'LINK')
     or p_duration_minutes not between 1 and 1440
     or length(coalesce(p_content, '')) > 50000
     or (p_lesson_type = 'TEXT' and length(btrim(coalesce(p_content, ''))) = 0)
     or (
       p_lesson_type in ('VIDEO', 'LINK')
       and coalesce(p_resource_url, '') !~ '^https://'
     ) then
    raise exception 'INVALID_LESSON_INPUT' using errcode = '22023';
  end if;

  select courses.id into v_course_id
  from academy.courses courses
  where courses.program_version_id = p_program_version_id
  order by courses.display_order
  limit 1;

  if v_course_id is null then
    insert into academy.courses (program_version_id, title, display_order)
    values (p_program_version_id, 'المحتوى التدريبي', 0)
    returning id into v_course_id;
  end if;

  select modules.id into v_module_id
  from academy.modules modules
  where modules.course_id = v_course_id
  order by modules.display_order
  limit 1;

  if v_module_id is null then
    insert into academy.modules (course_id, title, display_order)
    values (v_course_id, 'الوحدة الرئيسية', 0)
    returning id into v_module_id;
  end if;

  select coalesce(max(lessons.display_order), -1) + 1
  into v_next_order
  from academy.lessons lessons
  where lessons.module_id = v_module_id;

  insert into academy.lessons (
    module_id,
    title,
    lesson_type,
    content,
    resource_url,
    duration_minutes,
    display_order
  )
  values (
    v_module_id,
    btrim(p_title),
    p_lesson_type,
    coalesce(p_content, ''),
    nullif(btrim(coalesce(p_resource_url, '')), ''),
    p_duration_minutes,
    v_next_order
  )
  returning id into v_lesson_id;

  return v_lesson_id;
end;
$$;

create or replace function academy.admin_delete_lesson(p_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  delete from academy.lessons lessons
  using academy.modules modules, academy.courses courses, academy.program_versions versions
  where lessons.id = p_lesson_id
    and modules.id = lessons.module_id
    and courses.id = modules.course_id
    and versions.id = courses.program_version_id
    and versions.status = 'DRAFT';

  if not found then
    raise exception 'DRAFT_LESSON_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function academy.list_my_learning()
returns table (
  enrollment_id uuid,
  program_version_id uuid,
  title text,
  status text,
  completed_lessons integer,
  total_lessons integer
)
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select
    enrollments.id,
    versions.id,
    versions.title,
    enrollments.status,
    count(distinct progress.lesson_id)::integer,
    count(distinct lessons.id)::integer
  from academy.enrollments enrollments
  join academy.program_versions versions on versions.id = enrollments.program_version_id
  join academy.courses courses on courses.program_version_id = versions.id
  join academy.modules modules on modules.course_id = courses.id
  join academy.lessons lessons on lessons.module_id = modules.id
  left join academy.lesson_progress progress
    on progress.enrollment_id = enrollments.id
   and progress.lesson_id = lessons.id
  join academy.teacher_profiles profiles
    on profiles.user_id = enrollments.user_id
   and profiles.status = 'ACTIVE'
  where enrollments.user_id = auth.uid()
    and enrollments.status <> 'CANCELLED'
  group by enrollments.id, versions.id
  order by enrollments.enrolled_at desc;
$$;

create or replace function academy.get_learning_lessons(p_program_version_id uuid)
returns table (
  lesson_id uuid,
  title text,
  lesson_type text,
  content text,
  resource_url text,
  duration_minutes integer,
  completed boolean
)
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select
    lessons.id,
    lessons.title,
    lessons.lesson_type,
    lessons.content,
    lessons.resource_url,
    lessons.duration_minutes,
    progress.id is not null
  from academy.enrollments enrollments
  join academy.teacher_profiles profiles
    on profiles.user_id = enrollments.user_id
   and profiles.status = 'ACTIVE'
  join academy.courses courses on courses.program_version_id = enrollments.program_version_id
  join academy.modules modules on modules.course_id = courses.id
  join academy.lessons lessons on lessons.module_id = modules.id
  left join academy.lesson_progress progress
    on progress.enrollment_id = enrollments.id
   and progress.lesson_id = lessons.id
  where enrollments.user_id = auth.uid()
    and enrollments.program_version_id = p_program_version_id
    and enrollments.status <> 'CANCELLED'
  order by courses.display_order, modules.display_order, lessons.display_order;
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
    on profiles.user_id = enrollments.user_id
   and profiles.status = 'ACTIVE'
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

  if not exists (
    select 1
    from academy.courses courses
    join academy.modules modules on modules.course_id = courses.id
    join academy.lessons lessons on lessons.module_id = modules.id
    where courses.program_version_id = academy.program_version_for_lesson(p_lesson_id)
      and not exists (
        select 1
        from academy.lesson_progress progress
        where progress.enrollment_id = v_enrollment_id
          and progress.lesson_id = lessons.id
      )
  ) then
    update academy.enrollments
    set status = 'COMPLETED', completed_at = coalesce(completed_at, now())
    where id = v_enrollment_id;
  end if;
end;
$$;

alter table academy.courses enable row level security;
alter table academy.modules enable row level security;
alter table academy.lessons enable row level security;
alter table academy.lesson_progress enable row level security;

revoke all on academy.courses, academy.modules, academy.lessons, academy.lesson_progress
  from public, anon, authenticated;
revoke all on all functions in schema academy from public, anon, authenticated;

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
grant execute on all functions in schema academy to service_role;

commit;
