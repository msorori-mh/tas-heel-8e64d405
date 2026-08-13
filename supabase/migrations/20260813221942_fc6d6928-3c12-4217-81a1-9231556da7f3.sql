-- ─────────────────────────────────────────────────────────────
-- 12C.3 (DB layer): natural-code immutability + guarded delete
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_natural_code_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  col text := TG_ARGV[0];
  old_code text;
  new_code text;
BEGIN
  EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', col, col)
    INTO old_code, new_code
    USING OLD, NEW;

  IF old_code IS NOT NULL AND new_code IS DISTINCT FROM old_code THEN
    RAISE EXCEPTION
      'NATURAL_CODE_IMMUTABLE: %.% cannot change (% -> %). Codes are import/idempotency keys.',
      TG_TABLE_NAME, col, old_code, coalesce(new_code, 'NULL');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_natural_code_immutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS subjects_code_immutable_trg ON public.subjects;
CREATE TRIGGER subjects_code_immutable_trg BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.assert_natural_code_immutable('code');

DROP TRIGGER IF EXISTS units_code_immutable_trg ON public.units;
CREATE TRIGGER units_code_immutable_trg BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.assert_natural_code_immutable('code');

DROP TRIGGER IF EXISTS lessons_code_immutable_trg ON public.lessons;
CREATE TRIGGER lessons_code_immutable_trg BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.assert_natural_code_immutable('slug');

DROP TRIGGER IF EXISTS lesson_explanations_code_immutable_trg ON public.lesson_explanations;
CREATE TRIGGER lesson_explanations_code_immutable_trg BEFORE UPDATE ON public.lesson_explanations
  FOR EACH ROW EXECUTE FUNCTION public.assert_natural_code_immutable('explanation_code');

DROP TRIGGER IF EXISTS lesson_resources_code_immutable_trg ON public.lesson_resources;
CREATE TRIGGER lesson_resources_code_immutable_trg BEFORE UPDATE ON public.lesson_resources
  FOR EACH ROW EXECUTE FUNCTION public.assert_natural_code_immutable('resource_code');

DROP TRIGGER IF EXISTS lesson_assessments_code_immutable_trg ON public.lesson_assessments;
CREATE TRIGGER lesson_assessments_code_immutable_trg BEFORE UPDATE ON public.lesson_assessments
  FOR EACH ROW EXECUTE FUNCTION public.assert_natural_code_immutable('assessment_code');

DROP TRIGGER IF EXISTS questions_code_immutable_trg ON public.questions;
CREATE TRIGGER questions_code_immutable_trg BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.assert_natural_code_immutable('code');

DROP TRIGGER IF EXISTS exam_templates_code_immutable_trg ON public.exam_templates;
CREATE TRIGGER exam_templates_code_immutable_trg BEFORE UPDATE ON public.exam_templates
  FOR EACH ROW EXECUTE FUNCTION public.assert_natural_code_immutable('code');

-- Also protect subjects.group_code (stable machine identity per 12C.4).
CREATE OR REPLACE FUNCTION public.assert_subject_group_code_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.group_code IS NOT NULL AND NEW.group_code IS DISTINCT FROM OLD.group_code THEN
    RAISE EXCEPTION 'GROUP_CODE_IMMUTABLE: subjects.group_code cannot change (% -> %)',
      OLD.group_code, coalesce(NEW.group_code, 'NULL');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_subject_group_code_immutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS subjects_group_code_immutable_trg ON public.subjects;
CREATE TRIGGER subjects_group_code_immutable_trg BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.assert_subject_group_code_immutable();

-- ── Delete impact preview (read-only) ────────────────────────

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

  ELSE -- exam_template
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

  -- ── Fail-closed blockers: activity or publication ⇒ archive, never delete
  SELECT count(*) INTO n FROM public.user_progress x WHERE x.lesson_id = ANY(lesson_ids);
  IF n > 0 THEN blockers := blockers || format('STUDENT_PROGRESS:%s', n); END IF;

  SELECT count(*) INTO n FROM public.certificates c
    WHERE c.subject_id = _entity_id AND _entity_type = 'subject';
  IF n > 0 THEN blockers := blockers || format('CERTIFICATES:%s', n); END IF;

  SELECT count(*) INTO n FROM public.exam_sessions s
    WHERE (_entity_type = 'exam_template' AND s.template_id = _entity_id);
  IF n > 0 THEN blockers := blockers || format('EXAM_SESSIONS:%s', n); END IF;

  SELECT count(*) INTO n FROM public.exam_session_questions x WHERE x.question_id = ANY(question_ids);
  IF n > 0 THEN blockers := blockers || format('EXAM_SESSION_SNAPSHOTS:%s', n); END IF;

  SELECT count(*) INTO n FROM public.practice_attempt_questions x WHERE x.question_id = ANY(question_ids);
  IF n > 0 THEN blockers := blockers || format('PRACTICE_SNAPSHOTS:%s', n); END IF;

  SELECT count(*) INTO n FROM public.unit_practice_attempts x WHERE x.unit_id = ANY(unit_ids);
  IF n > 0 THEN blockers := blockers || format('UNIT_PRACTICE_ATTEMPTS:%s', n); END IF;

  SELECT count(*) INTO n FROM public.questions q
    WHERE q.id = ANY(question_ids) AND q.current_published_revision_id IS NOT NULL;
  IF n > 0 THEN blockers := blockers || format('PUBLISHED_QUESTION_REVISIONS:%s', n); END IF;

  SELECT count(*) INTO n FROM public.exam_template_questions x
    WHERE x.question_id = ANY(question_ids)
      AND _entity_type <> 'exam_template'
      AND EXISTS (SELECT 1 FROM public.exam_templates t WHERE t.id = x.template_id AND t.id NOT IN (SELECT id FROM public.exam_templates WHERE false));
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

-- ── Atomic guarded delete (full admin only) ──────────────────

CREATE OR REPLACE FUNCTION public.admin_curriculum_delete(
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
BEGIN
  IF NOT public.is_full_admin(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN: full admin only';
  END IF;

  preview := public.admin_curriculum_delete_preview(_entity_type, _entity_id);

  IF NOT (preview->>'deletable')::boolean THEN
    RAISE EXCEPTION 'DELETE_BLOCKED: % — archive instead. blockers=%',
      _entity_type, preview->'blockers';
  END IF;

  IF _entity_type = 'subject' THEN
    SELECT coalesce(array_agg(u.id), '{}') INTO unit_ids FROM public.units u WHERE u.subject_id = _entity_id;
    SELECT coalesce(array_agg(l.id), '{}') INTO lesson_ids FROM public.lessons l WHERE l.subject_id = _entity_id;
    SELECT coalesce(array_agg(q.id), '{}') INTO question_ids FROM public.questions q
      WHERE q.subject_id = _entity_id OR q.lesson_id = ANY(lesson_ids);
  ELSIF _entity_type = 'unit' THEN
    unit_ids := ARRAY[_entity_id];
    SELECT coalesce(array_agg(l.id), '{}') INTO lesson_ids FROM public.lessons l WHERE l.unit_id = _entity_id;
    SELECT coalesce(array_agg(q.id), '{}') INTO question_ids FROM public.questions q WHERE q.lesson_id = ANY(lesson_ids);
  ELSIF _entity_type = 'lesson' THEN
    lesson_ids := ARRAY[_entity_id];
    SELECT coalesce(array_agg(q.id), '{}') INTO question_ids FROM public.questions q WHERE q.lesson_id = _entity_id;
  ELSIF _entity_type = 'question' THEN
    question_ids := ARRAY[_entity_id];
  END IF;

  SELECT coalesce(array_agg(a.id), '{}') INTO assessment_ids
    FROM public.lesson_assessments a WHERE a.lesson_id = ANY(lesson_ids);

  -- reverse dependency order, one transaction
  DELETE FROM public.assessment_questions
    WHERE assessment_id = ANY(assessment_ids) OR question_id = ANY(question_ids);
  DELETE FROM public.exam_template_questions
    WHERE question_id = ANY(question_ids)
       OR (_entity_type = 'exam_template' AND template_id = _entity_id);

  IF _entity_type = 'exam_template' THEN
    DELETE FROM public.exam_templates WHERE id = _entity_id;
  END IF;

  IF array_length(question_ids, 1) IS NOT NULL THEN
    UPDATE public.questions SET current_published_revision_id = NULL WHERE id = ANY(question_ids);
    DELETE FROM public.question_solution_steps
      WHERE solution_id IN (SELECT id FROM public.question_solutions WHERE question_id = ANY(question_ids));
    DELETE FROM public.question_solutions WHERE question_id = ANY(question_ids);
    DELETE FROM public.question_accepted_answers WHERE question_id = ANY(question_ids);
    DELETE FROM public.question_media WHERE question_id = ANY(question_ids);
    DELETE FROM public.question_options WHERE question_id = ANY(question_ids);
    DELETE FROM public.question_targets WHERE question_id = ANY(question_ids);
    DELETE FROM public.question_revisions WHERE question_id = ANY(question_ids);
    DELETE FROM public.questions WHERE id = ANY(question_ids);
  END IF;

  IF array_length(lesson_ids, 1) IS NOT NULL THEN
    DELETE FROM public.lesson_assessments WHERE lesson_id = ANY(lesson_ids);
    DELETE FROM public.lesson_resources WHERE lesson_id = ANY(lesson_ids);
    DELETE FROM public.lesson_explanations WHERE lesson_id = ANY(lesson_ids);
    DELETE FROM public.lesson_book_contents WHERE lesson_id = ANY(lesson_ids);
    DELETE FROM public.lesson_summaries WHERE lesson_id = ANY(lesson_ids);
    DELETE FROM public.lesson_simulations WHERE lesson_id = ANY(lesson_ids);
    DELETE FROM public.lesson_comments WHERE lesson_id = ANY(lesson_ids);
    DELETE FROM public.lessons WHERE id = ANY(lesson_ids);
  END IF;

  IF _entity_type IN ('subject','unit') AND array_length(unit_ids, 1) IS NOT NULL THEN
    DELETE FROM public.units WHERE id = ANY(unit_ids);
  END IF;

  IF _entity_type = 'subject' THEN
    DELETE FROM public.subjects WHERE id = _entity_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(),
    'curriculum_hard_delete',
    _entity_type,
    _entity_id,
    jsonb_build_object('preview', preview, 'reason', _reason)
  );

  RETURN jsonb_build_object('deleted', true, 'preview', preview);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_curriculum_delete(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_curriculum_delete(text, uuid, text) TO authenticated;