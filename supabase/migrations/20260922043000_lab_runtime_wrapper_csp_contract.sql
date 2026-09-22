-- Restore the intended centralized runtime-wrapper contract for self-contained laboratory HTML.
--
-- 20260913 tightened cf11_assert_interactive_contract so authored lab HTML had to carry
-- its own CSP + script hashes. That contradicts the student renderer, which already injects
-- the authoritative CSP/sandbox centrally, and causes ordinary reviewed lab HTML to fail at
-- publication with CF11_LAB_CSP_MISSING. Keep the exact PhET exception, but return offline
-- labs to the runtime-wrapper contract used by the student viewer.
--
-- Additive/function-only migration: no table rewrite and no existing content mutation.

BEGIN;

CREATE OR REPLACE FUNCTION public.cf11_assert_interactive_contract(_label text, _html text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  csp text;
BEGIN
  IF coalesce(btrim(_html), '') = '' THEN
    RAISE EXCEPTION 'CF11_HTML_EMPTY: %', _label USING ERRCODE = '23514';
  END IF;

  -- Preserve the narrow online PhET exception exactly. No other external URL is allowed.
  IF _label = 'labExperimentHtml' AND public.cf11_is_allowed_phet_lab(_html) THEN
    csp := 'default-src ''none''; connect-src ''none''; frame-src https://phet.colorado.edu; '
      || 'script-src ''none''; style-src ''unsafe-inline''; img-src data:; object-src ''none''; '
      || 'base-uri ''none''; form-action ''none''';
    RETURN jsonb_build_object(
      'enforcement', 'RUNTIME_WRAPPER',
      'sandbox', 'allow-scripts',
      'opaqueOrigin', true,
      'network', 'phet-only',
      'csp', csp,
      'scriptHashes', '[]'::jsonb,
      'scriptCount', 0,
      'externalProvider', 'PHET',
      'networkRequired', true,
      'allowedOrigin', 'https://phet.colorado.edu'
    );
  END IF;

  -- Offline authored labs are self-contained. The application, not the uploaded file,
  -- owns CSP/sandbox enforcement. Inline scripts and onclick handlers are therefore
  -- permitted here, while all network/external/dynamic execution primitives fail closed.
  IF _html ~* '(https?:)?//[a-z0-9]' THEN
    RAISE EXCEPTION 'CF11_HTML_EXTERNAL_URL: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '<script\y[^>]*\ysrc\s*=' THEN
    RAISE EXCEPTION 'CF11_INTERACTIVE_EXTERNAL_SCRIPT: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '<(iframe|object|embed|form|link|base)\y' THEN
    RAISE EXCEPTION 'CF11_HTML_FORBIDDEN_ELEMENT: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '\y(eval\s*\(|new\s+Function\s*\(|WebSocket\s*\(|EventSource\s*\(|importScripts\s*\(|navigator\.sendBeacon\s*\(|XMLHttpRequest\s*\(|fetch\s*\()' THEN
    RAISE EXCEPTION 'CF11_INTERACTIVE_DYNAMIC_EXECUTION: %', _label USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'enforcement', 'RUNTIME_WRAPPER',
    'sandbox', 'allow-scripts',
    'opaqueOrigin', true,
    'network', 'none',
    'csp',
      'default-src ''none''; script-src ''unsafe-inline''; style-src ''unsafe-inline''; '
      || 'img-src data:; font-src data:; media-src ''none''; connect-src ''none''; '
      || 'frame-src ''none''; object-src ''none''; base-uri ''none''; form-action ''none'''
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cf11_assert_interactive_contract(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cf11_assert_interactive_contract(text, text) TO service_role;

COMMENT ON FUNCTION public.cf11_assert_interactive_contract(text,text) IS
'Validates self-contained authored lab HTML under the centrally injected runtime CSP/opaque sandbox, while preserving the exact allowlisted PhET iframe exception.';

-- Transactional regression proof. It writes no application rows.
DO $proof$
DECLARE
  contract jsonb;
  rejected boolean;
BEGIN
  contract := public.cf11_assert_interactive_contract(
    'labExperimentHtml',
    '<!doctype html><html dir="rtl"><head><meta charset="utf-8"></head><body>'
    || '<button onclick="window.count=(window.count||0)+1">ابدأ</button>'
    || '<script>window.ready=true</script></body></html>'
  );

  IF contract->>'enforcement' <> 'RUNTIME_WRAPPER'
     OR contract->>'sandbox' <> 'allow-scripts'
     OR contract->>'network' <> 'none'
     OR contract->>'csp' NOT LIKE '%connect-src ''none''%'
     OR contract->>'csp' NOT LIKE '%script-src ''unsafe-inline''%' THEN
    RAISE EXCEPTION 'LAB_RUNTIME_WRAPPER_CONTRACT_INVALID';
  END IF;

  -- The original production failure must be gone: authored CSP is optional.
  IF contract ? 'scriptHashes' THEN
    RAISE EXCEPTION 'LAB_OFFLINE_CONTRACT_UNEXPECTED_AUTHOR_HASH_REQUIREMENT';
  END IF;

  rejected := false;
  BEGIN
    PERFORM public.cf11_assert_interactive_contract(
      'labExperimentHtml',
      '<html><body><script src="https://cdn.example.com/lab.js"></script></body></html>'
    );
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'LAB_EXTERNAL_SCRIPT_NOT_REJECTED'; END IF;

  rejected := false;
  BEGIN
    PERFORM public.cf11_assert_interactive_contract(
      'labExperimentHtml',
      '<html><body><script>fetch("/api/private")</script></body></html>'
    );
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'LAB_FETCH_NOT_REJECTED'; END IF;

  contract := public.cf11_assert_interactive_contract(
    'labExperimentHtml',
    '<html dir="rtl"><body><iframe src="https://phet.colorado.edu/sims/html/density/latest/density_all.html"></iframe></body></html>'
  );
  IF contract->>'externalProvider' <> 'PHET'
     OR contract->>'allowedOrigin' <> 'https://phet.colorado.edu'
     OR (contract->>'networkRequired')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'LAB_PHET_ALLOWLIST_REGRESSION';
  END IF;
END;
$proof$;

COMMIT;
