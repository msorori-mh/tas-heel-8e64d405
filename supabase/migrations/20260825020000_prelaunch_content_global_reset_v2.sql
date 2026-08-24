-- PRELAUNCH_CONTENT_GLOBAL_RESET_V2
-- Forward-only replacement for the earlier units/lessons-only purge.
-- The reset is bound to an exact, sorted row-id manifest and deletes only the
-- rows frozen in that manifest. Canonical grades, curriculum tracks, users,
-- finance, import history, audit history, and storage objects are preserved.

CREATE OR REPLACE FUNCTION public.curriculum_prelaunch_purge_manifest_v2()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_table text;
  v_ids jsonb;
  v_manifest jsonb := '{}'::jsonb;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'subjects','subject_textbooks','units','lessons','certificates',
    'content_review_state',
    'question_response_reviews','exam_session_answers','exam_session_questions',
    'exam_sessions','practice_attempt_responses','practice_attempt_questions',
    'practice_attempts','unit_practice_attempts','user_progress',
    'exam_template_questions','exam_templates','ministerial_exam_questions',
    'ministerial_exam_models','lesson_question_notes','assessment_questions',
    'question_solution_steps','question_solutions','question_accepted_answers',
    'official_question_answers','question_option_rationales','question_media',
    'question_options','question_targets','question_revisions','questions',
    'lesson_assessments','lesson_capability_lifecycle','lesson_comments',
    'lesson_resources','lesson_explanations','lesson_book_contents',
    'lesson_summaries','lesson_simulations','golden_lesson_ready_revocations',
    'golden_lesson_ready_attestations','golden_lesson_published_assets',
    'golden_lesson_publications','golden_lesson_asset_attestations',
    'golden_lesson_domain_materializations','golden_lesson_identity_rebindings',
    'golden_lesson_identity_bindings','golden_lesson_domain_stage_answers',
    'golden_lesson_domain_stage_entries','golden_lesson_domain_stage_batches',
    'golden_lesson_package_reviews','golden_lesson_package_versions',
    'golden_lesson_packages'
  ] LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      v_manifest := v_manifest || jsonb_build_object(v_table, '[]'::jsonb);
    ELSE
      EXECUTE format(
        'SELECT coalesce(jsonb_agg(id::text ORDER BY id::text), ''[]''::jsonb) FROM public.%I',
        v_table
      ) INTO v_ids;
      v_manifest := v_manifest || jsonb_build_object(v_table, v_ids);
    END IF;
  END LOOP;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'subject_id', subject_id::text,
        'curriculum_track_id', curriculum_track_id::text
      ) ORDER BY subject_id::text, curriculum_track_id::text
    ),
    '[]'::jsonb
  )
  INTO v_ids
  FROM public.subject_curriculum_tracks;

  RETURN v_manifest || jsonb_build_object('subject_curriculum_tracks', v_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.curriculum_prelaunch_purge_manifest_v2()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.curriculum_prelaunch_purge_snapshot_v2()
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT public.curriculum_prelaunch_purge_snapshot() || jsonb_build_object(
    'subjects', (SELECT count(*) FROM public.subjects),
    'subject_curriculum_tracks', (SELECT count(*) FROM public.subject_curriculum_tracks),
    'subject_textbooks', (SELECT count(*) FROM public.subject_textbooks),
    'content_review_state', (SELECT count(*) FROM public.content_review_state),
    'exam_templates', (SELECT count(*) FROM public.exam_templates),
    'ministerial_exam_models', (SELECT count(*) FROM public.ministerial_exam_models)
  );
$$;

REVOKE ALL ON FUNCTION public.curriculum_prelaunch_purge_snapshot_v2()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_curriculum_prelaunch_purge_status()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_control public.curriculum_prelaunch_purge_control%ROWTYPE;
  v_counts jsonb;
  v_manifest jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_full_admin(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN_FULL_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_control
  FROM public.curriculum_prelaunch_purge_control
  WHERE singleton = true;

  v_counts := public.curriculum_prelaunch_purge_snapshot_v2();
  v_manifest := public.curriculum_prelaunch_purge_manifest_v2();

  RETURN jsonb_build_object(
    'scope_version', 2,
    'enabled', v_control.enabled,
    'locked_at', v_control.locked_at,
    'counts', v_counts,
    'preview_sha256', encode(extensions.digest(v_manifest::text, 'sha256'::text), 'hex'),
    'manifest_row_count', (
      SELECT coalesce(sum(jsonb_array_length(value)), 0)
      FROM jsonb_each(v_manifest)
    ),
    'confirmation_phrase', 'حذف جميع بيانات المحتوى التجريبية',
    'subject_candidates', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'code', s.code,
          'name', s.name,
          'grade_id', s.grade_id
        ) ORDER BY s.grade_id, s.sort_order, s.id
      )
      FROM public.subjects s
    ), '[]'::jsonb),
    'textbook_storage_paths', coalesce((
      SELECT jsonb_agg(DISTINCT st.storage_path ORDER BY st.storage_path)
      FROM public.subject_textbooks st
    ), '[]'::jsonb),
    'preserved', jsonb_build_array(
      'grades', 'curriculum_tracks', 'users', 'profiles',
      'import_jobs', 'import_staging_rows', 'audit_logs',
      'finance', 'storage_objects', 'content_code_allocations'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_curriculum_prelaunch_purge_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_curriculum_prelaunch_purge_status() TO authenticated;

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
  v_manifest jsonb;
  v_hash text;
  v_result jsonb;
  v_table text;
  v_storage_paths jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_full_admin(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN_FULL_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _confirmation IS DISTINCT FROM 'حذف جميع بيانات المحتوى التجريبية' THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_CONFIRMATION_MISMATCH' USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(_reason, ''))) < 12 THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(_idempotency_key, ''))) < 16 THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('tamkeen:content-prelaunch-reset-v2', 0));

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

  FOREACH v_table IN ARRAY ARRAY[
    'subjects','subject_curriculum_tracks','subject_textbooks','units','lessons',
    'certificates','content_review_state',
    'question_response_reviews','exam_session_answers','exam_session_questions',
    'exam_sessions','practice_attempt_responses','practice_attempt_questions',
    'practice_attempts','unit_practice_attempts','user_progress',
    'exam_template_questions','exam_templates','ministerial_exam_questions',
    'ministerial_exam_models','lesson_question_notes','assessment_questions',
    'question_solution_steps','question_solutions','question_accepted_answers',
    'official_question_answers','question_option_rationales','question_media',
    'question_options','question_targets','question_revisions','questions',
    'lesson_assessments','lesson_capability_lifecycle','lesson_comments',
    'lesson_resources','lesson_explanations','lesson_book_contents',
    'lesson_summaries','lesson_simulations','golden_lesson_ready_revocations',
    'golden_lesson_ready_attestations','golden_lesson_published_assets',
    'golden_lesson_publications','golden_lesson_asset_attestations',
    'golden_lesson_domain_materializations','golden_lesson_identity_rebindings',
    'golden_lesson_identity_bindings','golden_lesson_domain_stage_answers',
    'golden_lesson_domain_stage_entries','golden_lesson_domain_stage_batches',
    'golden_lesson_package_reviews','golden_lesson_package_versions',
    'golden_lesson_packages'
  ] LOOP
    EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE', v_table);
  END LOOP;

  v_before := public.curriculum_prelaunch_purge_snapshot_v2();
  v_manifest := public.curriculum_prelaunch_purge_manifest_v2();
  v_hash := encode(extensions.digest(v_manifest::text, 'sha256'::text), 'hex');

  IF v_hash IS DISTINCT FROM lower(trim(coalesce(_expected_preview_sha256, ''))) THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_STALE_PREVIEW' USING ERRCODE = '40001';
  END IF;
  IF coalesce((SELECT sum(jsonb_array_length(value)) FROM jsonb_each(v_manifest)), 0) = 0 THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_NOTHING_TO_DELETE' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(DISTINCT storage_path ORDER BY storage_path), '[]'::jsonb)
  INTO v_storage_paths
  FROM public.subject_textbooks;

  CREATE TEMP TABLE curriculum_prelaunch_purge_candidates_v2 (
    table_name text NOT NULL,
    row_id text NOT NULL,
    PRIMARY KEY (table_name, row_id)
  ) ON COMMIT DROP;

  FOR v_table IN SELECT key FROM jsonb_each(v_manifest)
  LOOP
    IF v_table <> 'subject_curriculum_tracks' THEN
      INSERT INTO curriculum_prelaunch_purge_candidates_v2(table_name, row_id)
      SELECT v_table, jsonb_array_elements_text(v_manifest->v_table);
    END IF;
  END LOOP;

  INSERT INTO public.curriculum_prelaunch_purge_tickets(
    backend_pid, transaction_id, actor_id
  ) VALUES (pg_backend_pid(), txid_current(), auth.uid());

  -- Exact candidate deletes, ordered from activity/immutable leaves to roots.
  DELETE FROM public.content_review_state t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='content_review_state' AND c.row_id=t.id::text);
  DELETE FROM public.certificates t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='certificates' AND c.row_id=t.id::text);
  DELETE FROM public.question_response_reviews t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='question_response_reviews' AND c.row_id=t.id::text);
  DELETE FROM public.exam_session_answers t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='exam_session_answers' AND c.row_id=t.id::text);
  DELETE FROM public.exam_session_questions t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='exam_session_questions' AND c.row_id=t.id::text);
  DELETE FROM public.exam_sessions t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='exam_sessions' AND c.row_id=t.id::text);
  DELETE FROM public.practice_attempt_responses t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='practice_attempt_responses' AND c.row_id=t.id::text);
  DELETE FROM public.practice_attempt_questions t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='practice_attempt_questions' AND c.row_id=t.id::text);
  DELETE FROM public.practice_attempts t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='practice_attempts' AND c.row_id=t.id::text);
  DELETE FROM public.unit_practice_attempts t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='unit_practice_attempts' AND c.row_id=t.id::text);
  DELETE FROM public.user_progress t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='user_progress' AND c.row_id=t.id::text);
  DELETE FROM public.exam_template_questions t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='exam_template_questions' AND c.row_id=t.id::text);
  DELETE FROM public.ministerial_exam_questions t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='ministerial_exam_questions' AND c.row_id=t.id::text);
  DELETE FROM public.lesson_question_notes t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='lesson_question_notes' AND c.row_id=t.id::text);
  DELETE FROM public.assessment_questions t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='assessment_questions' AND c.row_id=t.id::text);
  DELETE FROM public.exam_templates t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='exam_templates' AND c.row_id=t.id::text);
  DELETE FROM public.ministerial_exam_models t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='ministerial_exam_models' AND c.row_id=t.id::text);

  DELETE FROM public.question_solution_steps t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='question_solution_steps' AND c.row_id=t.id::text);
  DELETE FROM public.question_solutions t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='question_solutions' AND c.row_id=t.id::text);
  DELETE FROM public.question_accepted_answers t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='question_accepted_answers' AND c.row_id=t.id::text);
  DELETE FROM public.official_question_answers t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='official_question_answers' AND c.row_id=t.id::text);
  DELETE FROM public.question_option_rationales t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='question_option_rationales' AND c.row_id=t.id::text);
  DELETE FROM public.question_media t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='question_media' AND c.row_id=t.id::text);
  DELETE FROM public.question_options t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='question_options' AND c.row_id=t.id::text);
  DELETE FROM public.question_targets t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='question_targets' AND c.row_id=t.id::text);
  UPDATE public.questions q SET current_published_revision_id = NULL
  WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='questions' AND c.row_id=q.id::text)
    AND q.current_published_revision_id IS NOT NULL;
  DELETE FROM public.question_revisions t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='question_revisions' AND c.row_id=t.id::text);
  DELETE FROM public.questions t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='questions' AND c.row_id=t.id::text);

  DELETE FROM public.lesson_assessments t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='lesson_assessments' AND c.row_id=t.id::text);
  DELETE FROM public.lesson_capability_lifecycle t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='lesson_capability_lifecycle' AND c.row_id=t.id::text);
  DELETE FROM public.lesson_comments t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='lesson_comments' AND c.row_id=t.id::text);
  DELETE FROM public.lesson_resources t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='lesson_resources' AND c.row_id=t.id::text);
  DELETE FROM public.lesson_explanations t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='lesson_explanations' AND c.row_id=t.id::text);
  DELETE FROM public.lesson_book_contents t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='lesson_book_contents' AND c.row_id=t.id::text);
  DELETE FROM public.lesson_summaries t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='lesson_summaries' AND c.row_id=t.id::text);
  DELETE FROM public.lesson_simulations t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='lesson_simulations' AND c.row_id=t.id::text);

  DELETE FROM public.golden_lesson_ready_revocations t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='golden_lesson_ready_revocations' AND c.row_id=t.id::text);
  DELETE FROM public.golden_lesson_ready_attestations t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='golden_lesson_ready_attestations' AND c.row_id=t.id::text);
  DELETE FROM public.golden_lesson_published_assets t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='golden_lesson_published_assets' AND c.row_id=t.id::text);
  DELETE FROM public.golden_lesson_publications t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='golden_lesson_publications' AND c.row_id=t.id::text);
  DELETE FROM public.golden_lesson_asset_attestations t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='golden_lesson_asset_attestations' AND c.row_id=t.id::text);
  DELETE FROM public.golden_lesson_domain_materializations t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='golden_lesson_domain_materializations' AND c.row_id=t.id::text);
  DELETE FROM public.golden_lesson_identity_rebindings t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='golden_lesson_identity_rebindings' AND c.row_id=t.id::text);
  DELETE FROM public.golden_lesson_identity_bindings t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='golden_lesson_identity_bindings' AND c.row_id=t.id::text);
  DELETE FROM public.golden_lesson_domain_stage_answers t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='golden_lesson_domain_stage_answers' AND c.row_id=t.id::text);
  DELETE FROM public.golden_lesson_domain_stage_entries t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='golden_lesson_domain_stage_entries' AND c.row_id=t.id::text);
  DELETE FROM public.golden_lesson_domain_stage_batches t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='golden_lesson_domain_stage_batches' AND c.row_id=t.id::text);
  DELETE FROM public.golden_lesson_package_reviews t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='golden_lesson_package_reviews' AND c.row_id=t.id::text);
  DELETE FROM public.golden_lesson_package_versions t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='golden_lesson_package_versions' AND c.row_id=t.id::text);
  DELETE FROM public.golden_lesson_packages t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='golden_lesson_packages' AND c.row_id=t.id::text);

  DELETE FROM public.lessons t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='lessons' AND c.row_id=t.id::text);
  DELETE FROM public.units t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='units' AND c.row_id=t.id::text);
  DELETE FROM public.subject_textbooks t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='subject_textbooks' AND c.row_id=t.id::text);
  DELETE FROM public.subjects t WHERE EXISTS (SELECT 1 FROM curriculum_prelaunch_purge_candidates_v2 c WHERE c.table_name='subjects' AND c.row_id=t.id::text);

  DELETE FROM public.curriculum_prelaunch_purge_tickets
  WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current();

  v_after := public.curriculum_prelaunch_purge_snapshot_v2();
  IF coalesce((v_after->>'subjects')::bigint, -1) <> 0
     OR coalesce((v_after->>'subject_curriculum_tracks')::bigint, -1) <> 0
     OR coalesce((v_after->>'subject_textbooks')::bigint, -1) <> 0
     OR coalesce((v_after->>'content_review_state')::bigint, -1) <> 0
     OR coalesce((v_after->>'units')::bigint, -1) <> 0
     OR coalesce((v_after->>'lessons')::bigint, -1) <> 0
     OR coalesce((v_after->>'questions')::bigint, -1) <> 0
     OR coalesce((v_after->>'exam_templates')::bigint, -1) <> 0
     OR coalesce((v_after->>'ministerial_exam_models')::bigint, -1) <> 0 THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_POSTVERIFY_FAILED' USING ERRCODE = 'P0001';
  END IF;

  v_result := jsonb_build_object(
    'deleted', true,
    'replayed', false,
    'scope_version', 2,
    'before', v_before,
    'after', v_after,
    'preview_sha256', v_hash,
    'textbook_storage_paths_preserved', v_storage_paths,
    'storage_cleanup_required', jsonb_array_length(v_storage_paths) > 0
  );

  INSERT INTO public.curriculum_prelaunch_purge_runs(
    actor_id, idempotency_key, preview_sha256, reason, result
  ) VALUES (auth.uid(), trim(_idempotency_key), v_hash, trim(_reason), v_result);

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(), 'content_prelaunch_global_reset_v2', 'content_import', NULL,
    jsonb_build_object(
      'reason', trim(_reason),
      'idempotency_key', trim(_idempotency_key),
      'preview_sha256', v_hash,
      'before', v_before,
      'after', v_after,
      'textbook_storage_paths_preserved', v_storage_paths
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
SET search_path = public, extensions, pg_temp
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
  IF EXISTS (SELECT 1 FROM public.subjects)
     OR EXISTS (SELECT 1 FROM public.units)
     OR EXISTS (SELECT 1 FROM public.lessons) THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_LOCK_REQUIRES_EMPTY_CONTENT' USING ERRCODE = '55000';
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
    auth.uid(), 'content_prelaunch_reset_locked', 'content_import', NULL,
    jsonb_build_object('reason', trim(_reason), 'irreversible', true)
  );

  RETURN jsonb_build_object('locked', true, 'replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_lock_curriculum_prelaunch_purge(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_lock_curriculum_prelaunch_purge(text, text)
  TO authenticated;

COMMENT ON FUNCTION public.admin_curriculum_prelaunch_purge(text, text, text, text) IS
  'V2 pre-launch reset for all experimental content metadata. Exact manifest-bound, full-admin-only, atomic, idempotent, audited, and centrally lockable.';
