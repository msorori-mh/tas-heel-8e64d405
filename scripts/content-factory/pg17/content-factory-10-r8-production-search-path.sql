-- CF10-R8: reproduce the production search path exactly before running the CF10 migration.
-- Production hosts pgcrypto in `extensions`; nothing named digest is reachable from `public`.
DROP FUNCTION IF EXISTS public.digest(bytea, text);
DO $$ BEGIN
  IF to_regprocedure('public.digest(bytea,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'R8_FIXTURE_INVALID: public.digest must not exist before CF10';
  END IF;
  IF to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'R8_FIXTURE_INVALID: extensions.digest must exist before CF10';
  END IF;
END $$;
SELECT 'R8_PRODUCTION_SEARCH_PATH_READY' AS status;
