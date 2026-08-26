-- Runs only after the Content V3 disposable PG17 rehearsal.
-- Proves that a source mutation closes exactly its own component.
DO $$
DECLARE
  v_actor uuid := '11000000-0000-0000-0000-000000000001';
  v_subject uuid := '22000000-0000-0000-0000-000000000001';
  v_lesson uuid := '33000000-0000-0000-0000-000000000001';
  v_other_ready_before integer;
  v_other_ready_after integer;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_actor) ON CONFLICT DO NOTHING;
  INSERT INTO public.subjects (id, code, name)
  VALUES (v_subject, 'IND-PUB', 'Independent publication fixture')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.lessons (id, subject_id, slug, title, is_free)
  VALUES (v_lesson, v_subject, 'independent-publication', 'Independent publication', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.lesson_capability_lifecycle (
    lesson_id,
    capability,
    status,
    applicability,
    ready_by,
    ready_at
  )
  VALUES
    (v_lesson, 'officialBookContent', 'READY', 'REQUIRED', v_actor, now()),
    (v_lesson, 'quickReview', 'READY', 'REQUIRED', v_actor, now())
  ON CONFLICT (lesson_id, capability) DO UPDATE
    SET status = 'READY',
        applicability = 'REQUIRED',
        ready_by = v_actor,
        ready_at = now();

  INSERT INTO public.lesson_summaries (lesson_id, summary)
  VALUES (v_lesson, 'published summary');

  -- The insert trigger must immediately close only quickReview.
  IF NOT EXISTS (
    SELECT 1
      FROM public.lesson_capability_lifecycle
     WHERE lesson_id = v_lesson
       AND capability = 'quickReview'
       AND status = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'MUTATED_COMPONENT_NOT_DRAFT';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.lesson_capability_lifecycle
     WHERE lesson_id = v_lesson
       AND capability = 'officialBookContent'
       AND status = 'READY'
  ) THEN
    RAISE EXCEPTION 'UNRELATED_COMPONENT_STATUS_CHANGED';
  END IF;

  SELECT count(*)
    INTO v_other_ready_before
    FROM public.lesson_capability_lifecycle
   WHERE lesson_id = v_lesson
     AND capability <> 'quickReview'
     AND status = 'READY';

  UPDATE public.lesson_summaries
     SET summary = summary || ' [independent-publication-pg17]'
   WHERE lesson_id = v_lesson;

  SELECT count(*)
    INTO v_other_ready_after
    FROM public.lesson_capability_lifecycle
   WHERE lesson_id = v_lesson
     AND capability <> 'quickReview'
     AND status = 'READY';

  IF v_other_ready_after <> v_other_ready_before THEN
    RAISE EXCEPTION 'UNRELATED_COMPONENT_COUNT_CHANGED before=% after=%',
      v_other_ready_before, v_other_ready_after;
  END IF;

  RAISE NOTICE 'INDEPENDENT_COMPONENT_PUBLICATION_PG17=PASS lesson=%', v_lesson;
END;
$$;
