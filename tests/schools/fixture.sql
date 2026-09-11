-- TEST_ONLY: isolated Postgres fixture. Never run against a connected project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema academy;
create schema school_test;
grant usage on schema public,auth,academy,school_test to authenticated,anon;
create table auth.users(id uuid primary key);
create table auth.identities(user_id uuid references auth.users(id), provider text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create type public.app_role as enum ('admin','content_manager','moderator','student');
create table public.user_roles(user_id uuid references auth.users(id), role public.app_role);
create function public.has_role(_user_id uuid, _role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create function academy.i_have_google_identity() returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from auth.identities where user_id=auth.uid() and provider='google');
$$;
create table public.governorates(id uuid primary key, name text not null, sort_order integer default 0);
create table public.grades(id uuid primary key, name text not null, sort_order integer default 0);
create table public.profiles(
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id), full_name text, phone text,
 school_name text, governorate text, governorate_id uuid references public.governorates(id), grade_id text,
 grade_uuid uuid references public.grades(id), curriculum_track_id uuid, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table academy.subjects(id uuid primary key, is_active boolean not null default true);
create table academy.teacher_profiles(
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id),
 full_name text not null check(length(btrim(full_name)) between 3 and 160),
 primary_subject_id uuid not null references academy.subjects(id), governorate_id uuid not null references public.governorates(id),
 school_name text not null check(length(btrim(school_name)) between 2 and 180),
 phone text not null check(length(btrim(phone)) between 7 and 20 and btrim(phone) ~ '^\+?[0-9][0-9 ()-]{5,18}[0-9]$'),
 status text not null default 'ACTIVE' check(status in ('ACTIVE','SUSPENDED')), created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy own_read on public.profiles for select to authenticated using(user_id=auth.uid());
create policy own_insert on public.profiles for insert to authenticated with check(user_id=auth.uid());
create policy own_update on public.profiles for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select,insert,update on public.profiles to authenticated;
grant select on public.governorates,public.grades to authenticated;
alter table academy.teacher_profiles enable row level security;
create policy own_read on academy.teacher_profiles for select to authenticated using(user_id=auth.uid());
create policy own_insert on academy.teacher_profiles for insert to authenticated with check(user_id=auth.uid() and academy.i_have_google_identity());
create policy own_update on academy.teacher_profiles for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and academy.i_have_google_identity());
grant select(user_id,full_name,primary_subject_id,governorate_id,school_name,phone,status),
 insert(user_id,full_name,primary_subject_id,governorate_id,school_name,phone),
 update(full_name,primary_subject_id,governorate_id,school_name,phone) on academy.teacher_profiles to authenticated;

create table school_test.checks(name text primary key);
grant select,insert on school_test.checks to authenticated,anon;
create function school_test.assert(p_ok boolean,p_name text) returns void language plpgsql security invoker as $$
begin if p_ok is distinct from true then raise exception 'ASSERT FAILED: %',p_name; end if; insert into school_test.checks values(p_name); end;
$$;
create function school_test.denied(p_sql text,p_code text,p_name text) returns void language plpgsql security invoker as $$
begin
 begin execute p_sql; exception when others then
  if sqlstate <> p_code then raise exception 'Expected %, got % for %: %',p_code,sqlstate,p_name,sqlerrm; end if;
  insert into school_test.checks values(p_name); return;
 end;
 raise exception 'Expected rejection: %',p_name;
end;
$$;
create function school_test.actor(p_number integer) returns void language sql as $$
 select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-'||lpad(p_number::text,12,'0'),false)::text::void;
$$;

insert into auth.users select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,12) n;
insert into auth.identities select id,'google' from auth.users where id <> '00000000-0000-0000-0000-000000000006';
insert into public.user_roles values('00000000-0000-0000-0000-000000000001','admin'),('00000000-0000-0000-0000-000000000002','content_manager');
insert into public.governorates values('10000000-0000-0000-0000-000000000001','محافظة أولى',1),('10000000-0000-0000-0000-000000000002','محافظة ثانية',2);
insert into public.grades values('20000000-0000-0000-0000-000000000001','الثالث الثانوي',1);
insert into academy.subjects values('30000000-0000-0000-0000-000000000001',true);
insert into public.profiles(user_id,full_name,school_name,governorate_id,grade_id,grade_uuid,phone)
 select id,'TEST_ONLY طالب '||id,'مدرسة النور','10000000-0000-0000-0000-000000000001',
 '20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','777000000'
 from auth.users where id in ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000008');
insert into academy.teacher_profiles(user_id,full_name,primary_subject_id,governorate_id,school_name,phone)
 values('00000000-0000-0000-0000-000000000005','TEST_ONLY معلم','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','مدرسة النور','777000001');
