CREATE OR REPLACE FUNCTION public.can_access_subject(_subject_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1
        FROM public.subjects s
        JOIN public.profiles p ON p.user_id = auth.uid()
        WHERE s.id = _subject_id
          AND (
            p.grade_uuid = s.grade_id
            OR p.grade_id = s.grade_id::text
          )
          AND (
            s.curriculum_track_id IS NULL
            OR (
              p.curriculum_track_id IS NOT NULL
              AND p.curriculum_track_id = s.curriculum_track_id
            )
          )
      )
    )
$function$;

CREATE OR REPLACE FUNCTION public.can_access_lesson(_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.lessons l
      WHERE l.id = _lesson_id
        AND public.can_access_subject(l.subject_id)
    )
$function$;

REVOKE ALL ON FUNCTION public.can_access_subject(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_lesson(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_subject(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_lesson(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_subject(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_lesson(uuid) TO authenticated;