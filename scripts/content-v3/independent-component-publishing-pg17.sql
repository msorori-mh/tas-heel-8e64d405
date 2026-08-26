-- Runs only after the Content V3 disposable PG17 rehearsal.
-- Proves that a source mutation closes exactly its own component.
DO $$
DECLARE
  v_lesson uuid;
  v_other_ready_before integer;
  v_other_ready_after integer;
BEGIN
  SELECT s.lesson_id
    INTO v_lesson
    FROM public.lesson_summaries s
    JOIN public.lesson_capability_lifecycle l
      ON l.lesson_id = s.lesson_id
     AND l.capability = 'quickReview'
     AND l.status = 'READY'
   LIMIT 1;

  IF v_lesson IS NULL THEN
    RAISE EXCEPTION 'INDEPENDENT_COMPONENT_FIXTURE_MISSING';
  END IF;

  SELECT count(*)
    INTO v_other_ready_before
    FROM public.lesson_capability_lifecycle
   WHERE lesson_id = v_lesson
     AND capability <> 'quickReview'
     AND status = 'READY';

  UPDATE public.lesson_summaries
     SET summary = summary || ' [independent-publication-pg17]'
   WHERE ctid = (
     SELECT ctid
       FROM public.lesson_summaries
      WHERE lesson_id = v_lesson
      LIMIT 1
   );

  IF NOT EXISTS (
    SELECT 1
      FROM public.lesson_capability_lifecycle
     WHERE lesson_id = v_lesson
       AND capability = 'quickReview'
       AND status = 'DRAFT'
  ) THEN
    RAISE EXCEPTION 'MUTATED_COMPONENT_NOT_DRAFT';
  END IF;

  SELECT count(*)
    INTO v_other_ready_after
    FROM public.lesson_capability_lifecycle
   WHERE lesson_id = v_lesson
     AND capability <> 'quickReview'
     AND status = 'READY';

  IF v_other_ready_after <> v_other_ready_before THEN
    RAISE EXCEPTION 'UNRELATED_COMPONENT_STATUS_CHANGED before=% after=%',
      v_other_ready_before, v_other_ready_after;
  END IF;

  RAISE NOTICE 'INDEPENDENT_COMPONENT_PUBLICATION_PG17=PASS lesson=%', v_lesson;
END;
$$;
