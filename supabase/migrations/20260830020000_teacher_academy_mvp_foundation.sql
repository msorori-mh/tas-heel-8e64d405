-- Teacher Academy MVP foundation.
-- This migration is intentionally isolated from the student profile, app_role,
-- curriculum, and question-bank authorization models.

begin;

create schema if not exists academy;

revoke all on schema academy from public, anon, authenticated;
grant usage on schema academy to authenticated, service_role;

create or replace function academy.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function academy.set_updated_at() from public, anon, authenticated;

create table academy.subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_]{2,40}$'),
  name_ar text not null unique check (length(btrim(name_ar)) between 2 and 100),
  is_active boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger academy_subjects_set_updated_at
before update on academy.subjects
for each row execute function academy.set_updated_at();

create table academy.teacher_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 3 and 160),
  primary_subject_id uuid not null references academy.subjects(id) on delete restrict,
  governorate_id uuid not null references public.governorates(id) on delete restrict,
  school_name text not null check (length(btrim(school_name)) between 2 and 180),
  phone text not null check (
    length(btrim(phone)) between 7 and 20
    and btrim(phone) ~ '^\+?[0-9][0-9 ()-]{5,18}[0-9]$'
  ),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index academy_teacher_profiles_subject_idx
  on academy.teacher_profiles (primary_subject_id, status);
create index academy_teacher_profiles_governorate_idx
  on academy.teacher_profiles (governorate_id, status);

create trigger academy_teacher_profiles_set_updated_at
before update on academy.teacher_profiles
for each row execute function academy.set_updated_at();

create table academy.capability_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null check (
    capability in (
      'ACADEMY_CATALOG_MANAGE',
      'ACADEMY_TEACHERS_VIEW',
      'ACADEMY_PROGRESS_VIEW'
    )
  ),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= granted_at)
);

create unique index academy_capability_grants_active_uq
  on academy.capability_grants (user_id, capability)
  where revoked_at is null;

create table academy.programs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  current_published_version_id uuid,
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger academy_programs_set_updated_at
before update on academy.programs
for each row execute function academy.set_updated_at();

create table academy.program_versions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references academy.programs(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null check (length(btrim(title)) between 3 and 180),
  summary text not null check (length(btrim(summary)) between 10 and 600),
  audience_type text not null check (
    audience_type in ('ALL_TEACHERS', 'SUBJECT_SPECIFIC')
  ),
  estimated_minutes integer not null default 60 check (estimated_minutes between 1 and 100000),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED')),
  created_by uuid not null references auth.users(id) on delete restrict,
  published_by uuid references auth.users(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, version_number),
  check (
    (status = 'DRAFT' and published_at is null and published_by is null)
    or
    (status = 'PUBLISHED' and published_at is not null and published_by is not null)
  )
);

alter table academy.programs
  add constraint academy_programs_current_version_fkey
  foreign key (current_published_version_id)
  references academy.program_versions(id)
  on delete restrict;

create index academy_program_versions_program_idx
  on academy.program_versions (program_id, version_number desc);

create trigger academy_program_versions_set_updated_at
before update on academy.program_versions
for each row execute function academy.set_updated_at();

create table academy.program_version_subjects (
  program_version_id uuid not null references academy.program_versions(id) on delete cascade,
  subject_id uuid not null references academy.subjects(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (program_version_id, subject_id)
);

create index academy_program_version_subjects_subject_idx
  on academy.program_version_subjects (subject_id, program_version_id);

create table academy.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_version_id uuid not null references academy.program_versions(id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, program_version_id),
  check (
    (status = 'COMPLETED' and completed_at is not null)
    or
    (status <> 'COMPLETED' and completed_at is null)
  )
);

create index academy_enrollments_user_idx
  on academy.enrollments (user_id, enrolled_at desc);

create or replace function academy.i_have_capability(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select
    auth.uid() is not null
    and p_capability in (
      'ACADEMY_CATALOG_MANAGE',
      'ACADEMY_TEACHERS_VIEW',
      'ACADEMY_PROGRESS_VIEW'
    )
    and exists (
      select 1
      from academy.capability_grants grants
      where grants.user_id = auth.uid()
        and grants.capability = p_capability
        and grants.revoked_at is null
    );
$$;

create or replace function academy.profile_is_complete(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select
    auth.uid() is not null
    and p_user_id = auth.uid()
    and exists (
      select 1
      from academy.teacher_profiles profiles
      join academy.subjects subjects
        on subjects.id = profiles.primary_subject_id
       and subjects.is_active
      where profiles.user_id = auth.uid()
        and profiles.status = 'ACTIVE'
        and length(btrim(profiles.full_name)) >= 3
        and length(btrim(profiles.school_name)) >= 2
        and length(btrim(profiles.phone)) >= 7
    );
$$;

create or replace function academy.list_visible_programs()
returns table (
  program_id uuid,
  program_version_id uuid,
  slug text,
  title text,
  summary text,
  subject_name text,
  estimated_minutes integer,
  enrolled boolean
)
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select
    programs.id,
    versions.id,
    programs.slug,
    versions.title,
    versions.summary,
    case
      when versions.audience_type = 'ALL_TEACHERS' then null
      else subjects.name_ar
    end,
    versions.estimated_minutes,
    exists (
      select 1
      from academy.enrollments enrollments
      where enrollments.user_id = auth.uid()
        and enrollments.program_version_id = versions.id
        and enrollments.status <> 'CANCELLED'
    )
  from academy.teacher_profiles profiles
  join academy.programs programs
    on programs.archived_at is null
   and programs.current_published_version_id is not null
  join academy.program_versions versions
    on versions.id = programs.current_published_version_id
   and versions.status = 'PUBLISHED'
  left join academy.program_version_subjects targets
    on targets.program_version_id = versions.id
   and targets.subject_id = profiles.primary_subject_id
  left join academy.subjects subjects
    on subjects.id = targets.subject_id
  where profiles.user_id = auth.uid()
    and profiles.status = 'ACTIVE'
    and (
      versions.audience_type = 'ALL_TEACHERS'
      or (
        versions.audience_type = 'SUBJECT_SPECIFIC'
        and targets.subject_id is not null
      )
    )
  order by versions.published_at desc, versions.title;
$$;

create or replace function academy.self_enroll(p_program_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_enrollment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if not academy.profile_is_complete(auth.uid()) then
    raise exception 'TEACHER_PROFILE_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from academy.teacher_profiles profiles
    join academy.programs programs
      on programs.current_published_version_id = p_program_version_id
     and programs.archived_at is null
    join academy.program_versions versions
      on versions.id = p_program_version_id
     and versions.status = 'PUBLISHED'
    left join academy.program_version_subjects targets
      on targets.program_version_id = versions.id
     and targets.subject_id = profiles.primary_subject_id
    where profiles.user_id = auth.uid()
      and profiles.status = 'ACTIVE'
      and (
        versions.audience_type = 'ALL_TEACHERS'
        or (
          versions.audience_type = 'SUBJECT_SPECIFIC'
          and targets.subject_id is not null
        )
      )
  ) then
    raise exception 'PROGRAM_NOT_VISIBLE' using errcode = '42501';
  end if;

  insert into academy.enrollments (user_id, program_version_id)
  values (auth.uid(), p_program_version_id)
  on conflict (user_id, program_version_id)
  do update set user_id = excluded.user_id
  returning id into v_enrollment_id;

  return v_enrollment_id;
end;
$$;

create or replace function academy.admin_list_programs()
returns table (
  program_id uuid,
  program_version_id uuid,
  title text,
  summary text,
  audience_type text,
  subject_names text,
  estimated_minutes integer,
  status text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select
    programs.id,
    versions.id,
    versions.title,
    versions.summary,
    versions.audience_type,
    string_agg(subjects.name_ar, '، ' order by subjects.display_order),
    versions.estimated_minutes,
    versions.status,
    versions.published_at
  from academy.programs programs
  join academy.program_versions versions
    on versions.program_id = programs.id
  left join academy.program_version_subjects targets
    on targets.program_version_id = versions.id
  left join academy.subjects subjects
    on subjects.id = targets.subject_id
  where academy.i_have_capability('ACADEMY_CATALOG_MANAGE')
  group by programs.id, versions.id
  order by versions.created_at desc;
$$;

create or replace function academy.admin_create_program(
  p_title text,
  p_summary text,
  p_audience_type text,
  p_estimated_minutes integer,
  p_subject_ids uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_program_id uuid;
  v_program_version_id uuid;
  v_subject_count integer;
  v_distinct_subject_count integer;
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  if length(btrim(p_title)) not between 3 and 180
     or length(btrim(p_summary)) not between 10 and 600
     or p_estimated_minutes not between 1 and 100000
     or p_audience_type not in ('ALL_TEACHERS', 'SUBJECT_SPECIFIC') then
    raise exception 'INVALID_PROGRAM_INPUT' using errcode = '22023';
  end if;

  select count(*), count(distinct subject_id)
  into v_subject_count, v_distinct_subject_count
  from unnest(coalesce(p_subject_ids, array[]::uuid[])) as subject_id;

  if p_audience_type = 'ALL_TEACHERS' and v_subject_count > 0 then
    raise exception 'ALL_TEACHERS_VERSION_CANNOT_HAVE_SUBJECT_TARGETS' using errcode = '22023';
  end if;

  if p_audience_type = 'SUBJECT_SPECIFIC' and v_distinct_subject_count = 0 then
    raise exception 'SUBJECT_TARGET_REQUIRED' using errcode = '22023';
  end if;

  if p_audience_type = 'SUBJECT_SPECIFIC' and (
    select count(*)
    from academy.subjects subjects
    where subjects.id = any(p_subject_ids)
      and subjects.is_active
  ) <> v_distinct_subject_count then
    raise exception 'INVALID_OR_INACTIVE_SUBJECT_TARGET' using errcode = '22023';
  end if;

  insert into academy.programs (slug, created_by)
  values (
    'program-' || left(replace(gen_random_uuid()::text, '-', ''), 16),
    auth.uid()
  )
  returning id into v_program_id;

  insert into academy.program_versions (
    program_id,
    version_number,
    title,
    summary,
    audience_type,
    estimated_minutes,
    created_by
  )
  values (
    v_program_id,
    1,
    btrim(p_title),
    btrim(p_summary),
    p_audience_type,
    p_estimated_minutes,
    auth.uid()
  )
  returning id into v_program_version_id;

  if p_audience_type = 'SUBJECT_SPECIFIC' then
    insert into academy.program_version_subjects (program_version_id, subject_id)
    select v_program_version_id, subject_id
    from unnest(p_subject_ids) as subject_id
    group by subject_id;
  end if;

  return v_program_version_id;
end;
$$;

create or replace function academy.admin_update_draft_program(
  p_program_version_id uuid,
  p_title text,
  p_summary text,
  p_audience_type text,
  p_estimated_minutes integer,
  p_subject_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_subject_count integer;
  v_distinct_subject_count integer;
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

  if length(btrim(p_title)) not between 3 and 180
     or length(btrim(p_summary)) not between 10 and 600
     or p_estimated_minutes not between 1 and 100000
     or p_audience_type not in ('ALL_TEACHERS', 'SUBJECT_SPECIFIC') then
    raise exception 'INVALID_PROGRAM_INPUT' using errcode = '22023';
  end if;

  select count(*), count(distinct subject_id)
  into v_subject_count, v_distinct_subject_count
  from unnest(coalesce(p_subject_ids, array[]::uuid[])) as subject_id;

  if p_audience_type = 'ALL_TEACHERS' and v_subject_count > 0 then
    raise exception 'ALL_TEACHERS_VERSION_CANNOT_HAVE_SUBJECT_TARGETS' using errcode = '22023';
  end if;

  if p_audience_type = 'SUBJECT_SPECIFIC' and v_distinct_subject_count = 0 then
    raise exception 'SUBJECT_TARGET_REQUIRED' using errcode = '22023';
  end if;

  if p_audience_type = 'SUBJECT_SPECIFIC' and (
    select count(*)
    from academy.subjects subjects
    where subjects.id = any(p_subject_ids)
      and subjects.is_active
  ) <> v_distinct_subject_count then
    raise exception 'INVALID_OR_INACTIVE_SUBJECT_TARGET' using errcode = '22023';
  end if;

  delete from academy.program_version_subjects
  where program_version_id = p_program_version_id;

  if p_audience_type = 'SUBJECT_SPECIFIC' then
    insert into academy.program_version_subjects (program_version_id, subject_id)
    select p_program_version_id, subject_id
    from unnest(p_subject_ids) as subject_id
    group by subject_id;
  end if;

  update academy.program_versions
  set title = btrim(p_title),
      summary = btrim(p_summary),
      audience_type = p_audience_type,
      estimated_minutes = p_estimated_minutes
  where id = p_program_version_id;
end;
$$;

create or replace function academy.admin_publish_program(
  p_program_version_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_program_id uuid;
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  update academy.program_versions
  set status = 'PUBLISHED',
      published_by = auth.uid(),
      published_at = now()
  where id = p_program_version_id
    and status = 'DRAFT'
  returning program_id into v_program_id;

  if v_program_id is null then
    raise exception 'DRAFT_PROGRAM_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  update academy.programs
  set current_published_version_id = p_program_version_id
  where id = v_program_id;
end;
$$;

create or replace function academy.admin_list_teachers()
returns table (
  user_id uuid,
  full_name text,
  subject_name text,
  governorate_name text,
  school_name text,
  phone text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, academy, public
as $$
  select
    profiles.user_id,
    profiles.full_name,
    subjects.name_ar,
    governorates.name,
    profiles.school_name,
    profiles.phone,
    profiles.status,
    profiles.created_at
  from academy.teacher_profiles profiles
  join academy.subjects subjects
    on subjects.id = profiles.primary_subject_id
  join public.governorates governorates
    on governorates.id = profiles.governorate_id
  where academy.i_have_capability('ACADEMY_TEACHERS_VIEW')
  order by profiles.created_at desc;
$$;

create or replace function academy.admin_set_teacher_status(
  p_user_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
begin
  if not academy.i_have_capability('ACADEMY_TEACHERS_VIEW') then
    raise exception 'ACADEMY_TEACHERS_VIEW_REQUIRED' using errcode = '42501';
  end if;

  if p_status not in ('ACTIVE', 'SUSPENDED') then
    raise exception 'INVALID_TEACHER_STATUS' using errcode = '22023';
  end if;

  update academy.teacher_profiles
  set status = p_status
  where user_id = p_user_id;

  if not found then
    raise exception 'TEACHER_PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

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
  end if;

  return new;
end;
$$;

create trigger academy_program_versions_immutable_after_publish
before update or delete on academy.program_versions
for each row execute function academy.protect_published_program_version();

create or replace function academy.protect_published_program_targets()
returns trigger
language plpgsql
set search_path = pg_catalog, academy
as $$
declare
  v_program_version_id uuid;
begin
  if tg_op = 'DELETE' then
    v_program_version_id := old.program_version_id;
  else
    v_program_version_id := new.program_version_id;
  end if;

  if exists (
    select 1
    from academy.program_versions versions
    where versions.id = v_program_version_id
      and versions.status = 'PUBLISHED'
  ) then
    raise exception 'PUBLISHED_PROGRAM_TARGETS_ARE_IMMUTABLE';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger academy_program_targets_immutable_after_publish
before insert or update or delete on academy.program_version_subjects
for each row execute function academy.protect_published_program_targets();

alter table academy.subjects enable row level security;
alter table academy.teacher_profiles enable row level security;
alter table academy.capability_grants enable row level security;
alter table academy.programs enable row level security;
alter table academy.program_versions enable row level security;
alter table academy.program_version_subjects enable row level security;
alter table academy.enrollments enable row level security;

create policy academy_subjects_read_active
on academy.subjects
for select
to authenticated
using (is_active or academy.i_have_capability('ACADEMY_CATALOG_MANAGE'));

create policy academy_teacher_profiles_read
on academy.teacher_profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or academy.i_have_capability('ACADEMY_TEACHERS_VIEW')
);

create policy academy_teacher_profiles_insert_self
on academy.teacher_profiles
for insert
to authenticated
with check (user_id = auth.uid() and status = 'ACTIVE');

create policy academy_teacher_profiles_update_self
on academy.teacher_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on all tables in schema academy from public, anon, authenticated;
revoke all on all sequences in schema academy from public, anon, authenticated;
revoke all on all functions in schema academy from public, anon, authenticated;

grant select (id, code, name_ar, is_active, display_order)
  on academy.subjects to authenticated;
grant select (user_id, full_name, primary_subject_id, governorate_id, school_name, phone, status)
  on academy.teacher_profiles to authenticated;
grant insert (user_id, full_name, primary_subject_id, governorate_id, school_name, phone)
  on academy.teacher_profiles to authenticated;
grant update (full_name, primary_subject_id, governorate_id, school_name, phone)
  on academy.teacher_profiles to authenticated;

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

insert into academy.subjects (code, name_ar, display_order)
values
  ('ARABIC', 'اللغة العربية', 10),
  ('ISLAMIC', 'التربية الإسلامية', 20),
  ('MATHEMATICS', 'الرياضيات', 30),
  ('ENGLISH', 'اللغة الإنجليزية', 40),
  ('PHYSICS', 'الفيزياء', 50),
  ('CHEMISTRY', 'الكيمياء', 60),
  ('BIOLOGY', 'الأحياء', 70),
  ('SOCIAL_STUDIES', 'الدراسات الاجتماعية', 80),
  ('COMPUTER', 'الحاسوب', 90)
on conflict (code) do update
set name_ar = excluded.name_ar,
    display_order = excluded.display_order;

commit;
