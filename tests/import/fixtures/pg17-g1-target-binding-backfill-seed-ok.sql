-- =============================================================================
-- Stage-11 backfill seed: DETERMINISTIC legacy data (must migrate cleanly).
-- Applied on the pre-stage-11 chain, before the pending migration runs.
--   Q1: has a published revision (+ a newer draft)  -> binds to the PUBLISHED one
--   Q2: has exactly one revision, never published   -> binds to that single one
-- =============================================================================
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'staff@example.test') ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin') ON CONFLICT DO NOTHING;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

INSERT INTO public.curriculum_tracks (id, track_name, track_code) VALUES
  ('33333333-0000-0000-0000-000000000001', 'Aden', 'aden') ON CONFLICT DO NOTHING;
INSERT INTO public.grades (id, slug, name, curriculum_track_id) VALUES
  ('33333333-0000-0000-0000-000000000002', 'g12', 'Grade 12', '33333333-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.subjects (id, grade_id, slug, name, code) VALUES
  ('33333333-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000002', 'phys', 'Physics', 'G11-SUB-PHY') ON CONFLICT DO NOTHING;
INSERT INTO public.units (id, subject_id, code, title) VALUES
  ('33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000003', 'U1', 'Unit 1') ON CONFLICT DO NOTHING;
INSERT INTO public.lessons (id, subject_id, unit_id, slug, title) VALUES
  ('33333333-0000-0000-0000-000000000005', '33333333-0000-0000-0000-000000000003',
   '33333333-0000-0000-0000-000000000004', 'l1', 'Lesson 1') ON CONFLICT DO NOTHING;

-- Q1 --------------------------------------------------------------------------
INSERT INTO public.questions (id, code, question_text, options, correct_index, question_type, created_by)
VALUES ('33333333-1111-0000-0000-000000000001', 'BF-Q1', 'legacy q1', '[]'::jsonb, -1, 'lesson',
        '11111111-1111-1111-1111-111111111111');

INSERT INTO public.question_revisions (
  id, question_id, revision_number, status, interaction_type, grading_mode,
  question_text, max_score, allow_partial, requires_media, manual_grading_required, created_by
) VALUES
  ('33333333-2222-0000-0000-000000000001', '33333333-1111-0000-0000-000000000001', 1, 'DRAFT',
   'SINGLE_CHOICE', 'AUTO_SINGLE', 'legacy q1 r1', 1, false, false, false,
   '11111111-1111-1111-1111-111111111111'),
  ('33333333-2222-0000-0000-000000000002', '33333333-1111-0000-0000-000000000001', 2, 'DRAFT',
   'SINGLE_CHOICE', 'AUTO_SINGLE', 'legacy q1 r2 (newer draft)', 1, false, false, false,
   '11111111-1111-1111-1111-111111111111');

INSERT INTO public.question_options (question_revision_id, option_code, body, sort_order, is_correct) VALUES
  ('33333333-2222-0000-0000-000000000001', 'OPT_1', 'a', 1, true),
  ('33333333-2222-0000-0000-000000000001', 'OPT_2', 'b', 2, false),
  ('33333333-2222-0000-0000-000000000002', 'OPT_1', 'a', 1, true),
  ('33333333-2222-0000-0000-000000000002', 'OPT_2', 'b', 2, false);

-- Make revision 1 the published one (pre-stage-11 style: direct pointer set-up).
SELECT public.compute_and_set_revision_payload_hash('33333333-2222-0000-0000-000000000001');
UPDATE public.question_revisions SET status = 'APPROVED'
  WHERE id = '33333333-2222-0000-0000-000000000001';
UPDATE public.question_revisions
   SET status = 'PUBLISHED', published_at = now(), published_by = '11111111-1111-1111-1111-111111111111'
 WHERE id = '33333333-2222-0000-0000-000000000001';
UPDATE public.questions
   SET current_published_revision_id = '33333333-2222-0000-0000-000000000001'
 WHERE id = '33333333-1111-0000-0000-000000000001';

INSERT INTO public.question_targets (question_id, target_type, subject_id, unit_id, lesson_id, is_primary)
VALUES ('33333333-1111-0000-0000-000000000001', 'LESSON', '33333333-0000-0000-0000-000000000003',
        '33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000005', true);

-- Q2: single revision, never published ---------------------------------------
INSERT INTO public.questions (id, code, question_text, options, correct_index, question_type, created_by)
VALUES ('33333333-1111-0000-0000-000000000002', 'BF-Q2', 'legacy q2', '[]'::jsonb, -1, 'lesson',
        '11111111-1111-1111-1111-111111111111');

INSERT INTO public.question_revisions (
  id, question_id, revision_number, status, interaction_type, grading_mode,
  question_text, max_score, allow_partial, requires_media, manual_grading_required, created_by
) VALUES
  ('33333333-2222-0000-0000-000000000003', '33333333-1111-0000-0000-000000000002', 1, 'DRAFT',
   'SINGLE_CHOICE', 'AUTO_SINGLE', 'legacy q2 r1', 1, false, false, false,
   '11111111-1111-1111-1111-111111111111');

INSERT INTO public.question_targets (question_id, target_type, subject_id, is_primary)
VALUES ('33333333-1111-0000-0000-000000000002', 'SUBJECT', '33333333-0000-0000-0000-000000000003', true);
