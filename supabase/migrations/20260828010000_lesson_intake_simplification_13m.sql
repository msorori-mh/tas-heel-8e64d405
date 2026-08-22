-- LESSON_INTAKE_SIMPLIFICATION_13M
-- Reconciles the empty duplicate Iron lesson created by the legacy spreadsheet
-- intake and makes the operational fields required for every future lesson row.

DO $$
DECLARE
  _canonical constant uuid := '2605302e-e2d3-44c8-9e98-3d02e2ddc2f6';
  _duplicate constant uuid := '5e65ea4a-8266-452f-a38b-9f2ecb9c31c6';
  _canonical_subject uuid;
  _duplicate_subject uuid;
  _reference record;
  _reference_count bigint;
BEGIN
  SELECT subject_id
    INTO _canonical_subject
    FROM public.lessons
   WHERE id = _canonical
   FOR UPDATE;

  SELECT subject_id
    INTO _duplicate_subject
    FROM public.lessons
   WHERE id = _duplicate
   FOR UPDATE;

  IF _canonical_subject IS NULL THEN
    RAISE EXCEPTION 'IRON_CANONICAL_LESSON_NOT_FOUND';
  END IF;

  -- The cleanup is idempotent: a missing duplicate means an earlier run already
  -- reconciled it.
  IF _duplicate_subject IS NOT NULL THEN
    IF _duplicate_subject <> _canonical_subject THEN
      RAISE EXCEPTION 'IRON_DUPLICATE_SUBJECT_MISMATCH';
    END IF;

    FOR _reference IN
      SELECT c.conrelid::regclass AS table_name, a.attname AS column_name
        FROM pg_constraint c
        JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality) ON true
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attnum = k.attnum
       WHERE c.contype = 'f'
         AND c.confrelid = 'public.lessons'::regclass
    LOOP
      EXECUTE format(
        'select count(*) from %s where %I = $1',
        _reference.table_name,
        _reference.column_name
      )
      INTO _reference_count
      USING _duplicate;

      IF _reference_count > 0 THEN
        RAISE EXCEPTION
          'IRON_DUPLICATE_HAS_DEPENDENCIES: %.% = %',
          _reference.table_name,
          _reference.column_name,
          _reference_count;
      END IF;
    END LOOP;

    DELETE FROM public.lessons WHERE id = _duplicate;
  END IF;

  UPDATE public.lessons
     SET title = 'الحديد',
         semester = COALESCE(NULLIF(semester, 0), 1),
         sort_order = COALESCE(NULLIF(sort_order, 0), 4),
         updated_at = now()
   WHERE id = _canonical;
END;
$$;

ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_semester_required_chk,
  DROP CONSTRAINT IF EXISTS lessons_sort_order_positive_chk;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_semester_required_chk
    CHECK (semester IN (1, 2)) NOT VALID,
  ADD CONSTRAINT lessons_sort_order_positive_chk
    CHECK (sort_order > 0) NOT VALID;

ALTER TABLE public.lessons VALIDATE CONSTRAINT lessons_semester_required_chk;
ALTER TABLE public.lessons VALIDATE CONSTRAINT lessons_sort_order_positive_chk;

COMMENT ON CONSTRAINT lessons_semester_required_chk ON public.lessons IS
  'Lesson intake must persist an explicit semester; the UI derives legacy defaults before upload.';
COMMENT ON CONSTRAINT lessons_sort_order_positive_chk ON public.lessons IS
  'Lesson ordering is one-based and must be positive.';
