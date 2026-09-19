-- Mindmaps accept self-contained authored interactivity; the existing student
-- wrapper supplies CSP and an opaque allow-scripts sandbox. Keep laboratory
-- validation, including PhET allowlisting and authored script hashes, unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.cf11_assert_mindmap_contract(_html text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF coalesce(btrim(_html),'') = '' THEN
    RAISE EXCEPTION 'CF11_HTML_EMPTY: %', 'mindMapHtml' USING ERRCODE = '23514';
  END IF;
  IF _html ~* '(https?:)?//[a-z0-9]' THEN
    RAISE EXCEPTION 'CF11_HTML_EXTERNAL_URL: %', 'mindMapHtml' USING ERRCODE = '23514';
  END IF;
  IF _html ~* '<script\y[^>]*\ysrc\s*=' THEN
    RAISE EXCEPTION 'CF11_INTERACTIVE_EXTERNAL_SCRIPT: %', 'mindMapHtml' USING ERRCODE = '23514';
  END IF;
  IF _html ~* '<(iframe|object|embed|form|link|base)\y' THEN
    RAISE EXCEPTION 'CF11_HTML_FORBIDDEN_ELEMENT: %', 'mindMapHtml' USING ERRCODE = '23514';
  END IF;
  IF _html ~* '\y(eval\s*\(|new\s+Function\s*\(|WebSocket\s*\(|EventSource\s*\(|importScripts\s*\(|navigator\.sendBeacon\s*\()' THEN
    RAISE EXCEPTION 'CF11_INTERACTIVE_DYNAMIC_EXECUTION: %', 'mindMapHtml' USING ERRCODE = '23514';
  END IF;
  RETURN jsonb_build_object(
    'enforcement', 'RUNTIME_WRAPPER',
    'sandbox', 'allow-scripts',
    'opaqueOrigin', true,
    'network', 'none',
    'csp', 'default-src ''none''; script-src ''unsafe-inline''; style-src ''unsafe-inline''; img-src data:; font-src data:; media-src ''none''; connect-src ''none''; frame-src ''none''; object-src ''none''; base-uri ''none''; form-action ''none''');
END $$;

REVOKE ALL ON FUNCTION public.cf11_assert_mindmap_contract(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cf11_assert_mindmap_contract(text) TO service_role;

COMMENT ON FUNCTION public.cf11_assert_mindmap_contract(text) IS
  'Mindmaps only: self-contained authored HTML under the existing runtime CSP/opaque sandbox. Independent from laboratory validation.';

-- Replace only the mindmap call sites, retaining every other publisher statement
-- and its owner/ACL. Exact anchors fail closed on unknown source drift.
DO $migration$
DECLARE
  targets text[] := ARRAY[
    'public.lesson_component_publish_v2(uuid,text)',
    'public.golden_lesson_publish_cf11(uuid,uuid,text,jsonb,text,text)',
    'public.golden_lesson_publish_component_unledgered(uuid,text,text)'
  ];
  old_values text[] := ARRAY[
    $old$ELSIF v_intake.capability='mindMapHtml' THEN
    v_interactive_contract:=public.cf11_assert_interactive_contract(
      v_intake.capability,v_intake.payload_text);$old$,
    $old$mind_contract := public.cf11_assert_interactive_contract('mindMapHtml', mind_html);$old$,
    $old$contract := public.cf11_assert_interactive_contract(_capability, payload);$old$
  ];
  new_values text[] := ARRAY[
    $new$ELSIF v_intake.capability='mindMapHtml' THEN
    v_interactive_contract:=public.cf11_assert_mindmap_contract(v_intake.payload_text);$new$,
    $new$mind_contract := public.cf11_assert_mindmap_contract(mind_html);$new$,
    $new$IF _capability = 'mindMapHtml' THEN
      contract := public.cf11_assert_mindmap_contract(payload);
    ELSE
      contract := public.cf11_assert_interactive_contract(_capability, payload);
    END IF;$new$
  ];
  target regprocedure;
  original text;
  patched text;
  before_acl aclitem[];
  before_owner oid;
  i integer;
  old_count integer;
  new_count integer;
  lab_definition text := pg_get_functiondef('public.cf11_assert_interactive_contract(text,text)'::regprocedure);
  phet_definition text := pg_get_functiondef('public.cf11_is_allowed_phet_lab(text)'::regprocedure);
BEGIN
  FOR i IN 1..array_length(targets,1) LOOP
    target := to_regprocedure(targets[i]);
    IF target IS NULL THEN RAISE EXCEPTION 'MINDMAP_PUBLISHER_MISSING: %',targets[i]; END IF;
    SELECT pg_get_functiondef(oid),proacl,proowner INTO original,before_acl,before_owner
      FROM pg_proc WHERE oid=target;
    new_count := (length(original)-length(replace(original,new_values[i],'')))/length(new_values[i]);
    -- The legacy laboratory ELSE still contains its old call; first recognize
    -- the complete new branch so a second migration apply is a strict no-op.
    IF new_count=1 THEN CONTINUE; END IF;
    old_count := (length(original)-length(replace(original,old_values[i],'')))/length(old_values[i]);
    IF new_count<>0 OR old_count<>1 THEN
      RAISE EXCEPTION 'MINDMAP_CALL_SITE_DRIFT: %',targets[i];
    END IF;
    patched := replace(original,old_values[i],new_values[i]);
    EXECUTE patched;
    IF pg_get_functiondef(target) IS DISTINCT FROM patched
       OR (SELECT proacl IS DISTINCT FROM before_acl OR proowner<>before_owner FROM pg_proc WHERE oid=target) THEN
      RAISE EXCEPTION 'MINDMAP_PUBLISHER_POSTVERIFY_FAILED: %',targets[i];
    END IF;
  END LOOP;
  IF pg_get_functiondef('public.cf11_assert_interactive_contract(text,text)'::regprocedure) IS DISTINCT FROM lab_definition
     OR pg_get_functiondef('public.cf11_is_allowed_phet_lab(text)'::regprocedure) IS DISTINCT FROM phet_definition THEN
    RAISE EXCEPTION 'MINDMAP_LABORATORY_DEFINITION_CHANGED';
  END IF;
END
$migration$;

COMMIT;
