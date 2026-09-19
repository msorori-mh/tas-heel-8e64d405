-- TEST_ONLY: isolated database only.
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth,public TO authenticated,anon,service_role;
CREATE TABLE lessons(id uuid PRIMARY KEY, active boolean NOT NULL DEFAULT true, owner_id uuid NOT NULL);
CREATE TABLE lesson_book_contents(id uuid PRIMARY KEY,lesson_id uuid REFERENCES lessons(id),content text,updated_at timestamptz DEFAULT now());
CREATE TABLE lesson_explanations(id uuid PRIMARY KEY,lesson_id uuid REFERENCES lessons(id),content text,title text,sort_order integer DEFAULT 0,updated_at timestamptz DEFAULT now());
CREATE TABLE lesson_summaries(id uuid PRIMARY KEY,lesson_id uuid REFERENCES lessons(id),summary text,updated_at timestamptz DEFAULT now());
CREATE TABLE lesson_resources(id uuid PRIMARY KEY,lesson_id uuid REFERENCES lessons(id),description text,title text,url text,resource_type text,html_resource_type text,metadata jsonb,sort_order integer DEFAULT 0,created_at timestamptz DEFAULT now());
CREATE TABLE lesson_capability_lifecycle(id uuid PRIMARY KEY,lesson_id uuid REFERENCES lessons(id),capability text,status text,ready_hash text,ready_at timestamptz DEFAULT now(),ready_snapshot jsonb);
CREATE FUNCTION can_access_lesson(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM lessons WHERE id=_id AND owner_id=auth.uid() AND active) $$;
CREATE FUNCTION lesson_student_content_gate(_lesson_id uuid) RETURNS TABLE(lesson_id uuid,managed boolean,visible boolean,ready_capabilities text[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT _lesson_id,true,can_access_lesson(_lesson_id),ARRAY(SELECT capability FROM lesson_capability_lifecycle WHERE lesson_id=_lesson_id AND status='READY') $$;
CREATE FUNCTION _v3_canonical_json_v1(v jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT CASE jsonb_typeof(v)
 WHEN 'null' THEN 'null' WHEN 'boolean' THEN CASE WHEN v='true'::jsonb THEN 'true' ELSE 'false' END
 WHEN 'number' THEN v #>> '{}' WHEN 'string' THEN to_json(v #>> '{}')::text
 WHEN 'array' THEN '['||coalesce((SELECT string_agg(_v3_canonical_json_v1(e.value),',' ORDER BY e.ordinality) FROM jsonb_array_elements(v) WITH ORDINALITY e(value,ordinality)),'')||']'
 WHEN 'object' THEN '{'||coalesce((SELECT string_agg(to_json(k.key)::text||':'||_v3_canonical_json_v1(k.value),',' ORDER BY k.key COLLATE "C") FROM jsonb_each(v) k),'')||'}' END;
$$;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY lesson_read ON lessons FOR SELECT TO authenticated USING(owner_id=auth.uid() AND active);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['lesson_book_contents','lesson_explanations','lesson_summaries','lesson_resources','lesson_capability_lifecycle'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
 EXECUTE format('CREATE POLICY source_read ON %I FOR SELECT TO authenticated USING (can_access_lesson(lesson_id))',tab);
 END LOOP;
END $$;
