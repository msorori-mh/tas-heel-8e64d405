import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const inputPath = process.argv[2];
const adminEmail = process.env.ACADEMY_ADMIN_EMAIL;

if (!inputPath) {
  throw new Error("program bundle path is required");
}
if (!adminEmail) {
  throw new Error("ACADEMY_ADMIN_EMAIL is required");
}

const bundleUrl = pathToFileURL(resolve(inputPath));
const bundle = JSON.parse(await readFile(bundleUrl, "utf8"));
if (bundle.bundleType !== "NEW_SUBJECT_PROGRAM") {
  throw new Error("bundleType must be NEW_SUBJECT_PROGRAM");
}

const bundleJson = JSON.stringify(bundle);
if (bundleJson.includes("$academy_bundle$")) {
  throw new Error("bundle contains the SQL dollar-quote delimiter");
}

const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;

process.stdout.write(`
begin;

do $academy_preflight$
declare
  v_admin_id uuid;
  v_subject_id uuid;
begin
  select users.id into v_admin_id
  from auth.users users
  where lower(users.email) = lower(${sqlLiteral(adminEmail)});

  if v_admin_id is null or (
    select count(*) from auth.users users
    where lower(users.email) = lower(${sqlLiteral(adminEmail)})
  ) <> 1 then
    raise exception 'ACADEMY_SUBJECT_PROGRAM_ADMIN_NOT_UNIQUE';
  end if;

  if not exists (
    select 1 from academy.capability_grants grants
    where grants.user_id = v_admin_id
      and grants.capability = 'ACADEMY_CATALOG_MANAGE'
      and grants.revoked_at is null
  ) then
    raise exception 'ACADEMY_SUBJECT_PROGRAM_ADMIN_CAPABILITY_MISSING';
  end if;

  select subjects.id into v_subject_id
  from academy.subjects subjects
  where subjects.code = ${sqlLiteral(bundle.metadata.subjectCode)}
    and subjects.is_active
  for share;

  if v_subject_id is null then
    raise exception 'ACADEMY_SUBJECT_PROGRAM_SUBJECT_NOT_ACTIVE';
  end if;

  if exists (
    select 1
    from academy.program_versions versions
    join academy.programs programs on programs.id = versions.program_id
    where programs.current_published_version_id = versions.id
      and programs.archived_at is null
      and lower(versions.title) = lower(${sqlLiteral(bundle.metadata.title)})
  ) then
    raise exception 'ACADEMY_SUBJECT_PROGRAM_ALREADY_EXISTS';
  end if;
end;
$academy_preflight$;

select set_config(
  'request.jwt.claim.sub',
  (select users.id::text from auth.users users where lower(users.email) = lower(${sqlLiteral(adminEmail)})),
  true
);

set local role authenticated;

do $academy_apply$
declare
  v_bundle jsonb := $academy_bundle$${bundleJson}$academy_bundle$::jsonb;
  v_metadata jsonb := v_bundle->'metadata';
  v_subject_id uuid;
  v_program_version_id uuid;
  v_lesson jsonb;
  v_sections jsonb;
  v_question jsonb;
begin
  select subjects.id into v_subject_id
  from academy.subjects subjects
  where subjects.code = v_metadata->>'subjectCode'
    and subjects.is_active;

  v_program_version_id := academy.admin_create_program_v2(
    v_metadata->>'title',
    v_metadata->>'summary',
    v_metadata->>'detailedDescription',
    array(select jsonb_array_elements_text(v_metadata->'objectives')),
    array(select jsonb_array_elements_text(v_metadata->'prerequisites')),
    array(select jsonb_array_elements_text(v_metadata->'instructions')),
    v_metadata->>'audienceType',
    (v_metadata->>'estimatedMinutes')::integer,
    v_subject_id
  );

  for v_lesson in select * from jsonb_array_elements(v_bundle->'lessons') loop
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
    v_bundle->'assessment'->>'title',
    (v_bundle->'assessment'->>'passPercentage')::integer
  );

  for v_question in select * from jsonb_array_elements(v_bundle->'assessment'->'questions') loop
    perform academy.admin_add_assessment_question(
      v_program_version_id,
      v_question->>'questionText',
      v_question->'options'->>0,
      v_question->'options'->>1,
      v_question->'options'->>2,
      v_question->'options'->>3,
      v_question->>'correctOption'
    );
  end loop;

  perform set_config('academy.release_program_version_id', v_program_version_id::text, true);
end;
$academy_apply$;

reset role;

do $academy_validate$
declare
  v_bundle jsonb := $academy_bundle$${bundleJson}$academy_bundle$::jsonb;
  v_version_id uuid := current_setting('academy.release_program_version_id')::uuid;
begin
  if exists (
    select 1 from academy.admin_validate_program(v_version_id) checks where not checks.passed
  ) then
    raise exception 'ACADEMY_SUBJECT_PROGRAM_SERVER_VALIDATION_FAILED';
  end if;

  if not exists (
    select 1
    from academy.program_versions versions
    where versions.id = v_version_id
      and versions.status = 'DRAFT'
      and versions.version_number = 1
      and versions.audience_type = 'SUBJECT_SPECIFIC'
      and versions.estimated_minutes = (v_bundle->'metadata'->>'estimatedMinutes')::integer
  ) then
    raise exception 'ACADEMY_SUBJECT_PROGRAM_METADATA_INVALID';
  end if;

  if (
    select count(*)
    from academy.program_version_subjects targets
    join academy.subjects subjects on subjects.id = targets.subject_id
    where targets.program_version_id = v_version_id
      and subjects.code = v_bundle->'metadata'->>'subjectCode'
      and subjects.is_active
  ) <> 1 then
    raise exception 'ACADEMY_SUBJECT_PROGRAM_TARGET_INVALID';
  end if;

  if (
    select count(*)
    from academy.courses courses
    join academy.modules modules on modules.course_id = courses.id
    join academy.lessons lessons on lessons.module_id = modules.id
    where courses.program_version_id = v_version_id
  ) <> jsonb_array_length(v_bundle->'lessons') then
    raise exception 'ACADEMY_SUBJECT_PROGRAM_LESSON_COUNT_INVALID';
  end if;

  if (
    select coalesce(sum(lessons.duration_minutes), 0)
    from academy.courses courses
    join academy.modules modules on modules.course_id = courses.id
    join academy.lessons lessons on lessons.module_id = modules.id
    where courses.program_version_id = v_version_id
  ) <> (v_bundle->'metadata'->>'estimatedMinutes')::integer then
    raise exception 'ACADEMY_SUBJECT_PROGRAM_DURATION_INVALID';
  end if;

  if exists (
    select 1
    from academy.courses courses
    join academy.modules modules on modules.course_id = courses.id
    join academy.lessons lessons on lessons.module_id = modules.id
    where courses.program_version_id = v_version_id
      and (select count(*) from academy.lesson_sections sections where sections.lesson_id = lessons.id) <> 6
  ) then
    raise exception 'ACADEMY_SUBJECT_PROGRAM_SECTIONS_INVALID';
  end if;

  if (
    select count(questions.id)
    from academy.assessments assessments
    join academy.assessment_questions questions on questions.assessment_id = assessments.id
    where assessments.program_version_id = v_version_id
  ) <> jsonb_array_length(v_bundle->'assessment'->'questions') then
    raise exception 'ACADEMY_SUBJECT_PROGRAM_QUESTIONS_INVALID';
  end if;

  if exists (
    select 1 from academy.live_sessions sessions where sessions.program_version_id = v_version_id
  ) then
    raise exception 'ACADEMY_SUBJECT_PROGRAM_UNCONFIRMED_SESSION_PRESENT';
  end if;
end;
$academy_validate$;

set local role authenticated;

do $academy_publish$
begin
  perform academy.admin_publish_program(current_setting('academy.release_program_version_id')::uuid);
end;
$academy_publish$;

reset role;

do $academy_postverify$
declare
  v_version_id uuid := current_setting('academy.release_program_version_id')::uuid;
begin
  if not exists (
    select 1
    from academy.program_versions versions
    join academy.programs programs on programs.id = versions.program_id
    where versions.id = v_version_id
      and versions.status = 'PUBLISHED'
      and programs.current_published_version_id = versions.id
      and programs.archived_at is null
  ) then
    raise exception 'ACADEMY_SUBJECT_PROGRAM_POSTVERIFY_FAILED';
  end if;

  if exists (
    select 1 from academy.program_versions versions
    where versions.program_id = (
      select current_version.program_id from academy.program_versions current_version
      where current_version.id = v_version_id
    ) and versions.status = 'DRAFT'
  ) then
    raise exception 'ACADEMY_SUBJECT_PROGRAM_DRAFT_REMAINS';
  end if;
end;
$academy_postverify$;

commit;

select
  versions.program_id,
  versions.id as published_version_id,
  versions.title,
  subjects.code as subject_code,
  subjects.name_ar as subject_name,
  versions.estimated_minutes,
  versions.status,
  (select count(*)::integer from academy.courses courses
    join academy.modules modules on modules.course_id = courses.id
    join academy.lessons lessons on lessons.module_id = modules.id
    where courses.program_version_id = versions.id) as lessons,
  (select count(*)::integer from academy.lesson_sections sections
    join academy.lessons lessons on lessons.id = sections.lesson_id
    join academy.modules modules on modules.id = lessons.module_id
    join academy.courses courses on courses.id = modules.course_id
    where courses.program_version_id = versions.id) as sections,
  (select count(*)::integer from academy.assessments assessments
    join academy.assessment_questions questions on questions.assessment_id = assessments.id
    where assessments.program_version_id = versions.id) as questions,
  (select count(*)::integer from academy.live_sessions sessions
    where sessions.program_version_id = versions.id) as live_sessions
from academy.program_versions versions
join academy.programs programs on programs.id = versions.program_id
join academy.program_version_subjects targets on targets.program_version_id = versions.id
join academy.subjects subjects on subjects.id = targets.subject_id
where programs.current_published_version_id = versions.id
  and programs.archived_at is null
  and lower(versions.title) = lower(${sqlLiteral(bundle.metadata.title)})
  and subjects.code = ${sqlLiteral(bundle.metadata.subjectCode)};
`);
