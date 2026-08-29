-- Teacher Academy operational administration closure.

begin;

create or replace function academy.admin_list_programs_v2()
returns table (
  program_id uuid,
  program_version_id uuid,
  version_number integer,
  title text,
  summary text,
  audience_type text,
  subject_ids uuid[],
  subject_names text,
  estimated_minutes integer,
  status text,
  published_at timestamptz,
  archived_at timestamptz,
  is_current_published boolean,
  lesson_count bigint,
  question_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select
    programs.id,
    versions.id,
    versions.version_number,
    versions.title,
    versions.summary,
    versions.audience_type,
    coalesce(targets.subject_ids, array[]::uuid[]),
    targets.subject_names,
    versions.estimated_minutes,
    versions.status,
    versions.published_at,
    programs.archived_at,
    programs.current_published_version_id = versions.id,
    coalesce(content.lesson_count, 0),
    coalesce(assessment.question_count, 0)
  from academy.programs programs
  join academy.program_versions versions
    on versions.program_id = programs.id
  left join lateral (
    select
      array_agg(subjects.id order by subjects.display_order) as subject_ids,
      string_agg(subjects.name_ar, '، ' order by subjects.display_order) as subject_names
    from academy.program_version_subjects version_subjects
    join academy.subjects subjects on subjects.id = version_subjects.subject_id
    where version_subjects.program_version_id = versions.id
  ) targets on true
  left join lateral (
    select count(*) as lesson_count
    from academy.courses courses
    join academy.modules modules on modules.course_id = courses.id
    join academy.lessons lessons on lessons.module_id = modules.id
    where courses.program_version_id = versions.id
  ) content on true
  left join lateral (
    select count(questions.id) as question_count
    from academy.assessments assessments
    left join academy.assessment_questions questions on questions.assessment_id = assessments.id
    where assessments.program_version_id = versions.id
  ) assessment on true
  where academy.i_have_capability('ACADEMY_CATALOG_MANAGE')
  order by programs.archived_at nulls first, versions.created_at desc;
$$;

create or replace function academy.admin_create_draft_version(p_source_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_source academy.program_versions%rowtype;
  v_draft_id uuid;
  v_next_version integer;
  v_new_course_id uuid;
  v_new_module_id uuid;
  v_source_assessment academy.assessments%rowtype;
  v_new_assessment_id uuid;
  course_record record;
  module_record record;
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  select versions.* into v_source
  from academy.program_versions versions
  join academy.programs programs on programs.id = versions.program_id
  where versions.id = p_source_version_id
    and programs.archived_at is null;

  if v_source.id is null then
    raise exception 'PROGRAM_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_source.program_id::text, 0));

  select versions.id into v_draft_id
  from academy.program_versions versions
  where versions.program_id = v_source.program_id
    and versions.status = 'DRAFT'
  order by versions.version_number desc
  limit 1;

  if v_draft_id is not null then
    return v_draft_id;
  end if;

  select coalesce(max(versions.version_number), 0) + 1 into v_next_version
  from academy.program_versions versions
  where versions.program_id = v_source.program_id;

  insert into academy.program_versions (
    program_id,
    version_number,
    title,
    summary,
    audience_type,
    estimated_minutes,
    created_by
  )
  values (
    v_source.program_id,
    v_next_version,
    v_source.title,
    v_source.summary,
    v_source.audience_type,
    v_source.estimated_minutes,
    auth.uid()
  )
  returning id into v_draft_id;

  insert into academy.program_version_subjects (program_version_id, subject_id)
  select v_draft_id, targets.subject_id
  from academy.program_version_subjects targets
  where targets.program_version_id = v_source.id;

  for course_record in
    select courses.*
    from academy.courses courses
    where courses.program_version_id = v_source.id
    order by courses.display_order
  loop
    insert into academy.courses (program_version_id, title, display_order)
    values (v_draft_id, course_record.title, course_record.display_order)
    returning id into v_new_course_id;

    for module_record in
      select modules.*
      from academy.modules modules
      where modules.course_id = course_record.id
      order by modules.display_order
    loop
      insert into academy.modules (course_id, title, display_order)
      values (v_new_course_id, module_record.title, module_record.display_order)
      returning id into v_new_module_id;

      insert into academy.lessons (
        module_id,
        title,
        lesson_type,
        content,
        resource_url,
        duration_minutes,
        display_order
      )
      select
        v_new_module_id,
        lessons.title,
        lessons.lesson_type,
        lessons.content,
        lessons.resource_url,
        lessons.duration_minutes,
        lessons.display_order
      from academy.lessons lessons
      where lessons.module_id = module_record.id
      order by lessons.display_order;
    end loop;
  end loop;

  select assessments.* into v_source_assessment
  from academy.assessments assessments
  where assessments.program_version_id = v_source.id;

  if v_source_assessment.id is not null then
    insert into academy.assessments (program_version_id, title, pass_percentage)
    values (v_draft_id, v_source_assessment.title, v_source_assessment.pass_percentage)
    returning id into v_new_assessment_id;

    insert into academy.assessment_questions (
      assessment_id,
      question_text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option,
      display_order
    )
    select
      v_new_assessment_id,
      questions.question_text,
      questions.option_a,
      questions.option_b,
      questions.option_c,
      questions.option_d,
      questions.correct_option,
      questions.display_order
    from academy.assessment_questions questions
    where questions.assessment_id = v_source_assessment.id
    order by questions.display_order;
  end if;

  return v_draft_id;
end;
$$;

create or replace function academy.admin_validate_program(p_program_version_id uuid)
returns table (
  check_key text,
  label text,
  passed boolean,
  details text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_version academy.program_versions%rowtype;
  v_target_count bigint;
  v_lesson_count bigint;
  v_question_count bigint;
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  select versions.* into v_version
  from academy.program_versions versions
  where versions.id = p_program_version_id;

  if v_version.id is null then
    raise exception 'PROGRAM_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(*) into v_target_count
  from academy.program_version_subjects targets
  where targets.program_version_id = p_program_version_id;

  select count(*) into v_lesson_count
  from academy.courses courses
  join academy.modules modules on modules.course_id = courses.id
  join academy.lessons lessons on lessons.module_id = modules.id
  where courses.program_version_id = p_program_version_id;

  select count(questions.id) into v_question_count
  from academy.assessments assessments
  left join academy.assessment_questions questions on questions.assessment_id = assessments.id
  where assessments.program_version_id = p_program_version_id;

  return query values
    (
      'DRAFT_VERSION',
      'الإصدار ما زال مسودة',
      v_version.status = 'DRAFT',
      case when v_version.status = 'DRAFT' then 'جاهز للتحرير والنشر' else 'الإصدار منشور وغير قابل للتعديل' end
    ),
    (
      'AUDIENCE',
      'جمهور البرنامج محدد بصورة صحيحة',
      (v_version.audience_type = 'ALL_TEACHERS' and v_target_count = 0)
        or (v_version.audience_type = 'SUBJECT_SPECIFIC' and v_target_count > 0),
      case
        when v_version.audience_type = 'ALL_TEACHERS' then 'جميع المعلمين'
        else v_target_count::text || ' مادة مستهدفة'
      end
    ),
    (
      'LESSONS',
      'يحتوي البرنامج على درس واحد على الأقل',
      v_lesson_count > 0,
      v_lesson_count::text || ' درس'
    ),
    (
      'ASSESSMENT',
      'يحتوي التقييم على سؤال واحد على الأقل',
      v_question_count > 0,
      v_question_count::text || ' سؤال'
    );
end;
$$;

create or replace function academy.admin_set_program_archived(
  p_program_id uuid,
  p_archived boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  update academy.programs
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
  where id = p_program_id;

  if not found then
    raise exception 'PROGRAM_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function academy.admin_update_lesson(
  p_lesson_id uuid,
  p_title text,
  p_lesson_type text,
  p_content text,
  p_resource_url text,
  p_duration_minutes integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  if length(btrim(p_title)) not between 2 and 180
     or p_lesson_type not in ('TEXT', 'VIDEO', 'LINK')
     or p_duration_minutes not between 1 and 1440
     or length(coalesce(p_content, '')) > 50000
     or (p_lesson_type = 'TEXT' and length(btrim(coalesce(p_content, ''))) = 0)
     or (
       p_lesson_type in ('VIDEO', 'LINK')
       and coalesce(p_resource_url, '') !~ '^https://'
     ) then
    raise exception 'INVALID_LESSON_INPUT' using errcode = '22023';
  end if;

  update academy.lessons lessons
  set title = btrim(p_title),
      lesson_type = p_lesson_type,
      content = coalesce(p_content, ''),
      resource_url = nullif(btrim(coalesce(p_resource_url, '')), ''),
      duration_minutes = p_duration_minutes
  from academy.modules modules,
       academy.courses courses,
       academy.program_versions versions
  where lessons.id = p_lesson_id
    and modules.id = lessons.module_id
    and courses.id = modules.course_id
    and versions.id = courses.program_version_id
    and versions.status = 'DRAFT';

  if not found then
    raise exception 'DRAFT_LESSON_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function academy.admin_update_assessment_question(
  p_question_id uuid,
  p_question_text text,
  p_option_a text,
  p_option_b text,
  p_option_c text,
  p_option_d text,
  p_correct_option text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  if length(btrim(p_question_text)) not between 3 and 2000
     or length(btrim(p_option_a)) not between 1 and 1000
     or length(btrim(p_option_b)) not between 1 and 1000
     or length(btrim(p_option_c)) not between 1 and 1000
     or length(btrim(p_option_d)) not between 1 and 1000
     or p_correct_option not in ('a', 'b', 'c', 'd') then
    raise exception 'INVALID_ASSESSMENT_QUESTION_INPUT' using errcode = '22023';
  end if;

  update academy.assessment_questions questions
  set question_text = btrim(p_question_text),
      option_a = btrim(p_option_a),
      option_b = btrim(p_option_b),
      option_c = btrim(p_option_c),
      option_d = btrim(p_option_d),
      correct_option = p_correct_option
  from academy.assessments assessments,
       academy.program_versions versions
  where questions.id = p_question_id
    and assessments.id = questions.assessment_id
    and versions.id = assessments.program_version_id
    and versions.status = 'DRAFT';

  if not found then
    raise exception 'DRAFT_ASSESSMENT_QUESTION_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function academy.admin_list_programs_v2() from public, anon, authenticated;
revoke all on function academy.admin_create_draft_version(uuid) from public, anon, authenticated;
revoke all on function academy.admin_validate_program(uuid) from public, anon, authenticated;
revoke all on function academy.admin_set_program_archived(uuid, boolean) from public, anon, authenticated;
revoke all on function academy.admin_update_lesson(uuid, text, text, text, text, integer) from public, anon, authenticated;
revoke all on function academy.admin_update_assessment_question(uuid, text, text, text, text, text, text) from public, anon, authenticated;

grant execute on function academy.admin_list_programs_v2() to authenticated;
grant execute on function academy.admin_create_draft_version(uuid) to authenticated;
grant execute on function academy.admin_validate_program(uuid) to authenticated;
grant execute on function academy.admin_set_program_archived(uuid, boolean) to authenticated;
grant execute on function academy.admin_update_lesson(uuid, text, text, text, text, integer) to authenticated;
grant execute on function academy.admin_update_assessment_question(uuid, text, text, text, text, text, text) to authenticated;

commit;
