-- MINISTERIAL_TRACK_PACKAGE_IMPORT_V1
--
-- Replaces the operator-facing two-file M01/M02 workflow with one XLSX package:
--   * Sanaa: Mufadala-style MCQ sheets (exactly four choices).
--   * Aden: official-book-style text questions with a model answer.
--
-- The package still lands as a DRAFT ministerial model. Final visibility remains
-- behind publish_ministerial_model(), revision pinning and the existing track gate.
-- Existing questions/models are never rewritten by this importer.

BEGIN;

ALTER TABLE public.ministerial_import_prepares
  DROP CONSTRAINT IF EXISTS ministerial_import_prepares_kind_check;
ALTER TABLE public.ministerial_import_prepares
  ADD CONSTRAINT ministerial_import_prepares_kind_check
  CHECK (kind IN ('M01', 'M02', 'SANA_PACKAGE_V1', 'ADEN_PACKAGE_V1'));

ALTER TABLE public.ministerial_exam_models
  ADD COLUMN IF NOT EXISTS import_contract text;
ALTER TABLE public.ministerial_exam_models
  ADD COLUMN IF NOT EXISTS source_fingerprint text;
ALTER TABLE public.ministerial_exam_models
  ADD CONSTRAINT ministerial_model_source_fingerprint_shape
  CHECK (source_fingerprint IS NULL OR source_fingerprint ~ '^[a-f0-9]{64}$')
  NOT VALID;
ALTER TABLE public.ministerial_exam_models
  VALIDATE CONSTRAINT ministerial_model_source_fingerprint_shape;

COMMENT ON COLUMN public.ministerial_exam_models.import_contract IS
  'Operator import contract. ministerial_track_package_v1 separates Sanaa MCQ from Aden text-answer content.';
COMMENT ON COLUMN public.ministerial_exam_models.source_fingerprint IS
  'Server-computed SHA-256 of the canonical imported model. Used for fail-closed idempotency.';

CREATE OR REPLACE FUNCTION public.ministerial_track_package_prepare(_package jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_contract constant text := 'ministerial_track_package_v1';
  v_track_code text := lower(btrim(coalesce(_package->>'track_code', '')));
  v_subject_code text := lower(btrim(coalesce(_package->>'subject_code', '')));
  v_source_sha text := lower(btrim(coalesce(_package->>'source_sha256', '')));
  v_subject record;
  v_track record;
  v_model jsonb;
  v_question jsonb;
  v_option jsonb;
  v_models jsonb := '[]'::jsonb;
  v_preview jsonb := '[]'::jsonb;
  v_model_code text;
  v_variant text;
  v_model_hash text;
  v_action text;
  v_blocked text;
  v_year integer;
  v_declared integer;
  v_question_count integer;
  v_model_count integer;
  v_total_questions integer := 0;
  v_order integer;
  v_seen_orders integer[];
  v_correct text;
  v_expected_model_answer text;
  v_option_count integer;
  v_marks numeric;
  v_seen_model_codes text[] := ARRAY[]::text[];
  v_prepare_id uuid;
  v_summary jsonb;
  v_prepare_fingerprint text;
  v_existing record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_package) IS DISTINCT FROM 'object'
     OR _package->>'contract_version' IS DISTINCT FROM v_contract THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_CONTRACT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_track_code NOT IN ('sanaa', 'aden') THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_TRACK_INVALID' USING ERRCODE = '22023';
  END IF;
  IF v_source_sha !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_SOURCE_SHA_INVALID' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(_package->'models') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MODELS_INVALID' USING ERRCODE = '22023';
  END IF;

  v_model_count := jsonb_array_length(_package->'models');
  IF v_model_count NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MODEL_COUNT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.code, s.name, s.grade_id, g.slug AS grade_slug, g.name AS grade_name
  INTO v_subject
  FROM public.subjects s
  LEFT JOIN public.grades g ON g.id = s.grade_id
  WHERE lower(s.code) = v_subject_code;
  IF v_subject.id IS NULL THEN
    RAISE EXCEPTION 'SUBJECT_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    lower(coalesce(v_subject.grade_slug, '')) IN ('grade-12', 'g12')
    OR lower(v_subject.code) ~ '^sub-g12-[0-9]{3}$'
    OR coalesce(v_subject.grade_name, '') ~ 'الثالث[[:space:]]+الثانوي|الثاني[[:space:]]+عشر'
  ) THEN
    RAISE EXCEPTION 'MINISTERIAL_GRADE_SCOPE_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT id, track_code, track_name, is_active INTO v_track
  FROM public.curriculum_tracks WHERE lower(track_code) = v_track_code;
  IF v_track.id IS NULL THEN
    RAISE EXCEPTION 'TRACK_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  IF v_track.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'TRACK_INACTIVE' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.subject_curriculum_tracks sct
    WHERE sct.subject_id = v_subject.id
      AND sct.curriculum_track_id = v_track.id
      AND sct.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'SUBJECT_TRACK_NOT_ASSIGNED' USING ERRCODE = '22023';
  END IF;

  FOR v_model IN SELECT value FROM jsonb_array_elements(_package->'models') LOOP
    v_blocked := NULL;
    v_action := NULL;
    v_variant := lower(btrim(coalesce(v_model->>'variant_code', '')));
    IF v_variant !~ '^[a-z0-9-]{1,20}$' THEN
      RAISE EXCEPTION 'MINISTERIAL_INVALID_VARIANT_CODE: %', v_variant USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(coalesce(v_model->>'model_label', ''))) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MODEL_LABEL_INVALID' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_year := (v_model->>'academic_year')::integer;
      v_declared := (v_model->>'declared_question_count')::integer;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MODEL_METADATA_INVALID' USING ERRCODE = '22023';
    END;
    IF v_year NOT BETWEEN 2000 AND 2100 THEN
      RAISE EXCEPTION 'MINISTERIAL_INVALID_YEAR: %', v_year USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_model->'questions') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'MINISTERIAL_PACKAGE_QUESTIONS_INVALID' USING ERRCODE = '22023';
    END IF;
    v_question_count := jsonb_array_length(v_model->'questions');
    IF v_question_count NOT BETWEEN 1 AND 500 OR v_question_count <> v_declared THEN
      RAISE EXCEPTION 'MINISTERIAL_PACKAGE_QUESTION_COUNT_MISMATCH' USING ERRCODE = '22023';
    END IF;
    v_total_questions := v_total_questions + v_question_count;
    IF v_total_questions > 5000 THEN
      RAISE EXCEPTION 'MINISTERIAL_PACKAGE_TOTAL_QUESTIONS_EXCEEDED' USING ERRCODE = '22023';
    END IF;

    v_seen_orders := ARRAY[]::integer[];
    FOR v_question IN SELECT value FROM jsonb_array_elements(v_model->'questions') LOOP
      IF char_length(btrim(coalesce(v_question->>'question_text', ''))) NOT BETWEEN 1 AND 20000 THEN
        RAISE EXCEPTION 'MINISTERIAL_PACKAGE_QUESTION_TEXT_INVALID' USING ERRCODE = '22023';
      END IF;
      IF char_length(coalesce(v_question->>'model_answer', '')) > 20000
         OR char_length(coalesce(v_question->>'explanation', '')) > 20000 THEN
        RAISE EXCEPTION 'MINISTERIAL_PACKAGE_ANSWER_TEXT_TOO_LONG' USING ERRCODE = '22023';
      END IF;
      BEGIN
        v_marks := coalesce((v_question->>'marks')::numeric, 1);
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MARKS_INVALID' USING ERRCODE = '22023';
      END;
      IF v_marks <= 0 OR v_marks > 1000 THEN
        RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MARKS_INVALID' USING ERRCODE = '22023';
      END IF;
      BEGIN
        v_order := (v_question->>'display_order')::integer;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'MINISTERIAL_PACKAGE_DISPLAY_ORDER_INVALID' USING ERRCODE = '22023';
      END;
      IF v_order <= 0 OR v_order = ANY(v_seen_orders) THEN
        RAISE EXCEPTION 'DUPLICATE_DISPLAY_ORDER: %', v_order USING ERRCODE = '22023';
      END IF;
      v_seen_orders := array_append(v_seen_orders, v_order);

      IF v_track_code = 'sanaa' THEN
        IF jsonb_typeof(v_question->'options') IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'SANA_PACKAGE_OPTIONS_INVALID' USING ERRCODE = '22023';
        END IF;
        v_option_count := jsonb_array_length(v_question->'options');
        v_correct := upper(btrim(coalesce(v_question->>'correct_option_code', '')));
        IF v_option_count <> 4 OR v_correct NOT IN ('A', 'B', 'C', 'D') THEN
          RAISE EXCEPTION 'SANA_PACKAGE_MCQ_CONTRACT_INVALID' USING ERRCODE = '22023';
        END IF;
        IF (SELECT count(DISTINCT upper(value->>'option_code'))
            FROM jsonb_array_elements(v_question->'options')) <> 4 THEN
          RAISE EXCEPTION 'SANA_PACKAGE_OPTION_CODES_INVALID' USING ERRCODE = '22023';
        END IF;
        FOR v_option IN SELECT value FROM jsonb_array_elements(v_question->'options') LOOP
          IF upper(v_option->>'option_code') NOT IN ('A', 'B', 'C', 'D')
             OR char_length(btrim(coalesce(v_option->>'body', ''))) NOT BETWEEN 1 AND 20000 THEN
            RAISE EXCEPTION 'SANA_PACKAGE_OPTION_INVALID' USING ERRCODE = '22023';
          END IF;
        END LOOP;
        SELECT btrim(value->>'body') INTO v_expected_model_answer
        FROM jsonb_array_elements(v_question->'options')
        WHERE upper(value->>'option_code') = v_correct
        LIMIT 1;
        IF btrim(coalesce(v_question->>'model_answer', '')) IS DISTINCT FROM v_expected_model_answer THEN
          RAISE EXCEPTION 'SANA_PACKAGE_MODEL_ANSWER_MISMATCH' USING ERRCODE = '22023';
        END IF;
      ELSE
        IF jsonb_typeof(v_question->'options') IS DISTINCT FROM 'array'
           OR jsonb_array_length(v_question->'options') <> 0
           OR nullif(v_question->>'correct_option_code', '') IS NOT NULL
           OR char_length(btrim(coalesce(v_question->>'model_answer', ''))) NOT BETWEEN 1 AND 20000 THEN
          RAISE EXCEPTION 'ADEN_PACKAGE_TEXT_CONTRACT_INVALID' USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;

    v_model_code := public.ministerial_build_model_code(
      v_subject.code, v_track_code, v_year, 'r1', v_variant
    );
    IF v_model_code = ANY(v_seen_model_codes) THEN
      RAISE EXCEPTION 'DUPLICATE_MODEL_IDENTITY_IN_PACKAGE: %', v_model_code USING ERRCODE = '22023';
    END IF;
    v_seen_model_codes := array_append(v_seen_model_codes, v_model_code);
    v_model_hash := public.cf10_text_sha256(jsonb_build_object(
      'contract_version', v_contract,
      'track_code', v_track_code,
      'subject_code', lower(v_subject.code),
      'academic_year', v_year,
      'variant_code', v_variant,
      'model_label', btrim(v_model->>'model_label'),
      'questions', v_model->'questions'
    )::text);

    SELECT id, status, source_fingerprint, import_contract
    INTO v_existing
    FROM public.ministerial_exam_models
    WHERE model_code = v_model_code;
    IF v_existing.id IS NULL THEN
      v_action := 'INSERT';
    ELSIF v_existing.status = 'draft'
          AND v_existing.import_contract = v_contract
          AND v_existing.source_fingerprint = v_model_hash THEN
      v_action := 'SKIP';
    ELSIF v_existing.status <> 'draft' THEN
      v_blocked := 'MODEL_IDENTITY_IMMUTABLE';
    ELSE
      v_blocked := 'MODEL_CONTENT_CONFLICT';
    END IF;

    v_models := v_models || jsonb_build_object(
      'model_code', v_model_code,
      'model_label', btrim(v_model->>'model_label'),
      'academic_year', v_year,
      'variant_code', v_variant,
      'worksheet_name', v_model->>'worksheet_name',
      'model_fingerprint', v_model_hash,
      'questions', v_model->'questions',
      'action', coalesce(v_action, 'BLOCKED'),
      'blocked_reason', v_blocked
    );
    v_preview := v_preview || jsonb_build_object(
      'model_code', v_model_code,
      'model_label', btrim(v_model->>'model_label'),
      'academic_year', v_year,
      'track_code', v_track_code,
      'question_count', v_question_count,
      'fingerprint', v_model_hash,
      'action', coalesce(v_action, 'BLOCKED'),
      'blocked_reason', v_blocked
    );
  END LOOP;

  v_summary := jsonb_build_object(
    'models', v_model_count,
    'questions', v_total_questions,
    'insert', (SELECT count(*) FROM jsonb_array_elements(v_models) r WHERE r->>'action' = 'INSERT'),
    'skip', (SELECT count(*) FROM jsonb_array_elements(v_models) r WHERE r->>'action' = 'SKIP'),
    'blocked', (SELECT count(*) FROM jsonb_array_elements(v_models) r WHERE r->>'action' = 'BLOCKED')
  );
  v_prepare_fingerprint := public.cf10_text_sha256(v_models::text);

  INSERT INTO public.ministerial_import_prepares(kind, actor_id, fingerprint, staged_rows, summary)
  VALUES (
    CASE v_track_code WHEN 'sanaa' THEN 'SANA_PACKAGE_V1' ELSE 'ADEN_PACKAGE_V1' END,
    v_actor,
    v_prepare_fingerprint,
    v_models,
    v_summary || jsonb_build_object(
      'contract_version', v_contract,
      'track_code', v_track_code,
      'subject_id', v_subject.id,
      'subject_code', v_subject.code,
      'source_sha256', v_source_sha
    )
  )
  RETURNING id INTO v_prepare_id;

  RETURN jsonb_build_object(
    'prepare_id', v_prepare_id,
    'prepare_fingerprint', v_prepare_fingerprint,
    'summary', v_summary,
    'preview', v_preview,
    'expires_in_minutes', 60
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ministerial_track_package_prepare(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ministerial_track_package_prepare(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.ministerial_track_package_execute(
  _prepare_id uuid,
  _expected_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_contract constant text := 'ministerial_track_package_v1';
  v_prepare public.ministerial_import_prepares;
  v_track_code text;
  v_subject_id uuid;
  v_subject record;
  v_track_id uuid;
  v_model jsonb;
  v_question jsonb;
  v_option jsonb;
  v_template_id uuid;
  v_model_id uuid;
  v_question_id uuid;
  v_revision_id uuid;
  v_model_code text;
  v_question_code text;
  v_question_number integer;
  v_start_number integer;
  v_attempts integer;
  v_legacy_options jsonb;
  v_correct_index integer;
  v_option_index integer;
  v_inserted_models integer := 0;
  v_inserted_questions integer := 0;
  v_skipped_models integer := 0;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prepare
  FROM public.ministerial_import_prepares
  WHERE id = _prepare_id
    AND actor_id = v_actor
    AND kind IN ('SANA_PACKAGE_V1', 'ADEN_PACKAGE_V1')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MINISTERIAL_PREPARE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_prepare.status <> 'pending' THEN
    RAISE EXCEPTION 'MINISTERIAL_PREPARE_ALREADY_CONSUMED' USING ERRCODE = '22023';
  END IF;
  IF v_prepare.expires_at < now() THEN
    RAISE EXCEPTION 'MINISTERIAL_PREPARE_EXPIRED' USING ERRCODE = '22023';
  END IF;
  IF btrim(coalesce(_expected_fingerprint, '')) IS DISTINCT FROM v_prepare.fingerprint
     OR public.cf10_text_sha256(v_prepare.staged_rows::text) IS DISTINCT FROM v_prepare.fingerprint THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_FINGERPRINT_MISMATCH' USING ERRCODE = '40001';
  END IF;
  IF coalesce((v_prepare.summary->>'blocked')::integer, 0) <> 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_HAS_BLOCKED_MODELS' USING ERRCODE = '22023';
  END IF;

  v_track_code := v_prepare.summary->>'track_code';
  v_subject_id := (v_prepare.summary->>'subject_id')::uuid;
  SELECT id, code, name INTO v_subject FROM public.subjects WHERE id = v_subject_id;
  SELECT id INTO v_track_id FROM public.curriculum_tracks
  WHERE track_code = v_track_code AND is_active IS TRUE;
  IF v_subject.id IS NULL OR v_track_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.subject_curriculum_tracks
    WHERE subject_id = v_subject_id AND curriculum_track_id = v_track_id AND is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'MINISTERIAL_PACKAGE_CONTEXT_DRIFT' USING ERRCODE = '40001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_subject.code || ':' || v_track_code, 0));

  FOR v_model IN SELECT value FROM jsonb_array_elements(v_prepare.staged_rows) LOOP
    v_model_code := v_model->>'model_code';
    IF v_model->>'action' = 'SKIP' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.ministerial_exam_models m
        WHERE m.model_code = v_model_code
          AND m.status = 'draft'
          AND m.import_contract = v_contract
          AND m.source_fingerprint = v_model->>'model_fingerprint'
      ) THEN
        RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MODEL_DRIFT: %', v_model_code USING ERRCODE = '40001';
      END IF;
      v_skipped_models := v_skipped_models + 1;
      CONTINUE;
    END IF;
    IF v_model->>'action' <> 'INSERT' OR EXISTS (
      SELECT 1 FROM public.ministerial_exam_models WHERE model_code = v_model_code
    ) THEN
      RAISE EXCEPTION 'MINISTERIAL_PACKAGE_MODEL_DRIFT: %', v_model_code USING ERRCODE = '40001';
    END IF;

    INSERT INTO public.exam_templates(title, mode, subject_id, is_active, code, created_by)
    VALUES (
      v_model->>'model_label', 'ministry', v_subject_id, true, v_model_code, v_actor
    ) RETURNING id INTO v_template_id;

    INSERT INTO public.ministerial_exam_models(
      template_id, subject_id, curriculum_track_id, academic_year, round_code,
      variant_code, model_code, model_label, status, created_by,
      import_contract, source_fingerprint
    ) VALUES (
      v_template_id, v_subject_id, v_track_id, (v_model->>'academic_year')::integer, 'r1',
      v_model->>'variant_code', v_model_code, v_model->>'model_label', 'draft', v_actor,
      v_contract, v_model->>'model_fingerprint'
    ) RETURNING id INTO v_model_id;

    FOR v_question IN
      SELECT value FROM jsonb_array_elements(v_model->'questions')
      ORDER BY (value->>'display_order')::integer
    LOOP
      v_start_number := 1 + (
        (hashtextextended(v_model_code || ':' || (v_question->>'display_order'), 0)
          & 9223372036854775807) % 99999
      )::integer;
      v_question_number := v_start_number;
      v_attempts := 0;
      LOOP
        v_question_code := format(
          'q-%s-%s-%s', split_part(v_subject.code, '-', 2), split_part(v_subject.code, '-', 3),
          lpad(v_question_number::text, 5, '0')
        );
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.questions WHERE code = v_question_code);
        v_question_number := CASE WHEN v_question_number = 99999 THEN 1 ELSE v_question_number + 1 END;
        v_attempts := v_attempts + 1;
        IF v_attempts >= 99999 THEN
          RAISE EXCEPTION 'MINISTERIAL_QUESTION_CODE_SPACE_EXHAUSTED' USING ERRCODE = '54000';
        END IF;
      END LOOP;

      SELECT coalesce(jsonb_agg(value->>'body' ORDER BY value->>'option_code'), '[]'::jsonb)
      INTO v_legacy_options
      FROM jsonb_array_elements(v_question->'options');
      v_correct_index := CASE upper(coalesce(v_question->>'correct_option_code', ''))
        WHEN 'A' THEN 0 WHEN 'B' THEN 1 WHEN 'C' THEN 2 WHEN 'D' THEN 3 ELSE -1 END;

      INSERT INTO public.questions(
        subject_id, question_text, options, correct_index, question_type,
        year, sort_order, code, created_by
      ) VALUES (
        v_subject_id, v_question->>'question_text', v_legacy_options, v_correct_index,
        CASE v_track_code WHEN 'sanaa' THEN 'MULTIPLE_CHOICE' ELSE 'EXTENDED_RESPONSE' END,
        (v_model->>'academic_year')::integer, (v_question->>'display_order')::integer,
        v_question_code, v_actor
      ) RETURNING id INTO v_question_id;

      INSERT INTO public.question_revisions(
        question_id, revision_number, status, interaction_type, grading_mode,
        educational_label, question_text, max_score, allow_partial, requires_media,
        manual_grading_required, payload_hash_version, source_payload_hash, created_by
      ) VALUES (
        v_question_id, 1, 'DRAFT',
        CASE v_track_code WHEN 'sanaa' THEN 'SINGLE_CHOICE' ELSE 'LONG_TEXT' END,
        CASE v_track_code WHEN 'sanaa' THEN 'AUTO_SINGLE' ELSE 'MANUAL' END,
        'MINISTERIAL_PREVIOUS_EXAM', v_question->>'question_text',
        coalesce((v_question->>'marks')::numeric, 1), false, false,
        v_track_code = 'aden', 'canonical_payload_v1',
        public.cf10_text_sha256(v_question::text), v_actor
      ) RETURNING id INTO v_revision_id;

      v_option_index := 0;
      FOR v_option IN
        SELECT value FROM jsonb_array_elements(v_question->'options')
        ORDER BY value->>'option_code'
      LOOP
        INSERT INTO public.question_options(
          question_revision_id, option_code, body, sort_order, is_correct
        ) VALUES (
          v_revision_id, upper(v_option->>'option_code'), v_option->>'body', v_option_index,
          upper(v_option->>'option_code') = upper(v_question->>'correct_option_code')
        );
        v_option_index := v_option_index + 1;
      END LOOP;

      INSERT INTO public.question_solutions(
        question_revision_id, solution_code, solution_type, sort_order,
        model_answer, explanation, reveal_policy, created_by
      ) VALUES (
        v_revision_id, 'MODEL', 'MODEL', 0,
        nullif(v_question->>'model_answer', ''), nullif(v_question->>'explanation', ''),
        'AFTER_SUBMIT', v_actor
      );
      INSERT INTO public.question_targets(
        question_id, revision_id, target_type, subject_id, is_primary, created_by
      ) VALUES (v_question_id, v_revision_id, 'SUBJECT', v_subject_id, true, v_actor);

      UPDATE public.question_revisions
      SET payload_hash = public._qb_compute_revision_payload_hash(v_revision_id)
      WHERE id = v_revision_id;
      UPDATE public.question_revisions
      SET status = 'APPROVED', reviewed_at = now(), reviewed_by = v_actor
      WHERE id = v_revision_id;
      UPDATE public.question_revisions
      SET status = 'PUBLISHED', published_at = now(), published_by = v_actor
      WHERE id = v_revision_id;
      UPDATE public.questions
      SET current_published_revision_id = v_revision_id
      WHERE id = v_question_id;

      INSERT INTO public.ministerial_exam_questions(
        model_id, question_id, published_revision_id, source_question_code,
        sort_order, marks, original_question_number, source_reference
      ) VALUES (
        v_model_id, v_question_id, v_revision_id, v_question_code,
        (v_question->>'display_order')::integer, coalesce((v_question->>'marks')::numeric, 1),
        (v_question->>'display_order')::integer,
        'track-package:' || left(v_prepare.summary->>'source_sha256', 16)
      );
      INSERT INTO public.exam_template_questions(template_id, question_id, sort_order, points)
      VALUES (
        v_template_id, v_question_id, (v_question->>'display_order')::integer,
        coalesce((v_question->>'marks')::numeric, 1)
      );
      v_inserted_questions := v_inserted_questions + 1;
    END LOOP;

    IF NOT public.can_publish_ministerial_model(v_model_id) THEN
      RAISE EXCEPTION 'MINISTERIAL_PACKAGE_PUBLISH_READINESS_FAILED: %', v_model_code
        USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
    VALUES (
      v_actor, 'ministerial_track_package_import', 'ministerial_exam_model', v_model_id,
      jsonb_build_object(
        'contract_version', v_contract,
        'track_code', v_track_code,
        'model_code', v_model_code,
        'model_fingerprint', v_model->>'model_fingerprint',
        'question_count', jsonb_array_length(v_model->'questions'),
        'prepare_id', _prepare_id
      )
    );
    v_inserted_models := v_inserted_models + 1;
  END LOOP;

  UPDATE public.ministerial_import_prepares
  SET status = 'consumed', consumed_at = now()
  WHERE id = _prepare_id;

  v_result := jsonb_build_object(
    'inserted_models', v_inserted_models,
    'inserted_questions', v_inserted_questions,
    'skipped_models', v_skipped_models,
    'published_models', 0,
    'status', 'draft'
  );
  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (
    v_actor, 'ministerial_track_package_execute', 'ministerial_import_prepare', _prepare_id,
    v_result || jsonb_build_object('prepare_fingerprint', v_prepare.fingerprint)
  );
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.ministerial_track_package_execute(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ministerial_track_package_execute(uuid, text) TO authenticated;

DO $proof$
DECLARE
  v_prepare text;
  v_execute text;
BEGIN
  SELECT pg_get_functiondef('public.ministerial_track_package_prepare(jsonb)'::regprocedure)
  INTO v_prepare;
  SELECT pg_get_functiondef('public.ministerial_track_package_execute(uuid,text)'::regprocedure)
  INTO v_execute;
  IF v_prepare IS NULL OR v_execute IS NULL THEN
    RAISE EXCEPTION 'MINISTERIAL_TRACK_PACKAGE_FUNCTION_MISSING';
  END IF;
  IF position('is_content_staff' in v_prepare) = 0
     OR position('source_fingerprint' in v_execute) = 0
     OR position('_qb_compute_revision_payload_hash' in v_execute) = 0
     OR position('can_publish_ministerial_model' in v_execute) = 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_TRACK_PACKAGE_GUARD_MISSING';
  END IF;
  IF has_function_privilege('anon', 'public.ministerial_track_package_prepare(jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.ministerial_track_package_execute(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MINISTERIAL_TRACK_PACKAGE_ANON_EXECUTE';
  END IF;
END
$proof$;

COMMIT;
