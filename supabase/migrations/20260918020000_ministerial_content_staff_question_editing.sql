-- MINISTERIAL_CONTENT_STAFF_QUESTION_EDITING
--
-- Separate question correction from model publication:
--   * admin + content_manager may list and revise ministerial questions;
--   * existing student sessions remain pinned to their original revision;
--   * every correction still creates a new immutable revision and demotes the
--     model to draft, so publishing remains separately authorized;
--   * deletion remains blocked once sessions exist.

BEGIN;

DO $patch$
DECLARE
  v_list text;
  v_update text;
  v_publish_gate constant text := 'NOT public.can_publish_ministerial_exams(v_actor)';
  v_staff_gate constant text := 'NOT public.is_content_staff(v_actor)';
  v_session_guard constant text :=
    'IF EXISTS (SELECT 1 FROM public.exam_sessions WHERE ministerial_model_id=_model_id) THEN RAISE EXCEPTION ''MINISTERIAL_EDIT_BLOCKED_SESSIONS_EXIST'' USING ERRCODE=''42501''; END IF;';
  v_hits integer;
BEGIN
  IF to_regprocedure('public.ministerial_model_questions_admin_list(uuid)') IS NULL
     OR to_regprocedure('public.ministerial_model_question_update(uuid,uuid,text,jsonb,text,text,text,integer,numeric,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'MINISTERIAL_QUESTION_EDIT_BASELINE_MISSING' USING ERRCODE = '55000';
  END IF;

  SELECT pg_get_functiondef(
    'public.ministerial_model_questions_admin_list(uuid)'::regprocedure
  ) INTO v_list;
  v_hits := (length(v_list) - length(replace(v_list, v_publish_gate, '')))
    / length(v_publish_gate);
  IF v_hits <> 1 OR position(v_staff_gate IN v_list) > 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_QUESTION_LIST_AUTH_BASELINE_DRIFT: %', v_hits
      USING ERRCODE = '55000';
  END IF;
  EXECUTE replace(v_list, v_publish_gate, v_staff_gate);

  SELECT pg_get_functiondef(
    'public.ministerial_model_question_update(uuid,uuid,text,jsonb,text,text,text,integer,numeric,text,jsonb)'::regprocedure
  ) INTO v_update;
  v_hits := (length(v_update) - length(replace(v_update, v_publish_gate, '')))
    / length(v_publish_gate);
  IF v_hits <> 1 OR position(v_staff_gate IN v_update) > 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_QUESTION_UPDATE_AUTH_BASELINE_DRIFT: %', v_hits
      USING ERRCODE = '55000';
  END IF;
  v_hits := (length(v_update) - length(replace(v_update, v_session_guard, '')))
    / length(v_session_guard);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'MINISTERIAL_QUESTION_UPDATE_SESSION_GUARD_DRIFT: %', v_hits
      USING ERRCODE = '55000';
  END IF;
  EXECUTE replace(
    replace(v_update, v_publish_gate, v_staff_gate),
    v_session_guard,
    '-- Existing sessions are revision-pinned; corrections create a new revision.'
  );
END
$patch$;

COMMENT ON FUNCTION public.ministerial_model_questions_admin_list(uuid) IS
  'Lists one ministerial model question set for admin/content_manager editing.';
COMMENT ON FUNCTION public.ministerial_model_question_update(uuid,uuid,text,jsonb,text,text,text,integer,numeric,text,jsonb) IS
  'Creates an audited correction revision for admin/content_manager; existing sessions retain their pinned revision and model returns to draft.';

REVOKE ALL ON FUNCTION public.ministerial_model_questions_admin_list(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ministerial_model_question_update(uuid,uuid,text,jsonb,text,text,text,integer,numeric,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ministerial_model_questions_admin_list(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ministerial_model_question_update(uuid,uuid,text,jsonb,text,text,text,integer,numeric,text,jsonb) TO authenticated, service_role;

DO $proof$
DECLARE
  v_list text;
  v_update text;
  v_delete text;
  v_publish text;
BEGIN
  SELECT pg_get_functiondef(
    'public.ministerial_model_questions_admin_list(uuid)'::regprocedure
  ) INTO v_list;
  SELECT pg_get_functiondef(
    'public.ministerial_model_question_update(uuid,uuid,text,jsonb,text,text,text,integer,numeric,text,jsonb)'::regprocedure
  ) INTO v_update;
  SELECT pg_get_functiondef(
    'public.ministerial_model_question_delete(uuid,uuid,text)'::regprocedure
  ) INTO v_delete;
  SELECT pg_get_functiondef('public.publish_ministerial_model(uuid)'::regprocedure)
    INTO v_publish;

  IF position('is_content_staff(v_actor)' IN v_list) = 0
     OR position('can_publish_ministerial_exams(v_actor)' IN v_list) > 0
     OR position('is_content_staff(v_actor)' IN v_update) = 0
     OR position('can_publish_ministerial_exams(v_actor)' IN v_update) > 0
     OR position('MINISTERIAL_EDIT_BLOCKED_SESSIONS_EXIST' IN v_update) > 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_CONTENT_STAFF_EDIT_GATE_MISSING';
  END IF;

  IF position('INSERT INTO public.question_revisions' IN v_update) = 0
     OR position('SET status=''SUPERSEDED''' IN v_update) = 0
     OR position('SET status=''draft''' IN v_update) = 0
     OR position('ministerial_question_update' IN v_update) = 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_CORRECTION_REVISION_GUARD_MISSING';
  END IF;

  IF position('MINISTERIAL_DELETE_BLOCKED_SESSIONS_EXIST' IN v_delete) = 0
     OR position('can_publish_ministerial_exams(v_actor)' IN v_delete) = 0
     OR position('can_publish_ministerial_exams(v_actor)' IN v_publish) = 0 THEN
    RAISE EXCEPTION 'MINISTERIAL_DELETE_OR_PUBLISH_GATE_WIDENED';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.ministerial_model_questions_admin_list(uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.ministerial_model_question_update(uuid,uuid,text,jsonb,text,text,text,integer,numeric,text,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'MINISTERIAL_CONTENT_STAFF_EDIT_ANON_PRIVILEGE_LEAK';
  END IF;
END
$proof$;

COMMIT;
