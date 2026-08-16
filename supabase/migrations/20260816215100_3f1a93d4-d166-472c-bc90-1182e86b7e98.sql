-- 18E1 — UNIT MODEL CORRECTION (Quran, grade 10)
--
-- The six "units" created during 18E are display sections x semesters
-- (الحفظ والتفسير / علوم القرآن / التلاوة / التجويد duplicated per semester),
-- not official curriculum units. The correct model for this subject is a flat
-- lesson list: lessons.unit_id = NULL.
--
-- This migration ONLY:
--   1. rebinds the 40 Quran lessons to unit_id = NULL
--   2. deletes the six now-orphan Quran units
-- It never deletes/recreates lessons, never touches slugs, sort_order,
-- resources, RLS or grants, and aborts if any dependent row exists.

DO $$
DECLARE
  v_subject uuid;
  v_units uuid[];
  v_lessons_before int;
  v_lessons_rebound int;
  v_dependents int;
  v_units_deleted int;
BEGIN
  SELECT id INTO v_subject FROM public.subjects WHERE id = '1234e882-b0b2-499a-bd66-f91f480e1081';
  IF v_subject IS NULL THEN
    RAISE EXCEPTION '18E1: Quran subject not found';
  END IF;

  SELECT array_agg(id ORDER BY sort_order) INTO v_units
  FROM public.units WHERE subject_id = v_subject;

  IF v_units IS NULL OR array_length(v_units, 1) <> 6 THEN
    RAISE EXCEPTION '18E1: expected exactly 6 erroneous Quran units, found %',
      coalesce(array_length(v_units, 1), 0);
  END IF;

  SELECT count(*) INTO v_lessons_before FROM public.lessons WHERE subject_id = v_subject;
  IF v_lessons_before <> 40 THEN
    RAISE EXCEPTION '18E1: expected 40 Quran lessons, found %', v_lessons_before;
  END IF;

  -- No lesson from another subject may hang off these units.
  SELECT count(*) INTO v_dependents
  FROM public.lessons WHERE unit_id = ANY (v_units) AND subject_id <> v_subject;
  IF v_dependents <> 0 THEN
    RAISE EXCEPTION '18E1: foreign lessons attached to Quran units: %', v_dependents;
  END IF;

  -- No student / assessment dependency may exist on these units.
  SELECT (SELECT count(*) FROM public.unit_practice_attempts WHERE unit_id = ANY (v_units))
       + (SELECT count(*) FROM public.practice_attempts WHERE unit_id = ANY (v_units))
       + (SELECT count(*) FROM public.exam_templates WHERE unit_id = ANY (v_units))
       + (SELECT count(*) FROM public.question_targets WHERE unit_id = ANY (v_units))
    INTO v_dependents;
  IF v_dependents <> 0 THEN
    RAISE EXCEPTION '18E1: unit dependents present (%), refusing correction', v_dependents;
  END IF;

  UPDATE public.lessons
     SET unit_id = NULL
   WHERE subject_id = v_subject AND unit_id IS NOT NULL;
  GET DIAGNOSTICS v_lessons_rebound = ROW_COUNT;

  -- Prove orphan state before removing the units.
  SELECT count(*) INTO v_dependents FROM public.lessons WHERE unit_id = ANY (v_units);
  IF v_dependents <> 0 THEN
    RAISE EXCEPTION '18E1: units still referenced by % lessons', v_dependents;
  END IF;

  DELETE FROM public.units WHERE id = ANY (v_units);
  GET DIAGNOSTICS v_units_deleted = ROW_COUNT;

  IF v_units_deleted <> 6 THEN
    RAISE EXCEPTION '18E1: expected to remove 6 units, removed %', v_units_deleted;
  END IF;

  IF (SELECT count(*) FROM public.lessons WHERE subject_id = v_subject) <> 40 THEN
    RAISE EXCEPTION '18E1: lesson count changed during correction';
  END IF;

  RAISE NOTICE '18E1 unit correction: lessons_rebound=%, units_deleted=%',
    v_lessons_rebound, v_units_deleted;
END;
$$;