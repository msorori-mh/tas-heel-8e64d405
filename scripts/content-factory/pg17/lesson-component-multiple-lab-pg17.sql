-- Multiple lab experiments — executable PostgreSQL 17 acceptance proof.
-- Runs only after lesson-component-publishing-v2-pg17.sql in the disposable rehearsal DB.

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', false);

INSERT INTO public.lessons(id, slug, subject_id, unit_id, title, is_free, semester, sort_order)
VALUES ('43000000-0000-0000-0000-0000000000b3','lcpv2-multi-lab',
        '42000000-0000-0000-0000-000000000012',NULL,'LCPV2 multi-lab proof',true,1,93)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.lcpv2_multi_lab_intake(
  _lesson_code text,
  _label text,
  _payload text,
  _instance_index integer,
  _instance_count integer,
  _instance_title text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql AS $proof$
DECLARE
  actor_id constant uuid := '10000000-0000-0000-0000-000000000003';
  source_hash text := public.cf11_text_sha256(_payload);
  created jsonb;
  intake_id uuid;
BEGIN
  created := public.lesson_component_create_intake_v2(
    _lesson_code,'labExperimentHtml',_label||'.html',
    actor_id::text||'/v2-multi-lab-proof/'||_label,
    source_hash,octet_length(convert_to(_payload,'UTF8')),'text/html',
    NULL,NULL,NULL,NULL,actor_id);
  intake_id := (created->>'intake_id')::uuid;
  PERFORM public.lesson_component_verify_intake_v2(
    intake_id,_payload,NULL,jsonb_build_object(
      'proof','PG17',
      'labExperiment',jsonb_build_object(
        'instanceIndex',_instance_index,
        'instanceCount',_instance_count,
        'instanceTitle',_instance_title
      )
    ),actor_id);
  RETURN intake_id;
END
$proof$;

SET ROLE authenticated;

DO $multi_lab_assert$
DECLARE
  existing_lesson constant uuid := '43000000-0000-0000-0000-0000000000b2';
  fresh_lesson constant uuid := '43000000-0000-0000-0000-0000000000b3';
  lab_one constant text := '<html dir="rtl"><body><script>window.one=true</script>LAB-ONE</body></html>';
  lab_two constant text := '<html dir="rtl"><body><script>window.two=true</script>LAB-TWO</body></html>';
  intake uuid;
  first_result jsonb;
  second_result jsonb;
  replay_result jsonb;
  retry_result jsonb;
  conflict_failed boolean:=false;
BEGIN
  -- Backwards compatibility: keep the already-published unsuffixed V1 row and append LAB-02.
  intake:=pg_temp.lcpv2_multi_lab_intake(
    'lcpv2-quran-lesson','legacy-add-second',lab_two,1,2,NULL);
  second_result:=public.lesson_component_publish_v2(intake,'lcpv2:legacy-add-second:publish');
  replay_result:=public.lesson_component_publish_v2(intake,'lcpv2:legacy-add-second:publish');
  IF second_result->>'resource_code'<>'LCPV2-QURAN-LESSON-LAB-02'
     OR coalesce((replay_result->>'idempotent')::boolean,false) IS NOT TRUE
     OR (replay_result->>'writes_performed')::integer<>0
     OR (SELECT count(*) FROM public.lesson_resources
          WHERE lesson_id=existing_lesson AND resource_type='experiment')<>2
     OR NOT EXISTS (SELECT 1 FROM public.lesson_resources
          WHERE lesson_id=existing_lesson AND resource_code='LCPV2-QURAN-LESSON-EXPERIMENT') THEN
    RAISE EXCEPTION 'LCPV2_MULTI_LAB_LEGACY_APPEND_OR_REPLAY_FAILED: % / %',
      second_result,replay_result;
  END IF;

  -- A fresh two-file intake materializes LAB-01 and LAB-02 with independent hashes/order.
  intake:=pg_temp.lcpv2_multi_lab_intake(
    'lcpv2-multi-lab','fresh-lab-one',lab_one,0,2,'تجربة الحديد');
  first_result:=public.lesson_component_publish_v2(intake,'lcpv2:fresh-lab-one:publish');
  intake:=pg_temp.lcpv2_multi_lab_intake(
    'lcpv2-multi-lab','fresh-lab-two',lab_two,1,2,NULL);
  second_result:=public.lesson_component_publish_v2(intake,'lcpv2:fresh-lab-two:publish');
  IF first_result->>'resource_code'<>'LCPV2-MULTI-LAB-LAB-01'
     OR second_result->>'resource_code'<>'LCPV2-MULTI-LAB-LAB-02'
     OR (SELECT count(*) FROM public.lesson_resources
          WHERE lesson_id=fresh_lesson AND resource_type='experiment')<>2
     OR (SELECT array_agg(resource_code ORDER BY sort_order) FROM public.lesson_resources
          WHERE lesson_id=fresh_lesson AND resource_type='experiment')
        IS DISTINCT FROM ARRAY['LCPV2-MULTI-LAB-LAB-01','LCPV2-MULTI-LAB-LAB-02']::text[]
     OR (SELECT count(DISTINCT metadata->>'cf11_body_sha256') FROM public.lesson_resources
          WHERE lesson_id=fresh_lesson AND resource_type='experiment')<>2 THEN
    RAISE EXCEPTION 'LCPV2_MULTI_LAB_FRESH_MATERIALIZATION_FAILED: % / %',
      first_result,second_result;
  END IF;

  -- A new intake with the same code+hash reuses the row; it never duplicates or updates it.
  intake:=pg_temp.lcpv2_multi_lab_intake(
    'lcpv2-multi-lab','fresh-lab-two-retry',lab_two,1,2,NULL);
  retry_result:=public.lesson_component_publish_v2(intake,'lcpv2:fresh-lab-two-retry:publish');
  IF coalesce((retry_result->>'resource_reused')::boolean,false) IS NOT TRUE
     OR (SELECT count(*) FROM public.lesson_resources
          WHERE lesson_id=fresh_lesson AND resource_type='experiment')<>2 THEN
    RAISE EXCEPTION 'LCPV2_MULTI_LAB_NEW_INTAKE_RETRY_DUPLICATED: %',retry_result;
  END IF;

  -- The same code with different bytes is an immutable conflict and leaves both rows intact.
  intake:=pg_temp.lcpv2_multi_lab_intake(
    'lcpv2-multi-lab','fresh-lab-two-conflict',
    '<html dir="rtl"><body>DIFFERENT</body></html>',1,2,NULL);
  BEGIN
    PERFORM public.lesson_component_publish_v2(intake,'lcpv2:fresh-lab-two-conflict:publish');
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE '%LCPV2_LAB_PUBLISHED_RESOURCE_IMMUTABLE_CONFLICT%' THEN RAISE; END IF;
    conflict_failed:=true;
  END;
  IF NOT conflict_failed OR (SELECT count(*) FROM public.lesson_resources
       WHERE lesson_id=fresh_lesson AND resource_type='experiment')<>2 THEN
    RAISE EXCEPTION 'LCPV2_MULTI_LAB_IMMUTABILITY_GUARD_FAILED';
  END IF;
END
$multi_lab_assert$;

RESET ROLE;
SELECT 'PASS_LESSON_COMPONENT_MULTIPLE_LAB_PG17' AS verdict;
