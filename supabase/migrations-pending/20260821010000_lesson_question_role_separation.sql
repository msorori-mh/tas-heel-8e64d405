-- LESSON QUESTION ROLE SEPARATION / SOURCE ONLY / NOT APPLIED
--
-- This candidate is intentionally stored under migrations-pending. It must not
-- be applied to production without a separate baseline, approval, and release
-- gate. It depends on the 21H answer-layer candidate that creates
-- official_question_answers and question_option_rationales.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.question_revisions') IS NULL
     OR to_regclass('public.question_options') IS NULL
     OR to_regclass('public.official_question_answers') IS NULL
     OR to_regclass('public.question_option_rationales') IS NULL
  THEN
    RAISE EXCEPTION 'LESSON_QUESTION_ROLE_PREREQUISITE_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'question_revisions'
       AND column_name = 'educational_label'
  ) THEN
    RAISE EXCEPTION 'QUESTION_REVISION_EDUCATIONAL_LABEL_MISSING';
  END IF;
END $$;

/* Initial payload for capability 6: exact official-book questions only. */
CREATE OR REPLACE FUNCTION public.get_lesson_official_questions(_lesson_id uuid)
RETURNS TABLE (
  id uuid,
  question_text text,
  options jsonb,
  question_type text,
  sort_order int,
  revision_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_lesson(_lesson_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT q.id,
         r.question_text,
         COALESCE((
           SELECT jsonb_agg(
             jsonb_build_object(
               'id', o.option_code,
               'text', o.body,
               'sortOrder', o.sort_order
             ) ORDER BY o.sort_order
           )
             FROM public.question_options o
            WHERE o.question_revision_id = r.id
         ), '[]'::jsonb),
         q.question_type,
         COALESCE(q.sort_order, 0),
         r.id
    FROM public.questions q
    JOIN public.question_revisions r
      ON r.id = q.current_published_revision_id
     AND r.question_id = q.id
     AND r.status = 'PUBLISHED'
     AND r.educational_label = 'OFFICIAL_BOOK_QUESTION'
   WHERE q.lesson_id = _lesson_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.lesson_capability_lifecycle lcl
        WHERE lcl.lesson_id = _lesson_id
          AND lcl.capability = 'checkUnderstanding'
          AND (lcl.status <> 'READY' OR lcl.applicability = 'NA')
     )
   ORDER BY q.sort_order, q.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_lesson_official_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lesson_official_questions(uuid) TO authenticated;

/* Initial payload for capability 7: SELF_TEST and single-choice only. */
CREATE OR REPLACE FUNCTION public.get_lesson_self_test_questions(_lesson_id uuid)
RETURNS TABLE (
  id uuid,
  question_text text,
  options jsonb,
  question_type text,
  sort_order int,
  revision_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_lesson(_lesson_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT q.id,
         r.question_text,
         COALESCE((
           SELECT jsonb_agg(
             jsonb_build_object(
               'id', o.option_code,
               'text', o.body,
               'sortOrder', o.sort_order
             ) ORDER BY o.sort_order
           )
             FROM public.question_options o
            WHERE o.question_revision_id = r.id
         ), '[]'::jsonb),
         q.question_type,
         COALESCE(q.sort_order, 0),
         r.id
    FROM public.questions q
    JOIN public.question_revisions r
      ON r.id = q.current_published_revision_id
     AND r.question_id = q.id
     AND r.status = 'PUBLISHED'
     AND r.educational_label = 'SELF_TEST'
     AND r.interaction_type = 'SINGLE_CHOICE'
     AND r.grading_mode = 'AUTO_SINGLE'
   WHERE q.lesson_id = _lesson_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.lesson_capability_lifecycle lcl
        WHERE lcl.lesson_id = _lesson_id
          AND lcl.capability = 'lessonAssessment'
          AND (lcl.status <> 'READY' OR lcl.applicability = 'NA')
     )
   ORDER BY q.sort_order, q.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_lesson_self_test_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lesson_self_test_questions(uuid) TO authenticated;

/* Capability 6 reveal: requires a non-empty student attempt and exact revision. */
CREATE OR REPLACE FUNCTION public.reveal_lesson_official_question_answer(
  _question_id uuid,
  _revision_id uuid,
  _student_answer text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lesson_id uuid;
  v_model_answer text;
  v_explanation text;
  v_correct_options jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;
  IF NULLIF(btrim(_student_answer), '') IS NULL THEN
    RETURN jsonb_build_object('error', 'ATTEMPT_REQUIRED');
  END IF;

  SELECT q.lesson_id
    INTO v_lesson_id
    FROM public.questions q
    JOIN public.question_revisions r
      ON r.id = _revision_id
     AND r.question_id = q.id
     AND r.id = q.current_published_revision_id
     AND r.status = 'PUBLISHED'
     AND r.educational_label = 'OFFICIAL_BOOK_QUESTION'
   WHERE q.id = _question_id;

  IF v_lesson_id IS NULL OR NOT public.can_access_lesson(v_lesson_id) THEN
    RETURN jsonb_build_object('error', 'REVEAL_NOT_AUTHORIZED');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.lesson_capability_lifecycle lcl
     WHERE lcl.lesson_id = v_lesson_id
       AND lcl.capability = 'checkUnderstanding'
       AND (lcl.status <> 'READY' OR lcl.applicability = 'NA')
  ) THEN
    RETURN jsonb_build_object('error', 'LESSON_NOT_READY');
  END IF;

  SELECT a.model_answer, a.explanation
    INTO v_model_answer, v_explanation
    FROM public.official_question_answers a
   WHERE a.question_id = _question_id
     AND a.revision_id = _revision_id;

  IF v_model_answer IS NULL THEN
    RETURN jsonb_build_object('error', 'ANSWER_NOT_AVAILABLE');
  END IF;

  SELECT COALESCE(jsonb_agg(o.option_code ORDER BY o.sort_order), '[]'::jsonb)
    INTO v_correct_options
    FROM public.question_options o
   WHERE o.question_revision_id = _revision_id
     AND o.is_correct;

  RETURN jsonb_build_object(
    'questionId', _question_id,
    'revisionId', _revision_id,
    'modelAnswer', v_model_answer,
    'explanation', v_explanation,
    'correctOptionIds', v_correct_options
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reveal_lesson_official_question_answer(uuid,uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_lesson_official_question_answer(uuid,uuid,text)
  TO authenticated;

/* Capability 7 check: selected option is the attempt; answer data follows it. */
CREATE OR REPLACE FUNCTION public.check_lesson_self_test_question(
  _question_id uuid,
  _revision_id uuid,
  _selected_option_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lesson_id uuid;
  v_selected_exists boolean;
  v_is_correct boolean;
  v_correct_option text;
  v_explanation text;
  v_correction text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;
  IF NULLIF(btrim(_selected_option_id), '') IS NULL THEN
    RETURN jsonb_build_object('error', 'SELECTION_REQUIRED');
  END IF;

  SELECT q.lesson_id
    INTO v_lesson_id
    FROM public.questions q
    JOIN public.question_revisions r
      ON r.id = _revision_id
     AND r.question_id = q.id
     AND r.id = q.current_published_revision_id
     AND r.status = 'PUBLISHED'
     AND r.educational_label = 'SELF_TEST'
     AND r.interaction_type = 'SINGLE_CHOICE'
     AND r.grading_mode = 'AUTO_SINGLE'
   WHERE q.id = _question_id;

  IF v_lesson_id IS NULL OR NOT public.can_access_lesson(v_lesson_id) THEN
    RETURN jsonb_build_object('error', 'CHECK_NOT_AUTHORIZED');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.lesson_capability_lifecycle lcl
     WHERE lcl.lesson_id = v_lesson_id
       AND lcl.capability = 'lessonAssessment'
       AND (lcl.status <> 'READY' OR lcl.applicability = 'NA')
  ) THEN
    RETURN jsonb_build_object('error', 'LESSON_NOT_READY');
  END IF;

  SELECT true, o.is_correct
    INTO v_selected_exists, v_is_correct
    FROM public.question_options o
   WHERE o.question_revision_id = _revision_id
     AND o.option_code = _selected_option_id;

  IF NOT COALESCE(v_selected_exists, false) THEN
    RETURN jsonb_build_object('error', 'OPTION_NOT_FOUND');
  END IF;

  SELECT o.option_code
    INTO v_correct_option
    FROM public.question_options o
   WHERE o.question_revision_id = _revision_id
     AND o.is_correct
   ORDER BY o.sort_order
   LIMIT 1;

  SELECT a.explanation
    INTO v_explanation
    FROM public.official_question_answers a
   WHERE a.question_id = _question_id
     AND a.revision_id = _revision_id;

  SELECT CASE WHEN v_is_correct THEN r.why_correct ELSE r.why_wrong END
    INTO v_correction
    FROM public.question_option_rationales r
   WHERE r.question_id = _question_id
     AND r.question_revision_id = _revision_id
     AND r.option_id = _selected_option_id;

  RETURN jsonb_build_object(
    'questionId', _question_id,
    'revisionId', _revision_id,
    'is_correct', COALESCE(v_is_correct, false),
    'correct_option_id', v_correct_option,
    'explanation', v_explanation,
    'correction', v_correction
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_lesson_self_test_question(uuid,uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_lesson_self_test_question(uuid,uuid,text)
  TO authenticated;

COMMIT;

-- No production apply, rollback, merge, deployment, or data backfill is
-- performed by this source-only change.
