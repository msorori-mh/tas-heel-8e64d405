-- Save teacher profiles through one authenticated, Google-only database boundary.
begin;

create or replace function academy.save_my_teacher_profile(
  p_full_name text,
  p_primary_subject_id uuid,
  p_governorate_id uuid,
  p_school_name text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, academy, public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_profile academy.teacher_profiles%rowtype;
begin
  if v_actor is null or not academy.i_have_google_identity() then
    raise exception 'GOOGLE_TEACHER_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from academy.subjects subjects
    where subjects.id = p_primary_subject_id
      and subjects.is_active
  ) then
    raise exception 'ACTIVE_SUBJECT_REQUIRED' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.governorates governorates
    where governorates.id = p_governorate_id
  ) then
    raise exception 'GOVERNORATE_REQUIRED' using errcode = '23514';
  end if;

  insert into academy.teacher_profiles (
    user_id,
    full_name,
    primary_subject_id,
    governorate_id,
    school_name,
    phone
  )
  values (
    v_actor,
    btrim(p_full_name),
    p_primary_subject_id,
    p_governorate_id,
    btrim(p_school_name),
    btrim(p_phone)
  )
  on conflict (user_id) do update
  set
    full_name = excluded.full_name,
    primary_subject_id = excluded.primary_subject_id,
    governorate_id = excluded.governorate_id,
    school_name = excluded.school_name,
    phone = excluded.phone
  returning * into v_profile;

  return jsonb_build_object(
    'user_id', v_profile.user_id,
    'full_name', v_profile.full_name,
    'primary_subject_id', v_profile.primary_subject_id,
    'governorate_id', v_profile.governorate_id,
    'school_name', v_profile.school_name,
    'phone', v_profile.phone,
    'status', v_profile.status
  );
end;
$$;

revoke all on function academy.save_my_teacher_profile(text, uuid, uuid, text, text)
  from public, anon;
grant execute on function academy.save_my_teacher_profile(text, uuid, uuid, text, text)
  to authenticated, service_role;

do $proof$
begin
  if has_function_privilege(
    'anon',
    'academy.save_my_teacher_profile(text,uuid,uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'ACADEMY_PROFILE_SAVE_ANON_PRIVILEGE_LEAK';
  end if;
end
$proof$;

commit;
