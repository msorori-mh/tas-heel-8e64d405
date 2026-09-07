-- Admin-only, server-side student directory filtering and counts.
-- Teacher Academy profiles and privileged staff accounts are intentionally excluded.

create index if not exists idx_profiles_school_name_normalized
  on public.profiles (lower(btrim(school_name)))
  where nullif(btrim(school_name), '') is not null;

create or replace function public.admin_list_students_filtered(
  p_page integer default 0,
  p_page_size integer default 20,
  p_search text default null,
  p_governorate_id uuid default null,
  p_grade_id uuid default null,
  p_school_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := nullif(btrim(p_search), '');
  v_school text := nullif(lower(btrim(p_school_name)), '');
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
      coalesce(governorates.name, student_profiles.governorate) as governorate_name,
      grades.name as grade_name,
      student_profiles.created_at
    from student_profiles
    left join public.grades on grades.id = student_profiles.grade_uuid
    left join public.governorates on governorates.id = student_profiles.governorate_id
    where (v_search is null or student_profiles.full_name ilike '%' || v_search || '%')
      and (p_governorate_id is null or student_profiles.governorate_id = p_governorate_id)
      and (p_grade_id is null or student_profiles.grade_uuid = p_grade_id)
      and (v_school is null or lower(btrim(student_profiles.school_name)) = v_school)
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

create or replace function public.admin_student_filter_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
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
      select jsonb_agg(jsonb_build_object('name', school_name, 'count', student_count) order by school_name)
      from (
        select min(btrim(school_name)) school_name, count(*) student_count
        from student_profiles
        where nullif(btrim(school_name), '') is not null
        group by lower(btrim(school_name))
      ) school_counts
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_list_students_filtered(integer, integer, text, uuid, uuid, text) from public, anon;
revoke all on function public.admin_student_filter_options() from public, anon;
grant execute on function public.admin_list_students_filtered(integer, integer, text, uuid, uuid, text) to authenticated;
grant execute on function public.admin_student_filter_options() to authenticated;

