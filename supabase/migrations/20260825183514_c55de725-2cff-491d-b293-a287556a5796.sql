DO $mig$
DECLARE
  v_oid oid;
  v_def text;
  v_old_ins_official constant text := $q$INSERT INTO public.question_revisions(question_id, revision_number, status, interaction_type,
                                            grading_mode, question_text, max_score, allow_partial,
                                            requires_media, manual_grading_required,
                                            payload_hash_version, source_payload_hash, created_by)
      VALUES (question_row.id, 1, 'DRAFT', expected_interaction,
              expected_grading, public.cf10_question_text(item), 1, false, false, true,
              'canonical_payload_v1', payloads->'officialBookQuestions'->>'sha256', _actor_id)$q$;
  v_new_ins_official constant text := $q$INSERT INTO public.question_revisions(question_id, revision_number, status, interaction_type,
                                            grading_mode, question_text, max_score, allow_partial,
                                            requires_media, manual_grading_required, educational_label,
                                            payload_hash_version, source_payload_hash, created_by)
      VALUES (question_row.id, 1, 'DRAFT', expected_interaction,
              expected_grading, public.cf10_question_text(item), 1, false, false, true,
              'OFFICIAL_BOOK_QUESTION', 'canonical_payload_v1',
              payloads->'officialBookQuestions'->>'sha256', _actor_id)$q$;
  v_old_ins_self constant text := $q$INSERT INTO public.question_revisions(question_id, revision_number, status, interaction_type,
                                            grading_mode, question_text, max_score, allow_partial,
                                            requires_media, manual_grading_required,
                                            payload_hash_version, source_payload_hash, created_by)
      VALUES (question_row.id, 1, 'DRAFT', expected_interaction, expected_grading,
              public.cf10_question_text(item), 1, false, false, false, 'canonical_payload_v1',
              payloads->'selfTest'->>'sha256', _actor_id)$q$;
  v_new_ins_self constant text := $q$INSERT INTO public.question_revisions(question_id, revision_number, status, interaction_type,
                                            grading_mode, question_text, max_score, allow_partial,
                                            requires_media, manual_grading_required, educational_label,
                                            payload_hash_version, source_payload_hash, created_by)
      VALUES (question_row.id, 1, 'DRAFT', expected_interaction, expected_grading,
              public.cf10_question_text(item), 1, false, false, false, 'SELF_TEST',
              'canonical_payload_v1', payloads->'selfTest'->>'sha256', _actor_id)$q$;
  v_old_coerce constant text := $q$    expected_type := coalesce(item->>'type','multiple_choice');
    expected_options := coalesce(item->'options','[]'::jsonb);
    expected_interaction := expected_type;
    expected_grading := 'AUTO_SINGLE';$q$;
  v_new_coerce constant text := $q$    expected_type := coalesce(item->>'type','multiple_choice');
    expected_options := coalesce(item->'options','[]'::jsonb);
    -- CF10_EDULABEL_21H: student RPCs require SINGLE_CHOICE/AUTO_SINGLE self-test
    -- revisions; questions.question_type keeps the authored type for display.
    expected_interaction := 'SINGLE_CHOICE';
    expected_grading := 'AUTO_SINGLE';$q$;
  v_old_replay_official constant text := $q$      IF revision_row.id IS NULL THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_revisions %', question_code USING ERRCODE = '23514';
      END IF;
      IF revision_row.revision_number IS DISTINCT FROM 1
         OR revision_row.status IS DISTINCT FROM 'DRAFT'
         OR revision_row.interaction_type IS DISTINCT FROM expected_interaction
         OR revision_row.grading_mode IS DISTINCT FROM expected_grading
         OR revision_row.question_text IS DISTINCT FROM public.cf10_question_text(item)
         OR revision_row.source_payload_hash IS DISTINCT FROM (payloads->'officialBookQuestions'->>'sha256')$q$;
  v_new_replay_official constant text := $q$      IF revision_row.id IS NULL THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_revisions %', question_code USING ERRCODE = '23514';
      END IF;
      -- CF10_EDULABEL_21H: fill the missing label on pre-fix DRAFT rows so replay
      -- stays idempotent. educational_label is not part of the canonical payload
      -- hash. PUBLISHED revisions are never touched.
      IF revision_row.educational_label IS NULL THEN
        UPDATE public.question_revisions
           SET educational_label = 'OFFICIAL_BOOK_QUESTION'
         WHERE id = revision_row.id AND status = 'DRAFT' AND educational_label IS NULL;
        revision_row.educational_label := 'OFFICIAL_BOOK_QUESTION';
      END IF;
      IF revision_row.educational_label IS DISTINCT FROM 'OFFICIAL_BOOK_QUESTION' THEN
        RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: question_revisions %', question_code USING ERRCODE = '23514';
      END IF;
      IF revision_row.revision_number IS DISTINCT FROM 1
         OR revision_row.status IS DISTINCT FROM 'DRAFT'
         OR revision_row.interaction_type IS DISTINCT FROM expected_interaction
         OR revision_row.grading_mode IS DISTINCT FROM expected_grading
         OR revision_row.question_text IS DISTINCT FROM public.cf10_question_text(item)
         OR revision_row.source_payload_hash IS DISTINCT FROM (payloads->'officialBookQuestions'->>'sha256')$q$;
  v_old_replay_self constant text := $q$      IF revision_row.id IS NULL THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_revisions %', question_code USING ERRCODE = '23514';
      END IF;
      IF revision_row.revision_number IS DISTINCT FROM 1
         OR revision_row.status IS DISTINCT FROM 'DRAFT'
         OR revision_row.interaction_type IS DISTINCT FROM expected_interaction
         OR revision_row.grading_mode IS DISTINCT FROM expected_grading
         OR revision_row.question_text IS DISTINCT FROM public.cf10_question_text(item)
         OR revision_row.source_payload_hash IS DISTINCT FROM (payloads->'selfTest'->>'sha256')$q$;
  v_new_replay_self constant text := $q$      IF revision_row.id IS NULL THEN
        RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: question_revisions %', question_code USING ERRCODE = '23514';
      END IF;
      -- CF10_EDULABEL_21H: normalize pre-fix DRAFT self-test rows in place
      -- (multiple_choice -> SINGLE_CHOICE, add SELF_TEST label) and refresh the
      -- payload hash so the strict replay checks below pass. DRAFT only;
      -- PUBLISHED revisions are never touched.
      IF revision_row.educational_label IS NULL
         AND revision_row.interaction_type = 'multiple_choice'
         AND revision_row.grading_mode = 'AUTO_SINGLE' THEN
        UPDATE public.question_revisions
           SET interaction_type = 'SINGLE_CHOICE',
               grading_mode = 'AUTO_SINGLE',
               educational_label = 'SELF_TEST'
         WHERE id = revision_row.id AND status = 'DRAFT' AND educational_label IS NULL;
        UPDATE public.question_revisions
           SET payload_hash = public._qb_compute_revision_payload_hash(revision_row.id),
               payload_hash_version = 'canonical_payload_v1'
         WHERE id = revision_row.id AND status = 'DRAFT';
        SELECT * INTO revision_row FROM public.question_revisions WHERE id = revision_row.id;
      END IF;
      IF revision_row.revision_number IS DISTINCT FROM 1
         OR revision_row.status IS DISTINCT FROM 'DRAFT'
         OR revision_row.interaction_type IS DISTINCT FROM expected_interaction
         OR revision_row.grading_mode IS DISTINCT FROM expected_grading
         OR revision_row.question_text IS DISTINCT FROM public.cf10_question_text(item)
         OR revision_row.source_payload_hash IS DISTINCT FROM (payloads->'selfTest'->>'sha256')$q$;
BEGIN
  SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'golden_lesson_materialize_domain_batch'
     AND pg_get_function_identity_arguments(p.oid) =
         '_batch_id uuid, _actor_id uuid, _mode text, _expected_plan_sha256 text, _idempotency_key text';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'CF10_EDULABEL_FIX_TARGET_FUNCTION_MISSING';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  IF position('CF10_EDULABEL_21H' in v_def) > 0 THEN
    RAISE EXCEPTION 'CF10_EDULABEL_FIX_ALREADY_APPLIED';
  END IF;

  IF length(v_def) - length(replace(v_def, v_old_ins_official, '')) <> length(v_old_ins_official) THEN
    RAISE EXCEPTION 'CF10_EDULABEL_FIX_ANCHOR_INS_OFFICIAL';
  END IF;
  IF length(v_def) - length(replace(v_def, v_old_ins_self, '')) <> length(v_old_ins_self) THEN
    RAISE EXCEPTION 'CF10_EDULABEL_FIX_ANCHOR_INS_SELF';
  END IF;
  IF length(v_def) - length(replace(v_def, v_old_coerce, '')) <> length(v_old_coerce) THEN
    RAISE EXCEPTION 'CF10_EDULABEL_FIX_ANCHOR_COERCE';
  END IF;
  IF length(v_def) - length(replace(v_def, v_old_replay_official, '')) <> length(v_old_replay_official) THEN
    RAISE EXCEPTION 'CF10_EDULABEL_FIX_ANCHOR_REPLAY_OFFICIAL';
  END IF;
  IF length(v_def) - length(replace(v_def, v_old_replay_self, '')) <> length(v_old_replay_self) THEN
    RAISE EXCEPTION 'CF10_EDULABEL_FIX_ANCHOR_REPLAY_SELF';
  END IF;

  v_def := replace(v_def, v_old_ins_official, v_new_ins_official);
  v_def := replace(v_def, v_old_ins_self, v_new_ins_self);
  v_def := replace(v_def, v_old_coerce, v_new_coerce);
  v_def := replace(v_def, v_old_replay_official, v_new_replay_official);
  v_def := replace(v_def, v_old_replay_self, v_new_replay_self);

  EXECUTE v_def;

  v_def := pg_get_functiondef(v_oid);
  IF position('CF10_EDULABEL_21H' in v_def) = 0 THEN
    RAISE EXCEPTION 'CF10_EDULABEL_FIX_POSTVERIFY_MARKER';
  END IF;
  IF position('OFFICIAL_BOOK_QUESTION' in v_def) = 0 THEN
    RAISE EXCEPTION 'CF10_EDULABEL_FIX_POSTVERIFY_OFFICIAL_LABEL';
  END IF;
  IF position('SELF_TEST' in v_def) = 0 THEN
    RAISE EXCEPTION 'CF10_EDULABEL_FIX_POSTVERIFY_SELF_LABEL';
  END IF;
  IF position(v_old_coerce in v_def) > 0 THEN
    RAISE EXCEPTION 'CF10_EDULABEL_FIX_POSTVERIFY_COERCE_REMAINS';
  END IF;
  IF position(v_old_ins_official in v_def) > 0 OR position(v_old_ins_self in v_def) > 0 THEN
    RAISE EXCEPTION 'CF10_EDULABEL_FIX_POSTVERIFY_INSERT_REMAINS';
  END IF;
END
$mig$;