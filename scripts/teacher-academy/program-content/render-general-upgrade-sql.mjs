import { readFile } from "node:fs/promises";

const bundlePath = new URL("./general-effective-teaching-v2.json", import.meta.url);
const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
const adminEmail = process.env.ACADEMY_ADMIN_EMAIL;

if (!adminEmail) {
  throw new Error("ACADEMY_ADMIN_EMAIL is required");
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
  v_program_id uuid;
begin
  select users.id into v_admin_id
  from auth.users users
  where lower(users.email) = lower(${sqlLiteral(adminEmail)});

  if v_admin_id is null or (
    select count(*) from auth.users users
    where lower(users.email) = lower(${sqlLiteral(adminEmail)})
  ) <> 1 then
    raise exception 'ACADEMY_GENERAL_V2_ADMIN_NOT_UNIQUE';
  end if;

  if not exists (
    select 1 from academy.capability_grants grants
    where grants.user_id = v_admin_id
      and grants.capability = 'ACADEMY_CATALOG_MANAGE'
      and grants.revoked_at is null
  ) then
    raise exception 'ACADEMY_GENERAL_V2_ADMIN_CAPABILITY_MISSING';
  end if;

  select versions.program_id into v_program_id
  from academy.program_versions versions
  join academy.programs programs on programs.id = versions.program_id
  where versions.id = ${sqlLiteral(bundle.sourceVersionId)}::uuid
    and versions.status = 'PUBLISHED'
    and programs.current_published_version_id = versions.id
  for update of programs;

  if v_program_id is null then
    raise exception 'ACADEMY_GENERAL_V2_SOURCE_IS_NOT_CURRENT';
  end if;

  if exists (
    select 1 from academy.program_versions versions
    where versions.program_id = v_program_id and versions.status = 'DRAFT'
  ) then
    raise exception 'ACADEMY_GENERAL_V2_CONFLICTING_DRAFT';
  end if;

  if (
    select count(*)
    from academy.courses courses
    join academy.modules modules on modules.course_id = courses.id
    join academy.lessons lessons on lessons.module_id = modules.id
    where courses.program_version_id = ${sqlLiteral(bundle.sourceVersionId)}::uuid
  ) <> ${bundle.lessonEnhancements.length} then
    raise exception 'ACADEMY_GENERAL_V2_SOURCE_LESSON_COUNT_CHANGED';
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
  v_draft_id uuid;
  v_item jsonb;
  v_lesson_id uuid;
  v_lesson_type text;
  v_existing_sections jsonb;
  v_content text;
  v_metadata jsonb := v_bundle->'metadata';
begin
  v_draft_id := academy.admin_create_draft_version((v_bundle->>'sourceVersionId')::uuid);

  perform academy.admin_update_draft_program_v2(
    v_draft_id,
    v_metadata->>'title',
    v_metadata->>'summary',
    v_metadata->>'detailedDescription',
    array(select jsonb_array_elements_text(v_metadata->'objectives')),
    array(select jsonb_array_elements_text(v_metadata->'prerequisites')),
    array(select jsonb_array_elements_text(v_metadata->'instructions')),
    v_metadata->>'audienceType',
    (v_metadata->>'estimatedMinutes')::integer,
    null
  );

  for v_item in select * from jsonb_array_elements(v_bundle->'lessonEnhancements') loop
    select lessons.lesson_id, lessons.lesson_type, lessons.sections
    into v_lesson_id, v_lesson_type, v_existing_sections
    from academy.admin_list_lessons(v_draft_id) lessons
    where lessons.title = v_item->>'sourceLessonTitle';

    if v_lesson_id is null then
      raise exception 'ACADEMY_GENERAL_V2_DRAFT_LESSON_NOT_FOUND: %', v_item->>'sourceLessonTitle';
    end if;

    select section->>'content' into v_content
    from jsonb_array_elements(v_existing_sections) section
    where section->>'section_type' = 'CONTENT';

    if coalesce(length(btrim(v_content)), 0) < 600 then
      raise exception 'ACADEMY_GENERAL_V2_SOURCE_CONTENT_TOO_SHORT: %', v_item->>'sourceLessonTitle';
    end if;

    perform academy.admin_save_structured_lesson(
      v_lesson_id,
      v_draft_id,
      v_item->>'sourceLessonTitle',
      v_lesson_type,
      null,
      (v_item->>'durationMinutes')::integer,
      jsonb_build_array(
        jsonb_build_object(
          'section_type', 'OBJECTIVE',
          'title', 'هدف الدرس',
          'content', v_item->>'objective'
        ),
        jsonb_build_object(
          'section_type', 'INTRODUCTION',
          'title', 'مدخل مهني',
          'content', v_item->>'introduction'
        ),
        jsonb_build_object(
          'section_type', 'CONTENT',
          'title', 'المادة العلمية',
          'content', v_content
        ),
        jsonb_build_object(
          'section_type', 'EXAMPLE',
          'title', 'مثال صفي',
          'content', v_item->>'example'
        ),
        jsonb_build_object(
          'section_type', 'ACTIVITY',
          'title', 'مهمة تطبيقية',
          'content', v_item->>'activity'
        ),
        jsonb_build_object(
          'section_type', 'SUMMARY',
          'title', 'الخلاصة العملية',
          'content', v_item->>'summary'
        )
      )
    );
  end loop;

  perform academy.admin_save_assessment(
    v_draft_id,
    'التقييم النهائي لبرنامج التدريس الفعّال',
    75
  );

  for v_item in select * from jsonb_array_elements(v_bundle->'assessmentAdditions') loop
    perform academy.admin_add_assessment_question(
      v_draft_id,
      v_item->>'questionText',
      v_item->'options'->>0,
      v_item->'options'->>1,
      v_item->'options'->>2,
      v_item->'options'->>3,
      v_item->>'correctOption'
    );
  end loop;

  perform set_config('academy.release_draft_id', v_draft_id::text, true);
end;
$academy_apply$;

reset role;

do $academy_validate$
declare
  v_draft_id uuid := current_setting('academy.release_draft_id')::uuid;
begin
  if exists (
    select 1 from academy.admin_validate_program(v_draft_id) checks where not checks.passed
  ) then
    raise exception 'ACADEMY_GENERAL_V2_SERVER_VALIDATION_FAILED';
  end if;

  if (
    select count(*)
    from academy.courses courses
    join academy.modules modules on modules.course_id = courses.id
    join academy.lessons lessons on lessons.module_id = modules.id
    where courses.program_version_id = v_draft_id
  ) <> ${bundle.lessonEnhancements.length} then
    raise exception 'ACADEMY_GENERAL_V2_DRAFT_LESSON_COUNT_INVALID';
  end if;

  if exists (
    select 1
    from academy.courses courses
    join academy.modules modules on modules.course_id = courses.id
    join academy.lessons lessons on lessons.module_id = modules.id
    where courses.program_version_id = v_draft_id
      and (
        select count(*) from academy.lesson_sections sections where sections.lesson_id = lessons.id
      ) <> 6
  ) then
    raise exception 'ACADEMY_GENERAL_V2_SECTION_COUNT_INVALID';
  end if;

  if (
    select count(questions.id)
    from academy.assessments assessments
    join academy.assessment_questions questions on questions.assessment_id = assessments.id
    where assessments.program_version_id = v_draft_id
  ) <> 15 then
    raise exception 'ACADEMY_GENERAL_V2_QUESTION_COUNT_INVALID';
  end if;

  if exists (
    select 1 from academy.live_sessions sessions where sessions.program_version_id = v_draft_id
  ) then
    raise exception 'ACADEMY_GENERAL_V2_UNCONFIRMED_SESSION_PRESENT';
  end if;
end;
$academy_validate$;

set local role authenticated;

do $academy_publish$
begin
  perform academy.admin_publish_program(current_setting('academy.release_draft_id')::uuid);
end;
$academy_publish$;

reset role;

do $academy_postverify$
declare
  v_published_id uuid := current_setting('academy.release_draft_id')::uuid;
begin
  if not exists (
    select 1
    from academy.program_versions versions
    join academy.programs programs on programs.id = versions.program_id
    where versions.id = v_published_id
      and versions.status = 'PUBLISHED'
      and versions.version_number = 2
      and versions.estimated_minutes = 180
      and programs.current_published_version_id = versions.id
  ) then
    raise exception 'ACADEMY_GENERAL_V2_POSTVERIFY_FAILED';
  end if;

  if exists (
    select 1 from academy.program_versions versions
    where versions.program_id = (
      select source.program_id from academy.program_versions source
      where source.id = ${sqlLiteral(bundle.sourceVersionId)}::uuid
    ) and versions.status = 'DRAFT'
  ) then
    raise exception 'ACADEMY_GENERAL_V2_DRAFT_REMAINS';
  end if;
end;
$academy_postverify$;

commit;

select
  versions.id as published_version_id,
  versions.version_number,
  versions.title,
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
join academy.program_versions source on source.program_id = programs.id
where source.id = ${sqlLiteral(bundle.sourceVersionId)}::uuid
  and programs.current_published_version_id = versions.id;
`);
