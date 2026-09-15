begin;
create function school_private.edit_school(p_id uuid,p_expected jsonb,p_school jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_before jsonb; v_preview jsonb; v_errors jsonb; v_gov uuid; v_name text; v_district text; v_locality text;
begin
 perform school_private.require_admin();
 perform pg_advisory_xact_lock(731824,1);
 perform id from public.schools where id=p_id and merged_into is null for update;
 v_before := school_private.school_summary(p_id);
 if v_before is null or (v_before - 'student_count' - 'teacher_count' - 'governorate_name') is distinct from p_expected then
  raise exception 'SCHOOL_REVIEW_STALE' using errcode='40001';
 end if;
 v_preview := school_private.intake_schools(jsonb_build_array(p_school),false)->'rows'->0;
 v_errors := v_preview->'errors';
 if v_errors <> '{}'::jsonb then return jsonb_build_object('errors',v_errors); end if;
 if v_preview->>'status'='exists' and (v_preview->>'school_id')::uuid<>p_id then
  return jsonb_build_object('errors',jsonb_build_object('name','توجد مدرسة بهذه البيانات. راجع السجل الموجود أو استخدم الدمج.'));
 end if;
 select id into v_gov from public.governorates where id::text=p_school->>'governorate_id';
 if v_gov is null then return jsonb_build_object('errors',jsonb_build_object('governorate','اختر محافظة صحيحة.')); end if;
 if v_gov::text<>v_before->>'governorate_id' and
  (exists(select 1 from public.profiles where school_id=p_id) or exists(select 1 from academy.teacher_profiles where school_id=p_id)) then
  return jsonb_build_object('errors',jsonb_build_object('governorate','لا يمكن تغيير المحافظة لمدرسة مرتبطة بطلاب أو معلمين. راجع ارتباطاتهم أولًا.'));
 end if;
 v_name:=btrim(regexp_replace(p_school->>'name','[[:space:] ]+',' ','g'));
 v_district:=btrim(regexp_replace(p_school->>'district','[[:space:] ]+',' ','g'));
 v_locality:=btrim(regexp_replace(coalesce(p_school->>'locality',''),'[[:space:] ]+',' ','g'));
 if v_before->>'name'=v_name and v_before->>'district'=v_district and v_before->>'locality'=v_locality and v_before->>'governorate_id'=v_gov::text then
  return jsonb_build_object('errors','{}'::jsonb,'school',v_before);
 end if;
 update public.schools set name=v_name,governorate_id=v_gov,district=v_district,locality=v_locality where id=p_id;
 -- Existing profile trigger refreshes school labels while keeping the same school ID.
 update public.profiles set school_id=p_id where school_id=p_id;
 update academy.teacher_profiles set school_id=p_id where school_id=p_id;
 insert into school_private.school_audit(actor_id,action,before_data,after_data)
  values(auth.uid(),'edit_school',v_before,school_private.school_summary(p_id));
 return jsonb_build_object('errors','{}'::jsonb,'school',school_private.school_summary(p_id));
end;
$$;
create function public.admin_edit_school(p_id uuid,p_expected jsonb,p_school jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select school_private.edit_school(p_id,p_expected,p_school); $$;
revoke all on function school_private.edit_school(uuid,jsonb,jsonb),public.admin_edit_school(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function school_private.edit_school(uuid,jsonb,jsonb),public.admin_edit_school(uuid,jsonb,jsonb) to authenticated;
commit;
