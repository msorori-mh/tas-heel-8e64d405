-- QURAN_PRIMARY_PDF_MAPPING_AND_ARABIC_FIDELITY_RECOVERY_18C1
-- Data correction only. No schema change, no policy change, no template rerun.
--
-- Scope (hard-bounded): lessons of the subject whose name matches 'القرآن'
-- that currently have exactly one `pdf` resource and a title-only (placeholder)
-- `lesson_book_contents` row.
--
-- Effects:
--   1. mark that single PDF as the lesson primary resource (is_primary = true)
--   2. delete the title-only 04 row (it is import metadata, not book content)
--   3. delivery_mode follows automatically via trigger sync_lesson_delivery_mode
--
-- NOT APPLIED to the shared database. Requires:
--   QURAN_PRIMARY_PDF_MAPPING_18C1_SHARED_APPLY = AUTHORIZED

begin;

create temporary table _q18c1 on commit drop as
select l.id as lesson_id, r.id as resource_id
from public.lessons l
join public.subjects s on s.id = l.subject_id
join public.lesson_resources r
  on r.lesson_id = l.id and r.resource_type = 'pdf'
where s.name like '%القرآن%'
  and (
    select count(*) from public.lesson_resources r2
    where r2.lesson_id = l.id and r2.resource_type = 'pdf'
  ) = 1;

-- Guard: refuse to run if the scope is not the audited 21 lessons.
do $$
declare n int;
begin
  select count(*) into n from _q18c1;
  if n <> 21 then
    raise exception '18C1 scope mismatch: expected 21 lessons, found %', n;
  end if;
end $$;

-- 1) primary flag (partial unique index guarantees one primary per lesson)
update public.lesson_resources r
set is_primary = true
from _q18c1 q
where r.id = q.resource_id
  and coalesce(r.is_primary, false) = false;

-- 2) drop title-only placeholder book content
delete from public.lesson_book_contents bc
using _q18c1 q, public.lessons l
where bc.lesson_id = q.lesson_id
  and l.id = q.lesson_id
  and btrim(regexp_replace(coalesce(bc.content, ''), '\s+', ' ', 'g'))
      in ('', btrim(regexp_replace(l.title, '\s+', ' ', 'g')));

commit;
