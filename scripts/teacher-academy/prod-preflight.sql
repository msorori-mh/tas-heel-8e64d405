\set ON_ERROR_STOP on

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'Teacher Academy preflight failed: %', p_message;
  end if;
end;
$$;

\if :{?academy_admin_email}
\else
  \echo 'academy_admin_email is required'
  \quit 3
\endif

do $$
begin
  if to_regclass('public.governorates') is null then
    raise exception 'PREFLIGHT_FAILED: public.governorates is missing';
  end if;

  if not exists (select 1 from public.governorates) then
    raise exception 'PREFLIGHT_FAILED: public.governorates is empty';
  end if;

  if exists (
    select 1
    from pg_class classes
    join pg_namespace namespaces on namespaces.oid = classes.relnamespace
    where namespaces.nspname = 'academy'
      and classes.relkind in ('r', 'p', 'v', 'm')
  ) then
    raise exception 'PREFLIGHT_FAILED: academy schema already contains relations; reconcile before apply';
  end if;
end;
$$;

select pg_temp.assert_true(
  (
    select count(*) = 1
    from auth.users
    where lower(email) = lower(:'academy_admin_email')
  ),
  'academy_admin_email must match exactly one existing auth.users account'
);

select current_database() as target_database, current_user as applying_user;
