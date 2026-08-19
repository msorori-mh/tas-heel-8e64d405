CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.buckets(
  id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[]
);
CREATE TABLE storage.objects(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL REFERENCES storage.buckets(id), name text NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/')[1:greatest(array_length(string_to_array(name, '/'),1)-1,0)] $$;
GRANT USAGE ON SCHEMA storage TO authenticated, service_role;
GRANT SELECT, INSERT ON storage.objects TO authenticated;

