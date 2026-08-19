-- CF10 PG17 fixture: minimal domain surface matching production natural keys.
ALTER TABLE public.lessons ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.lessons ADD COLUMN title text NOT NULL DEFAULT 'درس';
ALTER TABLE public.lessons ADD COLUMN is_free boolean DEFAULT false;
ALTER TABLE public.lessons ADD COLUMN semester integer;
ALTER TABLE public.lessons ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.lessons ADD CONSTRAINT lessons_subject_id_slug_key UNIQUE (subject_id, slug);

CREATE TABLE public.lesson_book_contents(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL UNIQUE REFERENCES public.lessons(id),
  content text, pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.lesson_explanations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id),
  title text, content text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
  explanation_code text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX lesson_explanations_code_lesson_uniq
  ON public.lesson_explanations(lesson_id, explanation_code) WHERE explanation_code IS NOT NULL;

CREATE TABLE public.lesson_summaries(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL UNIQUE REFERENCES public.lessons(id),
  summary text NOT NULL, key_points jsonb NOT NULL DEFAULT '[]'::jsonb, study_tip text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TYPE public.lesson_resource_type AS ENUM ('video','mindmap','experiment','pdf','link');
CREATE TABLE public.lesson_resources(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id),
  resource_type public.lesson_resource_type NOT NULL, title text NOT NULL, url text NOT NULL,
  description text, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  resource_code text, html_resource_type text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_primary boolean NOT NULL DEFAULT false);
CREATE UNIQUE INDEX idx_lesson_resources_code_per_lesson
  ON public.lesson_resources(lesson_id, resource_code) WHERE resource_code IS NOT NULL;

CREATE TABLE public.questions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid REFERENCES public.lessons(id), subject_id uuid REFERENCES public.subjects(id),
  question_text text NOT NULL, options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_index integer NOT NULL, explanation text, question_type text, year integer,
  sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  unit text, semester integer, code text, created_by uuid,
  archived_at timestamptz, archived_by uuid, current_published_revision_id uuid);
CREATE UNIQUE INDEX questions_code_uniq ON public.questions(code) WHERE code IS NOT NULL;

CREATE TABLE public.question_revisions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id),
  revision_number integer NOT NULL, status text NOT NULL, interaction_type text NOT NULL,
  question_text text NOT NULL, max_score numeric NOT NULL DEFAULT 1,
  allow_partial boolean NOT NULL DEFAULT false, requires_media boolean NOT NULL DEFAULT false,
  manual_grading_required boolean NOT NULL DEFAULT false, payload_hash text,
  payload_hash_version text NOT NULL DEFAULT 'v1', created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, published_at timestamptz, published_by uuid,
  UNIQUE (question_id, revision_number));

CREATE TABLE public.question_options(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id),
  option_code text NOT NULL, body text NOT NULL, sort_order integer NOT NULL,
  is_correct boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_revision_id, option_code), UNIQUE (question_revision_id, sort_order));

CREATE TABLE public.official_question_answers(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id),
  revision_id uuid NOT NULL REFERENCES public.question_revisions(id),
  model_answer text, explanation text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, revision_id));

CREATE TABLE public.question_option_rationales(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id),
  option_id text NOT NULL, why_correct text, why_wrong text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_revision_id, option_id));

CREATE TABLE public.lesson_assessments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id), title text NOT NULL,
  instructions text, sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), assessment_code text);
CREATE UNIQUE INDEX lesson_assessments_code_uniq
  ON public.lesson_assessments(assessment_code) WHERE assessment_code IS NOT NULL;

CREATE TABLE public.assessment_questions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.lesson_assessments(id),
  question_id uuid NOT NULL REFERENCES public.questions(id),
  sort_order integer NOT NULL DEFAULT 0, points numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (assessment_id, question_id));

CREATE TYPE public.capability_applicability AS ENUM ('REQUIRED','OPTIONAL','NA');
CREATE TABLE public.lesson_capability_lifecycle(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id), capability text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT', ready_snapshot jsonb, ready_hash text,
  draft_hash text, draft_updated_at timestamptz, reviewed_by uuid, reviewed_at timestamptz,
  ready_by uuid, ready_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), evidence_origin text, retirement_origin text,
  applicability public.capability_applicability NOT NULL DEFAULT 'REQUIRED',
  UNIQUE (lesson_id, capability));

-- Rich second package: exercises lesson creation, questions, options, answers, rationales, resources.
CREATE OR REPLACE FUNCTION public.cf10_manifest() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
SELECT jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
 jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
  jsonb_set(public.cf04_manifest('cf10'),'{packageCode}','"QURAN-G10-L04-PKG"'),
  '{profileId}','"GOLDEN_CHEMISTRY_V1"'),
  '{identity,lessonSlug}','"quran-lesson-04"'),
  '{identity,lessonCode}','"QURAN-G10-L04"'),
  '{identity,lessonTitle}','"الدرس الرابع"'),
  '{artifacts,0,sha256}',to_jsonb(public.cf08_sha('official-04'))),
  '{artifacts,0,provenanceSha256}',to_jsonb(public.cf08_sha('official-source-04'))),
  '{artifacts,1,sha256}',to_jsonb(public.cf08_sha('<p>explanation-04</p>'))),
  '{artifacts,2,sha256}',to_jsonb(public.cf08_sha('<p>summary-04</p>'))),
  '{artifacts,3,applicability}','"REQUIRED"'),
  '{artifacts,3,sourcePath}','"mindmap.html"'),
  '{artifacts,3,sha256}',to_jsonb(public.cf08_sha('<p>mindmap-04</p>'))),
  '{artifacts,4,applicability}','"OPTIONAL"'),
  '{artifacts,4,sourcePath}','"lab.html"'),
  '{artifacts,4,sha256}',to_jsonb(public.cf08_sha('<p>lab-04</p>'))),
  '{artifacts,5,sha256}',to_jsonb(public.cf08_sha('{"questions":[{"question_number":"7","official_text":"Q7","question_type":"SHORT_ANSWER"}]}'))),
  '{artifacts,5,provenanceSha256}',to_jsonb(public.cf08_sha('questions-source-04'))),
  '{artifacts,6,applicability}','"REQUIRED"'),
  '{artifacts,6,sourcePath}','"self-test.json"'),
  '{artifacts,6,sha256}',to_jsonb(public.cf08_sha('{"questions":[{"id":"s1","question":"SQ1","type":"multiple_choice","options":["a1","a2"],"source_row":2}]}'))),
  '{security,answersCompanionSha256}',to_jsonb(public.cf08_sha('{"answers":[{"question_id":"s1","correct_option":"(b)","rationale":"why"}]}')));
$$;

CREATE OR REPLACE FUNCTION public.cf10_entry(cap text, lifecycle text, target text, authority text, path text, body text, prov text, prov_body text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
SELECT jsonb_build_object('capability',cap,'lifecycleCapability',lifecycle,'targetPlan',target,
 'applicability','REQUIRED','authority',authority,'sourcePath',path,'sourceSha256',public.cf08_sha(body),
 'sourceBase64',encode(convert_to(body,'UTF8'),'base64'),'provenancePath',prov,
 'provenanceSha256',CASE WHEN prov IS NULL THEN NULL ELSE public.cf08_sha(prov_body) END,
 'provenanceBase64',CASE WHEN prov IS NULL THEN NULL ELSE encode(convert_to(prov_body,'UTF8'),'base64') END);
$$;

CREATE OR REPLACE FUNCTION public.cf10_entries() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
SELECT jsonb_build_array(
 public.cf10_entry('officialBookContent','officialBookContent','lesson_book_contents','OFFICIAL','official.json','official-04','official.provenance.json','official-source-04'),
 public.cf10_entry('tamkeenExplanationHtml','tamkeenExplanation','lesson_explanations','TAMKEEN','explanation.html','<p>explanation-04</p>',NULL,NULL),
 public.cf10_entry('lessonSummaryHtml','quickReview','lesson_summaries','TAMKEEN','summary.html','<p>summary-04</p>',NULL,NULL),
 public.cf10_entry('mindMapHtml','mindMap','lesson_resources:mindmap','TAMKEEN','mindmap.html','<p>mindmap-04</p>',NULL,NULL),
 jsonb_set(public.cf10_entry('labExperimentHtml','simulation','lesson_resources:experiment','TAMKEEN','lab.html','<p>lab-04</p>',NULL,NULL),'{applicability}','"OPTIONAL"'),
 public.cf10_entry('officialBookQuestions','checkUnderstanding','questions:official','OFFICIAL','questions.json','{"questions":[{"question_number":"7","official_text":"Q7","question_type":"SHORT_ANSWER"}]}','questions.provenance.json','questions-source-04'),
 public.cf10_entry('selfTest','lessonAssessment','lesson_assessments:self_test','TAMKEEN','self-test.json','{"questions":[{"id":"s1","question":"SQ1","type":"multiple_choice","options":["a1","a2"],"source_row":2}]}',NULL,NULL));
$$;

SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT public.golden_lesson_stage_manifest(public.cf10_manifest(),repeat('a',64)); RESET ROLE;
SET ROLE service_role;
SELECT public.golden_lesson_attest_bundle(
 (SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L04-PKG'),1,
 '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000004.zip',
 repeat('c',64),7,2048,4096); RESET ROLE;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT public.golden_lesson_advance_review((SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L04-PKG'),1,'SUBMITTED','{"packageValidationPassed":true}',NULL);
RESET ROLE; SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000002'; SET ROLE authenticated;
SELECT public.golden_lesson_advance_review((SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L04-PKG'),1,'CONTENT_APPROVED','{"officialProvenanceChecked":true,"answerSeparationChecked":true}',NULL);
RESET ROLE; SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000003'; SET ROLE authenticated;
SELECT public.golden_lesson_advance_review((SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L04-PKG'),1,'APPROVED_FOR_STAGING','{"responsivePreviewChecked":true}',NULL);
RESET ROLE; RESET request.jwt.claim.sub;
SET ROLE service_role;
SELECT public.golden_lesson_stage_domain_bundle(
 (SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L04-PKG'),1,
 '10000000-0000-0000-0000-000000000003',repeat('c',64),public.cf10_entries(),
 jsonb_build_object('path','answers.server-only.json','sha256',public.cf08_sha('{"answers":[{"question_id":"s1","correct_option":"(b)","rationale":"why"}]}'),
 'base64',encode(convert_to('{"answers":[{"question_id":"s1","correct_option":"(b)","rationale":"why"}]}','UTF8'),'base64')));
RESET ROLE;
