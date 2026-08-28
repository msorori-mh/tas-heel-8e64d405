DO $mig$
DECLARE
  src text; patched text; a text; r text; hits integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'golden_lesson_materialize_domain_batch';
  IF src IS NULL THEN
    RAISE EXCEPTION 'LCIP05_FUNCTION_MISSING' USING ERRCODE = 'P0002';
  END IF;

  a := E'  IF companion IS NULL THEN\n' ||
       E'    RAISE EXCEPTION ''CF10_ANSWER_COMPANION_MISSING'' USING ERRCODE = ''22023'';\n' ||
       E'  END IF;';
  r := E'  -- LCIP-05: the answers companion exists only when question templates are part of\n' ||
       E'  -- this batch. Demanding it for a batch that carries no questions blocked every\n' ||
       E'  -- partial upload. It stays mandatory the moment questions are present.\n' ||
       E'  IF companion IS NULL\n' ||
       E'     AND ((payloads->''officialBookQuestions''->>''text'') IS NOT NULL\n' ||
       E'          OR (payloads->''selfTest''->>''text'') IS NOT NULL) THEN\n' ||
       E'    RAISE EXCEPTION ''CF10_ANSWER_COMPANION_MISSING'' USING ERRCODE = ''22023'';\n' ||
       E'  END IF;';

  hits := (length(src) - length(replace(src, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP05_ANCHOR_NOT_UNIQUE: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(src, a, r);

  EXECUTE patched;

  RAISE NOTICE 'LCIP-05 applied: a batch without question templates no longer demands an answers companion.';
END
$mig$;