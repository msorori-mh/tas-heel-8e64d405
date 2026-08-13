CREATE OR REPLACE FUNCTION public.admin_curriculum_delete_preview(
  _entity_type text,
  _entity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lesson_ids uuid[] := '{}';
  unit_ids uuid[] := '{}';
  question_ids uuid[] := '{}';
  assessment_ids uuid[] := '{}';
  label text;
  counts jsonb;
  blockers text[] := '{}';
  n int;
BEGIN
  IF NOT public.is_content_staff(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN: content staff only';
  END IF;

  IF _entity_type NOT IN ('subject','unit','lesson','question','exam_template') THEN
    RAISE EXCEPTION 'UNSUPPORTED_ENTITY_TYPE: %', _entity_type;
  END IF;

  IF _entity_type = 'subject' THEN
    SELECT s.name INTO label FROM public.subjects s WHERE s.id = _entity_id;
    IF label IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: subject %', _entity_id; END IF;
    SELECT coalesce(array_agg(u.id), '{}') INTO unit_ids FROM public.units u WHERE u.subject_id = _entity_id;
    SELECT coalesce(array_agg(l.id), '{}') INTO lesson_ids FROM public.lessons l WHERE l.subject_id = _entity_id;
    SELECT coalesce(array_agg(q.id), '{}') INTO question_ids
      FROM public.questions q
      WHERE q.subject_id = _entity_id OR q.lesson_id = ANY(lesson_ids);

  ELSIF _entity_type = 'unit' THEN
    SELECT u.title INTO label FROM public.units u WHERE u.id = _entity_id;
    IF label IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: unit %', _entity_id; END IF;
    unit_ids := ARRAY[_entity_id];
    SELECT coalesce(array_agg(l.id), '{}') INTO lesson_ids FROM public.lessons l WHERE l.unit_id = _entity_id;
    SELECT coalesce(array_agg(q.id), '{}') INTO question_ids
      FROM public.questions q WHERE q.lesson_id = ANY(lesson_ids);

  ELSIF _entity_type = 'lesson' THEN
    SELECT l.title INTO label FROM public.lessons l WHERE l.id = _entity_id;
    IF label IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: lesson %', _entity_id; END IF;
    lesson_ids := ARRAY[_entity_id];
    SELECT coalesce(array_agg(q.id), '{}') INTO question_ids
      FROM public.questions q WHERE q.lesson_id = _entity_id;

  ELSIF _entity_type = 'question' THEN
    SELECT left(q.question_text, 80) INTO label FROM public.questions q WHERE q.id = _entity_id;
    IF label IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: question %', _entity_id; END IF;
    question_ids := ARRAY[_entity_id];

  ELSE
    SELECT t.title INTO label FROM public.exam_templates t WHERE t.id = _entity_id;
    IF label IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: exam_template %', _entity_id; END IF;
  END IF;

  SELECT coalesce(array_agg(a.id), '{}') INTO assessment_ids
    FROM public.lesson_assessments a WHERE a.lesson_id = ANY(lesson_ids);

  counts := jsonb_build_object(
    'subjects',                CASE WHEN _entity_type = 'subject' THEN 1 ELSE 0 END,
    'units',                   coalesce(array_length(unit_ids, 1), 0),
    'lessons',                 coalesce(array_length(lesson_ids, 1), 0),
    'lesson_book_contents',    (SELECT count(*) FROM public.lesson_book_contents x WHERE x.lesson_id = ANY(lesson_ids)),
    'lesson_summaries',        (SELECT count(*) FROM public.lesson_summaries x WHERE x.lesson_id = ANY(lesson_ids)),
    'lesson_explanations',     (SELECT count(*) FROM public.lesson_explanations x WHERE x.lesson_id = ANY(lesson_ids)),
    'lesson_resources',        (SELECT count(*) FROM public.lesson_resources x WHERE x.lesson_id = ANY(lesson_ids)),
    'lesson_assessments',      coalesce(array_length(assessment_ids, 1), 0),
    'assessment_questions',    (SELECT count(*) FROM public.assessment_questions x
                                 WHERE x.assessment_id = ANY(assessment_ids) OR x.question_id = ANY(question_ids)),
    'questions',               coalesce(array_length(question_ids, 1), 0),
    'question_revisions',      (SELECT count(*) FROM public.question_revisions x WHERE x.question_id = ANY(question_ids)),
    'question_targets',        (SELECT count(*) FROM public.question_targets x WHERE x.question_id = ANY(question_ids)),
    'question_options',        (SELECT count(*) FROM public.question_options x WHERE x.question_id = ANY(question_ids)),
    'exam_templates',          CASE WHEN _entity_type = 'exam_template' THEN 1 ELSE 0 END,
    'exam_template_questions', (SELECT count(*) FROM public.exam_template_questions x
                                 WHERE x.question_id = ANY(question_ids)
                                    OR (_entity_type = 'exam_template' AND x.template_id = _entity_id))
  );

  SELECT count(*) INTO n FROM public.user_progress x WHERE x.lesson_id = ANY(lesson_ids);
  IF n > 0 THEN blockers := blockers || format('STUDENT_PROGRESS:%s', n); END IF;

  SELECT count(*) INTO n FROM public.certificates c
    WHERE c.subject_id = _entity_id AND _entity_type = 'subject';
  IF n > 0 THEN blockers := blockers || format('CERTIFICATES:%s', n); END IF;

  SELECT count(*) INTO n FROM public.exam_sessions s
    WHERE (_entity_type = 'exam_template' AND s.template_id = _entity_id);
  IF n > 0 THEN blockers := blockers || format('EXAM_SESSIONS:%s', n); END IF;

  SELECT count(*) INTO n FROM public.exam_session_questions x
    WHERE x.logical_question_id = ANY(question_ids);
  IF n > 0 THEN blockers := blockers || format('EXAM_SESSION_SNAPSHOTS:%s', n); END IF;

  SELECT count(*) INTO n FROM public.exam_session_answers x
    WHERE x.question_id = ANY(question_ids);
  IF n > 0 THEN blockers := blockers || format('EXAM_SESSION_ANSWERS:%s', n); END IF;

  SELECT count(*) INTO n FROM public.practice_attempt_questions x
    WHERE x.logical_question_id = ANY(question_ids);
  IF n > 0 THEN blockers := blockers || format('PRACTICE_SNAPSHOTS:%s', n); END IF;

  SELECT count(*) INTO n FROM public.unit_practice_attempts x WHERE x.unit_id = ANY(unit_ids);
  IF n > 0 THEN blockers := blockers || format('UNIT_PRACTICE_ATTEMPTS:%s', n); END IF;

  SELECT count(*) INTO n FROM public.questions q
    WHERE q.id = ANY(question_ids) AND q.current_published_revision_id IS NOT NULL;
  IF n > 0 THEN blockers := blockers || format('PUBLISHED_QUESTION_REVISIONS:%s', n); END IF;

  SELECT count(*) INTO n FROM public.exam_template_questions x
    WHERE x.question_id = ANY(question_ids)
      AND _entity_type <> 'exam_template';
  IF n > 0 THEN blockers := blockers || format('REFERENCED_BY_EXAM_TEMPLATES:%s', n); END IF;

  RETURN jsonb_build_object(
    'entity_type', _entity_type,
    'entity_id', _entity_id,
    'label', label,
    'counts', counts,
    'blockers', to_jsonb(blockers),
    'deletable', (array_length(blockers, 1) IS NULL)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_curriculum_delete_preview(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_curriculum_delete_preview(text, uuid) TO authenticated;