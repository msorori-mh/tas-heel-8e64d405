DO $mig$
DECLARE
  src text; patched text; a text; r text; hits integer; tbl text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'golden_lesson_materialize_domain_batch';
  IF src IS NULL THEN
    RAISE EXCEPTION 'LCIP04_FUNCTION_MISSING' USING ERRCODE = 'P0002';
  END IF;
  patched := src;

  a := E'    IF entry.applicability = ''REQUIRED'' AND payload_text IS NULL THEN\n' ||
       E'      RAISE EXCEPTION ''CF10_EMPTY_PAYLOAD: %'', entry.capability USING ERRCODE = ''22023'';\n' ||
       E'    END IF;';
  r := E'    -- LCIP-04: an unauthored capability is absent from this batch, not an error.\n' ||
       E'    -- Every domain write below skips a NULL payload, so nothing empty is materialised.';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP04_ANCHOR_EMPTY_PAYLOAD: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  FOREACH tbl IN ARRAY ARRAY['lesson_book_contents','lesson_explanations','lesson_summaries'] LOOP
    a := E'  ELSIF existing_hash IS DISTINCT FROM new_hash THEN\n' ||
         E'    RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: ' || tbl || E''' USING ERRCODE = ''23514'';';
    r := E'  ELSIF payload_text IS NOT NULL AND existing_hash IS DISTINCT FROM new_hash THEN\n' ||
         E'    RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: ' || tbl || E''' USING ERRCODE = ''23514'';';
    hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
    IF hits <> 1 THEN
      RAISE EXCEPTION 'LCIP04_ANCHOR_CONFLICT % : % hits', tbl, hits USING ERRCODE = '22023';
    END IF;
    patched := replace(patched, a, r);
  END LOOP;

  a := E'  IF existing_hash IS NULL THEN\n    INSERT INTO public.lesson_book_contents(lesson_id, content)';
  r := E'  IF existing_hash IS NULL AND payload_text IS NOT NULL THEN\n    INSERT INTO public.lesson_book_contents(lesson_id, content)';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP04_ANCHOR_INSERT_BOOK: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  a := E'  IF existing_hash IS NULL THEN\n    INSERT INTO public.lesson_explanations(lesson_id, title, content, sort_order, explanation_code)';
  r := E'  IF existing_hash IS NULL AND payload_text IS NOT NULL THEN\n    INSERT INTO public.lesson_explanations(lesson_id, title, content, sort_order, explanation_code)';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP04_ANCHOR_INSERT_EXPL: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  a := E'  IF existing_hash IS NULL THEN\n    INSERT INTO public.lesson_summaries(lesson_id, summary)';
  r := E'  IF existing_hash IS NULL AND payload_text IS NOT NULL THEN\n    INSERT INTO public.lesson_summaries(lesson_id, summary)';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP04_ANCHOR_INSERT_SUMM: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  EXECUTE patched;

  RAISE NOTICE 'LCIP-04 applied: a batch carrying one component no longer fails on the empty six.';
END
$mig$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260902010000', 'cf10_allow_partial_batch')
ON CONFLICT (version) DO NOTHING;