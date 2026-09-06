-- CONTENT-STAFF-CONTENT-DELETE-04
-- Extend the audited content-only deletion RPCs to content managers.
-- The prelaunch force-delete RPC remains full-admin-only because it may remove
-- student progress, exam answers, practice attempts and comments.

BEGIN;

DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated text;
BEGIN
  v_signature := to_regprocedure('public.admin_curriculum_delete_preview(text,uuid)');
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'CONTENT_DELETE_PREVIEW_RPC_MISSING';
  END IF;

  SELECT pg_get_functiondef(v_signature) INTO v_definition;
  IF position('RETURN jsonb_build_object(' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'CONTENT_DELETE_PREVIEW_RETURN_DRIFT';
  END IF;

  v_updated := replace(
    v_definition,
    'RETURN jsonb_build_object(',
    $guard$
  SELECT count(*) INTO n FROM public.lesson_comments x
    WHERE x.lesson_id = ANY(lesson_ids);
  IF n > 0 THEN blockers := blockers || format('STUDENT_COMMENTS:%s', n); END IF;

  SELECT count(*) INTO n FROM public.lesson_question_notes x
    WHERE x.lesson_id = ANY(lesson_ids) OR x.question_id = ANY(question_ids);
  IF n > 0 THEN blockers := blockers || format('STUDENT_QUESTION_NOTES:%s', n); END IF;

  SELECT count(*) INTO n FROM public.practice_attempts x
    WHERE x.unit_id = ANY(unit_ids) OR x.lesson_assessment_id = ANY(assessment_ids);
  IF n > 0 THEN blockers := blockers || format('PRACTICE_ATTEMPTS:%s', n); END IF;

  RETURN jsonb_build_object($guard$
  );
  EXECUTE v_updated;

  v_signature := to_regprocedure('public.admin_delete_lesson_component(uuid,text,text)');
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'CONTENT_DELETE_COMPONENT_RPC_MISSING';
  END IF;

  SELECT pg_get_functiondef(v_signature) INTO v_definition;
  IF position('NOT public.is_full_admin(v_actor)' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'CONTENT_DELETE_COMPONENT_GATE_DRIFT';
  END IF;

  v_updated := replace(
    v_definition,
    'NOT public.is_full_admin(v_actor)',
    'NOT public.is_content_staff(v_actor)'
  );
  EXECUTE v_updated;

  v_signature := to_regprocedure('public.admin_curriculum_delete(text,uuid,text)');
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'CONTENT_DELETE_CURRICULUM_RPC_MISSING';
  END IF;

  SELECT pg_get_functiondef(v_signature) INTO v_definition;
  IF position('NOT public.is_full_admin(auth.uid())' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'CONTENT_DELETE_CURRICULUM_GATE_DRIFT';
  END IF;

  v_updated := replace(
    v_definition,
    'NOT public.is_full_admin(auth.uid())',
    'NOT public.is_content_staff(auth.uid())'
  );
  EXECUTE v_updated;
END
$migration$;

REVOKE ALL ON FUNCTION public.admin_delete_lesson_component(uuid,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_lesson_component(uuid,text,text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.admin_curriculum_delete(text,uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_curriculum_delete(text,uuid,text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.admin_curriculum_delete_preview(text,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_curriculum_delete_preview(text,uuid)
  TO authenticated;

COMMIT;
