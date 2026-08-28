CREATE OR REPLACE FUNCTION public.mark_lesson_component_draft(
  _lesson_id uuid,
  _capability text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  IF _lesson_id IS NULL OR _capability IS NULL THEN
    RETURN;
  END IF;

  IF _capability NOT IN (
    'officialBookContent',
    'tamkeenExplanation',
    'quickReview',
    'mindMap',
    'simulation',
    'checkUnderstanding',
    'lessonAssessment'
  ) THEN
    RAISE EXCEPTION 'INVALID_LESSON_COMPONENT: %', _capability
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.lesson_capability_lifecycle (
    lesson_id,
    capability,
    status,
    draft_updated_at
  )
  VALUES (_lesson_id, _capability, 'DRAFT', now())
  ON CONFLICT (lesson_id, capability) DO UPDATE
    SET status = 'DRAFT',
        draft_updated_at = now(),
        reviewed_by = NULL,
        reviewed_at = NULL,
        updated_at = now();

  -- Keep the last READY snapshot/hash for editorial comparison and rollback,
  -- but DRAFT remains invisible because the student gate checks status=READY.
  IF _actor IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      actor_id,
      action,
      target_type,
      target_id,
      metadata
    )
    VALUES (
      _actor,
      'lesson_component_content_mutated',
      'lesson_component',
      _lesson_id,
      jsonb_build_object(
        'lesson_id', _lesson_id,
        'capability', _capability,
        'resulting_status', 'DRAFT'
      )
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_lesson_component_draft(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_lesson_component_draft(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.guard_direct_lesson_component_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _lesson_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.lesson_id ELSE NEW.lesson_id END;
  _capability text := TG_ARGV[0];
BEGIN
  PERFORM public.mark_lesson_component_draft(_lesson_id, _capability);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_direct_lesson_component_mutation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_direct_lesson_component_mutation()
  TO service_role;

DROP TRIGGER IF EXISTS trg_lesson_book_contents_component_draft
  ON public.lesson_book_contents;
CREATE TRIGGER trg_lesson_book_contents_component_draft
AFTER INSERT OR UPDATE OR DELETE ON public.lesson_book_contents
FOR EACH ROW EXECUTE FUNCTION public.guard_direct_lesson_component_mutation(
  'officialBookContent'
);

DROP TRIGGER IF EXISTS trg_lesson_explanations_component_draft
  ON public.lesson_explanations;
CREATE TRIGGER trg_lesson_explanations_component_draft
AFTER INSERT OR UPDATE OR DELETE ON public.lesson_explanations
FOR EACH ROW EXECUTE FUNCTION public.guard_direct_lesson_component_mutation(
  'tamkeenExplanation'
);

DROP TRIGGER IF EXISTS trg_lesson_summaries_component_draft
  ON public.lesson_summaries;
CREATE TRIGGER trg_lesson_summaries_component_draft
AFTER INSERT OR UPDATE OR DELETE ON public.lesson_summaries
FOR EACH ROW EXECUTE FUNCTION public.guard_direct_lesson_component_mutation(
  'quickReview'
);

DROP TRIGGER IF EXISTS trg_lesson_simulations_component_draft
  ON public.lesson_simulations;
CREATE TRIGGER trg_lesson_simulations_component_draft
AFTER INSERT OR UPDATE OR DELETE ON public.lesson_simulations
FOR EACH ROW EXECUTE FUNCTION public.guard_direct_lesson_component_mutation(
  'simulation'
);

CREATE OR REPLACE FUNCTION public.guard_lesson_resource_component_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _row record;
  _capability text;
BEGIN
  FOR _row IN
    SELECT lesson_id, resource_type, html_resource_type
      FROM (
        SELECT OLD.lesson_id, OLD.resource_type, OLD.html_resource_type
         WHERE TG_OP IN ('UPDATE', 'DELETE')
        UNION
        SELECT NEW.lesson_id, NEW.resource_type, NEW.html_resource_type
         WHERE TG_OP IN ('INSERT', 'UPDATE')
      ) changed
  LOOP
    _capability := CASE
      WHEN lower(coalesce(_row.resource_type::text, '')) = 'mindmap'
        OR lower(coalesce(_row.html_resource_type::text, '')) IN ('mindmap', 'mind_map_html')
        THEN 'mindMap'
      WHEN lower(coalesce(_row.resource_type::text, '')) = 'experiment'
        OR lower(coalesce(_row.html_resource_type::text, '')) IN (
          'experiment',
          'practical_experiment_html'
        )
        THEN 'simulation'
      ELSE NULL
    END;
    PERFORM public.mark_lesson_component_draft(_row.lesson_id, _capability);
  END LOOP;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_lesson_resource_component_mutation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_lesson_resource_component_mutation()
  TO service_role;

DROP TRIGGER IF EXISTS trg_lesson_resources_component_draft
  ON public.lesson_resources;
CREATE TRIGGER trg_lesson_resources_component_draft
AFTER INSERT OR UPDATE OR DELETE ON public.lesson_resources
FOR EACH ROW EXECUTE FUNCTION public.guard_lesson_resource_component_mutation();

-- Question revisions are versioned. Draft/review edits close the corresponding
-- component; the existing explicit publisher is still the only path to READY.
CREATE OR REPLACE FUNCTION public.guard_question_revision_component_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _question_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.question_id ELSE NEW.question_id END;
  _status text := CASE WHEN TG_OP = 'DELETE' THEN OLD.status::text ELSE NEW.status::text END;
  _label text := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.educational_label::text
    ELSE NEW.educational_label::text
  END;
  _lesson_id uuid;
  _capability text;
BEGIN
  IF coalesce(_status, '') = 'PUBLISHED' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT lesson_id INTO _lesson_id
    FROM public.questions
   WHERE id = _question_id;

  _capability := CASE upper(coalesce(_label, ''))
    WHEN 'OFFICIAL_BOOK_QUESTION' THEN 'checkUnderstanding'
    WHEN 'SELF_TEST' THEN 'lessonAssessment'
    ELSE NULL
  END;

  PERFORM public.mark_lesson_component_draft(_lesson_id, _capability);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_question_revision_component_mutation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_question_revision_component_mutation()
  TO service_role;

DROP TRIGGER IF EXISTS trg_question_revisions_component_draft
  ON public.question_revisions;
CREATE TRIGGER trg_question_revisions_component_draft
AFTER INSERT OR UPDATE OR DELETE ON public.question_revisions
FOR EACH ROW EXECUTE FUNCTION public.guard_question_revision_component_mutation();