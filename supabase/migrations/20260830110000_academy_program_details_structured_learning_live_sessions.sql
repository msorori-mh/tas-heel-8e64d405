-- Teacher Academy program details, structured lessons, and provider-neutral live sessions.

begin;

create table academy.program_version_details (
  program_version_id uuid primary key references academy.program_versions(id) on delete cascade,
  detailed_description text not null check (length(btrim(detailed_description)) between 50 and 5000),
  objectives text[] not null check (cardinality(objectives) between 1 and 12),
  prerequisites text[] not null default array[]::text[] check (cardinality(prerequisites) between 0 and 12),
  instructions text[] not null check (cardinality(instructions) between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (array_position(objectives, '') is null),
  check (array_position(prerequisites, '') is null),
  check (array_position(instructions, '') is null)
);

create trigger academy_program_version_details_set_updated_at
before update on academy.program_version_details
for each row execute function academy.set_updated_at();

create table academy.lesson_sections (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references academy.lessons(id) on delete cascade,
  section_type text not null check (
    section_type in ('OBJECTIVE', 'INTRODUCTION', 'CONTENT', 'EXAMPLE', 'ACTIVITY', 'SUMMARY', 'RESOURCE')
  ),
  title text check (title is null or length(btrim(title)) between 2 and 180),
  content text not null check (length(btrim(content)) between 1 and 20000),
  resource_url text check (
    resource_url is null
    or (length(resource_url) <= 2000 and resource_url ~ '^https://')
  ),
  display_order integer not null check (display_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, display_order),
  check (section_type <> 'RESOURCE' or resource_url is not null)
);

create index academy_lesson_sections_lesson_idx
  on academy.lesson_sections (lesson_id, display_order);

create trigger academy_lesson_sections_set_updated_at
before update on academy.lesson_sections
for each row execute function academy.set_updated_at();

create table academy.live_sessions (
  id uuid primary key default gen_random_uuid(),
  program_version_id uuid not null references academy.program_versions(id) on delete cascade,
  title text not null check (length(btrim(title)) between 3 and 180),
  provider_label text not null check (length(btrim(provider_label)) between 2 and 80),
  speaker_name text check (speaker_name is null or length(btrim(speaker_name)) between 2 and 160),
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 15 and 480),
  meeting_url text not null check (length(meeting_url) <= 2000 and meeting_url ~ '^https://'),
  instructions text not null default '' check (length(instructions) <= 2000),
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED', 'CANCELLED')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index academy_live_sessions_program_idx
  on academy.live_sessions (program_version_id, starts_at);

create trigger academy_live_sessions_set_updated_at
before update on academy.live_sessions
for each row execute function academy.set_updated_at();

do $$
begin
  if exists (
    select 1
    from academy.program_version_subjects targets
    group by targets.program_version_id
    having count(*) > 1
  ) then
    raise exception 'EXISTING_PROGRAM_VERSION_HAS_MULTIPLE_SUBJECTS';
  end if;
end;
$$;

create unique index academy_program_version_one_subject_uq
  on academy.program_version_subjects (program_version_id);

create or replace function academy.enforce_single_subject_target()
returns trigger
language plpgsql
set search_path = pg_catalog, academy
as $$
begin
  if exists (
    select 1
    from academy.program_version_subjects targets
    where targets.program_version_id = new.program_version_id
      and (tg_op = 'INSERT' or targets.subject_id <> old.subject_id)
  ) then
    raise exception 'EXACTLY_ONE_SUBJECT_REQUIRED' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger academy_program_version_single_subject
before insert or update on academy.program_version_subjects
for each row execute function academy.enforce_single_subject_target();

insert into academy.program_version_details (
  program_version_id,
  detailed_description,
  objectives,
  prerequisites,
  instructions
)
select
  versions.id,
  case
    when versions.title = 'التدريس الفعّال في المرحلة الثانوية' then
      'برنامج مهني تطبيقي يساعد معلم المرحلة الثانوية على تحويل أهداف المنهج إلى تعلم قابل للقياس، وتصميم حصة مرنة، وتنشيط مشاركة الطلاب، وإدارة الصف والتقويم والتغذية الراجعة، مع توظيف مسؤول للأدوات الرقمية والذكاء الاصطناعي.'
    when versions.title = 'التهيئة المهنية لاستخدام منصة تمكين' then
      'برنامج تمهيدي يعرّف المعلم بمساره داخل أكاديمية تمكين، ويوضح طريقة الالتحاق بالبرامج، وإكمال الدروس والتقييم، ومتابعة التقدم، والحصول على الشهادة الرقمية والتحقق منها.'
    else versions.summary || E'\n\nيوفر البرنامج مسارًا تدريبيًا منظمًا يجمع المعرفة بالتطبيق والمراجعة.'
  end,
  case
    when versions.title = 'التدريس الفعّال في المرحلة الثانوية' then array[
      'صياغة نواتج تعلم واضحة وقابلة للقياس.',
      'تخطيط حصة مرنة تراعي الوقت والفروق الفردية.',
      'استخدام التعلم النشط والتقويم التكويني بفاعلية.',
      'اختيار أدوات رقمية وذكاء اصطناعي بصورة مسؤولة.'
    ]::text[]
    when versions.title = 'التهيئة المهنية لاستخدام منصة تمكين' then array[
      'التعرف إلى مكونات أكاديمية تمكين ومسار التدريب.',
      'إكمال الدروس والتقييم ومتابعة التقدم بصورة صحيحة.',
      'الحصول على الشهادة الرقمية والتحقق منها.'
    ]::text[]
    else array['تطبيق المفاهيم الرئيسة للبرنامج في الممارسة التعليمية.']::text[]
  end,
  case
    when versions.title = 'التدريس الفعّال في المرحلة الثانوية' then
      array['خبرة أساسية في التدريس أو التدريب الميداني.', 'جهاز متصل بالإنترنت لتطبيق الأنشطة.']::text[]
    else array['إكمال الملف المهني في أكاديمية تمكين.']::text[]
  end,
  array[
    'اقرأ أهداف كل درس قبل البدء ونفّذ النشاط التطبيقي المقترح.',
    'أكمل الدروس بالترتيب ثم اجتز التقييم النهائي للحصول على الشهادة.',
    'المحاضرات المباشرة اختيارية، وسيظهر رابطها وموعدها داخل البرنامج عند جدولتها.'
  ]::text[]
from academy.program_versions versions;

insert into academy.lesson_sections (
  lesson_id,
  section_type,
  title,
  content,
  resource_url,
  display_order
)
select lessons.id, 'OBJECTIVE', 'هدف الدرس',
       'بعد إكمال هذا الدرس سيتمكن المعلم من تطبيق موضوع «' || lessons.title || '» في ممارسته الصفية.',
       null, 0
from academy.lessons lessons
union all
select lessons.id, 'CONTENT', 'الشرح',
       coalesce(nullif(btrim(lessons.content), ''), 'اطّلع على المورد التدريبي المرفق، ثم دوّن أهم فكرة يمكن تطبيقها في الصف.'),
       null, 1
from academy.lessons lessons
union all
select lessons.id, 'EXAMPLE', 'مثال تطبيقي',
       'اختر موقفًا صفيًا واقعيًا مرتبطًا بموضوع «' || lessons.title || '»، ثم حدّد كيف ستطبّق الفكرة مع طلابك.',
       null, 2
from academy.lessons lessons
union all
select lessons.id, 'ACTIVITY', 'تطبيق قصير',
       'دوّن خطوة عملية واحدة ستجربها في حصتك القادمة، وحدد الدليل الذي ستستخدمه لمعرفة أثرها على تعلم الطلاب.',
       null, 3
from academy.lessons lessons
union all
select lessons.id, 'SUMMARY', 'خلاصة الدرس',
       'راجع الفكرة الرئيسة والمثال والتطبيق، ثم تأكد من قدرتك على شرحها وتوظيفها قبل تسجيل إكمال الدرس.',
       null, 4
from academy.lessons lessons;

create or replace function academy.require_draft_program_details()
returns trigger
language plpgsql
set search_path = pg_catalog, academy
as $$
declare
  v_program_version_id uuid;
begin
  v_program_version_id := case when tg_op = 'DELETE' then old.program_version_id else new.program_version_id end;
  if not exists (
    select 1 from academy.program_versions versions
    where versions.id = v_program_version_id and versions.status = 'DRAFT'
  ) then
    raise exception 'PUBLISHED_PROGRAM_DETAILS_ARE_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger academy_program_version_details_require_draft
before insert or update or delete on academy.program_version_details
for each row execute function academy.require_draft_program_details();

create or replace function academy.require_draft_lesson_section()
returns trigger
language plpgsql
set search_path = pg_catalog, academy
as $$
declare
  v_lesson_id uuid;
begin
  v_lesson_id := case when tg_op = 'DELETE' then old.lesson_id else new.lesson_id end;
  if not exists (
    select 1
    from academy.lessons lessons
    join academy.modules modules on modules.id = lessons.module_id
    join academy.courses courses on courses.id = modules.course_id
    join academy.program_versions versions on versions.id = courses.program_version_id
    where lessons.id = v_lesson_id and versions.status = 'DRAFT'
  ) then
    raise exception 'PUBLISHED_ACADEMY_CONTENT_IS_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger academy_lesson_sections_require_draft
before insert or update or delete on academy.lesson_sections
for each row execute function academy.require_draft_lesson_section();

create or replace function academy.protect_published_program_version()
returns trigger
language plpgsql
set search_path = pg_catalog, academy
as $$
begin
  if old.status = 'PUBLISHED' then
    raise exception 'PUBLISHED_PROGRAM_VERSION_IS_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  if new.status = 'PUBLISHED' then
    if new.audience_type = 'SUBJECT_SPECIFIC' and (
      select count(*) from academy.program_version_subjects targets
      where targets.program_version_id = new.id
    ) <> 1 then
      raise exception 'EXACTLY_ONE_SUBJECT_REQUIRED';
    end if;
    if new.audience_type = 'ALL_TEACHERS' and exists (
      select 1 from academy.program_version_subjects targets
      where targets.program_version_id = new.id
    ) then
      raise exception 'ALL_TEACHERS_VERSION_CANNOT_HAVE_SUBJECT_TARGETS';
    end if;
    if not exists (
      select 1 from academy.program_version_details details
      where details.program_version_id = new.id
        and cardinality(details.objectives) > 0
        and cardinality(details.instructions) > 0
    ) then
      raise exception 'PROGRAM_DETAILS_REQUIRED';
    end if;
    if not exists (
      select 1
      from academy.courses courses
      join academy.modules modules on modules.course_id = courses.id
      join academy.lessons lessons on lessons.module_id = modules.id
      where courses.program_version_id = new.id
    ) then
      raise exception 'PROGRAM_LESSON_REQUIRED';
    end if;
    if exists (
      select 1
      from academy.courses courses
      join academy.modules modules on modules.course_id = courses.id
      join academy.lessons lessons on lessons.module_id = modules.id
      where courses.program_version_id = new.id
        and not (
          exists (select 1 from academy.lesson_sections sections where sections.lesson_id = lessons.id and sections.section_type = 'OBJECTIVE')
          and exists (select 1 from academy.lesson_sections sections where sections.lesson_id = lessons.id and sections.section_type = 'CONTENT')
          and exists (select 1 from academy.lesson_sections sections where sections.lesson_id = lessons.id and sections.section_type = 'SUMMARY')
        )
    ) then
      raise exception 'STRUCTURED_LESSON_SECTIONS_REQUIRED';
    end if;
    if not exists (
      select 1
      from academy.assessments assessments
      join academy.assessment_questions questions on questions.assessment_id = assessments.id
      where assessments.program_version_id = new.id
    ) then
      raise exception 'PROGRAM_ASSESSMENT_QUESTION_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;

drop function academy.list_visible_programs();
create function academy.list_visible_programs()
returns table (
  program_id uuid,
  program_version_id uuid,
  slug text,
  title text,
  summary text,
  detailed_description text,
  objectives text[],
  prerequisites text[],
  instructions text[],
  subject_name text,
  estimated_minutes integer,
  lesson_count integer,
  pass_percentage integer,
  enrolled boolean
)
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select
    programs.id,
    versions.id,
    programs.slug,
    versions.title,
    versions.summary,
    details.detailed_description,
    details.objectives,
    details.prerequisites,
    details.instructions,
    case when versions.audience_type = 'ALL_TEACHERS' then null else subjects.name_ar end,
    versions.estimated_minutes,
    coalesce(content.lesson_count, 0),
    assessment.pass_percentage,
    exists (
      select 1 from academy.enrollments enrollments
      where enrollments.user_id = auth.uid()
        and enrollments.program_version_id = versions.id
        and enrollments.status <> 'CANCELLED'
    )
  from academy.teacher_profiles profiles
  join academy.programs programs
    on programs.archived_at is null and programs.current_published_version_id is not null
  join academy.program_versions versions
    on versions.id = programs.current_published_version_id and versions.status = 'PUBLISHED'
  join academy.program_version_details details on details.program_version_id = versions.id
  left join academy.program_version_subjects targets
    on targets.program_version_id = versions.id and targets.subject_id = profiles.primary_subject_id
  left join academy.subjects subjects on subjects.id = targets.subject_id
  left join lateral (
    select count(*)::integer as lesson_count
    from academy.courses courses
    join academy.modules modules on modules.course_id = courses.id
    join academy.lessons lessons on lessons.module_id = modules.id
    where courses.program_version_id = versions.id
  ) content on true
  left join academy.assessments assessment on assessment.program_version_id = versions.id
  where profiles.user_id = auth.uid()
    and profiles.status = 'ACTIVE'
    and (
      versions.audience_type = 'ALL_TEACHERS'
      or (versions.audience_type = 'SUBJECT_SPECIFIC' and targets.subject_id is not null)
    )
  order by versions.published_at desc, versions.title;
$$;

create or replace function academy.admin_create_program_v2(
  p_title text,
  p_summary text,
  p_detailed_description text,
  p_objectives text[],
  p_prerequisites text[],
  p_instructions text[],
  p_audience_type text,
  p_estimated_minutes integer,
  p_subject_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_program_id uuid;
  v_program_version_id uuid;
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  if length(btrim(p_title)) not between 3 and 180
     or length(btrim(p_summary)) not between 10 and 600
     or length(btrim(p_detailed_description)) not between 50 and 5000
     or cardinality(coalesce(p_objectives, array[]::text[])) not between 1 and 12
     or cardinality(coalesce(p_prerequisites, array[]::text[])) > 12
     or cardinality(coalesce(p_instructions, array[]::text[])) not between 1 and 12
     or exists (select 1 from unnest(coalesce(p_objectives, array[]::text[])) item where length(btrim(item)) not between 2 and 500)
     or exists (select 1 from unnest(coalesce(p_prerequisites, array[]::text[])) item where length(btrim(item)) not between 2 and 500)
     or exists (select 1 from unnest(coalesce(p_instructions, array[]::text[])) item where length(btrim(item)) not between 2 and 500)
     or p_estimated_minutes not between 1 and 100000
     or p_audience_type not in ('ALL_TEACHERS', 'SUBJECT_SPECIFIC')
     or (p_audience_type = 'ALL_TEACHERS' and p_subject_id is not null)
     or (p_audience_type = 'SUBJECT_SPECIFIC' and p_subject_id is null) then
    raise exception 'INVALID_PROGRAM_INPUT' using errcode = '22023';
  end if;
  if p_subject_id is not null and not exists (
    select 1 from academy.subjects subjects where subjects.id = p_subject_id and subjects.is_active
  ) then
    raise exception 'INVALID_OR_INACTIVE_SUBJECT_TARGET' using errcode = '22023';
  end if;

  insert into academy.programs (slug, created_by)
  values ('program-' || left(replace(gen_random_uuid()::text, '-', ''), 16), auth.uid())
  returning id into v_program_id;
  insert into academy.program_versions (
    program_id, version_number, title, summary, audience_type, estimated_minutes, created_by
  ) values (
    v_program_id, 1, btrim(p_title), btrim(p_summary), p_audience_type, p_estimated_minutes, auth.uid()
  ) returning id into v_program_version_id;
  insert into academy.program_version_details (
    program_version_id, detailed_description, objectives, prerequisites, instructions
  ) values (
    v_program_version_id,
    btrim(p_detailed_description),
    array(select btrim(item) from unnest(p_objectives) item),
    array(select btrim(item) from unnest(coalesce(p_prerequisites, array[]::text[])) item),
    array(select btrim(item) from unnest(p_instructions) item)
  );
  if p_subject_id is not null then
    insert into academy.program_version_subjects (program_version_id, subject_id)
    values (v_program_version_id, p_subject_id);
  end if;
  return v_program_version_id;
end;
$$;

create or replace function academy.admin_update_draft_program_v2(
  p_program_version_id uuid,
  p_title text,
  p_summary text,
  p_detailed_description text,
  p_objectives text[],
  p_prerequisites text[],
  p_instructions text[],
  p_audience_type text,
  p_estimated_minutes integer,
  p_subject_id uuid
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
  if not exists (
    select 1 from academy.program_versions versions
    where versions.id = p_program_version_id and versions.status = 'DRAFT'
  ) then
    raise exception 'DRAFT_PROGRAM_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if length(btrim(p_title)) not between 3 and 180
     or length(btrim(p_summary)) not between 10 and 600
     or length(btrim(p_detailed_description)) not between 50 and 5000
     or cardinality(coalesce(p_objectives, array[]::text[])) not between 1 and 12
     or cardinality(coalesce(p_prerequisites, array[]::text[])) > 12
     or cardinality(coalesce(p_instructions, array[]::text[])) not between 1 and 12
     or exists (select 1 from unnest(coalesce(p_objectives, array[]::text[])) item where length(btrim(item)) not between 2 and 500)
     or exists (select 1 from unnest(coalesce(p_prerequisites, array[]::text[])) item where length(btrim(item)) not between 2 and 500)
     or exists (select 1 from unnest(coalesce(p_instructions, array[]::text[])) item where length(btrim(item)) not between 2 and 500)
     or p_estimated_minutes not between 1 and 100000
     or p_audience_type not in ('ALL_TEACHERS', 'SUBJECT_SPECIFIC')
     or (p_audience_type = 'ALL_TEACHERS' and p_subject_id is not null)
     or (p_audience_type = 'SUBJECT_SPECIFIC' and p_subject_id is null) then
    raise exception 'INVALID_PROGRAM_INPUT' using errcode = '22023';
  end if;
  if p_subject_id is not null and not exists (
    select 1 from academy.subjects subjects where subjects.id = p_subject_id and subjects.is_active
  ) then
    raise exception 'INVALID_OR_INACTIVE_SUBJECT_TARGET' using errcode = '22023';
  end if;

  delete from academy.program_version_subjects where program_version_id = p_program_version_id;
  if p_subject_id is not null then
    insert into academy.program_version_subjects (program_version_id, subject_id)
    values (p_program_version_id, p_subject_id);
  end if;
  update academy.program_versions
  set title = btrim(p_title), summary = btrim(p_summary), audience_type = p_audience_type,
      estimated_minutes = p_estimated_minutes
  where id = p_program_version_id;
  insert into academy.program_version_details (
    program_version_id, detailed_description, objectives, prerequisites, instructions
  ) values (
    p_program_version_id,
    btrim(p_detailed_description),
    array(select btrim(item) from unnest(p_objectives) item),
    array(select btrim(item) from unnest(coalesce(p_prerequisites, array[]::text[])) item),
    array(select btrim(item) from unnest(p_instructions) item)
  ) on conflict (program_version_id) do update set
    detailed_description = excluded.detailed_description,
    objectives = excluded.objectives,
    prerequisites = excluded.prerequisites,
    instructions = excluded.instructions;
end;
$$;

drop function academy.admin_list_programs_v2();
create function academy.admin_list_programs_v2()
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
  question_count bigint
)
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select
    programs.id, versions.id, versions.version_number, versions.title, versions.summary,
    details.detailed_description, details.objectives, details.prerequisites, details.instructions,
    versions.audience_type,
    coalesce(targets.subject_ids, array[]::uuid[]), targets.subject_names,
    versions.estimated_minutes, versions.status, versions.published_at, programs.archived_at,
    programs.current_published_version_id = versions.id,
    coalesce(content.lesson_count, 0), coalesce(assessment.question_count, 0)
  from academy.programs programs
  join academy.program_versions versions on versions.program_id = programs.id
  left join academy.program_version_details details on details.program_version_id = versions.id
  left join lateral (
    select array_agg(subjects.id) as subject_ids, string_agg(subjects.name_ar, '، ') as subject_names
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
  v_new_lesson_id uuid;
  v_source_assessment academy.assessments%rowtype;
  v_new_assessment_id uuid;
  course_record record;
  module_record record;
  lesson_record record;
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  select versions.* into v_source
  from academy.program_versions versions
  join academy.programs programs on programs.id = versions.program_id
  where versions.id = p_source_version_id and programs.archived_at is null;
  if v_source.id is null then raise exception 'PROGRAM_VERSION_NOT_FOUND' using errcode = 'P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_source.program_id::text, 0));
  select versions.id into v_draft_id
  from academy.program_versions versions
  where versions.program_id = v_source.program_id and versions.status = 'DRAFT'
  order by versions.version_number desc limit 1;
  if v_draft_id is not null then return v_draft_id; end if;
  select coalesce(max(versions.version_number), 0) + 1 into v_next_version
  from academy.program_versions versions where versions.program_id = v_source.program_id;
  insert into academy.program_versions (
    program_id, version_number, title, summary, audience_type, estimated_minutes, created_by
  ) values (
    v_source.program_id, v_next_version, v_source.title, v_source.summary,
    v_source.audience_type, v_source.estimated_minutes, auth.uid()
  ) returning id into v_draft_id;
  insert into academy.program_version_details (
    program_version_id, detailed_description, objectives, prerequisites, instructions
  ) select v_draft_id, details.detailed_description, details.objectives, details.prerequisites, details.instructions
    from academy.program_version_details details where details.program_version_id = v_source.id;
  insert into academy.program_version_subjects (program_version_id, subject_id)
  select v_draft_id, targets.subject_id from academy.program_version_subjects targets
  where targets.program_version_id = v_source.id;

  for course_record in select * from academy.courses where program_version_id = v_source.id order by display_order loop
    insert into academy.courses (program_version_id, title, display_order)
    values (v_draft_id, course_record.title, course_record.display_order) returning id into v_new_course_id;
    for module_record in select * from academy.modules where course_id = course_record.id order by display_order loop
      insert into academy.modules (course_id, title, display_order)
      values (v_new_course_id, module_record.title, module_record.display_order) returning id into v_new_module_id;
      for lesson_record in select * from academy.lessons where module_id = module_record.id order by display_order loop
        insert into academy.lessons (
          module_id, title, lesson_type, content, resource_url, duration_minutes, display_order
        ) values (
          v_new_module_id, lesson_record.title, lesson_record.lesson_type, lesson_record.content,
          lesson_record.resource_url, lesson_record.duration_minutes, lesson_record.display_order
        ) returning id into v_new_lesson_id;
        insert into academy.lesson_sections (
          lesson_id, section_type, title, content, resource_url, display_order
        ) select v_new_lesson_id, sections.section_type, sections.title, sections.content,
                 sections.resource_url, sections.display_order
          from academy.lesson_sections sections where sections.lesson_id = lesson_record.id
          order by sections.display_order;
      end loop;
    end loop;
  end loop;

  select assessments.* into v_source_assessment
  from academy.assessments assessments where assessments.program_version_id = v_source.id;
  if v_source_assessment.id is not null then
    insert into academy.assessments (program_version_id, title, pass_percentage)
    values (v_draft_id, v_source_assessment.title, v_source_assessment.pass_percentage)
    returning id into v_new_assessment_id;
    insert into academy.assessment_questions (
      assessment_id, question_text, option_a, option_b, option_c, option_d, correct_option, display_order
    ) select v_new_assessment_id, questions.question_text, questions.option_a, questions.option_b,
             questions.option_c, questions.option_d, questions.correct_option, questions.display_order
      from academy.assessment_questions questions where questions.assessment_id = v_source_assessment.id
      order by questions.display_order;
  end if;
  return v_draft_id;
end;
$$;

drop function academy.admin_list_lessons(uuid);
create function academy.admin_list_lessons(p_program_version_id uuid)
returns table (
  lesson_id uuid,
  title text,
  lesson_type text,
  content text,
  resource_url text,
  duration_minutes integer,
  display_order integer,
  sections jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select lessons.id, lessons.title, lessons.lesson_type, lessons.content, lessons.resource_url,
         lessons.duration_minutes, lessons.display_order,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'section_id', sections.id,
             'section_type', sections.section_type,
             'title', sections.title,
             'content', sections.content,
             'resource_url', sections.resource_url,
             'display_order', sections.display_order
           ) order by sections.display_order)
           from academy.lesson_sections sections where sections.lesson_id = lessons.id
         ), '[]'::jsonb)
  from academy.courses courses
  join academy.modules modules on modules.course_id = courses.id
  join academy.lessons lessons on lessons.module_id = modules.id
  where academy.i_have_capability('ACADEMY_CATALOG_MANAGE')
    and courses.program_version_id = p_program_version_id
  order by courses.display_order, modules.display_order, lessons.display_order;
$$;

create or replace function academy.admin_save_structured_lesson(
  p_lesson_id uuid,
  p_program_version_id uuid,
  p_title text,
  p_lesson_type text,
  p_resource_url text,
  p_duration_minutes integer,
  p_sections jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_course_id uuid;
  v_module_id uuid;
  v_lesson_id uuid;
  v_next_order integer;
  v_content text;
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
  if length(btrim(p_title)) not between 2 and 180
     or p_lesson_type not in ('TEXT', 'VIDEO', 'LINK')
     or p_duration_minutes not between 1 and 1440
     or (p_lesson_type in ('VIDEO', 'LINK') and coalesce(p_resource_url, '') !~ '^https://')
     or jsonb_typeof(p_sections) <> 'array'
     or jsonb_array_length(p_sections) not between 3 and 20 then
    raise exception 'INVALID_STRUCTURED_LESSON_INPUT' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_sections) section
    where section->>'section_type' not in ('OBJECTIVE', 'INTRODUCTION', 'CONTENT', 'EXAMPLE', 'ACTIVITY', 'SUMMARY', 'RESOURCE')
       or length(btrim(coalesce(section->>'content', ''))) not between 1 and 20000
       or length(coalesce(section->>'title', '')) > 180
       or length(coalesce(section->>'resource_url', '')) > 2000
       or (coalesce(section->>'resource_url', '') <> '' and section->>'resource_url' !~ '^https://')
       or (section->>'section_type' = 'RESOURCE' and coalesce(section->>'resource_url', '') !~ '^https://')
  ) or not exists (select 1 from jsonb_array_elements(p_sections) section where section->>'section_type' = 'OBJECTIVE')
     or not exists (select 1 from jsonb_array_elements(p_sections) section where section->>'section_type' = 'CONTENT')
     or not exists (select 1 from jsonb_array_elements(p_sections) section where section->>'section_type' = 'SUMMARY') then
    raise exception 'STRUCTURED_LESSON_SECTIONS_REQUIRED' using errcode = '22023';
  end if;
  select string_agg(btrim(section->>'content'), E'\n\n' order by ordinality)
  into v_content from jsonb_array_elements(p_sections) with ordinality as items(section, ordinality);

  if p_lesson_id is null then
    select courses.id into v_course_id from academy.courses courses
    where courses.program_version_id = p_program_version_id order by courses.display_order limit 1;
    if v_course_id is null then
      insert into academy.courses (program_version_id, title, display_order)
      values (p_program_version_id, 'المحتوى التدريبي', 0) returning id into v_course_id;
    end if;
    select modules.id into v_module_id from academy.modules modules
    where modules.course_id = v_course_id order by modules.display_order limit 1;
    if v_module_id is null then
      insert into academy.modules (course_id, title, display_order)
      values (v_course_id, 'الوحدة الرئيسية', 0) returning id into v_module_id;
    end if;
    select coalesce(max(lessons.display_order), -1) + 1 into v_next_order
    from academy.lessons lessons where lessons.module_id = v_module_id;
    insert into academy.lessons (
      module_id, title, lesson_type, content, resource_url, duration_minutes, display_order
    ) values (
      v_module_id, btrim(p_title), p_lesson_type, v_content,
      nullif(btrim(coalesce(p_resource_url, '')), ''), p_duration_minutes, v_next_order
    ) returning id into v_lesson_id;
  else
    update academy.lessons lessons
    set title = btrim(p_title), lesson_type = p_lesson_type, content = v_content,
        resource_url = nullif(btrim(coalesce(p_resource_url, '')), ''),
        duration_minutes = p_duration_minutes
    from academy.modules modules, academy.courses courses
    where lessons.id = p_lesson_id and modules.id = lessons.module_id
      and courses.id = modules.course_id and courses.program_version_id = p_program_version_id
    returning lessons.id into v_lesson_id;
    if v_lesson_id is null then raise exception 'DRAFT_LESSON_NOT_FOUND' using errcode = 'P0002'; end if;
    delete from academy.lesson_sections sections where sections.lesson_id = v_lesson_id;
  end if;
  insert into academy.lesson_sections (
    lesson_id, section_type, title, content, resource_url, display_order
  ) select
    v_lesson_id,
    section->>'section_type',
    nullif(btrim(coalesce(section->>'title', '')), ''),
    btrim(section->>'content'),
    nullif(btrim(coalesce(section->>'resource_url', '')), ''),
    ordinality::integer - 1
  from jsonb_array_elements(p_sections) with ordinality as items(section, ordinality);
  return v_lesson_id;
end;
$$;

drop function academy.get_learning_lessons(uuid);
create function academy.get_learning_lessons(p_program_version_id uuid)
returns table (
  lesson_id uuid,
  title text,
  lesson_type text,
  content text,
  resource_url text,
  duration_minutes integer,
  completed boolean,
  sections jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select lessons.id, lessons.title, lessons.lesson_type, lessons.content, lessons.resource_url,
         lessons.duration_minutes, progress.id is not null,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'section_id', sections.id,
             'section_type', sections.section_type,
             'title', sections.title,
             'content', sections.content,
             'resource_url', sections.resource_url,
             'display_order', sections.display_order
           ) order by sections.display_order)
           from academy.lesson_sections sections where sections.lesson_id = lessons.id
         ), '[]'::jsonb)
  from academy.enrollments enrollments
  join academy.teacher_profiles profiles on profiles.user_id = enrollments.user_id and profiles.status = 'ACTIVE'
  join academy.courses courses on courses.program_version_id = enrollments.program_version_id
  join academy.modules modules on modules.course_id = courses.id
  join academy.lessons lessons on lessons.module_id = modules.id
  left join academy.lesson_progress progress
    on progress.enrollment_id = enrollments.id and progress.lesson_id = lessons.id
  where enrollments.user_id = auth.uid()
    and enrollments.program_version_id = p_program_version_id
    and enrollments.status <> 'CANCELLED'
  order by courses.display_order, modules.display_order, lessons.display_order;
$$;

drop function academy.list_my_learning();
create function academy.list_my_learning()
returns table (
  enrollment_id uuid,
  program_version_id uuid,
  title text,
  summary text,
  detailed_description text,
  objectives text[],
  prerequisites text[],
  instructions text[],
  status text,
  completed_lessons integer,
  total_lessons integer,
  pass_percentage integer
)
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select enrollments.id, versions.id, versions.title, versions.summary,
         details.detailed_description, details.objectives, details.prerequisites, details.instructions,
         enrollments.status, count(distinct progress.lesson_id)::integer,
         count(distinct lessons.id)::integer, assessments.pass_percentage
  from academy.enrollments enrollments
  join academy.program_versions versions on versions.id = enrollments.program_version_id
  join academy.program_version_details details on details.program_version_id = versions.id
  join academy.courses courses on courses.program_version_id = versions.id
  join academy.modules modules on modules.course_id = courses.id
  join academy.lessons lessons on lessons.module_id = modules.id
  left join academy.lesson_progress progress
    on progress.enrollment_id = enrollments.id and progress.lesson_id = lessons.id
  left join academy.assessments assessments on assessments.program_version_id = versions.id
  join academy.teacher_profiles profiles on profiles.user_id = enrollments.user_id and profiles.status = 'ACTIVE'
  where enrollments.user_id = auth.uid() and enrollments.status <> 'CANCELLED'
  group by enrollments.id, versions.id, details.program_version_id, assessments.pass_percentage
  order by enrollments.enrolled_at desc;
$$;

create or replace function academy.admin_list_live_sessions(p_program_version_id uuid)
returns table (
  live_session_id uuid,
  program_version_id uuid,
  title text,
  provider_label text,
  speaker_name text,
  starts_at timestamptz,
  duration_minutes integer,
  meeting_url text,
  instructions text,
  status text
)
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select sessions.id, sessions.program_version_id, sessions.title, sessions.provider_label,
         sessions.speaker_name, sessions.starts_at, sessions.duration_minutes,
         sessions.meeting_url, sessions.instructions, sessions.status
  from academy.live_sessions sessions
  where academy.i_have_capability('ACADEMY_CATALOG_MANAGE')
    and sessions.program_version_id = p_program_version_id
  order by sessions.starts_at, sessions.created_at;
$$;

create or replace function academy.admin_save_live_session(
  p_live_session_id uuid,
  p_program_version_id uuid,
  p_title text,
  p_provider_label text,
  p_speaker_name text,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_meeting_url text,
  p_instructions text,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_id uuid;
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from academy.program_versions versions
    join academy.programs programs on programs.id = versions.program_id
    where versions.id = p_program_version_id and programs.archived_at is null
  ) then
    raise exception 'PROGRAM_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if length(btrim(p_title)) not between 3 and 180
     or length(btrim(p_provider_label)) not between 2 and 80
     or (nullif(btrim(coalesce(p_speaker_name, '')), '') is not null and length(btrim(p_speaker_name)) not between 2 and 160)
     or p_starts_at is null
     or p_duration_minutes not between 15 and 480
     or coalesce(p_meeting_url, '') !~ '^https://'
     or length(coalesce(p_meeting_url, '')) > 2000
     or length(coalesce(p_instructions, '')) > 2000
     or p_status not in ('SCHEDULED', 'CANCELLED') then
    raise exception 'INVALID_LIVE_SESSION_INPUT' using errcode = '22023';
  end if;
  if p_live_session_id is null then
    insert into academy.live_sessions (
      program_version_id, title, provider_label, speaker_name, starts_at, duration_minutes,
      meeting_url, instructions, status, created_by
    ) values (
      p_program_version_id, btrim(p_title), btrim(p_provider_label),
      nullif(btrim(coalesce(p_speaker_name, '')), ''), p_starts_at, p_duration_minutes,
      btrim(p_meeting_url), btrim(coalesce(p_instructions, '')), p_status, auth.uid()
    ) returning id into v_id;
  else
    update academy.live_sessions sessions
    set title = btrim(p_title), provider_label = btrim(p_provider_label),
        speaker_name = nullif(btrim(coalesce(p_speaker_name, '')), ''), starts_at = p_starts_at,
        duration_minutes = p_duration_minutes, meeting_url = btrim(p_meeting_url),
        instructions = btrim(coalesce(p_instructions, '')), status = p_status
    where sessions.id = p_live_session_id and sessions.program_version_id = p_program_version_id
    returning sessions.id into v_id;
    if v_id is null then raise exception 'LIVE_SESSION_NOT_FOUND' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function academy.admin_delete_live_session(p_live_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, academy
as $$
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  delete from academy.live_sessions sessions where sessions.id = p_live_session_id;
  if not found then raise exception 'LIVE_SESSION_NOT_FOUND' using errcode = 'P0002'; end if;
end;
$$;

create or replace function academy.list_program_live_sessions(p_program_version_id uuid)
returns table (
  live_session_id uuid,
  title text,
  provider_label text,
  speaker_name text,
  starts_at timestamptz,
  duration_minutes integer,
  meeting_url text,
  instructions text,
  status text
)
language sql
stable
security definer
set search_path = pg_catalog, academy
as $$
  select sessions.id, sessions.title, sessions.provider_label, sessions.speaker_name,
         sessions.starts_at, sessions.duration_minutes, sessions.meeting_url,
         sessions.instructions, sessions.status
  from academy.live_sessions sessions
  join academy.teacher_profiles profiles on profiles.user_id = auth.uid() and profiles.status = 'ACTIVE'
  join academy.program_versions versions on versions.id = sessions.program_version_id
  where sessions.program_version_id = p_program_version_id
    and (
      exists (
        select 1 from academy.enrollments enrollments
        where enrollments.user_id = auth.uid()
          and enrollments.program_version_id = sessions.program_version_id
          and enrollments.status <> 'CANCELLED'
      )
      or exists (
        select 1 from academy.programs programs
        left join academy.program_version_subjects targets
          on targets.program_version_id = versions.id and targets.subject_id = profiles.primary_subject_id
        where programs.current_published_version_id = versions.id
          and programs.archived_at is null
          and (versions.audience_type = 'ALL_TEACHERS' or targets.subject_id is not null)
      )
    )
  order by sessions.starts_at, sessions.created_at;
$$;

drop function academy.admin_validate_program(uuid);
create function academy.admin_validate_program(p_program_version_id uuid)
returns table (check_key text, label text, passed boolean, details text)
language plpgsql
stable
security definer
set search_path = pg_catalog, academy
as $$
declare
  v_version academy.program_versions%rowtype;
  v_target_count bigint;
  v_lesson_count bigint;
  v_structured_count bigint;
  v_question_count bigint;
  v_details_ready boolean;
begin
  if not academy.i_have_capability('ACADEMY_CATALOG_MANAGE') then
    raise exception 'ACADEMY_CATALOG_MANAGE_REQUIRED' using errcode = '42501';
  end if;
  select versions.* into v_version from academy.program_versions versions where versions.id = p_program_version_id;
  if v_version.id is null then raise exception 'PROGRAM_VERSION_NOT_FOUND' using errcode = 'P0002'; end if;
  select count(*) into v_target_count from academy.program_version_subjects where program_version_id = p_program_version_id;
  select exists (
    select 1 from academy.program_version_details details
    where details.program_version_id = p_program_version_id
      and cardinality(details.objectives) > 0 and cardinality(details.instructions) > 0
  ) into v_details_ready;
  select count(*) into v_lesson_count
  from academy.courses courses join academy.modules modules on modules.course_id = courses.id
  join academy.lessons lessons on lessons.module_id = modules.id
  where courses.program_version_id = p_program_version_id;
  select count(*) into v_structured_count
  from academy.courses courses join academy.modules modules on modules.course_id = courses.id
  join academy.lessons lessons on lessons.module_id = modules.id
  where courses.program_version_id = p_program_version_id
    and exists (select 1 from academy.lesson_sections sections where sections.lesson_id = lessons.id and sections.section_type = 'OBJECTIVE')
    and exists (select 1 from academy.lesson_sections sections where sections.lesson_id = lessons.id and sections.section_type = 'CONTENT')
    and exists (select 1 from academy.lesson_sections sections where sections.lesson_id = lessons.id and sections.section_type = 'SUMMARY');
  select count(questions.id) into v_question_count
  from academy.assessments assessments left join academy.assessment_questions questions on questions.assessment_id = assessments.id
  where assessments.program_version_id = p_program_version_id;
  return query values
    ('DRAFT_VERSION', 'الإصدار ما زال مسودة', v_version.status = 'DRAFT',
      case when v_version.status = 'DRAFT' then 'جاهز للتحرير والنشر' else 'الإصدار منشور وغير قابل للتعديل' end),
    ('DETAILS', 'معلومات البرنامج مكتملة', v_details_ready,
      case when v_details_ready then 'الوصف والأهداف والتعليمات متاحة' else 'أكمل الوصف التفصيلي والأهداف والتعليمات' end),
    ('AUDIENCE', 'جمهور البرنامج محدد بصورة صحيحة',
      (v_version.audience_type = 'ALL_TEACHERS' and v_target_count = 0)
      or (v_version.audience_type = 'SUBJECT_SPECIFIC' and v_target_count = 1),
      case when v_version.audience_type = 'ALL_TEACHERS' then 'جميع المعلمين' else v_target_count::text || ' مادة مستهدفة' end),
    ('LESSONS', 'يحتوي البرنامج على درس واحد على الأقل', v_lesson_count > 0, v_lesson_count::text || ' درس'),
    ('STRUCTURE', 'الدروس مبنية بأقسام تعليمية', v_lesson_count > 0 and v_structured_count = v_lesson_count,
      v_structured_count::text || ' من ' || v_lesson_count::text || ' درس منظم'),
    ('ASSESSMENT', 'يحتوي التقييم على سؤال واحد على الأقل', v_question_count > 0, v_question_count::text || ' سؤال');
end;
$$;

alter table academy.program_version_details enable row level security;
alter table academy.lesson_sections enable row level security;
alter table academy.live_sessions enable row level security;

revoke all on academy.program_version_details, academy.lesson_sections, academy.live_sessions
  from public, anon, authenticated;

revoke all on function academy.enforce_single_subject_target() from public, anon, authenticated;
revoke all on function academy.require_draft_program_details() from public, anon, authenticated;
revoke all on function academy.require_draft_lesson_section() from public, anon, authenticated;
revoke all on function academy.list_visible_programs() from public, anon, authenticated;
revoke all on function academy.admin_create_program_v2(text, text, text, text[], text[], text[], text, integer, uuid) from public, anon, authenticated;
revoke all on function academy.admin_update_draft_program_v2(uuid, text, text, text, text[], text[], text[], text, integer, uuid) from public, anon, authenticated;
revoke all on function academy.admin_list_programs_v2() from public, anon, authenticated;
revoke all on function academy.admin_create_draft_version(uuid) from public, anon, authenticated;
revoke all on function academy.admin_list_lessons(uuid) from public, anon, authenticated;
revoke all on function academy.admin_save_structured_lesson(uuid, uuid, text, text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function academy.get_learning_lessons(uuid) from public, anon, authenticated;
revoke all on function academy.list_my_learning() from public, anon, authenticated;
revoke all on function academy.admin_list_live_sessions(uuid) from public, anon, authenticated;
revoke all on function academy.admin_save_live_session(uuid, uuid, text, text, text, timestamptz, integer, text, text, text) from public, anon, authenticated;
revoke all on function academy.admin_delete_live_session(uuid) from public, anon, authenticated;
revoke all on function academy.list_program_live_sessions(uuid) from public, anon, authenticated;
revoke all on function academy.admin_validate_program(uuid) from public, anon, authenticated;

grant execute on function academy.list_visible_programs() to authenticated;
grant execute on function academy.admin_create_program_v2(text, text, text, text[], text[], text[], text, integer, uuid) to authenticated;
grant execute on function academy.admin_update_draft_program_v2(uuid, text, text, text, text[], text[], text[], text, integer, uuid) to authenticated;
grant execute on function academy.admin_list_programs_v2() to authenticated;
grant execute on function academy.admin_create_draft_version(uuid) to authenticated;
grant execute on function academy.admin_list_lessons(uuid) to authenticated;
grant execute on function academy.admin_save_structured_lesson(uuid, uuid, text, text, text, integer, jsonb) to authenticated;
grant execute on function academy.get_learning_lessons(uuid) to authenticated;
grant execute on function academy.list_my_learning() to authenticated;
grant execute on function academy.admin_list_live_sessions(uuid) to authenticated;
grant execute on function academy.admin_save_live_session(uuid, uuid, text, text, text, timestamptz, integer, text, text, text) to authenticated;
grant execute on function academy.admin_delete_live_session(uuid) to authenticated;
grant execute on function academy.list_program_live_sessions(uuid) to authenticated;
grant execute on function academy.admin_validate_program(uuid) to authenticated;
grant execute on all functions in schema academy to service_role;

commit;
