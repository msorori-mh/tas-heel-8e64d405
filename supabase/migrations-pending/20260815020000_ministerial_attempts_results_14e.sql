-- PAST_MINISTERIAL_EXAMS_ATTEMPTS_RESULTS_14E
-- Attempts, server-side grading, safe reveal and results for ministerial models.
-- SHARED_DB_APPLIED = NO (pending migration; apply only after PG17 + security review).
--
-- Guards enforced here:
--  G1 training reveal locks the answer (no post-reveal answer change)
--  G2 exam_sessions.correct_answers stays NULL for ministerial sessions; result_json holds no answer key
--  G3 grading maps selected_index -> snapshot option_code (never positional against live options)
--  G4 grading inputs (revision id + marks) come from the session snapshot only
--  G5 non auto-gradable interactions => MANUAL_REVIEW_PENDING, is_final = false, percentage NULL
--  G6 create RPC keeps a 1-argument invocation path plus explicit modes
--  G7 answer/submit/expiry races are deterministic and submit is idempotent

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Minimal schema additions
-- ---------------------------------------------------------------------------

ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS ministerial_attempt_mode text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_final boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exam_sessions_ministerial_attempt_mode_check'
  ) THEN
    ALTER TABLE public.exam_sessions
      ADD CONSTRAINT exam_sessions_ministerial_attempt_mode_check
      CHECK (ministerial_attempt_mode IS NULL OR ministerial_attempt_mode IN ('training', 'strict'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exam_sessions_grading_status_check'
  ) THEN
    ALTER TABLE public.exam_sessions
      ADD CONSTRAINT exam_sessions_grading_status_check
      CHECK (grading_status IS NULL OR grading_status IN (
        'IN_PROGRESS', 'GRADING', 'GRADED', 'MANUAL_REVIEW_PENDING'
      ));
  END IF;
END $$;

ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS revealed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2) Session creation with a server-recorded attempt mode (G6)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_ministerial_exam_session(uuid);

CREATE OR REPLACE FUNCTION public.create_ministerial_exam_session(
  _model_id uuid,
  _mode text DEFAULT 'training'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_model public.ministerial_exam_models;
  v_tpl public.exam_templates;
  v_session_id uuid;
  v_total_q integer := 0;
  v_total_pts numeric := 0;
  v_expires timestamptz;
  v_membership record;
  v_option record;
  v_rendered_options jsonb;
  v_option_mapping jsonb;
  v_display_index integer;
  v_question_order integer := 0;
  v_esq_id uuid;
  v_mode text := lower(coalesce(_mode, 'training'));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_mode NOT IN ('training', 'strict') THEN
    RAISE EXCEPTION 'INVALID_ATTEMPT_MODE' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_model FROM public.ministerial_exam_models WHERE id = _model_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'model_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_model.status <> 'published' THEN
    RAISE EXCEPTION 'MINISTERIAL_MODEL_NOT_PUBLISHED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tpl FROM public.exam_templates WHERE id = v_model.template_id;
  IF NOT FOUND OR v_tpl.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'template_inactive' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_access_subject(v_model.subject_id) THEN
    RAISE EXCEPTION 'curriculum_or_grade_mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = v_user AND p.curriculum_track_id = v_model.curriculum_track_id
  ) THEN
    RAISE EXCEPTION 'curriculum_or_grade_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(marks), 0)
  INTO v_total_q, v_total_pts
  FROM public.ministerial_exam_questions
  WHERE model_id = _model_id;

  IF v_total_q = 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_MODEL_HAS_NO_QUESTIONS' USING ERRCODE = '22023';
  END IF;

  -- Strict mode is timed from the template duration; training has no deadline.
  IF v_mode = 'strict' AND v_tpl.duration_seconds IS NOT NULL THEN
    v_expires := now() + make_interval(secs => v_tpl.duration_seconds);
  END IF;

  INSERT INTO public.exam_sessions (
    user_id, template_id, mode, status, expires_at, total_questions, total_points,
    attempt_pin_mode, grading_status, ministerial_model_id, ministerial_attempt_mode,
    correct_answers, is_final
  )
  VALUES (
    v_user, v_model.template_id, 'ministry', 'in_progress', v_expires, v_total_q, v_total_pts,
    'REVISION_PINNED', 'IN_PROGRESS', _model_id, v_mode,
    NULL, false
  )
  RETURNING id INTO v_session_id;

  FOR v_membership IN
    SELECT meq.*, qr.question_text, qr.stimulus_text, qr.payload_hash, qr.interaction_type,
           q.id AS logical_question_id
    FROM public.ministerial_exam_questions meq
    JOIN public.question_revisions qr ON qr.id = meq.published_revision_id
    JOIN public.questions q ON q.id = meq.question_id
    WHERE meq.model_id = _model_id
    ORDER BY meq.sort_order
  LOOP
    v_question_order := v_question_order + 1;
    v_rendered_options := '[]'::jsonb;
    v_option_mapping := '[]'::jsonb;
    v_display_index := 0;

    FOR v_option IN
      SELECT id, option_code, body, sort_order
      FROM public.question_options
      WHERE question_revision_id = v_membership.published_revision_id
      ORDER BY sort_order
    LOOP
      v_rendered_options := v_rendered_options || jsonb_build_object(
        'option_code', v_option.option_code,
        'body', v_option.body
      );
      -- Server-only stable identity map (display position -> pinned option code).
      v_option_mapping := v_option_mapping || jsonb_build_object(
        'display_index', v_display_index,
        'original_index', v_option.sort_order,
        'option_code', v_option.option_code
      );
      v_display_index := v_display_index + 1;
    END LOOP;

    INSERT INTO public.exam_session_questions (
      exam_session_id, question_revision_id, logical_question_id, question_order,
      rendered_question_text, rendered_stimulus_text, rendered_options, option_order_mapping,
      max_score, payload_hash, payload_hash_version, pin_mode
    )
    VALUES (
      v_session_id, v_membership.published_revision_id, v_membership.logical_question_id,
      v_question_order, v_membership.question_text, v_membership.stimulus_text,
      v_rendered_options, v_option_mapping,
      v_membership.marks, v_membership.payload_hash, 'canonical_payload_v1', 'REVISION_PINNED'
    )
    RETURNING id INTO v_esq_id;

    INSERT INTO public.exam_session_answers (
      session_id, question_id, exam_session_question_id, question_revision_id,
      max_score, pin_mode, grading_status
    )
    VALUES (
      v_session_id, v_membership.logical_question_id, v_esq_id,
      v_membership.published_revision_id, v_membership.marks, 'REVISION_PINNED', 'PENDING'
    );
  END LOOP;

  RETURN v_session_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_ministerial_exam_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_ministerial_exam_session(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Answer lock after reveal + deterministic expiry (G1, G7)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.answer_exam_question(
  _session_id uuid, _question_id uuid, _selected_index integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_session public.exam_sessions;
  v_answer public.exam_session_answers;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF _selected_index IS NOT NULL AND _selected_index < 0 THEN
    RAISE EXCEPTION 'invalid_selected_index' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_session FROM public.exam_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_session.user_id <> v_user THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v_session.status <> 'in_progress' THEN RAISE EXCEPTION 'session_not_in_progress' USING ERRCODE = '22023'; END IF;

  IF v_session.expires_at IS NOT NULL AND v_session.expires_at < now() THEN
    UPDATE public.exam_sessions SET status = 'expired', updated_at = now() WHERE id = _session_id;
    RAISE EXCEPTION 'session_expired' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_answer
  FROM public.exam_session_answers
  WHERE session_id = _session_id AND question_id = _question_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_not_in_session' USING ERRCODE = '22023';
  END IF;

  -- G1: once the training answer is revealed, the response is frozen.
  IF v_answer.revealed_at IS NOT NULL THEN
    RAISE EXCEPTION 'ANSWER_ALREADY_REVEALED_LOCKED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.exam_session_answers
  SET selected_index = _selected_index,
      selected_option_code = CASE
        WHEN _selected_index IS NULL THEN NULL
        ELSE (
          SELECT esq.rendered_options -> _selected_index ->> 'option_code'
          FROM public.exam_session_questions esq
          WHERE esq.id = v_answer.exam_session_question_id
        )
      END,
      answered_at = now(),
      submitted_at = now(),
      updated_at = now()
  WHERE id = v_answer.id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.answer_exam_question(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.answer_exam_question(uuid, uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Internal helpers: pinned correctness + access assertion
-- ---------------------------------------------------------------------------

-- Returns TRUE/FALSE for auto-gradable interactions, NULL when manual review is required.
CREATE OR REPLACE FUNCTION public._ministerial_is_correct(
  _exam_session_question_id uuid,
  _selected_index integer
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_esq public.exam_session_questions;
  v_interaction text;
  v_correct_codes text[];
  v_selected_code text;
BEGIN
  SELECT * INTO v_esq FROM public.exam_session_questions WHERE id = _exam_session_question_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT qr.interaction_type INTO v_interaction
  FROM public.question_revisions qr
  WHERE qr.id = v_esq.question_revision_id;

  SELECT array_agg(option_code ORDER BY sort_order) INTO v_correct_codes
  FROM public.question_options
  WHERE question_revision_id = v_esq.question_revision_id
    AND is_correct IS TRUE;

  -- Auto-grade only deterministic single-answer choice interactions (G5).
  IF v_correct_codes IS NULL OR array_length(v_correct_codes, 1) <> 1 THEN
    RETURN NULL;
  END IF;
  IF coalesce(v_interaction, '') NOT IN ('single_choice', 'true_false', 'mcq_single', 'multiple_choice') THEN
    RETURN NULL;
  END IF;

  IF _selected_index IS NULL THEN RETURN false; END IF;

  -- G3: never compare positions; resolve the pinned option code from the snapshot.
  v_selected_code := v_esq.rendered_options -> _selected_index ->> 'option_code';
  IF v_selected_code IS NULL THEN RETURN false; END IF;

  RETURN v_selected_code = v_correct_codes[1];
END;
$function$;

REVOKE ALL ON FUNCTION public._ministerial_is_correct(uuid, integer) FROM PUBLIC, anon, authenticated;

-- Owner + track isolation gate shared by every ministerial read (G10 of 14D carried forward).
CREATE OR REPLACE FUNCTION public._ministerial_session_guard(_session_id uuid)
RETURNS public.exam_sessions
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_session public.exam_sessions;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_session FROM public.exam_sessions WHERE id = _session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_session.user_id <> v_user THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v_session.ministerial_model_id IS NULL THEN
    RAISE EXCEPTION 'not_a_ministerial_session' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ministerial_exam_models m
    JOIN public.profiles p ON p.user_id = v_user
    WHERE m.id = v_session.ministerial_model_id
      AND p.curriculum_track_id = m.curriculum_track_id
  ) THEN
    RAISE EXCEPTION 'ministerial_model_not_available' USING ERRCODE = '42501';
  END IF;

  RETURN v_session;
END;
$function$;

REVOKE ALL ON FUNCTION public._ministerial_session_guard(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Safe training reveal (G1)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reveal_ministerial_training_answer(
  _session_id uuid,
  _session_question_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_session public.exam_sessions;
  v_esq public.exam_session_questions;
  v_answer public.exam_session_answers;
  v_is_correct boolean;
  v_correct_code text;
  v_solution record;
  v_lesson record;
BEGIN
  v_session := public._ministerial_session_guard(_session_id);

  IF coalesce(v_session.ministerial_attempt_mode, 'strict') <> 'training' THEN
    RAISE EXCEPTION 'REVEAL_NOT_ALLOWED_IN_STRICT' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_esq
  FROM public.exam_session_questions
  WHERE id = _session_question_id AND exam_session_id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'question_not_in_session' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_answer
  FROM public.exam_session_answers
  WHERE session_id = _session_id AND exam_session_question_id = _session_question_id
  FOR UPDATE;
  IF NOT FOUND OR v_answer.answered_at IS NULL THEN
    RAISE EXCEPTION 'ANSWER_REQUIRED_BEFORE_REVEAL' USING ERRCODE = '42501';
  END IF;

  v_is_correct := public._ministerial_is_correct(v_esq.id, v_answer.selected_index);

  IF v_is_correct IS NULL THEN
    UPDATE public.exam_session_answers
    SET revealed_at = coalesce(revealed_at, now()),
        requires_manual_review = true,
        grading_status = 'MANUAL_REVIEW_PENDING',
        updated_at = now()
    WHERE id = v_answer.id;

    RETURN jsonb_build_object(
      'manual_review_required', true,
      'is_correct', NULL,
      'correct_option_code', NULL,
      'explanation', NULL
    );
  END IF;

  SELECT option_code INTO v_correct_code
  FROM public.question_options
  WHERE question_revision_id = v_esq.question_revision_id AND is_correct IS TRUE
  ORDER BY sort_order
  LIMIT 1;

  -- Solution comes from the exact pinned revision, never the current one.
  SELECT qs.explanation, qs.model_answer, qs.hint, qs.reveal_policy
  INTO v_solution
  FROM public.question_solutions qs
  WHERE qs.question_revision_id = v_esq.question_revision_id
    AND coalesce(qs.reveal_policy, 'after_attempt') NOT IN ('hidden', 'staff_only')
  ORDER BY qs.sort_order NULLS LAST
  LIMIT 1;

  SELECT l.id AS lesson_id, l.title AS lesson_title
  INTO v_lesson
  FROM public.question_targets qt
  JOIN public.lessons l ON l.id = qt.lesson_id
  WHERE qt.revision_id = v_esq.question_revision_id
    AND qt.lesson_id IS NOT NULL
  ORDER BY qt.is_primary DESC NULLS LAST
  LIMIT 1;

  UPDATE public.exam_session_answers
  SET revealed_at = coalesce(revealed_at, now()),
      is_correct = v_is_correct,
      auto_score = CASE WHEN v_is_correct THEN coalesce(v_answer.max_score, 0) ELSE 0 END,
      grading_status = 'AUTO_GRADED',
      updated_at = now()
  WHERE id = v_answer.id;

  RETURN jsonb_build_object(
    'manual_review_required', false,
    'is_correct', v_is_correct,
    'correct_option_code', v_correct_code,
    'explanation', v_solution.explanation,
    'model_answer', v_solution.model_answer,
    'lesson_id', v_lesson.lesson_id,
    'lesson_title', v_lesson.lesson_title
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reveal_ministerial_training_answer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_ministerial_training_answer(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Server-side grading + idempotent submit (G2, G4, G5, G7)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_ministerial_exam_session(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_session public.exam_sessions;
  v_row record;
  v_is_correct boolean;
  v_answered integer := 0;
  v_correct integer := 0;
  v_wrong integer := 0;
  v_blank integer := 0;
  v_manual integer := 0;
  v_score numeric := 0;
  v_total numeric := 0;
  v_pct numeric;
  v_elapsed integer;
  v_expired boolean;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;

  PERFORM public._ministerial_session_guard(_session_id);

  -- Serialize concurrent submits (double submit / two tabs).
  SELECT * INTO v_session FROM public.exam_sessions WHERE id = _session_id FOR UPDATE;

  -- G7: idempotent — an already graded session returns the stored result untouched.
  IF v_session.grading_status IN ('GRADED', 'MANUAL_REVIEW_PENDING')
     AND v_session.result_json IS NOT NULL THEN
    RETURN v_session.result_json;
  END IF;

  v_expired := v_session.expires_at IS NOT NULL AND v_session.expires_at < now();

  FOR v_row IN
    SELECT esa.id, esa.selected_index, esa.answered_at,
           esq.id AS esq_id, esq.max_score
    FROM public.exam_session_answers esa
    JOIN public.exam_session_questions esq ON esq.id = esa.exam_session_question_id
    WHERE esa.session_id = _session_id
    ORDER BY esq.question_order
  LOOP
    -- G4: marks come from the snapshot, not from current membership rows.
    v_total := v_total + coalesce(v_row.max_score, 0);

    IF v_row.answered_at IS NULL OR v_row.selected_index IS NULL THEN
      v_blank := v_blank + 1;
      UPDATE public.exam_session_answers
      SET is_correct = false, auto_score = 0, final_score = 0,
          grading_status = 'AUTO_GRADED', graded_at = now(), updated_at = now()
      WHERE id = v_row.id;
      CONTINUE;
    END IF;

    v_answered := v_answered + 1;
    v_is_correct := public._ministerial_is_correct(v_row.esq_id, v_row.selected_index);

    IF v_is_correct IS NULL THEN
      v_manual := v_manual + 1;
      UPDATE public.exam_session_answers
      SET requires_manual_review = true, grading_status = 'MANUAL_REVIEW_PENDING', updated_at = now()
      WHERE id = v_row.id;
      CONTINUE;
    END IF;

    IF v_is_correct THEN
      v_correct := v_correct + 1;
      v_score := v_score + coalesce(v_row.max_score, 0);
    ELSE
      v_wrong := v_wrong + 1;
    END IF;

    UPDATE public.exam_session_answers
    SET is_correct = v_is_correct,
        auto_score = CASE WHEN v_is_correct THEN coalesce(v_row.max_score, 0) ELSE 0 END,
        final_score = CASE WHEN v_is_correct THEN coalesce(v_row.max_score, 0) ELSE 0 END,
        grading_status = 'AUTO_GRADED',
        graded_at = now(),
        updated_at = now()
    WHERE id = v_row.id;
  END LOOP;

  v_elapsed := GREATEST(
    0,
    EXTRACT(EPOCH FROM (
      LEAST(now(), coalesce(v_session.expires_at, now())) - coalesce(v_session.started_at, v_session.created_at)
    ))::integer
  );

  -- G5: no final percentage while manual review is pending.
  v_pct := CASE
    WHEN v_manual > 0 THEN NULL
    WHEN v_total > 0 THEN round((v_score / v_total) * 100, 2)
    ELSE 0
  END;

  v_result := jsonb_build_object(
    'session_id', _session_id,
    'attempt_mode', v_session.ministerial_attempt_mode,
    'answered', v_answered,
    'correct_count', CASE WHEN v_manual > 0 THEN NULL ELSE v_correct END,
    'wrong_count', CASE WHEN v_manual > 0 THEN NULL ELSE v_wrong END,
    'blank_count', v_blank,
    'score', CASE WHEN v_manual > 0 THEN NULL ELSE v_score END,
    'total_points', v_total,
    'percentage', v_pct,
    'elapsed_seconds', v_elapsed,
    'manual_review_required', v_manual > 0,
    'is_final', v_manual = 0
  );

  UPDATE public.exam_sessions
  SET status = CASE WHEN v_expired THEN 'expired'::public.exam_session_status
                    ELSE 'submitted'::public.exam_session_status END,
      submitted_at = coalesce(submitted_at, now()),
      completed_at = now(),
      answered_questions = v_answered,
      -- G2: the ministerial correct key never lands on the session row.
      correct_answers = NULL,
      score = CASE WHEN v_manual > 0 THEN NULL ELSE v_score END,
      total_points = v_total,
      grading_status = CASE WHEN v_manual > 0 THEN 'MANUAL_REVIEW_PENDING' ELSE 'GRADED' END,
      is_final = (v_manual = 0),
      result_json = v_result,
      updated_at = now()
  WHERE id = _session_id;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_ministerial_exam_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_ministerial_exam_session(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Result + review (reveal only after completion)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_ministerial_session_result(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_session public.exam_sessions;
  v_model jsonb;
  v_questions jsonb;
BEGIN
  v_session := public._ministerial_session_guard(_session_id);

  IF v_session.status = 'in_progress' OR v_session.result_json IS NULL THEN
    RAISE EXCEPTION 'SESSION_NOT_COMPLETED' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'model_id', m.id,
    'model_code', m.model_code,
    'model_label', m.model_label,
    'academic_year', m.academic_year,
    'round_code', m.round_code,
    'subject_id', m.subject_id,
    'subject_name', s.name,
    'track_name', ct.name
  )
  INTO v_model
  FROM public.ministerial_exam_models m
  JOIN public.subjects s ON s.id = m.subject_id
  JOIN public.curriculum_tracks ct ON ct.id = m.curriculum_track_id
  WHERE m.id = v_session.ministerial_model_id;

  SELECT coalesce(jsonb_agg(q ORDER BY (q->>'question_order')::int), '[]'::jsonb)
  INTO v_questions
  FROM (
    SELECT jsonb_build_object(
      'session_question_id', esq.id,
      'question_order', esq.question_order,
      'question_text', esq.rendered_question_text,
      'stimulus_text', esq.rendered_stimulus_text,
      'options', esq.rendered_options,
      'max_score', esq.max_score,
      'selected_index', esa.selected_index,
      'selected_option_code', esa.selected_option_code,
      'status', CASE
        WHEN esa.requires_manual_review IS TRUE THEN 'manual_review'
        WHEN esa.selected_index IS NULL THEN 'blank'
        WHEN esa.is_correct IS TRUE THEN 'correct'
        ELSE 'wrong'
      END,
      'correct_option_code', CASE
        WHEN esa.requires_manual_review IS TRUE THEN NULL
        ELSE (
          SELECT qo.option_code FROM public.question_options qo
          WHERE qo.question_revision_id = esq.question_revision_id AND qo.is_correct IS TRUE
          ORDER BY qo.sort_order LIMIT 1
        )
      END,
      'explanation', (
        SELECT qs.explanation FROM public.question_solutions qs
        WHERE qs.question_revision_id = esq.question_revision_id
          AND coalesce(qs.reveal_policy, 'after_attempt') NOT IN ('hidden', 'staff_only')
        ORDER BY qs.sort_order NULLS LAST LIMIT 1
      ),
      'lesson_id', (
        SELECT qt.lesson_id FROM public.question_targets qt
        WHERE qt.revision_id = esq.question_revision_id AND qt.lesson_id IS NOT NULL
        ORDER BY qt.is_primary DESC NULLS LAST LIMIT 1
      )
    ) AS q
    FROM public.exam_session_questions esq
    JOIN public.exam_session_answers esa ON esa.exam_session_question_id = esq.id
    WHERE esq.exam_session_id = _session_id
  ) t;

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'status', v_session.status,
      'attempt_mode', v_session.ministerial_attempt_mode,
      'grading_status', v_session.grading_status,
      'is_final', v_session.is_final,
      'started_at', v_session.started_at,
      'completed_at', v_session.completed_at
    ),
    'model', v_model,
    'summary', v_session.result_json,
    'questions', v_questions
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_ministerial_session_result(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ministerial_session_result(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) Attempt history (exam_sessions stays the single source of truth)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_ministerial_attempts(_model_id uuid DEFAULT NULL)
RETURNS TABLE (
  session_id uuid,
  model_id uuid,
  model_code text,
  academic_year integer,
  round_code text,
  subject_id uuid,
  subject_name text,
  attempt_mode text,
  status text,
  grading_status text,
  is_final boolean,
  score numeric,
  total_points numeric,
  percentage numeric,
  elapsed_seconds integer,
  started_at timestamptz,
  completed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    es.id,
    m.id,
    m.model_code,
    m.academic_year,
    m.round_code::text,
    m.subject_id,
    s.name,
    es.ministerial_attempt_mode,
    es.status::text,
    es.grading_status,
    es.is_final,
    es.score,
    es.total_points,
    (es.result_json ->> 'percentage')::numeric,
    (es.result_json ->> 'elapsed_seconds')::integer,
    es.started_at,
    es.completed_at
  FROM public.exam_sessions es
  JOIN public.ministerial_exam_models m ON m.id = es.ministerial_model_id
  JOIN public.subjects s ON s.id = m.subject_id
  JOIN public.profiles p ON p.user_id = auth.uid()
  WHERE es.user_id = auth.uid()
    AND es.ministerial_model_id IS NOT NULL
    AND p.curriculum_track_id = m.curriculum_track_id
    AND (_model_id IS NULL OR m.id = _model_id)
  ORDER BY es.created_at DESC
  LIMIT 100;
$function$;

REVOKE ALL ON FUNCTION public.list_ministerial_attempts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_ministerial_attempts(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9) Session state: expose snapshot question ids, attempt mode, reveal + server clock
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_ministerial_session_state(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_session public.exam_sessions;
  v_questions jsonb;
  v_answers jsonb;
  v_model jsonb;
BEGIN
  v_session := public._ministerial_session_guard(_session_id);

  SELECT jsonb_build_object(
    'model_id', m.id,
    'model_code', m.model_code,
    'model_label', m.model_label,
    'academic_year', m.academic_year,
    'round_code', m.round_code::text,
    'subject_id', s.id,
    'subject_name', s.name
  )
  INTO v_model
  FROM public.ministerial_exam_models m
  JOIN public.subjects s ON s.id = m.subject_id
  WHERE m.id = v_session.ministerial_model_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'session_question_id', esq.id,
    'question_id', esq.logical_question_id,
    'question_order', esq.question_order,
    'question_text', esq.rendered_question_text,
    'stimulus_text', esq.rendered_stimulus_text,
    'options', esq.rendered_options,
    'max_score', esq.max_score
  ) ORDER BY esq.question_order), '[]'::jsonb)
  INTO v_questions
  FROM public.exam_session_questions esq
  WHERE esq.exam_session_id = _session_id;

  -- No correctness, score or solution data is exposed while the attempt is open.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'question_id', a.question_id,
    'session_question_id', a.exam_session_question_id,
    'selected_index', a.selected_index,
    'answered_at', a.answered_at,
    'revealed_at', a.revealed_at
  )), '[]'::jsonb)
  INTO v_answers
  FROM public.exam_session_answers a
  WHERE a.session_id = _session_id;

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'status', v_session.status::text,
      'mode', v_session.mode::text,
      'attempt_mode', COALESCE(v_session.ministerial_attempt_mode, 'training'),
      'grading_status', v_session.grading_status,
      'is_final', v_session.is_final,
      'started_at', v_session.started_at,
      'expires_at', v_session.expires_at,
      'server_now', now(),
      'total_questions', v_session.total_questions
    ),
    'model', v_model,
    'questions', v_questions,
    'answers', v_answers,
    'reveal', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_ministerial_session_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ministerial_session_state(uuid) TO authenticated;

COMMIT;

