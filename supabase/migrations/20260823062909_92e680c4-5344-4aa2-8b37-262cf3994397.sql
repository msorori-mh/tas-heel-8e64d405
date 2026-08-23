CREATE OR REPLACE FUNCTION public.cf11_assert_interactive_contract(_label text, _html text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF coalesce(btrim(_html), '') = '' THEN
    RAISE EXCEPTION 'CF11_HTML_EMPTY: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '(https?:)?//[a-z0-9]' THEN
    RAISE EXCEPTION 'CF11_HTML_EXTERNAL_URL: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '<script\y[^>]*\ysrc\s*=' THEN
    RAISE EXCEPTION 'CF11_INTERACTIVE_EXTERNAL_SCRIPT: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '<(iframe|object|embed|form|link|base)\y' THEN
    RAISE EXCEPTION 'CF11_HTML_FORBIDDEN_ELEMENT: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '\y(eval\s*\(|new\s+Function\s*\(|WebSocket\s*\(|EventSource\s*\(|importScripts\s*\(|navigator\.sendBeacon\s*\()' THEN
    RAISE EXCEPTION 'CF11_INTERACTIVE_DYNAMIC_EXECUTION: %', _label USING ERRCODE = '23514';
  END IF;
  RETURN jsonb_build_object(
    'enforcement', 'RUNTIME_WRAPPER',
    'sandbox', 'allow-scripts',
    'opaqueOrigin', true,
    'network', 'none',
    'csp', 'default-src ''none''; script-src ''unsafe-inline''; style-src ''unsafe-inline''; img-src data:; font-src data:; media-src ''none''; connect-src ''none''; frame-src ''none''; object-src ''none''; base-uri ''none''; form-action ''none'''
  );
END;
$function$;

DO $migration$
DECLARE
  v text;
  changed boolean := false;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'golden_lesson_publish_cf11'
    AND p.pronargs = 6
    AND p.proargtypes = '2950 2950 25 3802 25 25'::oidvector;

  IF v IS NULL THEN
    RAISE EXCEPTION 'golden_lesson_publish_cf11 is missing';
  END IF;

  IF position('mind_contract jsonb;' in v) = 0 THEN
    IF position('lab_contract jsonb;' in v) = 0 THEN
      RAISE EXCEPTION 'CF11_INTERACTIVE_ALIGNMENT_UNEXPECTED_DECLARATION';
    END IF;
    v := replace(v, 'lab_contract jsonb;', 'mind_contract jsonb;' || E'\n  ' || 'lab_contract jsonb;');
    changed := true;
  END IF;

  IF position('mind_contract := public.cf11_assert_interactive_contract(''mindMapHtml'', mind_html);' in v) = 0 THEN
    IF position('PERFORM public.cf11_assert_static_contract(''mindMapHtml'', mind_html);' in v) = 0 THEN
      RAISE EXCEPTION 'CF11_INTERACTIVE_ALIGNMENT_UNEXPECTED_VALIDATOR';
    END IF;
    v := replace(v,
      'PERFORM public.cf11_assert_static_contract(''mindMapHtml'', mind_html);',
      'mind_contract := public.cf11_assert_interactive_contract(''mindMapHtml'', mind_html);');
    changed := true;
  END IF;

  IF position('''renderMode'',''INTERACTIVE'',' in v) = 0
     OR position('''mindMap'', jsonb_build_object' in v) = 0 THEN
    RAISE EXCEPTION 'CF11_INTERACTIVE_ALIGNMENT_UNEXPECTED_PLAN';
  END IF;

  IF position('''mindMap'', jsonb_build_object(''resourceCode'', ext_code || ''-MINDMAP'',' || E'\n' ||
              '                                    ''sha256'', public.cf11_text_sha256(mind_html),' || E'\n' ||
              '                                    ''renderMode'',''INTERACTIVE'',' || E'\n' ||
              '                                    ''csp'', mind_contract)' in v) = 0 THEN
    IF position('''mindMap'', jsonb_build_object(''resourceCode'', ext_code || ''-MINDMAP'',' || E'\n' ||
                '                                    ''sha256'', public.cf11_text_sha256(mind_html),' || E'\n' ||
                '                                    ''renderMode'',''STATIC'')' in v) = 0 THEN
      RAISE EXCEPTION 'CF11_INTERACTIVE_ALIGNMENT_UNEXPECTED_MIND_PLAN';
    END IF;
    v := replace(v,
      '''mindMap'', jsonb_build_object(''resourceCode'', ext_code || ''-MINDMAP'',' || E'\n' ||
      '                                    ''sha256'', public.cf11_text_sha256(mind_html),' || E'\n' ||
      '                                    ''renderMode'',''STATIC'')',
      '''mindMap'', jsonb_build_object(''resourceCode'', ext_code || ''-MINDMAP'',' || E'\n' ||
      '                                    ''sha256'', public.cf11_text_sha256(mind_html),' || E'\n' ||
      '                                    ''renderMode'',''INTERACTIVE'',' || E'\n' ||
      '                                    ''csp'', mind_contract)');
    changed := true;
  END IF;

  IF position('''INTERACTIVE'',' || E'\n' || '      jsonb_build_object(' in v) = 0 THEN
    IF position('CASE cap WHEN ''mindMap'' THEN ''mindmap'' ELSE ''experiment'' END,' || E'\n' || '      jsonb_build_object(' in v) = 0 THEN
      RAISE EXCEPTION 'CF11_INTERACTIVE_ALIGNMENT_UNEXPECTED_RESOURCE_TYPE';
    END IF;
    v := replace(v,
      'CASE cap WHEN ''mindMap'' THEN ''mindmap'' ELSE ''experiment'' END,' || E'\n' || '      jsonb_build_object(',
      '''INTERACTIVE'',' || E'\n' || '      jsonb_build_object(');
    changed := true;
  END IF;

  IF position('''cf11_render_mode'', ''INTERACTIVE'',' in v) = 0 THEN
    IF position('''cf11_render_mode'', CASE cap WHEN ''mindMap'' THEN ''STATIC'' ELSE ''INTERACTIVE'' END,' in v) = 0 THEN
      RAISE EXCEPTION 'CF11_INTERACTIVE_ALIGNMENT_UNEXPECTED_METADATA_MODE';
    END IF;
    v := replace(v,
      '''cf11_render_mode'', CASE cap WHEN ''mindMap'' THEN ''STATIC'' ELSE ''INTERACTIVE'' END,',
      '''cf11_render_mode'', ''INTERACTIVE'',');
    changed := true;
  END IF;

  IF position('''cf11_csp'', CASE cap WHEN ''mindMap'' THEN mind_contract ELSE lab_contract END)' in v) = 0 THEN
    IF position('''cf11_csp'', CASE cap WHEN ''simulation'' THEN lab_contract ELSE NULL END)' in v) = 0 THEN
      RAISE EXCEPTION 'CF11_INTERACTIVE_ALIGNMENT_UNEXPECTED_METADATA_CONTRACT';
    END IF;
    v := replace(v,
      '''cf11_csp'', CASE cap WHEN ''simulation'' THEN lab_contract ELSE NULL END)',
      '''cf11_csp'', CASE cap WHEN ''mindMap'' THEN mind_contract ELSE lab_contract END)');
    changed := true;
  END IF;

  IF changed THEN
    EXECUTE v;
  END IF;
END;
$migration$;

COMMENT ON FUNCTION public.cf11_assert_interactive_contract(text,text)
IS 'Validates self-contained authored interactive HTML; runtime sandbox and network-denying CSP are imposed centrally by the student viewer.';