-- LESSON_COMPONENT_PUBLISHING_V2 — executable PostgreSQL 17 acceptance proof.
-- Runs only on the disposable Content Factory rehearsal database.

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', false);

INSERT INTO public.lessons(id, slug, subject_id, unit_id, title, is_free, semester, sort_order)
VALUES ('43000000-0000-0000-0000-0000000000b2','lcpv2-quran-lesson',
        '42000000-0000-0000-0000-000000000012',NULL,'LCPV2 Quran proof',true,1,92)
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE lcpv2_proof_intakes(label text PRIMARY KEY, intake_id uuid NOT NULL);
GRANT SELECT ON lcpv2_proof_intakes TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.lcpv2_verified_intake(
  _label text, _capability text, _payload text, _answers jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $proof$
DECLARE
  actor_id constant uuid := '10000000-0000-0000-0000-000000000003';
  source_hash text := public.cf11_text_sha256(_payload);
  answer_text text := CASE WHEN _answers IS NULL THEN NULL ELSE _answers::text END;
  answer_hash text := CASE WHEN _answers IS NULL THEN NULL ELSE public.cf11_text_sha256(_answers::text) END;
  created jsonb;
  intake_id uuid;
BEGIN
  created := public.lesson_component_create_intake_v2(
    'lcpv2-quran-lesson', _capability,
    _label || CASE WHEN _capability IN ('officialBookQuestions','selfTest') THEN '.json' ELSE '.html' END,
    actor_id::text || '/v2-proof/' || _label,
    source_hash, octet_length(convert_to(_payload,'UTF8')),
    CASE WHEN _capability IN ('officialBookQuestions','selfTest')
      THEN 'application/json' ELSE 'text/html' END,
    CASE WHEN _answers IS NULL THEN NULL ELSE _label || '.answers.json' END,
    CASE WHEN _answers IS NULL THEN NULL ELSE actor_id::text || '/v2-proof/' || _label || '.answers' END,
    answer_hash,
    CASE WHEN answer_text IS NULL THEN NULL ELSE octet_length(convert_to(answer_text,'UTF8')) END,
    actor_id);
  intake_id := (created->>'intake_id')::uuid;
  PERFORM public.lesson_component_verify_intake_v2(
    intake_id,_payload,_answers,jsonb_build_object('proof','PG17'),actor_id);
  INSERT INTO lcpv2_proof_intakes VALUES (_label,intake_id);
  RETURN intake_id;
END
$proof$;

SELECT pg_temp.lcpv2_verified_intake(
  'book-a','officialBookContent','<html dir="rtl"><body>BOOK-A</body></html>');
SELECT pg_temp.lcpv2_verified_intake(
  'book-b','officialBookContent','<html dir="rtl"><body>BOOK-B</body></html>');
SELECT pg_temp.lcpv2_verified_intake(
  'book-a2','officialBookContent','<html dir="rtl"><body>BOOK-A</body></html>');
SELECT pg_temp.lcpv2_verified_intake(
  'explanation','tamkeenExplanationHtml','<html dir="rtl"><body>EXPLANATION</body></html>');
SELECT pg_temp.lcpv2_verified_intake(
  'summary','lessonSummaryHtml','<html dir="rtl"><body>SUMMARY</body></html>');
SELECT pg_temp.lcpv2_verified_intake(
  'mindmap','mindMapHtml','<html dir="rtl"><body><button onclick="window.opened=true">MIND</button><script>window.ready=true</script></body></html>');
SELECT pg_temp.lcpv2_verified_intake(
  'lab','labExperimentHtml','<html dir="rtl"><body><button onclick="window.done=true">LAB</button><script>window.lab=true</script></body></html>');
SELECT pg_temp.lcpv2_verified_intake(
  'official-questions','officialBookQuestions',
  '{"questions":[{"id":"O1","question_code":"O1","question":"Official question","question_text":"Official question","interaction_type":"LONG_TEXT","question_type":"EXTENDED_RESPONSE","type":"extended_response","options":[]}]}',
  '{"reveal":"SERVER_CONTROLLED_REVEAL_ONLY","answers":[{"capability":"officialBookQuestions","question_id":"O1","grading_mode":"MANUAL","model_answer":"Model answer","explanation":"Explanation"}]}'::jsonb);
SELECT pg_temp.lcpv2_verified_intake(
  'self-test','selfTest',
  '{"questions":[{"id":"S1","question_code":"S1","question":"Self test","question_text":"Self test","type":"multiple_choice","options":["one","two","three","four"]}]}',
  '{"reveal":"SERVER_CONTROLLED_REVEAL_ONLY","answers":[{"capability":"selfTest","question_id":"S1","correct_index":2,"correct_option":"(b)","explanation":"Because two","rationale":"Because two"}]}'::jsonb);

-- An UPLOADING intake must fail without writing or hiding the already-live content.
DO $setup_unverified$
DECLARE r jsonb;
BEGIN
  r := public.lesson_component_create_intake_v2(
    'lcpv2-quran-lesson','lessonSummaryHtml','unverified.html',
    '10000000-0000-0000-0000-000000000003/v2-proof/unverified',repeat('f',64),10,
    'text/html',NULL,NULL,NULL,NULL,'10000000-0000-0000-0000-000000000003');
  INSERT INTO lcpv2_proof_intakes VALUES ('unverified',(r->>'intake_id')::uuid);
END
$setup_unverified$;

SET ROLE authenticated;

DO $publish_and_assert$
DECLARE
  lesson_id constant uuid := '43000000-0000-0000-0000-0000000000b2';
  intake uuid;
  first_result jsonb;
  replay_result jsonb;
  result_b jsonb;
  result_a2 jsonb;
  unverified_failed boolean := false;
  ready_caps text[];
BEGIN
  SELECT intake_id INTO intake FROM lcpv2_proof_intakes WHERE label='book-a';
  first_result := public.lesson_component_publish_v2(intake,'lcpv2:book-a:publish');
  replay_result := public.lesson_component_publish_v2(intake,'lcpv2:book-a:publish');
  IF coalesce((first_result->>'idempotent')::boolean,true)
     OR coalesce((replay_result->>'idempotent')::boolean,false) IS NOT TRUE
     OR (replay_result->>'writes_performed')::integer <> 0 THEN
    RAISE EXCEPTION 'LCPV2_REPLAY_NOT_IDEMPOTENT: first=% replay=%',first_result,replay_result;
  END IF;

  FOR intake IN SELECT i.intake_id FROM lcpv2_proof_intakes i
    WHERE i.label IN ('explanation','summary','mindmap','lab','official-questions','self-test')
    ORDER BY i.label
  LOOP
    PERFORM public.lesson_component_publish_v2(intake,'lcpv2:'||intake::text||':publish');
  END LOOP;

  BEGIN
    SELECT intake_id INTO intake FROM lcpv2_proof_intakes WHERE label='unverified';
    PERFORM public.lesson_component_publish_v2(intake,'lcpv2:unverified:publish');
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%LCPV2_INTAKE_NOT_VERIFIED%' THEN RAISE; END IF;
    unverified_failed := true;
  END;
  IF NOT unverified_failed THEN RAISE EXCEPTION 'LCPV2_UNVERIFIED_WAS_PUBLISHED'; END IF;

  SELECT intake_id INTO intake FROM lcpv2_proof_intakes WHERE label='book-b';
  result_b := public.lesson_component_publish_v2(intake,'lcpv2:book-b:publish');
  SELECT intake_id INTO intake FROM lcpv2_proof_intakes WHERE label='book-a2';
  result_a2 := public.lesson_component_publish_v2(intake,'lcpv2:book-a2:publish');
  IF (first_result->>'publication_version')::integer <> 1
     OR (result_b->>'publication_version')::integer <> 2
     OR (result_a2->>'publication_version')::integer <> 3 THEN
    RAISE EXCEPTION 'LCPV2_ABA_VERSIONING_FAILED: % / % / %',first_result,result_b,result_a2;
  END IF;

  IF (SELECT content FROM public.lesson_book_contents WHERE lesson_id=lesson_id)
       <> '<html dir="rtl"><body>BOOK-A</body></html>' THEN
    RAISE EXCEPTION 'LCPV2_ABA_LIVE_BODY_WRONG';
  END IF;
  IF (SELECT count(*) FROM public.lesson_component_publications_v2
       WHERE lesson_id=lesson_id AND capability='officialBookContent') <> 3 THEN
    RAISE EXCEPTION 'LCPV2_ABA_LEDGER_COUNT_WRONG';
  END IF;
  IF (SELECT count(*) FROM public.lesson_capability_lifecycle
       WHERE lesson_id=lesson_id AND status='READY' AND applicability='OPTIONAL') <> 7 THEN
    RAISE EXCEPTION 'LCPV2_SEVEN_READY_OPTIONAL_ROWS_MISSING';
  END IF;
  IF (SELECT count(*) FROM public.lesson_capability_lifecycle
       WHERE lesson_id=lesson_id AND applicability='REQUIRED') <> 0 THEN
    RAISE EXCEPTION 'LCPV2_REQUIRED_ROW_MANUFACTURED';
  END IF;
  SELECT ready_capabilities INTO ready_caps FROM public.lesson_student_content_gate(lesson_id);
  IF cardinality(ready_caps) <> 7 THEN
    RAISE EXCEPTION 'LCPV2_STUDENT_GATE_NOT_SEVEN: %',ready_caps;
  END IF;
  IF (SELECT count(*) FROM public.questions q JOIN public.question_revisions r
        ON r.id=q.current_published_revision_id
       WHERE q.lesson_id=lesson_id AND r.status='PUBLISHED') <> 2 THEN
    RAISE EXCEPTION 'LCPV2_QUESTION_COMPONENTS_NOT_PUBLISHED';
  END IF;
  IF (SELECT count(*) FROM public.assessment_questions aq
       JOIN public.lesson_assessments a ON a.id=aq.assessment_id
       WHERE a.lesson_id=lesson_id) <> 1 THEN
    RAISE EXCEPTION 'LCPV2_SELF_TEST_MEMBERSHIP_WRONG';
  END IF;
END
$publish_and_assert$;

RESET ROLE;

DO $security_assert$
BEGIN
  IF has_table_privilege('authenticated','public.lesson_component_intakes_v2','SELECT')
     OR has_table_privilege('authenticated','public.lesson_component_publications_v2','INSERT') THEN
    RAISE EXCEPTION 'LCPV2_PRIVATE_TABLE_EXPOSED';
  END IF;
  IF has_function_privilege('authenticated',
       'public.golden_lesson_publish_component(uuid,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'LCPV2_OLD_PUBLISHER_NOT_RETIRED';
  END IF;
  IF NOT has_function_privilege('authenticated',
       'public.lesson_component_publish_v2(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'LCPV2_NEW_PUBLISHER_NOT_CALLABLE';
  END IF;
END
$security_assert$;

SELECT 'PASS_LESSON_COMPONENT_PUBLISHING_V2_PG17' AS verdict;
