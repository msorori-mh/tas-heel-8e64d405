-- STAGE 8: split teacher/admin portals and enforce a Google identity for teacher profile writes.
begin;

create or replace function academy.i_have_google_identity()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, auth
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from auth.identities identities
      where identities.user_id = auth.uid()
        and identities.provider = 'google'
    );
$$;

revoke all on function academy.i_have_google_identity() from public, anon, authenticated;
grant execute on function academy.i_have_google_identity() to authenticated, service_role;

drop policy if exists academy_teacher_profiles_insert_self on academy.teacher_profiles;
create policy academy_teacher_profiles_insert_self
on academy.teacher_profiles
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'ACTIVE'
  and academy.i_have_google_identity()
);

drop policy if exists academy_teacher_profiles_update_self on academy.teacher_profiles;
create policy academy_teacher_profiles_update_self
on academy.teacher_profiles
for update
to authenticated
using (
  user_id = auth.uid()
  and academy.i_have_google_identity()
)
with check (
  user_id = auth.uid()
  and academy.i_have_google_identity()
);

commit;
