-- Cache request identity once per statement on core student-facing policies.
begin;

alter policy "Users can view own progress" on public.user_progress
  using ((select auth.uid()) = user_id);
alter policy "Users can insert own progress" on public.user_progress
  with check ((select auth.uid()) = user_id);
alter policy "Users can update own progress" on public.user_progress
  using ((select auth.uid()) = user_id);
alter policy "Users can view own notifications" on public.notifications
  using ((select auth.uid()) = user_id);
alter policy "Users can update own notifications" on public.notifications
  using ((select auth.uid()) = user_id);
alter policy "Admins can insert notifications" on public.notifications
  with check ((select public.has_role(auth.uid(), 'admin'::public.app_role)));
alter policy "Admins can view all profiles" on public.profiles
  using ((select public.has_role(auth.uid(), 'admin'::public.app_role)));

commit;
