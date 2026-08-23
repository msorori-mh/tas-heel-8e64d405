-- CURRICULUM_READINESS_SUBJECT_TRACKS_13N
-- One atomic, audited boundary for creating/updating a subject and attaching
-- it to one or both operational curriculum tracks.

create or replace function public.admin_save_curriculum_subject(
  _subject_id uuid,
  _name text,
  _grade_id uuid,
  _track_ids uuid[],
  _sort_order integer default 0,
  _icon text default null,
  _color text default null,
  _group_code text default null,
  _group_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor uuid := auth.uid();
  v_grade_slug text;
  v_grade_short text;
  v_subject_id uuid;
  v_code text;
  v_subject_no integer;
  v_track_ids uuid[];
  v_existing_track_ids uuid[];
  v_track_count integer;
  v_legacy_track_id uuid;
  v_existing_group_code text;
begin
  if v_actor is null or not public.is_content_staff(v_actor) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  _name := nullif(btrim(_name), '');
  if _name is null or char_length(_name) > 160 then
    raise exception 'SUBJECT_NAME_INVALID' using errcode = '22023';
  end if;
  if _sort_order < 0 or _sort_order > 100000 then
    raise exception 'SUBJECT_SORT_ORDER_INVALID' using errcode = '22023';
  end if;

  select slug into v_grade_slug
  from public.grades
  where id = _grade_id;
  if v_grade_slug is null then
    raise exception 'GRADE_NOT_FOUND' using errcode = '23503';
  end if;

  v_grade_short := case v_grade_slug
    when 'grade-10' then 'g10'
    when 'grade-11' then 'g11'
    when 'grade-12' then 'g12'
    else null
  end;
  if v_grade_short is null then
    raise exception 'GRADE_NOT_SUPPORTED_BY_TCS2' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct id order by id), '{}'::uuid[]), count(distinct id)
    into v_track_ids, v_track_count
  from public.curriculum_tracks
  where id = any(coalesce(_track_ids, '{}'::uuid[]))
    and is_active
    and track_code in ('sanaa', 'aden');

  if v_track_count < 1 or v_track_count > 2
     or v_track_count <> cardinality(coalesce(_track_ids, '{}'::uuid[])) then
    raise exception 'SUBJECT_TRACKS_INVALID: choose Sanaa, Aden, or both'
      using errcode = '22023';
  end if;

  _group_code := nullif(lower(btrim(_group_code)), '');
  _group_name := nullif(btrim(_group_name), '');
  if (_group_code is null) <> (_group_name is null) then
    raise exception 'SUBJECT_GROUP_PAIR_INVALID' using errcode = '22023';
  end if;

  v_legacy_track_id := case when v_track_count = 1 then v_track_ids[1] else null end;

  if _subject_id is null then
    perform pg_advisory_xact_lock(hashtext('tcs2-subject:' || v_grade_slug));

    select coalesce(
      max((regexp_match(code, '^sub-' || v_grade_short || '-([0-9]{3})$'))[1]::integer),
      0
    ) + 1
      into v_subject_no
    from public.subjects
    where grade_id = _grade_id
      and code ~ ('^sub-' || v_grade_short || '-[0-9]{3}$');

    if v_subject_no > 999 then
      raise exception 'TCS2_SUBJECT_NUMBER_OVERFLOW' using errcode = '22003';
    end if;

    v_code := 'sub-' || v_grade_short || '-' || lpad(v_subject_no::text, 3, '0');
    insert into public.subjects (
      grade_id, slug, code, name, sort_order, icon, color,
      curriculum_track_id, group_code, group_name
    )
    values (
      _grade_id, v_code, v_code, _name, _sort_order,
      coalesce(nullif(btrim(_icon), ''), 'BookOpen'),
      coalesce(nullif(btrim(_color), ''), '#3b82f6'),
      v_legacy_track_id, _group_code, _group_name
    )
    returning id into v_subject_id;
  else
    select id, code, group_code
      into v_subject_id, v_code, v_existing_group_code
    from public.subjects
    where id = _subject_id
      and grade_id = _grade_id
    for update;
    if v_subject_id is null then
      raise exception 'SUBJECT_NOT_FOUND_OR_GRADE_IMMUTABLE' using errcode = '23503';
    end if;
    if v_existing_group_code is distinct from _group_code then
      raise exception 'SUBJECT_GROUP_CODE_IMMUTABLE' using errcode = '22023';
    end if;

    select coalesce(array_agg(curriculum_track_id order by curriculum_track_id), '{}'::uuid[])
      into v_existing_track_ids
    from public.subject_curriculum_tracks
    where subject_id = v_subject_id and is_active;

    if not (v_existing_track_ids <@ v_track_ids) then
      raise exception 'SUBJECT_TRACK_DETACH_REQUIRES_IMPACT_REVIEW'
        using errcode = '42501';
    end if;

    update public.subjects
    set name = _name,
        sort_order = _sort_order,
        icon = coalesce(nullif(btrim(_icon), ''), 'BookOpen'),
        color = coalesce(nullif(btrim(_color), ''), '#3b82f6'),
        curriculum_track_id = v_legacy_track_id,
        group_name = _group_name
    where id = v_subject_id;
  end if;

  insert into public.subject_curriculum_tracks (
    subject_id, curriculum_track_id, is_active, created_by
  )
  select v_subject_id, track_id, true, v_actor
  from unnest(v_track_ids) as track_id
  on conflict (subject_id, curriculum_track_id)
  do update set is_active = true, updated_at = now();

  return jsonb_build_object(
    'id', v_subject_id,
    'code', v_code,
    'track_ids', to_jsonb(v_track_ids),
    'created', _subject_id is null
  );
end;
$function$;

revoke all on function public.admin_save_curriculum_subject(
  uuid, text, uuid, uuid[], integer, text, text, text, text
) from public, anon;
grant execute on function public.admin_save_curriculum_subject(
  uuid, text, uuid, uuid[], integer, text, text, text, text
) to authenticated;

comment on function public.admin_save_curriculum_subject(
  uuid, text, uuid, uuid[], integer, text, text, text, text
) is
  '13N: atomically creates/updates a subject, generates TCS-2 identity, and attaches Sanaa/Aden availability. Existing track detach remains impact-gated.';
