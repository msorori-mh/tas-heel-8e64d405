-- Align the temporary pre-launch purge RPCs with Supabase's pgcrypto schema.
-- Production installs pgcrypto in "extensions", while the original SECURITY
-- DEFINER search_path exposed only public and pg_temp. No curriculum rows are
-- changed by this forward migration.

DO $$
BEGIN
  IF to_regprocedure('extensions.digest(text,text)') IS NULL THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_PGCRYPTO_DIGEST_MISSING'
      USING ERRCODE = '42883';
  END IF;
END;
$$;

ALTER FUNCTION public.admin_curriculum_prelaunch_purge_status()
  SET search_path = public, extensions, pg_temp;

ALTER FUNCTION public.admin_curriculum_prelaunch_purge(text, text, text, text)
  SET search_path = public, extensions, pg_temp;

COMMENT ON FUNCTION public.admin_curriculum_prelaunch_purge_status() IS
  'Full-admin preview for the temporary pre-launch purge; pgcrypto resolves from the protected extensions schema.';

COMMENT ON FUNCTION public.admin_curriculum_prelaunch_purge(text, text, text, text) IS
  'Full-admin-only atomic purge for experimental curriculum data; requires exact preview hash, typed confirmation, reason, and idempotency key; pgcrypto resolves from extensions.';
