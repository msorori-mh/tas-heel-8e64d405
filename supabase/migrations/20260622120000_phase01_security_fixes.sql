-- PHASE-01-FIX (partial): C-03 get_user_email, C-04 dashboard_stats
-- Scope: runtime-confirmed only. C-01/C-02 deferred.

-- ============ C-03: Restrict get_user_email to service_role only ============
REVOKE ALL ON FUNCTION public.get_user_email(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_email(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_email(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_email(uuid) TO service_role;

-- ============ C-04: Revoke direct SELECT on dashboard_stats materialized view ============
REVOKE SELECT ON extensions.dashboard_stats FROM anon;
REVOKE SELECT ON extensions.dashboard_stats FROM authenticated;
REVOKE SELECT ON extensions.dashboard_stats FROM PUBLIC;
