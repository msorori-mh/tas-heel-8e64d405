-- =============================================================================
-- PAST_MINISTERIAL_EXAMS_ADMIN_IMPORT_14C.2
-- Closes the six blockers recorded in
--   docs/ministerial-exams/PAST-MINISTERIAL-EXAMS-ADMIN-IMPORT-14C.1.md
--
-- PENDING migration — NOT applied to the shared datastore in this step.
-- No data, no demo rows, no publish side effects.
--
-- Contents:
--   1. Model metadata additives (model_label, archived status)
--   2. Membership metadata additives (M02 contract columns)
--   3. Separate publish capability (PUBLISH_MINISTERIAL_MODEL)
--   4. Prepare/Execute staging with EXACT_REVISION_PINNING
--   5. M01 / M02 RPCs (validate + prepare + execute, atomic, additive)
--   6. Membership removal RPCs (preview + execute + audit)
--   7. Publish narrowing, parity hardening, unpublish/archive
--   8. RPC-ONLY WRITES: direct DML grants revoked from authenticated
-- =============================================================================

-- ============================================================ 1. model additives
ALTER TABLE public.ministerial_exam_models
  ADD COLUMN IF NOT EXISTS model_label text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.ministerial_exam_models
  DROP CONSTRAINT IF EXISTS ministerial_exam_models_status_check;
ALTER TABLE public.ministerial_exam_models
  ADD CONSTRAINT ministerial_exam_models_status_check
  CHECK (status IN ('draft', 'published', 'archived'));

-- ======================================================= 2. membership additives
ALTER TABLE public.ministerial_exam_questions
  ADD COLUMN IF NOT EXISTS original_question_number integer,
  ADD COLUMN IF NOT EXISTS section_code text,
  ADD COLUMN IF NOT EXISTS source_page integer,
  ADD COLUMN IF NOT EXISTS source_reference text;

CREATE UNIQUE INDEX IF NOT EXISTS ministerial_exam_questions_display_order_uidx
  ON public.ministerial_exam_questions (model_id, sort_order);

-- ================================================== 3. separate publish capability
ALTER TABLE public.question_bank_capability_grants
  DROP CONSTRAINT IF EXISTS question_bank_capability_grants_capability_check;
ALTER TABLE public.question_bank_capability_grants
  ADD CONSTRAINT question_bank_capability_grants_capability_check
  CHECK (capability IN (
    'EDIT_QUESTION_BANK',
    'REVIEW_QUESTION_CONTENT',
    'PUBLISH_QUESTION_REVISION',
    'GRADE_MANUAL_RESPONSE',
    'READ_HIDDEN_SOLUTIONS',
    'DELETE_DRAFT_QUESTION',
    'PUBLISH_MINISTERIAL_MODEL'
  ));

CREATE OR REPLACE FUNCTION public.can_publish_ministerial_exams(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- Deliberately NOT is_content_staff(): content_manager never publishes implicitly.
  SELECT public.qb_has_capability(_user_id, 'PUBLISH_MINISTERIAL_MODEL');
$$;

REVOKE ALL ON FUNCTION public.can_publish_ministerial_exams(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_publish_ministerial_exams(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_publish_ministerial_exams(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_publish_ministerial_exams(uuid) TO service_role;

-- ================================================== 4. prepare staging (pinning)
CREATE TABLE IF NOT EXISTS public.ministerial_import_prepares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('M01', 'M02')),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  staged_rows jsonb NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed')),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '60 minutes'
);

GRANT SELECT ON public.ministerial_import_prepares TO authenticated;
GRANT ALL ON public.ministerial_import_prepares TO service_role;

ALTER TABLE public.ministerial_import_prepares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Actor reads own ministerial prepares" ON public.ministerial_import_prepares;
CREATE POLICY "Actor reads own ministerial prepares" ON public.ministerial_import_prepares
  FOR SELECT TO authenticated
  USING (actor_id = auth.uid() AND public.is_content_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ministerial_prepares_actor
  ON public.ministerial_import_prepares (actor_id, created_at DESC);

-- ===================================================== 5a. code generation (TCS-2)
-- mex-{gradeShort}-{trackCode}-{subjectNo:003}-{year:4}-{roundCode}-{variantCode}
CREATE OR REPLACE FUNCTION public.ministerial_build_model_code(
  _subject_code text,
  _track_code text,
  _academic_year integer,
  _round_code text,
  _variant_code text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_parts text[];
BEGIN
  -- TCS-2 subject code: sub-{gradeShort}-{subjectNo:003}. TCS-1 embedded a track and is rejected.
  IF _subject_code !~ '^sub-[a-z0-9]+-[0-9]{3}$' THEN
    RAISE EXCEPTION 'TCS1_CODE_REJECTED: subject code % is not a valid TCS-2 code', _subject_code
      USING ERRCODE = '22023';
  END IF;
  IF _track_code NOT IN ('sanaa', 'aden', 'other') THEN
    RAISE EXCEPTION 'MINISTERIAL_INVALID_TRACK_CODE: %', _track_code USING ERRCODE = '22023';
  END IF;
  IF _round_code NOT IN ('r1', 'r2', 'r3', 'makeup') THEN
    RAISE EXCEPTION 'MINISTERIAL_INVALID_ROUND_CODE: %', _round_code USING ERRCODE = '22023';
  END IF;
  IF _variant_code !~ '^[a-z0-9-]{1,20}$' THEN
    RAISE EXCEPTION 'MINISTERIAL_INVALID_VARIANT_CODE: %', _variant_code USING ERRCODE = '22023';
  END IF;
  IF _academic_year < 2000 OR _academic_year > 2100 THEN
    RAISE EXCEPTION 'MINISTERIAL_INVALID_YEAR: %', _academic_year USING ERRCODE = '22023';
  END IF;

  v_parts := string_to_array(_subject_code, '-');
  RETURN format('mex-%s-%s-%s-%s-%s-%s',
    v_parts[2], _track_code, v_parts[3], _academic_year::text, _round_code, _variant_code);
END;
$$;

REVOKE ALL ON FUNCTION public.ministerial_build_model_code(text, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ministerial_build_model_code(text, text, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ministerial_build_model_code(text, text, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ministerial_build_model_code(text, text, integer, text, text) TO service_role;

-- ============================================================== 5b. M01 prepare
CREATE OR REPLACE FUNCTION public.ministerial_m01_prepare(_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row jsonb;
  v_idx integer := 0;
  v_staged jsonb := '[]'::jsonb;
  v_preview jsonb := '[]'::jsonb;
  v_subject record;
  v_track record;
  v_model record;
  v_code text;
  v_action text;
  v_blocked text;
  v_prepare_id uuid;
  v_counts jsonb;
  v_seen text[] := ARRAY[]::text[];
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_content_staff(v_actor) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(_rows) <> 'array' THEN RAISE EXCEPTION 'M01_INVALID_PAYLOAD' USING ERRCODE = '22023'; END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    v_idx := v_idx + 1;
    v_blocked := NULL; v_action := NULL; v_code := NULL; v_model := NULL;

    SELECT s.id, s.code, s.name, s.grade_id INTO v_subject
    FROM public.subjects s WHERE s.code = (v_row->>'subject_code');
    IF v_subject.id IS NULL THEN v_blocked := 'SUBJECT_NOT_FOUND'; END IF;

    IF v_blocked IS NULL THEN
      SELECT t.id, t.track_code, t.is_active INTO v_track
      FROM public.curriculum_tracks t WHERE t.track_code = (v_row->>'track_code');
      IF v_track.id IS NULL THEN v_blocked := 'TRACK_NOT_FOUND';
      ELSIF v_track.is_active IS NOT TRUE THEN v_blocked := 'TRACK_INACTIVE';
      ELSIF NOT EXISTS (
        SELECT 1 FROM public.subject_curriculum_tracks sct
        WHERE sct.subject_id = v_subject.id
          AND sct.curriculum_track_id = v_track.id
          AND sct.is_active = true
      ) THEN v_blocked := 'SUBJECT_TRACK_NOT_ASSIGNED';
      END IF;
    END IF;

    IF v_blocked IS NULL THEN
      BEGIN
        v_code := public.ministerial_build_model_code(
          v_subject.code,
          v_track.track_code,
          (v_row->>'academic_year')::integer,
          v_row->>'exam_round_code',
          lower(trim(coalesce(v_row->>'model_variant_code', '')))
        );
      EXCEPTION WHEN OTHERS THEN
        v_blocked := split_part(SQLERRM, ':', 1);
      END;
    END IF;

    IF v_blocked IS NULL THEN
      IF v_code = ANY (v_seen) THEN
        v_blocked := 'DUPLICATE_ROW_IN_FILE';
      ELSE
        v_seen := array_append(v_seen, v_code);
      END IF;
    END IF;

    IF v_blocked IS NULL THEN
      SELECT m.id, m.status, m.model_label INTO v_model
      FROM public.ministerial_exam_models m WHERE m.model_code = v_code;

      IF v_model.id IS NULL THEN
        v_action := 'INSERT';
      ELSIF v_model.status <> 'draft' THEN
        v_blocked := 'MODEL_IDENTITY_IMMUTABLE';
      ELSIF coalesce(v_model.model_label, '') IS DISTINCT FROM coalesce(v_row->>'model_label', '') THEN
        v_action := 'UPDATE';
      ELSE
        v_action := 'SKIP';
      END IF;
    END IF;

    v_staged := v_staged || jsonb_build_object(
      'row_number', v_idx,
      'model_code', v_code,
      'subject_id', v_subject.id,
      'track_id', v_track.id,
      'academic_year', (v_row->>'academic_year'),
      'round_code', v_row->>'exam_round_code',
      'variant_code', lower(trim(coalesce(v_row->>'model_variant_code', ''))),
      'model_label', v_row->>'model_label',
      'action', coalesce(v_action, 'BLOCKED'),
      'blocked_reason', v_blocked
    );

    v_preview := v_preview || jsonb_build_object(
      'row_number', v_idx,
      'subject_code', v_row->>'subject_code',
      'subject_name', v_subject.name,
      'track_code', v_row->>'track_code',
      'academic_year', v_row->>'academic_year',
      'round_code', v_row->>'exam_round_code',
      'variant_code', lower(trim(coalesce(v_row->>'model_variant_code', ''))),
      'model_code', v_code,
      'action', coalesce(v_action, 'BLOCKED'),
      'blocked_reason', v_blocked
    );
  END LOOP;

  SELECT jsonb_build_object(
    'rows', v_idx,
    'insert', count(*) FILTER (WHERE r->>'action' = 'INSERT'),
    'update', count(*) FILTER (WHERE r->>'action' = 'UPDATE'),
    'skip',   count(*) FILTER (WHERE r->>'action' = 'SKIP'),
    'blocked',count(*) FILTER (WHERE r->>'action' = 'BLOCKED')
  ) INTO v_counts
  FROM jsonb_array_elements(v_staged) r;

  INSERT INTO public.ministerial_import_prepares (kind, actor_id, fingerprint, staged_rows, summary)
  VALUES ('M01', v_actor, md5(v_staged::text), v_staged, v_counts)
  RETURNING id INTO v_prepare_id;

  RETURN jsonb_build_object('prepare_id', v_prepare_id, 'summary', v_counts, 'preview', v_preview);
END;
$$;

REVOKE ALL ON FUNCTION public.ministerial_m01_prepare(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ministerial_m01_prepare(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.ministerial_m01_prepare(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ministerial_m01_prepare(jsonb) TO service_role;

-- ============================================================== 5c. M01 execute
CREATE OR REPLACE FUNCTION public.ministerial_m01_execute(_prepare_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_prepare public.ministerial_import_prepares;
  v_row jsonb;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_blocked integer := 0;
  v_template_id uuid;
  v_model_id uuid;
  v_subject record;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_content_staff(v_actor) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_prepare FROM public.ministerial_import_prepares
  WHERE id = _prepare_id AND kind = 'M01' AND actor_id = v_actor
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'MINISTERIAL_PREPARE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_prepare.status <> 'pending' THEN RAISE EXCEPTION 'MINISTERIAL_PREPARE_ALREADY_CONSUMED' USING ERRCODE = '22023'; END IF;
  IF v_prepare.expires_at < now() THEN RAISE EXCEPTION 'MINISTERIAL_PREPARE_EXPIRED' USING ERRCODE = '22023'; END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(v_prepare.staged_rows) LOOP
    IF (v_row->>'action') = 'BLOCKED' THEN v_blocked := v_blocked + 1; CONTINUE; END IF;
    IF (v_row->>'action') = 'SKIP' THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    SELECT s.id, s.name INTO v_subject FROM public.subjects s WHERE s.id = (v_row->>'subject_id')::uuid;

    IF (v_row->>'action') = 'INSERT' THEN
      INSERT INTO public.exam_templates (title, mode, subject_id, is_active, code, created_by)
      VALUES (
        coalesce(nullif(v_row->>'model_label', ''), v_subject.name || ' — ' || (v_row->>'academic_year')),
        'ministry',
        (v_row->>'subject_id')::uuid,
        true,
        v_row->>'model_code',
        v_actor
      )
      RETURNING id INTO v_template_id;

      INSERT INTO public.ministerial_exam_models (
        template_id, subject_id, curriculum_track_id, academic_year,
        round_code, variant_code, model_code, model_label, status, created_by
      ) VALUES (
        v_template_id,
        (v_row->>'subject_id')::uuid,
        (v_row->>'track_id')::uuid,
        (v_row->>'academic_year')::integer,
        (v_row->>'round_code')::public.ministerial_exam_round_code,
        v_row->>'variant_code',
        v_row->>'model_code',
        nullif(v_row->>'model_label', ''),
        'draft',
        v_actor
      )
      RETURNING id INTO v_model_id;

      v_inserted := v_inserted + 1;
    ELSE
      UPDATE public.ministerial_exam_models
      SET model_label = nullif(v_row->>'model_label', ''), updated_at = now()
      WHERE model_code = (v_row->>'model_code') AND status = 'draft'
      RETURNING id INTO v_model_id;
      IF v_model_id IS NULL THEN
        RAISE EXCEPTION 'MODEL_IDENTITY_IMMUTABLE: % is no longer a draft', v_row->>'model_code'
          USING ERRCODE = '42501';
      END IF;
      v_updated := v_updated + 1;
    END IF;

    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (v_actor, 'ministerial_m01_' || lower(v_row->>'action'), 'ministerial_exam_model', v_model_id,
            jsonb_build_object('model_code', v_row->>'model_code', 'prepare_id', _prepare_id));
  END LOOP;

  UPDATE public.ministerial_import_prepares
  SET status = 'consumed', consumed_at = now()
  WHERE id = _prepare_id;

  RETURN jsonb_build_object(
    'inserted', v_inserted, 'updated', v_updated,
    'skipped', v_skipped, 'blocked', v_blocked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ministerial_m01_execute(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ministerial_m01_execute(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ministerial_m01_execute(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ministerial_m01_execute(uuid) TO service_role;

-- ============================================================== 5d. M02 prepare
CREATE OR REPLACE FUNCTION public.ministerial_m02_prepare(_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row jsonb;
  v_idx integer := 0;
  v_staged jsonb := '[]'::jsonb;
  v_preview jsonb := '[]'::jsonb;
  v_model record;
  v_question record;
  v_rev record;
  v_action text;
  v_blocked text;
  v_prepare_id uuid;
  v_counts jsonb;
  v_seen text[] := ARRAY[]::text[];
  v_order_seen text[] := ARRAY[]::text[];
  v_key text;
  v_forbidden text[] := ARRAY['question_text','stimulus_text','options','correct_answer','correct_index',
                              'explanation','solution','solution_steps','accepted_answers'];
  v_field text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_content_staff(v_actor) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(_rows) <> 'array' THEN RAISE EXCEPTION 'M02_INVALID_PAYLOAD' USING ERRCODE = '22023'; END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    FOREACH v_field IN ARRAY v_forbidden LOOP
      IF v_row ? v_field THEN
        RAISE EXCEPTION 'M02_FORBIDDEN_COLUMN: %', v_field USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END LOOP;

  FOR v_row IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    v_idx := v_idx + 1;
    v_blocked := NULL; v_action := NULL; v_model := NULL; v_question := NULL; v_rev := NULL;

    SELECT m.id, m.subject_id, m.status, m.template_id INTO v_model
    FROM public.ministerial_exam_models m WHERE m.model_code = (v_row->>'ministerial_model_code');

    IF v_model.id IS NULL THEN v_blocked := 'MODEL_NOT_FOUND';
    ELSIF v_model.status <> 'draft' THEN v_blocked := 'MODEL_NOT_DRAFT';
    END IF;

    IF v_blocked IS NULL THEN
      SELECT q.id, q.subject_id, q.current_published_revision_id INTO v_question
      FROM public.questions q WHERE q.code = (v_row->>'question_code');
      IF v_question.id IS NULL THEN v_blocked := 'QUESTION_NOT_FOUND';
      ELSIF v_question.current_published_revision_id IS NULL THEN v_blocked := 'QUESTION_NOT_PUBLISHED';
      ELSIF v_question.subject_id IS DISTINCT FROM v_model.subject_id THEN v_blocked := 'QUESTION_SUBJECT_MISMATCH';
      END IF;
    END IF;

    IF v_blocked IS NULL THEN
      SELECT r.id, r.status INTO v_rev
      FROM public.question_revisions r
      WHERE r.id = v_question.current_published_revision_id AND r.status = 'PUBLISHED';
      IF v_rev.id IS NULL THEN v_blocked := 'QUESTION_NOT_PUBLISHED'; END IF;
    END IF;

    IF v_blocked IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.question_targets t
      WHERE t.revision_id = v_rev.id AND t.subject_id = v_model.subject_id
    ) THEN
      v_blocked := 'TARGET_SUBJECT_MISMATCH';
    END IF;

    IF v_blocked IS NULL THEN
      v_key := v_model.id::text || ':' || v_question.id::text;
      IF v_key = ANY (v_seen) THEN v_blocked := 'DUPLICATE_ROW_IN_FILE';
      ELSE v_seen := array_append(v_seen, v_key); END IF;
    END IF;

    IF v_blocked IS NULL THEN
      v_key := v_model.id::text || ':' || coalesce(v_row->>'display_order', '');
      IF v_key = ANY (v_order_seen) THEN v_blocked := 'DUPLICATE_DISPLAY_ORDER';
      ELSE v_order_seen := array_append(v_order_seen, v_key); END IF;
    END IF;

    IF v_blocked IS NULL AND EXISTS (
      SELECT 1 FROM public.ministerial_exam_questions mq
      WHERE mq.model_id = v_model.id
        AND mq.sort_order = (v_row->>'display_order')::integer
        AND mq.question_id <> v_question.id
    ) THEN
      v_blocked := 'DUPLICATE_DISPLAY_ORDER';
    END IF;

    IF v_blocked IS NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.ministerial_exam_questions mq
        WHERE mq.model_id = v_model.id
          AND mq.question_id = v_question.id
          AND mq.published_revision_id = v_rev.id
          AND mq.sort_order = (v_row->>'display_order')::integer
          AND coalesce(mq.marks, 0) = coalesce((v_row->>'marks')::numeric, 1)
      ) THEN
        v_action := 'SKIP';
      ELSIF EXISTS (
        SELECT 1 FROM public.ministerial_exam_questions mq
        WHERE mq.model_id = v_model.id AND mq.question_id = v_question.id
      ) THEN
        v_action := 'UPDATE';
      ELSE
        v_action := 'INSERT';
      END IF;
    END IF;

    v_staged := v_staged || jsonb_build_object(
      'row_number', v_idx,
      'model_id', v_model.id,
      'model_code', v_row->>'ministerial_model_code',
      'question_id', v_question.id,
      'question_code', v_row->>'question_code',
      'pinned_revision_id', v_rev.id,
      'original_question_number', v_row->>'original_question_number',
      'section_code', v_row->>'section_code',
      'marks', coalesce(v_row->>'marks', '1'),
      'source_page', v_row->>'source_page',
      'source_reference', v_row->>'source_reference',
      'display_order', v_row->>'display_order',
      'action', coalesce(v_action, 'BLOCKED'),
      'blocked_reason', v_blocked
    );

    v_preview := v_preview || jsonb_build_object(
      'row_number', v_idx,
      'model_code', v_row->>'ministerial_model_code',
      'question_code', v_row->>'question_code',
      'question_id', v_question.id,
      'pinned_revision_id', v_rev.id,
      'original_question_number', v_row->>'original_question_number',
      'marks', v_row->>'marks',
      'display_order', v_row->>'display_order',
      'action', coalesce(v_action, 'BLOCKED'),
      'blocked_reason', v_blocked
    );
  END LOOP;

  SELECT jsonb_build_object(
    'rows', v_idx,
    'insert', count(*) FILTER (WHERE r->>'action' = 'INSERT'),
    'update', count(*) FILTER (WHERE r->>'action' = 'UPDATE'),
    'skip',   count(*) FILTER (WHERE r->>'action' = 'SKIP'),
    'blocked',count(*) FILTER (WHERE r->>'action' = 'BLOCKED')
  ) INTO v_counts
  FROM jsonb_array_elements(v_staged) r;

  INSERT INTO public.ministerial_import_prepares (kind, actor_id, fingerprint, staged_rows, summary)
  VALUES ('M02', v_actor, md5(v_staged::text), v_staged, v_counts)
  RETURNING id INTO v_prepare_id;

  RETURN jsonb_build_object('prepare_id', v_prepare_id, 'summary', v_counts, 'preview', v_preview);
END;
$$;

REVOKE ALL ON FUNCTION public.ministerial_m02_prepare(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ministerial_m02_prepare(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.ministerial_m02_prepare(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ministerial_m02_prepare(jsonb) TO service_role;

-- ============================================================== 5e. M02 execute
-- EXACT_REVISION_PINNING: any drift between prepare and execute fails the whole
-- transaction with MINISTERIAL_REVISION_CHANGED_REPREPARE. Never silently upgrade.
CREATE OR REPLACE FUNCTION public.ministerial_m02_execute(_prepare_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_prepare public.ministerial_import_prepares;
  v_row jsonb;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_blocked integer := 0;
  v_current uuid;
  v_model_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_content_staff(v_actor) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_prepare FROM public.ministerial_import_prepares
  WHERE id = _prepare_id AND kind = 'M02' AND actor_id = v_actor
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'MINISTERIAL_PREPARE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_prepare.status <> 'pending' THEN RAISE EXCEPTION 'MINISTERIAL_PREPARE_ALREADY_CONSUMED' USING ERRCODE = '22023'; END IF;
  IF v_prepare.expires_at < now() THEN RAISE EXCEPTION 'MINISTERIAL_PREPARE_EXPIRED' USING ERRCODE = '22023'; END IF;

  -- Pass 1: drift guard over every actionable row before touching any table.
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_prepare.staged_rows) LOOP
    IF (v_row->>'action') = 'BLOCKED' THEN CONTINUE; END IF;

    SELECT q.current_published_revision_id INTO v_current
    FROM public.questions q WHERE q.id = (v_row->>'question_id')::uuid;

    IF v_current IS NULL OR v_current::text IS DISTINCT FROM (v_row->>'pinned_revision_id') THEN
      RAISE EXCEPTION 'MINISTERIAL_REVISION_CHANGED_REPREPARE: question % pinned % now %',
        v_row->>'question_code', v_row->>'pinned_revision_id', v_current
        USING ERRCODE = '40001';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.question_revisions r
      WHERE r.id = (v_row->>'pinned_revision_id')::uuid AND r.status = 'PUBLISHED'
    ) THEN
      RAISE EXCEPTION 'MINISTERIAL_REVISION_CHANGED_REPREPARE: revision % no longer published',
        v_row->>'pinned_revision_id' USING ERRCODE = '40001';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.question_targets t
      JOIN public.ministerial_exam_models m ON m.id = (v_row->>'model_id')::uuid
      WHERE t.revision_id = (v_row->>'pinned_revision_id')::uuid
        AND t.subject_id = m.subject_id
    ) THEN
      RAISE EXCEPTION 'TARGET_SUBJECT_MISMATCH: question %', v_row->>'question_code'
        USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.ministerial_exam_models m
      WHERE m.id = (v_row->>'model_id')::uuid AND m.status = 'draft'
    ) THEN
      RAISE EXCEPTION 'MODEL_NOT_DRAFT: %', v_row->>'model_code' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  -- Pass 2: additive writes.
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_prepare.staged_rows) LOOP
    IF (v_row->>'action') = 'BLOCKED' THEN v_blocked := v_blocked + 1; CONTINUE; END IF;
    IF (v_row->>'action') = 'SKIP' THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    v_model_id := (v_row->>'model_id')::uuid;

    INSERT INTO public.ministerial_exam_questions (
      model_id, question_id, published_revision_id, source_question_code,
      sort_order, marks, original_question_number, section_code, source_page, source_reference
    ) VALUES (
      v_model_id,
      (v_row->>'question_id')::uuid,
      (v_row->>'pinned_revision_id')::uuid,
      v_row->>'question_code',
      (v_row->>'display_order')::integer,
      (v_row->>'marks')::numeric,
      nullif(v_row->>'original_question_number', '')::integer,
      nullif(v_row->>'section_code', ''),
      nullif(v_row->>'source_page', '')::integer,
      nullif(v_row->>'source_reference', '')
    )
    ON CONFLICT (model_id, question_id) DO UPDATE
      SET published_revision_id = EXCLUDED.published_revision_id,
          sort_order = EXCLUDED.sort_order,
          marks = EXCLUDED.marks,
          original_question_number = EXCLUDED.original_question_number,
          section_code = EXCLUDED.section_code,
          source_page = EXCLUDED.source_page,
          source_reference = EXCLUDED.source_reference;

    INSERT INTO public.exam_template_questions (template_id, question_id, sort_order, points)
    SELECT m.template_id, (v_row->>'question_id')::uuid,
           (v_row->>'display_order')::integer, (v_row->>'marks')::numeric
    FROM public.ministerial_exam_models m WHERE m.id = v_model_id
    ON CONFLICT (template_id, question_id) DO UPDATE
      SET sort_order = EXCLUDED.sort_order, points = EXCLUDED.points;

    IF (v_row->>'action') = 'INSERT' THEN v_inserted := v_inserted + 1;
    ELSE v_updated := v_updated + 1; END IF;
  END LOOP;

  UPDATE public.ministerial_import_prepares
  SET status = 'consumed', consumed_at = now()
  WHERE id = _prepare_id;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (v_actor, 'ministerial_m02_execute', 'ministerial_import_prepare', _prepare_id,
          jsonb_build_object('inserted', v_inserted, 'updated', v_updated,
                             'skipped', v_skipped, 'blocked', v_blocked));

  RETURN jsonb_build_object(
    'inserted', v_inserted, 'updated', v_updated,
    'skipped', v_skipped, 'blocked', v_blocked
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ministerial_m02_execute(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ministerial_m02_execute(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ministerial_m02_execute(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ministerial_m02_execute(uuid) TO service_role;

-- ============================================== 6. membership removal (explicit)
CREATE OR REPLACE FUNCTION public.ministerial_membership_remove_preview(
  _model_id uuid,
  _question_codes text[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_model public.ministerial_exam_models;
  v_rows jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF NOT public.can_publish_ministerial_exams(v_actor) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_model FROM public.ministerial_exam_models WHERE id = _model_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'model_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'question_code', mq.source_question_code,
    'display_order', mq.sort_order,
    'marks', mq.marks
  )), '[]'::jsonb) INTO v_rows
  FROM public.ministerial_exam_questions mq
  WHERE mq.model_id = _model_id
    AND mq.source_question_code = ANY (_question_codes);

  RETURN jsonb_build_object(
    'model_code', v_model.model_code,
    'model_status', v_model.status,
    'sessions_using_model', (SELECT count(*) FROM public.exam_sessions WHERE ministerial_model_id = _model_id),
    'removable', v_model.status = 'draft',
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ministerial_membership_remove_preview(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ministerial_membership_remove_preview(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.ministerial_membership_remove_preview(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ministerial_membership_remove_preview(uuid, text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.ministerial_membership_remove_execute(
  _model_id uuid,
  _question_codes text[],
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_model public.ministerial_exam_models;
  v_removed integer := 0;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF NOT public.can_publish_ministerial_exams(v_actor) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF coalesce(trim(_reason), '') = '' THEN RAISE EXCEPTION 'MINISTERIAL_REMOVAL_REASON_REQUIRED' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_model FROM public.ministerial_exam_models WHERE id = _model_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'model_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_model.status <> 'draft' THEN
    RAISE EXCEPTION 'MINISTERIAL_REMOVAL_BLOCKED_NOT_DRAFT' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.exam_sessions WHERE ministerial_model_id = _model_id) THEN
    RAISE EXCEPTION 'MINISTERIAL_REMOVAL_BLOCKED_SESSIONS_EXIST' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.exam_template_questions etq
  USING public.ministerial_exam_questions mq
  WHERE mq.model_id = _model_id
    AND mq.source_question_code = ANY (_question_codes)
    AND etq.template_id = v_model.template_id
    AND etq.question_id = mq.question_id;

  DELETE FROM public.ministerial_exam_questions
  WHERE model_id = _model_id AND source_question_code = ANY (_question_codes);
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (v_actor, 'ministerial_membership_remove', 'ministerial_exam_model', _model_id,
          jsonb_build_object('removed', v_removed, 'question_codes', to_jsonb(_question_codes), 'reason', _reason));

  RETURN jsonb_build_object('removed', v_removed);
END;
$$;

REVOKE ALL ON FUNCTION public.ministerial_membership_remove_execute(uuid, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ministerial_membership_remove_execute(uuid, text[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ministerial_membership_remove_execute(uuid, text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ministerial_membership_remove_execute(uuid, text[], text) TO service_role;

-- ===================================== 7. publish parity hardening + narrowing
CREATE OR REPLACE FUNCTION public.can_publish_ministerial_model(_model_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_model public.ministerial_exam_models;
  v_template public.exam_templates;
  v_template_count integer;
  v_membership_count integer;
  v_mismatch integer;
BEGIN
  SELECT * INTO v_model FROM public.ministerial_exam_models WHERE id = _model_id;
  IF NOT FOUND OR v_model.status <> 'draft' THEN RETURN false; END IF;

  -- MODEL_VALIDITY_GATE re-checked at publish time.
  IF NOT EXISTS (
    SELECT 1 FROM public.subject_curriculum_tracks sct
    WHERE sct.subject_id = v_model.subject_id
      AND sct.curriculum_track_id = v_model.curriculum_track_id
      AND sct.is_active = true
  ) THEN RETURN false; END IF;

  SELECT * INTO v_template FROM public.exam_templates WHERE id = v_model.template_id;
  IF NOT FOUND OR v_template.mode <> 'ministry' OR v_template.is_active IS NOT TRUE
     OR v_template.subject_id IS DISTINCT FROM v_model.subject_id THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO v_template_count FROM public.exam_template_questions WHERE template_id = v_model.template_id;
  SELECT count(*) INTO v_membership_count FROM public.ministerial_exam_questions WHERE model_id = _model_id;
  IF v_template_count = 0 OR v_membership_count = 0 OR v_template_count <> v_membership_count THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO v_mismatch FROM (
    SELECT question_id FROM public.exam_template_questions WHERE template_id = v_model.template_id
    EXCEPT
    SELECT question_id FROM public.ministerial_exam_questions WHERE model_id = _model_id
    UNION ALL
    SELECT question_id FROM public.ministerial_exam_questions WHERE model_id = _model_id
    EXCEPT
    SELECT question_id FROM public.exam_template_questions WHERE template_id = v_model.template_id
  ) delta;
  IF v_mismatch <> 0 THEN RETURN false; END IF;

  -- EXACT_REVISION_PARITY: every membership row must still point at the live
  -- published revision of its question, and that revision must be PUBLISHED.
  IF EXISTS (
    SELECT 1
    FROM public.ministerial_exam_questions mq
    JOIN public.questions q ON q.id = mq.question_id
    LEFT JOIN public.question_revisions r ON r.id = mq.published_revision_id
    WHERE mq.model_id = _model_id
      AND (
        q.current_published_revision_id IS DISTINCT FROM mq.published_revision_id
        OR r.id IS NULL
        OR r.status <> 'PUBLISHED'
        OR q.subject_id IS DISTINCT FROM v_model.subject_id
        OR NOT EXISTS (
          SELECT 1 FROM public.question_targets t
          WHERE t.revision_id = mq.published_revision_id AND t.subject_id = v_model.subject_id
        )
      )
  ) THEN RETURN false; END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.can_publish_ministerial_model(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_publish_ministerial_model(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_publish_ministerial_model(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_publish_ministerial_model(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.publish_ministerial_model(_model_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;

  -- PUBLISH CAPABILITY NARROWING: content_manager alone is never enough.
  IF NOT public.can_publish_ministerial_exams(v_actor) THEN
    RAISE EXCEPTION 'MINISTERIAL_PUBLISH_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_publish_ministerial_model(_model_id) THEN
    RAISE EXCEPTION 'MINISTERIAL_PUBLISH_GATE_FAILED: model % cannot be published', _model_id
      USING ERRCODE = '23503';
  END IF;

  UPDATE public.ministerial_exam_models
  SET status = 'published', published_at = now(), published_by = v_actor, updated_at = now()
  WHERE id = _model_id AND status = 'draft';

  IF NOT FOUND THEN RAISE EXCEPTION 'model_already_published_or_not_found' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (v_actor, 'ministerial_publish', 'ministerial_exam_model', _model_id, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.publish_ministerial_model(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_ministerial_model(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_ministerial_model(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_ministerial_model(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.ministerial_model_set_status(
  _model_id uuid,
  _target_status text,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_model public.ministerial_exam_models;
  v_sessions integer;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF NOT public.can_publish_ministerial_exams(v_actor) THEN
    RAISE EXCEPTION 'MINISTERIAL_PUBLISH_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _target_status NOT IN ('draft', 'archived') THEN
    RAISE EXCEPTION 'MINISTERIAL_INVALID_TARGET_STATUS' USING ERRCODE = '22023';
  END IF;
  IF coalesce(trim(_reason), '') = '' THEN
    RAISE EXCEPTION 'MINISTERIAL_STATUS_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_model FROM public.ministerial_exam_models WHERE id = _model_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'model_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT count(*) INTO v_sessions FROM public.exam_sessions WHERE ministerial_model_id = _model_id;

  IF _target_status = 'draft' AND v_sessions > 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_UNPUBLISH_BLOCKED_SESSIONS_EXIST: archive instead' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ministerial_exam_models
  SET status = _target_status,
      published_at = CASE WHEN _target_status = 'draft' THEN NULL ELSE published_at END,
      published_by = CASE WHEN _target_status = 'draft' THEN NULL ELSE published_by END,
      archived_at  = CASE WHEN _target_status = 'archived' THEN now() ELSE NULL END,
      archived_by  = CASE WHEN _target_status = 'archived' THEN v_actor ELSE NULL END,
      updated_at   = now()
  WHERE id = _model_id;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (v_actor, 'ministerial_status_' || _target_status, 'ministerial_exam_model', _model_id,
          jsonb_build_object('reason', _reason, 'sessions', v_sessions));
END;
$$;

REVOKE ALL ON FUNCTION public.ministerial_model_set_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ministerial_model_set_status(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ministerial_model_set_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ministerial_model_set_status(uuid, text, text) TO service_role;

-- ========================================================= 8. RPC-ONLY WRITES
REVOKE INSERT, UPDATE, DELETE ON public.ministerial_exam_models FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ministerial_exam_questions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ministerial_import_prepares FROM authenticated;
REVOKE ALL ON public.ministerial_exam_models FROM anon;
REVOKE ALL ON public.ministerial_exam_questions FROM anon;
REVOKE ALL ON public.ministerial_import_prepares FROM anon;

-- Models: staff read everything, students read published only. No client DML path.
DROP POLICY IF EXISTS "Content staff manage ministerial models" ON public.ministerial_exam_models;
DROP POLICY IF EXISTS "Authenticated read published ministerial models" ON public.ministerial_exam_models;

DROP POLICY IF EXISTS "Content staff read ministerial models" ON public.ministerial_exam_models;
CREATE POLICY "Content staff read ministerial models" ON public.ministerial_exam_models
  FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

CREATE POLICY "Authenticated read published ministerial models" ON public.ministerial_exam_models
  FOR SELECT TO authenticated
  USING (status = 'published');

-- Membership: staff read only; students never read it directly (answers stay in QB).
DROP POLICY IF EXISTS "Content staff manage ministerial question membership" ON public.ministerial_exam_questions;

DROP POLICY IF EXISTS "Content staff read ministerial question membership" ON public.ministerial_exam_questions;
CREATE POLICY "Content staff read ministerial question membership" ON public.ministerial_exam_questions
  FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

-- ============================================================ 9. admin read RPC
CREATE OR REPLACE FUNCTION public.ministerial_models_admin_list()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(x) ORDER BY x.model_code)
    FROM (
      SELECT
        m.id, m.model_code, m.model_label, m.status,
        m.academic_year, m.round_code::text AS round_code, m.variant_code,
        s.name AS subject_name, s.code AS subject_code,
        g.name AS grade_name, g.slug AS grade_slug,
        t.track_code, t.track_name,
        (SELECT count(*) FROM public.ministerial_exam_questions mq WHERE mq.model_id = m.id) AS question_count,
        public.can_publish_ministerial_model(m.id) AS can_publish
      FROM public.ministerial_exam_models m
      JOIN public.subjects s ON s.id = m.subject_id
      LEFT JOIN public.grades g ON g.id = s.grade_id
      JOIN public.curriculum_tracks t ON t.id = m.curriculum_track_id
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.ministerial_models_admin_list() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ministerial_models_admin_list() FROM anon;
GRANT EXECUTE ON FUNCTION public.ministerial_models_admin_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ministerial_models_admin_list() TO service_role;

COMMENT ON TABLE public.ministerial_import_prepares IS
  '14C.2 prepare staging. Holds pinned revision ids per row; execute fails closed on drift.';
