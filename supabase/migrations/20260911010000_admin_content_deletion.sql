-- ADMIN-CONTENT-DELETE-03
-- Full-admin-only deletion for experimental lesson content.
-- A component deletion withdraws only the active materialisation and preserves
-- immutable publication receipts. A lesson deletion remains an exact, audited,
-- single-transaction purge and now understands the V2 publication tables.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_delete_lesson_component(
  _lesson_id uuid,
  _capability text,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_lesson public.lessons;
  v_lifecycle text;
  v_question_prefix text;
  v_question_ids uuid[] := '{}';
  v_deleted integer := 0;
  v_archived integer := 0;
  v_rc integer;
BEGIN
  IF v_actor IS NULL OR NOT public.is_full_admin(v_actor) THEN
    RAISE EXCEPTION 'ADMIN_CONTENT_DELETE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 4 THEN
    RAISE EXCEPTION 'ADMIN_CONTENT_DELETE_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF _capability NOT IN (
    'officialBookContent','tamkeenExplanationHtml','lessonSummaryHtml',
    'mindMapHtml','labExperimentHtml','officialBookQuestions','selfTest'
  ) THEN
    RAISE EXCEPTION 'ADMIN_CONTENT_DELETE_CAPABILITY_INVALID: %', _capability
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_lesson_id::text || ':' || _capability, 0));
  SELECT * INTO v_lesson FROM public.lessons WHERE id = _lesson_id FOR UPDATE;
  IF v_lesson.id IS NULL THEN
    RAISE EXCEPTION 'ADMIN_CONTENT_DELETE_LESSON_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_lifecycle := public.lesson_component_v2_lifecycle(_capability);
  PERFORM public.cf11_open_revocation_ticket(_lesson_id, v_actor, gen_random_uuid());
  PERFORM set_config('tamkeen.lesson_component_v2_write', 'on', true);

  IF _capability = 'officialBookContent' THEN
    DELETE FROM public.lesson_book_contents WHERE lesson_id = _lesson_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  ELSIF _capability = 'tamkeenExplanationHtml' THEN
    DELETE FROM public.lesson_explanations WHERE lesson_id = _lesson_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  ELSIF _capability = 'lessonSummaryHtml' THEN
    DELETE FROM public.lesson_summaries WHERE lesson_id = _lesson_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  ELSIF _capability IN ('mindMapHtml','labExperimentHtml') THEN
    DELETE FROM public.lesson_resources
     WHERE lesson_id = _lesson_id
       AND (
         resource_code = upper(v_lesson.slug) || CASE _capability
           WHEN 'mindMapHtml' THEN '-MINDMAP' ELSE '-EXPERIMENT' END
         OR resource_type::text = CASE _capability
           WHEN 'mindMapHtml' THEN 'mindmap' ELSE 'experiment' END
       );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  ELSE
    v_question_prefix := upper(v_lesson.slug) || CASE _capability
      WHEN 'officialBookQuestions' THEN '-OFFQ-' ELSE '-SELF-' END;
    SELECT coalesce(array_agg(DISTINCT q.id), '{}') INTO v_question_ids
      FROM public.questions q
      LEFT JOIN public.question_revisions r ON r.question_id = q.id
     WHERE q.lesson_id = _lesson_id
       AND (q.code LIKE v_question_prefix || '%'
         OR upper(r.educational_label) = CASE _capability
           WHEN 'officialBookQuestions' THEN 'OFFICIAL_BOOK_QUESTION' ELSE 'SELF_TEST' END);

    IF _capability = 'selfTest' THEN
      DELETE FROM public.assessment_questions aq
       USING public.lesson_assessments a
       WHERE aq.assessment_id = a.id
         AND a.lesson_id = _lesson_id
         AND aq.question_id = ANY(v_question_ids);
      DELETE FROM public.lesson_assessments
       WHERE lesson_id = _lesson_id
         AND assessment_code = upper(v_lesson.slug) || '-SELFTEST';
    END IF;

    UPDATE public.questions
       SET current_published_revision_id = NULL,
           archived_at = now(),
           archived_by = v_actor
     WHERE id = ANY(v_question_ids);
    GET DIAGNOSTICS v_archived = ROW_COUNT;
  END IF;

  DELETE FROM public.lesson_capability_lifecycle
   WHERE lesson_id = _lesson_id AND capability = v_lifecycle;
  PERFORM public.cf11_close_revocation_ticket(_lesson_id);

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (v_actor, 'admin_lesson_component_delete', 'lesson_capability', _lesson_id,
    jsonb_build_object('lesson_id', _lesson_id, 'capability', _capability,
      'lifecycle_capability', v_lifecycle, 'deleted_rows', v_deleted,
      'archived_questions', v_archived, 'reason', btrim(_reason)));

  RETURN jsonb_build_object('deleted', true, 'lesson_id', _lesson_id,
    'capability', _capability, 'deleted_rows', v_deleted,
    'archived_questions', v_archived, 'student_can_see_this_component', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_lesson_component(uuid,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_lesson_component(uuid,text,text)
  TO authenticated;

-- Extend the already-audited prelaunch lesson/unit purge with the publication
-- tables introduced after the original function. The immutable triggers are
-- suspended only while exact rows for the locked lesson set are removed; the
-- surrounding transaction restores them automatically on every failure.
CREATE OR REPLACE FUNCTION public.admin_curriculum_force_delete(
  _entity_type text,
  _entity_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  preview jsonb;
  lesson_ids uuid[] := '{}';
  unit_ids uuid[] := '{}';
  question_ids uuid[] := '{}';
  assessment_ids uuid[] := '{}';
  revision_ids uuid[] := '{}';
  lid uuid;
BEGIN
  IF NOT public.is_full_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN: full admin only'; END IF;
  IF _entity_type NOT IN ('unit','lesson') THEN RAISE EXCEPTION 'UNSUPPORTED_ENTITY_TYPE: %', _entity_type; END IF;
  IF length(btrim(coalesce(_reason,''))) < 4 THEN RAISE EXCEPTION 'DELETE_REASON_REQUIRED'; END IF;
  preview := public.admin_curriculum_delete_preview(_entity_type, _entity_id);
  IF _entity_type='unit' THEN
    unit_ids:=ARRAY[_entity_id];
    SELECT coalesce(array_agg(id),'{}') INTO lesson_ids FROM public.lessons WHERE unit_id=_entity_id;
  ELSE lesson_ids:=ARRAY[_entity_id]; END IF;
  IF coalesce(array_length(lesson_ids,1),0)=0 THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(x::text,0))
    FROM unnest(lesson_ids) AS x;

  SELECT coalesce(array_agg(id),'{}') INTO question_ids FROM public.questions WHERE lesson_id=ANY(lesson_ids);
  SELECT coalesce(array_agg(id),'{}') INTO assessment_ids FROM public.lesson_assessments WHERE lesson_id=ANY(lesson_ids);
  SELECT coalesce(array_agg(id),'{}') INTO revision_ids FROM public.question_revisions WHERE question_id=ANY(question_ids);

  DELETE FROM public.question_response_reviews
   WHERE exam_answer_id IN
    (SELECT id FROM public.exam_session_answers WHERE question_id=ANY(question_ids) OR question_revision_id=ANY(revision_ids))
      OR practice_response_id IN
    (SELECT r.id FROM public.practice_attempt_responses r
      JOIN public.practice_attempt_questions pq ON pq.id=r.practice_attempt_question_id
     WHERE pq.logical_question_id=ANY(question_ids) OR pq.question_revision_id=ANY(revision_ids));
  DELETE FROM public.exam_session_answers WHERE question_id=ANY(question_ids) OR question_revision_id=ANY(revision_ids);
  DELETE FROM public.exam_session_questions WHERE logical_question_id=ANY(question_ids) OR question_revision_id=ANY(revision_ids);
  DELETE FROM public.practice_attempt_responses WHERE practice_attempt_question_id IN
    (SELECT id FROM public.practice_attempt_questions WHERE logical_question_id=ANY(question_ids) OR question_revision_id=ANY(revision_ids));
  DELETE FROM public.practice_attempt_questions WHERE logical_question_id=ANY(question_ids) OR question_revision_id=ANY(revision_ids);
  DELETE FROM public.practice_attempt_responses WHERE practice_attempt_id IN
    (SELECT id FROM public.practice_attempts WHERE unit_id=ANY(unit_ids) OR lesson_assessment_id=ANY(assessment_ids));
  DELETE FROM public.practice_attempt_questions WHERE practice_attempt_id IN
    (SELECT id FROM public.practice_attempts WHERE unit_id=ANY(unit_ids) OR lesson_assessment_id=ANY(assessment_ids));
  DELETE FROM public.practice_attempts WHERE unit_id=ANY(unit_ids) OR lesson_assessment_id=ANY(assessment_ids);
  DELETE FROM public.unit_practice_attempts WHERE unit_id=ANY(unit_ids);
  DELETE FROM public.user_progress WHERE lesson_id=ANY(lesson_ids);
  DELETE FROM public.lesson_comments WHERE lesson_id=ANY(lesson_ids);
  DELETE FROM public.lesson_question_notes WHERE lesson_id=ANY(lesson_ids) OR question_id=ANY(question_ids);
  DELETE FROM public.exam_template_questions WHERE question_id=ANY(question_ids);
  DELETE FROM public.ministerial_exam_questions
   WHERE question_id=ANY(question_ids) OR published_revision_id=ANY(revision_ids);
  UPDATE public.exam_templates SET lesson_id=NULL WHERE lesson_id=ANY(lesson_ids);
  UPDATE public.exam_templates SET unit_id=NULL WHERE unit_id=ANY(unit_ids);

  ALTER TABLE public.lesson_component_publications_v2 DISABLE TRIGGER trg_lesson_component_publications_v2_immutable;
  ALTER TABLE public.golden_lesson_component_publications DISABLE TRIGGER golden_lesson_component_publications_immutable_row;
  ALTER TABLE public.golden_lesson_ready_attestations DISABLE TRIGGER golden_lesson_ready_attestations_immutable_row;
  ALTER TABLE public.golden_lesson_ready_revocations DISABLE TRIGGER golden_lesson_ready_revocations_immutable_row;
  ALTER TABLE public.golden_lesson_published_assets DISABLE TRIGGER golden_lesson_published_assets_immutable_row;
  ALTER TABLE public.golden_lesson_publications DISABLE TRIGGER golden_lesson_publications_immutable_row;
  ALTER TABLE public.golden_lesson_asset_attestations DISABLE TRIGGER golden_lesson_asset_attestations_immutable_row;
  ALTER TABLE public.golden_lesson_domain_materializations DISABLE TRIGGER golden_materialization_immutable;
  ALTER TABLE public.golden_lesson_identity_bindings DISABLE TRIGGER golden_identity_binding_immutable;

  DELETE FROM public.lesson_component_publications_v2 WHERE lesson_id=ANY(lesson_ids);
  DELETE FROM public.lesson_component_intakes_v2 WHERE lesson_id=ANY(lesson_ids);
  DELETE FROM public.golden_lesson_component_publications WHERE lesson_id=ANY(lesson_ids);
  DELETE FROM public.golden_lesson_ready_revocations WHERE lesson_id=ANY(lesson_ids);
  DELETE FROM public.golden_lesson_ready_attestations WHERE lesson_id=ANY(lesson_ids);
  DELETE FROM public.golden_lesson_published_assets WHERE lesson_id=ANY(lesson_ids);
  DELETE FROM public.golden_lesson_publications WHERE lesson_id=ANY(lesson_ids);
  DELETE FROM public.golden_lesson_asset_attestations WHERE lesson_id=ANY(lesson_ids);
  DELETE FROM public.golden_lesson_domain_materializations WHERE lesson_id=ANY(lesson_ids);
  DELETE FROM public.golden_lesson_identity_rebindings WHERE binding_id IN
    (SELECT id FROM public.golden_lesson_identity_bindings
      WHERE lesson_id=ANY(lesson_ids) OR unit_id=ANY(unit_ids));
  DELETE FROM public.golden_lesson_identity_bindings WHERE lesson_id=ANY(lesson_ids) OR unit_id=ANY(unit_ids);

  ALTER TABLE public.golden_lesson_identity_bindings ENABLE TRIGGER golden_identity_binding_immutable;
  ALTER TABLE public.golden_lesson_domain_materializations ENABLE TRIGGER golden_materialization_immutable;
  ALTER TABLE public.golden_lesson_asset_attestations ENABLE TRIGGER golden_lesson_asset_attestations_immutable_row;
  ALTER TABLE public.golden_lesson_publications ENABLE TRIGGER golden_lesson_publications_immutable_row;
  ALTER TABLE public.golden_lesson_published_assets ENABLE TRIGGER golden_lesson_published_assets_immutable_row;
  ALTER TABLE public.golden_lesson_ready_revocations ENABLE TRIGGER golden_lesson_ready_revocations_immutable_row;
  ALTER TABLE public.golden_lesson_ready_attestations ENABLE TRIGGER golden_lesson_ready_attestations_immutable_row;
  ALTER TABLE public.golden_lesson_component_publications ENABLE TRIGGER golden_lesson_component_publications_immutable_row;
  ALTER TABLE public.lesson_component_publications_v2 ENABLE TRIGGER trg_lesson_component_publications_v2_immutable;

  FOREACH lid IN ARRAY lesson_ids LOOP PERFORM public.cf11_open_revocation_ticket(lid,auth.uid(),gen_random_uuid()); END LOOP;
  DELETE FROM public.lesson_capability_lifecycle WHERE lesson_id=ANY(lesson_ids);
  FOREACH lid IN ARRAY lesson_ids LOOP PERFORM public.cf11_close_revocation_ticket(lid); END LOOP;

  UPDATE public.questions SET current_published_revision_id=NULL WHERE id=ANY(question_ids);
  DELETE FROM public.assessment_questions WHERE assessment_id=ANY(assessment_ids) OR question_id=ANY(question_ids);
  DELETE FROM public.official_question_answers WHERE question_id=ANY(question_ids) OR revision_id=ANY(revision_ids);
  DELETE FROM public.question_option_rationales WHERE question_id=ANY(question_ids) OR question_revision_id=ANY(revision_ids);
  DELETE FROM public.question_solution_steps WHERE solution_id IN
    (SELECT id FROM public.question_solutions WHERE question_revision_id=ANY(revision_ids));
  DELETE FROM public.question_solutions WHERE question_revision_id=ANY(revision_ids);
  DELETE FROM public.question_accepted_answers WHERE question_revision_id=ANY(revision_ids);
  DELETE FROM public.question_media WHERE question_revision_id=ANY(revision_ids);
  DELETE FROM public.question_options WHERE question_revision_id=ANY(revision_ids);
  DELETE FROM public.question_targets WHERE question_id=ANY(question_ids);
  DELETE FROM public.question_revisions WHERE question_id=ANY(question_ids);
  DELETE FROM public.questions WHERE id=ANY(question_ids);
  DELETE FROM public.lesson_assessments WHERE lesson_id=ANY(lesson_ids);
  PERFORM set_config('tamkeen.lesson_component_v2_write','on',true);
  DELETE FROM public.lesson_resources WHERE lesson_id=ANY(lesson_ids);
  DELETE FROM public.lesson_explanations WHERE lesson_id=ANY(lesson_ids);
  DELETE FROM public.lesson_book_contents WHERE lesson_id=ANY(lesson_ids);
  DELETE FROM public.lesson_summaries WHERE lesson_id=ANY(lesson_ids);
  DELETE FROM public.lesson_simulations WHERE lesson_id=ANY(lesson_ids);
  DELETE FROM public.lessons WHERE id=ANY(lesson_ids);
  IF _entity_type='unit' THEN DELETE FROM public.units WHERE id=ANY(unit_ids); END IF;

  INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,metadata)
  VALUES(auth.uid(),'curriculum_prelaunch_force_delete',_entity_type,_entity_id,
    jsonb_build_object('preview',preview,'reason',btrim(_reason),'v2_aware',true));
  RETURN jsonb_build_object('deleted',true,'forced',true,'preview',preview,'v2_aware',true);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_curriculum_force_delete(text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_curriculum_force_delete(text,uuid,text) TO authenticated;

COMMIT;
