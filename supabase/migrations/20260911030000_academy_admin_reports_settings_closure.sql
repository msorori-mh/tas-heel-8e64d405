-- Teacher Academy admin reports and settings closure.
-- Adds capability-gated operational reporting, singleton settings, guarded
-- academy-admin management, and an append-only audit trail.

begin;

create table academy.settings (
  id smallint primary key default 1 check (id = 1),
  academy_name text not null default 'أكاديمية تمكين'
    check (length(btrim(academy_name)) between 3 and 120),
  support_email text check (
    support_email is null
    or (
      length(btrim(support_email)) <= 254
      and btrim(support_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  support_phone text check (
    support_phone is null
    or (
      length(btrim(support_phone)) between 7 and 20
      and btrim(support_phone) ~ '^\+?[0-9][0-9 ()-]{5,18}[0-9]$'
    )
  ),
  default_program_minutes integer not null default 60
    check (default_program_minutes between 1 and 100000),
  default_pass_percentage integer not null default 75
    check (default_pass_percentage between 1 and 100),
  certificate_issuer_name text not null default 'أكاديمية تمكين'
    check (length(btrim(certificate_issuer_name)) between 2 and 160),
  certificate_signatory_name text check (
    certificate_signatory_name is null
    or length(btrim(certificate_signatory_name)) between 2 and 160
  ),
  certificate_signatory_title text check (
    certificate_signatory_title is null
    or length(btrim(certificate_signatory_title)) between 2 and 160
  ),
  default_live_provider text not null default 'Zoom'
    check (length(btrim(default_live_provider)) between 2 and 80),
  default_live_instructions text not null default ''
    check (length(default_live_instructions) <= 2000),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger academy_settings_set_updated_at
before update on academy.settings
for each row execute function academy.set_updated_at();

insert into academy.settings (id) values (1);

create table academy.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (
    action in (
      'SETTINGS_UPDATED',
      'CAPABILITY_GRANTED',
      'CAPABILITY_REVOKED',
      'PROGRAM_PUBLISHED',
      'PROGRAM_DRAFT_DELETED',
      'PROGRAM_ARCHIVED',
      'PROGRAM_RESTORED',
      'TEACHER_STATUS_UPDATED',
      'CERTIFICATE_REVOKED',
      'LIVE_SESSION_CREATED',
      'LIVE_SESSION_UPDATED',
      'LIVE_SESSION_DELETED'
    )
  ),
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index academy_admin_audit_log_created_idx
  on academy.admin_audit_log (created_at desc, id desc);
create index academy_admin_audit_log_target_idx
  on academy.admin_audit_log (target_user_id, created_at desc)
  where target_user_id is not null;

create or replace function academy.capture_admin_audit_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_actor_id uuid := auth.uid();
  v_action text;
  v_target_user_id uuid;
  v_details jsonb := '{}'::jsonb;
begin
  -- Migrations and trusted server maintenance do not impersonate an admin and
  -- therefore must not create misleading audit rows.
  if v_actor_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'settings' and tg_op = 'UPDATE' then
    v_action := 'SETTINGS_UPDATED';
    v_details := jsonb_build_object('settings_id', new.id);
  elsif tg_table_name = 'capability_grants' and tg_op = 'INSERT' then
    v_action := 'CAPABILITY_GRANTED';
    v_target_user_id := new.user_id;
    v_details := jsonb_build_object('capability', new.capability);
  elsif tg_table_name = 'capability_grants'
        and tg_op = 'UPDATE'
        and old.revoked_at is null
        and new.revoked_at is not null then
    v_action := 'CAPABILITY_REVOKED';
    v_target_user_id := new.user_id;
    v_details := jsonb_build_object('capability', new.capability);
  elsif tg_table_name = 'program_versions'
        and tg_op = 'UPDATE'
        and old.status = 'DRAFT'
        and new.status = 'PUBLISHED' then
    v_action := 'PROGRAM_PUBLISHED';
    v_details := jsonb_build_object(
      'program_id', new.program_id,
      'program_version_id', new.id,
      'title', new.title
    );
  elsif tg_table_name = 'program_versions' and tg_op = 'DELETE' and old.status = 'DRAFT' then
    v_action := 'PROGRAM_DRAFT_DELETED';
    v_details := jsonb_build_object(
      'program_id', old.program_id,
      'program_version_id', old.id,
      'title', old.title
    );
  elsif tg_table_name = 'programs'
        and tg_op = 'UPDATE'
        and old.archived_at is distinct from new.archived_at then
    v_action := case when new.archived_at is null then 'PROGRAM_RESTORED' else 'PROGRAM_ARCHIVED' end;
    v_details := jsonb_build_object('program_id', new.id);
  elsif tg_table_name = 'teacher_profiles'
        and tg_op = 'UPDATE'
        and old.status is distinct from new.status then
    v_action := 'TEACHER_STATUS_UPDATED';
    v_target_user_id := new.user_id;
    v_details := jsonb_build_object('from', old.status, 'to', new.status);
  elsif tg_table_name = 'certificates'
        and tg_op = 'UPDATE'
        and old.revoked_at is null
        and new.revoked_at is not null then
    v_action := 'CERTIFICATE_REVOKED';
    select enrollments.user_id into v_target_user_id
    from academy.enrollments enrollments
    where enrollments.id = new.enrollment_id;
    v_details := jsonb_build_object(
      'certificate_id', new.id,
      'certificate_code', new.certificate_code,
      'reason', new.revocation_reason
    );
  elsif tg_table_name = 'live_sessions' then
    v_action := case tg_op
      when 'INSERT' then 'LIVE_SESSION_CREATED'
      when 'UPDATE' then 'LIVE_SESSION_UPDATED'
      else 'LIVE_SESSION_DELETED'
    end;
    v_details := jsonb_build_object(
      'live_session_id', case when tg_op = 'DELETE' then old.id else new.id end,
      'program_version_id', case when tg_op = 'DELETE' then old.program_version_id else new.program_version_id end,
      'title', case when tg_op = 'DELETE' then old.title else new.title end
    );
  else
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  insert into academy.admin_audit_log (actor_id, action, target_user_id, details)
  values (v_actor_id, v_action, v_target_user_id, v_details);

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger academy_settings_admin_audit
after update on academy.settings
for each row execute function academy.capture_admin_audit_event();
create trigger academy_capability_grants_admin_audit
after insert or update of revoked_at on academy.capability_grants
for each row execute function academy.capture_admin_audit_event();
create trigger academy_program_versions_admin_audit
after update of status or delete on academy.program_versions
for each row execute function academy.capture_admin_audit_event();
create trigger academy_programs_admin_audit
after update of archived_at on academy.programs
for each row execute function academy.capture_admin_audit_event();
create trigger academy_teacher_profiles_admin_audit
after update of status on academy.teacher_profiles
for each row execute function academy.capture_admin_audit_event();
create trigger academy_certificates_admin_audit
after update of revoked_at on academy.certificates
for each row execute function academy.capture_admin_audit_event();
create trigger academy_live_sessions_admin_audit
after insert or update or delete on academy.live_sessions
for each row execute function academy.capture_admin_audit_event();

create or replace function academy.admin_get_settings()
returns table (
  academy_name text,
  support_email text,
  support_phone text,
  default_program_minutes integer,
  default_pass_percentage integer,
  certificate_issuer_name text,
  certificate_signatory_name text,
  certificate_signatory_title text,
  default_live_provider text,
  default_live_instructions text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, academy
as $$
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  return query
  select settings.academy_name, settings.support_email, settings.support_phone,
         settings.default_program_minutes, settings.default_pass_percentage,
         settings.certificate_issuer_name, settings.certificate_signatory_name,
         settings.certificate_signatory_title, settings.default_live_provider,
         settings.default_live_instructions, settings.updated_at
  from academy.settings settings where settings.id = 1;
end;
$$;

create or replace function academy.admin_update_settings(
  p_academy_name text,
  p_support_email text,
  p_support_phone text,
  p_default_program_minutes integer,
  p_default_pass_percentage integer,
  p_certificate_issuer_name text,
  p_certificate_signatory_name text,
  p_certificate_signatory_title text,
  p_default_live_provider text,
  p_default_live_instructions text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_support_email text := nullif(btrim(coalesce(p_support_email, '')), '');
  v_support_phone text := nullif(btrim(coalesce(p_support_phone, '')), '');
  v_signatory_name text := nullif(btrim(coalesce(p_certificate_signatory_name, '')), '');
  v_signatory_title text := nullif(btrim(coalesce(p_certificate_signatory_title, '')), '');
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_academy_name, ''))) not between 3 and 120
     or (v_support_email is not null and (
       length(v_support_email) > 254
       or v_support_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     ))
     or (v_support_phone is not null and (
       length(v_support_phone) not between 7 and 20
       or v_support_phone !~ '^\+?[0-9][0-9 ()-]{5,18}[0-9]$'
     ))
     or p_default_program_minutes not between 1 and 100000
     or p_default_pass_percentage not between 1 and 100
     or length(btrim(coalesce(p_certificate_issuer_name, ''))) not between 2 and 160
     or (v_signatory_name is not null and length(v_signatory_name) not between 2 and 160)
     or (v_signatory_title is not null and length(v_signatory_title) not between 2 and 160)
     or length(btrim(coalesce(p_default_live_provider, ''))) not between 2 and 80
     or length(coalesce(p_default_live_instructions, '')) > 2000 then
    raise exception 'INVALID_ACADEMY_SETTINGS' using errcode = '22023';
  end if;

  update academy.settings settings
  set academy_name = btrim(p_academy_name),
      support_email = v_support_email,
      support_phone = v_support_phone,
      default_program_minutes = p_default_program_minutes,
      default_pass_percentage = p_default_pass_percentage,
      certificate_issuer_name = btrim(p_certificate_issuer_name),
      certificate_signatory_name = v_signatory_name,
      certificate_signatory_title = v_signatory_title,
      default_live_provider = btrim(p_default_live_provider),
      default_live_instructions = btrim(coalesce(p_default_live_instructions, '')),
      updated_by = auth.uid()
  where settings.id = 1;
end;
$$;

create or replace function academy.admin_list_academy_admins()
returns table (
  user_id uuid,
  email text,
  capabilities text[],
  last_granted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, academy
as $$
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  return query
  select users.id, users.email::text,
         array_agg(grants.capability order by grants.capability),
         max(grants.granted_at)
  from auth.users users
  join academy.capability_grants grants
    on grants.user_id = users.id and grants.revoked_at is null
  group by users.id, users.email
  order by users.email;
end;
$$;

create or replace function academy.admin_set_user_capabilities(
  p_email text,
  p_capabilities text[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_target_user_id uuid;
  v_capabilities text[];
  v_capability text;
  v_has_catalog boolean;
  v_requests_catalog boolean;
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('academy-catalog-managers'));

  select users.id into v_target_user_id
  from auth.users users
  where lower(users.email) = lower(btrim(coalesce(p_email, '')))
  limit 1;

  if v_target_user_id is null then
    raise exception 'ACADEMY_ADMIN_USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_capabilities, array[]::text[])) requested(capability)
    where requested.capability not in (
      'ACADEMY_CATALOG_MANAGE', 'ACADEMY_TEACHERS_VIEW', 'ACADEMY_PROGRESS_VIEW'
    )
  ) then
    raise exception 'INVALID_ACADEMY_CAPABILITY' using errcode = '22023';
  end if;

  select coalesce(array_agg(capability order by capability), array[]::text[])
  into v_capabilities
  from (
    select distinct requested.capability
    from unnest(coalesce(p_capabilities, array[]::text[])) requested(capability)
  ) normalized;

  select exists (
    select 1 from academy.capability_grants grants
    where grants.user_id = v_target_user_id
      and grants.capability = 'ACADEMY_CATALOG_MANAGE'
      and grants.revoked_at is null
  ) into v_has_catalog;
  v_requests_catalog := 'ACADEMY_CATALOG_MANAGE' = any(v_capabilities);

  if v_target_user_id = auth.uid() and v_has_catalog and not v_requests_catalog then
    raise exception 'ACADEMY_ADMIN_SELF_LOCKOUT_BLOCKED' using errcode = '42501';
  end if;

  if v_has_catalog and not v_requests_catalog and (
    select count(*) from academy.capability_grants grants
    where grants.capability = 'ACADEMY_CATALOG_MANAGE' and grants.revoked_at is null
  ) <= 1 then
    raise exception 'ACADEMY_LAST_CATALOG_MANAGER_REQUIRED' using errcode = '42501';
  end if;

  update academy.capability_grants grants
  set revoked_at = now()
  where grants.user_id = v_target_user_id
    and grants.revoked_at is null
    and not (grants.capability = any(v_capabilities));

  foreach v_capability in array v_capabilities loop
    if not exists (
      select 1 from academy.capability_grants grants
      where grants.user_id = v_target_user_id
        and grants.capability = v_capability
        and grants.revoked_at is null
    ) then
      insert into academy.capability_grants (user_id, capability, granted_by)
      values (v_target_user_id, v_capability, auth.uid());
    end if;
  end loop;

  return v_target_user_id;
end;
$$;

create or replace function academy.admin_list_audit_log(p_limit integer default 50)
returns table (
  audit_id bigint,
  actor_email text,
  action text,
  target_email text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, academy
as $$
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  if p_limit not between 1 and 200 then
    raise exception 'INVALID_AUDIT_LIMIT' using errcode = '22023';
  end if;

  return query
  select log.id, actor.email::text, log.action, target.email::text, log.details, log.created_at
  from academy.admin_audit_log log
  left join auth.users actor on actor.id = log.actor_id
  left join auth.users target on target.id = log.target_user_id
  order by log.created_at desc, log.id desc
  limit p_limit;
end;
$$;

create or replace function academy.admin_report_programs(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  program_version_id uuid,
  program_title text,
  audience_type text,
  subject_name text,
  enrolled_count bigint,
  active_count bigint,
  completed_count bigint,
  completion_rate numeric,
  attempt_count bigint,
  passed_attempt_count bigint,
  pass_rate numeric,
  average_score_percentage numeric,
  certificate_count bigint,
  valid_certificate_count bigint,
  revoked_certificate_count bigint,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, academy
as $$
begin
  if not academy.i_have_capability('ACADEMY_PROGRESS_VIEW') then
    raise exception 'ACADEMY_PROGRESS_VIEW_REQUIRED' using errcode = '42501';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'INVALID_REPORT_DATE_RANGE' using errcode = '22023';
  end if;

  return query
  select versions.id, versions.title, versions.audience_type,
         case when versions.audience_type = 'SUBJECT_SPECIFIC' then subjects.name_ar else null end,
         coalesce(enrollment_stats.enrolled_count, 0),
         coalesce(enrollment_stats.active_count, 0),
         coalesce(enrollment_stats.completed_count, 0),
         coalesce(round(
           enrollment_stats.completed_count::numeric * 100
           / nullif(enrollment_stats.enrolled_count, 0), 2
         ), 0),
         coalesce(attempt_stats.attempt_count, 0),
         coalesce(attempt_stats.passed_attempt_count, 0),
         coalesce(round(
           attempt_stats.passed_attempt_count::numeric * 100
           / nullif(attempt_stats.attempt_count, 0), 2
         ), 0),
         coalesce(attempt_stats.average_score_percentage, 0),
         coalesce(certificate_stats.certificate_count, 0),
         coalesce(certificate_stats.valid_certificate_count, 0),
         coalesce(certificate_stats.revoked_certificate_count, 0),
         greatest(
           enrollment_stats.last_enrollment_at,
           attempt_stats.last_attempt_at,
           progress_stats.last_progress_at,
           certificate_stats.last_certificate_at
         )
  from academy.programs programs
  join academy.program_versions versions
    on versions.id = programs.current_published_version_id and versions.status = 'PUBLISHED'
  left join academy.program_version_subjects targets on targets.program_version_id = versions.id
  left join academy.subjects subjects on subjects.id = targets.subject_id
  left join lateral (
    select count(*) as enrolled_count,
           count(*) filter (where enrollments.status = 'ACTIVE') as active_count,
           count(*) filter (where enrollments.status = 'COMPLETED') as completed_count,
           max(enrollments.enrolled_at) as last_enrollment_at
    from academy.enrollments enrollments
    where enrollments.program_version_id = versions.id
      and enrollments.status <> 'CANCELLED'
      and (p_from is null or enrollments.enrolled_at >= p_from)
      and (p_to is null or enrollments.enrolled_at <= p_to)
  ) enrollment_stats on true
  left join lateral (
    select count(*) as attempt_count,
           count(*) filter (where attempts.passed) as passed_attempt_count,
           round(avg(attempts.score::numeric * 100 / attempts.total), 2) as average_score_percentage,
           max(attempts.completed_at) as last_attempt_at
    from academy.assessment_attempts attempts
    join academy.enrollments enrollments on enrollments.id = attempts.enrollment_id
    where enrollments.program_version_id = versions.id
      and enrollments.status <> 'CANCELLED'
      and (p_from is null or enrollments.enrolled_at >= p_from)
      and (p_to is null or enrollments.enrolled_at <= p_to)
  ) attempt_stats on true
  left join lateral (
    select max(progress.completed_at) as last_progress_at
    from academy.lesson_progress progress
    join academy.enrollments enrollments on enrollments.id = progress.enrollment_id
    where enrollments.program_version_id = versions.id
      and enrollments.status <> 'CANCELLED'
      and (p_from is null or enrollments.enrolled_at >= p_from)
      and (p_to is null or enrollments.enrolled_at <= p_to)
  ) progress_stats on true
  left join lateral (
    select count(*) as certificate_count,
           count(*) filter (where certificates.revoked_at is null) as valid_certificate_count,
           count(*) filter (where certificates.revoked_at is not null) as revoked_certificate_count,
           max(certificates.issued_at) as last_certificate_at
    from academy.certificates certificates
    join academy.enrollments enrollments on enrollments.id = certificates.enrollment_id
    where enrollments.program_version_id = versions.id
      and enrollments.status <> 'CANCELLED'
      and (p_from is null or enrollments.enrolled_at >= p_from)
      and (p_to is null or enrollments.enrolled_at <= p_to)
  ) certificate_stats on true
  where programs.archived_at is null
  order by versions.title;
end;
$$;

create or replace function academy.admin_report_lesson_engagement(
  p_program_version_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  program_version_id uuid,
  program_title text,
  lesson_id uuid,
  lesson_title text,
  display_order integer,
  enrolled_count bigint,
  completed_count bigint,
  completion_rate numeric,
  not_completed_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, academy
as $$
begin
  if not academy.i_have_capability('ACADEMY_PROGRESS_VIEW') then
    raise exception 'ACADEMY_PROGRESS_VIEW_REQUIRED' using errcode = '42501';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'INVALID_REPORT_DATE_RANGE' using errcode = '22023';
  end if;

  return query
  with lesson_catalog as (
    select versions.id as version_id, versions.title as version_title,
           lessons.id as item_id, lessons.title as item_title,
           row_number() over (
             partition by versions.id
             order by courses.display_order, modules.display_order, lessons.display_order, lessons.id
           )::integer as item_order
    from academy.programs programs
    join academy.program_versions versions
      on versions.id = programs.current_published_version_id and versions.status = 'PUBLISHED'
    join academy.courses courses on courses.program_version_id = versions.id
    join academy.modules modules on modules.course_id = courses.id
    join academy.lessons lessons on lessons.module_id = modules.id
    where programs.archived_at is null
      and (p_program_version_id is null or versions.id = p_program_version_id)
  ), scoped_enrollments as (
    select enrollments.id, enrollments.program_version_id
    from academy.enrollments enrollments
    where enrollments.status <> 'CANCELLED'
      and (p_from is null or enrollments.enrolled_at >= p_from)
      and (p_to is null or enrollments.enrolled_at <= p_to)
  )
  select catalog.version_id, catalog.version_title, catalog.item_id, catalog.item_title,
         catalog.item_order,
         count(distinct enrollments.id),
         count(distinct enrollments.id) filter (where progress.id is not null),
         coalesce(round(
           count(distinct enrollments.id) filter (where progress.id is not null)::numeric * 100
           / nullif(count(distinct enrollments.id), 0), 2
         ), 0),
         count(distinct enrollments.id) -
           count(distinct enrollments.id) filter (where progress.id is not null)
  from lesson_catalog catalog
  left join scoped_enrollments enrollments on enrollments.program_version_id = catalog.version_id
  left join academy.lesson_progress progress
    on progress.enrollment_id = enrollments.id and progress.lesson_id = catalog.item_id
  group by catalog.version_id, catalog.version_title, catalog.item_id,
           catalog.item_title, catalog.item_order
  order by catalog.version_title, catalog.item_order;
end;
$$;

alter table academy.settings enable row level security;
alter table academy.admin_audit_log enable row level security;

revoke all on academy.settings, academy.admin_audit_log from public, anon, authenticated;
revoke all on function academy.capture_admin_audit_event() from public, anon, authenticated;
revoke all on function academy.admin_get_settings() from public, anon, authenticated;
revoke all on function academy.admin_update_settings(text, text, text, integer, integer, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function academy.admin_list_academy_admins() from public, anon, authenticated;
revoke all on function academy.admin_set_user_capabilities(text, text[]) from public, anon, authenticated;
revoke all on function academy.admin_list_audit_log(integer) from public, anon, authenticated;
revoke all on function academy.admin_report_programs(timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function academy.admin_report_lesson_engagement(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

grant execute on function academy.admin_get_settings() to authenticated, service_role;
grant execute on function academy.admin_update_settings(text, text, text, integer, integer, text, text, text, text, text)
  to authenticated, service_role;
grant execute on function academy.admin_list_academy_admins() to authenticated, service_role;
grant execute on function academy.admin_set_user_capabilities(text, text[]) to authenticated, service_role;
grant execute on function academy.admin_list_audit_log(integer) to authenticated, service_role;
grant execute on function academy.admin_report_programs(timestamptz, timestamptz)
  to authenticated, service_role;
grant execute on function academy.admin_report_lesson_engagement(uuid, timestamptz, timestamptz)
  to authenticated, service_role;

commit;
