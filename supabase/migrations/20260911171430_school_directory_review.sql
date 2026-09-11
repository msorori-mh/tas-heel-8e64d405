-- School directory: approved identities only; proposals remain private profile data.
-- No automatic backfill, merge, renumbering, or deletion of existing schools/profiles.
begin;

create schema if not exists school_private;
revoke all on schema school_private from public, anon, authenticated;
grant usage on schema school_private to authenticated;

create function public.school_identity_key(p_value text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select lower(btrim(regexp_replace(
    translate(regexp_replace(normalize(coalesce(p_value, ''), NFC),
      '[ـً-ٰٟۖ-ۭ]', '', 'g'), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
    '[[:space:] ]+', ' ', 'g')));
$$;
create function public.school_search_key(p_value text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select translate(public.school_identity_key(p_value), 'أإآى', 'اااي');
$$;
revoke all on function public.school_identity_key(text), public.school_search_key(text) from public, anon;
grant execute on function public.school_identity_key(text), public.school_search_key(text) to authenticated, service_role;

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 180),
  governorate_id uuid not null references public.governorates(id),
  district text not null check (length(btrim(district)) between 2 and 120),
  locality text not null check (length(btrim(locality)) between 2 and 120),
  name_key text generated always as (public.school_identity_key(name)) stored,
  district_key text generated always as (public.school_identity_key(district)) stored,
  locality_key text generated always as (public.school_identity_key(locality)) stored,
  merged_into uuid references public.schools(id),
  created_at timestamptz not null default now(),
  check (merged_into is distinct from id),
  check (length(name_key) >= 2 and length(district_key) >= 2 and length(locality_key) >= 2)
);
create unique index schools_active_identity_idx on public.schools
  (governorate_id, name_key, district_key, locality_key) where merged_into is null;
create index schools_merged_into_idx on public.schools (merged_into) where merged_into is not null;
alter table public.schools enable row level security;
revoke all on public.schools from public, anon, authenticated;
grant select on public.schools to authenticated, service_role;
create policy schools_read_approved on public.schools for select to authenticated using (merged_into is null);

alter table public.profiles
  add column school_id uuid references public.schools(id),
  add column school_district text,
  add column school_locality text;
alter table academy.teacher_profiles
  add column school_id uuid references public.schools(id),
  add column school_district text,
  add column school_locality text;
create index profiles_school_id_idx on public.profiles (school_id) where school_id is not null;
create index teacher_profiles_school_id_idx on academy.teacher_profiles (school_id) where school_id is not null;
create index profiles_school_pending_idx on public.profiles (governorate_id, user_id)
  where school_id is null and nullif(btrim(school_name), '') is not null;
create index teacher_profiles_school_pending_idx on academy.teacher_profiles (governorate_id, user_id)
  where school_id is null;
grant select (school_id, school_district, school_locality) on academy.teacher_profiles to authenticated;

-- Privileged operations and audit payloads are outside the exposed API schema.
create table school_private.school_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  action text not null,
  before_data jsonb not null,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);
alter table school_private.school_audit enable row level security;
revoke all on school_private.school_audit from public, anon, authenticated;

create function school_private.require_admin()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;
revoke all on function school_private.require_admin() from public, anon, authenticated;

create function school_private.profile_school_snapshot(p_row jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('school_id', p_row->'school_id', 'school_name', p_row->'school_name',
    'governorate_id', p_row->'governorate_id', 'school_district', p_row->'school_district',
    'school_locality', p_row->'school_locality');
$$;
revoke all on function school_private.profile_school_snapshot(jsonb) from public, anon, authenticated;

-- Invoked only as a row trigger. Resolves old merged IDs, enforces location, and
-- prevents cached/older clients from silently retaining a different school's ID.
create function school_private.sync_profile_school()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_school public.schools%rowtype; v_hops integer := 0;
begin
  if tg_op = 'UPDATE' and new.school_id is not distinct from old.school_id and
    (new.school_name is distinct from old.school_name or new.governorate_id is distinct from old.governorate_id
      or new.school_district is distinct from old.school_district or new.school_locality is distinct from old.school_locality) then
    new.school_id := null;
    if new.governorate_id is distinct from old.governorate_id or old.school_id is not null then
      if new.school_district is not distinct from old.school_district then new.school_district := null; end if;
      if new.school_locality is not distinct from old.school_locality then new.school_locality := null; end if;
    end if;
  end if;
  if new.school_id is not null then
    loop
      select * into v_school from public.schools where id = new.school_id for key share;
      if not found or v_hops > 16 then raise exception 'SCHOOL_NOT_FOUND' using errcode = '23503'; end if;
      exit when v_school.merged_into is null;
      new.school_id := v_school.merged_into; v_hops := v_hops + 1;
    end loop;
    if new.governorate_id is distinct from v_school.governorate_id then
      raise exception 'SCHOOL_LOCATION_MISMATCH' using errcode = '23514';
    end if;
    new.school_name := v_school.name;
    new.school_district := v_school.district;
    new.school_locality := v_school.locality;
  else
    -- Free text never inserts into the approved directory, including old APKs.
    new.school_district := nullif(btrim(new.school_district), '');
    new.school_locality := nullif(btrim(new.school_locality), '');
    if length(coalesce(new.school_district, '')) > 120 or length(coalesce(new.school_locality, '')) > 120 then
      raise exception 'SCHOOL_DETAILS_REQUIRED' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function school_private.sync_profile_school() from public, anon, authenticated;
create trigger school_profile_sync before insert or update of school_id, school_name, governorate_id, school_district, school_locality
  on public.profiles for each row execute function school_private.sync_profile_school();
create trigger school_profile_sync before insert or update of school_id, school_name, governorate_id, school_district, school_locality
  on academy.teacher_profiles for each row execute function school_private.sync_profile_school();

create function public.search_school_directory(p_governorate_id uuid, p_query text default '', p_district text default '')
returns table(id uuid, name text, governorate_id uuid, district text, locality text)
language sql stable security invoker set search_path = '' as $$
  select s.id, s.name, s.governorate_id, s.district, s.locality from public.schools s
  where s.merged_into is null and s.governorate_id = p_governorate_id
    and strpos(public.school_search_key(s.name), public.school_search_key(left(p_query, 180))) > 0
    and strpos(public.school_search_key(s.district), public.school_search_key(left(p_district, 120))) > 0
  order by (public.school_search_key(s.name) = public.school_search_key(p_query)) desc, s.name, s.district, s.locality, s.id
  limit 25;
$$;
revoke all on function public.search_school_directory(uuid, text, text) from public, anon;
grant execute on function public.search_school_directory(uuid, text, text) to authenticated;

create function school_private.school_summary(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'name', s.name, 'governorate_id', s.governorate_id,
    'district', s.district, 'locality', s.locality, 'governorate_name', g.name,
    'student_count', (select count(*) from public.profiles p where p.school_id = s.id),
    'teacher_count', (select count(*) from academy.teacher_profiles p where p.school_id = s.id))
  from public.schools s join public.governorates g on g.id = s.governorate_id
  where s.id = p_id and s.merged_into is null;
$$;
revoke all on function school_private.school_summary(uuid) from public, anon, authenticated;

create function school_private.directory(p_query text, p_governorate_id uuid, p_page integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform school_private.require_admin();
  with filtered as (
    select s.* from public.schools s where s.merged_into is null
      and (p_governorate_id is null or s.governorate_id = p_governorate_id)
      and strpos(public.school_search_key(s.name), public.school_search_key(left(p_query,180))) > 0
  ), page_rows as (select * from filtered order by name, district, locality, id limit 25 offset (greatest(0, least(coalesce(p_page,0),100000)) * 25))
  select jsonb_build_object('count', (select count(*) from filtered), 'rows', coalesce(
    (select jsonb_agg(school_private.school_summary(id) order by name, district, locality, id) from page_rows), '[]'::jsonb)) into v_result;
  return v_result;
end;
$$;

create function school_private.review_queue(p_query text, p_governorate_id uuid, p_page integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform school_private.require_admin();
  with candidates as (
    select 'student'::text kind, user_id, full_name, school_id, school_name, governorate_id, school_district, school_locality
    from public.profiles where school_id is null and nullif(btrim(school_name), '') is not null
    union all
    select 'teacher', user_id, full_name, school_id, school_name, governorate_id, school_district, school_locality
    from academy.teacher_profiles where school_id is null
  ), filtered as (
    select c.*, g.name governorate_name from candidates c left join public.governorates g on g.id = c.governorate_id
    where (p_governorate_id is null or c.governorate_id = p_governorate_id)
      and strpos(public.school_search_key(c.school_name), public.school_search_key(left(p_query,180))) > 0
  ), page_rows as (select * from filtered order by school_name, kind, user_id limit 25 offset (greatest(0, least(coalesce(p_page,0),100000)) * 25))
  select jsonb_build_object('count', (select count(*) from filtered), 'rows', coalesce(
    (select jsonb_agg(to_jsonb(page_rows) order by school_name, kind, user_id) from page_rows), '[]'::jsonb)) into v_result;
  return v_result;
end;
$$;

create function school_private.review_profile(p_kind text, p_user_id uuid, p_expected jsonb, p_school jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_after jsonb; v_school public.schools%rowtype;
  v_name text := btrim(p_school->>'name'); v_district text := btrim(p_school->>'district');
  v_locality text := btrim(p_school->>'locality'); v_gov uuid := (p_school->>'governorate_id')::uuid;
begin
  perform school_private.require_admin();
  -- Serialize low-volume admin decisions, including simultaneous identical approvals.
  perform pg_advisory_xact_lock(731824, 1);
  if p_kind = 'student' then
    select school_private.profile_school_snapshot(to_jsonb(p)) into v_before from public.profiles p where user_id = p_user_id for update;
  elsif p_kind = 'teacher' then
    select school_private.profile_school_snapshot(to_jsonb(p)) into v_before from academy.teacher_profiles p where user_id = p_user_id for update;
  else raise exception 'SCHOOL_PROFILE_KIND_INVALID' using errcode = '22023'; end if;
  if v_before is null or v_before is distinct from p_expected or v_before->>'school_id' is not null then
    raise exception 'SCHOOL_REVIEW_STALE' using errcode = '40001';
  end if;
  if nullif(p_school->>'id', '') is not null then
    select * into v_school from public.schools where id = (p_school->>'id')::uuid and merged_into is null;
    if not found then raise exception 'SCHOOL_REVIEW_STALE' using errcode = '40001'; end if;
  else
    if v_gov is null or coalesce(length(v_name),0) not between 2 and 180
      or coalesce(length(v_district),0) not between 2 and 120 or coalesce(length(v_locality),0) not between 2 and 120 then
      raise exception 'SCHOOL_DETAILS_REQUIRED' using errcode = '23514';
    end if;
    insert into public.schools(name, governorate_id, district, locality) values (v_name, v_gov, v_district, v_locality)
    on conflict (governorate_id, name_key, district_key, locality_key) where merged_into is null do nothing;
    select * into v_school from public.schools where merged_into is null and governorate_id = v_gov
      and name_key = public.school_identity_key(v_name) and district_key = public.school_identity_key(v_district)
      and locality_key = public.school_identity_key(v_locality);
  end if;
  if (v_before->>'governorate_id')::uuid is distinct from v_school.governorate_id then
    raise exception 'SCHOOL_LOCATION_MISMATCH' using errcode = '23514';
  end if;
  -- Exactly one reviewed profile; similarly named profiles are never silently relinked.
  if p_kind = 'student' then
    update public.profiles p set school_id = v_school.id where user_id = p_user_id
      returning school_private.profile_school_snapshot(to_jsonb(p)) into v_after;
  else
    update academy.teacher_profiles p set school_id = v_school.id where user_id = p_user_id
      returning school_private.profile_school_snapshot(to_jsonb(p)) into v_after;
  end if;
  insert into school_private.school_audit(actor_id, action, before_data, after_data)
    values(auth.uid(), 'review_profile', jsonb_build_object('kind', p_kind, 'user_id', p_user_id, 'school', v_before),
      jsonb_build_object('kind', p_kind, 'user_id', p_user_id, 'school', v_after));
  return v_school.id;
end;
$$;

create function school_private.merge_schools(p_source_id uuid, p_target_id uuid, p_expected_source jsonb, p_expected_target jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_source jsonb; v_target jsonb; v_students integer; v_teachers integer; v_links jsonb;
begin
  perform school_private.require_admin();
  perform pg_advisory_xact_lock(731824, 1);
  if p_source_id is null or p_target_id is null or p_source_id = p_target_id then
    raise exception 'SCHOOL_MERGE_INVALID' using errcode = '22023';
  end if;
  perform id from public.schools where id in (p_source_id, p_target_id) order by id for update;
  perform user_id from public.profiles where school_id in (p_source_id,p_target_id) order by user_id for update;
  perform user_id from academy.teacher_profiles where school_id in (p_source_id,p_target_id) order by user_id for update;
  v_source := school_private.school_summary(p_source_id); v_target := school_private.school_summary(p_target_id);
  if v_source is null or v_target is null or v_source is distinct from p_expected_source or v_target is distinct from p_expected_target then
    raise exception 'SCHOOL_REVIEW_STALE' using errcode = '40001';
  end if;
  if v_source->>'governorate_id' is distinct from v_target->>'governorate_id' then
    raise exception 'SCHOOL_LOCATION_MISMATCH' using errcode = '23514';
  end if;
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_links from (
    select 'student' kind, user_id, school_private.profile_school_snapshot(to_jsonb(p)) school from public.profiles p where school_id = p_source_id
    union all select 'teacher', user_id, school_private.profile_school_snapshot(to_jsonb(p)) from academy.teacher_profiles p where school_id = p_source_id
  ) x;
  update public.profiles set school_id = p_target_id where school_id = p_source_id;
  get diagnostics v_students = row_count;
  update academy.teacher_profiles set school_id = p_target_id where school_id = p_source_id;
  get diagnostics v_teachers = row_count;
  update public.schools set merged_into = p_target_id where id = p_source_id or merged_into = p_source_id;
  insert into school_private.school_audit(actor_id, action, before_data, after_data)
    values(auth.uid(), 'merge_schools', jsonb_build_object('source', v_source, 'target', v_target, 'profiles', v_links),
      jsonb_build_object('source_id', p_source_id, 'target_id', p_target_id, 'students', v_students, 'teachers', v_teachers));
  return jsonb_build_object('students', v_students, 'teachers', v_teachers);
end;
$$;

-- Exposed wrappers are invokers. Every privileged body repeats the authenticated
-- database-role check, so calling a private function directly grants no bypass.
create function public.admin_school_directory(p_query text default '', p_governorate_id uuid default null, p_page integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$ select school_private.directory(p_query,p_governorate_id,p_page); $$;
create function public.admin_school_review_queue(p_query text default '', p_governorate_id uuid default null, p_page integer default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$ select school_private.review_queue(p_query,p_governorate_id,p_page); $$;
create function public.admin_review_school_profile(p_kind text, p_user_id uuid, p_expected jsonb, p_school jsonb)
returns uuid language sql security invoker set search_path = '' as $$ select school_private.review_profile(p_kind,p_user_id,p_expected,p_school); $$;
create function public.admin_merge_schools(p_source_id uuid, p_target_id uuid, p_expected_source jsonb, p_expected_target jsonb)
returns jsonb language sql security invoker set search_path = '' as $$ select school_private.merge_schools(p_source_id,p_target_id,p_expected_source,p_expected_target); $$;

revoke all on function school_private.directory(text,uuid,integer), school_private.review_queue(text,uuid,integer),
 school_private.review_profile(text,uuid,jsonb,jsonb), school_private.merge_schools(uuid,uuid,jsonb,jsonb),
 public.admin_school_directory(text,uuid,integer), public.admin_school_review_queue(text,uuid,integer),
 public.admin_review_school_profile(text,uuid,jsonb,jsonb), public.admin_merge_schools(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function school_private.directory(text,uuid,integer), school_private.review_queue(text,uuid,integer),
 school_private.review_profile(text,uuid,jsonb,jsonb), school_private.merge_schools(uuid,uuid,jsonb,jsonb),
 public.admin_school_directory(text,uuid,integer), public.admin_school_review_queue(text,uuid,integer),
 public.admin_review_school_profile(text,uuid,jsonb,jsonb), public.admin_merge_schools(uuid,uuid,jsonb,jsonb) to authenticated;

-- Preserve the existing Google-only teacher validation and role boundary. This
-- new name avoids a PostgREST overload and leaves older academy clients working.
create function school_private.save_teacher_school(p_full_name text, p_primary_subject_id uuid, p_governorate_id uuid,
 p_school_name text, p_phone text, p_school_id uuid, p_school_district text, p_school_locality text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_profile academy.teacher_profiles%rowtype;
begin
  if auth.uid() is null or not academy.i_have_google_identity() then
    raise exception 'GOOGLE_TEACHER_AUTH_REQUIRED' using errcode = '42501';
  end if;
  perform academy.save_my_teacher_profile(p_full_name,p_primary_subject_id,p_governorate_id,p_school_name,p_phone);
  update academy.teacher_profiles set school_id = p_school_id, school_district = p_school_district, school_locality = p_school_locality
    where user_id = auth.uid() returning * into v_profile;
  return jsonb_build_object('user_id',v_profile.user_id,'full_name',v_profile.full_name,
    'primary_subject_id',v_profile.primary_subject_id,'governorate_id',v_profile.governorate_id,
    'school_name',v_profile.school_name,'school_id',v_profile.school_id,'school_district',v_profile.school_district,
    'school_locality',v_profile.school_locality,'phone',v_profile.phone,'status',v_profile.status);
end;
$$;
create function academy.save_my_teacher_profile_with_school(p_full_name text, p_primary_subject_id uuid, p_governorate_id uuid,
 p_school_name text, p_phone text, p_school_id uuid, p_school_district text, p_school_locality text)
returns jsonb language sql security invoker set search_path = '' as $$
  select school_private.save_teacher_school(p_full_name,p_primary_subject_id,p_governorate_id,p_school_name,p_phone,p_school_id,p_school_district,p_school_locality);
$$;
revoke all on function school_private.save_teacher_school(text,uuid,uuid,text,text,uuid,text,text),
 academy.save_my_teacher_profile_with_school(text,uuid,uuid,text,text,uuid,text,text) from public, anon, authenticated;
grant execute on function school_private.save_teacher_school(text,uuid,uuid,text,text,uuid,text,text),
 academy.save_my_teacher_profile_with_school(text,uuid,uuid,text,text,uuid,text,text) to authenticated;

create function school_private.students_by_school(
  p_page integer default 0,
  p_page_size integer default 20,
  p_search text default null,
  p_governorate_id uuid default null,
  p_grade_id uuid default null,
  p_school_id uuid default null,
  p_pending_school boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := nullif(btrim(p_search), '');
  v_result jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with student_profiles as (
    select
      profiles.id,
      profiles.full_name,
      profiles.school_name,
      profiles.school_id,
      profiles.governorate,
      profiles.created_at,
      profiles.grade_uuid,
      profiles.governorate_id
    from public.profiles
    where not exists (
      select 1 from academy.teacher_profiles
      where teacher_profiles.user_id = profiles.user_id
    )
    and not exists (
      select 1 from public.user_roles
      where user_roles.user_id = profiles.user_id
        and user_roles.role in ('admin'::public.app_role, 'content_manager'::public.app_role, 'moderator'::public.app_role)
    )
  ), filtered as (
    select
      student_profiles.id,
      student_profiles.full_name,
      student_profiles.school_name,
      student_profiles.school_id,
      coalesce(governorates.name, student_profiles.governorate) as governorate_name,
      grades.name as grade_name,
      student_profiles.created_at
    from student_profiles
    left join public.grades on grades.id = student_profiles.grade_uuid
    left join public.governorates on governorates.id = student_profiles.governorate_id
    where (v_search is null or student_profiles.full_name ilike '%' || v_search || '%')
      and (p_governorate_id is null or student_profiles.governorate_id = p_governorate_id)
      and (p_grade_id is null or student_profiles.grade_uuid = p_grade_id)
      and (p_school_id is null or student_profiles.school_id = p_school_id)
      and (not coalesce(p_pending_school,false) or (student_profiles.school_id is null and nullif(btrim(student_profiles.school_name),'') is not null))
  ), page_rows as (
    select * from filtered
    order by created_at desc, id
    limit v_page_size offset (v_page * v_page_size)
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(page_rows) order by created_at desc, id) from page_rows), '[]'::jsonb),
    'count', (select count(*) from filtered)
  ) into v_result;

  return v_result;
end;
$$;

create function school_private.student_school_filter_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with student_profiles as (
    select profiles.*
    from public.profiles
    where not exists (
      select 1 from academy.teacher_profiles
      where teacher_profiles.user_id = profiles.user_id
    )
    and not exists (
      select 1 from public.user_roles
      where user_roles.user_id = profiles.user_id
        and user_roles.role in ('admin'::public.app_role, 'content_manager'::public.app_role, 'moderator'::public.app_role)
    )
  )
  select jsonb_build_object(
    'total', (select count(*) from student_profiles),
    'incomplete', (
      select count(*) from student_profiles
      where grade_uuid is null or governorate_id is null or nullif(btrim(school_name), '') is null
    ),
    'grades', coalesce((
      select jsonb_agg(jsonb_build_object('id', grades.id, 'name', grades.name, 'count', counts.student_count)
        order by grades.sort_order, grades.name)
      from (
        select grade_uuid, count(*) student_count
        from student_profiles where grade_uuid is not null group by grade_uuid
      ) counts
      join public.grades on grades.id = counts.grade_uuid
    ), '[]'::jsonb),
    'governorates', coalesce((
      select jsonb_agg(jsonb_build_object('id', governorates.id, 'name', governorates.name, 'count', counts.student_count)
        order by governorates.name)
      from (
        select governorate_id, count(*) student_count
        from student_profiles where governorate_id is not null group by governorate_id
      ) counts
      join public.governorates on governorates.id = counts.governorate_id
    ), '[]'::jsonb),
    'schools', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'count', counts.student_count,
        'governorate_id',s.governorate_id,'governorate_name',g.name,'district',s.district,'locality',s.locality) order by s.name,s.district,s.locality,s.id)
      from (select school_id, count(*) student_count from student_profiles where school_id is not null group by school_id) counts
      join public.schools s on s.id = counts.school_id and s.merged_into is null
      join public.governorates g on g.id = s.governorate_id
    ), '[]'::jsonb),
    'pending_schools', (select count(*) from student_profiles where school_id is null and nullif(btrim(school_name),'') is not null)
  ) into v_result;

  return v_result;
end;
$$;


create function public.admin_list_students_by_school(p_page integer default 0, p_page_size integer default 20,
 p_search text default null, p_governorate_id uuid default null, p_grade_id uuid default null,
 p_school_id uuid default null, p_pending_school boolean default false)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select school_private.students_by_school(p_page,p_page_size,p_search,p_governorate_id,p_grade_id,p_school_id,p_pending_school);
$$;
create function public.admin_student_school_filter_options()
returns jsonb language sql stable security invoker set search_path = '' as $$ select school_private.student_school_filter_options(); $$;
revoke all on function school_private.students_by_school(integer,integer,text,uuid,uuid,uuid,boolean),
 school_private.student_school_filter_options(), public.admin_list_students_by_school(integer,integer,text,uuid,uuid,uuid,boolean),
 public.admin_student_school_filter_options() from public,anon,authenticated;
grant execute on function school_private.students_by_school(integer,integer,text,uuid,uuid,uuid,boolean),
 school_private.student_school_filter_options(), public.admin_list_students_by_school(integer,integer,text,uuid,uuid,uuid,boolean),
 public.admin_student_school_filter_options() to authenticated;

create function school_private.school_details(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 perform school_private.require_admin();
 return school_private.school_summary(p_id);
end;
$$;
create function public.admin_school_details(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$ select school_private.school_details(p_id); $$;
revoke all on function school_private.school_details(uuid), public.admin_school_details(uuid) from public,anon,authenticated;
grant execute on function school_private.school_details(uuid), public.admin_school_details(uuid) to authenticated;

commit;
