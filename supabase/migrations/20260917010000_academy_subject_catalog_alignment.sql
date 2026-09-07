-- Keep the Teacher Academy subject selector aligned with the canonical
-- Grade 12 subject groups used by the student curriculum.

begin;

do $$
begin
  if exists (
    select 1
    from academy.subjects subjects
    where subjects.is_active
      and subjects.code in ('SOCIAL_STUDIES', 'COMPUTER')
      and (
        exists (
          select 1
          from academy.teacher_profiles profiles
          where profiles.primary_subject_id = subjects.id
        )
        or exists (
          select 1
          from academy.program_version_subjects targets
          where targets.subject_id = subjects.id
        )
      )
  ) then
    raise exception 'ACADEMY_SUBJECT_DEACTIVATION_HAS_DEPENDENCIES'
      using errcode = '23503';
  end if;
end;
$$;

insert into academy.subjects (code, name_ar, is_active, display_order)
values ('QURAN', 'القرآن الكريم وعلومه', true, 10)
on conflict (code) do update
set name_ar = excluded.name_ar,
    is_active = excluded.is_active,
    display_order = excluded.display_order;

update academy.subjects
set name_ar = case code
      when 'ISLAMIC' then 'التربية الإسلامية'
      when 'ARABIC' then 'اللغة العربية'
      when 'ENGLISH' then 'اللغة الإنجليزية'
      when 'MATHEMATICS' then 'الرياضيات'
      when 'PHYSICS' then 'الفيزياء'
      when 'CHEMISTRY' then 'الكيمياء'
      when 'BIOLOGY' then 'الأحياء'
    end,
    is_active = true,
    display_order = case code
      when 'ISLAMIC' then 20
      when 'ARABIC' then 30
      when 'ENGLISH' then 40
      when 'MATHEMATICS' then 50
      when 'PHYSICS' then 60
      when 'CHEMISTRY' then 70
      when 'BIOLOGY' then 80
    end
where code in (
  'ISLAMIC', 'ARABIC', 'ENGLISH', 'MATHEMATICS',
  'PHYSICS', 'CHEMISTRY', 'BIOLOGY'
);

update academy.subjects
set is_active = false
where code in ('SOCIAL_STUDIES', 'COMPUTER');

do $$
declare
  actual_catalog jsonb;
  expected_catalog constant jsonb := '[
    {"code":"QURAN","name_ar":"القرآن الكريم وعلومه","display_order":10},
    {"code":"ISLAMIC","name_ar":"التربية الإسلامية","display_order":20},
    {"code":"ARABIC","name_ar":"اللغة العربية","display_order":30},
    {"code":"ENGLISH","name_ar":"اللغة الإنجليزية","display_order":40},
    {"code":"MATHEMATICS","name_ar":"الرياضيات","display_order":50},
    {"code":"PHYSICS","name_ar":"الفيزياء","display_order":60},
    {"code":"CHEMISTRY","name_ar":"الكيمياء","display_order":70},
    {"code":"BIOLOGY","name_ar":"الأحياء","display_order":80}
  ]'::jsonb;
begin
  select jsonb_agg(
    jsonb_build_object(
      'code', subjects.code,
      'name_ar', subjects.name_ar,
      'display_order', subjects.display_order
    )
    order by subjects.display_order
  )
  into actual_catalog
  from academy.subjects subjects
  where subjects.is_active;

  if actual_catalog is distinct from expected_catalog then
    raise exception 'ACADEMY_SUBJECT_CATALOG_POSTCONDITION_FAILED: %', actual_catalog;
  end if;
end;
$$;

commit;
