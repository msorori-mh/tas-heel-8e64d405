-- Optional locality for approved schools. Preserve string API and unique identity.
-- Empty, omitted and null RPC input normalize to ''; no existing rows are rewritten.
begin;
set local lock_timeout = '5s';
alter table public.schools drop constraint schools_locality_check;
alter table public.schools add constraint schools_locality_check
  check (locality = '' or length(btrim(locality)) between 2 and 120);
alter table public.schools drop constraint schools_check1;
alter table public.schools add constraint schools_check1
  check (length(name_key) >= 2 and length(district_key) >= 2
    and (locality = '' or length(locality_key) >= 2));

create or replace function school_private.review_profile(p_kind text, p_user_id uuid, p_expected jsonb, p_school jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_before jsonb; v_after jsonb; v_school public.schools%rowtype;
  v_name text := btrim(p_school->>'name'); v_district text := btrim(p_school->>'district');
  v_locality text := coalesce(btrim(p_school->>'locality'), ''); v_gov uuid := (p_school->>'governorate_id')::uuid;
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
      or coalesce(length(v_district),0) not between 2 and 120 or (v_locality <> '' and length(v_locality) not between 2 and 120) then
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

commit;
