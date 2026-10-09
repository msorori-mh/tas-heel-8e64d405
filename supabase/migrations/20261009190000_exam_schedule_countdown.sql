-- New schedule only. No changes to existing curriculum, assessments or policies.
create table public.exam_schedule (
  id uuid primary key default gen_random_uuid(),
  curriculum_track_id uuid not null references public.curriculum_tracks(id) on delete restrict,
  grade_id uuid references public.grades(id) on delete cascade,
  semester smallint check (semester in (1, 2)),
  exam_kind text not null check (exam_kind in ('ministerial','semester_final','midterm')),
  title text not null check (char_length(title) between 3 and 80),
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  is_published boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index exam_schedule_lookup_idx on public.exam_schedule (curriculum_track_id, grade_id, starts_on) where is_published;
alter table public.exam_schedule enable row level security;
create policy "Published exam dates readable by signed-in users" on public.exam_schedule
  for select to authenticated using (is_published or public.has_role(auth.uid(), 'admin'::app_role));
create policy "Admins manage exam dates" on public.exam_schedule
  for all to authenticated using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));
grant select, insert, update, delete on public.exam_schedule to authenticated;
create trigger exam_schedule_updated_at before update on public.exam_schedule
  for each row execute function public.update_updated_at_column();
