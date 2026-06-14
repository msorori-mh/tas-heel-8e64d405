
-- ============================================================
-- 1) SUBJECTS: restrict SELECT to authenticated users only
-- ============================================================
DROP POLICY IF EXISTS "Subjects viewable per curriculum" ON public.subjects;

CREATE POLICY "Subjects viewable per curriculum" ON public.subjects
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR curriculum_track_id IS NULL
    OR curriculum_track_id = (
      SELECT p.curriculum_track_id FROM public.profiles p
      WHERE p.user_id = auth.uid()
    )
  );

-- ============================================================
-- 2) LESSONS: add generated existence flags + column-level SELECT
--    (video_url / content_pdf_url no longer readable by students)
-- ============================================================
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS has_video boolean
    GENERATED ALWAYS AS (video_url IS NOT NULL) STORED;

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS has_content_pdf boolean
    GENERATED ALWAYS AS (content_pdf_url IS NOT NULL) STORED;

-- Revoke table-level SELECT and re-grant only safe columns to authenticated.
REVOKE SELECT ON public.lessons FROM authenticated;
REVOKE SELECT ON public.lessons FROM anon;

GRANT SELECT (
  id, subject_id, slug, title, duration, content_text,
  is_free, sort_order, created_at, updated_at, semester, unit_id,
  has_video, has_content_pdf
) ON public.lessons TO authenticated;

-- service_role keeps full access (GRANT ALL on table).
GRANT ALL ON public.lessons TO service_role;

-- ============================================================
-- 3) Admin RPC to read URL fields (admins only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_lesson_media_urls(_lesson_id uuid)
RETURNS TABLE (video_url text, content_pdf_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.video_url, l.content_pdf_url
  FROM public.lessons l
  WHERE l.id = _lesson_id
    AND public.has_role(auth.uid(), 'admin'::app_role);
$$;
REVOKE ALL ON FUNCTION public.admin_get_lesson_media_urls(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_lesson_media_urls(uuid) TO authenticated;

-- ============================================================
-- 4) Student-safe RPC for lesson extras
--    Returns external (https) video URL only; storage paths stay hidden.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_lesson_safe_extras(_lesson_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  has_video boolean,
  has_content_pdf boolean,
  external_video_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.title,
    (l.video_url IS NOT NULL),
    (l.content_pdf_url IS NOT NULL),
    CASE
      WHEN l.video_url ~ '^https?://'
        AND l.video_url NOT LIKE '%supabase%'
        AND l.video_url NOT LIKE 'supabase-storage://%'
      THEN l.video_url
      ELSE NULL
    END
  FROM public.lessons l
  WHERE l.id = _lesson_id
    AND public.can_access_lesson(l.id);
$$;
REVOKE ALL ON FUNCTION public.get_lesson_safe_extras(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_lesson_safe_extras(uuid) TO authenticated;

-- ============================================================
-- 5) STORAGE: tighten lesson media access policy
--    Remove loose suffix-match (LIKE '%' || name). Keep only
--    '/'-anchored matches so a file name cannot collide with an
--    unrelated lesson's URL.
-- ============================================================
DROP POLICY IF EXISTS "Students can read lesson media with lesson access" ON storage.objects;

CREATE POLICY "Students can read lesson media with lesson access" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    (bucket_id = ANY (ARRAY['lesson-pdfs'::text, 'lesson-videos'::text]))
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.lessons l
        WHERE can_access_lesson(l.id)
          AND (
            l.video_url LIKE ('%/' || objects.name)
            OR l.content_pdf_url LIKE ('%/' || objects.name)
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.lesson_resources lr
        WHERE can_access_lesson(lr.lesson_id)
          AND lr.url LIKE ('%/' || objects.name)
      )
      OR EXISTS (
        SELECT 1 FROM public.lesson_book_contents lbc
        WHERE can_access_lesson(lbc.lesson_id)
          AND lbc.pdf_url LIKE ('%/' || objects.name)
      )
    )
  );
