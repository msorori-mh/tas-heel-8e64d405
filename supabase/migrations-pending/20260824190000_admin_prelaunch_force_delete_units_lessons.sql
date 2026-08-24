-- PRELAUNCH-PURGE-01
-- Full-admin-only hard delete for units and lessons imported before launch.
-- Removes dependent activity + golden-lesson ledger rows so legacy imports can be
-- cleaned up. Every call is written to audit_logs. Intended to be revoked after launch.

CREATE OR REPLACE FUNCTION public.admin_curriculum_force_delete(
  _entity_type text,
  _entity_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  preview jsonb;
  lesson_ids uuid[] := '{}';
  unit_ids uuid[] := '{}';
  question_ids uuid[] := '{}';
  assessment_ids uuid[] := '{}';
  revision_ids uuid[] := '{}';
  lid uuid;
BEGIN
  IF NOT public.is_full_admin(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN: full admin only';
  END IF;

  IF _entity_type NOT IN ('unit', 'lesson') THEN
    RAISE EXCEPTION 'UNSUPPORTED_ENTITY_TYPE: %', _entity_type;
  END IF;

  preview := public.admin_curriculum_delete_preview(_entity_type, _entity_id);

  IF _entity_type = 'unit' THEN
    unit_ids := ARRAY[_entity_id];
    SELECT coalesce(array_agg(l.id), '{}') INTO lesson_ids
      FROM public.lessons l WHERE l.unit_id = _entity_id;
  ELSE
    lesson_ids := ARRAY[_entity_id];
  END IF;

  SELECT coalesce(array_agg(q.id), '{}') INTO question_ids
    FROM public.questions q WHERE q.lesson_id = ANY(lesson_ids);

  SELECT coalesce(array_agg(a.id), '{}') INTO assessment_ids
    FROM public.lesson_assessments a WHERE a.lesson_id = ANY(lesson_ids);

  SELECT coalesce(array_agg(r.id), '{}') INTO revision_ids
    FROM public.question_revisions r WHERE r.question_id = ANY(question_ids);

  -- 1) student activity ------------------------------------------------------
  DELETE FROM public.question_response_reviews
    WHERE exam_answer_id IN (
            SELECT id FROM public.exam_session_answers
             WHERE question_id = ANY(question_ids)
                OR question_revision_id = ANY(revision_ids))
       OR practice_response_id IN (
            SELECT r.id FROM public.practice_attempt_responses r
             JOIN public.practice_attempt_questions pq
               ON pq.id = r.practice_attempt_question_id
            WHERE pq.logical_question_id = ANY(question_ids)
               OR pq.question_revision_id = ANY(revision_ids));

  DELETE FROM public.exam_session_answers
    WHERE question_id = ANY(question_ids) OR question_revision_id = ANY(revision_ids);
  DELETE FROM public.exam_session_questions
    WHERE logical_question_id = ANY(question_ids) OR question_revision_id = ANY(revision_ids);

  DELETE FROM public.practice_attempt_responses
    WHERE practice_attempt_question_id IN (
      SELECT id FROM public.practice_attempt_questions
       WHERE logical_question_id = ANY(question_ids)
          OR question_revision_id = ANY(revision_ids));
  DELETE FROM public.practice_attempt_questions
    WHERE logical_question_id = ANY(question_ids) OR question_revision_id = ANY(revision_ids);

  DELETE FROM public.practice_attempt_responses
    WHERE practice_attempt_id IN (
      SELECT id FROM public.practice_attempts
       WHERE unit_id = ANY(unit_ids) OR lesson_assessment_id = ANY(assessment_ids));
  DELETE FROM public.practice_attempt_questions
    WHERE practice_attempt_id IN (
      SELECT id FROM public.practice_attempts
       WHERE unit_id = ANY(unit_ids) OR lesson_assessment_id = ANY(assessment_ids));
  DELETE FROM public.practice_attempts
    WHERE unit_id = ANY(unit_ids) OR lesson_assessment_id = ANY(assessment_ids);

  DELETE FROM public.unit_practice_attempts WHERE unit_id = ANY(unit_ids);
  DELETE FROM public.user_progress WHERE lesson_id = ANY(lesson_ids);
  DELETE FROM public.lesson_comments WHERE lesson_id = ANY(lesson_ids);
  DELETE FROM public.lesson_question_notes
    WHERE lesson_id = ANY(lesson_ids) OR question_id = ANY(question_ids);

  -- 2) exam / ministerial references ----------------------------------------
  DELETE FROM public.exam_template_questions WHERE question_id = ANY(question_ids);
  DELETE FROM public.ministerial_exam_questions
    WHERE question_id = ANY(question_ids) OR published_revision_id = ANY(revision_ids);
  UPDATE public.exam_templates SET lesson_id = NULL WHERE lesson_id = ANY(lesson_ids);
  UPDATE public.exam_templates SET unit_id = NULL WHERE unit_id = ANY(unit_ids);

  -- 3) golden-lesson ledger (immutable by trigger; bypassed for prelaunch purge)
  ALTER TABLE public.golden_lesson_ready_attestations DISABLE TRIGGER golden_lesson_ready_attestations_immutable_row;
  ALTER TABLE public.golden_lesson_published_assets DISABLE TRIGGER golden_lesson_published_assets_immutable_row;
  ALTER TABLE public.golden_lesson_publications DISABLE TRIGGER golden_lesson_publications_immutable_row;

  DELETE FROM public.golden_lesson_ready_revocations WHERE lesson_id = ANY(lesson_ids);
  DELETE FROM public.golden_lesson_ready_attestations WHERE lesson_id = ANY(lesson_ids);
  DELETE FROM public.golden_lesson_published_assets WHERE lesson_id = ANY(lesson_ids);
  DELETE FROM public.golden_lesson_publications WHERE lesson_id = ANY(lesson_ids);
  DELETE FROM public.golden_lesson_asset_attestations WHERE lesson_id = ANY(lesson_ids);
  DELETE FROM public.golden_lesson_domain_materializations WHERE lesson_id = ANY(lesson_ids);
  DELETE FROM public.golden_lesson_identity_bindings
    WHERE lesson_id = ANY(lesson_ids) OR unit_id = ANY(unit_ids);

  ALTER TABLE public.golden_lesson_publications ENABLE TRIGGER golden_lesson_publications_immutable_row;
  ALTER TABLE public.golden_lesson_published_assets ENABLE TRIGGER golden_lesson_published_assets_immutable_row;
  ALTER TABLE public.golden_lesson_ready_attestations ENABLE TRIGGER golden_lesson_ready_attestations_immutable_row;

  -- 4) capability lifecycle (needs an open revocation ticket per lesson)
  FOREACH lid IN ARRAY lesson_ids LOOP
    PERFORM public.cf11_open_revocation_ticket(lid, auth.uid(), gen_random_uuid());
  END LOOP;
  DELETE FROM public.lesson_capability_lifecycle WHERE lesson_id = ANY(lesson_ids);
  FOREACH lid IN ARRAY lesson_ids LOOP
    PERFORM public.cf11_close_revocation_ticket(lid);
  END LOOP;

  -- 5) questions -------------------------------------------------------------
  IF array_length(question_ids, 1) IS NOT NULL THEN
    UPDATE public.questions SET current_published_revision_id = NULL WHERE id = ANY(question_ids);
    DELETE FROM public.assessment_questions
      WHERE assessment_id = ANY(assessment_ids) OR question_id = ANY(question_ids);
    DELETE FROM public.question_solution_steps
      WHERE solution_id IN (SELECT id FROM public.question_solutions WHERE question_revision_id = ANY(revision_ids));
    DELETE FROM public.question_solutions WHERE question_revision_id = ANY(revision_ids);
    DELETE FROM public.question_accepted_answers WHERE question_revision_id = ANY(revision_ids);
    DELETE FROM public.question_option_rationales WHERE question_revision_id = ANY(revision_ids);
    DELETE FROM public.question_media WHERE question_revision_id = ANY(revision_ids);
    DELETE FROM public.question_options WHERE question_revision_id = ANY(revision_ids);
    DELETE FROM public.question_targets WHERE question_id = ANY(question_ids);
    DELETE FROM public.question_revisions WHERE question_id = ANY(question_ids);
    DELETE FROM public.questions WHERE id = ANY(question_ids);
  ELSE
    DELETE FROM public.assessment_questions WHERE assessment_id = ANY(assessment_ids);
  END IF;

  -- 6) lesson + unit content --------------------------------------------------
  DELETE FROM public.lesson_assessments WHERE lesson_id = ANY(lesson_ids);
  DELETE FROM public.lesson_resources WHERE lesson_id = ANY(lesson_ids);
  DELETE FROM public.lesson_explanations WHERE lesson_id = ANY(lesson_ids);
  DELETE FROM public.lesson_book_contents WHERE lesson_id = ANY(lesson_ids);
  DELETE FROM public.lesson_summaries WHERE lesson_id = ANY(lesson_ids);
  DELETE FROM public.lesson_simulations WHERE lesson_id = ANY(lesson_ids);
  DELETE FROM public.lessons WHERE id = ANY(lesson_ids);

  IF _entity_type = 'unit' THEN
    DELETE FROM public.units WHERE id = ANY(unit_ids);
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(),
    'curriculum_prelaunch_force_delete',
    _entity_type,
    _entity_id,
    jsonb_build_object('preview', preview, 'reason', _reason)
  );

  RETURN jsonb_build_object('deleted', true, 'forced', true, 'preview', preview);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_curriculum_force_delete(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_curriculum_force_delete(text, uuid, text) TO authenticated;
