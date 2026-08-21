-- CF11 rapid-launch contract alignment.
-- Forward-aligns pre-CF11 resource guards with the verified CF11 writer and
-- normalizes identities already normalized by CF10. Safe to reapply.

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

CREATE OR REPLACE FUNCTION public.cf11_assert_interactive_contract(_label text, _html text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  csp text;
  scripts text[];
  s text;
  h text;
  hashes jsonb := '[]'::jsonb;
BEGIN
  IF coalesce(btrim(_html),'') = '' THEN
    RAISE EXCEPTION 'CF11_HTML_EMPTY: %', _label USING ERRCODE = '23514';
  END IF;

  SELECT coalesce((regexp_match(_html,
           '<meta\s+http-equiv\s*=\s*["'']Content-Security-Policy["''][^>]*\ycontent\s*=\s*"([^"]*)"',
           'i'))[1],
         (regexp_match(_html,
           '<meta\s+http-equiv\s*=\s*["'']Content-Security-Policy["''][^>]*\ycontent\s*=\s*''([^'']*)''',
           'i'))[1]) INTO csp;
  IF csp IS NULL THEN
    RAISE EXCEPTION 'CF11_LAB_CSP_MISSING: %', _label USING ERRCODE = '23514';
  END IF;
  IF csp !~* 'default-src\s+''none''' THEN
    RAISE EXCEPTION 'CF11_LAB_CSP_DEFAULT_SRC: %', _label USING ERRCODE = '23514';
  END IF;
  IF csp !~* 'connect-src\s+''none''' THEN
    RAISE EXCEPTION 'CF11_LAB_CSP_CONNECT_SRC: %', _label USING ERRCODE = '23514';
  END IF;
  -- Inline styles remain allowed for self-contained teaching labs. Inline scripts
  -- remain forbidden unless each body is pinned by an exact SHA-256 token below.
  IF csp ~* 'unsafe-eval|\*'
     OR csp ~* 'script-src[^;]*unsafe-inline' THEN
    RAISE EXCEPTION 'CF11_LAB_CSP_UNSAFE: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '<script\y[^>]*\ysrc\s*=' THEN
    RAISE EXCEPTION 'CF11_LAB_EXTERNAL_SCRIPT: %', _label USING ERRCODE = '23514';
  END IF;

  scripts := public.cf11_inline_scripts(_html);
  IF array_length(scripts, 1) IS NULL THEN
    RAISE EXCEPTION 'CF11_LAB_NO_INLINE_SCRIPT: %', _label USING ERRCODE = '23514';
  END IF;

  FOREACH s IN ARRAY scripts LOOP
    h := public.cf11_script_csp_hash(s);
    IF position(('sha256-' || h) in csp) = 0 THEN
      RAISE EXCEPTION 'CF11_LAB_CSP_SCRIPT_HASH_MISMATCH: % expected sha256-%', _label, h
        USING ERRCODE = '23514';
    END IF;
    hashes := hashes || to_jsonb('sha256-' || h);
  END LOOP;

  IF (SELECT count(*) FROM regexp_matches(csp, '''sha256-[A-Za-z0-9+/=]+''', 'g'))
     <> jsonb_array_length(hashes) THEN
    RAISE EXCEPTION 'CF11_LAB_CSP_HASH_SET_MISMATCH: %', _label USING ERRCODE = '23514';
  END IF;

  PERFORM public.cf11_assert_no_network(_label, _html);
  RETURN jsonb_build_object('csp', csp, 'scriptHashes', hashes,
                            'scriptCount', array_length(scripts, 1));
END;
$function$;

DO $migration$
DECLARE
  v text;
  changed boolean := false;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'golden_lesson_publish_cf11';

  IF v IS NULL THEN
    RAISE EXCEPTION 'golden_lesson_publish_cf11 is missing';
  END IF;

  IF position('assessment_code = public.normalize_content_code(ext_code || ''-SELFTEST'')' in v) = 0 THEN
    IF position('assessment_code = ext_code || ''-SELFTEST''' in v) = 0 THEN
      RAISE EXCEPTION 'unexpected CF11 assessment lookup contract';
    END IF;
    v := replace(
      v,
      'assessment_code = ext_code || ''-SELFTEST''',
      'assessment_code = public.normalize_content_code(ext_code || ''-SELFTEST'')'
    );
    changed := true;
  END IF;

  IF position('v_resource_code := public.normalize_content_code(CASE cap' in v) = 0 THEN
    IF position('v_resource_code := CASE cap WHEN ''mindMap'' THEN ext_code || ''-MINDMAP''' in v) = 0 THEN
      RAISE EXCEPTION 'unexpected CF11 resource-code contract';
    END IF;
    v := replace(
      v,
      'v_resource_code := CASE cap WHEN ''mindMap'' THEN ext_code || ''-MINDMAP''
                              ELSE ext_code || ''-EXPERIMENT'' END;',
      'v_resource_code := public.normalize_content_code(CASE cap WHEN ''mindMap'' THEN ext_code || ''-MINDMAP''
                              ELSE ext_code || ''-EXPERIMENT'' END);'
    );
    changed := true;
  END IF;

  IF changed THEN
    EXECUTE v;
  END IF;
END;
$migration$;

COMMENT ON FUNCTION public.validate_lesson_resource_metadata()
IS 'Fail-closed lesson resource metadata contract including the exact CF11 publication keys.';

COMMENT ON FUNCTION public.cf11_assert_interactive_contract(text,text)
IS 'Validates self-contained interactive HTML: no network, no external/eval scripts, every inline script hash-pinned; inline styles allowed.';
