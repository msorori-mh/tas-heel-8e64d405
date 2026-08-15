-- =============================================================================
-- TAMKEEN_MY_MISTAKES_DERIVED_MODEL_15B — runtime smoke on a disposable PG17.
-- Seeds ordinary + ministerial graded sessions for three students and asserts
-- scope, historical revision pinning, mastery, pagination and answer secrecy.
-- Triggers are disabled during seeding only (the RPCs are read-only).
-- =============================================================================
\set ON_ERROR_STOP on

SET session_replication_role = replica;

-- ------------------------------------------------------------------- actors --
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'staff@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'a@example.test'),
  ('55555555-2222-2222-2222-222222222222', 'b@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'sanaa@example.test')
ON CONFLICT DO NOTHING;

INSERT INTO public.curriculum_tracks (id, track_name, track_code) VALUES
  ('33333333-0000-0000-0000-000000000001', 'Aden', 'aden'),
  ('33333333-0000-0000-0000-000000000002', 'Sanaa', 'sanaa')
ON CONFLICT DO NOTHING;

INSERT INTO public.grades (id, slug, name, curriculum_track_id) VALUES
  ('33333333-0000-0000-0000-000000000003', 'g12', 'Grade 12', '33333333-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.subjects (id, grade_id, slug, name, code) VALUES
  ('33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000003', 'phys', 'Physics', 'sub-g12-001')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (user_id, full_name, grade_id, grade_uuid, curriculum_track_id) VALUES
  ('22222222-2222-2222-2222-222222222222', 'Student A', 'g12', '33333333-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000001'),
  ('55555555-2222-2222-2222-222222222222', 'Student B', 'g12', '33333333-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000001'),
  ('44444444-4444-4444-4444-444444444444', 'Sanaa Student', 'g12', '33333333-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO public.lessons (id, subject_id, slug, title) VALUES
  ('55555555-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000004', 'l1', 'Lesson One'),
  ('55555555-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000004', 'l2', 'Lesson Two')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- questions --
INSERT INTO public.questions (id, code, question_text, options, correct_index, question_type, subject_id, created_by)
SELECT ('66666666-0000-0000-0000-00000000000' || c)::uuid, 'Q-' || upper(c), 'Q' || upper(c),
       '[]'::jsonb, -1, 'lesson', '33333333-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111'
FROM unnest(ARRAY['a','b','c','d','e','f']) AS c
ON CONFLICT DO NOTHING;

INSERT INTO public.question_revisions (id, question_id, revision_number, status, interaction_type, grading_mode,
  question_text, max_score, allow_partial, requires_media, manual_grading_required, created_by,
  published_at, published_by, payload_hash, payload_hash_version) VALUES
  ('77777777-0000-0000-0000-0000000000a1', '66666666-0000-0000-0000-00000000000a', 1, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question A text', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('a1', 32), 'canonical_payload_v1'),
  ('77777777-0000-0000-0000-0000000000b1', '66666666-0000-0000-0000-00000000000b', 1, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question B text', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('b1', 32), 'canonical_payload_v1'),
  ('77777777-0000-0000-0000-0000000000c1', '66666666-0000-0000-0000-00000000000c', 1, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question C text', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('c1', 32), 'canonical_payload_v1'),
  ('77777777-0000-0000-0000-0000000000d1', '66666666-0000-0000-0000-00000000000d', 1, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question D text', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('d1', 32), 'canonical_payload_v1'),
  -- E: historical R3 (superseded) then R4 published later
  ('77777777-0000-0000-0000-0000000000e3', '66666666-0000-0000-0000-00000000000e', 3, 'SUPERSEDED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question E text R3', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('e3', 32), 'canonical_payload_v1'),
  ('77777777-0000-0000-0000-0000000000e4', '66666666-0000-0000-0000-00000000000e', 4, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question E text R4', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('e4', 32), 'canonical_payload_v1'),
  ('77777777-0000-0000-0000-0000000000f1', '66666666-0000-0000-0000-00000000000f', 1, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question F text', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('f1', 32), 'canonical_payload_v1')
ON CONFLICT DO NOTHING;

INSERT INTO public.question_targets (question_id, revision_id, target_type, subject_id, lesson_id, is_primary, created_by) VALUES
  ('66666666-0000-0000-0000-00000000000a', '77777777-0000-0000-0000-0000000000a1', 'LESSON', '33333333-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000001', true, '11111111-1111-1111-1111-111111111111'),
  ('66666666-0000-0000-0000-00000000000b', '77777777-0000-0000-0000-0000000000b1', 'LESSON', '33333333-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000001', true, '11111111-1111-1111-1111-111111111111'),
  ('66666666-0000-0000-0000-00000000000c', '77777777-0000-0000-0000-0000000000c1', 'LESSON', '33333333-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000001', true, '11111111-1111-1111-1111-111111111111'),
  ('66666666-0000-0000-0000-00000000000d', '77777777-0000-0000-0000-0000000000d1', 'LESSON', '33333333-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000002', true, '11111111-1111-1111-1111-111111111111'),
  -- E: R3 pointed at Lesson One, R4 re-targets to Lesson Two
  ('66666666-0000-0000-0000-00000000000e', '77777777-0000-0000-0000-0000000000e3', 'LESSON', '33333333-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000001', true, '11111111-1111-1111-1111-111111111111'),
  ('66666666-0000-0000-0000-00000000000e', '77777777-0000-0000-0000-0000000000e4', 'LESSON', '33333333-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000002', true, '11111111-1111-1111-1111-111111111111');
-- Question F intentionally has NO target at all (must NOT be dropped).

-- ---------------------------------------------------------------- templates --
INSERT INTO public.exam_templates (id, title, mode, subject_id, is_active) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000010', 'Ordinary Template', 'training', '33333333-0000-0000-0000-000000000004', true),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Ministry Aden 2021 R3', 'ministry', '33333333-0000-0000-0000-000000000004', true),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'Ministry Sanaa 2022', 'ministry', '33333333-0000-0000-0000-000000000004', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.ministerial_exam_models (id, template_id, subject_id, curriculum_track_id, academic_year, round_code,
  variant_code, model_code, status, published_at, published_by, created_by) VALUES
  ('88888888-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000001', 2021, 'r3', 'main', 'MIN-ADEN-2021-R3', 'published', now() - interval '3 years', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------- sessions --
INSERT INTO public.exam_sessions (id, user_id, template_id, ministerial_model_id, ministerial_attempt_mode, mode, status,
  grading_status, is_final, score, total_points, started_at, submitted_at, completed_at, total_questions) VALUES
  -- ordinary, student A, oldest
  ('99999999-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000010', NULL, NULL, 'training', 'submitted', 'GRADED', true, 1, 4, now() - interval '10 days', now() - interval '10 days', now() - interval '10 days', 4),
  ('99999999-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000010', NULL, NULL, 'training', 'submitted', 'GRADED', true, 0, 2, now() - interval '5 days', now() - interval '5 days', now() - interval '5 days', 2),
  ('99999999-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000010', NULL, NULL, 'training', 'submitted', 'GRADED', true, 1, 2, now() - interval '1 day', now() - interval '1 day', now() - interval '1 day', 2),
  -- ministerial Aden, student A
  ('99999999-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', NULL, '88888888-0000-0000-0000-000000000001', 'training', 'ministry', 'submitted', 'GRADED', true, 0, 1, now() - interval '3 days', now() - interval '3 days', now() - interval '3 days', 1),
  -- ministerial Aden model attempted by the SANAA student (cross-track ⇒ hidden)
  ('99999999-0000-0000-0000-000000000005', '44444444-4444-4444-4444-444444444444', NULL, '88888888-0000-0000-0000-000000000001', 'training', 'ministry', 'submitted', 'GRADED', true, 0, 1, now() - interval '2 days', now() - interval '2 days', now() - interval '2 days', 1),
  -- ordinary session of student B
  ('99999999-0000-0000-0000-000000000006', '55555555-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000010', NULL, NULL, 'training', 'submitted', 'GRADED', true, 0, 1, now() - interval '4 days', now() - interval '4 days', now() - interval '4 days', 1),
  -- bulk session for pagination (student A)
  ('99999999-0000-0000-0000-000000000007', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000010', NULL, NULL, 'training', 'submitted', 'GRADED', true, 0, 1205, now() - interval '20 days', now() - interval '20 days', now() - interval '20 days', 1205);

INSERT INTO public.exam_session_questions (id, exam_session_id, question_revision_id, logical_question_id,
  question_order, rendered_question_text, rendered_options, max_score, pin_mode, payload_hash, payload_hash_version) VALUES
  -- S1: A wrong, B blank, C correct, F wrong (no target)
  ('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', '77777777-0000-0000-0000-0000000000a1', '66666666-0000-0000-0000-00000000000a', 1, 'Question A text', '[{"option_code":"A","body":"opt a"},{"option_code":"B","body":"opt b"}]'::jsonb, 1, 'REVISION_PINNED', repeat('e1', 32), 'canonical_payload_v1'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '99999999-0000-0000-0000-000000000001', '77777777-0000-0000-0000-0000000000b1', '66666666-0000-0000-0000-00000000000b', 2, 'Question B text', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('e1', 32), 'canonical_payload_v1'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '99999999-0000-0000-0000-000000000001', '77777777-0000-0000-0000-0000000000c1', '66666666-0000-0000-0000-00000000000c', 3, 'Question C text', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('e1', 32), 'canonical_payload_v1'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '99999999-0000-0000-0000-000000000001', '77777777-0000-0000-0000-0000000000f1', '66666666-0000-0000-0000-00000000000f', 4, 'Question F text', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('e1', 32), 'canonical_payload_v1'),
  -- S2: A wrong (2nd), D wrong
  ('aaaaaaaa-0000-0000-0000-000000000005', '99999999-0000-0000-0000-000000000002', '77777777-0000-0000-0000-0000000000a1', '66666666-0000-0000-0000-00000000000a', 1, 'Question A text', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('e1', 32), 'canonical_payload_v1'),
  ('aaaaaaaa-0000-0000-0000-000000000006', '99999999-0000-0000-0000-000000000002', '77777777-0000-0000-0000-0000000000d1', '66666666-0000-0000-0000-00000000000d', 2, 'Question D text', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('e1', 32), 'canonical_payload_v1'),
  -- S3: A wrong (3rd), D correct (mastered later)
  ('aaaaaaaa-0000-0000-0000-000000000007', '99999999-0000-0000-0000-000000000003', '77777777-0000-0000-0000-0000000000a1', '66666666-0000-0000-0000-00000000000a', 1, 'Question A text', '[{"option_code":"A","body":"opt a"},{"option_code":"B","body":"opt b"}]'::jsonb, 1, 'REVISION_PINNED', repeat('e1', 32), 'canonical_payload_v1'),
  ('aaaaaaaa-0000-0000-0000-000000000008', '99999999-0000-0000-0000-000000000003', '77777777-0000-0000-0000-0000000000d1', '66666666-0000-0000-0000-00000000000d', 2, 'Question D text', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('e1', 32), 'canonical_payload_v1'),
  -- S4: ministerial, E pinned at R3
  ('aaaaaaaa-0000-0000-0000-000000000009', '99999999-0000-0000-0000-000000000004', '77777777-0000-0000-0000-0000000000e3', '66666666-0000-0000-0000-00000000000e', 1, 'Question E text R3', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('e1', 32), 'canonical_payload_v1'),
  -- S5: sanaa student on the Aden model
  ('aaaaaaaa-0000-0000-0000-00000000000a', '99999999-0000-0000-0000-000000000005', '77777777-0000-0000-0000-0000000000e3', '66666666-0000-0000-0000-00000000000e', 1, 'Question E text R3', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('e1', 32), 'canonical_payload_v1'),
  -- S6: student B
  ('aaaaaaaa-0000-0000-0000-00000000000b', '99999999-0000-0000-0000-000000000006', '77777777-0000-0000-0000-0000000000b1', '66666666-0000-0000-0000-00000000000b', 1, 'Question B text', '[]'::jsonb, 1, 'REVISION_PINNED', repeat('e1', 32), 'canonical_payload_v1');

INSERT INTO public.exam_session_answers (session_id, exam_session_question_id, question_id, question_revision_id,
  selected_option_code, answered_at, is_correct, requires_manual_review, grading_status, max_score, final_score) VALUES
  ('99999999-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '66666666-0000-0000-0000-00000000000a', '77777777-0000-0000-0000-0000000000a1', 'B', now() - interval '10 days', false, false, 'GRADED', 1, 0),
  -- B: no answer row at all ⇒ BLANK
  ('99999999-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', '66666666-0000-0000-0000-00000000000c', '77777777-0000-0000-0000-0000000000c1', 'A', now() - interval '10 days', true, false, 'GRADED', 1, 1),
  ('99999999-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004', '66666666-0000-0000-0000-00000000000f', '77777777-0000-0000-0000-0000000000f1', 'C', now() - interval '10 days', false, false, 'GRADED', 1, 0),
  ('99999999-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000005', '66666666-0000-0000-0000-00000000000a', '77777777-0000-0000-0000-0000000000a1', 'B', now() - interval '5 days', false, false, 'GRADED', 1, 0),
  ('99999999-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000006', '66666666-0000-0000-0000-00000000000d', '77777777-0000-0000-0000-0000000000d1', 'B', now() - interval '5 days', false, false, 'GRADED', 1, 0),
  ('99999999-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000007', '66666666-0000-0000-0000-00000000000a', '77777777-0000-0000-0000-0000000000a1', 'B', now() - interval '1 day', false, false, 'GRADED', 1, 0),
  ('99999999-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000008', '66666666-0000-0000-0000-00000000000d', '77777777-0000-0000-0000-0000000000d1', 'A', now() - interval '1 day', true, false, 'GRADED', 1, 1),
  ('99999999-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000009', '66666666-0000-0000-0000-00000000000e', '77777777-0000-0000-0000-0000000000e3', 'B', now() - interval '3 days', false, false, 'GRADED', 1, 0),
  ('99999999-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-00000000000a', '66666666-0000-0000-0000-00000000000e', '77777777-0000-0000-0000-0000000000e3', 'B', now() - interval '2 days', false, false, 'GRADED', 1, 0),
  ('99999999-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-00000000000b', '66666666-0000-0000-0000-00000000000b', '77777777-0000-0000-0000-0000000000b1', 'B', now() - interval '4 days', false, false, 'GRADED', 1, 0);

-- ------------------------------------------------- bulk set for pagination --
INSERT INTO public.questions (id, code, question_text, options, correct_index, question_type, subject_id, created_by)
SELECT ('0000f000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'Q-BULK-' || i, 'Bulk ' || i,
       '[]'::jsonb, -1, 'lesson', '33333333-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111'
FROM generate_series(1, 1205) i;

INSERT INTO public.question_revisions (id, question_id, revision_number, status, interaction_type, grading_mode,
  question_text, max_score, allow_partial, requires_media, manual_grading_required, created_by,
  published_at, published_by, payload_hash, payload_hash_version)
SELECT ('0000e000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       ('0000f000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       1, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Bulk ' || i, 1, false, false, false,
       '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111',
       md5(i::text) || md5((i + 100000)::text), 'canonical_payload_v1'
FROM generate_series(1, 1205) i;

INSERT INTO public.exam_session_questions (id, exam_session_id, question_revision_id, logical_question_id,
  question_order, rendered_question_text, rendered_options, max_score, pin_mode, payload_hash, payload_hash_version)
SELECT ('0000d000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       '99999999-0000-0000-0000-000000000007',
       ('0000e000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       ('0000f000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       i, 'Bulk ' || i, '[]'::jsonb, 1, 'REVISION_PINNED',
       md5(i::text) || md5((i + 200000)::text), 'canonical_payload_v1'
FROM generate_series(1, 1205) i;

INSERT INTO public.exam_session_answers (session_id, exam_session_question_id, question_id, question_revision_id,
  selected_option_code, answered_at, is_correct, requires_manual_review, grading_status, max_score, final_score)
SELECT '99999999-0000-0000-0000-000000000007',
       ('0000d000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       ('0000f000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       ('0000e000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       'B', now() - interval '20 days', false, false, 'GRADED', 1, 0
FROM generate_series(1, 1205) i;

SET session_replication_role = origin;

-- =============================================================================
-- assertions
-- =============================================================================
CREATE OR REPLACE FUNCTION pg_temp.chk(p_name text, p_ok boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% %', CASE WHEN p_ok THEN 'PASS ' ELSE 'FAIL ' END, p_name;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.item(p jsonb, q text)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM jsonb_array_elements(p->'items') e WHERE e->>'question_id' = q LIMIT 1
$$;

-- ---- student A --------------------------------------------------------------
DO $$
DECLARE v jsonb; a jsonb; b jsonb; d jsonb; f jsonb; e5 jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  v := public.list_my_mistakes(NULL, NULL, 'ALL', 'ALL', 'recent', 100, 0);

  a := pg_temp.item(v, '66666666-0000-0000-0000-00000000000a');
  b := pg_temp.item(v, '66666666-0000-0000-0000-00000000000b');
  d := pg_temp.item(v, '66666666-0000-0000-0000-00000000000d');
  f := pg_temp.item(v, '66666666-0000-0000-0000-00000000000f');
  e5 := pg_temp.item(v, '66666666-0000-0000-0000-00000000000e');

  PERFORM pg_temp.chk('15B student A sees own mistakes (ALLOW)', a IS NOT NULL);
  PERFORM pg_temp.chk('15B wrong question INCLUDED', a->>'latest_state' = 'WRONG');
  PERFORM pg_temp.chk('15B blank question INCLUDED (missing answer row)',
    b IS NOT NULL AND b->>'latest_state' = 'BLANK' AND (b->>'blank_count')::int = 1);
  PERFORM pg_temp.chk('15B correct-only question EXCLUDED',
    pg_temp.item(v, '66666666-0000-0000-0000-00000000000c') IS NULL);
  PERFORM pg_temp.chk('15B same question wrong 3 times ⇒ occurrence_count = 3',
    (a->>'occurrence_count')::int = 3 AND (a->>'wrong_count')::int = 3
    AND (a->>'has_repeated_mistake')::boolean);
  PERFORM pg_temp.chk('15B wrong then correct ⇒ MASTERED_LATER (history kept)',
    d->>'latest_state' = 'MASTERED_LATER' AND (d->>'occurrence_count')::int = 1);
  PERFORM pg_temp.chk('15B question without lesson target NOT DROPPED',
    f IS NOT NULL AND f->>'lesson_id' IS NULL AND (f->>'can_review_lesson')::boolean = false);
  PERFORM pg_temp.chk('15B historical occurrence keeps R3 after R4 publish',
    e5->>'display_revision_id' = '77777777-0000-0000-0000-0000000000e3');
  PERFORM pg_temp.chk('15B historical lesson attribution follows the pinned revision',
    e5->>'lesson_id' = '55555555-0000-0000-0000-000000000001');
  PERFORM pg_temp.chk('15B ministerial attempt is labelled for the review action',
    e5->>'latest_attempt_scope' = 'MINISTERIAL' AND e5->>'latest_session_id' IS NOT NULL);
  PERFORM pg_temp.chk('15B student A never sees student B rows',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'items') e
                WHERE e->>'latest_session_id' = '99999999-0000-0000-0000-000000000006'));

  PERFORM pg_temp.chk('15B answer key payload ZERO', v::text NOT ILIKE '%correct_option%'
    AND v::text NOT ILIKE '%answer_key%' AND v::text NOT ILIKE '%accepted_answer%');
  PERFORM pg_temp.chk('15B is_correct payload ZERO', v::text NOT ILIKE '%is_correct%');
  PERFORM pg_temp.chk('15B hidden solution payload ZERO', v::text NOT ILIKE '%solution%');
END $$;

-- ---- filters, sort, pagination ---------------------------------------------
DO $$
DECLARE v jsonb; v2 jsonb; v3 jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

  v := public.list_my_mistakes(NULL, NULL, 'ALL', 'ALL', 'recent', 20, 0);
  PERFORM pg_temp.chk('15B pagination >1000 records: total is complete, page is bounded',
    (v->>'total')::int = 1210 AND jsonb_array_length(v->'items') = 20 AND (v->>'has_more')::boolean);

  v2 := public.list_my_mistakes(NULL, NULL, 'ALL', 'ALL', 'recent', 100, 1100);
  PERFORM pg_temp.chk('15B deep offset returns rows (NO TRUNCATION at 1000)',
    jsonb_array_length(v2->'items') = 100);

  v3 := public.list_my_mistakes(NULL, NULL, 'ALL', 'ALL', 'recent', 500, 0);
  PERFORM pg_temp.chk('15B limit is clamped server-side', (v3->>'limit')::int = 100);

  PERFORM pg_temp.chk('15B status filter BLANK',
    (SELECT count(*) FROM jsonb_array_elements(
        (public.list_my_mistakes(NULL, NULL, 'ALL', 'BLANK', 'recent', 100, 0))->'items') e
     WHERE e->>'latest_state' <> 'BLANK') = 0);

  PERFORM pg_temp.chk('15B status filter REPEATED',
    (SELECT count(*) FROM jsonb_array_elements(
        (public.list_my_mistakes(NULL, NULL, 'ALL', 'REPEATED', 'recent', 100, 0))->'items') e) = 1);

  PERFORM pg_temp.chk('15B status filter MASTERED_LATER',
    (SELECT count(*) FROM jsonb_array_elements(
        (public.list_my_mistakes(NULL, NULL, 'ALL', 'MASTERED_LATER', 'recent', 100, 0))->'items') e) = 1);

  PERFORM pg_temp.chk('15B scope MINISTERIAL isolates ministerial occurrences',
    (SELECT count(*) FROM jsonb_array_elements(
        (public.list_my_mistakes(NULL, NULL, 'MINISTERIAL', 'ALL', 'recent', 100, 0))->'items') e) = 1);

  PERFORM pg_temp.chk('15B scope ORDINARY excludes ministerial',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
        (public.list_my_mistakes(NULL, NULL, 'ORDINARY', 'ALL', 'recent', 100, 0))->'items') e
      WHERE e->>'latest_attempt_scope' = 'MINISTERIAL'));

  PERFORM pg_temp.chk('15B most_repeated sort puts the 3x question first',
    ((public.list_my_mistakes(NULL, NULL, 'ALL', 'ALL', 'most_repeated', 20, 0))->'items'->0->>'question_id')
      = '66666666-0000-0000-0000-00000000000a');

  PERFORM pg_temp.chk('15B lesson filter narrows by historical lesson',
    (SELECT count(*) FROM jsonb_array_elements(
       (public.list_my_mistakes(NULL, '55555555-0000-0000-0000-000000000002', 'ALL', 'ALL', 'recent', 100, 0))->'items') e) = 1);

  PERFORM pg_temp.chk('15B invalid filter rejected',
    (SELECT NOT EXISTS (SELECT 1 FROM (SELECT public.list_my_mistakes(NULL, NULL, 'HACK', 'ALL', 'recent', 5, 0)) z)) IS NOT NULL);
END $$;

-- ---- detail RPC -------------------------------------------------------------
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  v := public.get_my_mistake_detail('66666666-0000-0000-0000-00000000000a');
  PERFORM pg_temp.chk('15B detail returns historical occurrences',
    jsonb_array_length(v->'occurrences') = 3);
  PERFORM pg_temp.chk('15B detail exposes displayed options without correctness',
    jsonb_array_length(v->'displayed_options') = 2
    AND v->'displayed_options'->0->>'option_code' = 'A'
    AND (v->'displayed_options'->0) ? 'body'
    AND NOT ((v->'displayed_options'->0) ? 'is_correct'));
  PERFORM pg_temp.chk('15B detail keeps the student selection only',
    v->>'my_selected_option_code' = 'B');
  PERFORM pg_temp.chk('15B detail answer secrecy',
    v::text NOT ILIKE '%is_correct%' AND v::text NOT ILIKE '%correct_option%'
    AND v::text NOT ILIKE '%solution%');
END $$;

-- ---- student B / cross-student ----------------------------------------------
DO $$
DECLARE v jsonb; ok boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '55555555-2222-2222-2222-222222222222', true);
  v := public.list_my_mistakes(NULL, NULL, 'ALL', 'ALL', 'recent', 100, 0);
  PERFORM pg_temp.chk('15B student B sees only own mistake (DENY cross-student)',
    (v->>'total')::int = 1);

  BEGIN
    PERFORM public.get_my_mistake_detail('66666666-0000-0000-0000-00000000000d');
  EXCEPTION WHEN others THEN ok := true;
  END;
  PERFORM pg_temp.chk('15B detail of another student question DENIED', ok);
END $$;

-- ---- ministerial track isolation --------------------------------------------
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  v := public.list_my_mistakes(NULL, NULL, 'ALL', 'ALL', 'recent', 100, 0);
  PERFORM pg_temp.chk('15B Sanaa student gets NO history from an Aden model (cross-track DENY)',
    (v->>'total')::int = 0);
END $$;

-- ---- anon -------------------------------------------------------------------
DO $$
DECLARE ok boolean := false; ok2 boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN PERFORM public.list_my_mistakes(); EXCEPTION WHEN others THEN ok := true; END;
  PERFORM pg_temp.chk('15B anon list DENIED', ok);
  BEGIN PERFORM public.get_my_mistake_detail('66666666-0000-0000-0000-00000000000a');
  EXCEPTION WHEN others THEN ok2 := true; END;
  PERFORM pg_temp.chk('15B anon detail DENIED', ok2);
END $$;

-- ---- grants -----------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.chk('15B RPCs are not executable by anon',
    NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('list_my_mistakes', 'get_my_mistake_detail', '_my_mistakes_safe_options')
        AND has_function_privilege('anon', p.oid, 'EXECUTE')
    ));
  PERFORM pg_temp.chk('15B no new mistake table was created',
    NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name ILIKE '%mistake%'
    ));
END $$;

-- =============================================================================
-- 15B-A admin insights
-- =============================================================================
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.topq(p jsonb, q text)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT e FROM jsonb_array_elements(p->'top_questions') e WHERE e->>'question_id' = q LIMIT 1
$$;

DO $$
DECLARE v jsonb; a jsonb; d jsonb; sv jsonb; ok boolean := false; stu jsonb; sa jsonb;
BEGIN
  -- anon DENY
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN PERFORM public.get_admin_mistake_insights(); EXCEPTION WHEN others THEN ok := true; END;
  PERFORM pg_temp.chk('15B-A ANON_ADMIN_RPC DENY', ok);

  -- student DENY
  ok := false;
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  BEGIN PERFORM public.get_admin_mistake_insights(); EXCEPTION WHEN others THEN ok := true; END;
  PERFORM pg_temp.chk('15B-A STUDENT_ADMIN_RPC DENY', ok);

  -- admin ALLOW
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  v := public.get_admin_mistake_insights(NULL, NULL, NULL, NULL, 'ALL', NULL, NULL, 100);
  PERFORM pg_temp.chk('15B-A ADMIN_ALLOW', v IS NOT NULL AND v ? 'summary');

  PERFORM pg_temp.chk('15B-A AGGREGATION summary is populated',
    (v->'summary'->>'total_mistake_occurrences')::int > 0
    AND (v->'summary'->>'unique_questions_with_mistakes')::int > 0
    AND (v->'summary'->>'repeated_mistakes')::int >= 1);

  a := pg_temp.topq(v, '66666666-0000-0000-0000-00000000000a');
  -- D lives in Lesson Two; scope the query so it is inside the top list
  d := pg_temp.topq(public.get_admin_mistake_insights(NULL, NULL, NULL,
         '55555555-0000-0000-0000-000000000002', 'ALL', NULL, NULL, 100),
         '66666666-0000-0000-0000-00000000000d');
  PERFORM pg_temp.chk('15B-A top_questions exposes safe preview + counters',
    a IS NOT NULL AND (a->>'wrong_count')::int = 3 AND (a->>'attempt_count')::int = 3
    AND (a->>'wrong_percentage')::numeric = 100.00 AND a ? 'question_preview');
  PERFORM pg_temp.chk('15B-A mastered later is reported per question',
    d IS NOT NULL AND (d->>'mastered_later_count')::int = 1
    AND (d->>'mastered_later_percentage')::numeric = 100.00);

  -- STUDENT_ADMIN_METRIC_PARITY (question A, single student dataset)
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  stu := public.list_my_mistakes(NULL, NULL, 'ALL', 'ALL', 'recent', 100, 0);
  sa := pg_temp.item(stu, '66666666-0000-0000-0000-00000000000a');
  PERFORM set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  PERFORM pg_temp.chk('15B-A STUDENT_ADMIN_METRIC_PARITY',
    (sa->>'wrong_count')::int = (a->>'wrong_count')::int
    AND (sa->>'occurrence_count')::int = (a->>'mistake_occurrences')::int
    AND (sa->>'blank_count')::int = (a->>'blank_count')::int);

  -- facet breakdowns
  PERFORM pg_temp.chk('15B-A by_subject / by_lesson / by_grade / by_track present',
    jsonb_array_length(v->'by_subject') >= 1 AND jsonb_array_length(v->'by_lesson') >= 1
    AND jsonb_array_length(v->'by_grade') >= 1 AND jsonb_array_length(v->'by_track') >= 1);

  -- filters
  sv := public.get_admin_mistake_insights(NULL, NULL, '33333333-0000-0000-0000-000000000004', NULL, 'ALL', NULL, NULL, 100);
  PERFORM pg_temp.chk('15B-A SUBJECT_FILTER',
    (sv->'summary'->>'total_mistake_occurrences')::int > 0
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(sv->'by_subject') e
                    WHERE e->>'subject_id' <> '33333333-0000-0000-0000-000000000004'));

  sv := public.get_admin_mistake_insights(NULL, NULL, NULL, '55555555-0000-0000-0000-000000000002', 'ALL', NULL, NULL, 100);
  PERFORM pg_temp.chk('15B-A LESSON_FILTER',
    NOT EXISTS (SELECT 1 FROM jsonb_array_elements(sv->'by_lesson') e
                WHERE e->>'lesson_id' <> '55555555-0000-0000-0000-000000000002'));

  sv := public.get_admin_mistake_insights('33333333-0000-0000-0000-000000000003', NULL, NULL, NULL, 'ALL', NULL, NULL, 100);
  PERFORM pg_temp.chk('15B-A GRADE_FILTER',
    (sv->'summary'->>'total_mistake_occurrences')::int > 0
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(sv->'by_grade') e
                    WHERE e->>'grade_id' <> '33333333-0000-0000-0000-000000000003'));

  sv := public.get_admin_mistake_insights(NULL, '33333333-0000-0000-0000-000000000002', NULL, NULL, 'ALL', NULL, NULL, 100);
  PERFORM pg_temp.chk('15B-A TRACK_FILTER isolates the Sanaa track',
    (sv->'summary'->>'total_mistake_occurrences')::int = 0);

  sv := public.get_admin_mistake_insights(NULL, NULL, NULL, NULL, 'MINISTERIAL', NULL, NULL, 100);
  PERFORM pg_temp.chk('15B-A attempt scope filter works',
    (sv->'summary'->>'unique_questions_with_mistakes')::int >= 1);

  sv := public.get_admin_mistake_insights(NULL, NULL, NULL, NULL, 'ALL', now() - interval '1 hour', NULL, 100);
  PERFORM pg_temp.chk('15B-A date range filter works',
    (sv->'summary'->>'total_mistake_occurrences')::int = 0);

  -- privacy + secrecy
  PERFORM pg_temp.chk('15B-A STUDENT_PRIVACY: no identities in payload',
    v::text NOT ILIKE '%user_id%' AND v::text NOT ILIKE '%full_name%'
    AND v::text NOT ILIKE '%Student A%' AND v::text NOT ILIKE '%@example.test%');
  PERFORM pg_temp.chk('15B-A ANSWER_LEAK ZERO',
    v::text NOT ILIKE '%is_correct%' AND v::text NOT ILIKE '%correct_option%'
    AND v::text NOT ILIKE '%answer_key%' AND v::text NOT ILIKE '%solution%');
END $$;

DO $$
BEGIN
  PERFORM pg_temp.chk('15B-A admin RPC not executable by anon',
    NOT has_function_privilege('anon', 'public.get_admin_mistake_insights(uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,int)', 'EXECUTE'));
END $$;
