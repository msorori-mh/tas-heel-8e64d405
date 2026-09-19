RESET ROLE;
DO $proof$
DECLARE bad text; contract jsonb;
BEGIN
  -- All laboratory functions remain byte-identical, with identical privileges.
  IF EXISTS(SELECT 1 FROM mindmap_function_baseline b JOIN pg_proc p USING(oid)
    WHERE p.proacl IS DISTINCT FROM b.proacl OR p.proowner<>b.proowner
      OR (p.proname NOT LIKE '%publish%' AND pg_get_functiondef(p.oid)<>b.definition)) THEN
    RAISE EXCEPTION 'MINDMAP_LAB_FUNCTION_OR_PUBLISHER_PRIVILEGES_CHANGED';
  END IF;
  IF EXISTS(SELECT 1 FROM mindmap_lab_cases c JOIN mindmap_lab_outcomes_before b USING(label)
    WHERE pg_temp.mindmap_lab_outcome(c.html) IS DISTINCT FROM b.outcome) THEN
    RAISE EXCEPTION 'MINDMAP_LAB_RESULTS_CHANGED';
  END IF;
  IF has_function_privilege('anon','public.cf11_assert_mindmap_contract(text)','EXECUTE')
     OR has_function_privilege('authenticated','public.cf11_assert_mindmap_contract(text)','EXECUTE') THEN
    RAISE EXCEPTION 'MINDMAP_HELPER_EXPOSED';
  END IF;
  contract:=public.cf11_assert_mindmap_contract((SELECT html FROM mindmap_source));
  IF contract->>'enforcement'<>'RUNTIME_WRAPPER' OR contract->>'sandbox'<>'allow-scripts'
     OR contract->>'network'<>'none' OR contract->>'opaqueOrigin'<>'true'
     OR contract->>'csp' NOT LIKE '%frame-src ''none''%' THEN
    RAISE EXCEPTION 'MINDMAP_RUNTIME_CONTRACT_INVALID';
  END IF;
  -- PhET and all frames are laboratory-only, never a mindmap exception.
  FOREACH bad IN ARRAY ARRAY[
    '', '<script src="local.js"></script>', '<script src="https://example.com/x.js"></script>',
    '<iframe src="about:blank"></iframe>', '<form></form>', '<object></object>', '<embed>', '<base>', '<link>',
    '<script>eval("1")</script>', '<script>new Function("1")</script>',
    '<script>new WebSocket("/socket")</script>', '<script>new EventSource("/events")</script>',
    '<script>importScripts("x")</script>', '<script>navigator.sendBeacon("/x")</script>',
    (SELECT html FROM mindmap_lab_cases WHERE label='phet')
  ] LOOP
    BEGIN
      PERFORM public.cf11_assert_mindmap_contract(bad);
      RAISE EXCEPTION 'MINDMAP_UNSAFE_INPUT_ACCEPTED: %',bad;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
END $proof$;

SET ROLE authenticated;
DO $proof$
DECLARE result jsonb; replay jsonb;
BEGIN
  result:=public.lesson_component_publish_v2(
    (SELECT intake_id FROM lcpv2_proof_intakes WHERE label='mindmap-reported'),'mindmap:reported:publish');
  replay:=public.lesson_component_publish_v2(
    (SELECT intake_id FROM lcpv2_proof_intakes WHERE label='mindmap-reported'),'mindmap:reported:publish');
  IF result->>'student_can_see_this_component'<>'true' OR result->>'status'<>'READY'
     OR replay->>'idempotent'<>'true' OR (replay->>'writes_performed')::integer<>0 THEN
    RAISE EXCEPTION 'MINDMAP_PUBLICATION_OR_REPLAY_FAILED: % / %',result,replay;
  END IF;
END $proof$;
RESET ROLE;
-- Upload the same exact file again through a new verified intake.
SELECT pg_temp.lcpv2_verified_intake('mindmap-reported-again','mindMapHtml',(SELECT html FROM mindmap_source));
SET ROLE authenticated;
SELECT public.lesson_component_publish_v2(
  (SELECT intake_id FROM lcpv2_proof_intakes WHERE label='mindmap-reported-again'),'mindmap:reported:again');
RESET ROLE;
DO $proof$
BEGIN
  IF (SELECT count(*) FROM public.lesson_resources WHERE lesson_id='43000000-0000-0000-0000-0000000000b2'
       AND resource_type='mindmap')<>1
     OR NOT EXISTS(SELECT 1 FROM public.lesson_resources r CROSS JOIN mindmap_source s
       WHERE lesson_id='43000000-0000-0000-0000-0000000000b2' AND resource_type='mindmap'
         AND r.description=s.html AND r.metadata->'cf11_csp'->>'enforcement'='RUNTIME_WRAPPER') THEN
    RAISE EXCEPTION 'MINDMAP_BYTES_OR_SINGLE_CANONICAL_ROW_FAILED';
  END IF;
  IF EXISTS(SELECT 1 FROM mindmap_lab_rows_before b FULL JOIN
      (SELECT id,to_jsonb(r) AS row FROM public.lesson_resources r WHERE resource_type='experiment') a USING(id)
      WHERE a.row IS DISTINCT FROM b.row) THEN
    RAISE EXCEPTION 'MINDMAP_PUBLICATION_CHANGED_EXISTING_LABS';
  END IF;
END $proof$;

-- Actually publish PhET + offline labs after the fix, with independent instances.
CREATE TEMP TABLE mindmap_new_lab_intakes AS
SELECT c.label,pg_temp.lcpv2_multi_lab_intake('lcpv2-quran-lesson','mindmap-lab-'||c.label,c.html,
  CASE c.label WHEN 'phet' THEN 2 ELSE 3 END,4,NULL) AS intake_id
FROM mindmap_lab_cases c WHERE label IN ('phet','offline');
GRANT SELECT ON mindmap_new_lab_intakes TO authenticated;
SET ROLE authenticated;
DO $proof$
DECLARE item record; result jsonb; replay jsonb;
BEGIN
  FOR item IN SELECT * FROM mindmap_new_lab_intakes ORDER BY label LOOP
    result:=public.lesson_component_publish_v2(item.intake_id,'mindmap:lab:'||item.label);
    replay:=public.lesson_component_publish_v2(item.intake_id,'mindmap:lab:'||item.label);
    IF result->>'student_can_see_this_component'<>'true'
       OR replay->>'idempotent'<>'true' OR (replay->>'writes_performed')::integer<>0 THEN
      RAISE EXCEPTION 'MINDMAP_LAB_PUBLICATION_REGRESSION: % / %',result,replay;
    END IF;
  END LOOP;
END $proof$;
RESET ROLE;
SELECT 'PASS_MINDMAP_PUBLICATION_REUPLOAD_AND_LAB_ISOLATION_PG17' AS verdict;
