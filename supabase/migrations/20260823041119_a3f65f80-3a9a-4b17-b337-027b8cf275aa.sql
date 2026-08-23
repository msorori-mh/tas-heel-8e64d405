CREATE OR REPLACE FUNCTION public.validate_lesson_resource_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  allowed text[] := ARRAY[
    'resource_format','local_asset_path','thumbnail_url',
    'is_interactive','attribution','license_note','notes','is_primary',
    'source','bucket','path','file_name','file_size','uploaded_at','version',
    'attachment_of',
    'cf11_publication_id','cf11_published_at','cf11_published_by',
    'cf11_body_sha256','cf11_render_mode','cf11_verified_bundle_sha256','cf11_csp'
  ];
  k text;
  v_source text;
  v_bucket text;
  v_path text;
  v_file_name text;
  v_uploaded_at text;
  v_version text;
  v_attachment_of text;
  v_size numeric;
BEGIN
  IF NEW.metadata IS NULL THEN
    NEW.metadata := '{}'::jsonb;
  END IF;
  IF jsonb_typeof(NEW.metadata) <> 'object' THEN
    RAISE EXCEPTION 'lesson_resources.metadata must be a JSON object' USING ERRCODE = '23514';
  END IF;

  FOR k IN SELECT jsonb_object_keys(NEW.metadata) LOOP
    IF NOT (k = ANY (allowed)) THEN
      RAISE EXCEPTION 'unsupported lesson_resources.metadata key: %', k USING ERRCODE = '23514';
    END IF;
  END LOOP;

  v_attachment_of := NEW.metadata->>'attachment_of';
  IF v_attachment_of IS NOT NULL AND v_attachment_of <> 'lab' THEN
    RAISE EXCEPTION 'unsupported lesson_resources.metadata.attachment_of: %', v_attachment_of USING ERRCODE = '23514';
  END IF;

  v_source := NEW.metadata->>'source';
  IF v_source IS NOT NULL AND v_source = 'direct_upload' THEN
    v_bucket := NEW.metadata->>'bucket';
    v_path := NEW.metadata->>'path';
    v_file_name := NEW.metadata->>'file_name';
    v_uploaded_at := NEW.metadata->>'uploaded_at';
    v_version := NEW.metadata->>'version';

    IF v_bucket IS DISTINCT FROM 'lesson-pdfs' THEN
      RAISE EXCEPTION 'invalid lesson_resources.metadata.bucket: %', coalesce(v_bucket, '<null>')
        USING ERRCODE = '23514';
    END IF;
    IF v_path IS NULL
       OR v_path !~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.pdf$'
       OR v_path NOT LIKE NEW.lesson_id::text || '/%' THEN
      RAISE EXCEPTION 'invalid lesson_resources.metadata.path: %', coalesce(v_path, '<null>')
        USING ERRCODE = '23514';
    END IF;
    IF v_file_name IS NULL OR length(v_file_name) = 0 OR length(v_file_name) > 300
       OR v_file_name !~* '\.pdf$' THEN
      RAISE EXCEPTION 'invalid lesson_resources.metadata.file_name' USING ERRCODE = '23514';
    END IF;
    IF jsonb_typeof(NEW.metadata->'file_size') <> 'number' THEN
      RAISE EXCEPTION 'lesson_resources.metadata.file_size must be a number' USING ERRCODE = '23514';
    END IF;
    v_size := (NEW.metadata->>'file_size')::numeric;
    IF v_size <= 0 OR v_size <> trunc(v_size) OR v_size > 104857600 THEN
      RAISE EXCEPTION 'invalid lesson_resources.metadata.file_size: %', v_size USING ERRCODE = '23514';
    END IF;
    IF jsonb_typeof(NEW.metadata->'uploaded_at') <> 'string' THEN
      RAISE EXCEPTION 'lesson_resources.metadata.uploaded_at must be a string' USING ERRCODE = '23514';
    END IF;
    BEGIN
      PERFORM v_uploaded_at::timestamptz;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid lesson_resources.metadata.uploaded_at: %', v_uploaded_at
        USING ERRCODE = '23514';
    END;
    IF jsonb_typeof(NEW.metadata->'version') <> 'string' THEN
      RAISE EXCEPTION 'lesson_resources.metadata.version must be a string' USING ERRCODE = '23514';
    END IF;
    IF v_version !~ '^[a-z0-9]{6,64}$' THEN
      RAISE EXCEPTION 'invalid lesson_resources.metadata.version: %', v_version USING ERRCODE = '23514';
    END IF;
  ELSIF v_source IS NOT NULL THEN
    RAISE EXCEPTION 'unsupported lesson_resources.metadata.source: %', v_source USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;