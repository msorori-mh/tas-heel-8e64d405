-- =============================================================================
-- MINISTERIAL_EXAMS_END_TO_END_CLOSURE_14H — runtime smoke (disposable PG17).
-- Drives the real RPC chain: M01 → M02 → publish → student attempts →
-- results → 14F analytics → 14G repeated questions, plus security closure.
-- Emits PASS/FAIL lines consumed by the rehearsal runner.
-- =============================================================================
\set ON_ERROR_STOP off
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION pg_temp.chk(_name text, _expected text, _actual text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _expected IS NOT DISTINCT FROM _actual THEN
    RAISE NOTICE 'PASS  %', _name;
  ELSE
    RAISE NOTICE 'FAIL  % (expected=% actual=%)', _name, _expected, _actual;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION pg_temp.actor(_uid uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid::text, false);
END; $$;

DO $outer$
DECLARE
  c_staff    uuid := 'aaaa0000-0000-0000-0000-000000000001';
  c_pub      uuid := 'aaaa0000-0000-0000-0000-000000000002';
  c_stu_s    uuid := 'aaaa0000-0000-0000-0000-000000000003';
  c_stu_a    uuid := 'aaaa0000-0000-0000-0000-000000000004';
  c_grade    uuid := 'bbbb0000-0000-0000-0000-000000000001';
  c_subject  uuid := 'bbbb0000-0000-0000-0000-000000000002';
  c_lesson1  uuid := 'bbbb0000-0000-0000-0000-000000000003';
  c_lesson2  uuid := 'bbbb0000-0000-0000-0000-000000000004';
  c_q1       uuid := 'cccc0000-0000-0000-0000-000000000001';
  c_q2       uuid := 'cccc0000-0000-0000-0000-000000000002';
  c_q3       uuid := 'cccc0000-0000-0000-0000-000000000003';
  c_q1r1     uuid := 'dddd0000-0000-0000-0000-000000000011';
  c_q1r2     uuid := 'dddd0000-0000-0000-0000-000000000012';
  c_q2r1     uuid := 'dddd0000-0000-0000-0000-000000000021';
  c_q3r1     uuid := 'dddd0000-0000-0000-0000-000000000031';

  v_sanaa uuid; v_aden uuid;
  v_res jsonb; v_prep uuid;
  v_m2022 uuid; v_m2024 uuid; v_m2025 uuid; v_ma2025 uuid;
  v_tpl2025 uuid;
  v_sess uuid; v_sess2 uuid; v_sess3 uuid; v_sess_manual uuid;
  v_state jsonb; v_result jsonb; v_result2 jsonb; v_reveal jsonb;
  v_esq1 uuid; v_esq2 uuid;
  v_txt text; v_err text; v_int int; v_num numeric; v_bool boolean;
  v_exp timestamptz; v_completed timestamptz;
BEGIN
-- ===========================================================================
-- 0. SEED (triggers off — data setup only, never exercised behaviour)
-- ===========================================================================
SET session_replication_role = replica;

INSERT INTO auth.users (id, email) VALUES
  (c_staff, 'staff14h@test.local'),
  (c_pub,   'pub14h@test.local'),
  (c_stu_s, 'sanaa14h@test.local'),
  (c_stu_a, 'aden14h@test.local')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  (c_staff, 'content_manager'), (c_pub, 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.curriculum_tracks (track_code, track_name, is_active)
VALUES ('sanaa', 'منهج صنعاء', true), ('aden', 'منهج عدن', true)
ON CONFLICT (track_code) DO NOTHING;
SELECT id INTO v_sanaa FROM public.curriculum_tracks WHERE track_code = 'sanaa';
SELECT id INTO v_aden  FROM public.curriculum_tracks WHERE track_code = 'aden';

INSERT INTO public.grades (id, slug, name, category, sort_order, curriculum_track_id)
VALUES (c_grade, 'grade-12-14h', 'الثاني عشر', 'secondary', 1, NULL)
ON CONFLICT DO NOTHING;

-- Shared subject: no track column binding, membership through subject_curriculum_tracks.
INSERT INTO public.subjects (id, grade_id, slug, name, code, curriculum_track_id)
VALUES (c_subject, c_grade, 'physics-14h', 'فيزياء', 'sub-g12-001', NULL)
ON CONFLICT DO NOTHING;

INSERT INTO public.subject_curriculum_tracks (subject_id, curriculum_track_id, is_active)
VALUES (c_subject, v_sanaa, true), (c_subject, v_aden, true)
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (user_id, full_name, grade_id, grade_uuid, curriculum_track_id) VALUES
  (c_stu_s, 'طالب صنعاء', c_grade::text, c_grade, v_sanaa),
  (c_stu_a, 'طالب عدن',  c_grade::text, c_grade, v_aden),
  (c_staff, 'مشغل',      c_grade::text, c_grade, v_sanaa),
  (c_pub,   'ناشر',      c_grade::text, c_grade, v_sanaa)
ON CONFLICT DO NOTHING;

INSERT INTO public.lessons (id, subject_id, slug, title) VALUES
  (c_lesson1, c_subject, 'l1-14h', 'الدرس الأول'),
  (c_lesson2, c_subject, 'l2-14h', 'الدرس الثاني')
ON CONFLICT DO NOTHING;

INSERT INTO public.questions (id, code, question_text, options, correct_index, question_type,
                              subject_id, created_by, current_published_revision_id) VALUES
  (c_q1, 'qst-g12-001-0001', 'س1', '[]'::jsonb, -1, 'lesson', c_subject, c_staff, c_q1r1),
  (c_q2, 'qst-g12-001-0002', 'س2', '[]'::jsonb, -1, 'lesson', c_subject, c_staff, c_q2r1),
  (c_q3, 'qst-g12-001-0003', 'س3', '[]'::jsonb, -1, 'lesson', c_subject, c_staff, c_q3r1)
ON CONFLICT DO NOTHING;

INSERT INTO public.question_revisions (id, question_id, revision_number, status, interaction_type,
  grading_mode, question_text, max_score, allow_partial, requires_media, manual_grading_required,
  created_by, published_at, published_by, payload_hash, payload_hash_version) VALUES
  (c_q1r1, c_q1, 1, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'س1 نسخة R1', 1, false, false, false,
   c_staff, now(), c_pub, repeat('11', 32), 'canonical_payload_v1'),
  (c_q2r1, c_q2, 1, 'PUBLISHED', 'MANUAL_TEXT', 'MANUAL', 'س2 مقالي', 1, false, false, true,
   c_staff, now(), c_pub, repeat('21', 32), 'canonical_payload_v1'),
  (c_q3r1, c_q3, 1, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'س3 نسخة R1', 1, false, false, false,
   c_staff, now(), c_pub, repeat('31', 32), 'canonical_payload_v1')
ON CONFLICT DO NOTHING;

INSERT INTO public.question_options (question_revision_id, option_code, body, sort_order, is_correct) VALUES
  (c_q1r1, 'A', 'خيار أ', 1, true),
  (c_q1r1, 'B', 'خيار ب', 2, false),
  (c_q3r1, 'A', 'خيار أ', 1, false),
  (c_q3r1, 'B', 'خيار ب', 2, true)
ON CONFLICT DO NOTHING;

INSERT INTO public.question_solutions (question_revision_id, explanation, model_answer, reveal_policy, sort_order)
VALUES (c_q1r1, 'شرح النسخة R1', 'أ', 'after_attempt', 1)
ON CONFLICT DO NOTHING;

INSERT INTO public.question_targets (question_id, revision_id, target_type, subject_id, lesson_id, is_primary, created_by) VALUES
  (c_q1, c_q1r1, 'LESSON', c_subject, c_lesson1, true, c_staff),
  (c_q2, c_q2r1, 'LESSON', c_subject, c_lesson1, true, c_staff),
  (c_q3, c_q3r1, 'LESSON', c_subject, c_lesson2, true, c_staff)
ON CONFLICT DO NOTHING;

SET session_replication_role = origin;

-- ===========================================================================
-- 1. OPERATOR FLOW — M01
-- ===========================================================================
PERFORM pg_temp.actor(c_staff);

v_res := public.ministerial_m01_prepare(jsonb_build_array(
  jsonb_build_object('subject_code','sub-g12-001','track_code','sanaa','academic_year',2022,'exam_round_code','r1','model_variant_code','main','model_label','صنعاء 2022'),
  jsonb_build_object('subject_code','sub-g12-001','track_code','sanaa','academic_year',2024,'exam_round_code','r1','model_variant_code','main','model_label','صنعاء 2024'),
  jsonb_build_object('subject_code','sub-g12-001','track_code','sanaa','academic_year',2025,'exam_round_code','r1','model_variant_code','main','model_label','صنعاء 2025'),
  jsonb_build_object('subject_code','sub-g12-001','track_code','aden','academic_year',2025,'exam_round_code','r1','model_variant_code','main','model_label','عدن 2025')
));
PERFORM pg_temp.chk('M01 prepare stages 4 inserts', '4', v_res->'summary'->>'insert');

v_prep := (v_res->>'prepare_id')::uuid;
v_res := public.ministerial_m01_execute(v_prep);
PERFORM pg_temp.chk('M01 execute inserts 4 draft models', '4', v_res->>'inserted');

SELECT id INTO v_m2022 FROM public.ministerial_exam_models WHERE model_code = 'mex-g12-sanaa-001-2022-r1-main';
SELECT id INTO v_m2024 FROM public.ministerial_exam_models WHERE model_code = 'mex-g12-sanaa-001-2024-r1-main';
SELECT id INTO v_m2025 FROM public.ministerial_exam_models WHERE model_code = 'mex-g12-sanaa-001-2025-r1-main';
SELECT id INTO v_ma2025 FROM public.ministerial_exam_models WHERE model_code = 'mex-g12-aden-001-2025-r1-main';
PERFORM pg_temp.chk('TCS-2 mex code minted for every model', 'true',
  (v_m2022 IS NOT NULL AND v_m2024 IS NOT NULL AND v_m2025 IS NOT NULL AND v_ma2025 IS NOT NULL)::text);

SELECT count(*) INTO v_int FROM public.ministerial_exam_models WHERE status = 'draft';
PERFORM pg_temp.chk('all models start as draft', '4', v_int::text);

-- M01 exact replay is idempotent
v_res := public.ministerial_m01_prepare(jsonb_build_array(
  jsonb_build_object('subject_code','sub-g12-001','track_code','sanaa','academic_year',2022,'exam_round_code','r1','model_variant_code','main','model_label','صنعاء 2022'),
  jsonb_build_object('subject_code','sub-g12-001','track_code','sanaa','academic_year',2024,'exam_round_code','r1','model_variant_code','main','model_label','صنعاء 2024'),
  jsonb_build_object('subject_code','sub-g12-001','track_code','sanaa','academic_year',2025,'exam_round_code','r1','model_variant_code','main','model_label','صنعاء 2025'),
  jsonb_build_object('subject_code','sub-g12-001','track_code','aden','academic_year',2025,'exam_round_code','r1','model_variant_code','main','model_label','عدن 2025')
));
PERFORM pg_temp.chk('M01 exact replay = SKIP', '4', v_res->'summary'->>'skip');
PERFORM pg_temp.chk('M01 exact replay inserts nothing', '0', v_res->'summary'->>'insert');
v_res := public.ministerial_m01_execute((v_res->>'prepare_id')::uuid);
PERFORM pg_temp.chk('M01 replay execute skipped 4', '4', v_res->>'skipped');
SELECT count(*) INTO v_int FROM public.ministerial_exam_models;
PERFORM pg_temp.chk('M01 replay creates no duplicate model', '4', v_int::text);

-- ===========================================================================
-- 2. OPERATOR FLOW — M02 (pinning + parity + additive)
-- ===========================================================================
v_res := public.ministerial_m02_prepare(jsonb_build_array(
  jsonb_build_object('ministerial_model_code','mex-g12-sanaa-001-2022-r1-main','question_code','qst-g12-001-0001','display_order',1,'marks',1),
  jsonb_build_object('ministerial_model_code','mex-g12-sanaa-001-2024-r1-main','question_code','qst-g12-001-0001','display_order',1,'marks',1),
  jsonb_build_object('ministerial_model_code','mex-g12-sanaa-001-2024-r1-main','question_code','qst-g12-001-0002','display_order',2,'marks',1),
  jsonb_build_object('ministerial_model_code','mex-g12-sanaa-001-2025-r1-main','question_code','qst-g12-001-0001','display_order',1,'marks',1),
  jsonb_build_object('ministerial_model_code','mex-g12-sanaa-001-2025-r1-main','question_code','qst-g12-001-0003','display_order',2,'marks',1),
  jsonb_build_object('ministerial_model_code','mex-g12-aden-001-2025-r1-main','question_code','qst-g12-001-0001','display_order',1,'marks',1)
));
PERFORM pg_temp.chk('M02 prepare stages 6 inserts', '6', v_res->'summary'->>'insert');
PERFORM pg_temp.chk('M02 preview pins exact published revision', c_q1r1::text,
  (v_res->'preview'->0->>'pinned_revision_id'));
v_res := public.ministerial_m02_execute((v_res->>'prepare_id')::uuid);
PERFORM pg_temp.chk('M02 execute inserts 6 memberships', '6', v_res->>'inserted');

SELECT published_revision_id INTO v_txt FROM public.ministerial_exam_questions
 WHERE model_id = v_m2025 AND question_id = c_q1;
PERFORM pg_temp.chk('membership stores exact pinned revision', c_q1r1::text, v_txt);

SELECT count(*) INTO v_int FROM public.exam_template_questions etq
  JOIN public.ministerial_exam_models m ON m.template_id = etq.template_id
 WHERE m.id = v_m2025;
PERFORM pg_temp.chk('template/membership parity (2025 sanaa)', '2', v_int::text);

-- exact replay of M02
v_res := public.ministerial_m02_prepare(jsonb_build_array(
  jsonb_build_object('ministerial_model_code','mex-g12-sanaa-001-2025-r1-main','question_code','qst-g12-001-0001','display_order',1,'marks',1),
  jsonb_build_object('ministerial_model_code','mex-g12-sanaa-001-2025-r1-main','question_code','qst-g12-001-0003','display_order',2,'marks',1)
));
PERFORM pg_temp.chk('M02 exact replay = SKIP', '2', v_res->'summary'->>'skip');
v_res := public.ministerial_m02_execute((v_res->>'prepare_id')::uuid);
PERFORM pg_temp.chk('M02 replay writes nothing', '0', v_res->>'inserted');

-- omission does not remove membership (additive semantics)
v_res := public.ministerial_m02_prepare(jsonb_build_array(
  jsonb_build_object('ministerial_model_code','mex-g12-sanaa-001-2025-r1-main','question_code','qst-g12-001-0001','display_order',1,'marks',1)
));
PERFORM public.ministerial_m02_execute((v_res->>'prepare_id')::uuid);
SELECT count(*) INTO v_int FROM public.ministerial_exam_questions WHERE model_id = v_m2025;
PERFORM pg_temp.chk('M02 omission keeps existing membership', '2', v_int::text);

-- forbidden content columns rejected
BEGIN
  PERFORM public.ministerial_m02_prepare(jsonb_build_array(
    jsonb_build_object('ministerial_model_code','mex-g12-sanaa-001-2025-r1-main','question_code','qst-g12-001-0001','display_order',1,'correct_index',0)));
  PERFORM pg_temp.chk('M02 rejects answer-bearing columns', 'raised', 'not raised');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.chk('M02 rejects answer-bearing columns', 'raised', 'raised');
END;

-- ===========================================================================
-- 3. PUBLISH AUTHORISATION
-- ===========================================================================
BEGIN
  PERFORM public.publish_ministerial_model(v_m2025);
  PERFORM pg_temp.chk('content_manager cannot publish', 'raised', 'not raised');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.chk('content_manager cannot publish', 'raised', 'raised');
END;

PERFORM pg_temp.actor(c_pub);
PERFORM public.publish_ministerial_model(v_m2025);
PERFORM public.publish_ministerial_model(v_m2024);
PERFORM public.publish_ministerial_model(v_m2022);
PERFORM public.publish_ministerial_model(v_ma2025);
SELECT count(*) INTO v_int FROM public.ministerial_exam_models WHERE status = 'published';
PERFORM pg_temp.chk('publisher publishes all 4 models', '4', v_int::text);

-- strict mode needs a server-side duration on the 2025 template
SELECT template_id INTO v_tpl2025 FROM public.ministerial_exam_models WHERE id = v_m2025;
UPDATE public.exam_templates SET duration_seconds = 3600 WHERE id = v_tpl2025;

-- RPC-only writes
PERFORM pg_temp.chk('authenticated cannot INSERT models', 'false',
  has_table_privilege('authenticated', 'public.ministerial_exam_models', 'INSERT')::text);
PERFORM pg_temp.chk('authenticated cannot UPDATE membership', 'false',
  has_table_privilege('authenticated', 'public.ministerial_exam_questions', 'UPDATE')::text);
PERFORM pg_temp.chk('authenticated cannot DELETE membership', 'false',
  has_table_privilege('authenticated', 'public.ministerial_exam_questions', 'DELETE')::text);

-- ===========================================================================
-- 4. TRACK ISOLATION
-- ===========================================================================
PERFORM pg_temp.actor(c_stu_s);
SELECT count(*) INTO v_int FROM public.list_ministerial_models(c_subject);
PERFORM pg_temp.chk('sanaa student sees only sanaa models', '3', v_int::text);

PERFORM pg_temp.actor(c_stu_a);
SELECT count(*) INTO v_int FROM public.list_ministerial_models(c_subject);
PERFORM pg_temp.chk('aden student sees only aden model', '1', v_int::text);

PERFORM pg_temp.actor(c_stu_s);
BEGIN
  PERFORM public.get_ministerial_model_overview(v_ma2025);
  PERFORM pg_temp.chk('direct cross-track model URL denied', 'raised', 'not raised');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.chk('direct cross-track model URL denied', 'raised', 'raised');
END;

BEGIN
  PERFORM public.create_ministerial_exam_session(v_ma2025, 'training');
  PERFORM pg_temp.chk('cross-track session creation denied', 'raised', 'not raised');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.chk('cross-track session creation denied', 'raised', 'raised');
END;

PERFORM pg_temp.actor(c_stu_a);
BEGIN
  PERFORM public.create_ministerial_exam_session(v_m2025, 'training');
  PERFORM pg_temp.chk('aden student denied on sanaa model', 'raised', 'not raised');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.chk('aden student denied on sanaa model', 'raised', 'raised');
END;

-- ===========================================================================
-- 5. TRAINING FLOW
-- ===========================================================================
PERFORM pg_temp.actor(c_stu_s);
v_sess := public.create_ministerial_exam_session(v_m2025, 'training');
PERFORM pg_temp.chk('training session created', 'true', (v_sess IS NOT NULL)::text);

SELECT id INTO v_esq1 FROM public.exam_session_questions
 WHERE exam_session_id = v_sess AND question_order = 1;
SELECT id INTO v_esq2 FROM public.exam_session_questions
 WHERE exam_session_id = v_sess AND question_order = 2;

v_state := public.get_ministerial_session_state(v_sess);
PERFORM pg_temp.chk('session state carries no answer key', 'false',
  (v_state::text ILIKE '%is_correct%' OR v_state::text ILIKE '%correct_option%')::text);

BEGIN
  PERFORM public.reveal_ministerial_training_answer(v_sess, v_esq1);
  PERFORM pg_temp.chk('reveal before answering denied', 'raised', 'not raised');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.chk('reveal before answering denied', 'raised', 'raised');
END;

PERFORM public.answer_ministerial_exam_question(v_sess, v_esq1, 'A');
v_reveal := public.reveal_ministerial_training_answer(v_sess, v_esq1);
PERFORM pg_temp.chk('reveal after answering allowed', 'true', v_reveal->>'is_correct');
PERFORM pg_temp.chk('reveal returns pinned correct code', 'A', v_reveal->>'correct_option_code');
PERFORM pg_temp.chk('reveal returns allowed explanation', 'شرح النسخة R1', v_reveal->>'explanation');
PERFORM pg_temp.chk('reveal links the pinned lesson', c_lesson1::text, v_reveal->>'lesson_id');

BEGIN
  PERFORM public.answer_ministerial_exam_question(v_sess, v_esq1, 'B');
  PERFORM pg_temp.chk('answer locked after reveal', 'raised', 'not raised');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.chk('answer locked after reveal', 'raised', 'raised');
END;

-- reload: revealed answer stays locked and the session is the same one
v_state := public.get_ministerial_session_state(v_sess);
PERFORM pg_temp.chk('training session survives reload', v_sess::text, v_state->'session'->>'id');

PERFORM public.answer_ministerial_exam_question(v_sess, v_esq2, 'B');
v_result := public.submit_ministerial_exam_session(v_sess);
PERFORM pg_temp.chk('training submit grades server side', '100.00', v_result->>'percentage');

-- ===========================================================================
-- 6. STRICT FLOW
-- ===========================================================================
v_sess2 := public.create_ministerial_exam_session(v_m2025, 'strict');
SELECT expires_at INTO v_exp FROM public.exam_sessions WHERE id = v_sess2;
PERFORM pg_temp.chk('strict session gets a server timer', 'true', (v_exp IS NOT NULL)::text);

SELECT id INTO v_esq1 FROM public.exam_session_questions WHERE exam_session_id = v_sess2 AND question_order = 1;
SELECT id INTO v_esq2 FROM public.exam_session_questions WHERE exam_session_id = v_sess2 AND question_order = 2;

BEGIN
  PERFORM public.reveal_ministerial_training_answer(v_sess2, v_esq1);
  PERFORM pg_temp.chk('reveal denied in strict mode', 'raised', 'not raised');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.chk('reveal denied in strict mode', 'raised', 'raised');
END;

PERFORM public.answer_ministerial_exam_question(v_sess2, v_esq1, 'A');
-- leave / resume
v_state := public.get_ministerial_session_state(v_sess2);
PERFORM pg_temp.chk('resume keeps the same server deadline', v_exp::text,
  (v_state->'session'->>'expires_at')::timestamptz::text);
PERFORM public.answer_ministerial_exam_question(v_sess2, v_esq2, 'A');

v_result := public.submit_ministerial_exam_session(v_sess2);
PERFORM pg_temp.chk('strict grading is server side', '50.00', v_result->>'percentage');
PERFORM pg_temp.chk('strict result is final', 'true', v_result->>'is_final');
SELECT completed_at INTO v_completed FROM public.exam_sessions WHERE id = v_sess2;

-- double submit / two-tab submit are deterministic
v_result2 := public.submit_ministerial_exam_session(v_sess2);
PERFORM pg_temp.chk('double submit returns identical result', v_result::text, v_result2::text);
v_result2 := public.submit_ministerial_exam_session(v_sess2);
PERFORM pg_temp.chk('two-tab submit returns identical result', v_result::text, v_result2::text);
SELECT completed_at INTO v_exp FROM public.exam_sessions WHERE id = v_sess2;
PERFORM pg_temp.chk('resubmission does not move completed_at', v_completed::text, v_exp::text);

-- expiry: answering after expiry is refused, submitting still grades
v_sess3 := public.create_ministerial_exam_session(v_m2025, 'strict');
SELECT id INTO v_esq1 FROM public.exam_session_questions WHERE exam_session_id = v_sess3 AND question_order = 1;
PERFORM public.answer_ministerial_exam_question(v_sess3, v_esq1, 'A');
UPDATE public.exam_sessions SET expires_at = now() - interval '1 minute' WHERE id = v_sess3;
BEGIN
  PERFORM public.answer_ministerial_exam_question(v_sess3, v_esq1, 'B');
  PERFORM pg_temp.chk('answering an expired session denied', 'raised', 'not raised');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.chk('answering an expired session denied', 'raised', 'raised');
END;
v_result := public.submit_ministerial_exam_session(v_sess3);
PERFORM pg_temp.chk('expired session still graded', '50.00', v_result->>'percentage');
SELECT status::text INTO v_txt FROM public.exam_sessions WHERE id = v_sess3;
PERFORM pg_temp.chk('expired session marked expired', 'expired', v_txt);

-- ===========================================================================
-- 7. RESULTS / HISTORY
-- ===========================================================================
v_result := public.get_ministerial_session_result(v_sess2);
PERFORM pg_temp.chk('result carries academic year', '2025', v_result->'model'->>'academic_year');
PERFORM pg_temp.chk('result carries round code', 'r1', v_result->'model'->>'round_code');
PERFORM pg_temp.chk('result carries subject name', 'فيزياء', v_result->'model'->>'subject_name');
PERFORM pg_temp.chk('result reviews every question', '2', jsonb_array_length(v_result->'questions')::text);
PERFORM pg_temp.chk('result reports elapsed time', 'true',
  ((v_result->'summary'->>'elapsed_seconds')::int >= 0)::text);

SELECT count(*) INTO v_int FROM public.list_ministerial_attempts(NULL);
PERFORM pg_temp.chk('attempt history lists all attempts', '3', v_int::text);

PERFORM pg_temp.actor(c_stu_a);
BEGIN
  PERFORM public.get_ministerial_session_result(v_sess2);
  PERFORM pg_temp.chk('cross-student result denied', 'raised', 'not raised');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.chk('cross-student result denied', 'raised', 'raised');
END;
BEGIN
  PERFORM public.get_ministerial_session_state(v_sess2);
  PERFORM pg_temp.chk('cross-student session state denied', 'raised', 'not raised');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.chk('cross-student session state denied', 'raised', 'raised');
END;

-- ===========================================================================
-- 8. MANUAL GRADING SEMANTICS (2024 model = auto + manual)
-- ===========================================================================
PERFORM pg_temp.actor(c_stu_s);
v_sess_manual := public.create_ministerial_exam_session(v_m2024, 'training');
SELECT id INTO v_esq1 FROM public.exam_session_questions WHERE exam_session_id = v_sess_manual AND question_order = 1;
SELECT id INTO v_esq2 FROM public.exam_session_questions WHERE exam_session_id = v_sess_manual AND question_order = 2;
PERFORM public.answer_ministerial_exam_question(v_sess_manual, v_esq1, 'A');
v_result := public.submit_ministerial_exam_session(v_sess_manual);
PERFORM pg_temp.chk('manual mix => no final percentage', NULL, v_result->>'percentage');
PERFORM pg_temp.chk('manual mix => manual review flagged', 'true', v_result->>'manual_review_required');
PERFORM pg_temp.chk('manual mix => is_final false', 'false', v_result->>'is_final');
SELECT grading_status INTO v_txt FROM public.exam_sessions WHERE id = v_sess_manual;
PERFORM pg_temp.chk('manual mix => session partially graded', 'PARTIALLY_GRADED', v_txt);
SELECT grading_status INTO v_txt FROM public.exam_session_answers
 WHERE session_id = v_sess_manual AND exam_session_question_id = v_esq1;
PERFORM pg_temp.chk('auto question graded inside a mixed session', 'GRADED', v_txt);

-- ===========================================================================
-- 9. EXACT REVISION HISTORY — publish R2 after the models are live
-- ===========================================================================
SET session_replication_role = replica;
UPDATE public.question_revisions SET status = 'SUPERSEDED' WHERE id = c_q1r1;
INSERT INTO public.question_revisions (id, question_id, revision_number, status, interaction_type,
  grading_mode, question_text, max_score, allow_partial, requires_media, manual_grading_required,
  created_by, published_at, published_by, payload_hash, payload_hash_version)
VALUES (c_q1r2, c_q1, 2, 'PUBLISHED', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'س1 نسخة R2', 1, false, false, false,
  c_staff, now(), c_pub, repeat('12', 32), 'canonical_payload_v1')
ON CONFLICT DO NOTHING;
INSERT INTO public.question_options (question_revision_id, option_code, body, sort_order, is_correct) VALUES
  (c_q1r2, 'A', 'خيار أ', 1, false),
  (c_q1r2, 'B', 'خيار ب', 2, true)
ON CONFLICT DO NOTHING;
INSERT INTO public.question_targets (question_id, revision_id, target_type, subject_id, lesson_id, is_primary, created_by)
VALUES (c_q1, c_q1r2, 'LESSON', c_subject, c_lesson2, true, c_staff)
ON CONFLICT DO NOTHING;
INSERT INTO public.question_solutions (question_revision_id, explanation, model_answer, reveal_policy, sort_order)
VALUES (c_q1r2, 'شرح النسخة R2', 'ب', 'after_attempt', 1)
ON CONFLICT DO NOTHING;
UPDATE public.questions SET current_published_revision_id = c_q1r2 WHERE id = c_q1;
SET session_replication_role = origin;

SELECT published_revision_id INTO v_txt FROM public.ministerial_exam_questions
 WHERE model_id = v_m2025 AND question_id = c_q1;
PERFORM pg_temp.chk('published model keeps its pinned revision', c_q1r1::text, v_txt);

SELECT question_revision_id INTO v_txt FROM public.exam_session_questions
 WHERE exam_session_id = v_sess2 AND question_order = 1;
PERFORM pg_temp.chk('historical session snapshot stays on R1', c_q1r1::text, v_txt);

v_result := public.get_ministerial_session_result(v_sess2);
PERFORM pg_temp.chk('historical review uses R1 correct code', 'A',
  v_result->'questions'->0->>'correct_option_code');
PERFORM pg_temp.chk('historical review uses R1 explanation', 'شرح النسخة R1',
  v_result->'questions'->0->>'explanation');
PERFORM pg_temp.chk('historical review uses R1 lesson target', c_lesson1::text,
  v_result->'questions'->0->>'lesson_id');
PERFORM pg_temp.chk('historical grading unchanged after R2', 'correct',
  v_result->'questions'->0->>'status');

-- ===========================================================================
-- 10. 14F PERFORMANCE ANALYTICS
-- ===========================================================================
v_res := public.get_ministerial_performance_overview();
PERFORM pg_temp.chk('14F counts every attempt', '4', v_res->'summary'->>'attempts_count');
PERFORM pg_temp.chk('14F counts the pending manual attempt', '1', v_res->'summary'->>'pending_manual_count');
PERFORM pg_temp.chk('14F graded attempts exclude the pending one', '3', v_res->'summary'->>'graded_attempts_count');
PERFORM pg_temp.chk('14F best percentage from graded attempts', '100.00', v_res->'summary'->>'best_percentage');
PERFORM pg_temp.chk('14F average uses percentages only', 'true',
  ((v_res->'summary'->>'avg_percentage')::numeric BETWEEN 0 AND 100)::text);
PERFORM pg_temp.chk('14F reports average elapsed seconds', 'true',
  ((v_res->'summary'->>'avg_elapsed_seconds') IS NOT NULL)::text);
PERFORM pg_temp.chk('14F splits training and strict', 'true',
  ((v_res->'by_mode') IS NOT NULL)::text);
PERFORM pg_temp.chk('14F reports by subject', 'true', ((v_res->'by_subject') IS NOT NULL)::text);
PERFORM pg_temp.chk('14F reports by lesson', 'true', ((v_res->'by_lesson') IS NOT NULL)::text);
PERFORM pg_temp.chk('14F reports weak lessons', 'true', ((v_res->'weak_lessons') IS NOT NULL)::text);
PERFORM pg_temp.chk('14F lesson attribution uses the pinned revision target', 'true',
  (v_res->'by_lesson')::text LIKE ('%' || c_lesson1::text || '%'));
PERFORM pg_temp.chk('14F payload carries no answer key', 'false',
  (v_res::text ILIKE '%correct_option%' OR v_res::text ILIKE '%option_code%')::text);

-- ===========================================================================
-- 11. 14G REPEATED QUESTIONS
-- ===========================================================================
v_res := public.list_repeated_ministerial_questions(c_subject, 2, NULL);
PERFORM pg_temp.chk('14G counts distinct models in the student track', '3',
  v_res->'questions'->0->>'occurrence_count');
PERFORM pg_temp.chk('14G ignores the cross-track appearance', 'false',
  ((v_res->'questions'->0->>'occurrence_count')::int = 4)::text);
PERFORM pg_temp.chk('14G lists the historical years', 'true',
  ((v_res->'questions'->0)::text LIKE '%2022%'
   AND (v_res->'questions'->0)::text LIKE '%2024%'
   AND (v_res->'questions'->0)::text LIKE '%2025%')::text);
PERFORM pg_temp.chk('14G occurrences keep their pinned revision', 'true',
  ((v_res->'questions'->0)::text LIKE ('%' || c_q1r1::text || '%'))::text);
PERFORM pg_temp.chk('14G payload carries no answer key', 'false',
  (v_res::text ILIKE '%correct_option%' OR v_res::text ILIKE '%is_correct%')::text);

SELECT count(*) INTO v_int FROM public.list_repeated_ministerial_subjects();
PERFORM pg_temp.chk('14G subject index available for sanaa student', '1', v_int::text);

PERFORM pg_temp.actor(c_stu_a);
SELECT count(*) INTO v_int FROM public.list_repeated_ministerial_subjects();
PERFORM pg_temp.chk('14G aden student has no repeats (single model)', '0', v_int::text);

-- ===========================================================================
-- 12. SECURITY CLOSURE
-- ===========================================================================
PERFORM pg_temp.chk('anon cannot create ministerial sessions', 'false',
  has_function_privilege('anon', 'public.create_ministerial_exam_session(uuid, text)', 'EXECUTE')::text);
PERFORM pg_temp.chk('anon cannot answer', 'false',
  has_function_privilege('anon', 'public.answer_ministerial_exam_question(uuid, uuid, text)', 'EXECUTE')::text);
PERFORM pg_temp.chk('anon cannot reveal', 'false',
  has_function_privilege('anon', 'public.reveal_ministerial_training_answer(uuid, uuid)', 'EXECUTE')::text);
PERFORM pg_temp.chk('anon cannot submit', 'false',
  has_function_privilege('anon', 'public.submit_ministerial_exam_session(uuid)', 'EXECUTE')::text);
PERFORM pg_temp.chk('anon cannot read results', 'false',
  has_function_privilege('anon', 'public.get_ministerial_session_result(uuid)', 'EXECUTE')::text);
PERFORM pg_temp.chk('anon cannot read performance analytics', 'false',
  has_function_privilege('anon', 'public.get_ministerial_performance_overview()', 'EXECUTE')::text);
PERFORM pg_temp.chk('anon cannot read repeated questions', 'false',
  has_function_privilege('anon', 'public.list_repeated_ministerial_questions(uuid, integer, integer)', 'EXECUTE')::text);
PERFORM pg_temp.chk('anon cannot list models', 'false',
  has_function_privilege('anon', 'public.list_ministerial_models(uuid)', 'EXECUTE')::text);
PERFORM pg_temp.chk('PUBLIC cannot execute the grading helper', 'false',
  has_function_privilege('public', 'public._ministerial_is_correct(uuid, text)', 'EXECUTE')::text);
PERFORM pg_temp.chk('authenticated cannot execute the session guard', 'false',
  has_function_privilege('authenticated', 'public._ministerial_session_guard(uuid)', 'EXECUTE')::text);
PERFORM pg_temp.chk('anon cannot read membership', 'false',
  has_table_privilege('anon', 'public.ministerial_exam_questions', 'SELECT')::text);
PERFORM pg_temp.chk('client cannot write grading columns', 'false',
  has_table_privilege('authenticated', 'public.exam_session_answers', 'UPDATE')::text);

-- generic ministry session bypass stays closed
PERFORM pg_temp.actor(c_stu_s);
BEGIN
  PERFORM public.create_exam_session_with_snapshot(v_tpl2025);
  PERFORM pg_temp.chk('generic ministry session bypass closed', 'raised', 'not raised');
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.chk('generic ministry session bypass closed', 'raised', 'raised');
END;

SELECT result_json::text INTO v_txt FROM public.exam_sessions WHERE id = v_sess2;
PERFORM pg_temp.chk('result_json carries no answer key', 'false',
  (v_txt ILIKE '%correct_option%' OR v_txt ILIKE '%option_code%')::text);

SELECT count(*) INTO v_int FROM public.exam_sessions
 WHERE ministerial_model_id IS NOT NULL AND correct_answers IS NOT NULL;
PERFORM pg_temp.chk('ministerial sessions never store correct_answers', '0', v_int::text);
END
$outer$;
