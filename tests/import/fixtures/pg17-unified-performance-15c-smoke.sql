-- =============================================================================
-- TAMKEEN_UNIFIED_PERFORMANCE_DUAL_SURFACE_15C — runtime smoke on disposable PG17.
-- Seeds ordinary + ministerial history and asserts the unified contract:
-- percentage normalisation, manual-pending exclusion, historical pinned
-- attribution, track isolation, privacy, parity and answer secrecy.
-- =============================================================================
\set ON_ERROR_STOP on

SET session_replication_role = replica;

-- ------------------------------------------------------------------- actors --
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'a@example.test'),
  ('55555555-2222-2222-2222-222222222222', 'b@example.test'),
  ('66666666-2222-2222-2222-222222222222', 'c@example.test'),
  ('77777777-2222-2222-2222-222222222222', 'd@example.test'),
  ('88888888-2222-2222-2222-222222222222', 'large@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'sanaa@example.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.curriculum_tracks (id, track_name, track_code) VALUES
  ('33333333-0000-0000-0000-000000000001', 'Aden', 'aden'),
  ('33333333-0000-0000-0000-000000000002', 'Sanaa', 'sanaa')
ON CONFLICT DO NOTHING;

INSERT INTO public.grades (id, slug, name, curriculum_track_id) VALUES
  ('33333333-0000-0000-0000-000000000003', 'g12', 'Grade 12', '33333333-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-000000000013', 'g11', 'Grade 11', '33333333-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-000000000023', 'g10', 'Grade 10', '33333333-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.subjects (id, grade_id, slug, name, code) VALUES
  ('33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000003', 'phys', 'Physics', 'sub-g12-001'),
  ('33333333-0000-0000-0000-000000000014', '33333333-0000-0000-0000-000000000013', 'math', 'Math', 'sub-g11-001')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (user_id, full_name, grade_id, grade_uuid, curriculum_track_id) VALUES
  ('22222222-2222-2222-2222-222222222222', 'Student A', 'g12', '33333333-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000001'),
  ('55555555-2222-2222-2222-222222222222', 'Student B', 'g11', '33333333-0000-0000-0000-000000000013', '33333333-0000-0000-0000-000000000001'),
  ('66666666-2222-2222-2222-222222222222', 'Student C', 'g11', '33333333-0000-0000-0000-000000000013', '33333333-0000-0000-0000-000000000001'),
  ('77777777-2222-2222-2222-222222222222', 'Student D', 'g11', '33333333-0000-0000-0000-000000000013', '33333333-0000-0000-0000-000000000001'),
  ('88888888-2222-2222-2222-222222222222', 'Student Large', 'g10', '33333333-0000-0000-0000-000000000023', '33333333-0000-0000-0000-000000000001'),
  ('44444444-4444-4444-4444-444444444444', 'Sanaa Student', 'g12', '33333333-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO public.lessons (id, subject_id, slug, title) VALUES
  ('55555555-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000004', 'l1', 'Lesson One'),
  ('55555555-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000004', 'l2', 'Lesson Two'),
  ('55555555-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000014', 'l3', 'Lesson Three')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_progress (user_id, lesson_id, completed, completed_at) VALUES
  ('22222222-2222-2222-2222-222222222222', '55555555-0000-0000-0000-000000000001', true, now())
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- questions --
INSERT INTO public.questions (id, code, question_text, options, correct_index, question_type, subject_id, created_by)
SELECT ('66666666-0000-0000-0000-00000000000' || c)::uuid, 'Q-' || upper(c), 'Q' || upper(c),
       '[]'::jsonb, -1, 'lesson', '33333333-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111'
FROM unnest(ARRAY['a','b','c','d','e','g']) AS c
ON CONFLICT DO NOTHING;

INSERT INTO public.question_revisions (id, question_id, revision_number, status, interaction_type, grading_mode,
  question_text, max_score, allow_partial, requires_media, manual_grading_required, created_by,
  published_at, published_by, payload_hash, payload_hash_version) VALUES
  ('77777777-0000-0000-0000-0000000000a1', '66666666-0000-0000-0000-00000000000a', 1, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question A text', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('a1', 32), 'canonical_payload_v1'),
  ('77777777-0000-0000-0000-0000000000b1', '66666666-0000-0000-0000-00000000000b', 1, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question B text', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('b1', 32), 'canonical_payload_v1'),
  ('77777777-0000-0000-0000-0000000000c1', '66666666-0000-0000-0000-00000000000c', 1, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question C text', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('c1', 32), 'canonical_payload_v1'),
  ('77777777-0000-0000-0000-0000000000d1', '66666666-0000-0000-0000-00000000000d', 1, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question D text', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('d1', 32), 'canonical_payload_v1'),
  -- E: historical R3 (superseded, targeted at Lesson One) then R4 (Lesson Two)
  ('77777777-0000-0000-0000-0000000000e3', '66666666-0000-0000-0000-00000000000e', 3, 'SUPERSEDED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question E text R3', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('e3', 32), 'canonical_payload_v1'),
  ('77777777-0000-0000-0000-0000000000e4', '66666666-0000-0000-0000-00000000000e', 4, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question E text R4', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('e4', 32), 'canonical_payload_v1'),
  ('77777777-0000-0000-0000-0000000000g1', '66666666-0000-0000-0000-00000000000g', 1, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question G text', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('91', 32), 'canonical_payload_v1')
ON CONFLICT DO NOTHING;

INSERT INTO public.question_targets (question_id, revision_id, target_type, subject_id, lesson_id, is_primary, created_by) VALUES
  ('66666666-0000-0000-0000-00000000000a', '77777777-0000-0000-0000-0000000000a1', 'LESSON', '33333333-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000001', true, '11111111-1111-1111-1111-111111111111'),
  ('66666666-0000-0000-0000-00000000000b', '77777777-0000-0000-0000-0000000000b1', 'LESSON', '33333333-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000001', true, '11111111-1111-1111-1111-111111111111'),
  ('66666666-0000-0000-0000-00000000000c', '77777777-0000-0000-0000-0000000000c1', 'LESSON', '33333333-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000001', true, '11111111-1111-1111-1111-111111111111'),
  ('66666666-0000-0000-0000-00000000000d', '77777777-0000-0000-0000-0000000000d1', 'LESSON', '33333333-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000002', true, '11111111-1111-1111-1111-111111111111'),
  ('66666666-0000-0000-0000-00000000000e', '77777777-0000-0000-0000-0000000000e3', 'LESSON', '33333333-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000001', true, '11111111-1111-1111-1111-111111111111'),
  ('66666666-0000-0000-0000-00000000000e', '77777777-0000-0000-0000-0000000000e4', 'LESSON', '33333333-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000002', true, '11111111-1111-1111-1111-111111111111'),
  ('66666666-0000-0000-0000-00000000000g', '77777777-0000-0000-0000-0000000000g1', 'LESSON', '33333333-0000-0000-0000-000000000014', '55555555-0000-0000-0000-000000000003', true, '11111111-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------- templates --
INSERT INTO public.exam_templates (id, title, mode, subject_id, is_active) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000010', 'Ordinary Physics', 'training', '33333333-0000-0000-0000-000000000004', true),
  ('bbbbbbbb-0000-0000-0000-000000000011', 'Ordinary Math', 'training', '33333333-0000-0000-0000-000000000014', true),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Ministry Aden 2021 R3', 'ministry', '33333333-0000-0000-0000-000000000004', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.ministerial_exam_models (id, template_id, subject_id, curriculum_track_id, academic_year, round_code,
  variant_code, model_code, status, published_at, published_by, created_by) VALUES
  ('88888888-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000001', 2021, 'r3', 'main', 'MIN-ADEN-2021-R3', 'published', now() - interval '3 years', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------- sessions --
INSERT INTO public.exam_sessions (id, user_id, template_id, ministerial_model_id, ministerial_attempt_mode, mode, status,
  grading_status, is_final, score, total_points, started_at, submitted_at, completed_at, total_questions) VALUES
  -- A: 20-point ordinary, 5/20 = 25%
  ('99999999-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000010', NULL, NULL, 'training', 'submitted', 'GRADED', true, 5, 20, now() - interval '10 days' - interval '30 minutes', now() - interval '10 days', now() - interval '10 days', 3),
  -- A: 100-point ordinary, 80/100 = 80% (percentage comparison across scales)
  ('99999999-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000010', NULL, NULL, 'training', 'submitted', 'GRADED', true, 80, 100, now() - interval '9 days' - interval '30 minutes', now() - interval '9 days', now() - interval '9 days', 1),
  -- A: EXPIRED + GRADED ⇒ INCLUDED, 10/20 = 50%
  ('99999999-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000010', NULL, NULL, 'training', 'expired', 'GRADED', true, 10, 20, now() - interval '8 days' - interval '30 minutes', now() - interval '8 days', now() - interval '8 days', 1),
  -- A: manual review pending ⇒ EXCLUDED from averages
  ('99999999-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000010', NULL, NULL, 'training', 'submitted', 'PENDING_MANUAL', false, 0, 20, now() - interval '7 days' - interval '30 minutes', now() - interval '7 days', now() - interval '7 days', 1),
  -- A: ministerial TRAINING 0/1 = 0%
  ('99999999-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', NULL, '88888888-0000-0000-0000-000000000001', 'training', 'ministry', 'submitted', 'GRADED', true, 0, 1, now() - interval '3 days' - interval '30 minutes', now() - interval '3 days', now() - interval '3 days', 1),
  -- A: ministerial STRICT 1/1 = 100%
  ('99999999-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', NULL, '88888888-0000-0000-0000-000000000001', 'strict', 'ministry', 'submitted', 'GRADED', true, 1, 1, now() - interval '2 days' - interval '30 minutes', now() - interval '2 days', now() - interval '2 days', 1),
  -- SANAA student on the ADEN model ⇒ cross-track, never counted
  ('99999999-0000-0000-0000-000000000007', '44444444-4444-4444-4444-444444444444', NULL, '88888888-0000-0000-0000-000000000001', 'training', 'ministry', 'submitted', 'GRADED', true, 1, 1, now() - interval '2 days', now() - interval '2 days', now() - interval '2 days', 1),
  -- grade 11 cohort (3 students ⇒ group visible to admin)
  ('99999999-0000-0000-0000-000000000011', '55555555-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000011', NULL, NULL, 'training', 'submitted', 'GRADED', true, 10, 20, now() - interval '6 days', now() - interval '6 days', now() - interval '6 days', 1),
  ('99999999-0000-0000-0000-000000000012', '66666666-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000011', NULL, NULL, 'training', 'submitted', 'GRADED', true, 12, 20, now() - interval '6 days', now() - interval '6 days', now() - interval '6 days', 1),
  ('99999999-0000-0000-0000-000000000013', '77777777-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000011', NULL, NULL, 'training', 'submitted', 'GRADED', true, 14, 20, now() - interval '6 days', now() - interval '6 days', now() - interval '6 days', 1)
ON CONFLICT DO NOTHING;

-- large history (no 1000-row truncation)
INSERT INTO public.exam_sessions (id, user_id, template_id, mode, status, grading_status, is_final,
  score, total_points, started_at, submitted_at, completed_at, total_questions)
SELECT ('0000c000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       '88888888-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000010',
       'training', 'submitted', 'GRADED', true, 10, 20,
       now() - (i || ' hours')::interval, now() - (i || ' hours')::interval, now() - (i || ' hours')::interval, 0
FROM generate_series(1, 1200) i;

INSERT INTO public.exam_session_questions (id, exam_session_id, question_revision_id, logical_question_id,
  question_order, rendered_question_text, rendered_options, max_score, pin_mode, payload_hash, payload_hash_version) VALUES
  -- S1: A wrong, B blank (no answer row), C correct
  ('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', '77777777-0000-0000-0000-0000000000a1', '66666666-0000-0000-0000-00000000000a', 1, 'Question A text', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('11', 32), 'canonical_payload_v1'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '99999999-0000-0000-0000-000000000001', '77777777-0000-0000-0000-0000000000b1', '66666666-0000-0000-0000-00000000000b', 2, 'Question B text', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('12', 32), 'canonical_payload_v1'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '99999999-0000-0000-0000-000000000001', '77777777-0000-0000-0000-0000000000c1', '66666666-0000-0000-0000-00000000000c', 3, 'Question C text', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('13', 32), 'canonical_payload_v1'),
  -- S2: D wrong (Lesson Two)
  ('aaaaaaaa-0000-0000-0000-000000000004', '99999999-0000-0000-0000-000000000002', '77777777-0000-0000-0000-0000000000d1', '66666666-0000-0000-0000-00000000000d', 1, 'Question D text', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('14', 32), 'canonical_payload_v1'),
  -- S3: D correct (mastered later)
  ('aaaaaaaa-0000-0000-0000-000000000005', '99999999-0000-0000-0000-000000000003', '77777777-0000-0000-0000-0000000000d1', '66666666-0000-0000-0000-00000000000d', 1, 'Question D text', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('15', 32), 'canonical_payload_v1'),
  -- S4: A awaiting manual review
  ('aaaaaaaa-0000-0000-0000-000000000006', '99999999-0000-0000-0000-000000000004', '77777777-0000-0000-0000-0000000000a1', '66666666-0000-0000-0000-00000000000a', 1, 'Question A text', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('16', 32), 'canonical_payload_v1'),
  -- S5/S6: E pinned at R3 (historical Lesson One even though R4 moved it)
  ('aaaaaaaa-0000-0000-0000-000000000007', '99999999-0000-0000-0000-000000000005', '77777777-0000-0000-0000-0000000000e3', '66666666-0000-0000-0000-00000000000e', 1, 'Question E text R3', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('17', 32), 'canonical_payload_v1'),
  ('aaaaaaaa-0000-0000-0000-000000000008', '99999999-0000-0000-0000-000000000006', '77777777-0000-0000-0000-0000000000e3', '66666666-0000-0000-0000-00000000000e', 1, 'Question E text R3', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('18', 32), 'canonical_payload_v1'),
  -- Sanaa student on the Aden model
  ('aaaaaaaa-0000-0000-0000-000000000009', '99999999-0000-0000-0000-000000000007', '77777777-0000-0000-0000-0000000000e3', '66666666-0000-0000-0000-00000000000e', 1, 'Question E text R3', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('19', 32), 'canonical_payload_v1'),
  -- grade 11 cohort
  ('aaaaaaaa-0000-0000-0000-00000000000b', '99999999-0000-0000-0000-000000000011', '77777777-0000-0000-0000-0000000000g1', '66666666-0000-0000-0000-00000000000g', 1, 'Question G text', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('1b', 32), 'canonical_payload_v1'),
  ('aaaaaaaa-0000-0000-0000-00000000000c', '99999999-0000-0000-0000-000000000012', '77777777-0000-0000-0000-0000000000g1', '66666666-0000-0000-0000-00000000000g', 1, 'Question G text', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('1c', 32), 'canonical_payload_v1'),
  ('aaaaaaaa-0000-0000-0000-00000000000d', '99999999-0000-0000-0000-000000000013', '77777777-0000-0000-0000-0000000000g1', '66666666-0000-0000-0000-00000000000g', 1, 'Question G text', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('1d', 32), 'canonical_payload_v1');

INSERT INTO public.exam_session_answers (session_id, exam_session_question_id, question_id, question_revision_id,
  selected_option_code, answered_at, is_correct, requires_manual_review, grading_status, max_score, final_score) VALUES
  ('99999999-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '66666666-0000-0000-0000-00000000000a', '77777777-0000-0000-0000-0000000000a1', 'B', now() - interval '10 days', false, false, 'GRADED', 1, 0),
  ('99999999-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', '66666666-0000-0000-0000-00000000000c', '77777777-0000-0000-0000-0000000000c1', 'A', now() - interval '10 days', true, false, 'GRADED', 1, 1),
  ('99999999-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000004', '66666666-0000-0000-0000-00000000000d', '77777777-0000-0000-0000-0000000000d1', 'B', now() - interval '9 days', false, false, 'GRADED', 1, 0),
  ('99999999-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000005', '66666666-0000-0000-0000-00000000000d', '77777777-0000-0000-0000-0000000000d1', 'A', now() - interval '8 days', true, false, 'GRADED', 1, 1),
  ('99999999-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000006', '66666666-0000-0000-0000-00000000000a', '77777777-0000-0000-0000-0000000000a1', NULL, now() - interval '7 days', NULL, true, 'PENDING_MANUAL', 1, NULL),
  ('99999999-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000007', '66666666-0000-0000-0000-00000000000e', '77777777-0000-0000-0000-0000000000e3', 'B', now() - interval '3 days', false, false, 'GRADED', 1, 0),
  ('99999999-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000008', '66666666-0000-0000-0000-00000000000e', '77777777-0000-0000-0000-0000000000e3', 'A', now() - interval '2 days', true, false, 'GRADED', 1, 1),
  ('99999999-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000009', '66666666-0000-0000-0000-00000000000e', '77777777-0000-0000-0000-0000000000e3', 'B', now() - interval '2 days', false, false, 'GRADED', 1, 0),
  ('99999999-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-00000000000b', '66666666-0000-0000-0000-00000000000g', '77777777-0000-0000-0000-0000000000g1', 'B', now() - interval '6 days', false, false, 'GRADED', 1, 0),
  ('99999999-0000-0000-0000-000000000012', 'aaaaaaaa-0000-0000-0000-00000000000c', '66666666-0000-0000-0000-00000000000g', '77777777-0000-0000-0000-0000000000g1', 'B', now() - interval '6 days', false, false, 'GRADED', 1, 0),
  ('99999999-0000-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-00000000000d', '66666666-0000-0000-0000-00000000000g', '77777777-0000-0000-0000-0000000000g1', 'A', now() - interval '6 days', true, false, 'GRADED', 1, 1);

SET session_replication_role = origin;

-- =============================================================================
-- assertions
-- =============================================================================
CREATE OR REPLACE FUNCTION pg_temp.chk(p_name text, p_ok boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% %', CASE WHEN p_ok THEN 'PASS ' ELSE 'FAIL ' END, p_name;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.lesson(p jsonb, l text)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM jsonb_array_elements(p->'by_lesson') e WHERE e->>'lesson_id' = l LIMIT 1
$$;

CREATE OR REPLACE FUNCTION pg_temp.atype(p jsonb, t text)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM jsonb_array_elements(p->'assessment_breakdown') e WHERE e->>'attempt_type' = t LIMIT 1
$$;

-- ---- student surface ---------------------------------------------------------
DO $$
DECLARE v jsonb; s jsonb; l1 jsonb; l2 jsonb; mp jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  v := public.get_student_unified_performance();
  s := v->'summary';

  PERFORM pg_temp.chk('15C STUDENT_SURFACE returns the unified contract',
    v ? 'summary' AND v ? 'progress' AND v ? 'by_subject' AND v ? 'by_lesson'
    AND v ? 'assessment_breakdown' AND v ? 'mistake_patterns'
    AND v ? 'strengths' AND v ? 'weaknesses');

  PERFORM pg_temp.chk('15C final ordinary + ministerial + expired sessions INCLUDED',
    (s->>'graded_attempts_count')::int = 5);
  PERFORM pg_temp.chk('15C MANUAL_PENDING excluded from finals, counted separately',
    (s->>'pending_manual_count')::int = 1 AND (s->>'attempts_count')::int = 6);
  PERFORM pg_temp.chk('15C PERCENTAGE_NORMALIZATION 20-point vs 100-point (avg = 51.0)',
    (s->>'avg_percentage')::numeric = 51.0);
  PERFORM pg_temp.chk('15C best/latest percentage',
    (s->>'best_percentage')::numeric = 100 AND (s->>'latest_percentage')::numeric = 100);
  PERFORM pg_temp.chk('15C improvement uses the 14F definition (recent3 - older = -2.5)',
    (s->>'improvement_percentage_points')::numeric = -2.5);
  PERFORM pg_temp.chk('15C avg_elapsed_seconds present', (s->>'avg_elapsed_seconds')::int > 0);

  PERFORM pg_temp.chk('15C LESSON_PROGRESS from the existing contract (1/2 = 50%)',
    (v->'progress'->>'total_lessons')::int = 2
    AND (v->'progress'->>'completed_lessons')::int = 1
    AND (v->'progress'->>'completion_percentage')::numeric = 50.0);

  PERFORM pg_temp.chk('15C ORDINARY vs MINISTERIAL breakdown is preserved',
    (pg_temp.atype(v, 'ORDINARY')->>'attempts')::int = 3
    AND (pg_temp.atype(v, 'MINISTERIAL_TRAINING')->>'attempts')::int = 1
    AND (pg_temp.atype(v, 'MINISTERIAL_STRICT')->>'attempts')::int = 1);

  l1 := pg_temp.lesson(v, '55555555-0000-0000-0000-000000000001');
  l2 := pg_temp.lesson(v, '55555555-0000-0000-0000-000000000002');
  PERFORM pg_temp.chk('15C HISTORICAL_REVISION: R3 attempt stays on Lesson One (not R4 target)',
    l1 IS NOT NULL AND (l1->>'asked')::int = 6 AND (l1->>'manual_pending')::int = 1
    AND (l1->>'correct')::int = 2 AND (l1->>'wrong')::int = 2 AND (l1->>'blank')::int = 1);
  PERFORM pg_temp.chk('15C lesson accuracy excludes manual-pending occurrences',
    (l1->>'auto_graded')::int = 5 AND (l1->>'accuracy')::numeric = 40.0);
  PERFORM pg_temp.chk('15C lesson completion_state comes from user_progress',
    l1->>'completion_state' = 'COMPLETED' AND l2->>'completion_state' = 'NOT_COMPLETED');

  mp := v->'mistake_patterns';
  PERFORM pg_temp.chk('15C mistake_patterns MATCH 15B definitions',
    (mp->>'unique_mistakes')::int = 4 AND (mp->>'blank_questions')::int = 1
    AND (mp->>'mastered_later')::int = 2 AND (mp->>'repeated_mistakes')::int = 0);
  PERFORM pg_temp.chk('15C wrong/blank rates over evaluated occurrences',
    (mp->>'wrong_rate')::numeric = 42.9 AND (mp->>'blank_rate')::numeric = 14.3);

  PERFORM pg_temp.chk('15C 15B parity: unique_mistakes = list_my_mistakes total',
    (mp->>'unique_mistakes')::int = ((public.list_my_mistakes(NULL, NULL, 'ALL', 'ALL', 'recent', 100, 0))->>'total')::int);

  PERFORM pg_temp.chk('15C weaknesses use the documented threshold (<60 with >=3 graded)',
    EXISTS (SELECT 1 FROM jsonb_array_elements(v->'weaknesses'->'lessons') e
            WHERE e->>'lesson_id' = '55555555-0000-0000-0000-000000000001'));

  PERFORM pg_temp.chk('15C ANSWER_LEAK ZERO (student payload)',
    v::text NOT ILIKE '%is_correct%' AND v::text NOT ILIKE '%correct_option%'
    AND v::text NOT ILIKE '%answer_key%' AND v::text NOT ILIKE '%solution%'
    AND v::text NOT ILIKE '%selected_option%');

  -- scope filters
  PERFORM pg_temp.chk('15C attempt_type filter ORDINARY',
    ((public.get_student_unified_performance('ORDINARY'))->'summary'->>'graded_attempts_count')::int = 3);
  PERFORM pg_temp.chk('15C attempt_type filter MINISTERIAL_STRICT',
    ((public.get_student_unified_performance('MINISTERIAL_STRICT'))->'summary'->>'avg_percentage')::numeric = 100);
END $$;

DO $$
DECLARE ok boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  BEGIN PERFORM public.get_student_unified_performance('HACK'); EXCEPTION WHEN others THEN ok := true; END;
  PERFORM pg_temp.chk('15C invalid attempt_type rejected', ok);
END $$;

-- ---- track isolation / other students ---------------------------------------
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  v := public.get_student_unified_performance();
  PERFORM pg_temp.chk('15C TRACK_ISOLATION: Sanaa student gets no Aden ministerial history',
    (v->'summary'->>'attempts_count')::int = 0 AND (v->'summary'->>'graded_attempts_count')::int = 0);

  PERFORM set_config('request.jwt.claim.sub', '55555555-2222-2222-2222-222222222222', true);
  v := public.get_student_unified_performance();
  PERFORM pg_temp.chk('15C student B sees ONLY own data (DENY cross-student)',
    (v->'summary'->>'attempts_count')::int = 1 AND (v->'summary'->>'avg_percentage')::numeric = 50.0);

  PERFORM set_config('request.jwt.claim.sub', '88888888-2222-2222-2222-222222222222', true);
  v := public.get_student_unified_performance();
  PERFORM pg_temp.chk('15C large history: NO 1000-ROW TRUNCATION',
    (v->'summary'->>'graded_attempts_count')::int = 1200
    AND (v->'summary'->>'avg_percentage')::numeric = 50.0);
END $$;

-- ---- anon --------------------------------------------------------------------
DO $$
DECLARE ok boolean := false; ok2 boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN PERFORM public.get_student_unified_performance(); EXCEPTION WHEN others THEN ok := true; END;
  PERFORM pg_temp.chk('15C ANON student RPC DENY', ok);
  BEGIN PERFORM public.get_admin_unified_performance(); EXCEPTION WHEN others THEN ok2 := true; END;
  PERFORM pg_temp.chk('15C ANON admin RPC DENY', ok2);
END $$;

-- ---- admin surface -----------------------------------------------------------
DO $$
DECLARE v jsonb; sv jsonb; stu jsonb; ok boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  BEGIN PERFORM public.get_admin_unified_performance(); EXCEPTION WHEN others THEN ok := true; END;
  PERFORM pg_temp.chk('15C STUDENT calling the admin RPC DENY', ok);

  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  v := public.get_admin_unified_performance();
  PERFORM pg_temp.chk('15C ADMIN_SURFACE ALLOW + aggregate contract',
    v ? 'summary' AND v ? 'by_grade' AND v ? 'by_track' AND v ? 'by_subject'
    AND v ? 'by_lesson' AND v ? 'by_attempt_type' AND v ? 'weakest_subjects'
    AND v ? 'weakest_lessons' AND v ? 'highest_blank_rate'
    AND v ? 'highest_repeated_mistake_rate' AND v ? 'strongest_improvement_areas');

  PERFORM pg_temp.chk('15C PRIVACY: no student identity in the admin payload',
    v::text NOT ILIKE '%user_id%' AND v::text NOT ILIKE '%student_id%'
    AND v::text NOT ILIKE '%full_name%' AND v::text NOT ILIKE '%Student A%'
    AND v::text NOT LIKE '%22222222-2222-2222-2222-222222222222%');
  PERFORM pg_temp.chk('15C ANSWER_LEAK ZERO (admin payload)',
    v::text NOT ILIKE '%is_correct%' AND v::text NOT ILIKE '%correct_option%'
    AND v::text NOT ILIKE '%answer_key%' AND v::text NOT ILIKE '%solution%');

  PERFORM pg_temp.chk('15C privacy threshold: grade with 3 students is shown',
    EXISTS (SELECT 1 FROM jsonb_array_elements(v->'by_grade') e
            WHERE e->>'grade_id' = '33333333-0000-0000-0000-000000000013'
              AND (e->>'students_count')::int = 3));
  PERFORM pg_temp.chk('15C privacy threshold: single-student grade is suppressed',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'by_grade') e
                WHERE e->>'grade_id' = '33333333-0000-0000-0000-000000000003'));

  PERFORM pg_temp.chk('15C admin track filter is server-side',
    (SELECT count(*) FROM jsonb_array_elements(
       (public.get_admin_unified_performance(NULL, '33333333-0000-0000-0000-000000000002'))->'by_grade') e) = 0);

  -- PARITY: same scope (grade 12 + Aden track) contains exactly student A
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  stu := public.get_student_unified_performance();
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  sv := (public.get_admin_unified_performance('33333333-0000-0000-0000-000000000003',
          '33333333-0000-0000-0000-000000000001'))->'summary';

  PERFORM pg_temp.chk('15C STUDENT_ADMIN_METRIC_PARITY attempts/graded/pending',
    (sv->>'attempts_count')::int = (stu->'summary'->>'attempts_count')::int
    AND (sv->>'graded_attempts_count')::int = (stu->'summary'->>'graded_attempts_count')::int
    AND (sv->>'pending_manual_count')::int = (stu->'summary'->>'pending_manual_count')::int);
  PERFORM pg_temp.chk('15C STUDENT_ADMIN_METRIC_PARITY avg/best percentage',
    (sv->>'avg_percentage')::numeric = (stu->'summary'->>'avg_percentage')::numeric
    AND (sv->>'best_percentage')::numeric = (stu->'summary'->>'best_percentage')::numeric);
  PERFORM pg_temp.chk('15C STUDENT_ADMIN_METRIC_PARITY wrong/blank rate',
    (sv->>'wrong_rate')::numeric = (stu->'mistake_patterns'->>'wrong_rate')::numeric
    AND (sv->>'blank_rate')::numeric = (stu->'mistake_patterns'->>'blank_rate')::numeric);
  PERFORM pg_temp.chk('15C STUDENT_ADMIN_METRIC_PARITY completion percentage',
    (sv->>'completion_percentage')::numeric = (stu->'progress'->>'completion_percentage')::numeric);
END $$;

-- ---- grants / no new tables ---------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.chk('15C RPCs are not executable by anon',
    NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('get_student_unified_performance', 'get_admin_unified_performance',
                          '_up_sessions', '_up_occurrences', '_up_progress')
        AND has_function_privilege('anon', p.oid, 'EXECUTE')));
  PERFORM pg_temp.chk('15C internal helpers are not directly callable by authenticated',
    NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('_up_sessions', '_up_occurrences', '_up_progress')
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')));
  PERFORM pg_temp.chk('15C public RPCs granted to authenticated',
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('get_student_unified_performance', 'get_admin_unified_performance')
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) = 2);
  PERFORM pg_temp.chk('15C NEW_ANALYTICS_TABLE = NO',
    NOT EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND (table_name ILIKE '%performance%' OR table_name ILIKE '%analytics%')));
  PERFORM pg_temp.chk('15C NEW_MATERIALIZED_COPY = NO',
    NOT EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'public'));
END $$;
