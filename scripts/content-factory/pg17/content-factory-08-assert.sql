CREATE OR REPLACE FUNCTION public.cf08_sha(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT encode(digest(convert_to(value,'UTF8'),'sha256'),'hex') $$;

CREATE OR REPLACE FUNCTION public.cf08_manifest() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
SELECT jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
  jsonb_set(public.cf04_manifest('cf08'),'{packageCode}','"QURAN-G10-L03-PKG"'),
  '{artifacts,0,sha256}',to_jsonb(public.cf08_sha('official'))),
  '{artifacts,0,provenanceSha256}',to_jsonb(public.cf08_sha('official-source'))),
  '{artifacts,1,sha256}',to_jsonb(public.cf08_sha('<p>explanation</p>'))),
  '{artifacts,2,sha256}',to_jsonb(public.cf08_sha('<p>summary</p>'))),
  '{artifacts,5,sha256}',to_jsonb(public.cf08_sha('[]'))),
  '{artifacts,5,provenanceSha256}',to_jsonb(public.cf08_sha('questions-source'))),
  '{security,answersCompanionSha256}',to_jsonb(public.cf08_sha('{"answers":[]}')));
$$;

CREATE OR REPLACE FUNCTION public.cf08_entries(bad boolean DEFAULT false) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
SELECT jsonb_build_array(
 jsonb_build_object('capability','officialBookContent','lifecycleCapability','officialBookContent','targetPlan','lesson_book_contents','applicability','REQUIRED','authority','OFFICIAL','sourcePath','official.json','sourceSha256',public.cf08_sha('official'),'sourceBase64',encode(convert_to(CASE WHEN bad THEN 'tampered' ELSE 'official' END,'UTF8'),'base64'),'provenancePath','official.provenance.json','provenanceSha256',public.cf08_sha('official-source'),'provenanceBase64',encode(convert_to('official-source','UTF8'),'base64')),
 jsonb_build_object('capability','tamkeenExplanationHtml','lifecycleCapability','tamkeenExplanation','targetPlan','lesson_explanations','applicability','REQUIRED','authority','TAMKEEN','sourcePath','explanation.html','sourceSha256',public.cf08_sha('<p>explanation</p>'),'sourceBase64',encode(convert_to('<p>explanation</p>','UTF8'),'base64'),'provenancePath',NULL,'provenanceSha256',NULL,'provenanceBase64',NULL),
 jsonb_build_object('capability','lessonSummaryHtml','lifecycleCapability','quickReview','targetPlan','lesson_summaries','applicability','REQUIRED','authority','TAMKEEN','sourcePath','summary.html','sourceSha256',public.cf08_sha('<p>summary</p>'),'sourceBase64',encode(convert_to('<p>summary</p>','UTF8'),'base64'),'provenancePath',NULL,'provenanceSha256',NULL,'provenanceBase64',NULL),
 jsonb_build_object('capability','mindMapHtml','lifecycleCapability','mindMap','targetPlan','lesson_resources:mindmap','applicability','OPTIONAL','authority','TAMKEEN','sourcePath',NULL,'sourceSha256',NULL,'sourceBase64',NULL,'provenancePath',NULL,'provenanceSha256',NULL,'provenanceBase64',NULL),
 jsonb_build_object('capability','labExperimentHtml','lifecycleCapability','simulation','targetPlan','lesson_resources:experiment','applicability','NA','authority','TAMKEEN','sourcePath',NULL,'sourceSha256',NULL,'sourceBase64',NULL,'provenancePath',NULL,'provenanceSha256',NULL,'provenanceBase64',NULL),
 jsonb_build_object('capability','officialBookQuestions','lifecycleCapability','checkUnderstanding','targetPlan','questions:official','applicability','REQUIRED','authority','OFFICIAL','sourcePath','questions.json','sourceSha256',public.cf08_sha('[]'),'sourceBase64',encode(convert_to('[]','UTF8'),'base64'),'provenancePath','questions.provenance.json','provenanceSha256',public.cf08_sha('questions-source'),'provenanceBase64',encode(convert_to('questions-source','UTF8'),'base64')),
 jsonb_build_object('capability','selfTest','lifecycleCapability','lessonAssessment','targetPlan','lesson_assessments:self_test','applicability','OPTIONAL','authority','TAMKEEN','sourcePath',NULL,'sourceSha256',NULL,'sourceBase64',NULL,'provenancePath',NULL,'provenanceSha256',NULL,'provenanceBase64',NULL)
); $$;

SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT public.golden_lesson_stage_manifest(public.cf08_manifest(),repeat('a',64)); RESET ROLE;
SET ROLE service_role;
SELECT public.golden_lesson_attest_bundle(
 (SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L03-PKG'),1,
 '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001.zip',
 repeat('b',64),7,2048,4096); RESET ROLE;

SET ROLE authenticated;
SELECT public.golden_lesson_advance_review((SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L03-PKG'),1,'SUBMITTED','{"packageValidationPassed":true}',NULL);
RESET ROLE; SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000002'; SET ROLE authenticated;
SELECT public.golden_lesson_advance_review((SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L03-PKG'),1,'CONTENT_APPROVED','{"officialProvenanceChecked":true,"answerSeparationChecked":true}',NULL);
RESET ROLE; SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000003'; SET ROLE authenticated;
SELECT public.golden_lesson_advance_review((SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L03-PKG'),1,'APPROVED_FOR_STAGING','{"responsivePreviewChecked":true}',NULL);
RESET ROLE;

DO $$ DECLARE pkg uuid; BEGIN
 SELECT id INTO pkg FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L03-PKG';
 BEGIN
  PERFORM public.golden_lesson_stage_domain_bundle(pkg,1,'10000000-0000-0000-0000-000000000003',repeat('b',64),public.cf08_entries(true),jsonb_build_object('path','answers.server-only.json','sha256',public.cf08_sha('{"answers":[]}'),'base64',encode(convert_to('{"answers":[]}','UTF8'),'base64')));
  RAISE EXCEPTION 'CF08_EXPECTED_HASH_REJECTION';
 EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE '%DOMAIN_STAGE_PAYLOAD_HASH_MISMATCH%' THEN RAISE; END IF; END;
 PERFORM public.cf04_assert(NOT EXISTS (SELECT 1 FROM public.golden_lesson_domain_stage_batches WHERE package_id=pkg),'failed batch rolled back atomically');
END $$;

SET ROLE service_role;
SELECT public.golden_lesson_stage_domain_bundle(
 (SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L03-PKG'),1,
 '10000000-0000-0000-0000-000000000003',repeat('b',64),public.cf08_entries(false),
 jsonb_build_object('path','answers.server-only.json','sha256',public.cf08_sha('{"answers":[]}'),'base64',encode(convert_to('{"answers":[]}','UTF8'),'base64')));
SELECT public.golden_lesson_stage_domain_bundle(
 (SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L03-PKG'),1,
 '10000000-0000-0000-0000-000000000003',repeat('b',64),public.cf08_entries(false),
 jsonb_build_object('path','answers.server-only.json','sha256',public.cf08_sha('{"answers":[]}'),'base64',encode(convert_to('{"answers":[]}','UTF8'),'base64')));
RESET ROLE;

SELECT public.cf04_assert((SELECT count(*)=1 FROM public.golden_lesson_domain_stage_batches),'one immutable batch');
SELECT public.cf04_assert((SELECT count(*)=7 FROM public.golden_lesson_domain_stage_entries),'exact seven capability entries');
SELECT public.cf04_assert((SELECT count(*)=1 FROM public.golden_lesson_domain_stage_answers),'one isolated answers companion');
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.golden_lesson_domain_stage_entries WHERE source_payload IS NOT NULL AND encode(digest(source_payload,'sha256'),'hex')<>source_sha256),'all staged bytes hash pinned');
SELECT public.cf04_assert(NOT has_function_privilege('authenticated','public.golden_lesson_stage_domain_bundle(uuid,integer,uuid,text,jsonb,jsonb)','EXECUTE'),'authenticated cannot call atomic stage RPC');

SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000004'; SET ROLE authenticated;
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.golden_lesson_domain_stage_answers),'student sees zero answer staging rows');
RESET ROLE; RESET request.jwt.claim.sub;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000002'; SET ROLE authenticated;
SELECT public.cf04_assert((SELECT count(*)=0 FROM public.golden_lesson_domain_stage_answers),'content manager sees zero answer staging rows');
RESET ROLE; RESET request.jwt.claim.sub;
SELECT 'PASS_CONTENT_FACTORY_08_PG17' AS verdict;
