-- Disposable database only. Load the exact reported bytes, including final LF.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
\set mindmap_hex `python3 -c "from pathlib import Path; print(Path('tests/content-factory/fixtures/mindmap-physics-measurement.html').read_bytes().hex())"`
CREATE TEMP TABLE mindmap_source AS SELECT convert_from(decode(:'mindmap_hex','hex'),'UTF8') AS html;
GRANT SELECT ON mindmap_source TO authenticated;
DO $proof$
BEGIN
  IF (SELECT public.cf11_text_sha256(html) FROM mindmap_source)
      <> 'ba552cc74e0baf2ca7ddb3d8c88c9ecd07305deac607e4bf55753128af9e6ac6' THEN
    RAISE EXCEPTION 'MINDMAP_REPORTED_BYTES_CHANGED';
  END IF;
END $proof$;

CREATE TEMP TABLE mindmap_function_baseline AS
SELECT oid,pg_get_functiondef(oid) AS definition,proacl,proowner FROM pg_proc WHERE oid IN (
  'public.cf11_assert_interactive_contract(text,text)'::regprocedure,
  'public.cf11_is_allowed_phet_lab(text)'::regprocedure,
  'public.cf11_assert_no_network(text,text)'::regprocedure,
  'public.lesson_component_publish_v2(uuid,text)'::regprocedure,
  'public.golden_lesson_publish_cf11(uuid,uuid,text,jsonb,text,text)'::regprocedure,
  'public.golden_lesson_publish_component_unledgered(uuid,text,text)'::regprocedure);
CREATE TEMP TABLE mindmap_lab_rows_before AS
SELECT id,to_jsonb(r) AS row FROM public.lesson_resources r WHERE resource_type='experiment';

CREATE TEMP TABLE mindmap_lab_cases(label text PRIMARY KEY, html text, expected_state text);
INSERT INTO mindmap_lab_cases VALUES
  ('phet','<html dir="rtl"><body><iframe src="https://phet.colorado.edu/sims/html/density/latest/density_all.html"></iframe><a href="https://phet.colorado.edu/ar/">PhET</a></body></html>','00000'),
  ('offline',format($html$<html dir="rtl"><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'none'; script-src 'sha256-%s';"></head><body><script>window.lab=true</script></body></html>$html$,public.cf11_script_csp_hash('window.lab=true')),'00000'),
  ('missing-csp',(SELECT html FROM mindmap_source),'23514'),
  ('phet-host-spoof','<iframe src="https://phet.colorado.edu.evil.example/sims/html/x.html"></iframe>','23514'),
  ('phet-image','<iframe src="https://phet.colorado.edu/sims/html/density/latest/density_all.html"></iframe><img src="https://phet.colorado.edu/logo.png">','23514'),
  ('phet-two-frames','<iframe src="https://phet.colorado.edu/sims/html/density/latest/density_all.html"></iframe><iframe src="https://phet.colorado.edu/sims/html/density/latest/density_all.html"></iframe>','23514');
INSERT INTO mindmap_lab_cases
SELECT 'hash-mismatch',replace(html,'window.lab=true','window.lab=false'),'23514' FROM mindmap_lab_cases WHERE label='offline'
UNION ALL
SELECT 'inline-handler',replace(html,'<body>','<body onclick="window.clicked=true">'),'23514' FROM mindmap_lab_cases WHERE label='offline'
UNION ALL
SELECT 'unsafe-inline',replace(html,'script-src ', 'script-src ''unsafe-inline'' '),'23514' FROM mindmap_lab_cases WHERE label='offline';

CREATE FUNCTION pg_temp.mindmap_lab_outcome(_html text) RETURNS jsonb LANGUAGE plpgsql AS $proof$
BEGIN
  RETURN jsonb_build_object('state','00000','contract',public.cf11_assert_interactive_contract('labExperimentHtml',_html));
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('state',SQLSTATE,'message',SQLERRM);
END $proof$;
CREATE TEMP TABLE mindmap_lab_outcomes_before AS
SELECT label,pg_temp.mindmap_lab_outcome(html) AS outcome FROM mindmap_lab_cases;
DO $proof$
BEGIN
  IF EXISTS(SELECT 1 FROM mindmap_lab_outcomes_before b JOIN mindmap_lab_cases c USING(label)
    WHERE b.outcome->>'state' IS DISTINCT FROM c.expected_state) THEN
    RAISE EXCEPTION 'MINDMAP_LAB_BASELINE_INVALID';
  END IF;
END $proof$;

SELECT pg_temp.lcpv2_verified_intake('mindmap-reported','mindMapHtml',(SELECT html FROM mindmap_source));
SET ROLE authenticated;
DO $proof$
DECLARE failed boolean:=false;
BEGIN
  BEGIN
    PERFORM public.lesson_component_publish_v2(
      (SELECT intake_id FROM lcpv2_proof_intakes WHERE label='mindmap-reported'),'mindmap:reported:publish');
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'CF11_LAB_CSP_MISSING: mindMapHtml' THEN RAISE; END IF;
    failed:=true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'MINDMAP_ORIGINAL_ERROR_NOT_REPRODUCED'; END IF;
END $proof$;
RESET ROLE;
SELECT 'PASS_MINDMAP_REPORTED_CSP_ERROR_REPRODUCED' AS verdict;
