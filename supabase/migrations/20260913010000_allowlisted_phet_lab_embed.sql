-- Allow one narrowly-scoped online PhET simulation as a lab component.
-- Every other interactive component remains self-contained and network-free.

BEGIN;

CREATE OR REPLACE FUNCTION public.cf11_is_allowed_phet_lab(_html text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  refs text[];
  ref text;
BEGIN
  IF coalesce(btrim(_html), '') = ''
     OR _html ~* '<(script|object|embed|form|base)\y'
     OR _html ~* '\son[a-z]+\s*='
     OR _html ~* 'url\(\s*["'']?(https?:)?//' THEN
    RETURN false;
  END IF;

  SELECT array_agg(m[1]) INTO refs
  FROM regexp_matches(
    _html,
    '<[A-Za-z][A-Za-z0-9:-]*\y[^>]*\y(?:src|href|poster)\s*=\s*["'']([^"'']+)["'']',
    'gi'
  ) AS m
  WHERE m[1] ~* '^(https?:)?//';

  IF coalesce(array_length(refs, 1), 0) <> 1 THEN
    RETURN false;
  END IF;
  ref := refs[1];

  RETURN _html ~* '<iframe\y[^>]*\ysrc\s*=\s*["'']https://phet\.colorado\.edu/sims/html/'
     AND ref ~ '^https://phet\.colorado\.edu/sims/html/[A-Za-z0-9._~!$&()*+,;=:@%/-]+(\?[A-Za-z0-9._~!$&()*+,;=:@%/?-]*)?(#[A-Za-z0-9._~!$&()*+,;=:@%/?-]*)?$';
END;
$function$;

CREATE OR REPLACE FUNCTION public.cf11_assert_interactive_contract(_label text, _html text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  csp text;
  scripts text[];
  s text;
  h text;
  hashes jsonb := '[]'::jsonb;
BEGIN
  IF coalesce(btrim(_html),'') = '' THEN
    RAISE EXCEPTION 'CF11_HTML_EMPTY: %', _label USING ERRCODE = '23514';
  END IF;

  IF _label = 'labExperimentHtml' AND public.cf11_is_allowed_phet_lab(_html) THEN
    csp := 'default-src ''none''; connect-src ''none''; frame-src https://phet.colorado.edu; '
      || 'script-src ''none''; style-src ''unsafe-inline''; img-src data:; object-src ''none''; '
      || 'base-uri ''none''; form-action ''none''';
    RETURN jsonb_build_object(
      'csp', csp,
      'scriptHashes', '[]'::jsonb,
      'scriptCount', 0,
      'externalProvider', 'PHET',
      'networkRequired', true,
      'allowedOrigin', 'https://phet.colorado.edu'
    );
  END IF;

  SELECT coalesce((regexp_match(_html,
           '<meta\s+http-equiv\s*=\s*["'']Content-Security-Policy["''][^>]*\ycontent\s*=\s*"([^"]*)"',
           'i'))[1],
         (regexp_match(_html,
           '<meta\s+http-equiv\s*=\s*["'']Content-Security-Policy["''][^>]*\ycontent\s*=\s*''([^'']*)''',
           'i'))[1]) INTO csp;
  IF csp IS NULL THEN
    RAISE EXCEPTION 'CF11_LAB_CSP_MISSING: %', _label USING ERRCODE = '23514';
  END IF;
  IF csp !~* 'default-src\s+''none''' THEN
    RAISE EXCEPTION 'CF11_LAB_CSP_DEFAULT_SRC: %', _label USING ERRCODE = '23514';
  END IF;
  IF csp !~* 'connect-src\s+''none''' THEN
    RAISE EXCEPTION 'CF11_LAB_CSP_CONNECT_SRC: %', _label USING ERRCODE = '23514';
  END IF;
  IF csp ~* 'unsafe-eval|\*'
     OR csp ~* 'script-src[^;]*unsafe-inline' THEN
    RAISE EXCEPTION 'CF11_LAB_CSP_UNSAFE: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '<script\y[^>]*\ysrc\s*=' THEN
    RAISE EXCEPTION 'CF11_LAB_EXTERNAL_SCRIPT: %', _label USING ERRCODE = '23514';
  END IF;

  scripts := public.cf11_inline_scripts(_html);
  IF array_length(scripts, 1) IS NULL THEN
    RAISE EXCEPTION 'CF11_LAB_NO_INLINE_SCRIPT: %', _label USING ERRCODE = '23514';
  END IF;

  FOREACH s IN ARRAY scripts LOOP
    h := public.cf11_script_csp_hash(s);
    IF position(('sha256-' || h) in csp) = 0 THEN
      RAISE EXCEPTION 'CF11_LAB_CSP_SCRIPT_HASH_MISMATCH: % expected sha256-%', _label, h
        USING ERRCODE = '23514';
    END IF;
    hashes := hashes || to_jsonb('sha256-' || h);
  END LOOP;

  IF (SELECT count(*) FROM regexp_matches(csp, '''sha256-[A-Za-z0-9+/=]+''', 'g'))
     <> jsonb_array_length(hashes) THEN
    RAISE EXCEPTION 'CF11_LAB_CSP_HASH_SET_MISMATCH: %', _label USING ERRCODE = '23514';
  END IF;

  PERFORM public.cf11_assert_no_network(_label, _html);
  RETURN jsonb_build_object('csp', csp, 'scriptHashes', hashes,
                            'scriptCount', array_length(scripts, 1));
END;
$function$;

COMMENT ON FUNCTION public.cf11_is_allowed_phet_lab(text) IS
'Exact allowlist contract for one HTTPS PhET HTML simulation iframe and no other external dependency.';
COMMENT ON FUNCTION public.cf11_assert_interactive_contract(text,text) IS
'Validates self-contained interactive HTML, plus a lab-only single PhET iframe exception.';

REVOKE ALL ON FUNCTION public.cf11_is_allowed_phet_lab(text) FROM PUBLIC, anon, authenticated;

COMMIT;
