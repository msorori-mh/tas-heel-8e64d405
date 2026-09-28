CREATE OR REPLACE FUNCTION public.is_replaced_lab_resource(_resource_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$ SELECT EXISTS(SELECT 1 FROM public.lesson_lab_corrections WHERE old_resource_id=_resource_id) $fn$;
REVOKE ALL ON FUNCTION public.is_replaced_lab_resource(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_replaced_lab_resource(uuid) TO authenticated;
CREATE POLICY "Hide replaced labs from student reads" ON public.lesson_resources AS RESTRICTIVE FOR SELECT TO authenticated USING (public.is_content_staff(auth.uid()) OR NOT public.is_replaced_lab_resource(id));
-- The preexisting restrictive gate used an RLS-filtered subquery and was insufficient alone; this second gate is security-definer backed.