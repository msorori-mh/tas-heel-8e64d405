DO $mig$
DECLARE
  src text; patched text; a text; r text; hits integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'assert_golden_lesson_manifest';
  IF src IS NULL THEN
    RAISE EXCEPTION 'LCIP09_FUNCTION_MISSING' USING ERRCODE = 'P0002';
  END IF;
  IF position('LCIP-09' in src) > 0 THEN
    RAISE EXCEPTION 'LCIP09_ALREADY_APPLIED' USING ERRCODE = '23505';
  END IF;
  a := E'    expected_applicability := CASE\n' ||
       E'      WHEN capability = ''labExperimentHtml'' THEN ''OPTIONAL''\n' ||
       E'      ELSE ''REQUIRED'' END;';
  r := E'    -- LCIP-09: no capability is mandatory. Each of the seven is published on its\n' ||
       E'    -- own, so requiring one would mean a component owes another -- exactly what\n' ||
       E'    -- independent publishing removed. NA is still distinct and still refused a\n' ||
       E'    -- payload by CF10: not applicable at all, rather than not uploaded yet.\n' ||
       E'    expected_applicability := ''OPTIONAL'';';
  hits := (length(src) - length(replace(src, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP09_ANCHOR_APPLICABILITY: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(src, a, r);
  EXECUTE patched;
  RAISE NOTICE 'LCIP-09 applied: the manifest no longer declares any capability mandatory.';
END
$mig$;

DO $backfill$
DECLARE
  moved integer;
  remaining integer;
BEGIN
  UPDATE public.lesson_capability_lifecycle
     SET applicability = 'OPTIONAL'::public.capability_applicability,
         updated_at = now()
   WHERE applicability = 'REQUIRED'::public.capability_applicability
     AND capability IN ('officialBookContent','tamkeenExplanation','quickReview','mindMap',
                        'simulation','checkUnderstanding','lessonAssessment');
  GET DIAGNOSTICS moved = ROW_COUNT;
  SELECT count(*) INTO remaining
    FROM public.lesson_capability_lifecycle
   WHERE applicability = 'REQUIRED'::public.capability_applicability;
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'LCIP09_BACKFILL_INCOMPLETE: % rows still REQUIRED', remaining
      USING ERRCODE = '23514';
  END IF;
  RAISE NOTICE 'LCIP-09 backfill: % lifecycle rows are no longer mandatory.', moved;
END
$backfill$;

DO $proof$
DECLARE d text; cf10 text; still_required integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'assert_golden_lesson_manifest';
  SELECT pg_get_functiondef(p.oid) INTO cf10
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'golden_lesson_materialize_domain_batch'
     AND p.oid::regprocedure::text =
       'golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)';
  IF position(E'expected_applicability := ''OPTIONAL'';' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP09_PROOF_NOT_APPLIED';
  END IF;
  IF position(E'ELSE ''REQUIRED'' END' in d) > 0 THEN
    RAISE EXCEPTION 'LCIP09_PROOF_REQUIRED_STILL_EXPECTED';
  END IF;
  IF position('APPLICABILITY_MISMATCH' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP09_PROOF_MISMATCH_GUARD_DELETED';
  END IF;
  IF position('ARTIFACT_SET_INVALID' in d) = 0
     OR position('PACKAGE_HAS_NO_CONTENT' in d) = 0
     OR position('AUTHORITY_MISMATCH' in d) = 0
     OR position('CAPABILITY_UNKNOWN' in d) = 0
     OR position('NA_ARTIFACT_HAS_CONTENT' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP09_PROOF_NEIGHBOURING_GUARD_LOST';
  END IF;
  IF cf10 IS NULL
     OR position('NA capability % carries a payload' in cf10) = 0 THEN
    RAISE EXCEPTION 'LCIP09_PROOF_NA_GUARD_LOST';
  END IF;
  SELECT count(*) INTO still_required
    FROM public.lesson_capability_lifecycle
   WHERE applicability = 'REQUIRED'::public.capability_applicability;
  IF still_required <> 0 THEN
    RAISE EXCEPTION 'LCIP09_PROOF_ROWS_STILL_MANDATORY: %', still_required;
  END IF;
  RAISE NOTICE 'LCIP-09 proof passed.';
END
$proof$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260906010000', 'no_lesson_component_is_mandatory')
ON CONFLICT (version) DO NOTHING;