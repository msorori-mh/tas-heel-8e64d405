-- GRADE12_SUBJECT_CATALOG_INITIALIZER
-- Canonical, full-admin-only initializer for the Grade 12 subject catalog.
-- One subject identity is shared by Sanaa and Aden; semester belongs to books,
-- units, and lessons, never to the subject row.

create or replace function public.curriculum_grade12_subject_catalog_v1()
returns jsonb
language sql
immutable
security definer
set search_path = public, pg_temp
as $function$
  select jsonb_build_array(
    jsonb_build_object('code','sub-g12-001','name','القرآن الكريم وعلومه','sort_order',10,'group_code',null,'group_name',null,'icon','BookOpen','color','#16a34a'),
    jsonb_build_object('code','sub-g12-002','name','الفقه','sort_order',20,'group_code','grp-g12-01','group_name','التربية الإسلامية','icon','BookOpen','color','#0d9488'),
    jsonb_build_object('code','sub-g12-003','name','الحديث','sort_order',21,'group_code','grp-g12-01','group_name','التربية الإسلامية','icon','BookOpen','color','#0d9488'),
    jsonb_build_object('code','sub-g12-004','name','السيرة','sort_order',22,'group_code','grp-g12-01','group_name','التربية الإسلامية','icon','BookOpen','color','#0d9488'),
    jsonb_build_object('code','sub-g12-005','name','العقيدة','sort_order',23,'group_code','grp-g12-01','group_name','التربية الإسلامية','icon','BookOpen','color','#0d9488'),
    jsonb_build_object('code','sub-g12-006','name','الأدب والنصوص','sort_order',30,'group_code','grp-g12-02','group_name','اللغة العربية','icon','Languages','color','#7c3aed'),
    jsonb_build_object('code','sub-g12-007','name','النحو والصرف','sort_order',31,'group_code','grp-g12-02','group_name','اللغة العربية','icon','Languages','color','#7c3aed'),
    jsonb_build_object('code','sub-g12-008','name','البلاغة والنقد','sort_order',32,'group_code','grp-g12-02','group_name','اللغة العربية','icon','Languages','color','#7c3aed'),
    jsonb_build_object('code','sub-g12-009','name','اللغة الإنجليزية','sort_order',40,'group_code',null,'group_name',null,'icon','Languages','color','#2563eb'),
    jsonb_build_object('code','sub-g12-010','name','الجبر والهندسة التحليلية','sort_order',50,'group_code','grp-g12-03','group_name','الرياضيات','icon','Calculator','color','#ea580c'),
    jsonb_build_object('code','sub-g12-011','name','التفاضل والتكامل','sort_order',51,'group_code','grp-g12-03','group_name','الرياضيات','icon','Calculator','color','#ea580c'),
    jsonb_build_object('code','sub-g12-012','name','الفيزياء','sort_order',60,'group_code',null,'group_name',null,'icon','Atom','color','#0891b2'),
    jsonb_build_object('code','sub-g12-013','name','الكيمياء','sort_order',70,'group_code',null,'group_name',null,'icon','FlaskConical','color','#dc2626'),
    jsonb_build_object('code','sub-g12-014','name','الأحياء','sort_order',80,'group_code',null,'group_name',null,'icon','Dna','color','#65a30d')
  );
$function$;

revoke all on function public.curriculum_grade12_subject_catalog_v1()
  from public, anon, authenticated;

create or replace function public.admin_grade12_subject_catalog_status()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  v_grade_id uuid;
  v_catalog jsonb := public.curriculum_grade12_subject_catalog_v1();
  v_items jsonb;
  v_tracks jsonb;
  v_track_count integer;
  v_matched_subjects integer;
  v_matched_links integer;
  v_conflict_count integer;
  v_status text;
  v_preview text;
begin
  if auth.uid() is null or not public.is_full_admin(auth.uid()) then
    raise exception 'FORBIDDEN_FULL_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select id into v_grade_id
  from public.grades
  where slug = 'grade-12';
  if v_grade_id is null then
    raise exception 'GRADE12_MASTER_DATA_MISSING' using errcode = '23503';
  end if;

  select count(*), coalesce(jsonb_agg(
    jsonb_build_object('id', id, 'code', track_code, 'name', track_name)
    order by track_code
  ), '[]'::jsonb)
  into v_track_count, v_tracks
  from public.curriculum_tracks
  where track_code in ('sanaa', 'aden') and is_active;

  if v_track_count <> 2 then
    raise exception 'SANAA_ADEN_MASTER_DATA_INCOMPLETE' using errcode = '23503';
  end if;

  with expected as (
    select *
    from jsonb_to_recordset(v_catalog) as x(
      code text, name text, sort_order integer, group_code text,
      group_name text, icon text, color text
    )
  ), report as (
    select
      e.*,
      s.id as subject_id,
      s.grade_id as actual_grade_id,
      s.slug as actual_slug,
      s.name as actual_name,
      s.sort_order as actual_sort_order,
      s.group_code as actual_group_code,
      s.group_name as actual_group_name,
      s.semester as actual_semester,
      s.curriculum_track_id as actual_legacy_track_id,
      exists (
        select 1 from public.subjects n
        where n.grade_id = v_grade_id
          and n.name = e.name
          and n.code is distinct from e.code
      ) as duplicate_name,
      coalesce((
        select count(*)
        from public.subject_curriculum_tracks st
        join public.curriculum_tracks ct on ct.id = st.curriculum_track_id
        where st.subject_id = s.id
          and st.is_active
          and ct.track_code in ('sanaa', 'aden')
      ), 0)::integer as active_target_links,
      exists (
        select 1
        from public.subject_curriculum_tracks st
        join public.curriculum_tracks ct on ct.id = st.curriculum_track_id
        where st.subject_id = s.id
          and st.is_active
          and ct.track_code not in ('sanaa', 'aden')
      ) as unexpected_active_track
    from expected e
    left join public.subjects s on s.code = e.code
  ), classified as (
    select *,
      case
        when subject_id is null and not duplicate_name then 'MISSING'
        when subject_id is not null
          and actual_grade_id = v_grade_id
          and actual_slug = code
          and actual_name = name
          and actual_sort_order = sort_order
          and actual_group_code is not distinct from group_code
          and actual_group_name is not distinct from group_name
          and actual_semester is null
          and actual_legacy_track_id is null
          and not duplicate_name
          and not unexpected_active_track
        then 'MATCHED'
        else 'CONFLICT'
      end as item_status
    from report
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'code', code,
      'name', name,
      'sort_order', sort_order,
      'group_code', group_code,
      'group_name', group_name,
      'display_group', coalesce(group_name, name),
      'status', item_status,
      'active_target_links', active_target_links,
      'duplicate_name', duplicate_name,
      'unexpected_active_track', unexpected_active_track
    ) order by sort_order), '[]'::jsonb),
    count(*) filter (where item_status = 'MATCHED'),
    coalesce(sum(active_target_links) filter (where item_status = 'MATCHED'), 0),
    count(*) filter (where item_status = 'CONFLICT')
  into v_items, v_matched_subjects, v_matched_links, v_conflict_count
  from classified;

  v_status := case
    when v_conflict_count > 0 then 'CONFLICT'
    when v_matched_subjects = 14 and v_matched_links = 28 then 'COMPLETE'
    else 'READY'
  end;

  v_preview := md5(jsonb_build_object(
    'catalog_version', 1,
    'grade_id', v_grade_id,
    'tracks', v_tracks,
    'items', v_items
  )::text);

  return jsonb_build_object(
    'catalog_version', 1,
    'status', v_status,
    'grade_id', v_grade_id,
    'grade_slug', 'grade-12',
    'grade_name', 'الصف الثالث الثانوي',
    'tracks', v_tracks,
    'expected_subjects', 14,
    'expected_groups', 8,
    'expected_track_links', 28,
    'matched_subjects', v_matched_subjects,
    'missing_subjects', 14 - v_matched_subjects,
    'matched_track_links', v_matched_links,
    'missing_track_links', 28 - v_matched_links,
    'conflict_count', v_conflict_count,
    'preview_sha256', v_preview,
    'items', v_items
  );
end;
$function$;

revoke all on function public.admin_grade12_subject_catalog_status()
  from public, anon;
grant execute on function public.admin_grade12_subject_catalog_status()
  to authenticated;

create or replace function public.admin_initialize_grade12_subject_catalog(
  _expected_preview_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
  v_catalog jsonb := public.curriculum_grade12_subject_catalog_v1();
  v_grade_id uuid;
  v_item jsonb;
  v_subject_id uuid;
  v_created_subjects integer := 0;
  v_created_links integer := 0;
begin
  if v_actor is null or not public.is_full_admin(v_actor) then
    raise exception 'FORBIDDEN_FULL_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if nullif(btrim(_expected_preview_sha256), '') is null then
    raise exception 'GRADE12_CATALOG_PREVIEW_REQUIRED' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('tamkeen:grade12-subject-catalog-v1', 0));
  v_before := public.admin_grade12_subject_catalog_status();

  if v_before->>'preview_sha256' is distinct from btrim(_expected_preview_sha256) then
    raise exception 'GRADE12_CATALOG_STALE_PREVIEW' using errcode = '40001';
  end if;
  if (v_before->>'status') = 'CONFLICT' then
    raise exception 'GRADE12_CATALOG_CONFLICT' using errcode = '23505';
  end if;

  v_grade_id := (v_before->>'grade_id')::uuid;

  for v_item in select value from jsonb_array_elements(v_catalog)
  loop
    select id into v_subject_id
    from public.subjects
    where code = v_item->>'code'
    for update;

    if v_subject_id is null then
      insert into public.subjects (
        grade_id, slug, code, name, sort_order, icon, color,
        semester, curriculum_track_id, group_code, group_name
      ) values (
        v_grade_id,
        v_item->>'code',
        v_item->>'code',
        v_item->>'name',
        (v_item->>'sort_order')::integer,
        v_item->>'icon',
        v_item->>'color',
        null,
        null,
        nullif(v_item->>'group_code', ''),
        nullif(v_item->>'group_name', '')
      ) returning id into v_subject_id;
      v_created_subjects := v_created_subjects + 1;
    end if;

    with inserted as (
      insert into public.subject_curriculum_tracks (
        subject_id, curriculum_track_id, is_active, created_by
      )
      select v_subject_id, ct.id, true, v_actor
      from public.curriculum_tracks ct
      where ct.track_code in ('sanaa', 'aden') and ct.is_active
      on conflict (subject_id, curriculum_track_id)
      do update set is_active = true, updated_at = now()
      returning (xmax = 0) as was_inserted
    )
    select count(*) filter (where was_inserted)
    into v_created_links
    from inserted;
  end loop;

  -- Recalculate exact inserted-link count from the before/after snapshots;
  -- this is stable even when an inactive existing link was reactivated.
  v_after := public.admin_grade12_subject_catalog_status();
  v_created_links := (v_after->>'matched_track_links')::integer
    - (v_before->>'matched_track_links')::integer;

  if v_after->>'status' <> 'COMPLETE'
     or (v_after->>'matched_subjects')::integer <> 14
     or (v_after->>'matched_track_links')::integer <> 28 then
    raise exception 'GRADE12_CATALOG_POSTCONDITION_FAILED' using errcode = 'P0001';
  end if;

  insert into public.audit_logs(actor_id, action, target_type, target_id, metadata)
  values (
    v_actor,
    'GRADE12_SUBJECT_CATALOG_INITIALIZED',
    'grade',
    v_grade_id,
    jsonb_build_object(
      'catalog_version', 1,
      'created_subjects', v_created_subjects,
      'created_or_reactivated_links', v_created_links,
      'final_subjects', 14,
      'final_track_links', 28,
      'tracks', jsonb_build_array('sanaa', 'aden')
    )
  );

  return v_after || jsonb_build_object(
    'created_subjects', v_created_subjects,
    'created_or_reactivated_links', v_created_links
  );
end;
$function$;

revoke all on function public.admin_initialize_grade12_subject_catalog(text)
  from public, anon;
grant execute on function public.admin_initialize_grade12_subject_catalog(text)
  to authenticated;

comment on function public.admin_initialize_grade12_subject_catalog(text) is
  'Atomically initializes the canonical 14 Grade 12 subjects and their 28 Sanaa/Aden availability links after a bound, conflict-free preview.';
