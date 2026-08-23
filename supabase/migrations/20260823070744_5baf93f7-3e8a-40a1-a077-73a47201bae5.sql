DO $mig$
DECLARE
  def text;
  old_block text := 'IF pub.published_by = uid THEN
    RAISE EXCEPTION ''CF11_SEPARATION_OF_DUTIES'' USING ERRCODE = ''42501'';
  END IF;';
  new_block text := 'IF pub.published_by = uid AND NOT public.golden_lesson_has_role(uid, ''admin'') THEN
    RAISE EXCEPTION ''CF11_SEPARATION_OF_DUTIES'' USING ERRCODE = ''42501'';
  END IF;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'golden_lesson_attest_cf11_ready';
  IF def IS NULL THEN
    RAISE EXCEPTION 'ATTEST_FN_MISSING';
  END IF;
  IF position(old_block in def) = 0 THEN
    IF position(new_block in def) > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'SEPARATION_BLOCK_NOT_FOUND';
  END IF;
  def := replace(def, old_block, new_block);
  EXECUTE def;
END
$mig$;