-- Read-only teacher directory for existing full administrators.
-- No role grants, teacher/profile changes, or learning-data rewrites.
begin;

create view academy.admin_teacher_directory_rows as
with enrollment_stats as (
  select user_id, count(*)::integer as enrollment_count,
    count(*) filter (where status='ACTIVE')::integer as active_programs,
    count(*) filter (where status='COMPLETED')::integer as completed_programs,
    count(*) filter (where status='CANCELLED')::integer as cancelled_programs
  from academy.enrollments group by user_id
), lesson_stats as (
  select e.user_id, count(*)::integer as completed_lessons, max(p.completed_at) as last_lesson_at
  from academy.enrollments e join academy.lesson_progress p on p.enrollment_id=e.id group by e.user_id
), attempt_stats as (
  select e.user_id, count(*)::integer as attempt_count,
    count(*) filter (where a.passed)::integer as passed_attempts,
    max(round(a.score*100.0/nullif(a.total,0)))::integer as best_score_percent,
    max(a.completed_at) as last_attempt_at
  from academy.enrollments e join academy.assessment_attempts a on a.enrollment_id=e.id group by e.user_id
), certificate_stats as (
  select e.user_id, count(*) filter (where c.revoked_at is null)::integer as valid_certificates,
    count(*) filter (where c.revoked_at is not null)::integer as revoked_certificates
  from academy.enrollments e join academy.certificates c on c.enrollment_id=e.id group by e.user_id
)
select p.user_id, p.full_name, u.email::text, p.phone, p.status,
  p.primary_subject_id as subject_id, s.name_ar as subject_name,
  p.governorate_id, g.name as governorate_name,
  p.school_id, p.school_name, p.school_district, p.school_locality,
  p.created_at, p.updated_at, u.last_sign_in_at,
  coalesce(e.enrollment_count,0) as enrollment_count,
  coalesce(e.active_programs,0) as active_programs,
  coalesce(e.completed_programs,0) as completed_programs,
  coalesce(e.cancelled_programs,0) as cancelled_programs,
  coalesce(l.completed_lessons,0) as completed_lessons,
  coalesce(a.attempt_count,0) as attempt_count,
  coalesce(a.passed_attempts,0) as passed_attempts,
  a.best_score_percent,
  coalesce(c.valid_certificates,0) as valid_certificates,
  coalesce(c.revoked_certificates,0) as revoked_certificates,
  greatest(l.last_lesson_at,a.last_attempt_at) as last_learning_at
from academy.teacher_profiles p
join auth.users u on u.id=p.user_id
left join academy.subjects s on s.id=p.primary_subject_id
left join public.governorates g on g.id=p.governorate_id
left join enrollment_stats e on e.user_id=p.user_id
left join lesson_stats l on l.user_id=p.user_id
left join attempt_stats a on a.user_id=p.user_id
left join certificate_stats c on c.user_id=p.user_id;

revoke all on academy.admin_teacher_directory_rows from public, anon, authenticated;

create function public.admin_teacher_directory(
  p_query text default '', p_status text default '',
  p_subject_id uuid default null, p_governorate_id uuid default null,
  p_activity text default '', p_page integer default 0, p_page_size integer default 20
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, academy
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin') then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_page is null or p_page < 0 or p_page > 100000 or p_page_size is null or p_page_size not between 1 and 100
    or p_status is null or p_status not in ('','ACTIVE','SUSPENDED')
    or p_activity is null or p_activity not in ('','UNENROLLED','LEARNING','COMPLETED','CERTIFIED')
    or length(coalesce(p_query,'')) > 160 then
    raise exception 'INVALID_FILTERS' using errcode='22023';
  end if;
  with all_teachers as materialized (select * from academy.admin_teacher_directory_rows),
  filtered as materialized (
    select * from all_teachers t where
      (coalesce(btrim(p_query),'')='' or position(lower(btrim(p_query)) in lower(concat_ws(' ',t.full_name,t.email,t.phone,t.school_name,t.school_district,t.school_locality)))>0)
      and (p_status='' or t.status=p_status)
      and (p_subject_id is null or t.subject_id=p_subject_id)
      and (p_governorate_id is null or t.governorate_id=p_governorate_id)
      and (p_activity='' or (p_activity='UNENROLLED' and t.enrollment_count=0)
        or (p_activity='LEARNING' and t.active_programs>0)
        or (p_activity='COMPLETED' and t.completed_programs>0)
        or (p_activity='CERTIFIED' and t.valid_certificates>0))
  ), page_rows as (
    select * from filtered order by created_at desc,user_id limit p_page_size offset (p_page*p_page_size)
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc,t.user_id) from page_rows t),'[]'::jsonb),
    'total',(select count(*) from filtered),
    'summary',(select jsonb_build_object('teachers',count(*),
      'active',count(*) filter(where status='ACTIVE'),'suspended',count(*) filter(where status='SUSPENDED'),
      'unenrolled',count(*) filter(where enrollment_count=0),
      'enrollments',coalesce(sum(enrollment_count),0),'active_programs',coalesce(sum(active_programs),0),
      'completed_programs',coalesce(sum(completed_programs),0),'cancelled_programs',coalesce(sum(cancelled_programs),0),
      'completed_lessons',coalesce(sum(completed_lessons),0),'attempts',coalesce(sum(attempt_count),0),
      'passed_attempts',coalesce(sum(passed_attempts),0),'valid_certificates',coalesce(sum(valid_certificates),0),
      'revoked_certificates',coalesce(sum(revoked_certificates),0)) from filtered),
    'subjects',coalesce((select jsonb_agg(x order by name) from (select subject_id as id,subject_name as name,count(*) as count from all_teachers group by subject_id,subject_name) x),'[]'::jsonb),
    'governorates',coalesce((select jsonb_agg(x order by name) from (select governorate_id as id,governorate_name as name,count(*) as count from all_teachers group by governorate_id,governorate_name) x),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create function public.admin_teacher_detail(p_user_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, academy
as $$
declare v_teacher jsonb; v_programs jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin') then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;
  select to_jsonb(t) into v_teacher from academy.admin_teacher_directory_rows t where t.user_id=p_user_id;
  if v_teacher is null then raise exception 'TEACHER_NOT_FOUND' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(x order by x.enrolled_at desc,x.enrollment_id),'[]'::jsonb) into v_programs
  from (
    select e.id as enrollment_id,v.id as program_version_id,v.title,v.version_number,e.status,e.enrolled_at,e.completed_at,
      (select count(*) from academy.courses co join academy.modules m on m.course_id=co.id join academy.lessons l on l.module_id=m.id where co.program_version_id=v.id) as total_lessons,
      (select count(*) from academy.lesson_progress lp where lp.enrollment_id=e.id) as completed_lessons,
      coalesce((select jsonb_agg(jsonb_build_object('attempt_id',a.id,'attempt_number',a.attempt_number,'score',a.score,'total',a.total,'passed',a.passed,'completed_at',a.completed_at) order by a.completed_at desc,a.attempt_number desc,a.id) from academy.assessment_attempts a where a.enrollment_id=e.id),'[]'::jsonb) as attempts,
      (select jsonb_build_object('code',c.certificate_code,'issued_at',c.issued_at,'revoked_at',c.revoked_at,'revocation_reason',c.revocation_reason) from academy.certificates c where c.enrollment_id=e.id) as certificate
    from academy.enrollments e join academy.program_versions v on v.id=e.program_version_id
    where e.user_id=p_user_id
  ) x;
  return jsonb_build_object('teacher',v_teacher,'programs',v_programs);
end;
$$;

revoke all on function public.admin_teacher_directory(text,text,uuid,uuid,text,integer,integer), public.admin_teacher_detail(uuid) from public, anon;
grant execute on function public.admin_teacher_directory(text,text,uuid,uuid,text,integer,integer), public.admin_teacher_detail(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
