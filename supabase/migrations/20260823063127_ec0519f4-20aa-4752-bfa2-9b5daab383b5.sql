DO $verify$
DECLARE
  cfg text[];
  is_definer boolean;
  can_anon boolean;
  can_auth boolean;
  can_service boolean;
BEGIN
  SELECT p.proconfig, p.prosecdef,
         has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE'),
         has_function_privilege('service_role', p.oid, 'EXECUTE')
    INTO cfg, is_definer, can_anon, can_auth, can_service
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='cf11_assert_interactive_contract'
    AND p.proargtypes='25 25'::oidvector;
  IF cfg IS NULL OR NOT ('search_path=public, pg_temp' = ANY(cfg)) THEN
    RAISE EXCEPTION 'CF11_INTERACTIVE_SEARCH_PATH_UNSAFE';
  END IF;
  IF is_definer OR can_anon OR can_auth OR NOT can_service THEN
    RAISE EXCEPTION 'CF11_INTERACTIVE_PRIVILEGE_REGRESSION';
  END IF;
END;
$verify$;