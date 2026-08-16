-- 18E1 — ROOT CAUSE FIX (PENDING APPROVAL, NOT APPLIED)
--
-- validate_lesson_resource_metadata() whitelists metadata keys. The 18D direct
-- PDF upload writes: source, bucket, path, file_name, file_size, uploaded_at,
-- version. Every INSERT therefore raised 23514 -> the server function surfaced
-- `resource_insert_failed` and lesson_resources stayed at 0 while the storage
-- bytes were already uploaded (40/40 objects present).
--
-- This migration only widens the whitelist. No data is touched.

CREATE OR REPLACE FUNCTION public.validate_lesson_resource_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  allowed text[] := ARRAY[
    'resource_format','local_asset_path','thumbnail_url',
    'is_interactive','attribution','license_note','notes','is_primary',
    -- 18D direct upload contract
    'source','bucket','path','file_name','file_size','uploaded_at','version'
  ];
  k text;
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
  RETURN NEW;
END;
$$;
