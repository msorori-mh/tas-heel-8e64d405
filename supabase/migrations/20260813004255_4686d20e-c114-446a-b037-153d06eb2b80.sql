-- QUESTION_IMPORT_QB_BINDING_08 — bind template 09 to the question bank workflow.

-- 1) Allow the question-bank specific row actions in staging.
ALTER TABLE public.import_staging_rows DROP CONSTRAINT IF EXISTS import_staging_rows_action_chk;
ALTER TABLE public.import_staging_rows ADD CONSTRAINT import_staging_rows_action_chk
  CHECK (planned_action = ANY (ARRAY['INSERT','UPDATE_DRAFT','NEW_REVISION','SKIP','BLOCKED_PUBLISHED','PUBLISHED_PRESERVED_NEW_REVISION','TARGET_ADDED']));

ALTER TABLE public.import_staging_rows DROP CONSTRAINT IF EXISTS import_staging_rows_applied_action_chk;
ALTER TABLE public.import_staging_rows ADD CONSTRAINT import_staging_rows_applied_action_chk
  CHECK (applied_action IS NULL OR applied_action = ANY (ARRAY['INSERT','UPDATE_DRAFT','NEW_REVISION','SKIP','BLOCKED_PUBLISHED','PUBLISHED_PRESERVED_NEW_REVISION','TARGET_ADDED']));

-- 2) Canonical row-hash recomputation for template 09 (mirrors the TS contract).
CREATE OR REPLACE FUNCTION public._qb_import_row_hash(p jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  fields text[] := ARRAY[
    'question_code','subject_code','lesson_code','question_text',
    'option_1','option_2','option_3','option_4','option_5','option_6',
    'correct_index','explanation','question_type','year','semester','sort_order'
  ];
  f text;
  canonical text := '';
  first boolean := true;
BEGIN
  FOREACH f IN ARRAY fields LOOP
    IF NOT first THEN canonical := canonical || chr(31); END IF;
    first := false;
    canonical := canonical || f || '=' || COALESCE(p->>f, '');
  END LOOP;
  RETURN encode(digest(canonical, 'sha256'), 'hex');
END;
$$;

-- 3) Content fingerprint: identity of the QB revision content only.
--    Deliberately excludes targets (subject/lesson) and ordering metadata.
CREATE OR REPLACE FUNCTION public._qb_import_content_fingerprint(p jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  fields text[] := ARRAY[
    'question_text','option_1','option_2','option_3','option_4','option_5','option_6',
    'correct_index','explanation','question_type'
  ];
  f text;
  canonical text := 'qb_import_content_v1';
BEGIN
  FOREACH f IN ARRAY fields LOOP
    canonical := canonical || chr(31) || f || '=' || COALESCE(p->>f, '');
  END LOOP;
  RETURN encode(digest(canonical, 'sha256'), 'hex');
END;
$$;

-- 4) Internal ingest function. Never callable from the application/client.
CREATE OR REPLACE FUNCTION public.qb_import_ingest_revision(_staging_row_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  row_rec public.import_staging_rows;
  job public.import_jobs;
  p jsonb;
  v_code text;
  v_fp text;
  v_qid uuid;
  v_rev uuid;
  v_num integer;
  v_subject uuid;
  v_unit uuid;
  v_lesson uuid;
  v_target_type text;
  v_target_key uuid;
  v_has_published boolean;
  v_content_match boolean;
  v_target_exists boolean;
  v_action text;
  v_correct integer;
  v_option_count integer := 0;
  i integer;
  v_body text;
BEGIN
  SELECT * INTO row_rec FROM public.import_staging_rows WHERE id = _staging_row_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STAGING_ROW_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF row_rec.template_key <> 'questions' THEN
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

  -- Integrity of the staged row itself. Fail closed on any tampering.
  IF public._qb_import_row_hash(p) <> row_rec.row_hash THEN
    RAISE EXCEPTION 'HASH_MISMATCH: row %', row_rec.row_number USING ERRCODE = '22023';
  END IF;

  v_code := public.normalize_content_code(p->>'question_code');
  IF v_code IS NULL OR length(trim(v_code)) = 0 THEN
    RAISE EXCEPTION 'QUESTION_CODE_REQUIRED: row %', row_rec.row_number USING ERRCODE = '22023';
  END IF;

  IF p->>'question_text' IS NULL OR length(trim(p->>'question_text')) = 0 THEN
    RAISE EXCEPTION 'QUESTION_TEXT_REQUIRED: row %', row_rec.row_number USING ERRCODE = '22023';
  END IF;

  -- Deterministic 64-bit lock on the globally unique question code.
  PERFORM pg_advisory_xact_lock(hashtextextended('qb_question_code:' || v_code, 0));

  -- Target resolution (recomputed here; dry-run output is never trusted).
  IF p ? 'subject_code' THEN
    SELECT s.id INTO v_subject FROM public.subjects s WHERE s.code = p->>'subject_code';
    IF v_subject IS NULL THEN
      RAISE EXCEPTION 'SUBJECT_NOT_FOUND: %', p->>'subject_code' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF p ? 'lesson_code' THEN
    IF v_subject IS NULL THEN
      RAISE EXCEPTION 'SUBJECT_NOT_FOUND: lesson target requires subject_code' USING ERRCODE = '23503';
    END IF;
    SELECT l.id, l.unit_id INTO v_lesson, v_unit
    FROM public.lessons l
    WHERE l.subject_id = v_subject AND l.slug = p->>'lesson_code';
    IF v_lesson IS NULL THEN
      RAISE EXCEPTION 'LESSON_NOT_FOUND: %', p->>'lesson_code' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF v_lesson IS NOT NULL AND v_unit IS NOT NULL THEN
    v_target_type := 'LESSON';
    v_target_key := v_lesson;
  ELSIF v_unit IS NOT NULL THEN
    v_target_type := 'UNIT';
    v_target_key := v_unit;
  ELSIF v_subject IS NOT NULL THEN
    v_target_type := 'SUBJECT';
    v_target_key := v_subject;
  ELSE
    v_target_type := NULL;
  END IF;

  v_fp := public._qb_import_content_fingerprint(p);

  -- Option / answer validation before any write.
  FOR i IN 1..6 LOOP
    v_body := NULLIF(trim(COALESCE(p->>('option_' || i), '')), '');
    IF v_body IS NOT NULL THEN
      v_option_count := v_option_count + 1;
    END IF;
  END LOOP;

  v_correct := NULLIF(p->>'correct_index', '')::integer;
  IF v_option_count < 2 THEN
    RAISE EXCEPTION 'QUESTION_OPTIONS_REQUIRED: row %', row_rec.row_number USING ERRCODE = '22023';
  END IF;
  IF v_correct IS NULL OR v_correct < 1 OR v_correct > v_option_count THEN
    RAISE EXCEPTION 'INVALID_CORRECT_INDEX: row %', row_rec.row_number USING ERRCODE = '22023';
  END IF;

  -- Question root. Identity shell only: no legacy answer columns are populated,
  -- and no legacy lesson/subject binding, so drafts never reach students.
  SELECT q.id INTO v_qid FROM public.questions q WHERE q.code = v_code FOR UPDATE;

  IF v_qid IS NULL THEN
    INSERT INTO public.questions (code, question_text, options, correct_index, question_type, year, semester, sort_order, created_by)
    VALUES (
      v_code,
      p->>'question_text',
      '[]'::jsonb,
      -1,
      COALESCE(NULLIF(p->>'question_type',''), 'lesson'),
      NULLIF(p->>'year','')::integer,
      NULLIF(p->>'semester','')::integer,
      COALESCE(NULLIF(p->>'sort_order','')::integer, 0),
      v_actor
    )
    RETURNING id INTO v_qid;
    v_action := 'INSERT';
  ELSE
    v_action := NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.questions q
    WHERE q.id = v_qid AND q.current_published_revision_id IS NOT NULL
  ) INTO v_has_published;

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
      question_text, max_score, allow_partial, requires_media, manual_grading_required,
      source_payload_hash, created_by
    ) VALUES (
      v_qid, v_num, 'DRAFT', 'SINGLE_CHOICE', 'AUTO_SINGLE',
      p->>'question_text', 1, false, false, false,
      v_fp, v_actor
    )
    RETURNING id INTO v_rev;

    FOR i IN 1..6 LOOP
      v_body := NULLIF(trim(COALESCE(p->>('option_' || i), '')), '');
      IF v_body IS NOT NULL THEN
        INSERT INTO public.question_options (question_revision_id, option_code, body, sort_order, is_correct)
        VALUES (v_rev, 'OPT_' || i, v_body, i, i = v_correct);
      END IF;
    END LOOP;

    IF NULLIF(trim(COALESCE(p->>'explanation','')), '') IS NOT NULL THEN
      INSERT INTO public.question_solutions (question_revision_id, solution_code, solution_type, sort_order, explanation, reveal_policy, created_by)
      VALUES (v_rev, 'SOL_1', 'MODEL', 0, p->>'explanation', 'AFTER_SUBMIT', v_actor);
    END IF;

    IF v_action IS NULL THEN
      v_action := CASE WHEN v_has_published THEN 'PUBLISHED_PRESERVED_NEW_REVISION' ELSE 'NEW_REVISION' END;
    END IF;
  END IF;

  -- Target decision is independent from content identity.
  IF v_target_type IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.question_targets t
      WHERE t.question_id = v_qid
        AND t.target_type = v_target_type
        AND COALESCE(t.lesson_id, t.unit_id, t.subject_id) = v_target_key
    ) INTO v_target_exists;

    IF NOT v_target_exists THEN
      INSERT INTO public.question_targets (question_id, target_type, subject_id, unit_id, lesson_id, is_primary, created_by)
      VALUES (
        v_qid,
        v_target_type,
        v_subject,
        CASE WHEN v_target_type IN ('UNIT','LESSON') THEN v_unit ELSE NULL END,
        CASE WHEN v_target_type = 'LESSON' THEN v_lesson ELSE NULL END,
        NOT EXISTS (SELECT 1 FROM public.question_targets t2 WHERE t2.question_id = v_qid AND t2.is_primary),
        v_actor
      );
      IF v_action IS NULL THEN
        v_action := 'TARGET_ADDED';
      END IF;
    END IF;
  END IF;

  IF v_action IS NULL THEN
    v_action := 'SKIP';
  END IF;

  RETURN jsonb_build_object(
    'action', v_action,
    'question_id', v_qid,
    'revision_id', v_rev,
    'content_fingerprint', v_fp
  );
END;
$$;

REVOKE ALL ON FUNCTION public.qb_import_ingest_revision(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qb_import_ingest_revision(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.qb_import_ingest_revision(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.qb_import_ingest_revision(uuid) TO service_role;

-- 5) Route template 09 through the question-bank path, inside one transaction.
CREATE OR REPLACE FUNCTION public.import_execute_questions_template(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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
  job := public.assert_import_job_operator(_job_id);

  IF job.execution_state <> 'planned' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: % -> applying', job.execution_state USING ERRCODE = '55000';
  END IF;

  UPDATE public.import_jobs
     SET execution_state = 'applying', updated_at = now()
   WHERE id = _job_id;

  FOR row_rec IN
    SELECT * FROM public.import_staging_rows
    WHERE job_id = _job_id AND template_key = 'questions'
    ORDER BY row_number
  LOOP
    -- No per-row exception handling: any failure aborts the whole template.
    res := public.qb_import_ingest_revision(row_rec.id);
    action := res->>'action';

    IF action = 'INSERT' THEN
      inserted := inserted + 1;
    ELSIF action = 'SKIP' THEN
      skipped := skipped + 1;
    ELSE
      updated := updated + 1;
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
    'template_key', 'questions',
    'inserted', inserted,
    'updated', updated,
    'skipped', skipped,
    'blocked_published', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_execute_questions_template(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_execute_questions_template(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.import_execute_questions_template(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.import_execute_questions_template(uuid) TO service_role;