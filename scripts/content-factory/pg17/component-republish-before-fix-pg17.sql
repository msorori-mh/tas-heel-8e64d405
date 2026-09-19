-- Disposable PG17 only. Prove the exact production uniqueness error first.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
SELECT pg_temp.lcpv2_verified_intake('republish-explanation','tamkeenExplanationHtml',
  '<html dir="rtl"><body>EXPLANATION</body></html>');
SELECT pg_temp.lcpv2_verified_intake('republish-mindmap','mindMapHtml',
  '<html dir="rtl"><body><button onclick="window.opened=true">MIND</button><script>window.ready=true</script></body></html>');
CREATE TEMP TABLE republish_original_rows AS
SELECT 'tamkeenExplanationHtml'::text AS capability,id FROM public.lesson_explanations
 WHERE lesson_id='43000000-0000-0000-0000-0000000000b2'
UNION ALL
SELECT 'mindMapHtml',id FROM public.lesson_resources
 WHERE lesson_id='43000000-0000-0000-0000-0000000000b2' AND resource_type='mindmap';
GRANT SELECT ON republish_original_rows TO authenticated;
SET ROLE authenticated;
DO $proof$
DECLARE v_label text; constraint_name text; failed boolean;
BEGIN
  FOREACH v_label IN ARRAY ARRAY['republish-explanation','republish-mindmap'] LOOP
    failed:=false;
    BEGIN
      PERFORM public.lesson_component_publish_v2(
        (SELECT intake_id FROM lcpv2_proof_intakes i WHERE i.label=v_label),v_label||':publish');
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS constraint_name=CONSTRAINT_NAME;
      IF constraint_name IS DISTINCT FROM (CASE v_label WHEN 'republish-explanation'
          THEN 'lesson_explanations_code_lesson_uniq' ELSE 'idx_lesson_resources_code_per_lesson' END) THEN
        RAISE;
      END IF;
      failed:=true;
    END;
    IF NOT failed THEN RAISE EXCEPTION 'REPUBLISH_BASELINE_DID_NOT_REPRODUCE: %',v_label; END IF;
  END LOOP;
END
$proof$;
RESET ROLE;
SELECT 'PASS_REPUBLISH_ORIGINAL_UNIQUE_VIOLATIONS_REPRODUCED' AS verdict;
