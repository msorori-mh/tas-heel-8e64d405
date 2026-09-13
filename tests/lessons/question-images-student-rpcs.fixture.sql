-- Exact existing student access and publication gates, read-only baseline from the original app.
CREATE OR REPLACE FUNCTION public.get_lesson_official_questions(_lesson_id uuid)
 RETURNS TABLE(id uuid, question_text text, options jsonb, question_type text, sort_order integer, revision_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_lesson(_lesson_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT q.id,
         r.question_text,
         COALESCE((
           SELECT jsonb_agg(
             jsonb_build_object(
               'id', o.option_code,
               'text', o.body,
               'sortOrder', o.sort_order
             ) ORDER BY o.sort_order
           )
             FROM public.question_options o
            WHERE o.question_revision_id = r.id
         ), '[]'::jsonb),
         q.question_type,
         COALESCE(q.sort_order, 0),
         r.id
    FROM public.questions q
    JOIN public.question_revisions r
      ON r.id = q.current_published_revision_id
     AND r.question_id = q.id
     AND r.status = 'PUBLISHED'
     AND r.educational_label = 'OFFICIAL_BOOK_QUESTION'
   WHERE (
         q.lesson_id = _lesson_id
         OR EXISTS (
           SELECT 1
             FROM public.question_targets qt
            WHERE qt.question_id = q.id
              AND qt.target_type = 'LESSON'
              AND qt.lesson_id = _lesson_id
         )
       )
     AND NOT EXISTS (
       SELECT 1
         FROM public.lesson_capability_lifecycle lcl
        WHERE lcl.lesson_id = _lesson_id
          AND lcl.capability = 'checkUnderstanding'
          AND (lcl.status <> 'READY' OR lcl.applicability = 'NA')
     )
   ORDER BY q.sort_order, q.id;
END;
$function$
;
REVOKE ALL ON FUNCTION public.get_lesson_official_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lesson_official_questions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_lesson_self_test_questions(_lesson_id uuid)
 RETURNS TABLE(id uuid, question_text text, options jsonb, question_type text, sort_order integer, revision_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_lesson(_lesson_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT q.id,
         r.question_text,
         COALESCE((
           SELECT jsonb_agg(
             jsonb_build_object(
               'id', o.option_code,
               'text', o.body,
               'sortOrder', o.sort_order
             ) ORDER BY o.sort_order
           )
             FROM public.question_options o
            WHERE o.question_revision_id = r.id
         ), '[]'::jsonb),
         q.question_type,
         COALESCE(q.sort_order, 0),
         r.id
    FROM public.questions q
    JOIN public.question_revisions r
      ON r.id = q.current_published_revision_id
     AND r.question_id = q.id
     AND r.status = 'PUBLISHED'
     AND r.educational_label = 'SELF_TEST'
     AND r.interaction_type = 'SINGLE_CHOICE'
     AND r.grading_mode = 'AUTO_SINGLE'
   WHERE (
         q.lesson_id = _lesson_id
         OR EXISTS (
           SELECT 1
             FROM public.question_targets qt
            WHERE qt.question_id = q.id
              AND qt.target_type = 'LESSON'
              AND qt.lesson_id = _lesson_id
         )
       )
     AND NOT EXISTS (
       SELECT 1
         FROM public.lesson_capability_lifecycle lcl
        WHERE lcl.lesson_id = _lesson_id
          AND lcl.capability = 'lessonAssessment'
          AND (lcl.status <> 'READY' OR lcl.applicability = 'NA')
     )
   ORDER BY q.sort_order, q.id;
END;
$function$
;
REVOKE ALL ON FUNCTION public.get_lesson_self_test_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lesson_self_test_questions(uuid) TO authenticated;

