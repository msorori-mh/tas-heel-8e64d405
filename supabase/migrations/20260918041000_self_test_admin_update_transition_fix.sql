-- Forward correction for environments that received the initial admin RPC definition.
DO $migration$
DECLARE
  v_oid oid;
  v_def text;
  v_old text := E'  UPDATE public.question_revisions\n  SET status = ''PUBLISHED'', reviewed_at = now(), reviewed_by = v_actor,\n      published_at = now(), published_by = v_actor\n  WHERE id = v_new_revision_id;';
  v_new text := E'  UPDATE public.question_revisions\n  SET status = ''APPROVED'', reviewed_at = now(), reviewed_by = v_actor\n  WHERE id = v_new_revision_id;\n  UPDATE public.question_revisions\n  SET status = ''PUBLISHED'', published_at = now(), published_by = v_actor\n  WHERE id = v_new_revision_id;';
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'lesson_self_test_question_update'
    AND pg_get_function_identity_arguments(p.oid) =
      '_lesson_id uuid, _question_id uuid, _question_text text, _options jsonb, _correct_option_code text, _explanation text, _display_order integer, _reason text';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'SELF_TEST_ADMIN_UPDATE_FUNCTION_MISSING';
  END IF;
  v_def := pg_get_functiondef(v_oid);
  IF position(v_old in v_def) > 0 THEN
    EXECUTE replace(v_def, v_old, v_new);
  ELSIF position('SET status = ''APPROVED'', reviewed_at = now()' in v_def) = 0 THEN
    RAISE EXCEPTION 'SELF_TEST_ADMIN_UPDATE_TRANSITION_SHAPE_UNEXPECTED';
  END IF;
END
$migration$;
