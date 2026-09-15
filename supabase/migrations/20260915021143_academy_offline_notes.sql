-- Additive, account-owned notes. No existing content, progress or certification rule changes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create table academy.offline_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  lesson_id uuid not null references academy.lessons(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);
create index offline_notes_owner_created_idx on academy.offline_notes(user_id, created_at desc);
create index offline_notes_lesson_idx on academy.offline_notes(lesson_id);
alter table academy.offline_notes enable row level security;
revoke all on academy.offline_notes from public, anon, authenticated;
grant select, insert on academy.offline_notes to authenticated;
create policy offline_notes_owner_read on academy.offline_notes for select to authenticated
using (user_id = (select auth.uid()) and exists (
  select 1 from academy.teacher_profiles p where p.user_id = (select auth.uid()) and p.status = 'ACTIVE'
));
create policy offline_notes_enrolled_insert on academy.offline_notes for insert to authenticated
with check (user_id = (select auth.uid()) and exists (
  select 1 from academy.enrollments e join academy.teacher_profiles p on p.user_id = e.user_id
  where e.user_id = (select auth.uid()) and p.status = 'ACTIVE'
    and e.status in ('ACTIVE', 'COMPLETED')
    and e.program_version_id = academy.program_version_for_lesson(lesson_id)
));
create function academy.save_offline_note(p_operation_id uuid, p_lesson_id uuid, p_body text)
returns uuid language plpgsql security invoker set search_path = pg_catalog, academy as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  insert into academy.offline_notes(user_id, operation_id, lesson_id, body)
  values (auth.uid(), p_operation_id, p_lesson_id, p_body)
  on conflict (user_id, operation_id) do nothing;
  if not exists (select 1 from academy.offline_notes n
    where n.user_id = auth.uid() and n.operation_id = p_operation_id
      and n.lesson_id = p_lesson_id and n.body = p_body) then
    raise exception 'NOTE_OPERATION_CONFLICT' using errcode = '23505';
  end if;
  return p_operation_id;
end;
$$;
revoke all on function academy.save_offline_note(uuid,uuid,text) from public, anon;
grant execute on function academy.save_offline_note(uuid,uuid,text) to authenticated;
commit;
