-- TEST_ONLY extension of capacity-fixture.sql; applied only by the loopback-guarded setup.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
   nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'journey_fixture_only_password';
GRANT anon,authenticated,service_role TO authenticator;
ALTER ROLE authenticated SET statement_timeout='10s';
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;

INSERT INTO auth.users SELECT ('90000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 'test-only-'||i||'@example.invalid' FROM generate_series(1,50000) i;
INSERT INTO auth.users SELECT user_id,'test-only-existing@example.invalid' FROM profiles ON CONFLICT DO NOTHING;
INSERT INTO profiles SELECT id,'20000000-0000-4000-8000-000000000001',NULL,
 '30000000-0000-4000-8000-000000000001' FROM auth.users WHERE id::text LIKE '90000000-%';

ALTER TABLE subjects ADD COLUMN curriculum_track_id uuid DEFAULT '30000000-0000-4000-8000-000000000001',
 ADD COLUMN semester integer DEFAULT 1;
ALTER TABLE lessons ADD COLUMN updated_at timestamptz DEFAULT now();
ALTER TABLE lesson_explanations ADD COLUMN title text, ADD COLUMN sort_order integer DEFAULT 0,
 ADD COLUMN updated_at timestamptz DEFAULT now();
ALTER TABLE lesson_summaries ADD COLUMN updated_at timestamptz DEFAULT now();
ALTER TABLE lesson_resources ADD COLUMN title text, ADD COLUMN url text DEFAULT 'inline://test-only',
 ADD COLUMN resource_type text DEFAULT 'mindmap', ADD COLUMN html_resource_type text DEFAULT 'INTERACTIVE',
 ADD COLUMN metadata jsonb DEFAULT '{}', ADD COLUMN sort_order integer DEFAULT 0,
 ADD COLUMN created_at timestamptz DEFAULT now();
ALTER TABLE lesson_capability_lifecycle ADD COLUMN ready_hash text DEFAULT repeat('a',64),
 ADD COLUMN ready_at timestamptz DEFAULT now();
CREATE TABLE subject_textbooks(id uuid,subject_id uuid,title text,file_size bigint,sha256 text,
 updated_at timestamptz,sort_order integer,is_active boolean,semester integer,curriculum_track_id uuid);
ALTER TABLE subject_textbooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY visible_textbooks ON subject_textbooks FOR SELECT TO authenticated USING(can_access_subject(subject_id));
GRANT SELECT ON subject_textbooks TO authenticated;
ALTER TABLE lesson_explanations ENABLE ROW LEVEL SECURITY;
CREATE POLICY visible_explanations ON lesson_explanations FOR SELECT TO authenticated USING(can_access_lesson(lesson_id));
ALTER TABLE lesson_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY visible_summaries ON lesson_summaries FOR SELECT TO authenticated USING(can_access_lesson(lesson_id));
ALTER TABLE lesson_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY visible_resources ON lesson_resources FOR SELECT TO authenticated USING(can_access_lesson(lesson_id));
ALTER TABLE lesson_capability_lifecycle ENABLE ROW LEVEL SECURITY;
CREATE POLICY visible_lifecycle ON lesson_capability_lifecycle FOR SELECT TO authenticated USING(can_access_lesson(lesson_id));
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_progress ON user_progress FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT ON user_progress TO authenticated;

INSERT INTO questions(id,lesson_id,question_text)
 SELECT ('50000000-0000-4000-8000-'||lpad((l.sort_order*100+n)::text,12,'0'))::uuid,l.id,'TEST_ONLY question '||n
 FROM lessons l CROSS JOIN generate_series(1,10) n WHERE l.sort_order<=478 AND l.sort_order%5<>0;
INSERT INTO question_revisions(id,question_id,status,educational_label,question_text)
 SELECT ('60000000-'||substring(id::text from 10))::uuid,id,'PUBLISHED',
 CASE WHEN right(id::text,2)::int<=5 THEN 'OFFICIAL_BOOK_QUESTION' ELSE 'SELF_TEST' END,question_text FROM questions;
UPDATE questions q SET current_published_revision_id=r.id FROM question_revisions r WHERE r.question_id=q.id;
INSERT INTO question_options(question_revision_id,option_code,body,sort_order,is_correct)
 SELECT r.id,chr(64+n),'TEST_ONLY option '||n,n,n=2 FROM question_revisions r CROSS JOIN generate_series(1,4) n;
INSERT INTO official_question_answers(question_id,revision_id,model_answer,explanation)
 SELECT question_id,id,'TEST_ONLY model answer','TEST_ONLY explanation' FROM question_revisions;
INSERT INTO lesson_capability_lifecycle(lesson_id,capability,status)
 SELECT l.id,c,'READY' FROM lessons l CROSS JOIN unnest(ARRAY['checkUnderstanding','lessonAssessment']) c
 WHERE l.sort_order<=478 AND l.sort_order%5<>0;

-- Fixture adapter for the safe student question RPC. It uses actual lesson access rules,
-- published revisions and safe option projections. No production RPC is replaced.
CREATE FUNCTION get_lesson_questions_with_images(_lesson_id uuid,_kind text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id,'revision_id',r.id,
 'question_text',r.question_text,'question_type','mcq','sort_order',right(q.id::text,2)::int,
 'options',(SELECT jsonb_agg(jsonb_build_object('id',o.option_code,'text',o.body,'sort_order',o.sort_order) ORDER BY o.sort_order)
 FROM question_options o WHERE o.question_revision_id=r.id)) ORDER BY q.id),'[]'::jsonb)
 FROM questions q JOIN question_revisions r ON r.id=q.current_published_revision_id
 WHERE auth.uid() IS NOT NULL AND can_access_lesson(_lesson_id) AND q.lesson_id=_lesson_id
 AND r.status='PUBLISHED'
 AND r.educational_label=CASE _kind WHEN 'official' THEN 'OFFICIAL_BOOK_QUESTION' WHEN 'self_test' THEN 'SELF_TEST' END
 AND lesson_capability_ready(_lesson_id,CASE _kind WHEN 'official' THEN 'checkUnderstanding' ELSE 'lessonAssessment' END)
$$;
REVOKE ALL ON FUNCTION get_lesson_questions_with_images(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION get_lesson_questions_with_images(uuid,text) TO authenticated;
CREATE INDEX journey_question_lesson ON questions(lesson_id);
CREATE INDEX journey_revision_question ON question_revisions(question_id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_profile ON profiles FOR SELECT TO authenticated USING(user_id=auth.uid());
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY visible_questions ON questions FOR SELECT TO authenticated USING(can_access_lesson(lesson_id));
ALTER TABLE question_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY visible_revisions ON question_revisions FOR SELECT TO authenticated
 USING(status='PUBLISHED' AND EXISTS(SELECT 1 FROM questions q WHERE q.id=question_id));
