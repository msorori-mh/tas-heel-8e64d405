-- =============================================================================
-- Stage-11 backfill seed: AMBIGUOUS legacy data (migration MUST abort).
-- Question with TWO revisions and no published pointer -> unbindable target.
-- =============================================================================
\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'staff@example.test') ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin') ON CONFLICT DO NOTHING;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

INSERT INTO public.curriculum_tracks (id, track_name, track_code) VALUES
  ('44444444-0000-0000-0000-000000000001', 'Aden', 'aden') ON CONFLICT DO NOTHING;
INSERT INTO public.grades (id, slug, name, curriculum_track_id) VALUES
  ('44444444-0000-0000-0000-000000000002', 'g12', 'Grade 12', '44444444-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.subjects (id, grade_id, slug, name, code) VALUES
  ('44444444-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'phys', 'Physics', 'G11-SUB-PHY') ON CONFLICT DO NOTHING;

INSERT INTO public.questions (id, code, question_text, options, correct_index, question_type, created_by)
VALUES ('44444444-1111-0000-0000-000000000001', 'BF-AMBIG', 'ambiguous', '[]'::jsonb, -1, 'lesson',
        '11111111-1111-1111-1111-111111111111');

INSERT INTO public.question_revisions (
  id, question_id, revision_number, status, interaction_type, grading_mode,
  question_text, max_score, allow_partial, requires_media, manual_grading_required, created_by
) VALUES
  ('44444444-2222-0000-0000-000000000001', '44444444-1111-0000-0000-000000000001', 1, 'DRAFT',
   'SINGLE_CHOICE', 'AUTO_SINGLE', 'r1', 1, false, false, false, '11111111-1111-1111-1111-111111111111'),
  ('44444444-2222-0000-0000-000000000002', '44444444-1111-0000-0000-000000000001', 2, 'DRAFT',
   'SINGLE_CHOICE', 'AUTO_SINGLE', 'r2', 1, false, false, false, '11111111-1111-1111-1111-111111111111');

INSERT INTO public.question_targets (question_id, target_type, subject_id, is_primary)
VALUES ('44444444-1111-0000-0000-000000000001', 'SUBJECT', '44444444-0000-0000-0000-000000000003', true);
