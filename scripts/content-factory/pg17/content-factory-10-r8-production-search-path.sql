-- CF10-R8/R9: reproduce the production search path exactly before running the CF10 migration.
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

-- CF10-R9: the three dependency hashing functions must be namespace-correct at this point, and
-- nothing digest-shaped may be reachable from `public` (exact production condition).
DO $$
DECLARE fn text; src text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='digest') THEN
    RAISE EXCEPTION 'R9_FIXTURE_INVALID: no public.digest function may exist';
  END IF;
  FOREACH fn IN ARRAY ARRAY['golden_lesson_stage_manifest','golden_lesson_stage_domain_bundle','golden_lesson_bind_authoritative_identity'] LOOP
    SELECT p.prosrc INTO src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=fn;
    IF src IS NULL THEN RAISE EXCEPTION 'R9_FUNCTION_MISSING: %', fn; END IF;
    IF src !~ 'extensions\.digest\(' THEN RAISE EXCEPTION 'R9_UNQUALIFIED_DIGEST: % is missing extensions.digest', fn; END IF;
    IF regexp_replace(src,'extensions\.digest\(','','g') ~ '\mdigest\s*\(' THEN
      RAISE EXCEPTION 'R9_STALE_UNQUALIFIED_DIGEST: %', fn;
    END IF;
  END LOOP;
END $$;
SELECT 'R9_PRODUCTION_SEARCH_PATH_READY' AS status;
