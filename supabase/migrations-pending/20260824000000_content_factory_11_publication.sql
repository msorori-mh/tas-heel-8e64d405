-- =====================================================================================
-- CONTENT FACTORY 11 — GOLDEN LESSON PUBLICATION (DRAFT -> REVIEW, then attested READY)
-- =====================================================================================
-- Scope (source-only until an explicit production apply authorization):
--   CF11 takes ONE CF10-materialized Golden Lesson batch and, atomically:
--     1. registers the verified supplemental static assets that the server function already
--        uploaded to the PRIVATE `golden-lesson-assets` bucket (no public bucket, no overwrite
--        when the hash differs, leaf-only names, raster MIME allowlist);
--     2. rewrites ONLY the declared asset references inside lesson_book_contents.content to the
--        existing `supabase-storage://<bucket>/<path>` resolver contract — the official text is
--        byte-identical outside those references and this is proven by re-deriving the new body
--        from the old one;
--     3. creates/publishes mindMapHtml + labExperimentHtml rows in lesson_resources using the
--        existing enum (`mindmap` / `experiment`) and `html_resource_type` markers, delivered
--        through the already-published `lesson-internal://html/<resource_code>` scheme;
--     4. validates the lab HTML against the ACTUAL inline script sha256 declared in its CSP,
--        `connect-src 'none'`, zero external URLs and the sandbox contract, and validates that
--        the mind map is completely JS-free;
--     5. publishes the CURRENT revision of the 5 official + 40 self-test questions while every
--        answer / rationale stays confined to official_question_answers and
--        question_option_rationales;
--     6. creates assessment membership for EXACTLY the 40 self-test questions and never for the
--        5 official questions;
--     7. transitions all seven lifecycle rows DRAFT -> REVIEW. Nothing else.
--
--   READY is a SEPARATE, explicitly attested RPC (`golden_lesson_attest_cf11_ready`) that
--   re-verifies snapshots/hashes, required-capability coverage, answer leak = 0, free access and
--   real human review evidence before REVIEW -> READY. There is no DRAFT -> READY path anywhere.
--
-- Separation of duties: both RPCs derive the human actor from auth.uid() only. The READY attester
-- MUST be a different real user than the CF11 publisher. No service role, no agent, no backfill
-- and no fabricated approval can satisfy either check.
--
-- Byte-preservation: this migration adds only NEW objects and replaces exactly ONE previously
-- unconditional stub (`cf10_html_publication_pending`) with its real CF11-aware implementation,
-- as that function's own comment mandates. R5/21H and CF04/07/08/09/10 payload logic is untouched.
-- =====================================================================================

-- ------------------------------------------------------------------------------------
-- 0) Preflight: CF11 hashes everything through extensions.digest (see R9).
-- ------------------------------------------------------------------------------------
DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'extensions' AND p.proname = 'digest'
  ) THEN
    RAISE EXCEPTION 'CF11_PREFLIGHT_MISSING_EXTENSIONS_DIGEST: pgcrypto must live in schema extensions'
      USING ERRCODE = '0A000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'golden_lesson_materialize_domain_batch'
  ) THEN
    RAISE EXCEPTION 'CF11_PREFLIGHT_MISSING_CF10' USING ERRCODE = '0A000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'lesson_capability_transition'
  ) THEN
    RAISE EXCEPTION 'CF11_PREFLIGHT_MISSING_LIFECYCLE_TRANSITION' USING ERRCODE = '0A000';
  END IF;
END
$preflight$;

-- ------------------------------------------------------------------------------------
-- 1) Private storage bucket for verified supplemental assets.
--    Private (public = false) + no anon policy: every read goes through a signed URL minted by
--    an authenticated server function that first checks lesson access.
-- ------------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('golden-lesson-assets', 'golden-lesson-assets', false, 2097152,
        ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 2097152,
      allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp'];

DROP POLICY IF EXISTS "golden_lesson_assets_staff_read" ON storage.objects;
CREATE POLICY "golden_lesson_assets_staff_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'golden-lesson-assets' AND public.is_golden_lesson_content_staff(auth.uid()));

DROP POLICY IF EXISTS "golden_lesson_assets_staff_write" ON storage.objects;
CREATE POLICY "golden_lesson_assets_staff_write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'golden-lesson-assets' AND public.is_golden_lesson_content_staff(auth.uid()));

-- Deliberately NO update/delete policy: assets are content-addressed and immutable.

-- ------------------------------------------------------------------------------------
-- 2) Registry of published assets (content-addressed, no overwrite on hash change).
-- ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.golden_lesson_published_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.golden_lesson_domain_stage_batches(id) ON DELETE RESTRICT,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
  asset_code text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  sha256 text NOT NULL,
  byte_size bigint NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  alt_text_ar text,
  published_by uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golden_lesson_published_assets_leaf_name_chk
    CHECK (file_name !~ '[/\\]' AND file_name !~ '\.\.' AND file_name ~ '^[a-z0-9][a-z0-9._-]{0,95}$'),
  CONSTRAINT golden_lesson_published_assets_mime_chk
    CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  CONSTRAINT golden_lesson_published_assets_sha_chk CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT golden_lesson_published_assets_size_chk CHECK (byte_size BETWEEN 64 AND 2097152),
  CONSTRAINT golden_lesson_published_assets_bucket_chk CHECK (storage_bucket = 'golden-lesson-assets'),
  CONSTRAINT golden_lesson_published_assets_unique UNIQUE (lesson_id, asset_code)
);

GRANT SELECT ON public.golden_lesson_published_assets TO authenticated;
GRANT ALL ON public.golden_lesson_published_assets TO service_role;
ALTER TABLE public.golden_lesson_published_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "golden_lesson_published_assets_staff_read" ON public.golden_lesson_published_assets;
CREATE POLICY "golden_lesson_published_assets_staff_read"
  ON public.golden_lesson_published_assets FOR SELECT TO authenticated
  USING (public.is_golden_lesson_content_staff(auth.uid()));

-- All writes flow through the SECURITY DEFINER RPCs below; no direct-write policy exists.

-- ------------------------------------------------------------------------------------
-- 3) Publication ledger (immutable, one row per successfully published batch).
-- ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.golden_lesson_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL UNIQUE REFERENCES public.golden_lesson_domain_stage_batches(id) ON DELETE RESTRICT,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
  binding_id uuid NOT NULL REFERENCES public.golden_lesson_identity_bindings(id) ON DELETE RESTRICT,
  plan_sha256 text NOT NULL,
  result jsonb NOT NULL,
  idempotency_key text,
  published_by uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  ready_attested_by uuid,
  ready_attested_at timestamptz,
  ready_evidence jsonb,
  CONSTRAINT golden_lesson_publications_plan_sha_chk CHECK (plan_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT golden_lesson_publications_separation_chk
    CHECK (ready_attested_by IS NULL OR ready_attested_by <> published_by)
);

GRANT SELECT ON public.golden_lesson_publications TO authenticated;
GRANT ALL ON public.golden_lesson_publications TO service_role;
ALTER TABLE public.golden_lesson_publications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "golden_lesson_publications_staff_read" ON public.golden_lesson_publications;
CREATE POLICY "golden_lesson_publications_staff_read"
  ON public.golden_lesson_publications FOR SELECT TO authenticated
  USING (public.is_golden_lesson_content_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.reject_golden_publication_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'CF11_LEDGER_IMMUTABLE' USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS golden_lesson_publications_no_delete ON public.golden_lesson_publications;
CREATE TRIGGER golden_lesson_publications_no_delete
  BEFORE DELETE ON public.golden_lesson_publications
  FOR EACH ROW EXECUTE FUNCTION public.reject_golden_publication_mutation();

-- ------------------------------------------------------------------------------------
-- 4) CF11 helper contracts.
-- ------------------------------------------------------------------------------------

-- The only asset delivery reference CF11 may write. `supabase-storage://` is the existing,
-- already-published private-storage scheme (see lesson-capabilities.isValidResourceUrl).
CREATE OR REPLACE FUNCTION public.cf11_asset_url(_bucket text, _path text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT 'supabase-storage://' || btrim(coalesce(_bucket,'')) || '/' || btrim(coalesce(_path,''));
$$;

CREATE OR REPLACE FUNCTION public.cf11_text_sha256(_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT encode(extensions.digest(convert_to(coalesce(_value,''),'UTF8'),'sha256'),'hex');
$$;

-- base64 sha256 of one inline script body, i.e. the value a CSP `sha256-...` token must carry.
CREATE OR REPLACE FUNCTION public.cf11_script_csp_hash(_script text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT encode(extensions.digest(convert_to(coalesce(_script,''),'UTF8'),'sha256'),'base64');
$$;

-- Every inline <script>…</script> body of an HTML document, in document order.
CREATE OR REPLACE FUNCTION public.cf11_inline_scripts(_html text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(array_agg(m[1] ORDER BY ord), ARRAY[]::text[])
    FROM regexp_matches(coalesce(_html,''), '<script\b[^>]*>([\s\S]*?)</script\s*>', 'gi')
      WITH ORDINALITY AS t(m, ord);
$$;

-- Fail-closed: no external network reference of any kind may survive inside published HTML.
CREATE OR REPLACE FUNCTION public.cf11_assert_no_network(_label text, _html text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF _html ~* '(https?:)?//[a-z0-9]' THEN
    RAISE EXCEPTION 'CF11_HTML_EXTERNAL_URL: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '\b(src|href|action|formaction|data|poster)\s*=\s*["'']?\s*data:' THEN
    RAISE EXCEPTION 'CF11_HTML_DATA_URI: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '<(iframe|object|embed|form|link|base)\b' THEN
    RAISE EXCEPTION 'CF11_HTML_FORBIDDEN_ELEMENT: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '\bon[a-z]+\s*=\s*["'']' THEN
    RAISE EXCEPTION 'CF11_HTML_INLINE_EVENT_HANDLER: %', _label USING ERRCODE = '23514';
  END IF;
END $$;

-- STATIC contract (mind map): valid details/summary structure, absolutely JS-free.
CREATE OR REPLACE FUNCTION public.cf11_assert_static_contract(_label text, _html text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF coalesce(btrim(_html),'') = '' THEN
    RAISE EXCEPTION 'CF11_HTML_EMPTY: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '<script\b' THEN
    RAISE EXCEPTION 'CF11_STATIC_HTML_HAS_SCRIPT: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html !~* '<details\b' OR _html !~* '<summary\b' THEN
    RAISE EXCEPTION 'CF11_MINDMAP_MISSING_DETAILS_SUMMARY: %', _label USING ERRCODE = '23514';
  END IF;
  PERFORM public.cf11_assert_no_network(_label, _html);
END $$;

-- INTERACTIVE contract (lab experiment): the CSP must pin the ACTUAL inline script hash,
-- forbid every network destination, and the document must ship a sandbox contract marker.
CREATE OR REPLACE FUNCTION public.cf11_assert_interactive_contract(_label text, _html text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
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

  SELECT (regexp_match(_html,
    '<meta\s+http-equiv\s*=\s*["'']Content-Security-Policy["''][^>]*\bcontent\s*=\s*["'']([^"'']+)["'']',
    'i'))[1] INTO csp;
  IF csp IS NULL THEN
    RAISE EXCEPTION 'CF11_LAB_CSP_MISSING: %', _label USING ERRCODE = '23514';
  END IF;
  IF csp !~* 'default-src\s+''none''' THEN
    RAISE EXCEPTION 'CF11_LAB_CSP_DEFAULT_SRC: %', _label USING ERRCODE = '23514';
  END IF;
  IF csp !~* 'connect-src\s+''none''' THEN
    RAISE EXCEPTION 'CF11_LAB_CSP_CONNECT_SRC: %', _label USING ERRCODE = '23514';
  END IF;
  IF csp ~* 'unsafe-inline|unsafe-eval|\*' THEN
    RAISE EXCEPTION 'CF11_LAB_CSP_UNSAFE: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html !~* 'data-tamkeen-sandbox\s*=\s*["'']allow-scripts["'']' THEN
    RAISE EXCEPTION 'CF11_LAB_SANDBOX_CONTRACT_MISSING: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '<script\b[^>]*\bsrc\s*=' THEN
    RAISE EXCEPTION 'CF11_LAB_EXTERNAL_SCRIPT: %', _label USING ERRCODE = '23514';
  END IF;

  scripts := public.cf11_inline_scripts(_html);
  IF array_length(scripts, 1) IS NULL THEN
    RAISE EXCEPTION 'CF11_LAB_NO_INLINE_SCRIPT: %', _label USING ERRCODE = '23514';
  END IF;

  -- Every inline script body must be pinned by its own sha256 token in the CSP.
  FOREACH s IN ARRAY scripts LOOP
    h := public.cf11_script_csp_hash(s);
    IF position(('sha256-' || h) in csp) = 0 THEN
      RAISE EXCEPTION 'CF11_LAB_CSP_SCRIPT_HASH_MISMATCH: % expected sha256-%', _label, h
        USING ERRCODE = '23514';
    END IF;
    hashes := hashes || to_jsonb('sha256-' || h);
  END LOOP;

  -- ...and the CSP may not pin anything that is not actually present (no stale/extra hashes).
  IF (SELECT count(*) FROM regexp_matches(csp, '''sha256-[A-Za-z0-9+/=]+''', 'g'))
     <> jsonb_array_length(hashes) THEN
    RAISE EXCEPTION 'CF11_LAB_CSP_HASH_SET_MISMATCH: %', _label USING ERRCODE = '23514';
  END IF;

  PERFORM public.cf11_assert_no_network(_label, _html);
  RETURN jsonb_build_object('csp', csp, 'scriptHashes', hashes,
                            'scriptCount', array_length(scripts, 1));
END $$;

-- Leaf-only asset references found in an HTML body (src="name.ext" with no path separator).
CREATE OR REPLACE FUNCTION public.cf11_html_asset_refs(_html text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT m[1]), ARRAY[]::text[])
    FROM regexp_matches(coalesce(_html,''),
      '<img\b[^>]*\bsrc\s*=\s*["'']([^"''>]+)["'']', 'gi') AS t(m);
$$;

-- ------------------------------------------------------------------------------------
-- 5) The CF10 stub becomes the real, CF11-aware publication probe.
--    Truthful signal only: publication is no longer pending when a lesson_resources row exists
--    that (a) carries the CF11 publication id, (b) matches the published body sha256 recorded in
--    the ledger, and (c) is delivered through the inline-html scheme.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf10_html_publication_pending(_lesson_id uuid, _capability text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT NOT EXISTS (
    SELECT 1
      FROM public.lesson_resources r
      JOIN public.golden_lesson_publications p
        ON p.id = (r.metadata->>'cf11_publication_id')::uuid
       AND p.lesson_id = r.lesson_id
     WHERE r.lesson_id = _lesson_id
       AND r.html_resource_type = CASE _capability WHEN 'mindMap' THEN 'mindmap'
                                                   WHEN 'simulation' THEN 'experiment' END
       AND r.url = public.cf10_inline_html_url(r.resource_code)
       AND r.metadata->>'cf11_body_sha256' = public.cf11_text_sha256(r.description)
       AND r.metadata->>'cf11_body_sha256' =
             (p.result->'html'->(CASE _capability WHEN 'mindMap' THEN 'mindMap'
                                                  ELSE 'simulation' END)->>'sha256')
  );
$$;

-- ------------------------------------------------------------------------------------
-- 6) CF11 publication RPC: DRAFT -> REVIEW only.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.golden_lesson_publish_cf11(
  _batch_id uuid,
  _actor_id uuid,
  _mode text DEFAULT 'DRY_RUN',
  _assets jsonb DEFAULT '[]'::jsonb,
  _expected_plan_sha256 text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := auth.uid();
  batch public.golden_lesson_domain_stage_batches;
  ver public.golden_lesson_package_versions;
  binding public.golden_lesson_identity_bindings;
  mat public.golden_lesson_domain_materializations;
  replay public.golden_lesson_publications;
  lesson_row public.lessons;
  ext_code text;
  review_status text;
  asset jsonb;
  asset_refs text[];
  declared_refs text[] := ARRAY[]::text[];
  book_old text;
  book_new text;
  mind_html text;
  lab_html text;
  lab_contract jsonb;
  asset_map jsonb := '{}'::jsonb;
  asset_report jsonb := '[]'::jsonb;
  plan jsonb;
  plan_sha text;
  cap text;
  v_resource_code text;
  question_codes text[];
  official_codes text[];
  self_codes text[];
  q record;
  v_assessment_id uuid;
  publication_id uuid := gen_random_uuid();
  writes integer := 0;
  rc integer := 0;
  member_count integer := 0;
  official_in_assessment integer := 0;
BEGIN
  IF _mode NOT IN ('DRY_RUN','EXECUTE') THEN
    RAISE EXCEPTION 'CF11_INVALID_MODE' USING ERRCODE = '22023';
  END IF;

  -- Human actor only. auth.uid() is authoritative; _actor_id is a client-side assertion that
  -- must agree with it, so an agent or service role can never publish on someone's behalf.
  IF uid IS NULL OR _actor_id IS NULL OR uid <> _actor_id THEN
    RAISE EXCEPTION 'CF11_ACTOR_IDENTITY_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_golden_lesson_content_staff(uid) THEN
    RAISE EXCEPTION 'CF11_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO batch FROM public.golden_lesson_domain_stage_batches WHERE id = _batch_id FOR UPDATE;
  IF batch.id IS NULL THEN
    RAISE EXCEPTION 'CF11_BATCH_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO ver FROM public.golden_lesson_package_versions
   WHERE package_id = batch.package_id AND version = batch.package_version;
  IF ver.id IS NULL OR ver.verified_bundle_sha256 IS DISTINCT FROM batch.verified_bundle_sha256 THEN
    RAISE EXCEPTION 'CF11_VERIFIED_BUNDLE_MISMATCH' USING ERRCODE = '23514';
  END IF;

  SELECT to_status INTO review_status FROM public.golden_lesson_package_reviews
   WHERE package_id = batch.package_id AND package_version = batch.package_version
   ORDER BY created_at DESC LIMIT 1;
  IF review_status IS DISTINCT FROM 'APPROVED_FOR_STAGING' THEN
    RAISE EXCEPTION 'CF11_PACKAGE_NOT_APPROVED_FOR_STAGING: %', coalesce(review_status,'NONE')
      USING ERRCODE = '23514';
  END IF;

  IF (SELECT count(*) FROM public.golden_lesson_identity_bindings WHERE batch_id = _batch_id) <> 1 THEN
    RAISE EXCEPTION 'CF11_IDENTITY_BINDING_NOT_EXACTLY_ONE' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO binding FROM public.golden_lesson_identity_bindings WHERE batch_id = _batch_id;

  SELECT * INTO mat FROM public.golden_lesson_domain_materializations WHERE batch_id = _batch_id;
  IF mat.id IS NULL THEN
    RAISE EXCEPTION 'CF11_CF10_MATERIALIZATION_MISSING' USING ERRCODE = '23514';
  END IF;
  IF mat.lesson_id IS DISTINCT FROM binding.lesson_id THEN
    RAISE EXCEPTION 'CF11_IDENTITY_CONFLICT: materialization lesson' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO lesson_row FROM public.lessons WHERE id = binding.lesson_id FOR UPDATE;
  IF lesson_row.id IS NULL THEN
    RAISE EXCEPTION 'CF11_LESSON_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF lesson_row.is_free IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CF11_LESSON_NOT_FREE' USING ERRCODE = '23514';
  END IF;
  IF lesson_row.subject_id IS DISTINCT FROM binding.subject_id THEN
    RAISE EXCEPTION 'CF11_IDENTITY_CONFLICT: subject' USING ERRCODE = '23514';
  END IF;
  ext_code := binding.external_lesson_code;

  -- Idempotent replay: return the recorded result without re-writing anything.
  SELECT * INTO replay FROM public.golden_lesson_publications WHERE batch_id = _batch_id;
  IF replay.id IS NOT NULL THEN
    IF replay.lesson_id IS DISTINCT FROM binding.lesson_id THEN
      RAISE EXCEPTION 'CF11_REPLAY_IDENTITY_DRIFT' USING ERRCODE = '23514';
    END IF;
    RETURN replay.result || jsonb_build_object(
      'idempotent', true, 'writes_performed', 0, 'mode', _mode,
      'html_publication_pending', jsonb_build_object(
        'mindMap', public.cf10_html_publication_pending(replay.lesson_id,'mindMap'),
        'simulation', public.cf10_html_publication_pending(replay.lesson_id,'simulation')));
  END IF;

  -- --- staged HTML bodies -------------------------------------------------------------
  SELECT convert_from(source_payload,'UTF8') INTO mind_html
    FROM public.golden_lesson_domain_stage_entries
   WHERE batch_id = _batch_id AND capability = 'mindMapHtml';
  SELECT convert_from(source_payload,'UTF8') INTO lab_html
    FROM public.golden_lesson_domain_stage_entries
   WHERE batch_id = _batch_id AND capability = 'labExperimentHtml';
  IF mind_html IS NULL OR lab_html IS NULL THEN
    RAISE EXCEPTION 'CF11_STAGED_HTML_MISSING' USING ERRCODE = '23514';
  END IF;

  PERFORM public.cf11_assert_static_contract('mindMapHtml', mind_html);
  lab_contract := public.cf11_assert_interactive_contract('labExperimentHtml', lab_html);
  PERFORM public.cf10_assert_no_answer_leak('mindMapHtml', mind_html);
  PERFORM public.cf10_assert_no_answer_leak('labExperimentHtml', lab_html);

  -- --- assets -------------------------------------------------------------------------
  SELECT content INTO book_old FROM public.lesson_book_contents WHERE lesson_id = lesson_row.id;
  IF book_old IS NULL THEN
    RAISE EXCEPTION 'CF11_BOOK_CONTENT_MISSING' USING ERRCODE = '23514';
  END IF;
  asset_refs := public.cf11_html_asset_refs(book_old);

  book_new := book_old;
  FOR asset IN SELECT value FROM jsonb_array_elements(coalesce(_assets,'[]'::jsonb)) LOOP
    IF asset->>'fileName' ~ '[/\\]' OR asset->>'fileName' ~ '\.\.' THEN
      RAISE EXCEPTION 'CF11_ASSET_NOT_LEAF: %', asset->>'fileName' USING ERRCODE = '23514';
    END IF;
    IF (asset->>'mimeType') NOT IN ('image/png','image/jpeg','image/webp') THEN
      RAISE EXCEPTION 'CF11_ASSET_MIME_FORBIDDEN: %', asset->>'mimeType' USING ERRCODE = '23514';
    END IF;
    IF (asset->>'sha256') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'CF11_ASSET_SHA_INVALID' USING ERRCODE = '23514';
    END IF;
    IF (asset->>'storageBucket') IS DISTINCT FROM 'golden-lesson-assets' THEN
      RAISE EXCEPTION 'CF11_ASSET_BUCKET_FORBIDDEN' USING ERRCODE = '23514';
    END IF;
    -- Content-addressed path, scoped to the lesson: no cross-lesson reuse, no overwrite.
    IF (asset->>'storagePath') IS DISTINCT FROM
       (lesson_row.id::text || '/' || (asset->>'sha256') || '-' || (asset->>'fileName')) THEN
      RAISE EXCEPTION 'CF11_ASSET_PATH_CONTRACT: %', asset->>'storagePath' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects o
                    WHERE o.bucket_id = 'golden-lesson-assets' AND o.name = asset->>'storagePath') THEN
      RAISE EXCEPTION 'CF11_ASSET_OBJECT_MISSING: %', asset->>'storagePath' USING ERRCODE = '23514';
    END IF;
    -- No overwrite when the hash differs for the same logical asset.
    IF EXISTS (SELECT 1 FROM public.golden_lesson_published_assets a
                WHERE a.lesson_id = lesson_row.id AND a.asset_code = asset->>'assetCode'
                  AND a.sha256 IS DISTINCT FROM asset->>'sha256') THEN
      RAISE EXCEPTION 'CF11_ASSET_HASH_CONFLICT: %', asset->>'assetCode' USING ERRCODE = '23514';
    END IF;
    IF NOT (asset->>'fileName' = ANY (asset_refs)) THEN
      RAISE EXCEPTION 'CF11_ASSET_NOT_REFERENCED: %', asset->>'fileName' USING ERRCODE = '23514';
    END IF;

    declared_refs := declared_refs || (asset->>'fileName');
    asset_map := asset_map || jsonb_build_object(asset->>'fileName',
      public.cf11_asset_url(asset->>'storageBucket', asset->>'storagePath'));
    book_new := replace(book_new,
      'src="' || (asset->>'fileName') || '"',
      'src="' || public.cf11_asset_url(asset->>'storageBucket', asset->>'storagePath') || '"');
    asset_report := asset_report || jsonb_build_object(
      'assetCode', asset->>'assetCode', 'fileName', asset->>'fileName',
      'mimeType', asset->>'mimeType', 'sha256', asset->>'sha256',
      'bytes', (asset->>'bytes')::bigint,
      'url', public.cf11_asset_url(asset->>'storageBucket', asset->>'storagePath'));
  END LOOP;

  -- Every reference in the official body must be declared; nothing undeclared survives.
  FOREACH cap IN ARRAY asset_refs LOOP
    IF NOT (cap = ANY (declared_refs)) THEN
      RAISE EXCEPTION 'CF11_UNDECLARED_ASSET_REFERENCE: %', cap USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- Proof that ONLY declared references changed: re-deriving the rewrite from the old body
  -- reproduces the new body exactly, and reversing it reproduces the old body exactly.
  IF book_new IS DISTINCT FROM book_old THEN
    DECLARE reversed text := book_new;
    BEGIN
      FOR asset IN SELECT value FROM jsonb_array_elements(coalesce(_assets,'[]'::jsonb)) LOOP
        reversed := replace(reversed,
          'src="' || (asset_map->>(asset->>'fileName')) || '"',
          'src="' || (asset->>'fileName') || '"');
      END LOOP;
      IF reversed IS DISTINCT FROM book_old THEN
        RAISE EXCEPTION 'CF11_OFFICIAL_TEXT_DRIFT' USING ERRCODE = '23514';
      END IF;
    END;
  END IF;
  PERFORM public.cf10_assert_no_answer_leak('officialBookContent', book_new);

  -- --- question sets ------------------------------------------------------------------
  SELECT coalesce(array_agg(code ORDER BY code), ARRAY[]::text[]) INTO official_codes
    FROM public.questions WHERE lesson_id = lesson_row.id AND code LIKE ext_code || '-OFFQ-%';
  SELECT coalesce(array_agg(code ORDER BY code), ARRAY[]::text[]) INTO self_codes
    FROM public.questions WHERE lesson_id = lesson_row.id AND code LIKE ext_code || '-SELF-%';
  IF array_length(official_codes,1) IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'CF11_OFFICIAL_QUESTION_COUNT: %', coalesce(array_length(official_codes,1),0)
      USING ERRCODE = '23514';
  END IF;
  IF array_length(self_codes,1) IS DISTINCT FROM 40 THEN
    RAISE EXCEPTION 'CF11_SELFTEST_QUESTION_COUNT: %', coalesce(array_length(self_codes,1),0)
      USING ERRCODE = '23514';
  END IF;
  question_codes := official_codes || self_codes;

  -- --- deterministic write plan --------------------------------------------------------
  plan := jsonb_build_object(
    'schema','tamkeen.content-factory-11.write-plan.v1',
    'batchId', _batch_id,
    'lessonId', lesson_row.id,
    'bindingId', binding.id,
    'externalLessonCode', ext_code,
    'verifiedBundleSha256', batch.verified_bundle_sha256,
    'assets', asset_report,
    'bookContent', jsonb_build_object('beforeSha256', public.cf11_text_sha256(book_old),
                                      'afterSha256', public.cf11_text_sha256(book_new)),
    'html', jsonb_build_object(
      'mindMap', jsonb_build_object('resourceCode', ext_code || '-MINDMAP',
                                    'sha256', public.cf11_text_sha256(mind_html),
                                    'renderMode','STATIC'),
      'simulation', jsonb_build_object('resourceCode', ext_code || '-EXPERIMENT',
                                       'sha256', public.cf11_text_sha256(lab_html),
                                       'renderMode','INTERACTIVE',
                                       'csp', lab_contract)),
    'questions', jsonb_build_object('official', to_jsonb(official_codes),
                                    'selfTest', to_jsonb(self_codes)),
    'assessment', jsonb_build_object('code', ext_code || '-SELFTEST', 'memberCount', 40),
    'lifecycle', jsonb_build_object('from','DRAFT','to','REVIEW',
                                    'capabilities', to_jsonb(public.cf10_required_capabilities())));
  plan_sha := public.cf11_text_sha256(plan::text);

  IF _mode = 'DRY_RUN' THEN
    RETURN jsonb_build_object('mode','DRY_RUN','batch_id',_batch_id,'lesson_id',lesson_row.id,
      'plan', plan, 'plan_sha256', plan_sha, 'writes_performed', 0, 'idempotent', false);
  END IF;

  IF _expected_plan_sha256 IS DISTINCT FROM plan_sha THEN
    RAISE EXCEPTION 'CF11_WRITE_PLAN_HASH_MISMATCH' USING ERRCODE = '23514';
  END IF;

  -- ===================================== EXECUTE =======================================

  -- 1) asset registry
  FOR asset IN SELECT value FROM jsonb_array_elements(coalesce(_assets,'[]'::jsonb)) LOOP
    INSERT INTO public.golden_lesson_published_assets(
      batch_id, lesson_id, asset_code, file_name, mime_type, sha256, byte_size,
      storage_bucket, storage_path, alt_text_ar, published_by)
    VALUES (_batch_id, lesson_row.id, asset->>'assetCode', asset->>'fileName',
            asset->>'mimeType', asset->>'sha256', (asset->>'bytes')::bigint,
            asset->>'storageBucket', asset->>'storagePath', asset->>'altTextAr', uid)
    ON CONFLICT (lesson_id, asset_code) DO NOTHING;
    GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;
  END LOOP;

  -- 2) official body: declared references only
  IF book_new IS DISTINCT FROM book_old THEN
    UPDATE public.lesson_book_contents SET content = book_new WHERE lesson_id = lesson_row.id;
    GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;
  END IF;

  -- 3) mind map + lab experiment resources
  FOREACH cap IN ARRAY ARRAY['mindMap','simulation'] LOOP
    v_resource_code := CASE cap WHEN 'mindMap' THEN ext_code || '-MINDMAP'
                              ELSE ext_code || '-EXPERIMENT' END;
    IF EXISTS (SELECT 1 FROM public.lesson_resources
                WHERE lesson_id = lesson_row.id AND resource_code = v_resource_code) THEN
      RAISE EXCEPTION 'CF11_RESOURCE_ALREADY_EXISTS: %', v_resource_code USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.lesson_resources(
      lesson_id, resource_type, title, url, description, sort_order,
      resource_code, html_resource_type, metadata, is_primary)
    VALUES (
      lesson_row.id,
      (CASE cap WHEN 'mindMap' THEN 'mindmap' ELSE 'experiment' END)::public.lesson_resource_type,
      CASE cap WHEN 'mindMap' THEN 'الخريطة الذهنية' ELSE 'التجربة العملية' END,
      public.cf10_inline_html_url(v_resource_code),
      CASE cap WHEN 'mindMap' THEN mind_html ELSE lab_html END,
      CASE cap WHEN 'mindMap' THEN 4 ELSE 5 END,
      v_resource_code,
      CASE cap WHEN 'mindMap' THEN 'mindmap' ELSE 'experiment' END,
      jsonb_build_object(
        'cf11_publication_id', publication_id,
        'cf11_published_at', now(),
        'cf11_published_by', uid,
        'cf11_body_sha256', public.cf11_text_sha256(
          CASE cap WHEN 'mindMap' THEN mind_html ELSE lab_html END),
        'cf11_render_mode', CASE cap WHEN 'mindMap' THEN 'STATIC' ELSE 'INTERACTIVE' END,
        'cf11_verified_bundle_sha256', batch.verified_bundle_sha256,
        'cf11_csp', CASE cap WHEN 'simulation' THEN lab_contract ELSE NULL END),
      false);
    GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;
  END LOOP;

  -- 4) publish the current revision of all 45 questions (answers stay confidential)
  FOR q IN
    SELECT qq.id AS question_id, qq.code,
           (SELECT rv.id FROM public.question_revisions rv
             WHERE rv.question_id = qq.id ORDER BY rv.revision_number DESC LIMIT 1) AS revision_id
      FROM public.questions qq
     WHERE qq.lesson_id = lesson_row.id AND qq.code = ANY (question_codes)
     ORDER BY qq.code
  LOOP
    IF q.revision_id IS NULL THEN
      RAISE EXCEPTION 'CF11_QUESTION_REVISION_MISSING: %', q.code USING ERRCODE = '23514';
    END IF;
    UPDATE public.question_revisions
       SET status = 'PUBLISHED', published_at = now(), published_by = uid,
           reviewed_at = coalesce(reviewed_at, now()), reviewed_by = coalesce(reviewed_by, uid)
     WHERE id = q.revision_id AND status <> 'PUBLISHED';
    GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;

    UPDATE public.question_revisions
       SET status = 'SUPERSEDED', superseded_at = coalesce(superseded_at, now())
     WHERE question_id = q.question_id AND id <> q.revision_id AND status = 'PUBLISHED';
    GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;

    UPDATE public.questions SET current_published_revision_id = q.revision_id
     WHERE id = q.question_id AND current_published_revision_id IS DISTINCT FROM q.revision_id;
    GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;
  END LOOP;

  -- 5) assessment membership: EXACTLY the 40 self-test questions
  SELECT id INTO v_assessment_id FROM public.lesson_assessments
   WHERE lesson_id = lesson_row.id AND assessment_code = ext_code || '-SELFTEST';
  IF v_assessment_id IS NULL THEN
    RAISE EXCEPTION 'CF11_ASSESSMENT_SHELL_MISSING' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.assessment_questions(assessment_id, question_id, sort_order, points)
  SELECT v_assessment_id, qq.id, row_number() OVER (ORDER BY qq.code) - 1, 1
    FROM public.questions qq
   WHERE qq.lesson_id = lesson_row.id AND qq.code = ANY (self_codes)
     AND NOT EXISTS (SELECT 1 FROM public.assessment_questions aq
                      WHERE aq.assessment_id = v_assessment_id AND aq.question_id = qq.id);
  GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;

  SELECT count(*) INTO member_count FROM public.assessment_questions
   WHERE assessment_id = v_assessment_id;
  SELECT count(*) INTO official_in_assessment
    FROM public.assessment_questions aq
    JOIN public.questions qq ON qq.id = aq.question_id
   WHERE aq.assessment_id = v_assessment_id AND qq.code = ANY (official_codes);
  IF member_count <> 40 OR official_in_assessment <> 0 THEN
    RAISE EXCEPTION 'CF11_ASSESSMENT_MEMBERSHIP_CONTRACT: members=% official=%',
      member_count, official_in_assessment USING ERRCODE = '23514';
  END IF;

  -- 6) lifecycle DRAFT -> REVIEW for the exact seven capabilities. No READY here, ever.
  FOREACH cap IN ARRAY public.cf10_required_capabilities() LOOP
    PERFORM public.lesson_capability_transition(
      lesson_row.id,
      CASE cap WHEN 'mindMapHtml' THEN 'mindMap'
               WHEN 'labExperimentHtml' THEN 'simulation'
               WHEN 'officialBookContent' THEN 'officialBookContent'
               WHEN 'officialBookQuestions' THEN 'officialBookQuestions'
               WHEN 'tamkeenExplanationHtml' THEN 'tamkeenExplanation'
               WHEN 'lessonSummaryHtml' THEN 'lessonSummary'
               ELSE 'selfTest' END,
      'REVIEW', NULL, NULL);
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle
              WHERE lesson_id = lesson_row.id AND status = 'READY') THEN
    RAISE EXCEPTION 'CF11_READY_NOT_ALLOWED_IN_PUBLISH' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.golden_lesson_publications(
    id, batch_id, lesson_id, binding_id, plan_sha256, result, idempotency_key, published_by)
  VALUES (publication_id, _batch_id, lesson_row.id, binding.id, plan_sha,
          plan || jsonb_build_object('publicationId', publication_id,
                                     'writesPerformed', writes,
                                     'lifecycleStatus','REVIEW'),
          _idempotency_key, uid);

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (uid, 'golden_lesson_cf11_publish', 'lesson_capability', lesson_row.id,
          jsonb_build_object('batchId',_batch_id,'publicationId',publication_id,
                             'planSha256',plan_sha,'writes',writes));

  RETURN jsonb_build_object('mode','EXECUTE','batch_id',_batch_id,'lesson_id',lesson_row.id,
    'publication_id', publication_id, 'plan', plan, 'plan_sha256', plan_sha,
    'writes_performed', writes, 'idempotent', false, 'lifecycle_status','REVIEW',
    'student_visible', public.lesson_student_visible(lesson_row.id),
    'html_publication_pending', jsonb_build_object(
      'mindMap', public.cf10_html_publication_pending(lesson_row.id,'mindMap'),
      'simulation', public.cf10_html_publication_pending(lesson_row.id,'simulation')));
END $$;

-- ------------------------------------------------------------------------------------
-- 7) READY attestation RPC: REVIEW -> READY, second human, full re-verification.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.golden_lesson_attest_cf11_ready(
  _batch_id uuid,
  _actor_id uuid,
  _evidence jsonb DEFAULT '{}'::jsonb,
  _mode text DEFAULT 'DRY_RUN'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := auth.uid();
  pub public.golden_lesson_publications;
  lesson_row public.lessons;
  cap text;
  lifecycle_cap text;
  snap jsonb;
  snap_hash text;
  checks jsonb := '[]'::jsonb;
  transitions integer := 0;
  leak_count integer := 0;
BEGIN
  IF _mode NOT IN ('DRY_RUN','EXECUTE') THEN
    RAISE EXCEPTION 'CF11_INVALID_MODE' USING ERRCODE = '22023';
  END IF;
  IF uid IS NULL OR _actor_id IS NULL OR uid <> _actor_id THEN
    RAISE EXCEPTION 'CF11_ACTOR_IDENTITY_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_golden_lesson_content_staff(uid) THEN
    RAISE EXCEPTION 'CF11_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO pub FROM public.golden_lesson_publications WHERE batch_id = _batch_id FOR UPDATE;
  IF pub.id IS NULL THEN
    RAISE EXCEPTION 'CF11_PUBLICATION_MISSING' USING ERRCODE = 'P0002';
  END IF;
  -- Separation of duties: the reviewer who published cannot also attest READY.
  IF pub.published_by = uid THEN
    RAISE EXCEPTION 'CF11_SEPARATION_OF_DUTIES' USING ERRCODE = '42501';
  END IF;
  IF pub.ready_attested_at IS NOT NULL THEN
    RETURN pub.result || jsonb_build_object('idempotent', true, 'transitions', 0,
      'ready_attested_by', pub.ready_attested_by, 'ready_attested_at', pub.ready_attested_at);
  END IF;

  -- Explicit human evidence. No default, no inference.
  IF coalesce((_evidence->>'reviewedContent')::boolean,false) IS DISTINCT FROM true
     OR coalesce((_evidence->>'reviewedSecurity')::boolean,false) IS DISTINCT FROM true
     OR coalesce(btrim(_evidence->>'note'),'') = '' THEN
    RAISE EXCEPTION 'CF11_READY_EVIDENCE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO lesson_row FROM public.lessons WHERE id = pub.lesson_id FOR UPDATE;
  IF lesson_row.is_free IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CF11_LESSON_NOT_FREE' USING ERRCODE = '23514';
  END IF;

  -- Required capability coverage: the exact seven rows, none missing.
  IF (SELECT count(*) FROM public.lesson_capability_lifecycle WHERE lesson_id = lesson_row.id) <> 7 THEN
    RAISE EXCEPTION 'CF11_CAPABILITY_SET_NOT_EXACTLY_SEVEN' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle
              WHERE lesson_id = lesson_row.id AND status NOT IN ('REVIEW','READY')) THEN
    RAISE EXCEPTION 'CF11_READY_REQUIRES_REVIEW_FOR_ALL' USING ERRCODE = '23514';
  END IF;

  -- HTML publication really happened (truthful probe, not a marker).
  IF public.cf10_html_publication_pending(lesson_row.id,'mindMap')
     OR public.cf10_html_publication_pending(lesson_row.id,'simulation') THEN
    RAISE EXCEPTION 'CF11_HTML_NOT_PUBLISHED' USING ERRCODE = '23514';
  END IF;

  -- Declared assets still registered and still resolvable through private storage.
  IF EXISTS (
    SELECT 1 FROM public.golden_lesson_published_assets a
     WHERE a.lesson_id = lesson_row.id
       AND NOT EXISTS (SELECT 1 FROM storage.objects o
                        WHERE o.bucket_id = a.storage_bucket AND o.name = a.storage_path)
  ) THEN
    RAISE EXCEPTION 'CF11_ASSET_OBJECT_VANISHED' USING ERRCODE = '23514';
  END IF;

  -- Answer leak = 0 across every student-reachable body.
  SELECT count(*) INTO leak_count FROM (
    SELECT b.content AS body FROM public.lesson_book_contents b WHERE b.lesson_id = lesson_row.id
    UNION ALL SELECT e.content FROM public.lesson_explanations e WHERE e.lesson_id = lesson_row.id
    UNION ALL SELECT s.summary FROM public.lesson_summaries s WHERE s.lesson_id = lesson_row.id
    UNION ALL SELECT r.description FROM public.lesson_resources r WHERE r.lesson_id = lesson_row.id
    UNION ALL SELECT rv.question_text FROM public.question_revisions rv
                JOIN public.questions qq ON qq.id = rv.question_id
               WHERE qq.lesson_id = lesson_row.id
  ) t WHERE t.body ~* '"(correct_option|correct_answer|correct_index|is_correct|answer_key|model_answer|rationale|rationales)"';
  IF leak_count > 0 THEN
    RAISE EXCEPTION 'CF11_ANSWER_LEAK_DETECTED: %', leak_count USING ERRCODE = '23514';
  END IF;

  -- Per-capability snapshot/hash verification.
  FOREACH lifecycle_cap IN ARRAY ARRAY['officialBookContent','tamkeenExplanation','lessonSummary',
                                       'mindMap','simulation','officialBookQuestions','selfTest'] LOOP
    snap := public.v3_capability_snapshot(lesson_row.id, lifecycle_cap);
    IF snap IS NULL OR NOT public.v3_capability_snapshot_is_reconcilable(snap) THEN
      RAISE EXCEPTION 'CF11_SNAPSHOT_NOT_RECONCILABLE: %', lifecycle_cap USING ERRCODE = '23514';
    END IF;
    snap_hash := public.v3_capability_snapshot_hash(snap);
    checks := checks || jsonb_build_object('capability', lifecycle_cap, 'hash', snap_hash);
    IF _mode = 'EXECUTE' THEN
      IF (SELECT status FROM public.lesson_capability_lifecycle
           WHERE lesson_id = lesson_row.id AND capability = lifecycle_cap) = 'REVIEW' THEN
        PERFORM public.lesson_capability_transition(lesson_row.id, lifecycle_cap,
                                                    'READY', snap, snap_hash);
        transitions := transitions + 1;
      END IF;
    END IF;
  END LOOP;

  IF _mode = 'DRY_RUN' THEN
    RETURN jsonb_build_object('mode','DRY_RUN','batch_id',_batch_id,'lesson_id',lesson_row.id,
      'checks', checks, 'transitions', 0, 'would_be_student_visible', false);
  END IF;

  UPDATE public.golden_lesson_publications
     SET ready_attested_by = uid, ready_attested_at = now(), ready_evidence = _evidence
   WHERE id = pub.id;

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (uid, 'golden_lesson_cf11_ready_attested', 'lesson_capability', lesson_row.id,
          jsonb_build_object('batchId',_batch_id,'publicationId',pub.id,
                             'transitions',transitions,'evidence',_evidence));

  RETURN jsonb_build_object('mode','EXECUTE','batch_id',_batch_id,'lesson_id',lesson_row.id,
    'checks', checks, 'transitions', transitions,
    'student_visible', public.lesson_student_visible(lesson_row.id),
    'published_by', pub.published_by, 'ready_attested_by', uid);
END $$;

-- ------------------------------------------------------------------------------------
-- 8) Grants. Both RPCs are role-gated internally and derive the actor from auth.uid().
-- ------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.golden_lesson_publish_cf11(uuid, uuid, text, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.golden_lesson_attest_cf11_ready(uuid, uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.golden_lesson_publish_cf11(uuid, uuid, text, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.golden_lesson_attest_cf11_ready(uuid, uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cf11_asset_url(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cf11_text_sha256(text) TO authenticated;
