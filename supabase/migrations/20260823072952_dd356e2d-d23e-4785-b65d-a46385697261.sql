CREATE OR REPLACE FUNCTION public.cf11_html_resource_code(_external_lesson_code text, _capability text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT public.normalize_resource_code(
    btrim(coalesce(_external_lesson_code,'')) ||
    CASE _capability WHEN 'mindMap' THEN '-MINDMAP'
                     WHEN 'simulation' THEN '-EXPERIMENT'
                     ELSE NULL END
  );
$$;

CREATE OR REPLACE FUNCTION public.cf11_assert_html_replay_state(_plan jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lesson uuid := (_plan->>'lessonId')::uuid;
  v_publication_id uuid := nullif(_plan->>'publicationId','')::uuid;
  cap text;
  v_code text;
  v_expected_type text;
  v_expected_hash text;
  v_live_hash text;
  v_count integer;
BEGIN
  IF v_lesson IS NULL OR v_publication_id IS NULL THEN
    RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: html.plan' USING ERRCODE = '23505';
  END IF;

  FOREACH cap IN ARRAY ARRAY['mindMap','simulation'] LOOP
    v_code := public.normalize_resource_code(_plan->'html'->cap->>'resourceCode');
    v_expected_type := CASE cap WHEN 'mindMap' THEN 'mindmap' ELSE 'experiment' END;
    v_expected_hash := _plan->'html'->cap->>'sha256';

    SELECT count(*), min(public.cf11_text_sha256(r.description))
      INTO v_count, v_live_hash
      FROM public.lesson_resources r
     WHERE r.lesson_id = v_lesson
       AND r.resource_code = v_code
       AND r.url = public.cf10_inline_html_url(v_code)
       AND coalesce(r.html_resource_type, r.resource_type::text) = v_expected_type
       AND r.metadata->>'cf11_publication_id' = v_publication_id::text
       AND r.metadata->>'cf11_body_sha256' = public.cf11_text_sha256(r.description)
       AND r.metadata->>'cf11_body_sha256' = v_expected_hash;

    IF v_count <> 1 OR v_live_hash IS DISTINCT FROM v_expected_hash
       OR public.cf10_html_publication_pending(v_lesson, cap) THEN
      RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: html.%', cap USING ERRCODE = '23505';
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  src text;
  fixed text;
  old_block text := $old$  -- 2) published HTML artefacts, body-hash exact and still delivered inline
  FOREACH cap IN ARRAY ARRAY['mindMap','simulation'] LOOP
    v_code := _plan->'html'->cap->>'resourceCode';
    v_expected := _plan->'html'->cap->>'sha256';
    SELECT public.cf11_text_sha256(r.description) INTO v_live
      FROM public.lesson_resources r
     WHERE r.lesson_id = v_lesson AND lower(r.resource_code) = lower(v_code)
       AND r.url = public.cf10_inline_html_url(r.resource_code);
    IF v_live IS DISTINCT FROM v_expected
       OR public.cf10_html_publication_pending(v_lesson, cap) THEN
      RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: html.%', cap USING ERRCODE = '23505';
    END IF;
  END LOOP;
  verified := verified || to_jsonb('html'::text);$old$;
  new_block text := $new$  -- 2) published HTML artefacts, using the canonical persisted identity.
  PERFORM public.cf11_assert_html_replay_state(_plan);
  verified := verified || to_jsonb('html'::text);$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'cf11_assert_replay_state'
     AND pg_get_function_identity_arguments(p.oid) = '_plan jsonb';

  IF src IS NULL THEN
    RAISE EXCEPTION 'CF11_HTML_IDENTITY_FIX_GUARD: cf11_assert_replay_state not found';
  END IF;

  IF position('PERFORM public.cf11_assert_html_replay_state(_plan);' in src) > 0 THEN
    RETURN;
  END IF;

  IF position(old_block in src) = 0 THEN
    RAISE EXCEPTION 'CF11_HTML_IDENTITY_FIX_GUARD: expected replay block not found';
  END IF;

  fixed := replace(src, old_block, new_block);
  EXECUTE fixed;
END $$;

REVOKE ALL ON FUNCTION public.cf11_html_resource_code(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf11_html_resource_code(text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cf11_assert_html_replay_state(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf11_assert_html_replay_state(jsonb) TO authenticated, service_role;