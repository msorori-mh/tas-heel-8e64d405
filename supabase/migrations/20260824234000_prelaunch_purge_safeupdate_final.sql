-- Make the temporary global curriculum purge compatible with Supabase supautils.
-- Supabase production rejects DELETE statements without an explicit WHERE
-- clause. This function intentionally deletes the complete experimental
-- curriculum scope, so every global delete is now written as WHERE true.
-- The RPC remains full-admin-only, preview-hash-bound, idempotent, audited,
-- advisory-locked, transaction-local, and atomic.

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
SET search_path = public, extensions, pg_temp
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
  v_hash := encode(extensions.digest(v_before::text, 'sha256'::text), 'hex');
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
  DELETE FROM public.question_response_reviews WHERE true;
  DELETE FROM public.exam_session_answers WHERE true;
  DELETE FROM public.exam_session_questions WHERE true;
  DELETE FROM public.exam_sessions WHERE true;
  DELETE FROM public.practice_attempt_responses WHERE true;
  DELETE FROM public.practice_attempt_questions WHERE true;
  DELETE FROM public.practice_attempts WHERE true;
  DELETE FROM public.unit_practice_attempts WHERE true;
  DELETE FROM public.user_progress WHERE true;

  -- Remove references from reusable exam containers, but preserve the containers.
  DELETE FROM public.exam_template_questions WHERE true;
  DELETE FROM public.ministerial_exam_questions WHERE true;
  DELETE FROM public.lesson_question_notes WHERE true;
  DELETE FROM public.assessment_questions WHERE true;

  DELETE FROM public.question_solution_steps WHERE true;
  DELETE FROM public.question_solutions WHERE true;
  DELETE FROM public.question_accepted_answers WHERE true;
  DELETE FROM public.official_question_answers WHERE true;
  DELETE FROM public.question_option_rationales WHERE true;
  DELETE FROM public.question_media WHERE true;
  DELETE FROM public.question_options WHERE true;
  DELETE FROM public.question_targets WHERE true;
  UPDATE public.questions SET current_published_revision_id = NULL
    WHERE current_published_revision_id IS NOT NULL;
  DELETE FROM public.question_revisions WHERE true;
  DELETE FROM public.questions WHERE true;

  DELETE FROM public.lesson_assessments WHERE true;
  DELETE FROM public.lesson_capability_lifecycle WHERE true;
  DELETE FROM public.lesson_comments WHERE true;
  DELETE FROM public.lesson_resources WHERE true;
  DELETE FROM public.lesson_explanations WHERE true;
  DELETE FROM public.lesson_book_contents WHERE true;
  DELETE FROM public.lesson_summaries WHERE true;
  DELETE FROM public.lesson_simulations WHERE true;

  -- Golden package DB ledgers are removed in FK-safe order. Verified storage
  -- objects are intentionally retained for a later, separately-audited cleanup.
  DELETE FROM public.golden_lesson_ready_revocations WHERE true;
  DELETE FROM public.golden_lesson_ready_attestations WHERE true;
  DELETE FROM public.golden_lesson_published_assets WHERE true;
  DELETE FROM public.golden_lesson_publications WHERE true;
  DELETE FROM public.golden_lesson_asset_attestations WHERE true;
  DELETE FROM public.golden_lesson_domain_materializations WHERE true;
  DELETE FROM public.golden_lesson_identity_rebindings WHERE true;
  DELETE FROM public.golden_lesson_identity_bindings WHERE true;
  DELETE FROM public.golden_lesson_domain_stage_answers WHERE true;
  DELETE FROM public.golden_lesson_domain_stage_entries WHERE true;
  DELETE FROM public.golden_lesson_domain_stage_batches WHERE true;
  DELETE FROM public.golden_lesson_package_reviews WHERE true;
  DELETE FROM public.golden_lesson_package_versions WHERE true;
  DELETE FROM public.golden_lesson_packages WHERE true;

  DELETE FROM public.lessons WHERE true;
  DELETE FROM public.units WHERE true;

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

DO $verify$
DECLARE
  v_definition text;
  v_bounded_count integer;
BEGIN
  v_definition := pg_get_functiondef(
    'public.admin_curriculum_prelaunch_purge(text,text,text,text)'::regprocedure
  );

  IF v_definition ~* 'DELETE[[:space:]]+FROM[[:space:]]+public\.[a-z0-9_]+[[:space:]]*;' THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_UNBOUNDED_DELETE_REMAINS';
  END IF;

  SELECT count(*) INTO v_bounded_count
  FROM regexp_matches(
    v_definition,
    'DELETE[[:space:]]+FROM[[:space:]]+public\.[a-z0-9_]+[[:space:]]+WHERE[[:space:]]+true[[:space:]]*;',
    'gi'
  );

  IF v_bounded_count <> 47 THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_DELETE_SCOPE_MISMATCH: expected 47, found %',
      v_bounded_count;
  END IF;

  IF position('extensions.digest' in v_definition) = 0 THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_PGCRYPTO_SCHEMA_REGRESSION';
  END IF;
END;
$verify$;

COMMENT ON FUNCTION public.admin_curriculum_prelaunch_purge(text, text, text, text) IS
  'Full-admin-only atomic purge for experimental curriculum data; all 47 global deletes carry explicit WHERE clauses for Supabase safe-update enforcement.';
