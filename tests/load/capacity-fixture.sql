-- TEST_ONLY isolated database. Never apply this fixture to a shared database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;
CREATE TYPE public.app_role AS ENUM ('admin','content_manager','student');
CREATE TABLE public.user_roles(user_id uuid, role app_role);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,grade_uuid uuid,grade_id text,curriculum_track_id uuid);
CREATE TABLE public.subjects(id uuid PRIMARY KEY,name text,grade_id uuid);
CREATE TABLE public.subject_curriculum_tracks(subject_id uuid,curriculum_track_id uuid,is_active boolean);
CREATE TABLE public.lessons(id uuid PRIMARY KEY,subject_id uuid REFERENCES subjects(id),title text,sort_order integer);
CREATE TABLE public.lesson_capability_lifecycle(lesson_id uuid,capability text,status text,PRIMARY KEY(lesson_id,capability));
CREATE TABLE public.golden_lesson_domain_materializations(lesson_id uuid);
CREATE TABLE public.lesson_book_contents(id uuid PRIMARY KEY,lesson_id uuid REFERENCES lessons(id),content text,updated_at timestamptz DEFAULT now());
CREATE TABLE public.lesson_explanations(id uuid PRIMARY KEY,lesson_id uuid REFERENCES lessons(id),content text);
CREATE TABLE public.lesson_summaries(id uuid PRIMARY KEY,lesson_id uuid REFERENCES lessons(id),summary text);
CREATE TABLE public.lesson_resources(id uuid PRIMARY KEY,lesson_id uuid REFERENCES lessons(id),description text);
CREATE FUNCTION public.has_role(_user_id uuid,_role app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND role=_role)
$$;
CREATE FUNCTION public.is_content_staff(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT has_role(_user_id,'admin') OR has_role(_user_id,'content_manager')
$$;
-- Production access/visibility bodies at 571a25ba, with fixture tables only.
CREATE FUNCTION public.can_access_subject(_subject_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND (
   has_role(auth.uid(),'admin') OR EXISTS (
     SELECT 1 FROM subjects s JOIN profiles p ON p.user_id=auth.uid()
       JOIN subject_curriculum_tracks sct ON sct.subject_id=s.id AND sct.is_active
        AND sct.curriculum_track_id=p.curriculum_track_id
      WHERE s.id=_subject_id AND (p.grade_uuid=s.grade_id OR p.grade_id=s.grade_id::text)))
$$;
CREATE FUNCTION public.lesson_is_editorially_managed(_lesson_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM lesson_capability_lifecycle WHERE lesson_id=_lesson_id)
 OR EXISTS(SELECT 1 FROM golden_lesson_domain_materializations WHERE lesson_id=_lesson_id)
$$;
CREATE FUNCTION public.lesson_student_visible(_lesson_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN NOT lesson_is_editorially_managed(_lesson_id) THEN true
 ELSE EXISTS(SELECT 1 FROM lesson_capability_lifecycle WHERE lesson_id=_lesson_id AND status='READY') END
$$;
CREATE FUNCTION public.can_access_lesson(_lesson_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM lessons l WHERE l.id=_lesson_id AND can_access_subject(l.subject_id))
 AND (is_content_staff(auth.uid()) OR lesson_student_visible(_lesson_id))
$$;
CREATE FUNCTION public.lesson_capability_ready(_lesson_id uuid,_capability text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM lesson_capability_lifecycle WHERE lesson_id=_lesson_id AND capability=_capability AND status='READY')
$$;
CREATE FUNCTION public.lesson_student_content_gate(_lesson_id uuid)
RETURNS TABLE(lesson_id uuid,managed boolean,visible boolean,ready_capabilities text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT _lesson_id,lesson_is_editorially_managed(_lesson_id),lesson_student_visible(_lesson_id),
 CASE WHEN lesson_student_visible(_lesson_id) THEN
 COALESCE((SELECT array_agg(capability ORDER BY capability) FROM lesson_capability_lifecycle WHERE lesson_id=_lesson_id AND status='READY'),ARRAY[]::text[]) ELSE ARRAY[]::text[] END
$$;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT,UPDATE,DELETE ON lessons,lesson_book_contents TO authenticated;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Subjects readable" ON subjects FOR SELECT TO authenticated USING (true);
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lessons viewable per access" ON lessons FOR SELECT TO authenticated USING (can_access_lesson(id));
CREATE POLICY "Content staff manage lessons" ON lessons FOR ALL TO authenticated USING (is_content_staff(auth.uid()));
ALTER TABLE lesson_book_contents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Book content viewable per capability" ON lesson_book_contents FOR SELECT TO authenticated USING (can_access_lesson(lesson_id) AND (is_content_staff(auth.uid()) OR lesson_capability_ready(lesson_id,'officialBookContent')));
CREATE POLICY "Content staff manage book contents" ON lesson_book_contents FOR ALL TO authenticated USING (is_content_staff(auth.uid()));

INSERT INTO subjects SELECT ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'TEST_ONLY subject '||i,
 ('20000000-0000-4000-8000-'||lpad((i%2)::text,12,'0'))::uuid FROM generate_series(1,44) i;
INSERT INTO subject_curriculum_tracks SELECT id,'30000000-0000-4000-8000-000000000001',true FROM subjects;
INSERT INTO profiles VALUES
 ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,'30000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000000',null,'30000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001',null,'30000000-0000-4000-8000-000000000002');
INSERT INTO user_roles VALUES ('00000000-0000-4000-8000-000000000003','admin'),('00000000-0000-4000-8000-000000000004','content_manager');
INSERT INTO lessons SELECT ('40000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 ('10000000-0000-4000-8000-'||lpad(((i-1)%44+1)::text,12,'0'))::uuid,'TEST_ONLY lesson '||i,i FROM generate_series(1,1458) i;
INSERT INTO lesson_capability_lifecycle SELECT id,'officialBookContent',CASE WHEN sort_order%5=0 THEN 'DRAFT' ELSE 'READY' END FROM lessons;
INSERT INTO lesson_book_contents SELECT id,id,'<html dir="rtl"><body>TEST_ONLY '||repeat('محتوى ',100)||'</body></html>',now() FROM lessons WHERE sort_order<=478;
INSERT INTO lesson_explanations SELECT id,id,'<html>TEST_ONLY explanation</html>' FROM lessons WHERE sort_order<=30;
INSERT INTO lesson_summaries SELECT id,id,'TEST_ONLY summary' FROM lessons WHERE sort_order<=30;
INSERT INTO lesson_resources SELECT id,id,'<html>TEST_ONLY resource</html>' FROM lessons WHERE sort_order<=30;
-- Also retain legacy visibility and ledger-only managed/invisible behavior.
DELETE FROM lesson_capability_lifecycle WHERE lesson_id IN ('40000000-0000-4000-8000-000000001457','40000000-0000-4000-8000-000000001456');
INSERT INTO golden_lesson_domain_materializations VALUES ('40000000-0000-4000-8000-000000001456');
ANALYZE;
