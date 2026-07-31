DROP POLICY IF EXISTS "Units viewable by everyone" ON public.units;

CREATE POLICY "Units viewable per subject access" ON public.units
  FOR SELECT TO authenticated
  USING (public.can_access_subject(subject_id));