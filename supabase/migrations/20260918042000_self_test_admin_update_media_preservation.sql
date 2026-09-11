-- Keep revision-pinned lesson targets and media when an admin edits a self-test question.
DO $migration$
DECLARE
  v_oid oid;
  v_def text;
  v_old_media text := E'''SELF_TEST'', btrim(_question_text), v_old_revision.max_score, false, false,\n    false, ''canonical_payload_v1''';
  v_new_media text := E'''SELF_TEST'', btrim(_question_text), v_old_revision.max_score, false,\n    v_old_revision.requires_media,\n    false, ''canonical_payload_v1''';
  v_anchor text := E'  END LOOP;\n\n  INSERT INTO public.official_question_answers(question_id, revision_id, model_answer, explanation)';
  v_replacement text := E'  END LOOP;\n\n  INSERT INTO public.question_targets(\n    question_id, revision_id, target_type, subject_id, unit_id, lesson_id, is_primary, created_by\n  )\n  SELECT question_id, v_new_revision_id, target_type, subject_id, unit_id, lesson_id,\n    is_primary, v_actor\n  FROM public.question_targets WHERE revision_id = v_old_revision.id;\n  INSERT INTO public.question_media(\n    question_revision_id, media_code, storage_path, mime_type, file_size, sha256,\n    alt_text_ar, caption, sort_order, requires_media, created_by\n  )\n  SELECT v_new_revision_id, media_code, storage_path, mime_type, file_size, sha256,\n    alt_text_ar, caption, sort_order, requires_media, v_actor\n  FROM public.question_media WHERE question_revision_id = v_old_revision.id;\n\n  INSERT INTO public.official_question_answers(question_id, revision_id, model_answer, explanation)';
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'lesson_self_test_question_update'
    AND pg_get_function_identity_arguments(p.oid) =
      '_lesson_id uuid, _question_id uuid, _question_text text, _options jsonb, _correct_option_code text, _explanation text, _display_order integer, _reason text';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'SELF_TEST_ADMIN_UPDATE_FUNCTION_MISSING'; END IF;
  v_def := pg_get_functiondef(v_oid);
  IF position('FROM public.question_media WHERE question_revision_id = v_old_revision.id' in v_def) = 0 THEN
    IF position(v_old_media in v_def) = 0 OR position(v_anchor in v_def) = 0 THEN
      RAISE EXCEPTION 'SELF_TEST_ADMIN_MEDIA_PRESERVATION_SHAPE_UNEXPECTED';
    END IF;
    v_def := replace(v_def, v_old_media, v_new_media);
    v_def := replace(v_def, v_anchor, v_replacement);
    EXECUTE v_def;
  END IF;
END
$migration$;
