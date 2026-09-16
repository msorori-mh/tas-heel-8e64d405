-- Production-only rollback for the exact CAP-03 change on zbdhxyuulyovihjgeqbn.
-- Restores its observed prior expressions. Do NOT use on staging, whose prior
-- policies already used UID initplans. Does not delete student data.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
DROP INDEX IF EXISTS public.capacity_answers_session_question_id_idx;
ALTER POLICY "Users can view own progress" ON public.user_progress USING (auth.uid()=user_id);
ALTER POLICY "Users can insert own progress" ON public.user_progress WITH CHECK (auth.uid()=user_id);
ALTER POLICY "Users can update own progress" ON public.user_progress USING (auth.uid()=user_id);
ALTER POLICY "Admins can view all profiles" ON public.profiles
  USING (public.has_role(auth.uid(),'admin'::public.app_role));
COMMIT;
