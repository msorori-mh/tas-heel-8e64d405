-- Fix self-test publication replay, correct-option materialisation, and safe item editing.

DO $migration$
DECLARE
  v_oid oid;
  v_def text;
  v_before text;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'lesson_component_publish_questions_v2'
    AND pg_get_function_identity_arguments(p.oid) =
      '_lesson_id uuid, _lesson_code text, _subject_id uuid, _capability text, _payload jsonb, _answers jsonb, _source_sha256 text, _actor_id uuid';

  IF v_oid IS NULL OR to_regprocedure('public.normalize_content_code(text)') IS NULL THEN
    RAISE EXCEPTION 'SELF_TEST_FIX_REQUIRED_FUNCTION_MISSING';
  END IF;

  v_def := pg_get_functiondef(v_oid);
  v_before := v_def;
  v_def := replace(
    v_def,
    'assessment_code=upper(_lesson_code)||''-SELFTEST''',
    'assessment_code=public.normalize_content_code(_lesson_code||''-SELFTEST'')'
  );
  v_def := replace(
    v_def,
    'VALUES (_lesson_id,''اختبر فهمك'',NULL,0,upper(_lesson_code)||''-SELFTEST'')',
    'VALUES (_lesson_id,''اختبر فهمك'',NULL,0,public.normalize_content_code(_lesson_code||''-SELFTEST''))'
  );

  IF v_def = v_before
     OR position('assessment_code=upper(_lesson_code)||''-SELFTEST''' in v_def) > 0
     OR position('NULL,0,upper(_lesson_code)||''-SELFTEST''' in v_def) > 0 THEN
    RAISE EXCEPTION 'SELF_TEST_FIX_PUBLISHER_SHAPE_UNEXPECTED';
  END IF;
  EXECUTE v_def;
END
$migration$;

CREATE OR REPLACE FUNCTION public.sync_self_test_correct_option()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.why_correct IS NOT NULL THEN
    UPDATE public.question_options
       SET is_correct = (option_code = NEW.option_id)
     WHERE question_revision_id = NEW.question_revision_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_self_test_correct_option ON public.question_option_rationales;
CREATE TRIGGER trg_sync_self_test_correct_option
AFTER INSERT OR UPDATE OF option_id, why_correct ON public.question_option_rationales
FOR EACH ROW EXECUTE FUNCTION public.sync_self_test_correct_option();

REVOKE ALL ON FUNCTION public.sync_self_test_correct_option() FROM PUBLIC, anon, authenticated;

-- Repair through new immutable revisions. Existing revisions and attempt snapshots stay untouched.
DO $repair$
DECLARE
  v record;
  v_new_revision uuid;
  v_revision_number integer;
  v_actor uuid;
  v_correct_order integer;
BEGIN
  PERFORM set_config('tamkeen.lesson_component_v2_write', 'on', true);
  FOR v IN
    SELECT qr.*, correct.correct_option_id
    FROM public.questions q
    JOIN public.question_revisions qr ON qr.id = q.current_published_revision_id
    JOIN LATERAL (
      SELECT min(r.option_id) AS correct_option_id
      FROM public.question_option_rationales r
      WHERE r.question_revision_id = qr.id AND r.why_correct IS NOT NULL
      HAVING count(*) = 1
    ) correct ON true
    WHERE qr.educational_label = 'SELF_TEST'
      AND qr.status = 'PUBLISHED'
      AND (SELECT count(*) FROM public.question_options qo
           WHERE qo.question_revision_id = qr.id AND qo.is_correct) <> 1
    FOR UPDATE OF q, qr
  LOOP
    v_actor := coalesce(v.published_by, v.created_by);
    SELECT coalesce(max(revision_number), 0) + 1 INTO v_revision_number
    FROM public.question_revisions WHERE question_id = v.question_id;

    INSERT INTO public.question_revisions(
      question_id, revision_number, status, interaction_type, grading_mode,
      educational_label, question_text, stimulus_text, max_score, allow_partial,
      requires_media, manual_grading_required, payload_hash_version,
      source_payload_hash, backfill_version, created_by
    ) VALUES (
      v.question_id, v_revision_number, 'DRAFT', v.interaction_type, v.grading_mode,
      v.educational_label, v.question_text, v.stimulus_text, v.max_score, v.allow_partial,
      v.requires_media, v.manual_grading_required, v.payload_hash_version,
      v.source_payload_hash, 'self_test_correct_option_v1', v_actor
    ) RETURNING id INTO v_new_revision;

    INSERT INTO public.question_options(question_revision_id, option_code, body, sort_order, is_correct)
    SELECT v_new_revision, option_code, body, sort_order, option_code = v.correct_option_id
    FROM public.question_options WHERE question_revision_id = v.id;
    INSERT INTO public.question_targets(
      question_id, revision_id, target_type, subject_id, unit_id, lesson_id, is_primary, created_by
    )
    SELECT question_id, v_new_revision, target_type, subject_id, unit_id, lesson_id, is_primary, created_by
    FROM public.question_targets WHERE revision_id = v.id;
    INSERT INTO public.question_media(
      question_revision_id, media_code, storage_path, mime_type, file_size, sha256,
      alt_text_ar, caption, sort_order, requires_media, created_by
    )
    SELECT v_new_revision, media_code, storage_path, mime_type, file_size, sha256,
      alt_text_ar, caption, sort_order, requires_media, created_by
    FROM public.question_media WHERE question_revision_id = v.id;
    INSERT INTO public.question_accepted_answers(
      question_revision_id, answer_text, normalized_answer, normalization_policy,
      is_primary, sort_order
    )
    SELECT v_new_revision, answer_text, normalized_answer, normalization_policy,
      is_primary, sort_order
    FROM public.question_accepted_answers WHERE question_revision_id = v.id;
    INSERT INTO public.official_question_answers(question_id, revision_id, model_answer, explanation)
    SELECT question_id, v_new_revision, model_answer, explanation
    FROM public.official_question_answers WHERE revision_id = v.id;
    INSERT INTO public.question_option_rationales(
      question_id, question_revision_id, option_id, why_correct, why_wrong
    )
    SELECT question_id, v_new_revision, option_id, why_correct, why_wrong
    FROM public.question_option_rationales WHERE question_revision_id = v.id;

    UPDATE public.question_revisions
    SET payload_hash = public._qb_compute_revision_payload_hash(v_new_revision)
    WHERE id = v_new_revision;
    UPDATE public.questions SET current_published_revision_id = NULL WHERE id = v.question_id;
    UPDATE public.question_revisions
    SET status = 'SUPERSEDED', superseded_at = now() WHERE id = v.id;
    UPDATE public.question_revisions
    SET status = 'APPROVED', reviewed_at = now(), reviewed_by = v_actor
    WHERE id = v_new_revision;
    UPDATE public.question_revisions
    SET status = 'PUBLISHED', published_at = now(), published_by = v_actor
    WHERE id = v_new_revision;
    SELECT sort_order INTO v_correct_order
    FROM public.question_options
    WHERE question_revision_id = v_new_revision AND is_correct;
    UPDATE public.questions
    SET current_published_revision_id = v_new_revision, correct_index = v_correct_order
    WHERE id = v.question_id;

    INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
    VALUES (v_actor, 'lesson_self_test_correct_option_repair', 'question', v.question_id,
      jsonb_build_object('old_revision_id', v.id, 'new_revision_id', v_new_revision));
  END LOOP;
END
$repair$;

CREATE OR REPLACE FUNCTION public.lesson_self_test_questions_admin_list(_lesson_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'SELF_TEST_ADMIN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'question_id', q.id,
    'revision_id', qr.id,
    'question_code', q.code,
    'question_text', qr.question_text,
    'display_order', aq.sort_order,
    'options', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'option_code', qo.option_code,
        'body', qo.body,
        'is_correct', qo.is_correct
      ) ORDER BY qo.sort_order)
      FROM public.question_options qo
      WHERE qo.question_revision_id = qr.id
    ), '[]'::jsonb),
    'explanation', oqa.explanation
  ) ORDER BY aq.sort_order), '[]'::jsonb)
  INTO v_result
  FROM public.lesson_assessments la
  JOIN public.assessment_questions aq ON aq.assessment_id = la.id
  JOIN public.questions q ON q.id = aq.question_id AND q.archived_at IS NULL
  JOIN public.question_revisions qr ON qr.id = q.current_published_revision_id
  LEFT JOIN public.official_question_answers oqa
    ON oqa.question_id = q.id AND oqa.revision_id = qr.id
  WHERE la.lesson_id = _lesson_id
    AND qr.educational_label = 'SELF_TEST';

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.lesson_self_test_question_update(
  _lesson_id uuid,
  _question_id uuid,
  _question_text text,
  _options jsonb,
  _correct_option_code text,
  _explanation text,
  _display_order integer,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_assessment_id uuid;
  v_old_revision public.question_revisions;
  v_new_revision_id uuid;
  v_revision_number integer;
  v_option jsonb;
  v_option_code text;
  v_option_codes text[] := ARRAY[]::text[];
  v_correct_order integer;
  v_legacy_options jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'SELF_TEST_ADMIN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('tamkeen.lesson_component_v2_write', 'on', true);
  IF nullif(btrim(_question_text), '') IS NULL
     OR nullif(btrim(_explanation), '') IS NULL
     OR nullif(btrim(_reason), '') IS NULL
     OR _display_order < 0
     OR jsonb_typeof(_options) <> 'array'
     OR jsonb_array_length(_options) NOT BETWEEN 2 AND 8 THEN
    RAISE EXCEPTION 'SELF_TEST_QUESTION_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT la.id INTO v_assessment_id
  FROM public.lesson_assessments la
  JOIN public.assessment_questions aq ON aq.assessment_id = la.id
  WHERE la.lesson_id = _lesson_id AND aq.question_id = _question_id
  FOR UPDATE OF la;
  IF v_assessment_id IS NULL THEN
    RAISE EXCEPTION 'SELF_TEST_QUESTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT qr.* INTO v_old_revision
  FROM public.questions q
  JOIN public.question_revisions qr ON qr.id = q.current_published_revision_id
  WHERE q.id = _question_id AND q.lesson_id = _lesson_id
    AND qr.educational_label = 'SELF_TEST'
  FOR UPDATE OF q, qr;
  IF v_old_revision.id IS NULL THEN
    RAISE EXCEPTION 'SELF_TEST_PUBLISHED_REVISION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  FOR v_option IN SELECT value FROM jsonb_array_elements(_options) LOOP
    v_option_code := btrim(coalesce(v_option->>'option_code', ''));
    IF v_option_code = '' OR nullif(btrim(v_option->>'body'), '') IS NULL
       OR v_option_code = ANY(v_option_codes) THEN
      RAISE EXCEPTION 'SELF_TEST_OPTION_INVALID' USING ERRCODE = '22023';
    END IF;
    v_option_codes := array_append(v_option_codes, v_option_code);
  END LOOP;
  IF NOT (btrim(_correct_option_code) = ANY(v_option_codes)) THEN
    RAISE EXCEPTION 'SELF_TEST_CORRECT_OPTION_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(max(revision_number), 0) + 1 INTO v_revision_number
  FROM public.question_revisions WHERE question_id = _question_id;
  INSERT INTO public.question_revisions(
    question_id, revision_number, status, interaction_type, grading_mode,
    educational_label, question_text, max_score, allow_partial, requires_media,
    manual_grading_required, payload_hash_version, source_payload_hash, created_by
  ) VALUES (
    _question_id, v_revision_number, 'DRAFT', 'SINGLE_CHOICE', 'AUTO_SINGLE',
    'SELF_TEST', btrim(_question_text), v_old_revision.max_score, false,
    v_old_revision.requires_media,
    false, 'canonical_payload_v1', v_old_revision.source_payload_hash, v_actor
  ) RETURNING id INTO v_new_revision_id;

  FOR v_option IN SELECT value FROM jsonb_array_elements(_options) WITH ORDINALITY LOOP
    v_option_code := btrim(v_option->>'option_code');
    INSERT INTO public.question_options(question_revision_id, option_code, body, sort_order, is_correct)
    VALUES (
      v_new_revision_id, v_option_code, btrim(v_option->>'body'),
      array_position(v_option_codes, v_option_code) - 1,
      v_option_code = btrim(_correct_option_code)
    );
  END LOOP;

  INSERT INTO public.question_targets(
    question_id, revision_id, target_type, subject_id, unit_id, lesson_id, is_primary, created_by
  )
  SELECT question_id, v_new_revision_id, target_type, subject_id, unit_id, lesson_id,
    is_primary, v_actor
  FROM public.question_targets WHERE revision_id = v_old_revision.id;
  INSERT INTO public.question_media(
    question_revision_id, media_code, storage_path, mime_type, file_size, sha256,
    alt_text_ar, caption, sort_order, requires_media, created_by
  )
  SELECT v_new_revision_id, media_code, storage_path, mime_type, file_size, sha256,
    alt_text_ar, caption, sort_order, requires_media, v_actor
  FROM public.question_media WHERE question_revision_id = v_old_revision.id;

  INSERT INTO public.official_question_answers(question_id, revision_id, model_answer, explanation)
  VALUES (_question_id, v_new_revision_id, btrim(_correct_option_code), btrim(_explanation));
  INSERT INTO public.question_option_rationales(
    question_id, question_revision_id, option_id, why_correct, why_wrong
  ) VALUES (_question_id, v_new_revision_id, btrim(_correct_option_code), btrim(_explanation), NULL);

  UPDATE public.question_revisions
  SET payload_hash = public._qb_compute_revision_payload_hash(v_new_revision_id)
  WHERE id = v_new_revision_id;
  UPDATE public.questions SET current_published_revision_id = NULL WHERE id = _question_id;
  UPDATE public.question_revisions
  SET status = 'SUPERSEDED', superseded_at = now()
  WHERE id = v_old_revision.id;
  UPDATE public.question_revisions
  SET status = 'APPROVED', reviewed_at = now(), reviewed_by = v_actor
  WHERE id = v_new_revision_id;
  UPDATE public.question_revisions
  SET status = 'PUBLISHED', published_at = now(), published_by = v_actor
  WHERE id = v_new_revision_id;

  SELECT jsonb_agg(value->>'body' ORDER BY ordinality),
         min(ordinality - 1) FILTER (WHERE value->>'option_code' = btrim(_correct_option_code))
  INTO v_legacy_options, v_correct_order
  FROM jsonb_array_elements(_options) WITH ORDINALITY;
  UPDATE public.questions
  SET question_text = btrim(_question_text), options = v_legacy_options,
      correct_index = v_correct_order, explanation = btrim(_explanation),
      sort_order = _display_order, current_published_revision_id = v_new_revision_id
  WHERE id = _question_id;
  UPDATE public.assessment_questions
  SET sort_order = _display_order
  WHERE assessment_id = v_assessment_id AND question_id = _question_id;

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (v_actor, 'lesson_self_test_question_update', 'question', _question_id,
    jsonb_build_object('lesson_id', _lesson_id, 'old_revision_id', v_old_revision.id,
      'new_revision_id', v_new_revision_id, 'reason', btrim(_reason)));
  RETURN jsonb_build_object('question_id', _question_id, 'revision_id', v_new_revision_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.lesson_self_test_question_delete(
  _lesson_id uuid,
  _question_id uuid,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_assessment_id uuid;
  v_revision_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.is_content_staff(v_actor) THEN
    RAISE EXCEPTION 'SELF_TEST_ADMIN_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(_reason), '') IS NULL THEN
    RAISE EXCEPTION 'SELF_TEST_DELETE_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('tamkeen.lesson_component_v2_write', 'on', true);

  SELECT la.id, q.current_published_revision_id
  INTO v_assessment_id, v_revision_id
  FROM public.lesson_assessments la
  JOIN public.assessment_questions aq ON aq.assessment_id = la.id
  JOIN public.questions q ON q.id = aq.question_id
  WHERE la.lesson_id = _lesson_id AND q.id = _question_id
  FOR UPDATE OF la, q;
  IF v_assessment_id IS NULL THEN
    RAISE EXCEPTION 'SELF_TEST_QUESTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF (SELECT count(*) FROM public.assessment_questions WHERE assessment_id = v_assessment_id) <= 1 THEN
    RAISE EXCEPTION 'SELF_TEST_DELETE_LAST_USE_COMPONENT_DELETE' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.assessment_questions
  WHERE assessment_id = v_assessment_id AND question_id = _question_id;
  UPDATE public.questions
  SET current_published_revision_id = NULL, archived_at = now(), archived_by = v_actor
  WHERE id = _question_id;
  UPDATE public.question_revisions
  SET status = 'SUPERSEDED', superseded_at = now()
  WHERE id = v_revision_id AND status = 'PUBLISHED';

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (v_actor, 'lesson_self_test_question_delete', 'question', _question_id,
    jsonb_build_object('lesson_id', _lesson_id, 'revision_id', v_revision_id,
      'reason', btrim(_reason)));
  RETURN jsonb_build_object('question_id', _question_id, 'deleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.lesson_self_test_questions_admin_list(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lesson_self_test_question_update(uuid,uuid,text,jsonb,text,text,integer,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lesson_self_test_question_delete(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lesson_self_test_questions_admin_list(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lesson_self_test_question_update(uuid,uuid,text,jsonb,text,text,integer,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lesson_self_test_question_delete(uuid,uuid,text) TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.question_revisions qr
    WHERE qr.educational_label = 'SELF_TEST'
      AND qr.status = 'PUBLISHED'
      AND EXISTS (
        SELECT 1 FROM public.question_option_rationales qor
        WHERE qor.question_revision_id = qr.id AND qor.why_correct IS NOT NULL
      )
      AND (SELECT count(*) FROM public.question_options qo
           WHERE qo.question_revision_id = qr.id AND qo.is_correct) <> 1
  ) THEN
    RAISE EXCEPTION 'SELF_TEST_CORRECT_OPTION_POSTVERIFY_FAILED';
  END IF;
END;
$$;
