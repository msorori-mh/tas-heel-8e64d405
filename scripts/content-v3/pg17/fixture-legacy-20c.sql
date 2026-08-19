-- PG17 rehearsal fixture — reproduces the MEASURED production legacy 20C state.
--
-- Measured on production (read-only, 2026-08-19):
--   READY rows total ............ 104
--   officialBookContent ......... 21   (source present: 21/21)
--   tamkeenExplanation .......... 40   (source present: 40/40, 1 row has ready_by)
--   originalBookPdf ............. 40   (pdf resource present: 40/40)
--   quickReview ................. 1    (has ready_by)
--   checkUnderstanding .......... 1
--   lessonAssessment ............ 1
--   rows with ready_snapshot .... 0
--   rows with ready_hash ........ 0
--   rows with ready_by .......... 2
--   rows in student-visible lessons . 104/104
--
-- The fixture adds one extra UNRECONCILABLE row (source content deleted) that
-- does NOT exist in production, so the NEEDS_MANUAL_REVIEW branch is exercised.

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;

\i :schema_file

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=_user_id AND r.role=_role)
  $$;
CREATE OR REPLACE FUNCTION public.is_content_staff(_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT public.has_role(_user_id,'admin') OR public.has_role(_user_id,'content_manager')
  $$;
CREATE OR REPLACE FUNCTION public.can_access_subject(_subject_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT auth.uid() IS NOT NULL AND (
      public.has_role(auth.uid(),'admin')
      OR EXISTS (
        SELECT 1 FROM public.subjects s
          JOIN public.profiles p ON p.user_id = auth.uid()
          JOIN public.subject_curriculum_tracks sct
            ON sct.subject_id = s.id AND sct.is_active
           AND sct.curriculum_track_id = p.curriculum_track_id
         WHERE s.id = _subject_id
           AND (p.grade_uuid = s.grade_id OR p.grade_id = s.grade_id::text)))
  $$;
CREATE OR REPLACE FUNCTION public.can_access_lesson(_lesson_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.lessons l
       WHERE l.id=_lesson_id AND public.can_access_subject(l.subject_id))
  $$;

-- Identity: 1 grade, 1 track, 1 subject, 40 lessons, 1 student profile.
INSERT INTO public.grades (id, grade_code, grade_name)
  VALUES ('11111111-1111-1111-1111-111111111111','g12','الثالث الثانوي');
INSERT INTO public.curriculum_tracks (id, track_code, track_name, is_active)
  VALUES ('22222222-2222-2222-2222-222222222222','aden','عدن', true);
INSERT INTO public.subjects (id, grade_id, subject_name, subject_code)
  VALUES ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','الكيمياء','chem');
INSERT INTO public.subject_curriculum_tracks (id, subject_id, curriculum_track_id, is_active)
  VALUES (gen_random_uuid(),'33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222', true);
INSERT INTO auth.users (id) VALUES ('44444444-4444-4444-4444-444444444444');
INSERT INTO public.profiles (id, user_id, grade_uuid, curriculum_track_id)
  VALUES (gen_random_uuid(),'44444444-4444-4444-4444-444444444444',
          '11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');

INSERT INTO public.lessons (id, subject_id, slug, title, sort_order)
SELECT ('55555555-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       '33333333-3333-3333-3333-333333333333', 'lesson-' || g, 'درس ' || g, g
  FROM generate_series(1, 40) g;

-- Source content, matching the production per-capability coverage.
INSERT INTO public.lesson_book_contents (id, lesson_id, content)
SELECT gen_random_uuid(), l.id, '<section>نص الكتاب ' || l.sort_order || '</section>'
  FROM public.lessons l WHERE l.sort_order <= 21;

INSERT INTO public.lesson_explanations (id, lesson_id, explanation_code, title, content, sort_order)
SELECT gen_random_uuid(), l.id, 'exp-' || l.sort_order, 'شرح ' || l.sort_order,
       '<article>شرح تمكين</article>', 1
  FROM public.lessons l;

INSERT INTO public.lesson_summaries (id, lesson_id, summary, key_points, study_tip)
SELECT gen_random_uuid(), l.id, 'ملخص', ARRAY['نقطة'], 'نصيحة'
  FROM public.lessons l WHERE l.sort_order = 1;

INSERT INTO public.lesson_resources (id, lesson_id, resource_type, title, url, sort_order)
SELECT gen_random_uuid(), l.id, 'pdf', 'الكتاب الأصلي', 'https://example.invalid/' || l.sort_order || '.pdf', 1
  FROM public.lessons l;

INSERT INTO public.questions (id, lesson_id, question_type, sort_order, current_published_revision_id)
SELECT ('66666666-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       '55555555-0000-0000-0000-000000000001'::uuid, 'MCQ', g, NULL
  FROM generate_series(1, 3) g;
INSERT INTO public.question_revisions (id, question_id, status)
SELECT ('77777777-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       ('66666666-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'PUBLISHED'
  FROM generate_series(1, 3) g;
UPDATE public.questions q
   SET current_published_revision_id = ('77777777-0000-0000-0000-' || lpad(q.sort_order::text, 12, '0'))::uuid;
INSERT INTO public.question_options (id, question_revision_id, option_code, option_text, is_correct, sort_order)
SELECT gen_random_uuid(), r.id, code, 'نص الخيار', code = 'A', ascii(code)
  FROM public.question_revisions r, unnest(ARRAY['A','B','C','D']) AS code;

INSERT INTO public.lesson_assessments (id, lesson_id, assessment_code, title, sort_order)
VALUES ('88888888-8888-8888-8888-888888888888','55555555-0000-0000-0000-000000000001','self-test','اختبر نفسك',1);
INSERT INTO public.assessment_questions (id, assessment_id, question_id, sort_order, points)
SELECT gen_random_uuid(), '88888888-8888-8888-8888-888888888888', q.id, q.sort_order, 1 FROM public.questions q;

-- 20C lifecycle table shape BEFORE 21H (no applicability, no provenance columns).
INSERT INTO public.lesson_capability_lifecycle (id, lesson_id, capability, status, ready_at, created_at, updated_at)
SELECT gen_random_uuid(), l.id, 'officialBookContent', 'READY', now(), now(), now()
  FROM public.lessons l WHERE l.sort_order <= 21;
INSERT INTO public.lesson_capability_lifecycle (id, lesson_id, capability, status, ready_at, created_at, updated_at)
SELECT gen_random_uuid(), l.id, 'tamkeenExplanation', 'READY', now(), now(), now() FROM public.lessons l;
INSERT INTO public.lesson_capability_lifecycle (id, lesson_id, capability, status, ready_at, created_at, updated_at)
SELECT gen_random_uuid(), l.id, 'originalBookPdf', 'READY', now(), now(), now() FROM public.lessons l;
INSERT INTO public.lesson_capability_lifecycle (id, lesson_id, capability, status, ready_at, created_at, updated_at)
SELECT gen_random_uuid(), '55555555-0000-0000-0000-000000000001', c, 'READY', now(), now(), now()
  FROM unnest(ARRAY['quickReview','checkUnderstanding','lessonAssessment']) c;

-- Two rows already carry a real approver (production: quickReview + 1 explanation).
UPDATE public.lesson_capability_lifecycle
   SET ready_by = '44444444-4444-4444-4444-444444444444'
 WHERE capability = 'quickReview';
UPDATE public.lesson_capability_lifecycle
   SET ready_by = '44444444-4444-4444-4444-444444444444'
 WHERE id = (SELECT id FROM public.lesson_capability_lifecycle
              WHERE capability='tamkeenExplanation' ORDER BY id LIMIT 1);

-- Extra, NOT in production: a READY row whose source content does not exist.
INSERT INTO public.lesson_capability_lifecycle (id, lesson_id, capability, status, ready_at, created_at, updated_at)
VALUES ('99999999-9999-9999-9999-999999999999','55555555-0000-0000-0000-000000000040','mindMap','READY', now(), now(), now());
