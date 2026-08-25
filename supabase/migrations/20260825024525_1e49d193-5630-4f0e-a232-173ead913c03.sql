DO $mig$
DECLARE
  src text;
  new_src text;
  old_off constant text :=
    E'    FROM public.questions WHERE lesson_id = lesson_row.id AND code LIKE ext_code || ''-OFFQ-%'';';
  old_self constant text :=
    E'    FROM public.questions WHERE lesson_id = lesson_row.id AND code LIKE ext_code || ''-SELF-%'';';
  new_off constant text :=
    E'    FROM public.questions WHERE lesson_id = lesson_row.id AND code = ANY (expected_official_codes);';
  new_self constant text :=
    E'    FROM public.questions WHERE lesson_id = lesson_row.id AND code = ANY (expected_self_codes);';
  n_off int;
  n_self int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'golden_lesson_publish_cf11';
  IF src IS NULL THEN
    RAISE EXCEPTION 'CF11_SCOPING_MIGRATION_FUNCTION_MISSING';
  END IF;

  n_off := (length(src) - length(replace(src, old_off, ''))) / length(old_off);
  n_self := (length(src) - length(replace(src, old_self, ''))) / length(old_self);
  IF n_off <> 1 OR n_self <> 1 THEN
    RAISE EXCEPTION 'CF11_SCOPING_MIGRATION_UNEXPECTED_OCCURRENCES: official=% self=%', n_off, n_self;
  END IF;
  IF position(new_off in src) > 0 OR position(new_self in src) > 0 THEN
    RAISE EXCEPTION 'CF11_SCOPING_MIGRATION_ALREADY_APPLIED';
  END IF;

  new_src := replace(replace(src, old_off, new_off), old_self, new_self);

  IF position(new_off in new_src) = 0 OR position(new_self in new_src) = 0 THEN
    RAISE EXCEPTION 'CF11_SCOPING_MIGRATION_REPLACEMENT_FAILED';
  END IF;
  IF position(old_off in new_src) > 0 OR position(old_self in new_src) > 0 THEN
    RAISE EXCEPTION 'CF11_SCOPING_MIGRATION_RESIDUAL_PREFIX_SELECT';
  END IF;
  IF position('CF11_SELFTEST_QUESTION_SET_MISMATCH' in new_src) = 0
     OR position('CF11_OFFICIAL_QUESTION_SET_MISMATCH' in new_src) = 0
     OR position('qq.code = ANY (self_codes)' in new_src) = 0
     OR position('qq.code = ANY (official_codes)' in new_src) = 0
     OR position('question_codes := official_codes || self_codes;' in new_src) = 0 THEN
    RAISE EXCEPTION 'CF11_SCOPING_MIGRATION_INVARIANT_LOST';
  END IF;

  EXECUTE new_src;
END
$mig$;