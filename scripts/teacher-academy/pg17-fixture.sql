\set ON_ERROR_STOP on

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  email text not null unique
);

create table auth.identities (
  provider_id text not null,
  user_id uuid not null references auth.users(id),
  provider text not null,
  primary key (provider, provider_id)
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table public.governorates (
  id uuid primary key,
  name text not null,
  sort_order integer not null default 0
);

insert into public.governorates (id, name, sort_order)
values ('00000000-0000-0000-0000-000000000100', 'صنعاء', 10);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000001', 'academy-admin@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'math-teacher@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'english-teacher@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'email-only-teacher@example.test');

insert into auth.identities (provider_id, user_id, provider)
values
  ('academy-admin@example.test', '00000000-0000-0000-0000-000000000001', 'email'),
  ('math-google', '00000000-0000-0000-0000-000000000002', 'google'),
  ('english-google', '00000000-0000-0000-0000-000000000003', 'google'),
  ('email-only-teacher@example.test', '00000000-0000-0000-0000-000000000004', 'email');
