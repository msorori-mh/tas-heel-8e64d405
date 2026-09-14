-- The advisor requires auth.uid() itself to be the init-plan expression.
begin;

alter policy "Admins can insert notifications" on public.notifications
  with check (public.has_role((select auth.uid()), 'admin'::public.app_role));
alter policy "Admins can view all profiles" on public.profiles
  using (public.has_role((select auth.uid()), 'admin'::public.app_role));

commit;
