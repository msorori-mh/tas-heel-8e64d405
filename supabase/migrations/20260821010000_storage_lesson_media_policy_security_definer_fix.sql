-- Forward remediation: keep lesson table privileges fail-closed while allowing
-- unrelated storage policies (including golden-lesson-intake) to be planned.
--
-- The previous storage.objects policy referenced public.lessons directly. Because
-- authenticated intentionally has no table-level SELECT on lessons, PostgreSQL
-- rejected every storage SELECT while planning the combined policy expression.

BEGIN;

CREATE OR REPLACE FUNCTION public.can_read_lesson_media_storage_object(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      WHERE public.can_access_lesson(l.id)
        AND (
          l.video_url LIKE ('%/' || _object_name)
          OR l.content_pdf_url LIKE ('%/' || _object_name)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.lesson_resources lr
      WHERE public.can_access_lesson(lr.lesson_id)
        AND lr.url LIKE ('%/' || _object_name)
    )
    OR EXISTS (
      SELECT 1
      FROM public.lesson_book_contents lbc
      WHERE public.can_access_lesson(lbc.lesson_id)
        AND lbc.pdf_url LIKE ('%/' || _object_name)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_lesson_media_storage_object(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_lesson_media_storage_object(text) TO authenticated;

DROP POLICY IF EXISTS "Students can read lesson media with lesson access" ON storage.objects;
CREATE POLICY "Students can read lesson media with lesson access"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = ANY (ARRAY['lesson-pdfs'::text, 'lesson-videos'::text])
  AND public.can_read_lesson_media_storage_object(name)
);

COMMIT;
