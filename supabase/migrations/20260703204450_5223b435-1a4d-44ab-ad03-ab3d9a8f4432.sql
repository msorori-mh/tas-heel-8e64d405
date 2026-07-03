-- CONTENT-MANAGER-RBAC-01A: content-staff helpers + RLS
CREATE OR REPLACE FUNCTION public.is_full_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'admin'::public.app_role); $$;

CREATE OR REPLACE FUNCTION public.is_content_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_full_admin(_user_id)
      OR public.has_role(_user_id, 'content_manager'::public.app_role);
$$;

REVOKE ALL ON FUNCTION public.is_full_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_full_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_full_admin(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_content_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_content_staff(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_content_staff(uuid) TO authenticated;

DROP POLICY IF EXISTS "Admins can manage grades" ON public.grades;
CREATE POLICY "Content staff manage grades" ON public.grades FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage subjects" ON public.subjects;
CREATE POLICY "Content staff manage subjects" ON public.subjects FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage lessons" ON public.lessons;
CREATE POLICY "Content staff manage lessons" ON public.lessons FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage questions" ON public.questions;
CREATE POLICY "Content staff manage questions" ON public.questions FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage tracks" ON public.curriculum_tracks;
CREATE POLICY "Content staff manage tracks" ON public.curriculum_tracks FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage governorates" ON public.governorates;
CREATE POLICY "Content staff manage governorates" ON public.governorates FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage map" ON public.governorate_curriculum_map;
CREATE POLICY "Content staff manage map" ON public.governorate_curriculum_map FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage units" ON public.units;
CREATE POLICY "Content staff manage units" ON public.units FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage book contents" ON public.lesson_book_contents;
CREATE POLICY "Content staff manage book contents" ON public.lesson_book_contents FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage explanations" ON public.lesson_explanations;
CREATE POLICY "Content staff manage explanations" ON public.lesson_explanations FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage assessments" ON public.lesson_assessments;
CREATE POLICY "Content staff manage assessments" ON public.lesson_assessments FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage resources" ON public.lesson_resources;
CREATE POLICY "Content staff manage resources" ON public.lesson_resources FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage assessment questions" ON public.assessment_questions;
CREATE POLICY "Content staff manage assessment questions" ON public.assessment_questions FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage simulations" ON public.lesson_simulations;
CREATE POLICY "Content staff manage simulations" ON public.lesson_simulations FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

CREATE POLICY "Content staff manage summaries" ON public.lesson_summaries FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read active templates" ON public.exam_templates;
CREATE POLICY "Authenticated can read active templates" ON public.exam_templates FOR SELECT TO authenticated
  USING (is_active = true OR public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage templates" ON public.exam_templates;
CREATE POLICY "Content staff manage templates" ON public.exam_templates FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read questions of active templates" ON public.exam_template_questions;
CREATE POLICY "Authenticated can read questions of active templates" ON public.exam_template_questions FOR SELECT TO authenticated
  USING (
    public.is_content_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.exam_templates t WHERE t.id = template_id AND t.is_active = true)
  );

DROP POLICY IF EXISTS "Admins manage template questions" ON public.exam_template_questions;
CREATE POLICY "Content staff manage template questions" ON public.exam_template_questions FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage import jobs" ON public.import_jobs;
CREATE POLICY "Content staff manage import jobs" ON public.import_jobs FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid()))
  WITH CHECK (
    public.is_content_staff(auth.uid())
    AND (public.is_full_admin(auth.uid()) OR import_type <> 'config')
  );

DROP POLICY IF EXISTS "Admins manage import errors" ON public.import_errors;
CREATE POLICY "Content staff manage import errors" ON public.import_errors FOR ALL TO authenticated
  USING (public.is_content_staff(auth.uid())) WITH CHECK (public.is_content_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.admin_get_lesson_media_urls(_lesson_id uuid)
RETURNS TABLE (video_url text, content_pdf_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.video_url, l.content_pdf_url FROM public.lessons l
  WHERE l.id = _lesson_id AND public.is_content_staff(auth.uid());
$$;
REVOKE ALL ON FUNCTION public.admin_get_lesson_media_urls(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_lesson_media_urls(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_lesson_media_urls(uuid) TO authenticated;

DROP POLICY IF EXISTS "Admins manage lesson files - select" ON storage.objects;
CREATE POLICY "Content staff manage lesson files - select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('lesson-pdfs', 'lesson-videos') AND public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage lesson files - insert" ON storage.objects;
CREATE POLICY "Content staff manage lesson files - insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('lesson-pdfs', 'lesson-videos') AND public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage lesson files - update" ON storage.objects;
CREATE POLICY "Content staff manage lesson files - update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('lesson-pdfs', 'lesson-videos') AND public.is_content_staff(auth.uid()))
  WITH CHECK (bucket_id IN ('lesson-pdfs', 'lesson-videos') AND public.is_content_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage lesson files - delete" ON storage.objects;
CREATE POLICY "Content staff manage lesson files - delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('lesson-pdfs', 'lesson-videos') AND public.is_content_staff(auth.uid()));