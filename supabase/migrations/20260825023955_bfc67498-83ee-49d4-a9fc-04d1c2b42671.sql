DO $mig$
DECLARE
  src text;
  old_snip text;
  new_snip text;
  n integer;
  n_exp integer;
  n_self integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname = 'golden_lesson_materialize_domain_batch'
     AND p.oid::regprocedure::text = 'golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)';
  IF src IS NULL THEN
    RAISE EXCEPTION 'CF10_LIFECYCLE_FIX_FUNCTION_NOT_FOUND';
  END IF;

  old_snip := $old$    IF existing_status IS NOT NULL AND (
         existing_status IS DISTINCT FROM 'DRAFT'
      OR existing_applicability IS DISTINCT FROM expected_applicability
      OR existing_draft_hash IS DISTINCT FROM (payloads->cap->>'sha256')) THEN
      RAISE EXCEPTION 'CF10_LIFECYCLE_CONFLICT: %', lifecycle_cap USING ERRCODE = '23514';
    END IF;$old$;

  new_snip := $new$    IF existing_status IS NOT NULL AND (
         existing_status IS DISTINCT FROM 'DRAFT'
      OR existing_applicability IS DISTINCT FROM expected_applicability) THEN
      RAISE EXCEPTION 'CF10_LIFECYCLE_CONFLICT: %', lifecycle_cap USING ERRCODE = '23514';
    END IF;
    -- A newer verified package version may refresh a still-DRAFT, unpublished capability.
    -- Only draft_hash / draft_updated_at change; REVIEW / READY rows and every
    -- ready / review / evidence / applicability field remain untouched.
    IF existing_status = 'DRAFT'
       AND existing_draft_hash IS DISTINCT FROM (payloads->cap->>'sha256') THEN
      UPDATE public.lesson_capability_lifecycle
         SET draft_hash = payloads->cap->>'sha256',
             draft_updated_at = now()
       WHERE lesson_id = lesson_row.id
         AND capability = lifecycle_cap
         AND status = 'DRAFT'
         AND applicability = expected_applicability::public.capability_applicability;
      GET DIAGNOSTICS rc = ROW_COUNT;
      IF rc <> 1 THEN
        RAISE EXCEPTION 'CF10_LIFECYCLE_DRAFT_REFRESH_FAILED: %', lifecycle_cap USING ERRCODE = '23514';
      END IF;
      lifecycle_written := lifecycle_written + rc;
      domain_writes := domain_writes + rc;
    END IF;$new$;

  IF position('CF10_LIFECYCLE_DRAFT_REFRESH_FAILED' in src) > 0 THEN
    RAISE EXCEPTION 'CF10_LIFECYCLE_FIX_ALREADY_APPLIED';
  END IF;

  n := (length(src) - length(replace(src, old_snip, ''))) / length(old_snip);
  IF n <> 1 THEN
    RAISE EXCEPTION 'CF10_LIFECYCLE_FIX_UNEXPECTED_OCCURRENCES: %', n;
  END IF;

  n_exp := (length(src) - length(replace(src, $e$public.normalize_content_code(external_lesson_code || '-EXP')$e$, ''))) / length($e$public.normalize_content_code(external_lesson_code || '-EXP')$e$);
  n_self := (length(src) - length(replace(src, $s$public.normalize_content_code(external_lesson_code || '-SELFTEST')$s$, ''))) / length($s$public.normalize_content_code(external_lesson_code || '-SELFTEST')$s$);
  IF n_exp <> 3 THEN
    RAISE EXCEPTION 'CF10_LIFECYCLE_FIX_EXP_PRECONDITION: %', n_exp;
  END IF;
  IF n_self <> 4 THEN
    RAISE EXCEPTION 'CF10_LIFECYCLE_FIX_SELFTEST_PRECONDITION: %', n_self;
  END IF;

  EXECUTE replace(src, old_snip, new_snip);

  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname = 'golden_lesson_materialize_domain_batch'
     AND p.oid::regprocedure::text = 'golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)';

  IF (length(src) - length(replace(src, old_snip, ''))) / length(old_snip) <> 0 THEN
    RAISE EXCEPTION 'CF10_LIFECYCLE_FIX_POSTVERIFY_OLD_REMAINS';
  END IF;
  IF position('CF10_LIFECYCLE_DRAFT_REFRESH_FAILED' in src) = 0 THEN
    RAISE EXCEPTION 'CF10_LIFECYCLE_FIX_POSTVERIFY_NEW_MISSING';
  END IF;
  IF (length(src) - length(replace(src, $e$public.normalize_content_code(external_lesson_code || '-EXP')$e$, ''))) / length($e$public.normalize_content_code(external_lesson_code || '-EXP')$e$) <> 3 THEN
    RAISE EXCEPTION 'CF10_LIFECYCLE_FIX_POSTVERIFY_EXP_LOST';
  END IF;
  IF (length(src) - length(replace(src, $s$public.normalize_content_code(external_lesson_code || '-SELFTEST')$s$, ''))) / length($s$public.normalize_content_code(external_lesson_code || '-SELFTEST')$s$) <> 4 THEN
    RAISE EXCEPTION 'CF10_LIFECYCLE_FIX_POSTVERIFY_SELFTEST_LOST';
  END IF;
END
$mig$;