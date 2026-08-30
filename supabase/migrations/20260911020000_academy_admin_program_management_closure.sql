-- Teacher Academy admin program-management closure.
-- Adds richer readiness metrics, atomic bundle import, exact lesson ordering,
-- and fail-closed deletion for draft versions only.

begin;

create or replace function academy.admin_list_programs_v3()
returns table (
  program_id uuid,
  program_version_id uuid,
  version_number integer,
  title text,
  summary text,
  detailed_description text,
  objectives text[],
  prerequisites text[],
  instructions text[],
  audience_type text,
  subject_ids uuid[],
  subject_names text,
  estimated_minutes integer,
  status text,
  published_at timestamptz,
  archived_at timestamptz,
  is_current_published boolean,
  lesson_count bigint,
  question_count bigint,
  structured_lesson_count bigint,
  lesson_minutes bigint,
  assessment_pass_percentage integer,
  live_session_count bigint
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
    details.detailed_description,
    details.objectives,
    details.prerequisites,
    details.instructions,
    versions.audience_type,
    coalesce(targets.subject_ids, array[]::uuid[]),
    targets.subject_names,
    versions.estimated_minutes,
    versions.status,
    versions.published_at,
    programs.archived_at,
    programs.current_published_version_id = versions.id,
    coalesce(content.lesson_count, 0),
    coalesce(assessment.question_count, 0),
    coalesce(content.structured_lesson_count, 0),
    coalesce(content.lesson_minutes, 0),
    assessment.pass_percentage,
    coalesce(sessions.live_session_count, 0)
  from academy.programs programs
  join academy.program_versions versions on versions.program_id = programs.id
  left join academy.program_version_details details on details.program_version_id = versions.id
  left join lateral (
    select
      array_agg(subjects.id) as subject_ids,
      string_agg(subjects.name_ar, '، ') as subject_names
    from academy.program_version_subjects version_subjects
    join academy.subjects subjects on subjects.id = version_subjects.subject_id
    where version_subjects.program_version_id = versions.id
  ) targets on true
  left join lateral (
    select
      count(*) as lesson_count,
      count(*) filter (
        where exists (
          select 1 from academy.lesson_sections sections
          where sections.lesson_id = lessons.id and sections.section_type = 'OBJECTIVE'
        )
        and exists (
          select 1 from academy.lesson_sections sections
          where sections.lesson_id = lessons.id and sections.section_type = 'CONTENT'
        )
        and exists (
          select 1 from academy.lesson_sections sections
          where sections.lesson_id = lessons.id and sections.section_type = 'SUMMARY'
        )
      ) as structured_lesson_count,
      coalesce(sum(lessons.duration_minutes), 0) as lesson_minutes
    from academy.courses courses
    join academy.modules modules on modules.course_id = courses.id
    join academy.lessons lessons on lessons.module_id = modules.id
    where courses.program_version_id = versions.id
  ) content on true
  left join lateral (
    select
      count(questions.id) as question_count,
      max(assessments.pass_percentage) as pass_percentage
    from academy.assessments assessments
    left join academy.assessment_questions questions on questions.assessment_id = assessments.id
    where assessments.program_version_id = versions.id
  ) assessment on true
  left join lateral (
    select count(*) as live_session_count
    from academy.live_sessions live_sessions
    where live_sessions.program_version_id = versions.id
  ) sessions on true
  where academy.i_have_capability('ACADEMY_CATALOG_MANAGE')
  order by programs.archived_at nulls first, versions.created_at desc;
$$;

create or replace function academy.admin_reorder_lessons(
  p_program_version_id uuid,
  p_lesson_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_expected_count integer;
  v_module_count integer;
  v_module_id uuid;
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from academy.program_versions versions
    where versions.id = p_program_version_id and versions.status = 'DRAFT'
  ) then
    raise exception 'DRAFT_PROGRAM_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_lesson_ids is null
     or cardinality(p_lesson_ids) < 1
     or cardinality(p_lesson_ids) > 500
     or (select count(distinct lesson_id) from unnest(p_lesson_ids) lesson_id)
        <> cardinality(p_lesson_ids) then
    raise exception 'LESSON_ORDER_MUST_BE_EXACT' using errcode = '22023';
  end if;

  select count(*), count(distinct lessons.module_id), max(lessons.module_id::text)::uuid
  into v_expected_count, v_module_count, v_module_id
  from academy.courses courses
  join academy.modules modules on modules.course_id = courses.id
  join academy.lessons lessons on lessons.module_id = modules.id
  where courses.program_version_id = p_program_version_id;

  if v_expected_count <> cardinality(p_lesson_ids)
     or v_module_count <> 1
     or (
       select count(*)
       from unnest(p_lesson_ids) requested(lesson_id)
       join academy.lessons lessons on lessons.id = requested.lesson_id
       where lessons.module_id = v_module_id
     ) <> v_expected_count then
    raise exception 'LESSON_ORDER_MUST_BE_EXACT' using errcode = '22023';
  end if;

  perform 1
  from academy.lessons lessons
  where lessons.module_id = v_module_id
  for update;

  -- Move every row outside the active range first to preserve the unique order key.
  update academy.lessons lessons
  set display_order = lessons.display_order + 1000000
  where lessons.module_id = v_module_id;

  update academy.lessons lessons
  set display_order = requested.ordinality::integer - 1
  from unnest(p_lesson_ids) with ordinality requested(lesson_id, ordinality)
  where lessons.id = requested.lesson_id and lessons.module_id = v_module_id;
end;
$$;

create or replace function academy.admin_delete_draft_version(p_program_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_program_id uuid;
  v_program_deleted boolean := false;
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  select versions.program_id into v_program_id
  from academy.program_versions versions
  where versions.id = p_program_version_id and versions.status = 'DRAFT'
  for update;

  if v_program_id is null then
    raise exception 'DRAFT_PROGRAM_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from academy.programs programs
    where programs.id = v_program_id
      and programs.current_published_version_id = p_program_version_id
  ) then
    raise exception 'PUBLISHED_ACADEMY_CONTENT_IS_IMMUTABLE' using errcode = '42501';
  end if;

  if exists (
    select 1 from academy.enrollments enrollments
    where enrollments.program_version_id = p_program_version_id
  ) then
    raise exception 'DRAFT_PROGRAM_HAS_LEARNING_RECORDS' using errcode = '23503';
  end if;

  -- Delete draft-owned content while the parent version is still visible to
  -- every immutable-parent trigger. This avoids relying on cascade timing.
  delete from academy.assessment_questions questions
  using academy.assessments assessments
  where questions.assessment_id = assessments.id
    and assessments.program_version_id = p_program_version_id;
  delete from academy.assessments assessments
  where assessments.program_version_id = p_program_version_id;

  delete from academy.lesson_sections sections
  using academy.lessons lessons, academy.modules modules, academy.courses courses
  where sections.lesson_id = lessons.id
    and lessons.module_id = modules.id
    and modules.course_id = courses.id
    and courses.program_version_id = p_program_version_id;
  delete from academy.lessons lessons
  using academy.modules modules, academy.courses courses
  where lessons.module_id = modules.id
    and modules.course_id = courses.id
    and courses.program_version_id = p_program_version_id;
  delete from academy.modules modules
  using academy.courses courses
  where modules.course_id = courses.id
    and courses.program_version_id = p_program_version_id;
  delete from academy.courses courses
  where courses.program_version_id = p_program_version_id;

  delete from academy.live_sessions live_sessions
  where live_sessions.program_version_id = p_program_version_id;
  delete from academy.program_version_subjects targets
  where targets.program_version_id = p_program_version_id;
  delete from academy.program_version_details details
  where details.program_version_id = p_program_version_id;

  delete from academy.program_versions versions
  where versions.id = p_program_version_id and versions.status = 'DRAFT';

  if not found then
    raise exception 'DRAFT_PROGRAM_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from academy.program_versions versions where versions.program_id = v_program_id
  ) then
    delete from academy.programs programs
    where programs.id = v_program_id and programs.current_published_version_id is null;
    v_program_deleted := found;
  end if;

  return jsonb_build_object('deleted', true, 'program_deleted', v_program_deleted);
end;
$$;

create or replace function academy.admin_import_program_bundle(p_bundle jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_metadata jsonb;
  v_assessment jsonb;
  v_subject_id uuid;
  v_program_version_id uuid;
  v_lesson jsonb;
  v_sections jsonb;
  v_question jsonb;
  v_options jsonb;
  v_objectives text[];
  v_prerequisites text[];
  v_instructions text[];
  v_title text;
  v_audience_type text;
  v_subject_code text;
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;

  if p_bundle is null
     or jsonb_typeof(p_bundle) <> 'object'
     or p_bundle->>'bundleType' not in ('NEW_PROGRAM', 'NEW_SUBJECT_PROGRAM')
     or jsonb_typeof(p_bundle->'metadata') <> 'object'
     or jsonb_typeof(p_bundle->'lessons') <> 'array'
     or jsonb_array_length(p_bundle->'lessons') not between 1 and 100
     or jsonb_typeof(p_bundle->'assessment') <> 'object'
     or jsonb_typeof(p_bundle->'assessment'->'questions') <> 'array'
     or jsonb_array_length(p_bundle->'assessment'->'questions') not between 1 and 200 then
    raise exception 'INVALID_PROGRAM_BUNDLE' using errcode = '22023';
  end if;

  v_metadata := p_bundle->'metadata';
  v_assessment := p_bundle->'assessment';
  v_title := btrim(coalesce(v_metadata->>'title', ''));
  v_audience_type := v_metadata->>'audienceType';
  v_subject_code := nullif(btrim(coalesce(v_metadata->>'subjectCode', '')), '');

  if jsonb_typeof(v_metadata->'objectives') <> 'array'
     or jsonb_typeof(v_metadata->'prerequisites') <> 'array'
     or jsonb_typeof(v_metadata->'instructions') <> 'array'
     or v_audience_type not in ('ALL_TEACHERS', 'SUBJECT_SPECIFIC')
     or (v_audience_type = 'ALL_TEACHERS' and v_subject_code is not null)
     or (v_audience_type = 'SUBJECT_SPECIFIC' and v_subject_code is null) then
    raise exception 'INVALID_PROGRAM_BUNDLE' using errcode = '22023';
  end if;

  select coalesce(array_agg(btrim(item)), array[]::text[])
  into v_objectives from jsonb_array_elements_text(v_metadata->'objectives') item;
  select coalesce(array_agg(btrim(item)), array[]::text[])
  into v_prerequisites from jsonb_array_elements_text(v_metadata->'prerequisites') item;
  select coalesce(array_agg(btrim(item)), array[]::text[])
  into v_instructions from jsonb_array_elements_text(v_metadata->'instructions') item;

  if v_subject_code is not null then
    select subjects.id into v_subject_id
    from academy.subjects subjects
    where subjects.code = v_subject_code and subjects.is_active;
    if v_subject_id is null then
      raise exception 'INVALID_OR_INACTIVE_SUBJECT_TARGET' using errcode = '22023';
    end if;
  end if;

  if exists (
    select 1
    from academy.program_versions versions
    join academy.programs programs on programs.id = versions.program_id
    where programs.archived_at is null and lower(versions.title) = lower(v_title)
  ) then
    raise exception 'ACADEMY_IMPORT_PROGRAM_ALREADY_EXISTS' using errcode = '23505';
  end if;

  -- The called capability-guarded functions retain all field-level validation.
  -- A PostgreSQL function call is one statement, so any failure rolls back every insert.
  v_program_version_id := academy.admin_create_program_v2(
    v_title,
    v_metadata->>'summary',
    v_metadata->>'detailedDescription',
    v_objectives,
    v_prerequisites,
    v_instructions,
    v_audience_type,
    (v_metadata->>'estimatedMinutes')::integer,
    v_subject_id
  );

  for v_lesson in select value from jsonb_array_elements(p_bundle->'lessons') loop
    if jsonb_typeof(v_lesson) <> 'object'
       or jsonb_typeof(v_lesson->'sections') <> 'object' then
      raise exception 'INVALID_PROGRAM_BUNDLE_LESSON' using errcode = '22023';
    end if;
    v_sections := v_lesson->'sections';
    perform academy.admin_save_structured_lesson(
      null,
      v_program_version_id,
      v_lesson->>'title',
      'TEXT',
      null,
      (v_lesson->>'durationMinutes')::integer,
      jsonb_build_array(
        jsonb_build_object('section_type', 'OBJECTIVE', 'title', 'هدف الدرس', 'content', v_sections->>'objective'),
        jsonb_build_object('section_type', 'INTRODUCTION', 'title', 'مدخل مهني', 'content', v_sections->>'introduction'),
        jsonb_build_object('section_type', 'CONTENT', 'title', 'المادة العلمية', 'content', v_sections->>'content'),
        jsonb_build_object('section_type', 'EXAMPLE', 'title', 'مثال صفي', 'content', v_sections->>'example'),
        jsonb_build_object('section_type', 'ACTIVITY', 'title', 'مهمة تطبيقية', 'content', v_sections->>'activity'),
        jsonb_build_object('section_type', 'SUMMARY', 'title', 'الخلاصة العملية', 'content', v_sections->>'summary')
      )
    );
  end loop;

  perform academy.admin_save_assessment(
    v_program_version_id,
    v_assessment->>'title',
    (v_assessment->>'passPercentage')::integer
  );

  for v_question in select value from jsonb_array_elements(v_assessment->'questions') loop
    v_options := v_question->'options';
    if jsonb_typeof(v_question) <> 'object'
       or jsonb_typeof(v_options) <> 'array'
       or jsonb_array_length(v_options) <> 4 then
      raise exception 'INVALID_PROGRAM_BUNDLE_QUESTION' using errcode = '22023';
    end if;
    perform academy.admin_add_assessment_question(
      v_program_version_id,
      v_question->>'questionText',
      v_options->>0,
      v_options->>1,
      v_options->>2,
      v_options->>3,
      v_question->>'correctOption'
    );
  end loop;

  if exists (
    select 1 from academy.admin_validate_program(v_program_version_id) checks
    where not checks.passed
  ) then
    raise exception 'ACADEMY_IMPORT_SERVER_VALIDATION_FAILED' using errcode = '22023';
  end if;

  return v_program_version_id;
end;
$$;

revoke all on function academy.admin_list_programs_v3() from public, anon, authenticated;
revoke all on function academy.admin_reorder_lessons(uuid, uuid[]) from public, anon, authenticated;
revoke all on function academy.admin_delete_draft_version(uuid) from public, anon, authenticated;
revoke all on function academy.admin_import_program_bundle(jsonb) from public, anon, authenticated;

grant execute on function academy.admin_list_programs_v3() to authenticated;
grant execute on function academy.admin_reorder_lessons(uuid, uuid[]) to authenticated;
grant execute on function academy.admin_delete_draft_version(uuid) to authenticated;
grant execute on function academy.admin_import_program_bundle(jsonb) to authenticated;

commit;
