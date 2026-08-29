REVOKE EXECUTE ON FUNCTION public.admin_curriculum_force_delete(text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_curriculum_force_delete(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_curriculum_force_delete(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_curriculum_force_delete(text, uuid, text) TO service_role;
ALTER FUNCTION public.admin_curriculum_force_delete(text, uuid, text) SET search_path = public;