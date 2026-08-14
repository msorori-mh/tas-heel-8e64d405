-- =============================================================================
-- 14F / 14G — runtime smoke on a disposable PostgreSQL 17 cluster.
-- Seeds two tracks (Aden / Sanaa), two students, historical models and
-- graded/pending sessions, then asserts analytics scope + answer secrecy.
-- Triggers are disabled during seeding only (analytics is read-only).
-- =============================================================================
\set ON_ERROR_STOP on

SET session_replication_role = replica;

-- ------------------------------------------------------------------- actors --
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'staff@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'aden@example.test'),
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

INSERT INTO public.subject_curriculum_tracks (subject_id, curriculum_track_id, is_active, created_by) VALUES
  ('33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000001', true, '11111111-1111-1111-1111-111111111111'),
  ('33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000002', true, '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (user_id, full_name, grade_id, grade_uuid, curriculum_track_id) VALUES
  ('22222222-2222-2222-2222-222222222222', 'Aden Student', 'g12', '33333333-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000001'),
  ('44444444-4444-4444-4444-444444444444', 'Sanaa Student', 'g12', '33333333-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

-- lessons: L1 = historical (R3) target, L2 = current (R4) target
INSERT INTO public.lessons (id, subject_id, slug, title) VALUES
  ('55555555-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000004', 'l1', 'Lesson One'),
  ('55555555-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000004', 'l2', 'Lesson Two')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- questions --
INSERT INTO public.questions (id, code, question_text, options, correct_index, question_type, subject_id, created_by) VALUES
  ('66666666-0000-0000-0000-00000000000a', 'Q-A', 'QA', '[]'::jsonb, -1, 'lesson', '33333333-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111'),
  ('66666666-0000-0000-0000-00000000000b', 'Q-B', 'QB', '[]'::jsonb, -1, 'lesson', '33333333-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111'),
  ('66666666-0000-0000-0000-00000000000c', 'Q-C', 'QC', '[]'::jsonb, -1, 'lesson', '33333333-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

-- revisions: rA1 (historical, targets L1), rA2 (current, targets L2)
INSERT INTO public.question_revisions (id, question_id, revision_number, status, interaction_type, grading_mode,
  question_text, max_score, allow_partial, requires_media, manual_grading_required, created_by,
  published_at, published_by, payload_hash, payload_hash_version) VALUES
  ('77777777-0000-0000-0000-0000000000a1', '66666666-0000-0000-0000-00000000000a', 1, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question A text', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('a1', 32), 'canonical_payload_v1'),
  ('77777777-0000-0000-0000-0000000000a2', '66666666-0000-0000-0000-00000000000a', 2, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question A text v2', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('a2', 32), 'canonical_payload_v1'),
  ('77777777-0000-0000-0000-0000000000b1', '66666666-0000-0000-0000-00000000000b', 1, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'Question B text', 1, false, false, false, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('b1', 32), 'canonical_payload_v1'),
  ('77777777-0000-0000-0000-0000000000c1', '66666666-0000-0000-0000-00000000000c', 1, 'PUBLISHED', 'MANUAL_TEXT', 'MANUAL', 'Question C text', 1, false, false, true, '11111111-1111-1111-1111-111111111111', now(), '11111111-1111-1111-1111-111111111111', repeat('c1', 32), 'canonical_payload_v1')
ON CONFLICT DO NOTHING;


INSERT INTO public.question_targets (question_id, revision_id, target_type, subject_id, lesson_id, is_primary, created_by) VALUES
  ('66666666-0000-0000-0000-00000000000a', '77777777-0000-0000-0000-0000000000a1', 'LESSON', '33333333-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000001', true, '11111111-1111-1111-1111-111111111111'),
  ('66666666-0000-0000-0000-00000000000a', '77777777-0000-0000-0000-0000000000a2', 'LESSON', '33333333-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000002', true, '11111111-1111-1111-1111-111111111111'),
  ('66666666-0000-0000-0000-00000000000b', '77777777-0000-0000-0000-0000000000b1', 'LESSON', '33333333-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000002', true, '11111111-1111-1111-1111-111111111111');
-- Question C intentionally has NO primary lesson target (unlinked bucket).

-- ------------------------------------------------------------------- models --
-- Aden: 2021 R3, 2024 R1 (question A repeats in both) — Sanaa: 2022 R1 (question A once)
INSERT INTO public.ministerial_exam_models (id, subject_id, curriculum_track_id, academic_year, round_code,
  model_code, status, published_at, created_by) VALUES
  ('88888888-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000001', 2021, 'r3', 'MIN-ADEN-2021-R3', 'published', now() - interval '3 years', '11111111-1111-1111-1111-111111111111'),
  ('88888888-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000001', 2024, 'r1', 'MIN-ADEN-2024-R1', 'published', now() - interval '1 year', '11111111-1111-1111-1111-111111111111'),
  ('88888888-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000002', 2022, 'r1', 'MIN-SANAA-2022-R1', 'published', now() - interval '2 years', '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

INSERT INTO public.ministerial_exam_questions (model_id, question_id, published_revision_id, sort_order, marks) VALUES
  ('88888888-0000-0000-0000-000000000001', '66666666-0000-0000-0000-00000000000a', '77777777-0000-0000-0000-0000000000a1', 1, 1),
  ('88888888-0000-0000-0000-000000000001', '66666666-0000-0000-0000-00000000000b', '77777777-0000-0000-0000-0000000000b1', 2, 1),
  ('88888888-0000-0000-0000-000000000002', '66666666-0000-0000-0000-00000000000a', '77777777-0000-0000-0000-0000000000a2', 1, 1),
  ('88888888-0000-0000-0000-000000000003', '66666666-0000-0000-0000-00000000000a', '77777777-0000-0000-0000-0000000000a1', 1, 1);

-- ----------------------------------------------------------------- sessions --
-- S1: Aden student, graded final, 50% of 2 points, training, historical R3 model
-- S2: Aden student, expired but graded final, 100% of 1 point, strict
-- S3: Aden student, submitted but manual review pending (excluded from averages)
-- S4: Sanaa student's session (must never appear for the Aden student)
INSERT INTO public.exam_sessions (id, user_id, ministerial_model_id, ministerial_attempt_mode, mode, status,
  grading_status, is_final, score, total_points, started_at, submitted_at, completed_at, total_questions) VALUES
  ('99999999-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000001', 'training', 'training', 'submitted', 'GRADED', true, 1, 2, now() - interval '2 hours', now() - interval '110 minutes', now() - interval '110 minutes', 2),
  ('99999999-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000002', 'strict', 'strict', 'expired', 'GRADED', true, 1, 1, now() - interval '1 hour', now() - interval '30 minutes', now() - interval '30 minutes', 1),
  ('99999999-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', '88888888-0000-0000-0000-000000000002', 'training', 'training', 'submitted', 'PENDING_MANUAL_REVIEW', false, NULL, 1, now() - interval '20 minutes', now() - interval '10 minutes', now() - interval '10 minutes', 1),
  ('99999999-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', '88888888-0000-0000-0000-000000000003', 'strict', 'strict', 'submitted', 'GRADED', true, 1, 1, now() - interval '5 hours', now() - interval '4 hours', now() - interval '4 hours', 1);

INSERT INTO public.exam_session_questions (id, exam_session_id, question_revision_id, logical_question_id,
  question_order, rendered_question_text, rendered_options, max_score, pin_mode) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', '77777777-0000-0000-0000-0000000000a1', '66666666-0000-0000-0000-00000000000a', 1, 'Question A text', '[]'::jsonb, 1, 'PUBLISHED'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '99999999-0000-0000-0000-000000000001', '77777777-0000-0000-0000-0000000000b1', '66666666-0000-0000-0000-00000000000b', 2, 'Question B text', '[]'::jsonb, 1, 'PUBLISHED'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '99999999-0000-0000-0000-000000000002', '77777777-0000-0000-0000-0000000000a2', '66666666-0000-0000-0000-00000000000a', 1, 'Question A text v2', '[]'::jsonb, 1, 'PUBLISHED'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '99999999-0000-0000-0000-000000000003', '77777777-0000-0000-0000-0000000000c1', '66666666-0000-0000-0000-00000000000c', 1, 'Question C text', '[]'::jsonb, 1, 'PUBLISHED'),
  ('aaaaaaaa-0000-0000-0000-000000000005', '99999999-0000-0000-0000-000000000004', '77777777-0000-0000-0000-0000000000a1', '66666666-0000-0000-0000-00000000000a', 1, 'Question A text', '[]'::jsonb, 1, 'PUBLISHED');

INSERT INTO public.exam_session_answers (session_id, exam_session_question_id, question_id, question_revision_id,
  selected_option_code, answered_at, is_correct, requires_manual_review, grading_status, max_score, final_score) VALUES
  ('99999999-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '66666666-0000-0000-0000-00000000000a', '77777777-0000-0000-0000-0000000000a1', 'A', now() - interval '115 minutes', true, false, 'GRADED', 1, 1),
  ('99999999-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', '66666666-0000-0000-0000-00000000000b', '77777777-0000-0000-0000-0000000000b1', NULL, NULL, false, false, 'GRADED', 1, 0),
  ('99999999-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000003', '66666666-0000-0000-0000-00000000000a', '77777777-0000-0000-0000-0000000000a2', 'B', now() - interval '40 minutes', true, false, 'GRADED', 1, 1),
  ('99999999-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000004', '66666666-0000-0000-0000-00000000000c', '77777777-0000-0000-0000-0000000000c1', 'X', now() - interval '15 minutes', NULL, true, 'PENDING_MANUAL_REVIEW', 1, NULL),
  ('99999999-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000005', '66666666-0000-0000-0000-00000000000a', '77777777-0000-0000-0000-0000000000a1', 'A', now() - interval '4 hours', true, false, 'GRADED', 1, 1);

SET session_replication_role = origin;

-- =============================================================================
-- assertions
-- =============================================================================
CREATE OR REPLACE FUNCTION pg_temp.chk(p_name text, p_ok boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '% %', CASE WHEN p_ok THEN 'PASS ' ELSE 'FAIL ' END, p_name;
END $$;

-- ---- Aden student -----------------------------------------------------------
DO $$
DECLARE v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  v := public.get_ministerial_performance_overview();

  PERFORM pg_temp.chk('14F attempts include expired+graded session',
    (v->'summary'->>'attempts_count')::int = 3);
  PERFORM pg_temp.chk('14F graded finals exclude manual-pending session',
    (v->'summary'->>'graded_attempts_count')::int = 2);
  PERFORM pg_temp.chk('14F pending_manual_count surfaces separately',
    (v->'summary'->>'pending_manual_count')::int = 1);
  PERFORM pg_temp.chk('14F averages compare percentages not raw scores',
    (v->'summary'->>'avg_percentage')::numeric = 75.0
    AND (v->'summary'->>'best_percentage')::numeric = 100.0);
  PERFORM pg_temp.chk('14F training vs strict split present',
    jsonb_array_length(v->'by_mode') = 2);
  PERFORM pg_temp.chk('14F historical R3 target used (Lesson One counted)',
    EXISTS (SELECT 1 FROM jsonb_array_elements(v->'by_lesson') e
            WHERE e->>'lesson_title' = 'Lesson One'));
  PERFORM pg_temp.chk('14F manual question is not counted as wrong',
    (SELECT coalesce(sum((e->>'wrong')::int), 0) FROM jsonb_array_elements(v->'by_lesson') e) = 0);
  PERFORM pg_temp.chk('14F question without primary lesson target is not dropped',
    (v->'patterns'->>'unlinked_questions_count')::int = 1);
  PERFORM pg_temp.chk('14F payload carries no answer key',
    v::text NOT ILIKE '%correct_option%' AND v::text NOT ILIKE '%is_correct%');
END $$;

-- ---- track isolation --------------------------------------------------------
DO $$
DECLARE v jsonb; v2 jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  v := public.get_ministerial_performance_overview();
  PERFORM pg_temp.chk('14F student sees only own sessions',
    (v->'summary'->>'attempts_count')::int = 1);

  v2 := public.list_repeated_ministerial_questions('33333333-0000-0000-0000-000000000004', 2, NULL);
  PERFORM pg_temp.chk('14G Sanaa gets no repeats from Aden models',
    jsonb_array_length(v2) = 0);
END $$;

DO $$
DECLARE v jsonb; r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  v := public.list_repeated_ministerial_questions('33333333-0000-0000-0000-000000000004', 2, NULL);
  PERFORM pg_temp.chk('14G repeated question detected in Aden track',
    jsonb_array_length(v) = 1);
  r := v->0;
  PERFORM pg_temp.chk('14G occurrence_count counts distinct models',
    (r->>'occurrence_count')::int = 2);
  PERFORM pg_temp.chk('14G occurrences keep historical pinned revisions',
    (SELECT count(DISTINCT e->>'published_revision_id') FROM jsonb_array_elements(r->'occurrences') e) = 2);
  PERFORM pg_temp.chk('14G display revision is deterministic (latest year)',
    r->>'display_revision_id' = '77777777-0000-0000-0000-0000000000a2');
  PERFORM pg_temp.chk('14G years listed',
    r->'years' @> '[2021, 2024]'::jsonb);
  PERFORM pg_temp.chk('14G lesson link exposed for review button',
    r->>'lesson_id' = '55555555-0000-0000-0000-000000000002');
  PERFORM pg_temp.chk('14G payload has no answer key',
    v::text NOT ILIKE '%is_correct%' AND v::text NOT ILIKE '%option%');
  PERFORM pg_temp.chk('14G min occurrence filter respected',
    jsonb_array_length(public.list_repeated_ministerial_questions('33333333-0000-0000-0000-000000000004', 3, NULL)) = 0);
  PERFORM pg_temp.chk('14G year filter respected',
    jsonb_array_length(public.list_repeated_ministerial_questions('33333333-0000-0000-0000-000000000004', 2, 2023)) = 0);
  PERFORM pg_temp.chk('14G subject rollup available',
    (SELECT count(*) FROM public.list_repeated_ministerial_subjects()) = 1);
END $$;

-- ---- anon -------------------------------------------------------------------
DO $$
DECLARE v jsonb; ok boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    v := public.get_ministerial_performance_overview();
  EXCEPTION WHEN others THEN ok := true;
  END;
  PERFORM pg_temp.chk('14F anon denied', ok);

  ok := false;
  BEGIN
    v := public.list_repeated_ministerial_questions('33333333-0000-0000-0000-000000000004', 2, NULL);
  EXCEPTION WHEN others THEN ok := true;
  END;
  PERFORM pg_temp.chk('14G anon denied', ok);
END $$;

-- ---- grants -----------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.chk('analytics RPCs are not executable by anon',
    NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('get_ministerial_performance_overview',
                          'list_repeated_ministerial_questions',
                          'list_repeated_ministerial_subjects',
                          'current_student_track_id')
        AND has_function_privilege('anon', p.oid, 'EXECUTE')
    ));
END $$;
