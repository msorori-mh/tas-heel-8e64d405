-- Existing helper creates verified intakes through the private service boundary;
-- all publish/delete operations below run as the authenticated fixture admin.
RESET ROLE;
CREATE TEMP TABLE republish_security_before AS
SELECT proacl,proowner FROM pg_proc
 WHERE oid='public.lesson_component_publish_v2(uuid,text)'::regprocedure;
SET ROLE authenticated;
DO $proof$
DECLARE v_label text; result jsonb; replay jsonb;
BEGIN
  FOREACH v_label IN ARRAY ARRAY['republish-explanation','republish-mindmap'] LOOP
    result:=public.lesson_component_publish_v2(
      (SELECT intake_id FROM lcpv2_proof_intakes i WHERE i.label=v_label),v_label||':publish');
    replay:=public.lesson_component_publish_v2(
      (SELECT intake_id FROM lcpv2_proof_intakes i WHERE i.label=v_label),v_label||':publish');
    IF (result->>'publication_version')::integer<>2
       OR (result->>'student_can_see_this_component')::boolean IS DISTINCT FROM true
       OR (replay->>'idempotent')::boolean IS DISTINCT FROM true
       OR (replay->>'writes_performed')::integer<>0 THEN
      RAISE EXCEPTION 'REPUBLISH_REPLAY_FAILED: % / %',result,replay;
    END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM public.lesson_explanations e JOIN republish_original_rows r
       ON r.id=e.id WHERE r.capability='tamkeenExplanationHtml')
     OR NOT EXISTS(SELECT 1 FROM public.lesson_resources e JOIN republish_original_rows r
       ON r.id=e.id WHERE r.capability='mindMapHtml') THEN
    RAISE EXCEPTION 'REPUBLISH_REPLACED_STABLE_ROW_ID';
  END IF;
END
$proof$;
RESET ROLE;
-- A changed file must replace the canonical explanation, then the original
-- bytes can be uploaded again (A -> B -> A), always through a fresh intake.
SELECT pg_temp.lcpv2_verified_intake('republish-explanation-b','tamkeenExplanationHtml',
  '<html dir="rtl"><body>EXPLANATION-B</body></html>');
SET ROLE authenticated;
SELECT public.lesson_component_publish_v2(
  (SELECT intake_id FROM lcpv2_proof_intakes WHERE label='republish-explanation-b'),'republish:explanation:b');
DO $proof$
BEGIN
  IF (SELECT content FROM public.lesson_explanations WHERE lesson_id='43000000-0000-0000-0000-0000000000b2')
       IS DISTINCT FROM '<html dir="rtl"><body>EXPLANATION-B</body></html>' THEN
    RAISE EXCEPTION 'REPUBLISH_CHANGED_CONTENT_NOT_SAVED';
  END IF;
END
$proof$;
RESET ROLE;
SELECT pg_temp.lcpv2_verified_intake('republish-explanation-a2','tamkeenExplanationHtml',
  '<html dir="rtl"><body>EXPLANATION</body></html>');
SET ROLE authenticated;
SELECT public.lesson_component_publish_v2(
  (SELECT intake_id FROM lcpv2_proof_intakes WHERE label='republish-explanation-a2'),'republish:explanation:a2');
-- Exercise the actual withdrawal RPC as well as local-file replacement above.
SELECT public.admin_delete_lesson_component('43000000-0000-0000-0000-0000000000b2',
  'tamkeenExplanationHtml','TEST_ONLY delete and upload regression');
DO $proof$
BEGIN
  IF EXISTS(SELECT 1 FROM public.lesson_explanations
      WHERE lesson_id='43000000-0000-0000-0000-0000000000b2') THEN
    RAISE EXCEPTION 'REPUBLISH_WITHDRAWAL_DID_NOT_DELETE';
  END IF;
END
$proof$;
RESET ROLE;
SELECT pg_temp.lcpv2_verified_intake('republish-explanation-after-delete','tamkeenExplanationHtml',
  '<html dir="rtl"><body>EXPLANATION</body></html>');
SET ROLE authenticated;
SELECT public.lesson_component_publish_v2(
  (SELECT intake_id FROM lcpv2_proof_intakes WHERE label='republish-explanation-after-delete'),'republish:explanation:after-delete');
RESET ROLE;
DO $proof$
BEGIN
  IF (SELECT count(*) FROM public.lesson_explanations WHERE lesson_id='43000000-0000-0000-0000-0000000000b2')<>1
     OR (SELECT explanation_code FROM public.lesson_explanations WHERE lesson_id='43000000-0000-0000-0000-0000000000b2')<>'lcpv2-quran-lesson-exp'
     OR (SELECT content FROM public.lesson_explanations WHERE lesson_id='43000000-0000-0000-0000-0000000000b2')<>'<html dir="rtl"><body>EXPLANATION</body></html>'
     OR (SELECT count(*) FROM public.lesson_component_publications_v2
          WHERE lesson_id='43000000-0000-0000-0000-0000000000b2' AND capability='tamkeenExplanationHtml')<>5
     OR NOT public.lesson_capability_ready('43000000-0000-0000-0000-0000000000b2','tamkeenExplanation') THEN
    RAISE EXCEPTION 'REPUBLISH_FINAL_CONTENT_OR_HISTORY_FAILED';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN republish_security_before s
      WHERE p.oid='public.lesson_component_publish_v2(uuid,text)'::regprocedure
        AND (p.proacl IS DISTINCT FROM s.proacl OR p.proowner<>s.proowner)) THEN
    RAISE EXCEPTION 'REPUBLISH_PRIVILEGES_CHANGED';
  END IF;
END
$proof$;
-- An anonymous request must still fail at the publisher's authentication gate.
SELECT set_config('request.jwt.claim.sub','',false);
SET ROLE authenticated;
DO $proof$
BEGIN
  BEGIN
    PERFORM public.lesson_component_publish_v2(
      (SELECT intake_id FROM lcpv2_proof_intakes WHERE label='republish-explanation'),'republish:unauthorized');
    RAISE EXCEPTION 'REPUBLISH_UNAUTHORIZED_WAS_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE '%LCPV2_NOT_AUTHORIZED%' THEN RAISE; END IF;
  END;
END
$proof$;
RESET ROLE;
SELECT 'PASS_COMPONENT_REPUBLISH_NORMALIZED_CODES_PG17' AS verdict;
