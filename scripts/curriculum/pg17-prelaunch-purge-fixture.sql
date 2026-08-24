CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid, action text NOT NULL,
  target_type text NOT NULL, target_id uuid, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.grades (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.tracks (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.curriculum_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), track_code text NOT NULL UNIQUE
);
CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), grade_id uuid,
  code text, name text NOT NULL DEFAULT 'fixture subject', sort_order integer NOT NULL DEFAULT 1
);
CREATE TABLE public.subject_curriculum_tracks (
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  curriculum_track_id uuid NOT NULL REFERENCES public.curriculum_tracks(id) ON DELETE RESTRICT,
  PRIMARY KEY(subject_id, curriculum_track_id)
);
CREATE TABLE public.subject_textbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  storage_path text NOT NULL
);
CREATE TABLE public.certificates (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.content_review_state (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.textbooks (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.import_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.import_staging_rows (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.units (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.lessons (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), current_published_revision_id uuid
);
CREATE TABLE public.question_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'PUBLISHED', interaction_type text, grading_mode text,
  educational_label text, question_text text, stimulus_text text, max_score numeric,
  allow_partial boolean, requires_media boolean, manual_grading_required boolean,
  payload_hash text, payload_hash_version text, source_payload_hash text,
  backfill_version text, revision_number integer, published_at timestamptz,
  published_by uuid, superseded_at timestamptz
);

CREATE TABLE public.lesson_book_contents (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.lesson_explanations (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.lesson_summaries (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.lesson_resources (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.lesson_simulations (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.lesson_assessments (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.lesson_capability_lifecycle (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.lesson_comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.lesson_question_notes (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.assessment_questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

CREATE TABLE public.question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_revision_id uuid
);
CREATE TABLE public.question_option_rationales (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.official_question_answers (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.question_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision_id uuid
);
CREATE TABLE public.question_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_revision_id uuid
);
CREATE TABLE public.question_solutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_revision_id uuid
);
CREATE TABLE public.question_solution_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), solution_id uuid
);
CREATE TABLE public.question_accepted_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_revision_id uuid
);
CREATE TABLE public.question_response_reviews (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

CREATE TABLE public.user_progress (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.exam_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.exam_session_questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.exam_session_answers (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.practice_attempts (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.practice_attempt_questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.practice_attempt_responses (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.unit_practice_attempts (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.exam_template_questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.exam_templates (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.ministerial_exam_questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.ministerial_exam_models (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

CREATE TABLE public.golden_lesson_packages (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.golden_lesson_package_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.golden_lesson_package_reviews (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.golden_lesson_domain_stage_batches (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.golden_lesson_domain_stage_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.golden_lesson_domain_stage_answers (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.golden_lesson_identity_bindings (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.golden_lesson_identity_rebindings (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.golden_lesson_domain_materializations (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.golden_lesson_asset_attestations (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.golden_lesson_publications (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.golden_lesson_published_assets (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.golden_lesson_ready_attestations (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.golden_lesson_ready_revocations (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

CREATE OR REPLACE FUNCTION public.is_full_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $$ SELECT _user_id = '11111111-1111-4111-8111-111111111111'::uuid $$;

CREATE OR REPLACE FUNCTION public.admin_curriculum_force_delete(text, uuid, text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb $$;

INSERT INTO auth.users(id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

INSERT INTO public.grades(id) VALUES ('55555555-5555-4555-8555-555555555555');
INSERT INTO public.curriculum_tracks(id, track_code)
VALUES ('66666666-6666-4666-8666-666666666666', 'sanaa');
INSERT INTO public.subjects(id, grade_id, code, name)
VALUES (
  '77777777-7777-4777-8777-777777777777',
  '55555555-5555-4555-8555-555555555555',
  'fixture-subject',
  'مادة تجريبية'
);
INSERT INTO public.subject_curriculum_tracks(subject_id, curriculum_track_id)
VALUES (
  '77777777-7777-4777-8777-777777777777',
  '66666666-6666-4666-8666-666666666666'
);
INSERT INTO public.subject_textbooks(subject_id, storage_path)
VALUES (
  '77777777-7777-4777-8777-777777777777',
  'subject-textbooks/77777777-7777-4777-8777-777777777777/fixture.pdf'
);
INSERT INTO public.certificates DEFAULT VALUES;
INSERT INTO public.content_review_state DEFAULT VALUES;
INSERT INTO public.tracks DEFAULT VALUES;
INSERT INTO public.textbooks DEFAULT VALUES;
INSERT INTO public.import_jobs DEFAULT VALUES;
INSERT INTO public.import_staging_rows DEFAULT VALUES;
INSERT INTO public.exam_templates DEFAULT VALUES;
INSERT INTO public.ministerial_exam_models DEFAULT VALUES;
INSERT INTO public.audit_logs(actor_id,action,target_type,metadata)
VALUES ('11111111-1111-4111-8111-111111111111','fixture','fixture','{}');

INSERT INTO public.units DEFAULT VALUES;
INSERT INTO public.lessons DEFAULT VALUES;
INSERT INTO public.questions(id, current_published_revision_id)
VALUES ('33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444');
INSERT INTO public.question_revisions(id, question_id, status)
VALUES ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', 'PUBLISHED');

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'lesson_book_contents','lesson_explanations','lesson_summaries','lesson_resources',
    'lesson_simulations','lesson_assessments','lesson_capability_lifecycle','lesson_comments',
    'lesson_question_notes','assessment_questions','question_options',
    'question_option_rationales','official_question_answers','question_targets',
    'question_media','question_solutions','question_solution_steps','question_accepted_answers',
    'question_response_reviews','user_progress','exam_sessions','exam_session_questions',
    'exam_session_answers','practice_attempts','practice_attempt_questions',
    'practice_attempt_responses','unit_practice_attempts','exam_template_questions',
    'ministerial_exam_questions','golden_lesson_packages','golden_lesson_package_versions',
    'golden_lesson_package_reviews','golden_lesson_domain_stage_batches',
    'golden_lesson_domain_stage_entries','golden_lesson_domain_stage_answers',
    'golden_lesson_identity_bindings','golden_lesson_identity_rebindings',
    'golden_lesson_domain_materializations','golden_lesson_asset_attestations',
    'golden_lesson_publications','golden_lesson_published_assets',
    'golden_lesson_ready_attestations','golden_lesson_ready_revocations'
  ] LOOP
    EXECUTE format('INSERT INTO public.%I DEFAULT VALUES', t);
  END LOOP;
END $$;
