-- =============================================================================
-- G1_PUBLISHED_REVISION_TARGET_BINDING_11
--
-- Closes gap G-1: assessment ↔ question binding must be proven by a target that
-- belongs to the EXACT published revision of the question, never by the legacy
-- questions.lesson_id / questions.subject_id columns and never by a mutable
-- "active" flag.
--
--   question_targets.revision_id
--        -> target belongs to exact revision
--        -> publish_question_revision
--        -> questions.current_published_revision_id
--        -> assessment binding accepts only targets whose
--           revision_id = current_published_revision_id
--
-- PENDING FILE. It is NOT applied to the shared Lovable database by this stage.
-- Rehearsed only on a disposable local PostgreSQL 17 cluster
-- (tests/import/run-pg17-g1-target-binding-11-rehearsal.mjs).
--
-- Properties:
--   * fail-closed backfill: any target that cannot be bound deterministically
--     aborts the whole migration with an inventory. No guessing, no deletes.
--   * composite FK (revision_id, question_id) -> question_revisions(id, question_id):
--     a target can never point at another question's revision.
--   * PUBLISHED and SUPERSEDED revisions have immutable targets (history).
--   * publish requires EXACTLY ONE primary target on the revision being published.
--   * re-appliable (idempotent).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Fail-closed inventory BEFORE any structural change.
--    A legacy target is bindable when the question has a published revision, or
--    when the question has exactly one revision at all. Anything else stops the
--    migration and reports the ambiguous questions.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_ambiguous int;
  v_sample text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'question_targets'
      AND column_name = 'revision_id'
  ) THEN
    RETURN; -- already migrated; backfill inventory not applicable
  END IF;

  SELECT count(*), string_agg(DISTINCT q.id::text, ', ')
  INTO v_ambiguous, v_sample
  FROM public.question_targets t
  JOIN public.questions q ON q.id = t.question_id
  WHERE q.current_published_revision_id IS NULL
    AND (SELECT count(*) FROM public.question_revisions r WHERE r.question_id = q.id) <> 1;

  IF COALESCE(v_ambiguous, 0) > 0 THEN
    RAISE EXCEPTION
      'G1_BACKFILL_AMBIGUOUS_TARGETS: % target row(s) cannot be bound to a single revision. Questions: %',
      v_ambiguous, left(COALESCE(v_sample, ''), 2000)
      USING ERRCODE = '55000';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) Composite identity key on revisions, so the child FK can prove ownership.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE public.question_revisions
    ADD CONSTRAINT question_revisions_id_question_uniq UNIQUE (id, question_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2) revision_id column + deterministic backfill + NOT NULL + composite FK.
-- ---------------------------------------------------------------------------
ALTER TABLE public.question_targets
  ADD COLUMN IF NOT EXISTS revision_id uuid;

UPDATE public.question_targets t
   SET revision_id = COALESCE(
         (SELECT q.current_published_revision_id FROM public.questions q WHERE q.id = t.question_id),
         (SELECT r.id FROM public.question_revisions r WHERE r.question_id = t.question_id)
       )
 WHERE t.revision_id IS NULL;

-- Second fail-closed gate: nothing may survive unbound.
DO $$
DECLARE v_left int;
BEGIN
  SELECT count(*) INTO v_left FROM public.question_targets WHERE revision_id IS NULL;
  IF v_left > 0 THEN
    RAISE EXCEPTION 'G1_BACKFILL_UNBOUND_TARGETS: % target row(s) still have no revision', v_left
      USING ERRCODE = '55000';
  END IF;
END $$;

ALTER TABLE public.question_targets
  ALTER COLUMN revision_id SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.question_targets
    ADD CONSTRAINT question_targets_revision_question_fk
    FOREIGN KEY (revision_id, question_id)
    REFERENCES public.question_revisions (id, question_id)
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Drop the QB-01 anonymous shape CHECK: it forced every LESSON target to carry a
-- unit_id, which is wrong for curricula where a lesson hangs directly off the
-- subject (lessons.unit_id IS NULL). Replaced by question_targets_shape_chk below.
DO $$
DECLARE v_name text;
BEGIN
  SELECT conname INTO v_name
  FROM pg_constraint
  WHERE conrelid = 'public.question_targets'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%unit_id IS NOT NULL%AND lesson_id IS NOT NULL%';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.question_targets DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

-- Shape check: target_type must match the populated hierarchy columns.
-- LESSON targets accept a NULL unit_id (lesson attached directly to a subject).
DO $$ BEGIN
  ALTER TABLE public.question_targets
    ADD CONSTRAINT question_targets_shape_chk CHECK (
      (target_type = 'SUBJECT' AND subject_id IS NOT NULL AND unit_id IS NULL AND lesson_id IS NULL)
      OR (target_type = 'UNIT' AND subject_id IS NOT NULL AND unit_id IS NOT NULL AND lesson_id IS NULL)
      OR (target_type = 'LESSON' AND subject_id IS NOT NULL AND lesson_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 3) Uniqueness moves from question scope to revision scope.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.question_targets_dedupe_uidx;
DROP INDEX IF EXISTS public.question_targets_one_primary_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS question_targets_revision_dedupe_uidx
  ON public.question_targets (
    revision_id,
    target_type,
    COALESCE(lesson_id, unit_id, subject_id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS question_targets_one_primary_per_revision_uidx
  ON public.question_targets (revision_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS question_targets_revision_idx
  ON public.question_targets (revision_id);

-- ---------------------------------------------------------------------------
-- 4) Historical immutability: PUBLISHED and SUPERSEDED targets are frozen.
--    Cascade deletes (parent revision/question removed) are allowed, because the
--    parent row is already gone when the cascade fires.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qb_guard_targets_revision_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_rev uuid := COALESCE(NEW.revision_id, OLD.revision_id);
BEGIN
  SELECT r.status INTO v_status
  FROM public.question_revisions r
  WHERE r.id = v_rev;

  IF NOT FOUND THEN
    -- Parent revision is gone: this is a cascade cleanup, not an edit.
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'QB_TARGET_REVISION_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  IF v_status IN ('PUBLISHED', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'QB_TARGET_IMMUTABLE_REVISION: % targets cannot be % (revision %)',
      v_status, lower(TG_OP), v_rev
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.revision_id IS DISTINCT FROM OLD.revision_id THEN
    RAISE EXCEPTION 'QB_TARGET_REVISION_REBIND_FORBIDDEN' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.qb_guard_targets_revision_immutable() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_qb_targets_revision_immutable ON public.question_targets;
CREATE TRIGGER trg_qb_targets_revision_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.question_targets
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_targets_revision_immutable();

-- ---------------------------------------------------------------------------
-- 5) Publish gate: exactly one primary target on the revision being published.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._qb_assert_revision_targets_publishable(p_revision_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total int;
  v_primary int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE is_primary)
  INTO v_total, v_primary
  FROM public.question_targets
  WHERE revision_id = p_revision_id;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'QB_PUBLISH_TARGET_REQUIRED: revision % has no targets', p_revision_id
      USING ERRCODE = '55000';
  END IF;

  IF v_primary <> 1 THEN
    RAISE EXCEPTION 'QB_PUBLISH_PRIMARY_TARGET_REQUIRED: revision % has % primary targets (exactly 1 required)',
      p_revision_id, v_primary
      USING ERRCODE = '55000';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._qb_assert_revision_targets_publishable(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._qb_assert_revision_targets_publishable(uuid)
  FROM anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) publish_question_revision: same contract + revision-target gate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_question_revision(
  p_question_id uuid,
  p_revision_id uuid,
  p_expected_current_revision_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_question public.questions%ROWTYPE;
  v_revision public.question_revisions%ROWTYPE;
  v_prior_id uuid;
  v_result jsonb;
  v_fingerprint text;
  v_existing public.question_bank_rpc_idempotency%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;

  IF NOT public.can_publish_question_revision(v_actor) THEN
    RAISE EXCEPTION 'not authorized to publish question revisions';
  END IF;

  v_fingerprint := encode(
    sha256(
      convert_to(
        concat_ws(
          '|',
          'publish_question_revision',
          v_actor::text,
          coalesce(p_question_id::text, ''),
          coalesce(p_revision_id::text, ''),
          coalesce(p_expected_current_revision_id::text, '')
        ),
        'utf8'
      )
    ),
    'hex'
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended('qb:publish:' || v_actor::text || ':' || p_idempotency_key, 0)
  );

  SELECT * INTO v_existing
  FROM public.question_bank_rpc_idempotency
  WHERE rpc_name = 'publish_question_revision'
    AND actor_id = v_actor
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'idempotency key reused with different input';
    END IF;
    RETURN v_existing.result;
  END IF;

  SELECT * INTO v_question
  FROM public.questions
  WHERE id = p_question_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question not found';
  END IF;

  IF v_question.current_published_revision_id IS DISTINCT FROM p_expected_current_revision_id THEN
    RAISE EXCEPTION 'optimistic concurrency failure: published pointer changed';
  END IF;

  SELECT * INTO v_revision
  FROM public.question_revisions
  WHERE id = p_revision_id
    AND question_id = p_question_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision not found for question';
  END IF;

  IF v_revision.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'only APPROVED revisions may be published';
  END IF;

  PERFORM public._qb_assert_revision_payload_hash(
    p_revision_id, v_revision.payload_hash, v_revision.payload_hash_version
  );

  PERFORM public._qb_validate_revision_for_publish(p_revision_id);

  -- G-1: the revision being published must carry exactly one primary target.
  PERFORM public._qb_assert_revision_targets_publishable(p_revision_id);

  SELECT qr.id INTO v_prior_id
  FROM public.question_revisions qr
  WHERE qr.question_id = p_question_id
    AND qr.status = 'PUBLISHED'
    AND qr.id <> p_revision_id
  FOR UPDATE;

  IF v_prior_id IS NOT NULL THEN
    UPDATE public.question_revisions
    SET status = 'SUPERSEDED',
        superseded_at = now()
    WHERE id = v_prior_id;

    PERFORM public.write_audit_log(
      'REVISION_SUPERSEDED',
      'question_revision',
      v_prior_id,
      jsonb_build_object(
        'question_id', p_question_id,
        'superseded_by', p_revision_id,
        'idempotency_key', p_idempotency_key
      )
    );
  END IF;

  UPDATE public.question_revisions
  SET status = 'PUBLISHED',
      published_at = now(),
      published_by = v_actor
  WHERE id = p_revision_id;

  UPDATE public.questions
  SET current_published_revision_id = p_revision_id
  WHERE id = p_question_id;

  PERFORM public.write_audit_log(
    'REVISION_PUBLISHED',
    'question',
    p_question_id,
    jsonb_build_object(
      'revision_id', p_revision_id,
      'published_by', v_actor,
      'idempotency_key', p_idempotency_key
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'question_id', p_question_id,
    'revision_id', p_revision_id,
    'previous_revision_id', p_expected_current_revision_id,
    'request_fingerprint', v_fingerprint
  );

  INSERT INTO public.question_bank_rpc_idempotency (
    rpc_name, actor_id, idempotency_key, request_fingerprint, result
  ) VALUES (
    'publish_question_revision', v_actor, p_idempotency_key, v_fingerprint, v_result
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_question_revision(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_question_revision(uuid, uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) retarget_question now operates on ONE editable revision.
--    Audit: no application code calls the legacy 3-argument signature
--    (verified across src/, tests/ and scripts/ for stage 11).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.retarget_question(uuid, jsonb, text);

CREATE OR REPLACE FUNCTION public.retarget_question(
  p_question_id uuid,
  p_revision_id uuid,
  p_targets jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_question public.questions%ROWTYPE;
  v_revision public.question_revisions%ROWTYPE;
  v_old jsonb;
  v_new jsonb;
  v_elem jsonb;
  v_target_type text;
  v_subject_id uuid;
  v_unit_id uuid;
  v_lesson_id uuid;
  v_is_primary boolean;
  v_primary_count int := 0;
  v_idx int;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.can_edit_question_bank(v_actor) THEN
    RAISE EXCEPTION 'not authorized to edit question bank';
  END IF;

  IF p_targets IS NULL OR jsonb_typeof(p_targets) <> 'array' OR jsonb_array_length(p_targets) = 0 THEN
    RAISE EXCEPTION 'p_targets must be a non-empty JSON array';
  END IF;

  SELECT * INTO v_question
  FROM public.questions
  WHERE id = p_question_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'question not found';
  END IF;

  SELECT * INTO v_revision
  FROM public.question_revisions
  WHERE id = p_revision_id
    AND question_id = p_question_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision not found for question';
  END IF;

  IF v_revision.status IN ('PUBLISHED', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'targets of a % revision are immutable; create a new draft revision', v_revision.status
      USING ERRCODE = '55000';
  END IF;

  IF v_question.current_published_revision_id IS NOT NULL
     AND (p_reason IS NULL OR char_length(trim(p_reason)) = 0) THEN
    RAISE EXCEPTION 'reason is required when retargeting a published question';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb)
  INTO v_old
  FROM public.question_targets t
  WHERE t.revision_id = p_revision_id;

  FOR v_idx IN 0 .. jsonb_array_length(p_targets) - 1 LOOP
    v_elem := p_targets -> v_idx;
    v_target_type := upper(trim(v_elem ->> 'target_type'));
    v_subject_id := NULLIF(v_elem ->> 'subject_id', '')::uuid;
    v_unit_id := NULLIF(v_elem ->> 'unit_id', '')::uuid;
    v_lesson_id := NULLIF(v_elem ->> 'lesson_id', '')::uuid;
    v_is_primary := COALESCE((v_elem ->> 'is_primary')::boolean, false);

    IF v_target_type NOT IN ('SUBJECT', 'UNIT', 'LESSON') THEN
      RAISE EXCEPTION 'invalid target_type at index %', v_idx;
    END IF;

    IF v_target_type = 'SUBJECT' THEN
      IF v_subject_id IS NULL OR v_unit_id IS NOT NULL OR v_lesson_id IS NOT NULL THEN
        RAISE EXCEPTION 'SUBJECT target shape invalid at index %', v_idx;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.subjects s WHERE s.id = v_subject_id) THEN
        RAISE EXCEPTION 'subject not found at index %', v_idx;
      END IF;
    ELSIF v_target_type = 'UNIT' THEN
      IF v_subject_id IS NULL OR v_unit_id IS NULL OR v_lesson_id IS NOT NULL THEN
        RAISE EXCEPTION 'UNIT target shape invalid at index %', v_idx;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.units u
        WHERE u.id = v_unit_id AND u.subject_id = v_subject_id
      ) THEN
        RAISE EXCEPTION 'unit/subject hierarchy mismatch at index %', v_idx;
      END IF;
    ELSE
      -- LESSON: unit_id is OPTIONAL — lessons may hang directly off a subject.
      IF v_subject_id IS NULL OR v_lesson_id IS NULL THEN
        RAISE EXCEPTION 'LESSON target shape invalid at index %', v_idx;
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.lessons l
        WHERE l.id = v_lesson_id
          AND l.subject_id = v_subject_id
          AND (v_unit_id IS NULL OR l.unit_id = v_unit_id)
      ) THEN
        RAISE EXCEPTION 'lesson/unit/subject hierarchy mismatch at index %', v_idx;
      END IF;
    END IF;

    IF v_is_primary THEN
      v_primary_count := v_primary_count + 1;
    END IF;
  END LOOP;

  IF v_primary_count <> 1 THEN
    RAISE EXCEPTION 'exactly one primary target is required';
  END IF;

  DELETE FROM public.question_targets WHERE revision_id = p_revision_id;

  FOR v_idx IN 0 .. jsonb_array_length(p_targets) - 1 LOOP
    v_elem := p_targets -> v_idx;
    INSERT INTO public.question_targets (
      question_id,
      revision_id,
      target_type,
      subject_id,
      unit_id,
      lesson_id,
      is_primary,
      created_by
    ) VALUES (
      p_question_id,
      p_revision_id,
      upper(trim(v_elem ->> 'target_type')),
      NULLIF(v_elem ->> 'subject_id', '')::uuid,
      NULLIF(v_elem ->> 'unit_id', '')::uuid,
      NULLIF(v_elem ->> 'lesson_id', '')::uuid,
      COALESCE((v_elem ->> 'is_primary')::boolean, false),
      v_actor
    );
  END LOOP;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb)
  INTO v_new
  FROM public.question_targets t
  WHERE t.revision_id = p_revision_id;

  PERFORM public.write_audit_log(
    'QUESTION_RETARGETED',
    'question',
    p_question_id,
    jsonb_build_object(
      'revision_id', p_revision_id,
      'reason', p_reason,
      'old_targets', v_old,
      'new_targets', v_new
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'question_id', p_question_id,
    'revision_id', p_revision_id,
    'targets', v_new
  );
END;
$$;

REVOKE ALL ON FUNCTION public.retarget_question(uuid, uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retarget_question(uuid, uuid, jsonb, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) Assessment binding: published revision + matching revision target ONLY.
--    Legacy questions.lesson_id / questions.subject_id are never consulted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_assessment_question_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lesson_id uuid;
  v_lesson_unit_id uuid;
  v_lesson_subject_id uuid;
  v_published_revision uuid;
  v_question_exists boolean;
BEGIN
  SELECT la.lesson_id, l.unit_id, l.subject_id
  INTO v_lesson_id, v_lesson_unit_id, v_lesson_subject_id
  FROM public.lesson_assessments la
  JOIN public.lessons l ON l.id = la.lesson_id
  WHERE la.id = NEW.assessment_id;

  IF v_lesson_id IS NULL THEN
    RAISE EXCEPTION 'ASSESSMENT_NOT_FOUND' USING ERRCODE = '23514';
  END IF;

  SELECT true, q.current_published_revision_id
  INTO v_question_exists, v_published_revision
  FROM public.questions q
  WHERE q.id = NEW.question_id;

  IF NOT COALESCE(v_question_exists, false) THEN
    RAISE EXCEPTION 'QUESTION_NOT_FOUND' USING ERRCODE = '23514';
  END IF;

  IF v_published_revision IS NULL THEN
    RAISE EXCEPTION 'QUESTION_PUBLISH_REQUIRED: question % has no published revision', NEW.question_id
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.question_targets t
    WHERE t.question_id = NEW.question_id
      AND t.revision_id = v_published_revision
      AND (
        (t.target_type = 'LESSON' AND t.lesson_id = v_lesson_id)
        OR (t.target_type = 'UNIT' AND v_lesson_unit_id IS NOT NULL AND t.unit_id = v_lesson_unit_id)
        OR (t.target_type = 'SUBJECT' AND t.subject_id = v_lesson_subject_id)
      )
  ) THEN
    RAISE EXCEPTION
      'QUESTION_TARGET_MISMATCH: published revision % has no target matching the assessment lesson %',
      v_published_revision, v_lesson_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_assessment_question_link() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_validate_assessment_question_link ON public.assessment_questions;
CREATE TRIGGER trg_validate_assessment_question_link
  BEFORE INSERT OR UPDATE OF assessment_id, question_id ON public.assessment_questions
  FOR EACH ROW EXECUTE FUNCTION public.validate_assessment_question_link();

-- ---------------------------------------------------------------------------
-- 9) Import ingest (template 09): targets are attached to the revision.
--    Identity shell unchanged: no legacy answer/binding columns are populated.
-- ---------------------------------------------------------------------------
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
  v_target_rev uuid;
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

  PERFORM pg_advisory_xact_lock(hashtextextended('qb_question_code:' || v_code, 0));

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

  -- A lesson may hang directly off a subject (no unit); it is still a LESSON target.
  IF v_lesson IS NOT NULL THEN
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

  -- Target decision is independent from content identity, but ALWAYS bound to a
  -- single editable revision. Published/superseded revisions are historical.
  IF v_target_type IS NOT NULL THEN
    v_target_rev := v_rev;

    IF v_target_rev IS NULL THEN
      SELECT r.id INTO v_target_rev
      FROM public.question_revisions r
      WHERE r.question_id = v_qid
        AND r.status IN ('DRAFT','READY_FOR_REVIEW','APPROVED','REJECTED')
      ORDER BY r.revision_number DESC
      LIMIT 1;
    END IF;

    IF v_target_rev IS NULL THEN
      -- Only historical revisions exist: their targets must not change.
      IF v_action IS NULL THEN
        v_action := 'TARGET_SKIPPED_PUBLISHED_IMMUTABLE';
      END IF;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.question_targets t
        WHERE t.revision_id = v_target_rev
          AND t.target_type = v_target_type
          AND COALESCE(t.lesson_id, t.unit_id, t.subject_id) = v_target_key
      ) INTO v_target_exists;

      IF NOT v_target_exists THEN
        INSERT INTO public.question_targets (question_id, revision_id, target_type, subject_id, unit_id, lesson_id, is_primary, created_by)
        VALUES (
          v_qid,
          v_target_rev,
          v_target_type,
          v_subject,
          CASE WHEN v_target_type IN ('UNIT','LESSON') THEN v_unit ELSE NULL END,
          CASE WHEN v_target_type = 'LESSON' THEN v_lesson ELSE NULL END,
          NOT EXISTS (SELECT 1 FROM public.question_targets t2 WHERE t2.revision_id = v_target_rev AND t2.is_primary),
          v_actor
        );
        IF v_action IS NULL THEN
          v_action := 'TARGET_ADDED';
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_action IS NULL THEN
    v_action := 'SKIP';
  END IF;

  RETURN jsonb_build_object(
    'action', v_action,
    'question_id', v_qid,
    'revision_id', COALESCE(v_rev, v_target_rev),
    'content_fingerprint', v_fp
  );
END;
$$;

REVOKE ALL ON FUNCTION public.qb_import_ingest_revision(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.qb_import_ingest_revision(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.qb_import_ingest_revision(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.qb_import_ingest_revision(uuid) TO service_role;

COMMIT;
