CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true),'')::uuid;
$$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('admin','teacher','content_editor','content_reviewer','student');
CREATE TABLE public.user_roles(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);

INSERT INTO auth.users(id) VALUES
 ('10000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002'),
 ('10000000-0000-0000-0000-000000000003'),
 ('10000000-0000-0000-0000-000000000004');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('10000000-0000-0000-0000-000000000001','content_editor'),
 ('10000000-0000-0000-0000-000000000002','content_reviewer'),
 ('10000000-0000-0000-0000-000000000003','admin'),
 ('10000000-0000-0000-0000-000000000004','student');

CREATE OR REPLACE FUNCTION public.cf04_assert(ok boolean, message text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF NOT ok THEN RAISE EXCEPTION 'CF04_ASSERT: %', message; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.cf04_assert(boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cf04_manifest(extra text DEFAULT '')
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
SELECT jsonb_build_object(
 'schema','tamkeen.golden-lesson-package.v1','profileId','GOLDEN_QURAN_V1',
 'packageCode','QURAN-G10-L01-PKG','revisionNote',extra,
 'identity',jsonb_build_object('gradeCode','GRADE-10','curriculumTrackCodes',jsonb_build_array('sanaa'),'subjectCode','QURAN-G10','lessonCode','QURAN-G10-L01','lessonSlug','quran-lesson','unitCode',NULL,'semester',1,'sortOrder',1),
 'capabilityOrder',jsonb_build_array('officialBookContent','tamkeenExplanationHtml','lessonSummaryHtml','mindMapHtml','labExperimentHtml','officialBookQuestions','selfTest'),
 'artifacts',jsonb_build_array(
   jsonb_build_object('capability','officialBookContent','applicability','REQUIRED','authority','OFFICIAL','sourcePath','official.json','sha256',repeat('a',64),'provenancePath','official.provenance.json'),
   jsonb_build_object('capability','tamkeenExplanationHtml','applicability','REQUIRED','authority','TAMKEEN','sourcePath','explanation.html','sha256',repeat('b',64),'provenancePath',NULL),
   jsonb_build_object('capability','lessonSummaryHtml','applicability','REQUIRED','authority','TAMKEEN','sourcePath','summary.html','sha256',repeat('c',64),'provenancePath',NULL),
   jsonb_build_object('capability','mindMapHtml','applicability','OPTIONAL','authority','TAMKEEN','sourcePath',NULL,'sha256',NULL,'provenancePath',NULL),
   jsonb_build_object('capability','labExperimentHtml','applicability','NA','authority','TAMKEEN','sourcePath',NULL,'sha256',NULL,'provenancePath',NULL),
   jsonb_build_object('capability','officialBookQuestions','applicability','REQUIRED','authority','OFFICIAL','sourcePath','questions.json','sha256',repeat('d',64),'provenancePath','questions.provenance.json'),
   jsonb_build_object('capability','selfTest','applicability','OPTIONAL','authority','TAMKEEN','sourcePath',NULL,'sha256',NULL,'provenancePath',NULL)
 ),
 'lifecycle',jsonb_build_object('initialStatus','DRAFT','allowDirectReady',false),
 'security',jsonb_build_object('productionApply',false,'publicPayloadContainsAnswers',false,'answersCompanionPath','answers.server-only.json','answersCompanionSha256',repeat('e',64),'htmlNetworkAccess','NONE')
);
$$;
GRANT EXECUTE ON FUNCTION public.cf04_manifest(text) TO authenticated;
