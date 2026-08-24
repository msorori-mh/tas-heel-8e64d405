-- Pre-launch curriculum purge (temporary, centrally lockable, fail-closed).
-- Scope: all units, lessons, lesson content, question bank rows, linked student
-- activity, and golden-lesson publication rows. Subjects, grades, tracks, users,
-- textbooks, import history, and audit history are deliberately preserved.

CREATE TABLE IF NOT EXISTS public.curriculum_prelaunch_purge_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT true,
  locked_at timestamptz,
  locked_by uuid REFERENCES auth.users(id),
  lock_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (enabled AND locked_at IS NOT NULL))
);

INSERT INTO public.curriculum_prelaunch_purge_control(singleton, enabled)
VALUES (true, true)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.curriculum_prelaunch_purge_tickets (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (backend_pid, transaction_id)
);

CREATE TABLE IF NOT EXISTS public.curriculum_prelaunch_purge_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  idempotency_key text NOT NULL,
  preview_sha256 text NOT NULL,
  reason text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, idempotency_key)
);

ALTER TABLE public.curriculum_prelaunch_purge_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_prelaunch_purge_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_prelaunch_purge_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.curriculum_prelaunch_purge_control FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.curriculum_prelaunch_purge_tickets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.curriculum_prelaunch_purge_runs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.curriculum_prelaunch_purge_ticket_active()
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.curriculum_prelaunch_purge_tickets t
    WHERE t.backend_pid = pg_backend_pid()
      AND t.transaction_id = txid_current()
      AND t.actor_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.curriculum_prelaunch_purge_ticket_active() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.curriculum_prelaunch_purge_snapshot()
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'units', (SELECT count(*) FROM public.units),
    'lessons', (SELECT count(*) FROM public.lessons),
    'lesson_book_contents', (SELECT count(*) FROM public.lesson_book_contents),
    'lesson_explanations', (SELECT count(*) FROM public.lesson_explanations),
    'lesson_summaries', (SELECT count(*) FROM public.lesson_summaries),
    'lesson_resources', (SELECT count(*) FROM public.lesson_resources),
    'lesson_simulations', (SELECT count(*) FROM public.lesson_simulations),
    'lesson_assessments', (SELECT count(*) FROM public.lesson_assessments),
    'lesson_capability_lifecycle', (SELECT count(*) FROM public.lesson_capability_lifecycle),
    'questions', (SELECT count(*) FROM public.questions),
    'question_revisions', (SELECT count(*) FROM public.question_revisions),
    'question_options', (SELECT count(*) FROM public.question_options),
    'question_option_rationales', (SELECT count(*) FROM public.question_option_rationales),
    'official_question_answers', (SELECT count(*) FROM public.official_question_answers),
    'question_targets', (SELECT count(*) FROM public.question_targets),
    'question_media', (SELECT count(*) FROM public.question_media),
    'question_solutions', (SELECT count(*) FROM public.question_solutions),
    'student_progress', (SELECT count(*) FROM public.user_progress),
    'exam_sessions', (SELECT count(*) FROM public.exam_sessions),
    'practice_attempts', (SELECT count(*) FROM public.practice_attempts),
    'unit_practice_attempts', (SELECT count(*) FROM public.unit_practice_attempts),
    'golden_packages', (SELECT count(*) FROM public.golden_lesson_packages),
    'golden_package_versions', (SELECT count(*) FROM public.golden_lesson_package_versions),
    'golden_stage_batches', (SELECT count(*) FROM public.golden_lesson_domain_stage_batches),
    'golden_publications', (SELECT count(*) FROM public.golden_lesson_publications),
    'golden_published_assets', (SELECT count(*) FROM public.golden_lesson_published_assets)
  );
$$;

REVOKE ALL ON FUNCTION public.curriculum_prelaunch_purge_snapshot() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_curriculum_prelaunch_purge_status()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_control public.curriculum_prelaunch_purge_control%ROWTYPE;
  v_counts jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_full_admin(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN_FULL_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_control
  FROM public.curriculum_prelaunch_purge_control
  WHERE singleton = true;

  v_counts := public.curriculum_prelaunch_purge_snapshot();

  RETURN jsonb_build_object(
    'enabled', v_control.enabled,
    'locked_at', v_control.locked_at,
    'counts', v_counts,
    'preview_sha256', encode(digest(v_counts::text, 'sha256'), 'hex'),
    'confirmation_phrase', 'حذف جميع الوحدات والدروس التجريبية',
    'preserved', jsonb_build_array(
      'subjects', 'grades', 'tracks', 'textbooks', 'users',
      'import_jobs', 'import_staging_rows', 'audit_logs'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_curriculum_prelaunch_purge_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_curriculum_prelaunch_purge_status() TO authenticated;

-- Immutable ledgers remain immutable outside the transaction-local purge ticket.
CREATE OR REPLACE FUNCTION public.reject_golden_publication_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.curriculum_prelaunch_purge_ticket_active() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'CF11_LEDGER_IMMUTABLE' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_golden_domain_stage_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.curriculum_prelaunch_purge_ticket_active() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'GOLDEN_DOMAIN_STAGE_IMMUTABLE' USING ERRCODE = '23514';
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_v3_answer_layer_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.curriculum_prelaunch_purge_ticket_active() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'V3_ANSWER_LAYER_IMMUTABLE';
END;
$$;

CREATE OR REPLACE FUNCTION public.qb_guard_reviews_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.curriculum_prelaunch_purge_ticket_active() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    RAISE EXCEPTION 'question_response_reviews are append-only';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.qb_guard_solution_steps_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_status text;
  v_new_status text;
BEGIN
  IF public.curriculum_prelaunch_purge_ticket_active() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.solution_id IS DISTINCT FROM OLD.solution_id THEN
    RAISE EXCEPTION 'cannot reparent solution steps; solution_id is immutable after insert';
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT qr.status INTO v_old_status
    FROM public.question_solutions qs
    JOIN public.question_revisions qr ON qr.id = qs.question_revision_id
    WHERE qs.id = OLD.solution_id;
    IF v_old_status IN ('APPROVED', 'PUBLISHED', 'SUPERSEDED') THEN
      RAISE EXCEPTION 'cannot % solution steps of % revision (payload frozen)', TG_OP, v_old_status;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT qr.status INTO v_new_status
    FROM public.question_solutions qs
    JOIN public.question_revisions qr ON qr.id = qs.question_revision_id
    WHERE qs.id = NEW.solution_id;
    IF v_new_status IN ('APPROVED', 'PUBLISHED', 'SUPERSEDED') THEN
      RAISE EXCEPTION 'cannot % solution steps of % revision (payload frozen)', TG_OP, v_new_status;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

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
  IF public.curriculum_prelaunch_purge_ticket_active() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  SELECT r.status INTO v_status FROM public.question_revisions r WHERE r.id = v_rev;
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'QB_TARGET_REVISION_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF v_status IN ('PUBLISHED', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'QB_TARGET_IMMUTABLE_REVISION: % targets cannot be % (revision %)',
      v_status, lower(TG_OP), v_rev USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.revision_id IS DISTINCT FROM OLD.revision_id THEN
    RAISE EXCEPTION 'QB_TARGET_REVISION_REBIND_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.qb_guard_revision_children_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_status text;
  v_new_status text;
BEGIN
  IF public.curriculum_prelaunch_purge_ticket_active() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.question_revision_id IS DISTINCT FROM OLD.question_revision_id THEN
    RAISE EXCEPTION 'cannot reparent child rows; question_revision_id is immutable after insert';
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT status INTO v_old_status FROM public.question_revisions WHERE id = OLD.question_revision_id;
    IF v_old_status IN ('APPROVED', 'PUBLISHED', 'SUPERSEDED') THEN
      RAISE EXCEPTION 'cannot % child rows of % revision (payload frozen)', TG_OP, v_old_status;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT status INTO v_new_status FROM public.question_revisions WHERE id = NEW.question_revision_id;
    IF v_new_status IN ('APPROVED', 'PUBLISHED', 'SUPERSEDED') THEN
      RAISE EXCEPTION 'cannot % child rows of % revision (payload frozen)', TG_OP, v_new_status;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.qb_guard_question_revision_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pointed boolean;
  v_payload_changed boolean;
BEGIN
  IF public.curriculum_prelaunch_purge_ticket_active() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('PUBLISHED', 'SUPERSEDED', 'APPROVED') THEN
      RAISE EXCEPTION 'cannot insert revision directly as APPROVED, PUBLISHED, or SUPERSEDED';
    END IF;
    IF NEW.status NOT IN ('DRAFT', 'READY_FOR_REVIEW', 'REJECTED') THEN
      RAISE EXCEPTION 'invalid initial revision status';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('APPROVED', 'PUBLISHED', 'SUPERSEDED') THEN
      RAISE EXCEPTION 'cannot delete APPROVED, PUBLISHED, or SUPERSEDED revision';
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.questions q WHERE q.current_published_revision_id = OLD.id)
      INTO v_pointed;
    IF v_pointed THEN
      RAISE EXCEPTION 'cannot delete revision currently pointed by questions.current_published_revision_id';
    END IF;
    RETURN OLD;
  END IF;
  v_payload_changed :=
       NEW.interaction_type IS DISTINCT FROM OLD.interaction_type
    OR NEW.grading_mode IS DISTINCT FROM OLD.grading_mode
    OR NEW.educational_label IS DISTINCT FROM OLD.educational_label
    OR NEW.question_text IS DISTINCT FROM OLD.question_text
    OR NEW.stimulus_text IS DISTINCT FROM OLD.stimulus_text
    OR NEW.max_score IS DISTINCT FROM OLD.max_score
    OR NEW.allow_partial IS DISTINCT FROM OLD.allow_partial
    OR NEW.requires_media IS DISTINCT FROM OLD.requires_media
    OR NEW.manual_grading_required IS DISTINCT FROM OLD.manual_grading_required
    OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
    OR NEW.payload_hash_version IS DISTINCT FROM OLD.payload_hash_version
    OR NEW.source_payload_hash IS DISTINCT FROM OLD.source_payload_hash
    OR NEW.backfill_version IS DISTINCT FROM OLD.backfill_version
    OR NEW.question_id IS DISTINCT FROM OLD.question_id
    OR NEW.revision_number IS DISTINCT FROM OLD.revision_number;
  IF OLD.status IN ('APPROVED', 'PUBLISHED', 'SUPERSEDED') AND v_payload_changed THEN
    RAISE EXCEPTION 'payload fields of % revisions are immutable', OLD.status;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'APPROVED' AND NEW.status = 'PUBLISHED' THEN
      IF NEW.published_at IS NULL OR NEW.published_by IS NULL THEN
        RAISE EXCEPTION 'PUBLISHED requires published_at and published_by';
      END IF;
      PERFORM public._qb_assert_revision_payload_hash(NEW.id, NEW.payload_hash, NEW.payload_hash_version);
    ELSIF OLD.status = 'PUBLISHED' AND NEW.status = 'SUPERSEDED' THEN
      IF NEW.superseded_at IS NULL THEN RAISE EXCEPTION 'SUPERSEDED requires superseded_at'; END IF;
    ELSIF OLD.status IN ('DRAFT', 'READY_FOR_REVIEW', 'REJECTED')
          AND NEW.status IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED') THEN
      IF NEW.status = 'APPROVED' THEN
        PERFORM public._qb_assert_revision_payload_hash(NEW.id, NEW.payload_hash, NEW.payload_hash_version);
      END IF;
    ELSE
      RAISE EXCEPTION 'illegal revision status transition: % → %', OLD.status, NEW.status;
    END IF;
  END IF;
  IF OLD.status IN ('PUBLISHED', 'SUPERSEDED')
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND (NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.published_by IS DISTINCT FROM OLD.published_by
       OR NEW.superseded_at IS DISTINCT FROM OLD.superseded_at) THEN
    RAISE EXCEPTION 'publish metadata of % revisions is immutable', OLD.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cf11_assert_demotion_allowed(
  _lesson_id uuid, _capability text, _from_status text, _to_status text,
  _applicability text, _origin text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.curriculum_prelaunch_purge_ticket_active() THEN RETURN; END IF;
  IF _from_status IS DISTINCT FROM 'READY' THEN RETURN; END IF;
  IF _to_status IS NOT DISTINCT FROM 'READY' THEN RETURN; END IF;
  IF NOT (_capability = ANY (public.cf11_lifecycle_capabilities())) THEN RETURN; END IF;
  IF NOT public.cf11_is_managed_lesson(_lesson_id) THEN RETURN; END IF;
  IF public.cf11_has_revocation_ticket(_lesson_id) THEN RETURN; END IF;
  RAISE EXCEPTION
    'CF11_DIRECT_TRANSITION_FORBIDDEN: % READY -> % for CF11 lesson % must go through golden_lesson_revoke_cf11_ready (origin=%)',
    _capability, coalesce(_to_status, 'DELETED'), _lesson_id, _origin
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_curriculum_prelaunch_purge(
  _confirmation text,
  _reason text,
  _expected_preview_sha256 text,
  _idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_control public.curriculum_prelaunch_purge_control%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_hash text;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_full_admin(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN_FULL_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _confirmation IS DISTINCT FROM 'حذف جميع الوحدات والدروس التجريبية' THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_CONFIRMATION_MISMATCH' USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(_reason, ''))) < 12 THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(_idempotency_key, ''))) < 16 THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('tamkeen:curriculum-prelaunch-purge', 0));

  SELECT * INTO v_control
  FROM public.curriculum_prelaunch_purge_control
  WHERE singleton = true
  FOR UPDATE;

  IF NOT v_control.enabled OR v_control.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_LOCKED' USING ERRCODE = '42501';
  END IF;

  SELECT result INTO v_result
  FROM public.curriculum_prelaunch_purge_runs
  WHERE actor_id = auth.uid() AND idempotency_key = trim(_idempotency_key);
  IF FOUND THEN RETURN v_result || jsonb_build_object('replayed', true); END IF;

  LOCK TABLE public.units, public.lessons, public.questions,
    public.question_revisions IN SHARE ROW EXCLUSIVE MODE;

  v_before := public.curriculum_prelaunch_purge_snapshot();
  v_hash := encode(digest(v_before::text, 'sha256'), 'hex');
  IF v_hash IS DISTINCT FROM lower(trim(coalesce(_expected_preview_sha256, ''))) THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_STALE_PREVIEW' USING ERRCODE = '40001';
  END IF;
  IF coalesce((v_before->>'units')::bigint, 0) = 0
     AND coalesce((v_before->>'lessons')::bigint, 0) = 0 THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_NOTHING_TO_DELETE' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.curriculum_prelaunch_purge_tickets(
    backend_pid, transaction_id, actor_id
  ) VALUES (pg_backend_pid(), txid_current(), auth.uid());

  -- Student attempts and immutable response snapshots are experimental in this phase.
  DELETE FROM public.question_response_reviews;
  DELETE FROM public.exam_session_answers;
  DELETE FROM public.exam_session_questions;
  DELETE FROM public.exam_sessions;
  DELETE FROM public.practice_attempt_responses;
  DELETE FROM public.practice_attempt_questions;
  DELETE FROM public.practice_attempts;
  DELETE FROM public.unit_practice_attempts;
  DELETE FROM public.user_progress;

  -- Remove references from reusable exam containers, but preserve the containers.
  DELETE FROM public.exam_template_questions;
  DELETE FROM public.ministerial_exam_questions;
  DELETE FROM public.lesson_question_notes;
  DELETE FROM public.assessment_questions;

  DELETE FROM public.question_solution_steps;
  DELETE FROM public.question_solutions;
  DELETE FROM public.question_accepted_answers;
  DELETE FROM public.official_question_answers;
  DELETE FROM public.question_option_rationales;
  DELETE FROM public.question_media;
  DELETE FROM public.question_options;
  DELETE FROM public.question_targets;
  UPDATE public.questions SET current_published_revision_id = NULL
    WHERE current_published_revision_id IS NOT NULL;
  DELETE FROM public.question_revisions;
  DELETE FROM public.questions;

  DELETE FROM public.lesson_assessments;
  DELETE FROM public.lesson_capability_lifecycle;
  DELETE FROM public.lesson_comments;
  DELETE FROM public.lesson_resources;
  DELETE FROM public.lesson_explanations;
  DELETE FROM public.lesson_book_contents;
  DELETE FROM public.lesson_summaries;
  DELETE FROM public.lesson_simulations;

  -- Golden package DB ledgers are removed in FK-safe order. Verified storage
  -- objects are intentionally retained for a later, separately-audited cleanup.
  DELETE FROM public.golden_lesson_ready_revocations;
  DELETE FROM public.golden_lesson_ready_attestations;
  DELETE FROM public.golden_lesson_published_assets;
  DELETE FROM public.golden_lesson_publications;
  DELETE FROM public.golden_lesson_asset_attestations;
  DELETE FROM public.golden_lesson_domain_materializations;
  DELETE FROM public.golden_lesson_identity_rebindings;
  DELETE FROM public.golden_lesson_identity_bindings;
  DELETE FROM public.golden_lesson_domain_stage_answers;
  DELETE FROM public.golden_lesson_domain_stage_entries;
  DELETE FROM public.golden_lesson_domain_stage_batches;
  DELETE FROM public.golden_lesson_package_reviews;
  DELETE FROM public.golden_lesson_package_versions;
  DELETE FROM public.golden_lesson_packages;

  DELETE FROM public.lessons;
  DELETE FROM public.units;

  DELETE FROM public.curriculum_prelaunch_purge_tickets
  WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current();

  v_after := public.curriculum_prelaunch_purge_snapshot();
  IF coalesce((v_after->>'units')::bigint, -1) <> 0
     OR coalesce((v_after->>'lessons')::bigint, -1) <> 0
     OR coalesce((v_after->>'questions')::bigint, -1) <> 0
     OR coalesce((v_after->>'golden_publications')::bigint, -1) <> 0 THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_POSTVERIFY_FAILED' USING ERRCODE = 'P0001';
  END IF;

  v_result := jsonb_build_object(
    'deleted', true,
    'replayed', false,
    'before', v_before,
    'after', v_after,
    'preview_sha256', v_hash,
    'storage_objects_preserved', true
  );

  INSERT INTO public.curriculum_prelaunch_purge_runs(
    actor_id, idempotency_key, preview_sha256, reason, result
  ) VALUES (auth.uid(), trim(_idempotency_key), v_hash, trim(_reason), v_result);

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(), 'curriculum_prelaunch_global_purge', 'curriculum', NULL,
    jsonb_build_object(
      'reason', trim(_reason),
      'idempotency_key', trim(_idempotency_key),
      'preview_sha256', v_hash,
      'before', v_before,
      'after', v_after,
      'storage_objects_preserved', true
    )
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_curriculum_prelaunch_purge(text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_curriculum_prelaunch_purge(text, text, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_lock_curriculum_prelaunch_purge(
  _confirmation text,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_control public.curriculum_prelaunch_purge_control%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_full_admin(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN_FULL_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _confirmation IS DISTINCT FROM 'إغلاق الحذف التجريبي نهائيا' THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_LOCK_CONFIRMATION_MISMATCH' USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(_reason, ''))) < 12 THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_LOCK_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.units) OR EXISTS (SELECT 1 FROM public.lessons) THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_LOCK_REQUIRES_EMPTY_CURRICULUM' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_control
  FROM public.curriculum_prelaunch_purge_control
  WHERE singleton = true
  FOR UPDATE;
  IF v_control.locked_at IS NOT NULL THEN
    RETURN jsonb_build_object('locked', true, 'locked_at', v_control.locked_at, 'replayed', true);
  END IF;

  UPDATE public.curriculum_prelaunch_purge_control
  SET enabled = false, locked_at = now(), locked_by = auth.uid(),
      lock_reason = trim(_reason), updated_at = now()
  WHERE singleton = true;

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(), 'curriculum_prelaunch_purge_locked', 'curriculum', NULL,
    jsonb_build_object('reason', trim(_reason), 'irreversible', true)
  );

  RETURN jsonb_build_object('locked', true, 'replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_lock_curriculum_prelaunch_purge(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_lock_curriculum_prelaunch_purge(text, text)
  TO authenticated;

-- Supersede the unsafe per-row path that disabled triggers. Normal guarded
-- per-row deletion stays available through admin_curriculum_delete.
REVOKE EXECUTE ON FUNCTION public.admin_curriculum_force_delete(text, uuid, text)
  FROM authenticated;

COMMENT ON TABLE public.curriculum_prelaunch_purge_control IS
  'Temporary pre-launch curriculum purge switch. Locking is one-way by design.';
COMMENT ON FUNCTION public.admin_curriculum_prelaunch_purge(text, text, text, text) IS
  'Full-admin-only atomic purge for experimental curriculum data; requires exact preview hash, typed confirmation, reason, and idempotency key.';
