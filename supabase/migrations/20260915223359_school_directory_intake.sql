-- Admin-only catalog intake. Preview is read-only; commit inserts new identities only.
begin;
create function school_private.intake_schools(p_rows jsonb, p_commit boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_row jsonb; v_results jsonb := '[]'; v_added jsonb := '[]'; v_errors jsonb;
 v_name text; v_district text; v_locality text; v_gov uuid; v_gov_count integer;
 v_id uuid; v_identity text; v_seen text[] := '{}'; v_status text; v_n integer := 0; v_source integer;
begin
 perform school_private.require_admin();
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'SCHOOL_INTAKE_ROWS' using errcode='22023'; end if;
 if jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text)>1048576 then
  raise exception 'SCHOOL_INTAKE_LIMIT' using errcode='22023';
 end if;
 if coalesce(p_commit,false) then perform pg_advisory_xact_lock(731824,1); end if;
 for v_row in select value from jsonb_array_elements(p_rows) loop
  v_n := v_n+1; v_source := v_n; v_errors := '{}'; v_id := null; v_gov := null;
  if (v_row->>'source_row') ~ '^[0-9]{1,6}$' then v_source := (v_row->>'source_row')::integer; end if;
  if jsonb_typeof(v_row) is distinct from 'object' then
   v_errors := jsonb_build_object('row','الصف غير صالح.');
  end if;
  v_name := btrim(regexp_replace(coalesce(v_row->>'name',''),'[[:space:] ]+',' ','g'));
  v_district := btrim(regexp_replace(coalesce(v_row->>'district',''),'[[:space:] ]+',' ','g'));
  v_locality := btrim(regexp_replace(coalesce(v_row->>'locality',''),'[[:space:] ]+',' ','g'));
  if jsonb_typeof(v_row->'name') is distinct from 'string' or length(v_name) not between 2 and 180 or length(public.school_identity_key(v_name))<2 then
   v_errors := v_errors || jsonb_build_object('name','أدخل اسم المدرسة من حرفين إلى ١٨٠ حرفًا.');
  end if;
  if jsonb_typeof(v_row->'district') is distinct from 'string' or length(v_district) not between 2 and 120 or length(public.school_identity_key(v_district))<2 then
   v_errors := v_errors || jsonb_build_object('district','أدخل اسم المديرية من حرفين إلى ١٢٠ حرفًا.');
  end if;
  if (v_row ? 'locality' and jsonb_typeof(v_row->'locality') not in ('string','null')) or
   (v_locality<>'' and (length(v_locality) not between 2 and 120 or length(public.school_identity_key(v_locality))<2)) then
   v_errors := v_errors || jsonb_build_object('locality','أدخل الحي أو القرية من حرفين إلى ١٢٠ حرفًا، أو اتركه فارغًا.');
  end if;
  if nullif(v_row->>'governorate_id','') is not null then
   select id into v_gov from public.governorates where id::text = v_row->>'governorate_id';
  elsif jsonb_typeof(v_row->'governorate')='string' then
   select count(*), (array_agg(id))[1] into v_gov_count,v_gov from public.governorates
    where public.school_search_key(name)=public.school_search_key(v_row->>'governorate');
   if v_gov_count<>1 then v_gov := null; end if;
  end if;
  if v_gov is null then v_errors := v_errors || jsonb_build_object('governorate','اختر محافظة صحيحة؛ استخدم الاسم الموجود في ورقة المحافظات.'); end if;
  v_status := 'invalid';
  if v_errors='{}'::jsonb then
   v_identity := jsonb_build_array(v_gov,public.school_identity_key(v_name),public.school_identity_key(v_district),public.school_identity_key(v_locality))::text;
   if v_identity=any(v_seen) then v_status := 'duplicate_file';
   else
    v_seen := array_append(v_seen,v_identity);
    select id into v_id from public.schools where merged_into is null and governorate_id=v_gov
     and name_key=public.school_identity_key(v_name) and district_key=public.school_identity_key(v_district)
     and locality_key=public.school_identity_key(v_locality);
    if v_id is not null then v_status := 'exists';
    elsif coalesce(p_commit,false) then
     insert into public.schools(name,governorate_id,district,locality) values(v_name,v_gov,v_district,v_locality)
      on conflict(governorate_id,name_key,district_key,locality_key) where merged_into is null do nothing returning id into v_id;
     if v_id is not null then
      v_status := 'added'; v_added := v_added || jsonb_build_array(jsonb_build_object('id',v_id,'name',v_name,'governorate_id',v_gov,'district',v_district,'locality',v_locality));
     else
      v_status := 'exists';
      select id into v_id from public.schools where merged_into is null and governorate_id=v_gov
       and name_key=public.school_identity_key(v_name) and district_key=public.school_identity_key(v_district)
       and locality_key=public.school_identity_key(v_locality);
     end if;
    else v_status := 'new'; end if;
   end if;
  end if;
  v_results := v_results || jsonb_build_array(jsonb_build_object('source_row',v_source,'status',v_status,'school_id',v_id,'errors',v_errors));
 end loop;
 if jsonb_array_length(v_added)>0 then
  insert into school_private.school_audit(actor_id,action,before_data,after_data)
   values(auth.uid(),'intake_schools','{}',jsonb_build_object('schools',v_added));
 end if;
 return jsonb_build_object('rows',v_results,'committed',coalesce(p_commit,false));
end;
$$;
create function public.admin_intake_schools(p_rows jsonb,p_commit boolean default false)
returns jsonb language sql security invoker set search_path = '' as $$
 select school_private.intake_schools(p_rows,p_commit);
$$;
revoke all on function school_private.intake_schools(jsonb,boolean),public.admin_intake_schools(jsonb,boolean) from public,anon,authenticated;
grant execute on function school_private.intake_schools(jsonb,boolean),public.admin_intake_schools(jsonb,boolean) to authenticated;
commit;
