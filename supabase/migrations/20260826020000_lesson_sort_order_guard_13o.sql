-- LESSON_SORT_ORDER_GUARD_13O
-- Keep the authoritative positive-order invariant while making every lesson
-- creation path (manual and Excel import) safe when order is omitted or <= 0.

ALTER TABLE public.lessons
  ALTER COLUMN sort_order SET DEFAULT 1;

CREATE OR REPLACE FUNCTION public.assign_positive_lesson_sort_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sort_order IS NULL OR NEW.sort_order <= 0 THEN
    SELECT COALESCE(MAX(l.sort_order), 0) + 1
      INTO NEW.sort_order
      FROM public.lessons AS l
     WHERE l.subject_id = NEW.subject_id
       AND l.unit_id IS NOT DISTINCT FROM NEW.unit_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lessons_assign_positive_sort_order_trg ON public.lessons;

CREATE TRIGGER lessons_assign_positive_sort_order_trg
BEFORE INSERT ON public.lessons
FOR EACH ROW
EXECUTE FUNCTION public.assign_positive_lesson_sort_order();

COMMENT ON FUNCTION public.assign_positive_lesson_sort_order() IS
  '13O: assigns the next positive lesson order when manual or Excel intake supplies NULL/zero/negative order.';
