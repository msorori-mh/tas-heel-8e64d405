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
     OR to_regclass('public.question_targets') IS NULL
     OR to_regclass('public.official_question_answers') IS NULL
     OR to_regclass('public.question_option_rationales') IS NULL
     OR to_regclass('public.import_jobs') IS NULL
     OR to_regclass('public.import_staging_rows') IS NULL
  THEN
    RAISE EXCEPTION 'LESSON_QUESTION_ROLE_PREREQUISITE_MISSING';
  END IF;

  IF to_regprocedure('public.assert_import_job_operator(uuid)') IS NULL
     OR to_regprocedure('public.normalize_content_code(text)') IS NULL
     OR to_regprocedure('public.can_edit_question_bank(uuid)') IS NULL
  THEN
    RAISE EXCEPTION 'LESSON_QUESTION_ROLE_FUNCTION_PREREQUISITE_MISSING';
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
   WHERE (
         q.lesson_id = _lesson_id
         OR EXISTS (
           SELECT 1
             FROM public.question_targets qt
            WHERE qt.question_id = q.id
              AND qt.target_type = 'LESSON'
              AND qt.lesson_id = _lesson_id
         )
       )
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
   WHERE (
         q.lesson_id = _lesson_id
         OR EXISTS (
           SELECT 1
             FROM public.question_targets qt
            WHERE qt.question_id = q.id
              AND qt.target_type = 'LESSON'
              AND qt.lesson_id = _lesson_id
         )
       )
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
  _lesson_id uuid,
  _student_answer text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
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

  IF NOT public.can_access_lesson(_lesson_id) THEN
    RETURN jsonb_build_object('error', 'REVEAL_NOT_AUTHORIZED');
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.questions q
      JOIN public.question_revisions r
        ON r.id = _revision_id
       AND r.question_id = q.id
       AND r.id = q.current_published_revision_id
       AND r.status = 'PUBLISHED'
       AND r.educational_label = 'OFFICIAL_BOOK_QUESTION'
     WHERE q.id = _question_id
       AND (
         q.lesson_id = _lesson_id
         OR EXISTS (
           SELECT 1
             FROM public.question_targets qt
            WHERE qt.question_id = q.id
              AND qt.target_type = 'LESSON'
              AND qt.lesson_id = _lesson_id
         )
       )
  ) THEN
    RETURN jsonb_build_object('error', 'REVEAL_NOT_AUTHORIZED');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.lesson_capability_lifecycle lcl
     WHERE lcl.lesson_id = _lesson_id
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

REVOKE ALL ON FUNCTION public.reveal_lesson_official_question_answer(uuid,uuid,uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_lesson_official_question_answer(uuid,uuid,uuid,text)
  TO authenticated;

/* Capability 7 check: selected option is the attempt; answer data follows it. */
CREATE OR REPLACE FUNCTION public.check_lesson_self_test_question(
  _question_id uuid,
  _revision_id uuid,
  _lesson_id uuid,
  _selected_option_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
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

  IF NOT public.can_access_lesson(_lesson_id) THEN
    RETURN jsonb_build_object('error', 'CHECK_NOT_AUTHORIZED');
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.questions q
      JOIN public.question_revisions r
        ON r.id = _revision_id
       AND r.question_id = q.id
       AND r.id = q.current_published_revision_id
       AND r.status = 'PUBLISHED'
       AND r.educational_label = 'SELF_TEST'
       AND r.interaction_type = 'SINGLE_CHOICE'
       AND r.grading_mode = 'AUTO_SINGLE'
     WHERE q.id = _question_id
       AND (
         q.lesson_id = _lesson_id
         OR EXISTS (
           SELECT 1
             FROM public.question_targets qt
            WHERE qt.question_id = q.id
              AND qt.target_type = 'LESSON'
              AND qt.lesson_id = _lesson_id
         )
       )
  ) THEN
    RETURN jsonb_build_object('error', 'CHECK_NOT_AUTHORIZED');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.lesson_capability_lifecycle lcl
     WHERE lcl.lesson_id = _lesson_id
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

REVOKE ALL ON FUNCTION public.check_lesson_self_test_question(uuid,uuid,uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_lesson_self_test_question(uuid,uuid,uuid,text)
  TO authenticated;

/* -------------------------------------------------------------------------
 * Role-aware import execution for templates 09 and 10.
 * This replaces neither the generic content importer nor the legacy template;
 * the application calls this RPC explicitly for the two routed templates.
 * ---------------------------------------------------------------------- */

-- QB-01 originally required unit_id for every LESSON target. Lessons without
-- units are valid in Tamkeen (Quran is the production example), so loosen only
-- that shape while retaining subject_id + lesson_id as mandatory.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.question_targets'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%target_type%LESSON%unit_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.question_targets DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.question_targets
  DROP CONSTRAINT IF EXISTS question_targets_shape_chk_v2;
ALTER TABLE public.question_targets
  ADD CONSTRAINT question_targets_shape_chk_v2 CHECK (
    (target_type = 'SUBJECT' AND subject_id IS NOT NULL AND unit_id IS NULL AND lesson_id IS NULL)
    OR (target_type = 'UNIT' AND subject_id IS NOT NULL AND unit_id IS NOT NULL AND lesson_id IS NULL)
    OR (target_type = 'LESSON' AND subject_id IS NOT NULL AND lesson_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public._lesson_question_import_row_hash(
  p jsonb,
  p_template_key text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  fields text[];
  f text;
  canonical text := '';
  first boolean := true;
BEGIN
  IF p_template_key = 'questions' THEN
    fields := ARRAY[
      'question_code','subject_code','lesson_code','prompt_kind','question_text',
      'interaction_type','grading_mode','option_1','option_2','option_3','option_4',
      'option_5','option_6','correct_index','accepted_answers','model_answer',
      'explanation','sort_order'
    ];
  ELSIF p_template_key = 'self_test_questions' THEN
    fields := ARRAY[
      'question_code','subject_code','lesson_code','question_text',
      'option_1','option_2','option_3','option_4','option_5','option_6',
      'correct_index','explanation','why_wrong_1','why_wrong_2','why_wrong_3',
      'why_wrong_4','why_wrong_5','why_wrong_6','sort_order'
    ];
  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_LESSON_QUESTION_TEMPLATE: %', p_template_key;
  END IF;

  FOREACH f IN ARRAY fields LOOP
    IF NOT first THEN canonical := canonical || chr(31); END IF;
    first := false;
    canonical := canonical || f || '=' || COALESCE(p->>f, '');
  END LOOP;
  RETURN encode(extensions.digest(canonical, 'sha256'), 'hex');
END;
$$;

CREATE OR REPLACE FUNCTION public._lesson_question_content_fingerprint(
  p jsonb,
  p_role text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT encode(
    extensions.digest(
      p_role || chr(31) ||
      (p - 'subject_code' - 'lesson_code' - 'sort_order' - 'review_status' - 'editor_notes')::text,
      'sha256'
    ),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION public.qb_import_ingest_lesson_question_revision(
  _staging_row_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  row_rec public.import_staging_rows;
  job public.import_jobs;
  p jsonb;
  v_role text;
  v_interaction text;
  v_grading text;
  v_code text;
  v_fp text;
  v_qid uuid;
  v_rev uuid;
  v_num integer;
  v_subject uuid;
  v_unit uuid;
  v_lesson uuid;
  v_has_published boolean;
  v_content_match boolean;
  v_target_exists boolean;
  v_action text;
  v_correct integer;
  v_option_count integer := 0;
  v_correct_count integer := 0;
  v_answer text;
  v_body text;
  v_model_answer text;
  v_explanation text;
  i integer;
BEGIN
  SELECT * INTO row_rec
    FROM public.import_staging_rows
   WHERE id = _staging_row_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STAGING_ROW_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF row_rec.template_key NOT IN ('questions', 'self_test_questions') THEN
    RAISE EXCEPTION 'TEMPLATE_MISMATCH: %', row_rec.template_key USING ERRCODE = '0A000';
  END IF;

  SELECT * INTO job FROM public.import_jobs WHERE id = row_rec.job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPORT_JOB_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF job.execution_state <> 'applying' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: % -> ingest', job.execution_state USING ERRCODE = '55000';
  END IF;
  IF NOT row_rec.is_valid THEN
    RAISE EXCEPTION 'INVALID_STAGED_ROW: row %', row_rec.row_number USING ERRCODE = '22023';
  END IF;
  IF v_actor IS NULL
     OR NOT (public.is_full_admin(v_actor) OR public.can_edit_question_bank(v_actor)) THEN
    RAISE EXCEPTION 'QUESTION_BANK_CAPABILITY_REQUIRED' USING ERRCODE = '42501';
  END IF;

  p := row_rec.payload;
  IF public._lesson_question_import_row_hash(p, row_rec.template_key) <> row_rec.row_hash THEN
    RAISE EXCEPTION 'HASH_MISMATCH: row %', row_rec.row_number USING ERRCODE = '22023';
  END IF;

  v_role := CASE row_rec.template_key
    WHEN 'questions' THEN 'OFFICIAL_BOOK_QUESTION'
    WHEN 'self_test_questions' THEN 'SELF_TEST'
  END;
  v_interaction := CASE
    WHEN v_role = 'SELF_TEST' THEN 'SINGLE_CHOICE'
    ELSE upper(NULLIF(btrim(p->>'interaction_type'), ''))
  END;
  v_grading := CASE
    WHEN v_role = 'SELF_TEST' THEN 'AUTO_SINGLE'
    ELSE upper(NULLIF(btrim(p->>'grading_mode'), ''))
  END;

  IF NOT (
    (v_interaction = 'SINGLE_CHOICE' AND v_grading = 'AUTO_SINGLE')
    OR (v_interaction = 'SHORT_TEXT' AND v_grading = 'AUTO_TEXT')
    OR (v_interaction = 'LONG_TEXT' AND v_grading = 'MANUAL')
  ) THEN
    RAISE EXCEPTION 'INCOMPATIBLE_TYPE_MODE: row %', row_rec.row_number USING ERRCODE = '22023';
  END IF;

  v_code := NULLIF(public.normalize_content_code(p->>'question_code'), '');
  IF v_code IS NULL OR NULLIF(btrim(p->>'question_text'), '') IS NULL THEN
    RAISE EXCEPTION 'QUESTION_IDENTITY_REQUIRED: row %', row_rec.row_number USING ERRCODE = '22023';
  END IF;

  SELECT s.id INTO v_subject
    FROM public.subjects s
   WHERE s.code = p->>'subject_code';
  IF v_subject IS NULL THEN
    RAISE EXCEPTION 'SUBJECT_NOT_FOUND: %', p->>'subject_code' USING ERRCODE = '23503';
  END IF;
  SELECT l.id, l.unit_id INTO v_lesson, v_unit
    FROM public.lessons l
   WHERE l.subject_id = v_subject
     AND l.slug = p->>'lesson_code';
  IF v_lesson IS NULL THEN
    RAISE EXCEPTION 'LESSON_NOT_FOUND: %', p->>'lesson_code' USING ERRCODE = '23503';
  END IF;

  FOR i IN 1..6 LOOP
    v_body := NULLIF(btrim(COALESCE(p->>('option_' || i), '')), '');
    IF v_body IS NOT NULL THEN v_option_count := v_option_count + 1; END IF;
  END LOOP;

  IF v_interaction = 'SINGLE_CHOICE' THEN
    v_correct := NULLIF(p->>'correct_index', '')::integer;
    IF v_option_count < 2 OR v_option_count > 6
       OR v_correct IS NULL OR v_correct < 1 OR v_correct > 6
       OR NULLIF(btrim(COALESCE(p->>('option_' || v_correct), '')), '') IS NULL THEN
      RAISE EXCEPTION 'INVALID_SINGLE_CHOICE_PAYLOAD: row %', row_rec.row_number USING ERRCODE = '22023';
    END IF;
  ELSIF v_option_count > 0 OR NULLIF(p->>'correct_index', '') IS NOT NULL THEN
    RAISE EXCEPTION 'ANSWER_NOT_ALLOWED: row %', row_rec.row_number USING ERRCODE = '22023';
  END IF;

  IF v_interaction = 'SHORT_TEXT'
     AND NULLIF(btrim(COALESCE(p->>'accepted_answers', '')), '') IS NULL THEN
    RAISE EXCEPTION 'ACCEPTED_ANSWER_REQUIRED: row %', row_rec.row_number USING ERRCODE = '22023';
  END IF;

  v_model_answer := NULLIF(btrim(COALESCE(p->>'model_answer', '')), '');
  v_explanation := NULLIF(btrim(COALESCE(p->>'explanation', '')), '');
  IF v_role = 'OFFICIAL_BOOK_QUESTION' AND v_model_answer IS NULL THEN
    RAISE EXCEPTION 'MODEL_ANSWER_REQUIRED: row %', row_rec.row_number USING ERRCODE = '22023';
  END IF;
  IF v_role = 'SELF_TEST' AND v_explanation IS NULL THEN
    RAISE EXCEPTION 'EXPLANATION_REQUIRED: row %', row_rec.row_number USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('qb_question_code:' || v_code, 0));
  v_fp := public._lesson_question_content_fingerprint(p, v_role);

  SELECT q.id INTO v_qid
    FROM public.questions q
   WHERE q.code = v_code
   FOR UPDATE;
  IF v_qid IS NULL THEN
    INSERT INTO public.questions (
      code, question_text, options, correct_index, question_type, sort_order, created_by
    ) VALUES (
      v_code, p->>'question_text', '[]'::jsonb, -1, 'lesson',
      COALESCE(NULLIF(p->>'sort_order','')::integer, 0), v_actor
    ) RETURNING id INTO v_qid;
    v_action := 'INSERT';
  END IF;

  SELECT q.current_published_revision_id IS NOT NULL INTO v_has_published
    FROM public.questions q WHERE q.id = v_qid;
  SELECT EXISTS (
    SELECT 1 FROM public.question_revisions r
     WHERE r.question_id = v_qid
       AND r.source_payload_hash = v_fp
       AND r.status IN ('DRAFT','READY_FOR_REVIEW','APPROVED','PUBLISHED')
  ) INTO v_content_match;

  IF NOT v_content_match THEN
    SELECT COALESCE(max(r.revision_number), 0) + 1 INTO v_num
      FROM public.question_revisions r WHERE r.question_id = v_qid;
    INSERT INTO public.question_revisions (
      question_id, revision_number, status, interaction_type, grading_mode,
      educational_label, question_text, max_score, allow_partial, requires_media,
      manual_grading_required, source_payload_hash, created_by
    ) VALUES (
      v_qid, v_num, 'DRAFT', v_interaction, v_grading, v_role,
      p->>'question_text', 1, false, false, v_grading = 'MANUAL', v_fp, v_actor
    ) RETURNING id INTO v_rev;

    IF v_interaction = 'SINGLE_CHOICE' THEN
      FOR i IN 1..6 LOOP
        v_body := NULLIF(btrim(COALESCE(p->>('option_' || i), '')), '');
        IF v_body IS NOT NULL THEN
          INSERT INTO public.question_options (
            question_revision_id, option_code, body, sort_order, is_correct
          ) VALUES (v_rev, 'OPT_' || i, v_body, i, i = v_correct);
          IF i = v_correct THEN v_correct_count := v_correct_count + 1; END IF;
        END IF;
      END LOOP;
      IF v_correct_count <> 1 THEN
        RAISE EXCEPTION 'EXACTLY_ONE_CORRECT_OPTION_REQUIRED';
      END IF;
    END IF;

    IF v_interaction = 'SHORT_TEXT' THEN
      i := 0;
      FOR v_answer IN
        SELECT btrim(value)
          FROM regexp_split_to_table(p->>'accepted_answers', '[|]') value
         WHERE NULLIF(btrim(value), '') IS NOT NULL
      LOOP
        i := i + 1;
        INSERT INTO public.question_accepted_answers (
          question_revision_id, answer_text, normalized_answer,
          normalization_policy, is_primary, sort_order
        ) VALUES (v_rev, v_answer, regexp_replace(v_answer, '[[:space:]]+', ' ', 'g'),
                  'TRIM_COLLAPSE', i = 1, i);
      END LOOP;
      IF i = 0 THEN RAISE EXCEPTION 'ACCEPTED_ANSWER_REQUIRED'; END IF;
    END IF;

    INSERT INTO public.question_solutions (
      question_revision_id, solution_code, solution_type, sort_order,
      model_answer, explanation, reveal_policy, created_by
    ) VALUES (
      v_rev, 'SOL_1', 'MODEL', 0, v_model_answer, v_explanation,
      'AFTER_SUBMIT', v_actor
    );

    INSERT INTO public.official_question_answers (
      question_id, revision_id, model_answer, explanation
    ) VALUES (v_qid, v_rev, v_model_answer, v_explanation);

    IF v_role = 'SELF_TEST' THEN
      FOR i IN 1..6 LOOP
        v_body := NULLIF(btrim(COALESCE(p->>('why_wrong_' || i), '')), '');
        IF v_body IS NOT NULL THEN
          INSERT INTO public.question_option_rationales (
            question_id, question_revision_id, option_id, why_wrong
          ) VALUES (v_qid, v_rev, 'OPT_' || i, v_body);
        END IF;
      END LOOP;
    END IF;

    IF v_action IS NULL THEN
      v_action := CASE WHEN v_has_published
        THEN 'PUBLISHED_PRESERVED_NEW_REVISION' ELSE 'NEW_REVISION' END;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.question_targets t
     WHERE t.question_id = v_qid
       AND t.target_type = 'LESSON'
       AND t.lesson_id = v_lesson
  ) INTO v_target_exists;
  IF NOT v_target_exists THEN
    INSERT INTO public.question_targets (
      question_id, target_type, subject_id, unit_id, lesson_id, is_primary, created_by
    ) VALUES (
      v_qid, 'LESSON', v_subject, v_unit, v_lesson,
      NOT EXISTS (SELECT 1 FROM public.question_targets t WHERE t.question_id = v_qid AND t.is_primary),
      v_actor
    );
    IF v_action IS NULL THEN v_action := 'TARGET_ADDED'; END IF;
  END IF;

  IF v_action IS NULL THEN v_action := 'SKIP'; END IF;
  RETURN jsonb_build_object(
    'action', v_action,
    'question_id', v_qid,
    'revision_id', v_rev,
    'content_fingerprint', v_fp,
    'content_role', v_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.qb_import_ingest_lesson_question_revision(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qb_import_ingest_lesson_question_revision(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.import_execute_lesson_question_template(
  _job_id uuid,
  _template_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  job public.import_jobs;
  row_rec public.import_staging_rows;
  res jsonb;
  action text;
  inserted integer := 0;
  updated integer := 0;
  skipped integer := 0;
BEGIN
  IF _template_key NOT IN ('questions', 'self_test_questions') THEN
    RAISE EXCEPTION 'UNSUPPORTED_LESSON_QUESTION_TEMPLATE: %', _template_key;
  END IF;
  job := public.assert_import_job_operator(_job_id);
  IF job.execution_state <> 'planned' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: % -> applying', job.execution_state USING ERRCODE = '55000';
  END IF;

  UPDATE public.import_jobs SET execution_state = 'applying', updated_at = now()
   WHERE id = _job_id;

  FOR row_rec IN
    SELECT * FROM public.import_staging_rows
     WHERE job_id = _job_id AND template_key = _template_key
     ORDER BY row_number
  LOOP
    res := public.qb_import_ingest_lesson_question_revision(row_rec.id);
    action := res->>'action';
    IF action = 'INSERT' THEN inserted := inserted + 1;
    ELSIF action = 'SKIP' THEN skipped := skipped + 1;
    ELSE updated := updated + 1;
    END IF;
    UPDATE public.import_staging_rows
       SET applied_action = action,
           target_id = (res->>'question_id')::uuid,
           applied_at = now()
     WHERE id = row_rec.id;
  END LOOP;

  UPDATE public.import_jobs
     SET execution_state = 'planned',
         inserted_count = inserted_count + inserted,
         updated_count = updated_count + updated,
         skipped_count = skipped_count + skipped,
         updated_at = now()
   WHERE id = _job_id;

  RETURN jsonb_build_object(
    'job_id', _job_id,
    'template_key', _template_key,
    'inserted', inserted,
    'updated', updated,
    'skipped', skipped,
    'blocked_published', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_execute_lesson_question_template(uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_execute_lesson_question_template(uuid,text)
  TO authenticated;

COMMIT;

-- No production apply, rollback, merge, deployment, or data backfill is
-- performed by this source-only change.
