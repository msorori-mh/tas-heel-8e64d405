DO $$
DECLARE
  src text;
  fixed text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'cf11_assert_replay_state';
  IF src IS NULL THEN
    RAISE EXCEPTION 'CF11_FIX_GUARD: cf11_assert_replay_state not found';
  END IF;
  IF position('r.resource_code = v_code' in src) = 0 THEN
    IF position('lower(r.resource_code) = lower(v_code)' in src) > 0 THEN
      RETURN; -- already patched
    END IF;
    RAISE EXCEPTION 'CF11_FIX_GUARD: expected resource_code comparison not found';
  END IF;
  fixed := replace(src, 'r.resource_code = v_code', 'lower(r.resource_code) = lower(v_code)');
  EXECUTE fixed;
END $$;