CREATE OR REPLACE FUNCTION public.cf10_html_publication_pending(_lesson_id uuid, _capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT NOT EXISTS (
    SELECT 1
      FROM public.lesson_resources r
      JOIN public.golden_lesson_publications p
        ON p.id = (r.metadata->>'cf11_publication_id')::uuid
       AND p.lesson_id = r.lesson_id
     WHERE r.lesson_id = _lesson_id
       AND r.resource_code = public.cf11_html_resource_code(
             p.result->>'externalLessonCode', _capability)
       AND coalesce(r.html_resource_type, r.resource_type::text)
             = CASE _capability WHEN 'mindMap' THEN 'mindmap'
                                WHEN 'simulation' THEN 'experiment' END
       AND r.url = public.cf10_inline_html_url(public.cf11_html_resource_code(
             p.result->>'externalLessonCode', _capability))
       AND r.metadata->>'cf11_body_sha256' = public.cf11_text_sha256(r.description)
       AND r.metadata->>'cf11_body_sha256' =
             (p.result->'html'->(CASE _capability WHEN 'mindMap' THEN 'mindMap'
                                                  ELSE 'simulation' END)->>'sha256')
  );
$$;

DO $$
DECLARE
  src text;
  fixed text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname='golden_lesson_publish_cf11'
     AND pg_get_function_identity_arguments(p.oid) = '_batch_id uuid, _actor_id uuid, _mode text, _assets jsonb, _expected_plan_sha256 text, _idempotency_key text';

  IF src IS NULL THEN
    RAISE EXCEPTION 'CF11_CANONICAL_PLAN_FIX_GUARD: publisher not found';
  END IF;

  src := replace(src,
    '''mindMap'', jsonb_build_object(''resourceCode'', ext_code || ''-MINDMAP'',',
    '''mindMap'', jsonb_build_object(''resourceCode'', public.cf11_html_resource_code(ext_code, ''mindMap''),');
  src := replace(src,
    '''simulation'', jsonb_build_object(''resourceCode'', ext_code || ''-EXPERIMENT'',',
    '''simulation'', jsonb_build_object(''resourceCode'', public.cf11_html_resource_code(ext_code, ''simulation''),');
  src := replace(src,
    'v_resource_code := CASE cap WHEN ''mindMap'' THEN ext_code || ''-MINDMAP''\n                              ELSE ext_code || ''-EXPERIMENT'' END;',
    'v_resource_code := public.cf11_html_resource_code(ext_code, cap);');

  SELECT pg_get_functiondef(p.oid) INTO fixed
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname='cf11_assert_html_replay_state'
     AND pg_get_function_identity_arguments(p.oid) = '_plan jsonb';

  IF fixed IS NULL OR position('OR public.cf10_html_publication_pending(v_lesson, cap)' in fixed) = 0 THEN
    RAISE EXCEPTION 'CF11_HTML_REPLAY_FIX_GUARD: expected helper fragment not found';
  END IF;

  fixed := replace(fixed,
    E'IF v_count <> 1 OR v_live_hash IS DISTINCT FROM v_expected_hash\n       OR public.cf10_html_publication_pending(v_lesson, cap) THEN',
    'IF v_count <> 1 OR v_live_hash IS DISTINCT FROM v_expected_hash THEN');

  IF position('OR public.cf10_html_publication_pending(v_lesson, cap)' in fixed) > 0 THEN
    RAISE EXCEPTION 'CF11_HTML_REPLAY_FIX_GUARD: helper replacement failed';
  END IF;

  EXECUTE fixed;
END $$;

REVOKE ALL ON FUNCTION public.cf10_html_publication_pending(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf10_html_publication_pending(uuid, text) TO authenticated, service_role;