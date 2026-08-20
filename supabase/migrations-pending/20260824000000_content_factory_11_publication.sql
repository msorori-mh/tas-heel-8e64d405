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
  -- CF11-R4 addendum: the publication ledger's idempotency key is NOT NULL and non-empty.
  -- A legacy CF11 ledger row without a durable key can never be replay-guarded, and the ledger
  -- is append-only (never rewritten), so the migration must refuse to install over one.
  IF to_regclass('public.golden_lesson_publications') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.golden_lesson_publications
       WHERE idempotency_key IS NULL OR length(btrim(idempotency_key)) < 8
    ) THEN
      RAISE EXCEPTION 'CF11_PREFLIGHT_LEGACY_PUBLICATION_WITHOUT_IDEMPOTENCY_KEY: forward remediation migration required'
        USING ERRCODE = '23514';
    END IF;
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
-- 2) Append-only ledgers.
--
--    R3 hardening: NOTHING may write these tables directly — not `authenticated`, not `anon`
--    and not `service_role`. Every row is appended by a SECURITY DEFINER RPC that first proves
--    the human actor, and UPDATE / DELETE / TRUNCATE are refused unconditionally by triggers.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_golden_publication_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'CF11_LEDGER_IMMUTABLE' USING ERRCODE = '42501';
END $$;

-- 2.1) Registry of published assets (content-addressed, no overwrite on hash change).
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
  attestation_sha256 text NOT NULL,
  alt_text_ar text,
  published_by uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golden_lesson_published_assets_leaf_name_chk
    CHECK (file_name !~ '[/\\]' AND file_name !~ '\.\.' AND file_name ~ '^[a-z0-9][a-z0-9._-]{0,95}$'),
  CONSTRAINT golden_lesson_published_assets_mime_chk
    CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  CONSTRAINT golden_lesson_published_assets_sha_chk CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT golden_lesson_published_assets_attestation_chk CHECK (attestation_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT golden_lesson_published_assets_size_chk CHECK (byte_size BETWEEN 64 AND 2097152),
  CONSTRAINT golden_lesson_published_assets_bucket_chk CHECK (storage_bucket = 'golden-lesson-assets'),
  CONSTRAINT golden_lesson_published_assets_unique UNIQUE (lesson_id, asset_code)
);

-- 2.2) Immutable MACHINE upload attestation: the ONLY proof that real bytes reached private
--      storage. CF11-R5: a human can no longer claim it. The attestation is appended by the
--      server after it downloaded the object back out of the bucket and re-measured the bytes
--      (sha256 / size / magic-verified MIME), and it is bound to the ACTUAL storage object
--      identity (id + version + etag + storage-side size/mimetype metadata). The human operator
--      who requested the verification is recorded as `requested_by` — evidence of intent, never
--      evidence of bytes. A name-only storage.objects row can never satisfy it.
CREATE TABLE IF NOT EXISTS public.golden_lesson_asset_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.golden_lesson_domain_stage_batches(id) ON DELETE RESTRICT,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
  asset_code text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  sha256 text NOT NULL,
  byte_size bigint NOT NULL,
  magic_hex text NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  storage_object_id uuid NOT NULL,
  storage_version text NOT NULL,
  storage_etag text NOT NULL,
  attestation_sha256 text NOT NULL,
  verification_origin text NOT NULL,
  requested_by uuid NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golden_lesson_asset_attestations_sha_chk CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT golden_lesson_asset_attestations_att_chk CHECK (attestation_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT golden_lesson_asset_attestations_origin_chk
    CHECK (verification_origin = 'SERVER_BYTE_READBACK'),
  CONSTRAINT golden_lesson_asset_attestations_mime_chk
    CHECK (mime_type IN ('image/png','image/jpeg','image/webp')),
  CONSTRAINT golden_lesson_asset_attestations_size_chk CHECK (byte_size BETWEEN 64 AND 2097152),
  CONSTRAINT golden_lesson_asset_attestations_bucket_chk CHECK (storage_bucket = 'golden-lesson-assets'),
  CONSTRAINT golden_lesson_asset_attestations_magic_chk CHECK (magic_hex ~ '^[0-9a-f]{8,32}$'),
  CONSTRAINT golden_lesson_asset_attestations_unique UNIQUE (lesson_id, asset_code)
);


-- 2.3) Publication ledger (one row per successfully published batch, never updated).
CREATE TABLE IF NOT EXISTS public.golden_lesson_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL UNIQUE REFERENCES public.golden_lesson_domain_stage_batches(id) ON DELETE RESTRICT,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
  binding_id uuid NOT NULL REFERENCES public.golden_lesson_identity_bindings(id) ON DELETE RESTRICT,
  plan_sha256 text NOT NULL,
  manifest_assets_sha256 text NOT NULL,
  asset_attestation_sha256 text NOT NULL,
  result jsonb NOT NULL,
  -- CF11-R5: never NULL. A ledger row without a durable key cannot be replay-guarded.
  idempotency_key text NOT NULL,

  published_by uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golden_lesson_publications_plan_sha_chk CHECK (plan_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT golden_lesson_publications_manifest_sha_chk CHECK (manifest_assets_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT golden_lesson_publications_attestation_sha_chk CHECK (asset_attestation_sha256 ~ '^[0-9a-f]{64}$')
);

-- 2.4) READY attestation evidence: a SEPARATE append-only record. The publication row is never
--      mutated to carry it, so "published" and "attested READY" are two independent facts.
CREATE TABLE IF NOT EXISTS public.golden_lesson_ready_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL UNIQUE REFERENCES public.golden_lesson_publications(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL UNIQUE REFERENCES public.golden_lesson_domain_stage_batches(id) ON DELETE RESTRICT,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
  published_by uuid NOT NULL,
  attested_by uuid NOT NULL,
  attested_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL,
  checks jsonb NOT NULL,
  snapshot_set_sha256 text NOT NULL,
  asset_attestation_sha256 text NOT NULL,
  CONSTRAINT golden_lesson_ready_attestations_separation_chk CHECK (attested_by <> published_by),
  CONSTRAINT golden_lesson_ready_attestations_snapshot_chk CHECK (snapshot_set_sha256 ~ '^[0-9a-f]{64}$')
);

-- 2.5) CF11-R7 — controlled withdrawal ledger. Append-only, one row per withdrawn publication.
--      The READY evidence it withdraws is COPIED here, never deleted or mutated: withdrawal is a
--      forward, audited fact, not an erasure. `lesson_capability_transition` accepts only
--      DRAFT / REVIEW / READY and refuses READY -> REVIEW (`REVIEW_REQUIRES_DRAFT`), so the only
--      supported non-visible forward state for an already-READY capability is DRAFT.
CREATE TABLE IF NOT EXISTS public.golden_lesson_ready_revocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL UNIQUE REFERENCES public.golden_lesson_publications(id) ON DELETE RESTRICT,
  ready_attestation_id uuid NOT NULL UNIQUE REFERENCES public.golden_lesson_ready_attestations(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL UNIQUE REFERENCES public.golden_lesson_domain_stage_batches(id) ON DELETE RESTRICT,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  capabilities text[] NOT NULL,
  to_status text NOT NULL,
  preserved_evidence jsonb NOT NULL,
  idempotency_key text NOT NULL,
  revoked_by uuid NOT NULL,
  attested_by uuid NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golden_lesson_ready_revocations_reason_chk CHECK (length(btrim(reason)) >= 12),
  CONSTRAINT golden_lesson_ready_revocations_status_chk CHECK (to_status = 'DRAFT'),
  CONSTRAINT golden_lesson_ready_revocations_key_chk CHECK (length(btrim(idempotency_key)) >= 8),
  CONSTRAINT golden_lesson_ready_revocations_separation_chk CHECK (revoked_by <> attested_by)
);

-- 2.6) Grants: SELECT only, for everyone. Direct writes are impossible by privilege AND by trigger.
DO $ledger$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['golden_lesson_published_assets','golden_lesson_asset_attestations',
                           'golden_lesson_publications','golden_lesson_ready_attestations',
                           'golden_lesson_ready_revocations']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated, service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_staff_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_golden_lesson_content_staff(auth.uid()))',
                   t || '_staff_read', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_immutable_row', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_golden_publication_mutation()',
                   t || '_immutable_row', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_immutable_truncate', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.reject_golden_publication_mutation()',
                   t || '_immutable_truncate', t);
  END LOOP;
END
$ledger$;


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

-- ------------------------------------------------------------------------------------
-- CF11-R6 — THE canonical production lifecycle capability set.
--
-- Mirrors src/lib/lessons/capability-mapping.ts `V3_LIFECYCLE_CAPABILITIES` exactly, sorted so
-- it can be compared with `=`/`IS DISTINCT FROM` against a sorted live aggregate. Every gate in
-- this migration compares the SET, never a count and never statuses alone: a lesson carrying
-- seven rows with one substituted, duplicated-equivalent or retired name is rejected.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf11_lifecycle_capabilities()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT ARRAY['checkUnderstanding','lessonAssessment','mindMap','officialBookContent',
               'quickReview','simulation','tamkeenExplanation']::text[];
$$;

-- The live, sorted, de-duplicated lifecycle capability set of one lesson.
CREATE OR REPLACE FUNCTION public.cf11_live_lifecycle_capabilities(_lesson_id uuid)
RETURNS text[] LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(array_agg(DISTINCT capability ORDER BY capability), ARRAY[]::text[])
    FROM public.lesson_capability_lifecycle WHERE lesson_id = _lesson_id;
$$;

/**
 * Exact-set gate. Raises `<_code>` when the live set is not literally the canonical seven
 * (missing, extra, duplicate-equivalent, retired or substituted names all fail), and when the
 * live row count differs from seven (a duplicate row is not a valid set either).
 */
CREATE OR REPLACE FUNCTION public.cf11_assert_exact_lifecycle_set(_lesson_id uuid, _code text)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  live text[] := public.cf11_live_lifecycle_capabilities(_lesson_id);
  want text[] := public.cf11_lifecycle_capabilities();
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle WHERE lesson_id = _lesson_id;
  IF live IS DISTINCT FROM want OR n <> array_length(want,1) THEN
    RAISE EXCEPTION '%: live=[%] expected=[%] rows=%',
      _code, array_to_string(live,','), array_to_string(want,','), n USING ERRCODE = '23514';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.cf11_lifecycle_capabilities() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cf11_live_lifecycle_capabilities(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cf11_assert_exact_lifecycle_set(uuid, text) TO authenticated, service_role;

/**
 * CF11-R7 — exact SET *and* applicability. Set equality alone is not enough: a row parked at
 * applicability OPTIONAL / NA is silently excused from the readiness contract while the set still
 * looks complete. Every one of the canonical seven must exist exactly once AND be REQUIRED.
 * Enforced at publication plan, publication replay, first READY and READY replay.
 */
CREATE OR REPLACE FUNCTION public.cf11_assert_exact_required_lifecycle_set(_lesson_id uuid, _code text)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE bad text[];
BEGIN
  PERFORM public.cf11_assert_exact_lifecycle_set(_lesson_id, _code);
  SELECT coalesce(array_agg(capability || ':' || applicability::text ORDER BY capability),
                  ARRAY[]::text[])
    INTO bad
    FROM public.lesson_capability_lifecycle
   WHERE lesson_id = _lesson_id AND applicability <> 'REQUIRED';
  IF coalesce(array_length(bad,1),0) > 0 THEN
    RAISE EXCEPTION 'CF11_LIFECYCLE_APPLICABILITY_NOT_REQUIRED %: [%]', _code,
      array_to_string(bad, ',') USING ERRCODE = '23514';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.cf11_assert_exact_required_lifecycle_set(uuid, text)
  TO authenticated, service_role;



-- base64 sha256 of one inline script body, i.e. the value a CSP `sha256-...` token must carry.
CREATE OR REPLACE FUNCTION public.cf11_script_csp_hash(_script text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT encode(extensions.digest(convert_to(coalesce(_script,''),'UTF8'),'sha256'),'base64');
$$;

-- Every inline <script>…</script> body of an HTML document, in document order.
CREATE OR REPLACE FUNCTION public.cf11_inline_scripts(_html text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(array_agg(m[1] ORDER BY ord), ARRAY[]::text[])
    FROM regexp_matches(coalesce(_html,''), '<script\y[^>]*>([\s\S]*?)</script\s*>', 'gi')
      WITH ORDINALITY AS t(m, ord);
$$;

-- Fail-closed: no external network reference of any kind may survive inside published HTML.
CREATE OR REPLACE FUNCTION public.cf11_assert_no_network(_label text, _html text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF _html ~* '(https?:)?//[a-z0-9]' THEN
    RAISE EXCEPTION 'CF11_HTML_EXTERNAL_URL: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '\y(src|href|action|formaction|data|poster)\s*=\s*["'']?\s*data:' THEN
    RAISE EXCEPTION 'CF11_HTML_DATA_URI: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '<(iframe|object|embed|form|link|base)\y' THEN
    RAISE EXCEPTION 'CF11_HTML_FORBIDDEN_ELEMENT: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '\yon[a-z]+\s*=\s*["'']' THEN
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
  IF _html ~* '<script\y' THEN
    RAISE EXCEPTION 'CF11_STATIC_HTML_HAS_SCRIPT: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html !~* '<details\y' OR _html !~* '<summary\y' THEN
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

  -- Two explicit delimiter alternatives with negated character classes. A back-reference plus
  -- a non-greedy `.*?` is NOT usable here: Postgres ARE derives greediness from the FIRST
  -- quantifier in the branch (the leading \s+), so `.*?` would still run to the last quote and
  -- swallow the whole document into the "CSP".
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
  IF csp ~* 'unsafe-inline|unsafe-eval|\*' THEN
    RAISE EXCEPTION 'CF11_LAB_CSP_UNSAFE: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html !~* 'data-tamkeen-sandbox\s*=\s*["'']allow-scripts["'']' THEN
    RAISE EXCEPTION 'CF11_LAB_SANDBOX_CONTRACT_MISSING: %', _label USING ERRCODE = '23514';
  END IF;
  IF _html ~* '<script\y[^>]*\ysrc\s*=' THEN
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
      '<img\y[^>]*\ysrc\s*=\s*["'']([^"''>]+)["'']', 'gi') AS t(m);
$$;

-- ------------------------------------------------------------------------------------
-- 4b) THE asset declaration authority (R3).
--     The ONLY source of truth for what a Golden Lesson may ship is the verified package
--     manifest that CF07 already hash-pinned. No client, no server function and no operator
--     can add, drop or edit a declaration: they are derived here, deterministically, from
--     golden_lesson_package_versions.manifest -> 'assets'.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf11_magic_matches(_mime text, _hex text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE lower(coalesce(_mime,''))
    WHEN 'image/jpeg' THEN lower(coalesce(_hex,'')) LIKE 'ffd8ff%'
    WHEN 'image/png'  THEN lower(coalesce(_hex,'')) LIKE '89504e470d0a1a0a%'
    WHEN 'image/webp' THEN lower(coalesce(_hex,'')) LIKE '52494646%'
                       AND substr(lower(coalesce(_hex,'')), 17, 8) = '57454250'
    ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.cf11_asset_extension_ok(_mime text, _leaf text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE lower(coalesce(_mime,''))
    WHEN 'image/jpeg' THEN _leaf ~ '\.(jpg|jpeg)$'
    WHEN 'image/png'  THEN _leaf ~ '\.png$'
    WHEN 'image/webp' THEN _leaf ~ '\.webp$'
    ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.cf11_manifest_assets(_manifest jsonb, _lesson_id uuid)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  a jsonb;
  leaf text;
  code text;
  mime text;
  sha text;
  sz bigint;
  seen text[] := ARRAY[]::text[];
  out_arr jsonb := '[]'::jsonb;
BEGIN
  IF _manifest ? 'assets' AND jsonb_typeof(_manifest->'assets') <> 'array' THEN
    RAISE EXCEPTION 'CF11_MANIFEST_ASSETS_MALFORMED' USING ERRCODE = '23514';
  END IF;
  FOR a IN
    SELECT value FROM jsonb_array_elements(coalesce(_manifest->'assets','[]'::jsonb))
     ORDER BY value->>'assetCode'
  LOOP
    code := a->>'assetCode';
    leaf := a->>'path';
    mime := a->>'mimeType';
    sha  := a->>'sha256';
    IF coalesce(code,'') !~ '^[A-Z0-9][A-Z0-9-]{2,63}$' THEN
      RAISE EXCEPTION 'CF11_ASSET_CODE_INVALID: %', coalesce(code,'<null>') USING ERRCODE = '23514';
    END IF;
    IF leaf IS NULL OR leaf ~ '[/\\]' OR leaf ~ '\.\.' OR leaf !~ '^[a-z0-9][a-z0-9._-]{0,63}$' THEN
      RAISE EXCEPTION 'CF11_ASSET_NOT_LEAF: %', coalesce(leaf,'<null>') USING ERRCODE = '23514';
    END IF;
    IF mime NOT IN ('image/png','image/jpeg','image/webp') THEN
      RAISE EXCEPTION 'CF11_ASSET_MIME_FORBIDDEN: %', coalesce(mime,'<null>') USING ERRCODE = '23514';
    END IF;
    IF NOT public.cf11_asset_extension_ok(mime, leaf) THEN
      RAISE EXCEPTION 'CF11_ASSET_EXTENSION_MISMATCH: % %', mime, leaf USING ERRCODE = '23514';
    END IF;
    IF coalesce(sha,'') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'CF11_ASSET_SHA_INVALID: %', code USING ERRCODE = '23514';
    END IF;
    IF jsonb_typeof(a->'bytes') <> 'number' THEN
      RAISE EXCEPTION 'CF11_ASSET_SIZE_INVALID: %', code USING ERRCODE = '23514';
    END IF;
    sz := (a->>'bytes')::bigint;
    IF sz < 64 OR sz > 2097152 THEN
      RAISE EXCEPTION 'CF11_ASSET_SIZE_OUT_OF_RANGE: % %', code, sz USING ERRCODE = '23514';
    END IF;
    IF code = ANY (seen) OR leaf = ANY (seen) THEN
      RAISE EXCEPTION 'CF11_ASSET_DUPLICATE: %', code USING ERRCODE = '23514';
    END IF;
    seen := seen || code || leaf;
    out_arr := out_arr || jsonb_build_object(
      'assetCode', code,
      'fileName', leaf,
      'mimeType', mime,
      'sha256', sha,
      'bytes', sz,
      'altTextAr', a->>'altTextAr',
      'storageBucket', 'golden-lesson-assets',
      'storagePath', _lesson_id::text || '/' || sha || '-' || leaf);
  END LOOP;
  RETURN out_arr;
END $$;

-- Canonical hash of ONE upload attestation: measured bytes bound to the live object identity,
-- plus the verification origin (CF11-R5: only a server byte readback may ever be hashed here).
CREATE OR REPLACE FUNCTION public.cf11_attestation_hash(
  _lesson_id uuid, _asset_code text, _file_name text, _mime text, _sha256 text,
  _bytes bigint, _magic_hex text, _bucket text, _path text,
  _object_id uuid, _version text, _etag text, _origin text DEFAULT 'SERVER_BYTE_READBACK')
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT public.cf11_text_sha256(jsonb_build_object(
    'schema','tamkeen.content-factory-11.asset-attestation.v2',
    'lessonId', _lesson_id, 'assetCode', _asset_code, 'fileName', _file_name,
    'mimeType', _mime, 'sha256', _sha256, 'bytes', _bytes, 'magicHex', lower(_magic_hex),
    'bucket', _bucket, 'path', _path, 'verificationOrigin', _origin,
    'objectId', _object_id, 'objectVersion', _version, 'objectEtag', _etag)::text);
$$;


-- ------------------------------------------------------------------------------------
-- 4c) Upload attestation RPC — CF11-R5: MACHINE ONLY.
--     Appends ONE immutable row proving the real bytes reached the private bucket. It is a
--     measurement, not an approval, so it is executed by the server (service_role, no
--     `auth.uid()`) right after it downloaded the object back out of the bucket. A signed-in
--     human can no longer call it at all: an operator claim about bytes is not evidence.
--     The requesting human is recorded as `requested_by` and must be real content staff.
--     Refuses a storage.objects row that carries no size/mimetype metadata, so a fabricated
--     name-only row can never stand in for an upload.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.golden_lesson_attest_cf11_asset(
  _batch_id uuid,
  _requested_by uuid,
  _asset_code text,
  _observed_sha256 text,
  _observed_bytes bigint,
  _observed_mime text,
  _magic_hex text,
  _verification_origin text DEFAULT 'SERVER_BYTE_READBACK',
  _mode text DEFAULT 'EXECUTE'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := auth.uid();
  batch public.golden_lesson_domain_stage_batches;
  ver public.golden_lesson_package_versions;
  binding public.golden_lesson_identity_bindings;
  decl jsonb;
  obj record;
  obj_size bigint;
  obj_mime text;
  obj_etag text;
  att_hash text;
  existing public.golden_lesson_asset_attestations;
BEGIN
  IF _mode NOT IN ('DRY_RUN','EXECUTE') THEN
    RAISE EXCEPTION 'CF11_INVALID_MODE' USING ERRCODE = '22023';
  END IF;
  -- Machine-only: an end-user session (any auth.uid()) is refused outright.
  IF uid IS NOT NULL THEN
    RAISE EXCEPTION 'CF11_ASSET_ATTESTATION_MACHINE_ONLY' USING ERRCODE = '42501';
  END IF;
  IF _verification_origin IS DISTINCT FROM 'SERVER_BYTE_READBACK' THEN
    RAISE EXCEPTION 'CF11_ASSET_VERIFICATION_ORIGIN_INVALID: %',
      coalesce(_verification_origin,'<null>') USING ERRCODE = '42501';
  END IF;
  IF _requested_by IS NULL OR NOT public.is_golden_lesson_content_staff(_requested_by) THEN
    RAISE EXCEPTION 'CF11_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;


  SELECT * INTO batch FROM public.golden_lesson_domain_stage_batches WHERE id = _batch_id;
  IF batch.id IS NULL THEN
    RAISE EXCEPTION 'CF11_BATCH_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO ver FROM public.golden_lesson_package_versions
   WHERE package_id = batch.package_id AND version = batch.package_version;
  IF ver.id IS NULL OR ver.verified_bundle_sha256 IS DISTINCT FROM batch.verified_bundle_sha256 THEN
    RAISE EXCEPTION 'CF11_VERIFIED_BUNDLE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO binding FROM public.golden_lesson_identity_bindings WHERE batch_id = _batch_id;
  IF binding.id IS NULL THEN
    RAISE EXCEPTION 'CF11_IDENTITY_BINDING_MISSING' USING ERRCODE = '23514';
  END IF;

  SELECT value INTO decl
    FROM jsonb_array_elements(public.cf11_manifest_assets(ver.manifest, binding.lesson_id))
   WHERE value->>'assetCode' = _asset_code;
  IF decl IS NULL THEN
    RAISE EXCEPTION 'CF11_ASSET_NOT_DECLARED: %', coalesce(_asset_code,'<null>') USING ERRCODE = '23514';
  END IF;

  -- Measured bytes must equal the manifest declaration, exactly.
  IF lower(coalesce(_observed_sha256,'')) IS DISTINCT FROM decl->>'sha256' THEN
    RAISE EXCEPTION 'CF11_ASSET_BYTES_MISMATCH: %', _asset_code USING ERRCODE = '23514';
  END IF;
  IF _observed_bytes IS DISTINCT FROM (decl->>'bytes')::bigint THEN
    RAISE EXCEPTION 'CF11_ASSET_SIZE_MISMATCH: % got %', _asset_code, _observed_bytes USING ERRCODE = '23514';
  END IF;
  IF _observed_mime IS DISTINCT FROM decl->>'mimeType' THEN
    RAISE EXCEPTION 'CF11_ASSET_MIME_MISMATCH: % got %', _asset_code, coalesce(_observed_mime,'<null>')
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.cf11_magic_matches(_observed_mime, _magic_hex) THEN
    RAISE EXCEPTION 'CF11_ASSET_MAGIC_MISMATCH: % %', _asset_code, coalesce(_magic_hex,'<null>')
      USING ERRCODE = '23514';
  END IF;

  -- The live storage object, with real metadata. Name-only rows are refused.
  SELECT o.id, o.version, o.metadata INTO obj
    FROM storage.objects o
   WHERE o.bucket_id = 'golden-lesson-assets' AND o.name = decl->>'storagePath';
  IF obj.id IS NULL THEN
    RAISE EXCEPTION 'CF11_ASSET_OBJECT_MISSING: %', decl->>'storagePath' USING ERRCODE = '23514';
  END IF;
  IF obj.metadata IS NULL OR obj.version IS NULL
     OR NOT (obj.metadata ? 'size') OR NOT (obj.metadata ? 'mimetype')
     OR coalesce(obj.metadata->>'eTag', obj.metadata->>'etag','') = '' THEN
    RAISE EXCEPTION 'CF11_ASSET_OBJECT_METADATA_MISSING: %', decl->>'storagePath' USING ERRCODE = '23514';
  END IF;
  obj_size := (obj.metadata->>'size')::bigint;
  obj_mime := obj.metadata->>'mimetype';
  obj_etag := coalesce(obj.metadata->>'eTag', obj.metadata->>'etag');
  IF obj_size IS DISTINCT FROM (decl->>'bytes')::bigint OR obj_mime IS DISTINCT FROM decl->>'mimeType' THEN
    RAISE EXCEPTION 'CF11_ASSET_OBJECT_METADATA_MISMATCH: % size=% mime=%',
      _asset_code, obj_size, coalesce(obj_mime,'<null>') USING ERRCODE = '23514';
  END IF;

  att_hash := public.cf11_attestation_hash(binding.lesson_id, _asset_code, decl->>'fileName',
    decl->>'mimeType', decl->>'sha256', (decl->>'bytes')::bigint, _magic_hex,
    'golden-lesson-assets', decl->>'storagePath', obj.id, obj.version, obj_etag,
    _verification_origin);

  SELECT * INTO existing FROM public.golden_lesson_asset_attestations
   WHERE lesson_id = binding.lesson_id AND asset_code = _asset_code;
  IF existing.id IS NOT NULL THEN
    IF existing.attestation_sha256 IS DISTINCT FROM att_hash THEN
      RAISE EXCEPTION 'CF11_ASSET_ATTESTATION_CONFLICT: %', _asset_code USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object('mode',_mode,'assetCode',_asset_code,'idempotent',true,
      'writes_performed',0,'attestationSha256',att_hash);
  END IF;

  IF _mode = 'DRY_RUN' THEN
    RETURN jsonb_build_object('mode','DRY_RUN','assetCode',_asset_code,'idempotent',false,
      'writes_performed',0,'attestationSha256',att_hash);
  END IF;

  INSERT INTO public.golden_lesson_asset_attestations(
    batch_id, lesson_id, asset_code, file_name, mime_type, sha256, byte_size, magic_hex,
    storage_bucket, storage_path, storage_object_id, storage_version, storage_etag,
    attestation_sha256, verification_origin, requested_by)
  VALUES (_batch_id, binding.lesson_id, _asset_code, decl->>'fileName', decl->>'mimeType',
          decl->>'sha256', (decl->>'bytes')::bigint, lower(_magic_hex),
          'golden-lesson-assets', decl->>'storagePath', obj.id, obj.version, obj_etag,
          att_hash, _verification_origin, _requested_by);

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (_requested_by, 'golden_lesson_cf11_asset_attested', 'lesson_capability', binding.lesson_id,
          jsonb_build_object('batchId',_batch_id,'assetCode',_asset_code,
                             'attestationSha256',att_hash,
                             'verificationOrigin',_verification_origin,
                             'attestedBy','SERVER'));


  RETURN jsonb_build_object('mode','EXECUTE','assetCode',_asset_code,'idempotent',false,
    'writes_performed',1,'attestationSha256',att_hash);
END $$;



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
-- 5b) CF11-R5 — EXHAUSTIVE replay revalidation.
--
-- A replay may only report success when EVERY category the recorded write plan claims is still
-- literally true in the live database. "The ledger row exists" is not evidence; each category is
-- re-derived from live rows and any divergence raises a named conflict instead of silently
-- returning a stale success. Read-only: this function writes nothing, ever.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf11_assert_replay_state(_plan jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_lesson uuid := (_plan->>'lessonId')::uuid;
  v_ext text := _plan->>'externalLessonCode';
  a jsonb;
  cap text;
  v_code text;
  v_expected text;
  v_live text;
  v_count integer;
  v_official text[];
  v_self text[];
  v_assessment uuid;
  v_planned_assets text[];
  v_live_assets text[];
  v_planned_questions text[];
  v_live_questions text[];
  v_live_members text[];
  v_planned_member_ids text[];
  v_live_member_ids text[];
  verified jsonb := '[]'::jsonb;
BEGIN
  IF v_lesson IS NULL OR coalesce(v_ext,'') = '' THEN
    RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: plan' USING ERRCODE = '23505';
  END IF;

  -- 1) official body
  SELECT public.cf11_text_sha256(content) INTO v_live
    FROM public.lesson_book_contents WHERE lesson_id = v_lesson;
  IF v_live IS DISTINCT FROM (_plan->'bookContent'->>'afterSha256') THEN
    RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: bookContent' USING ERRCODE = '23505';
  END IF;
  verified := verified || to_jsonb('bookContent'::text);

  -- 2) published HTML artefacts, body-hash exact and still delivered inline
  FOREACH cap IN ARRAY ARRAY['mindMap','simulation'] LOOP
    v_code := _plan->'html'->cap->>'resourceCode';
    v_expected := _plan->'html'->cap->>'sha256';
    SELECT public.cf11_text_sha256(r.description) INTO v_live
      FROM public.lesson_resources r
     WHERE r.lesson_id = v_lesson AND r.resource_code = v_code
       AND r.url = public.cf10_inline_html_url(r.resource_code);
    IF v_live IS DISTINCT FROM v_expected
       OR public.cf10_html_publication_pending(v_lesson, cap) THEN
      RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: html.%', cap USING ERRCODE = '23505';
    END IF;
  END LOOP;
  verified := verified || to_jsonb('html'::text);

  -- 3) CF11-R6 — EXACT live asset set. Every planned asset must still be published with the same
  --    bytes, still carry its immutable machine attestation, and the storage object must still be
  --    the very same object version/eTag/metadata the attestation recorded. The *set* of published
  --    assets must equal the planned set exactly: an extra published asset fails just as hard as a
  --    missing one. NOTE (honesty): no byte readback happens here — SQL compares recorded identity
  --    and object metadata only. Byte readback is the machine server attestation step.
  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(_plan->'assets','[]'::jsonb)) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.golden_lesson_published_assets p
        JOIN public.golden_lesson_asset_attestations t
          ON t.lesson_id = p.lesson_id AND t.asset_code = p.asset_code
         AND t.attestation_sha256 = p.attestation_sha256
         AND t.verification_origin = 'SERVER_BYTE_READBACK'
         AND t.sha256 = p.sha256 AND t.byte_size = p.byte_size AND t.mime_type = p.mime_type
         AND t.storage_bucket = p.storage_bucket AND t.storage_path = p.storage_path
         AND t.attestation_sha256 = public.cf11_attestation_hash(
               t.lesson_id, t.asset_code, t.file_name, t.mime_type, t.sha256, t.byte_size,
               t.magic_hex, t.storage_bucket, t.storage_path, t.storage_object_id,
               t.storage_version, t.storage_etag, t.verification_origin)
        JOIN storage.objects o
          ON o.bucket_id = t.storage_bucket AND o.name = t.storage_path
         AND o.id = t.storage_object_id AND o.version = t.storage_version
         -- CF11-R8 — FAIL-CLOSED metadata: absent metadata is drift, never an implicit match.
         AND o.metadata IS NOT NULL
         AND (o.metadata ? 'size') AND (o.metadata ? 'mimetype')
         AND coalesce(o.metadata->>'eTag', o.metadata->>'etag', '') <> ''
         AND coalesce(o.metadata->>'eTag', o.metadata->>'etag') = t.storage_etag
         AND (o.metadata->>'size')::bigint = t.byte_size
         AND o.metadata->>'mimetype' = t.mime_type

       WHERE p.lesson_id = v_lesson AND p.asset_code = a->>'assetCode'
         AND p.sha256 = a->>'sha256' AND p.byte_size = (a->>'bytes')::bigint
         AND p.mime_type = a->>'mimeType'
         AND p.storage_path = a->>'storagePath'
    ) THEN
      RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: asset.%', a->>'assetCode'
        USING ERRCODE = '23505';
    END IF;
  END LOOP;
  SELECT coalesce(array_agg(DISTINCT e.v->>'assetCode' ORDER BY e.v->>'assetCode'),
                  ARRAY[]::text[]) INTO v_planned_assets
    FROM jsonb_array_elements(coalesce(_plan->'assets','[]'::jsonb)) AS e(v);
  SELECT coalesce(array_agg(DISTINCT asset_code ORDER BY asset_code), ARRAY[]::text[])
    INTO v_live_assets
    FROM public.golden_lesson_published_assets WHERE lesson_id = v_lesson;
  SELECT count(*) INTO v_count FROM public.golden_lesson_published_assets WHERE lesson_id = v_lesson;
  IF v_live_assets IS DISTINCT FROM v_planned_assets
     OR v_count IS DISTINCT FROM coalesce(array_length(v_planned_assets,1),0) THEN
    RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: assets live=[%] planned=[%]',
      array_to_string(v_live_assets,','), array_to_string(v_planned_assets,',')
      USING ERRCODE = '23505';
  END IF;
  verified := verified || to_jsonb('assets'::text);

  -- 4) CF11-R7 — EXACT PINNED question identity. The plan pins, per question,
  --    code + questionId + revisionId + payloadHash (+ sourcePayloadHash). Replay therefore
  --    rejects a same-count substitution: a swapped current_published_revision_id, a code
  --    re-pointed at a different question row, or a republished/edited payload all conflict.
  SELECT coalesce(array_agg(DISTINCT e.v->>'code' ORDER BY e.v->>'code'), ARRAY[]::text[])
    INTO v_official
    FROM jsonb_array_elements(coalesce(_plan->'questions'->'official','[]'::jsonb)) AS e(v);
  SELECT coalesce(array_agg(DISTINCT e.v->>'code' ORDER BY e.v->>'code'), ARRAY[]::text[])
    INTO v_self
    FROM jsonb_array_elements(coalesce(_plan->'questions'->'selfTest','[]'::jsonb)) AS e(v);
  v_planned_questions := ARRAY(SELECT unnest(v_official || v_self) ORDER BY 1);
  IF coalesce(array_length(v_planned_questions,1),0)
       <> jsonb_array_length(coalesce(_plan->'questions'->'official','[]'::jsonb))
        + jsonb_array_length(coalesce(_plan->'questions'->'selfTest','[]'::jsonb)) THEN
    RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: questionsDuplicatePlan' USING ERRCODE = '23505';
  END IF;

  FOR a IN SELECT value FROM jsonb_array_elements(
             coalesce(_plan->'questions'->'official','[]'::jsonb)
             || coalesce(_plan->'questions'->'selfTest','[]'::jsonb)) LOOP
    IF coalesce(a->>'questionId','') = '' OR coalesce(a->>'revisionId','') = ''
       OR coalesce(a->>'payloadHash','') = '' THEN
      RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: questionPlanUnpinned.%',
        coalesce(a->>'code','<null>') USING ERRCODE = '23505';
    END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM public.questions q
        JOIN public.question_revisions rv ON rv.id = q.current_published_revision_id
       WHERE q.lesson_id = v_lesson
         AND q.id = (a->>'questionId')::uuid
         AND q.code = a->>'code'
         AND rv.id = (a->>'revisionId')::uuid
         AND rv.question_id = q.id
         AND rv.status = 'PUBLISHED'
         AND rv.payload_hash IS NOT DISTINCT FROM (a->>'payloadHash')
         AND rv.source_payload_hash IS NOT DISTINCT FROM (a->>'sourcePayloadHash')
    ) THEN
      RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: questionRevision.%', a->>'code'
        USING ERRCODE = '23505';
    END IF;
  END LOOP;

  -- ...and the lesson carries no additional published question beyond the pinned set.
  SELECT coalesce(array_agg(DISTINCT q.code ORDER BY q.code), ARRAY[]::text[]) INTO v_live_questions
    FROM public.questions q
    JOIN public.question_revisions rv ON rv.id = q.current_published_revision_id
   WHERE q.lesson_id = v_lesson AND rv.status = 'PUBLISHED' AND rv.question_id = q.id;
  IF v_live_questions IS DISTINCT FROM v_planned_questions THEN
    RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: questions live=[%] planned=[%]',
      array_to_string(v_live_questions,','), array_to_string(v_planned_questions,',')
      USING ERRCODE = '23505';
  END IF;
  SELECT count(*) INTO v_count
    FROM public.questions q
    JOIN public.question_revisions rv ON rv.id = q.current_published_revision_id
   WHERE q.lesson_id = v_lesson AND q.code = ANY (v_planned_questions)
     AND rv.status = 'PUBLISHED' AND rv.question_id = q.id;
  IF v_count IS DISTINCT FROM coalesce(array_length(v_planned_questions,1),0) THEN
    RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: questionRevisions' USING ERRCODE = '23505';
  END IF;
  verified := verified || to_jsonb('questions'::text);

  -- 5) CF11-R7 — assessment membership equals the EXACT planned self-test question IDs *and*
  --    codes. A substituted member at an identical count fails on both comparisons, and zero
  --    official questions may leak into the student assessment.
  SELECT id INTO v_assessment FROM public.lesson_assessments
   WHERE lesson_id = v_lesson AND assessment_code = _plan->'assessment'->>'code';
  IF v_assessment IS NULL THEN
    RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: assessment' USING ERRCODE = '23505';
  END IF;
  SELECT coalesce(array_agg(DISTINCT e.v->>'questionId' ORDER BY e.v->>'questionId'),
                  ARRAY[]::text[]) INTO v_planned_member_ids
    FROM jsonb_array_elements(coalesce(_plan->'questions'->'selfTest','[]'::jsonb)) AS e(v);
  SELECT coalesce(array_agg(DISTINCT q.code ORDER BY q.code), ARRAY[]::text[]),
         coalesce(array_agg(DISTINCT aq.question_id::text ORDER BY aq.question_id::text),
                  ARRAY[]::text[]),
         count(*)
    INTO v_live_members, v_live_member_ids, v_count
    FROM public.assessment_questions aq
    JOIN public.questions q ON q.id = aq.question_id
   WHERE aq.assessment_id = v_assessment;
  IF v_live_members IS DISTINCT FROM v_self
     OR v_live_member_ids IS DISTINCT FROM v_planned_member_ids
     OR v_count IS DISTINCT FROM coalesce(array_length(v_self,1),0)
     OR v_count IS DISTINCT FROM (_plan->'assessment'->>'memberCount')::integer THEN
    RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: assessmentMembers live=[%] planned=[%]',
      array_to_string(v_live_members,','), array_to_string(v_self,',') USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.assessment_questions aq
               JOIN public.questions q ON q.id = aq.question_id
              WHERE aq.assessment_id = v_assessment
                AND q.code = ANY (coalesce(v_official,ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: assessmentOfficialLeak' USING ERRCODE = '23505';
  END IF;
  verified := verified || to_jsonb('assessment'::text);

  -- 6) CF11-R7 — the EXACT canonical seven lifecycle capabilities (set equality, not count),
  --    every one of them applicability='REQUIRED', none of them regressed below REVIEW.
  PERFORM public.cf11_assert_exact_required_lifecycle_set(
    v_lesson, 'CF11_REPLAY_LIVE_STATE_CONFLICT: lifecycle');
  IF EXISTS (
       SELECT 1 FROM public.lesson_capability_lifecycle
        WHERE lesson_id = v_lesson AND status NOT IN ('REVIEW','READY')) THEN
    RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: lifecycle live=[%]',
      array_to_string(public.cf11_live_lifecycle_capabilities(v_lesson), ',') USING ERRCODE = '23505';
  END IF;
  verified := verified || to_jsonb('lifecycle'::text);


  RETURN jsonb_build_object('revalidated', verified);
END $$;

GRANT EXECUTE ON FUNCTION public.cf11_assert_replay_state(jsonb) TO authenticated, service_role;


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
  declared_assets jsonb := '[]'::jsonb;
  manifest_assets_sha text;
  attestation_sha text;
  attestation_rows integer := 0;
  att public.golden_lesson_asset_attestations;
  obj_row record;
  lifecycle_caps text[];
  live_caps text[];
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
  official_plan jsonb := '[]'::jsonb;
  self_plan jsonb := '[]'::jsonb;
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

  -- --- authoritative asset declarations + upload attestations (R3) ----------------------
  -- The declaration set comes from the VERIFIED manifest, never from the caller. A caller may
  -- echo it back for cross-checking, but any difference is a hard failure.
  declared_assets := public.cf11_manifest_assets(ver.manifest, lesson_row.id);
  manifest_assets_sha := public.cf11_text_sha256(declared_assets::text);
  -- The caller's echo is advisory only: it is compared on the identifying fields and can never
  -- widen, narrow or alter the authoritative set.
  IF jsonb_array_length(coalesce(_assets,'[]'::jsonb)) > 0 AND (
       SELECT coalesce(jsonb_agg(jsonb_build_object(
                'assetCode', e->>'assetCode', 'fileName', e->>'fileName',
                'mimeType', e->>'mimeType', 'sha256', e->>'sha256',
                'bytes', (e->>'bytes')::bigint) ORDER BY e->>'assetCode'), '[]'::jsonb)
         FROM jsonb_array_elements(_assets) e)
     IS DISTINCT FROM (
       SELECT coalesce(jsonb_agg(jsonb_build_object(
                'assetCode', d->>'assetCode', 'fileName', d->>'fileName',
                'mimeType', d->>'mimeType', 'sha256', d->>'sha256',
                'bytes', (d->>'bytes')::bigint) ORDER BY d->>'assetCode'), '[]'::jsonb)
         FROM jsonb_array_elements(declared_assets) d) THEN
    RAISE EXCEPTION 'CF11_ASSET_DECLARATION_NOT_AUTHORITATIVE' USING ERRCODE = '42501';
  END IF;

  -- Every declared asset needs a live attestation whose bytes AND whose storage object identity
  -- (id + version + etag) still match. Extra attestations are a set mismatch, never ignored.
  FOR asset IN SELECT value FROM jsonb_array_elements(declared_assets) LOOP
    SELECT * INTO att FROM public.golden_lesson_asset_attestations
     WHERE lesson_id = lesson_row.id AND asset_code = asset->>'assetCode';
    IF att.id IS NULL THEN
      RAISE EXCEPTION 'CF11_ASSET_ATTESTATION_MISSING: %', asset->>'assetCode' USING ERRCODE = '23514';
    END IF;
    IF att.sha256 IS DISTINCT FROM asset->>'sha256'
       OR att.byte_size IS DISTINCT FROM (asset->>'bytes')::bigint
       OR att.mime_type IS DISTINCT FROM asset->>'mimeType'
       OR att.file_name IS DISTINCT FROM asset->>'fileName'
       OR att.storage_path IS DISTINCT FROM asset->>'storagePath'
       OR att.storage_bucket IS DISTINCT FROM asset->>'storageBucket' THEN
      RAISE EXCEPTION 'CF11_ASSET_ATTESTATION_DRIFT: %', asset->>'assetCode' USING ERRCODE = '23514';
    END IF;
    IF NOT public.cf11_magic_matches(att.mime_type, att.magic_hex) THEN
      RAISE EXCEPTION 'CF11_ASSET_MAGIC_MISMATCH: %', asset->>'assetCode' USING ERRCODE = '23514';
    END IF;
    SELECT o.id, o.version, o.metadata INTO obj_row
      FROM storage.objects o
     WHERE o.bucket_id = att.storage_bucket AND o.name = att.storage_path;
    IF obj_row.id IS NULL THEN
      RAISE EXCEPTION 'CF11_ASSET_OBJECT_MISSING: %', att.storage_path USING ERRCODE = '23514';
    END IF;
    -- CF11-R8 — FAIL-CLOSED metadata: size, mimetype AND a non-empty eTag must all be present.
    IF obj_row.metadata IS NULL OR NOT (obj_row.metadata ? 'size') OR NOT (obj_row.metadata ? 'mimetype')
       OR coalesce(obj_row.metadata->>'size','') = '' OR coalesce(obj_row.metadata->>'mimetype','') = ''
       OR coalesce(obj_row.metadata->>'eTag', obj_row.metadata->>'etag','') = '' THEN
      RAISE EXCEPTION 'CF11_ASSET_OBJECT_METADATA_MISSING: %', att.storage_path USING ERRCODE = '23514';
    END IF;

    IF obj_row.id IS DISTINCT FROM att.storage_object_id
       OR obj_row.version IS DISTINCT FROM att.storage_version
       OR coalesce(obj_row.metadata->>'eTag', obj_row.metadata->>'etag') IS DISTINCT FROM att.storage_etag
       OR (obj_row.metadata->>'size')::bigint IS DISTINCT FROM att.byte_size
       OR obj_row.metadata->>'mimetype' IS DISTINCT FROM att.mime_type THEN
      RAISE EXCEPTION 'CF11_ASSET_OBJECT_IDENTITY_DRIFT: %', asset->>'assetCode' USING ERRCODE = '23514';
    END IF;
    -- CF11-R5: only a server byte readback is admissible evidence for the bytes.
    IF att.verification_origin IS DISTINCT FROM 'SERVER_BYTE_READBACK' THEN
      RAISE EXCEPTION 'CF11_ASSET_VERIFICATION_ORIGIN_INVALID: %', asset->>'assetCode'
        USING ERRCODE = '42501';
    END IF;
    IF att.attestation_sha256 IS DISTINCT FROM public.cf11_attestation_hash(
         lesson_row.id, att.asset_code, att.file_name, att.mime_type, att.sha256, att.byte_size,
         att.magic_hex, att.storage_bucket, att.storage_path, obj_row.id, obj_row.version,
         coalesce(obj_row.metadata->>'eTag', obj_row.metadata->>'etag'),
         att.verification_origin) THEN
      RAISE EXCEPTION 'CF11_ASSET_ATTESTATION_HASH_DRIFT: %', asset->>'assetCode' USING ERRCODE = '23514';
    END IF;

    -- No overwrite when the hash differs for the same logical asset.
    IF EXISTS (SELECT 1 FROM public.golden_lesson_published_assets a
                WHERE a.lesson_id = lesson_row.id AND a.asset_code = asset->>'assetCode'
                  AND a.sha256 IS DISTINCT FROM asset->>'sha256') THEN
      RAISE EXCEPTION 'CF11_ASSET_HASH_CONFLICT: %', asset->>'assetCode' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  SELECT count(*) INTO attestation_rows FROM public.golden_lesson_asset_attestations
   WHERE lesson_id = lesson_row.id;
  IF attestation_rows <> jsonb_array_length(declared_assets) THEN
    RAISE EXCEPTION 'CF11_ASSET_ATTESTATION_SET_MISMATCH: declared=% attested=%',
      jsonb_array_length(declared_assets), attestation_rows USING ERRCODE = '23514';
  END IF;

  SELECT public.cf11_text_sha256(coalesce(string_agg(a.asset_code || ':' || a.attestation_sha256,
                                                     '|' ORDER BY a.asset_code), ''))
    INTO attestation_sha
    FROM public.golden_lesson_asset_attestations a WHERE a.lesson_id = lesson_row.id;

  -- --- strict replay --------------------------------------------------------------------
  -- A replay only succeeds when the idempotency key, the write-plan hash, the manifest asset
  -- set, the attestation set AND the live published state are all still exactly what was
  -- recorded. Anything else conflicts and writes zero.
  SELECT * INTO replay FROM public.golden_lesson_publications WHERE batch_id = _batch_id;
  IF replay.id IS NOT NULL THEN
    IF replay.lesson_id IS DISTINCT FROM binding.lesson_id
       OR replay.binding_id IS DISTINCT FROM binding.id THEN
      RAISE EXCEPTION 'CF11_REPLAY_IDENTITY_DRIFT' USING ERRCODE = '23514';
    END IF;
    -- CF11-R4: EXECUTE always carries a key; DRY_RUN may inspect without one, but if it
    -- supplies a key the key must be the one already recorded.
    IF _mode = 'EXECUTE' AND (_idempotency_key IS NULL OR length(btrim(_idempotency_key)) < 8) THEN
      RAISE EXCEPTION 'CF11_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF _idempotency_key IS NOT NULL
       AND btrim(_idempotency_key) IS DISTINCT FROM replay.idempotency_key THEN
      RAISE EXCEPTION 'CF11_REPLAY_IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    IF _mode = 'EXECUTE' AND _expected_plan_sha256 IS DISTINCT FROM replay.plan_sha256 THEN
      RAISE EXCEPTION 'CF11_REPLAY_PLAN_CONFLICT' USING ERRCODE = '23505';
    END IF;
    IF _expected_plan_sha256 IS NOT NULL AND _expected_plan_sha256 IS DISTINCT FROM replay.plan_sha256 THEN
      RAISE EXCEPTION 'CF11_REPLAY_PLAN_CONFLICT' USING ERRCODE = '23505';
    END IF;

    IF manifest_assets_sha IS DISTINCT FROM replay.manifest_assets_sha256
       OR attestation_sha IS DISTINCT FROM replay.asset_attestation_sha256 THEN
      RAISE EXCEPTION 'CF11_REPLAY_ASSET_CONFLICT' USING ERRCODE = '23505';
    END IF;
    -- CF11-R5: re-derive EVERY write-plan category from live rows. The recorded result is
    -- never trusted on its own; a replay that cannot reprove the full state conflicts.
    IF public.cf10_html_publication_pending(replay.lesson_id,'mindMap')
       OR public.cf10_html_publication_pending(replay.lesson_id,'simulation') THEN
      RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: html' USING ERRCODE = '23505';
    END IF;
    IF (SELECT count(*) FROM public.golden_lesson_published_assets
         WHERE lesson_id = replay.lesson_id) <> jsonb_array_length(declared_assets) THEN
      RAISE EXCEPTION 'CF11_REPLAY_LIVE_STATE_CONFLICT: assets' USING ERRCODE = '23505';
    END IF;
    RETURN replay.result || public.cf11_assert_replay_state(replay.result) || jsonb_build_object(
      'idempotent', true, 'writes_performed', 0, 'mode', _mode,
      'replay_revalidated', true,
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
  FOR asset IN SELECT value FROM jsonb_array_elements(declared_assets) LOOP
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
      -- CF11-R9C: the replay validator is storage-identity exact, so the durable plan must pin
      -- the same bucket/path it later compares. Omitting storagePath made every replay fail.
      'storageBucket', asset->>'storageBucket',
      'storagePath', asset->>'storagePath',
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
      FOR asset IN SELECT value FROM jsonb_array_elements(declared_assets) LOOP
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

  -- --- CF11-R6: exact lifecycle capability set, validated in the PLAN, not only at EXECUTE ----
  -- The staged->lifecycle vocabulary is re-derived from CF08's authoritative `lifecycle_capability`
  -- and compared as a SORTED SET against the canonical seven. Missing, extra, duplicate-equivalent,
  -- retired and substituted names are all rejected here, so a DRY_RUN can never advertise a plan
  -- that EXECUTE would have to refuse.
  SELECT coalesce(array_agg(DISTINCT e.lifecycle_capability ORDER BY e.lifecycle_capability),
                  ARRAY[]::text[])
    INTO lifecycle_caps
    FROM public.golden_lesson_domain_stage_entries e
   WHERE e.batch_id = _batch_id
     AND e.capability = ANY (public.cf10_required_capabilities());
  IF lifecycle_caps IS DISTINCT FROM public.cf11_lifecycle_capabilities() THEN
    RAISE EXCEPTION 'CF11_LIFECYCLE_NAMESPACE_MISMATCH: staged=[%] expected=[%]',
      array_to_string(lifecycle_caps, ','),
      array_to_string(public.cf11_lifecycle_capabilities(), ',') USING ERRCODE = '23514';
  END IF;
  -- Any lifecycle row that already exists for this lesson must belong to the canonical set.
  IF EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle
              WHERE lesson_id = lesson_row.id
                AND NOT (capability = ANY (public.cf11_lifecycle_capabilities()))) THEN
    RAISE EXCEPTION 'CF11_LIFECYCLE_SET_FOREIGN_CAPABILITY: live=[%]',
      array_to_string(public.cf11_live_lifecycle_capabilities(lesson_row.id), ',')
      USING ERRCODE = '23514';
  END IF;

  -- CF11-R7: the live lifecycle rows must ALREADY be exactly the canonical seven, each carrying
  -- applicability='REQUIRED'. A capability parked at OPTIONAL/NA would be excused from the
  -- readiness contract while the set still looks complete, so the plan refuses to describe it.
  PERFORM public.cf11_assert_exact_required_lifecycle_set(
    lesson_row.id, 'CF11_LIFECYCLE_SET_NOT_EXACTLY_SEVEN_REQUIRED');

  -- --- CF11-R7: PINNED question identity ------------------------------------------------
  -- The plan records, per question, code + questionId + revisionId + payloadHash (+
  -- sourcePayloadHash) of the exact latest intended revision. EXECUTE publishes those revision
  -- IDs and nothing else, and both the plan hash and the replay validator bind to them, so a
  -- same-count payload/revision substitution between DRY_RUN and EXECUTE can never pass.
  SELECT coalesce(jsonb_agg(x.obj ORDER BY x.code), '[]'::jsonb) INTO official_plan
    FROM (
      SELECT qq.code AS code,
             jsonb_build_object('code', qq.code, 'questionId', qq.id, 'revisionId', rv.id,
                                'payloadHash', rv.payload_hash,
                                'sourcePayloadHash', rv.source_payload_hash) AS obj
        FROM public.questions qq
        JOIN LATERAL (SELECT r.id, r.payload_hash, r.source_payload_hash
                        FROM public.question_revisions r
                       WHERE r.question_id = qq.id
                       ORDER BY r.revision_number DESC LIMIT 1) rv ON true
       WHERE qq.lesson_id = lesson_row.id AND qq.code = ANY (official_codes)
    ) x;
  SELECT coalesce(jsonb_agg(x.obj ORDER BY x.code), '[]'::jsonb) INTO self_plan
    FROM (
      SELECT qq.code AS code,
             jsonb_build_object('code', qq.code, 'questionId', qq.id, 'revisionId', rv.id,
                                'payloadHash', rv.payload_hash,
                                'sourcePayloadHash', rv.source_payload_hash) AS obj
        FROM public.questions qq
        JOIN LATERAL (SELECT r.id, r.payload_hash, r.source_payload_hash
                        FROM public.question_revisions r
                       WHERE r.question_id = qq.id
                       ORDER BY r.revision_number DESC LIMIT 1) rv ON true
       WHERE qq.lesson_id = lesson_row.id AND qq.code = ANY (self_codes)
    ) x;
  IF jsonb_array_length(official_plan) <> 5 OR jsonb_array_length(self_plan) <> 40 THEN
    RAISE EXCEPTION 'CF11_QUESTION_PIN_INCOMPLETE: official=% selfTest=%',
      jsonb_array_length(official_plan), jsonb_array_length(self_plan) USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(official_plan || self_plan) AS e(v)
              WHERE coalesce(e.v->>'revisionId','') = '' OR coalesce(e.v->>'payloadHash','') = '') THEN
    RAISE EXCEPTION 'CF11_QUESTION_PIN_UNRESOLVED' USING ERRCODE = '23514';
  END IF;

  -- --- deterministic write plan --------------------------------------------------------

  plan := jsonb_build_object(
    'schema','tamkeen.content-factory-11.write-plan.v2',
    'batchId', _batch_id,
    'lessonId', lesson_row.id,
    'bindingId', binding.id,
    'externalLessonCode', ext_code,
    'verifiedBundleSha256', batch.verified_bundle_sha256,
    'assets', asset_report,
    'manifestAssetsSha256', manifest_assets_sha,
    'assetAttestationSha256', attestation_sha,
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
    'questions', jsonb_build_object('official', official_plan, 'selfTest', self_plan),
    'assessment', jsonb_build_object('code', ext_code || '-SELFTEST', 'memberCount', 40,
                                     'memberQuestionIds',
                                     (SELECT coalesce(jsonb_agg(e.v->>'questionId'
                                                                ORDER BY e.v->>'questionId'),
                                                      '[]'::jsonb)
                                        FROM jsonb_array_elements(self_plan) AS e(v))),
    'lifecycle', jsonb_build_object('from','DRAFT','to','REVIEW',
                                    'capabilities', to_jsonb(public.cf11_lifecycle_capabilities())));
  plan_sha := public.cf11_text_sha256(plan::text);

  IF _mode = 'DRY_RUN' THEN
    RETURN jsonb_build_object('mode','DRY_RUN','batch_id',_batch_id,'lesson_id',lesson_row.id,
      'plan', plan, 'plan_sha256', plan_sha, 'writes_performed', 0, 'idempotent', false);
  END IF;

  IF _expected_plan_sha256 IS DISTINCT FROM plan_sha THEN
    RAISE EXCEPTION 'CF11_WRITE_PLAN_HASH_MISMATCH' USING ERRCODE = '23514';
  END IF;

  -- CF11-R4: an EXECUTE without a durable idempotency key can never be replay-guarded,
  -- because the ledger row would carry NULL and a second call could not be recognised.
  IF _idempotency_key IS NULL OR length(btrim(_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'CF11_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;


  -- ===================================== EXECUTE =======================================

  -- 1) asset registry
  FOR asset IN SELECT value FROM jsonb_array_elements(declared_assets) LOOP
    SELECT * INTO att FROM public.golden_lesson_asset_attestations
     WHERE lesson_id = lesson_row.id AND asset_code = asset->>'assetCode';
    INSERT INTO public.golden_lesson_published_assets(
      batch_id, lesson_id, asset_code, file_name, mime_type, sha256, byte_size,
      storage_bucket, storage_path, attestation_sha256, alt_text_ar, published_by)
    VALUES (_batch_id, lesson_row.id, asset->>'assetCode', asset->>'fileName',
            asset->>'mimeType', asset->>'sha256', (asset->>'bytes')::bigint,
            asset->>'storageBucket', asset->>'storagePath', att.attestation_sha256,
            asset->>'altTextAr', uid)
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

  -- 4) CF11-R7: publish EXACTLY the pinned revisions from the reviewed plan — never a
  --    re-derived "latest". Any live drift in identity or payload since the DRY_RUN is refused.
  FOR q IN
    SELECT (e.v->>'code') AS code,
           (e.v->>'questionId')::uuid AS question_id,
           (e.v->>'revisionId')::uuid AS revision_id,
           (e.v->>'payloadHash') AS payload_hash,
           (e.v->>'sourcePayloadHash') AS source_payload_hash
      FROM jsonb_array_elements(official_plan || self_plan) AS e(v)
     ORDER BY 1
  LOOP
    IF q.revision_id IS NULL THEN
      RAISE EXCEPTION 'CF11_QUESTION_REVISION_MISSING: %', q.code USING ERRCODE = '23514';
    END IF;
    -- The canonical payload hash must already exist; CF11 never invents one.
    IF q.payload_hash IS NULL THEN
      RAISE EXCEPTION 'CF11_QUESTION_PAYLOAD_HASH_MISSING: %', q.code USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.question_revisions rv
        JOIN public.questions qq ON qq.id = rv.question_id
       WHERE rv.id = q.revision_id AND rv.question_id = q.question_id
         AND qq.lesson_id = lesson_row.id AND qq.code = q.code
         AND rv.payload_hash IS NOT DISTINCT FROM q.payload_hash
         AND rv.source_payload_hash IS NOT DISTINCT FROM q.source_payload_hash) THEN
      RAISE EXCEPTION 'CF11_QUESTION_REVISION_DRIFT: %', q.code USING ERRCODE = '23514';
    END IF;

    -- Supersede first: `question_revisions_one_published_uidx` allows exactly one PUBLISHED row.
    UPDATE public.question_revisions
       SET status = 'SUPERSEDED', superseded_at = coalesce(superseded_at, now())
     WHERE question_id = q.question_id AND id <> q.revision_id AND status = 'PUBLISHED';
    GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;

    -- The question-bank lifecycle guard only allows DRAFT/READY_FOR_REVIEW -> APPROVED ->
    -- PUBLISHED, and re-asserts the canonical payload hash on the APPROVED step. CF11 follows
    -- that contract exactly instead of forcing a status.
    UPDATE public.question_revisions
       SET status = 'APPROVED',
           reviewed_at = coalesce(reviewed_at, now()), reviewed_by = coalesce(reviewed_by, uid)
     WHERE id = q.revision_id AND status IN ('DRAFT','READY_FOR_REVIEW');
    GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;

    UPDATE public.question_revisions
       SET status = 'PUBLISHED', published_at = coalesce(published_at, now()),
           published_by = coalesce(published_by, uid)
     WHERE id = q.revision_id AND status = 'APPROVED';
    GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;

    IF (SELECT status FROM public.question_revisions WHERE id = q.revision_id) <> 'PUBLISHED' THEN
      RAISE EXCEPTION 'CF11_QUESTION_NOT_PUBLISHED: %', q.code USING ERRCODE = '23514';
    END IF;



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

  -- CF11-R7: membership is created from the PINNED self-test question IDs, not from a re-read
  -- of the code pattern, so the assessment can only ever contain the reviewed question rows.
  INSERT INTO public.assessment_questions(assessment_id, question_id, sort_order, points)
  SELECT v_assessment_id, (e.v->>'questionId')::uuid,
         row_number() OVER (ORDER BY e.v->>'code') - 1, 1
    FROM jsonb_array_elements(self_plan) AS e(v)
   WHERE NOT EXISTS (SELECT 1 FROM public.assessment_questions aq
                      WHERE aq.assessment_id = v_assessment_id
                        AND aq.question_id = (e.v->>'questionId')::uuid);
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

  -- 6) lifecycle DRAFT -> REVIEW for the exact canonical seven. No READY here, ever.
  --    `lifecycle_caps` was already re-derived from CF08's authoritative `lifecycle_capability`
  --    and proven equal to `cf11_lifecycle_capabilities()` during plan validation, so no
  --    vocabulary is hardcoded and no alternate spelling can slip through here.
  IF lifecycle_caps IS DISTINCT FROM public.cf11_lifecycle_capabilities() THEN
    RAISE EXCEPTION 'CF11_LIFECYCLE_NAMESPACE_MISMATCH: %', array_to_string(lifecycle_caps, ',')
      USING ERRCODE = '23514';
  END IF;

  FOREACH cap IN ARRAY lifecycle_caps LOOP
    PERFORM public.lesson_capability_transition(lesson_row.id, cap, 'REVIEW', NULL, NULL);
  END LOOP;

  -- Exact set, twice: the REVIEW rows are exactly the canonical seven AND the lesson carries no
  -- eighth lifecycle row of any status.
  SELECT coalesce(array_agg(DISTINCT capability ORDER BY capability), ARRAY[]::text[]) INTO live_caps
    FROM public.lesson_capability_lifecycle
   WHERE lesson_id = lesson_row.id AND status = 'REVIEW';
  IF live_caps IS DISTINCT FROM public.cf11_lifecycle_capabilities() THEN
    RAISE EXCEPTION 'CF11_LIFECYCLE_REVIEW_NOT_EXACTLY_SEVEN: %', array_to_string(live_caps, ',')
      USING ERRCODE = '23514';
  END IF;
  PERFORM public.cf11_assert_exact_lifecycle_set(lesson_row.id, 'CF11_LIFECYCLE_SET_MISMATCH');





  IF EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle
              WHERE lesson_id = lesson_row.id AND status = 'READY') THEN
    RAISE EXCEPTION 'CF11_READY_NOT_ALLOWED_IN_PUBLISH' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.golden_lesson_publications(
    id, batch_id, lesson_id, binding_id, plan_sha256, manifest_assets_sha256,
    asset_attestation_sha256, result, idempotency_key, published_by)
  VALUES (publication_id, _batch_id, lesson_row.id, binding.id, plan_sha,
          manifest_assets_sha, attestation_sha,
          plan || jsonb_build_object('publicationId', publication_id,
                                     'writesPerformed', writes,
                                     'lifecycleStatus','REVIEW'),
          btrim(_idempotency_key), uid);

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (uid, 'golden_lesson_cf11_publish', 'lesson_capability', lesson_row.id,
          jsonb_build_object('batchId',_batch_id,'publicationId',publication_id,
                             'planSha256',plan_sha,'writes',writes));

  -- 8)  Consume the HTML drafts. CF10's `cf10_block_ready_before_html_publication` trigger
  --     refuses READY for mindMap/simulation while `draft_hash` is still set: an unconsumed
  --     draft means the staged bytes were never turned into a real, published artefact.
  --     CF11 is the only component allowed to clear it, and only after the truthful publication
  --     probe confirms a matching lesson_resources row actually exists. Fail closed otherwise.
  --     This runs AFTER the ledger insert on purpose: the probe joins the publication row.
  FOREACH cap IN ARRAY ARRAY['mindMap','simulation'] LOOP
    IF public.cf10_html_publication_pending(lesson_row.id, cap) THEN
      RAISE EXCEPTION 'CF11_HTML_PUBLICATION_NOT_MATERIALIZED: %', cap USING ERRCODE = '23514';
    END IF;
    UPDATE public.lesson_capability_lifecycle
       SET draft_hash = NULL, draft_updated_at = now()
     WHERE lesson_id = lesson_row.id AND capability = cap AND draft_hash IS NOT NULL;
    GET DIAGNOSTICS rc = ROW_COUNT; writes := writes + rc;
  END LOOP;


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
  ready_row public.golden_lesson_ready_attestations;
  live_attestation_sha text;
  live_caps text[];
  replay_checks jsonb := '[]'::jsonb;
  stored_ready_hash text;
  stored_ready_snapshot jsonb;
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
  -- CF11-R7: a withdrawn publication is terminal. Re-attesting it (or replaying its old READY)
  -- would resurrect content that a human explicitly pulled; a new package version / batch /
  -- publication is required instead.
  IF EXISTS (SELECT 1 FROM public.golden_lesson_ready_revocations WHERE publication_id = pub.id) THEN
    RAISE EXCEPTION 'CF11_PUBLICATION_REVOKED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO ready_row FROM public.golden_lesson_ready_attestations WHERE publication_id = pub.id;
  IF ready_row.id IS NOT NULL THEN
    -- CF11-R6: a READY replay reproves the whole published state, the live attestation set, the
    -- EXACT canonical seven lifecycle rows, and re-derives every capability snapshot/hash with
    -- the canonical Content V3 functions. A stored ledger checksum is not evidence about today.
    PERFORM public.cf11_assert_replay_state(pub.result);
    SELECT public.cf11_text_sha256(coalesce(string_agg(t.asset_code || ':' || t.attestation_sha256,
                                                       '|' ORDER BY t.asset_code), ''))
      INTO live_attestation_sha
      FROM public.golden_lesson_asset_attestations t WHERE t.lesson_id = pub.lesson_id;
    IF live_attestation_sha IS DISTINCT FROM ready_row.asset_attestation_sha256 THEN
      RAISE EXCEPTION 'CF11_READY_REPLAY_CONFLICT: assets' USING ERRCODE = '23505';
    END IF;
    IF ready_row.snapshot_set_sha256 IS DISTINCT FROM public.cf11_text_sha256(ready_row.checks::text) THEN
      RAISE EXCEPTION 'CF11_READY_REPLAY_CONFLICT: evidence' USING ERRCODE = '23505';
    END IF;

    -- Exact set equality (not count), and every one of them really READY today.
    PERFORM public.cf11_assert_exact_required_lifecycle_set(
      pub.lesson_id, 'CF11_READY_REPLAY_CONFLICT');
    SELECT coalesce(array_agg(DISTINCT capability ORDER BY capability), ARRAY[]::text[])
      INTO live_caps
      FROM public.lesson_capability_lifecycle
     WHERE lesson_id = pub.lesson_id AND status = 'READY';
    IF live_caps IS DISTINCT FROM public.cf11_lifecycle_capabilities() THEN
      RAISE EXCEPTION 'CF11_READY_REPLAY_CONFLICT: lifecycle live=[%]',
        array_to_string(live_caps, ',') USING ERRCODE = '23505';
    END IF;

    -- Re-derive each of the exact seven snapshots and compare against BOTH the frozen ledger
    -- evidence and the live lifecycle ready_snapshot/ready_hash. Any drift refuses the replay.
    replay_checks := '[]'::jsonb;
    FOREACH lifecycle_cap IN ARRAY public.cf11_lifecycle_capabilities() LOOP
      snap := public.v3_capability_snapshot(pub.lesson_id, lifecycle_cap);
      IF snap IS NULL OR NOT public.v3_capability_snapshot_is_reconcilable(snap) THEN
        RAISE EXCEPTION 'CF11_READY_REPLAY_CONFLICT: snapshot.%', lifecycle_cap USING ERRCODE = '23505';
      END IF;
      snap_hash := public.v3_capability_snapshot_hash(snap);
      replay_checks := replay_checks
        || jsonb_build_object('capability', lifecycle_cap, 'hash', snap_hash);

      SELECT ready_hash, ready_snapshot INTO stored_ready_hash, stored_ready_snapshot
        FROM public.lesson_capability_lifecycle
       WHERE lesson_id = pub.lesson_id AND capability = lifecycle_cap;
      IF stored_ready_snapshot IS NULL OR stored_ready_hash IS DISTINCT FROM snap_hash THEN
        RAISE EXCEPTION 'CF11_READY_REPLAY_CONFLICT: readySnapshot.%', lifecycle_cap
          USING ERRCODE = '23505';
      END IF;
      IF public.v3_capability_snapshot_hash(stored_ready_snapshot) IS DISTINCT FROM snap_hash THEN
        RAISE EXCEPTION 'CF11_READY_REPLAY_CONFLICT: readySnapshotBody.%', lifecycle_cap
          USING ERRCODE = '23505';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(ready_row.checks,'[]'::jsonb)) AS c(v)
         WHERE c.v->>'capability' = lifecycle_cap AND c.v->>'hash' = snap_hash) THEN
        RAISE EXCEPTION 'CF11_READY_REPLAY_CONFLICT: evidenceHash.%', lifecycle_cap
          USING ERRCODE = '23505';
      END IF;
    END LOOP;
    IF jsonb_array_length(coalesce(ready_row.checks,'[]'::jsonb))
         <> jsonb_array_length(replay_checks) THEN
      RAISE EXCEPTION 'CF11_READY_REPLAY_CONFLICT: evidenceSet' USING ERRCODE = '23505';
    END IF;

    RETURN pub.result || jsonb_build_object('idempotent', true, 'transitions', 0,
      'replay_revalidated', true, 'replay_checks', replay_checks,
      'ready_attested_by', ready_row.attested_by, 'ready_attested_at', ready_row.attested_at);
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

  -- CF11-R7: a FIRST READY revalidates the full live state against the recorded publication
  -- plan — asset identity/version/eTag/size/MIME, pinned question revisions and payload hashes,
  -- the exact assessment set, the official body and the inline HTML — exactly like a replay.
  -- Approving on stale evidence is the failure mode this closes.
  PERFORM public.cf11_assert_replay_state(pub.result);

  -- Exact canonical SET, not a count, and every row applicability='REQUIRED'. Missing, extra,
  -- duplicate-equivalent, retired, substituted or non-REQUIRED capabilities are all refused
  -- before any transition is considered.
  PERFORM public.cf11_assert_exact_required_lifecycle_set(
    lesson_row.id, 'CF11_CAPABILITY_SET_NOT_EXACTLY_SEVEN');
  -- A first approval requires ALL seven to be in REVIEW. A mixed REVIEW/READY lesson means an
  -- out-of-band transition already happened, so it is rejected instead of being completed.
  SELECT coalesce(array_agg(DISTINCT capability ORDER BY capability), ARRAY[]::text[]) INTO live_caps
    FROM public.lesson_capability_lifecycle
   WHERE lesson_id = lesson_row.id AND status = 'REVIEW';
  IF live_caps IS DISTINCT FROM public.cf11_lifecycle_capabilities() THEN
    RAISE EXCEPTION 'CF11_READY_REQUIRES_REVIEW_FOR_ALL: review=[%]',
      array_to_string(live_caps, ',') USING ERRCODE = '23514';
  END IF;

  -- HTML publication really happened (truthful probe, not a marker).
  IF public.cf10_html_publication_pending(lesson_row.id,'mindMap')
     OR public.cf10_html_publication_pending(lesson_row.id,'simulation') THEN
    RAISE EXCEPTION 'CF11_HTML_NOT_PUBLISHED' USING ERRCODE = '23514';
  END IF;

  -- Declared assets still registered, still attested and still resolvable in private storage.
  IF EXISTS (
    SELECT 1 FROM public.golden_lesson_published_assets a
     WHERE a.lesson_id = lesson_row.id
       AND NOT EXISTS (SELECT 1 FROM storage.objects o
                        WHERE o.bucket_id = a.storage_bucket AND o.name = a.storage_path)
  ) THEN
    RAISE EXCEPTION 'CF11_ASSET_OBJECT_VANISHED' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.golden_lesson_published_assets a
     LEFT JOIN public.golden_lesson_asset_attestations t
            ON t.lesson_id = a.lesson_id AND t.asset_code = a.asset_code
     WHERE a.lesson_id = lesson_row.id
       AND (t.id IS NULL OR t.attestation_sha256 IS DISTINCT FROM a.attestation_sha256)
  ) THEN
    RAISE EXCEPTION 'CF11_ASSET_ATTESTATION_DRIFT_AT_READY' USING ERRCODE = '23514';
  END IF;
  -- CF11-R8 — the same FAIL-CLOSED metadata contract at first READY: absent or empty live
  -- metadata is treated as drift, and no attested value is ever used as a fallback.
  IF EXISTS (
    SELECT 1 FROM public.golden_lesson_asset_attestations t
     JOIN storage.objects o ON o.bucket_id = t.storage_bucket AND o.name = t.storage_path
     WHERE t.lesson_id = lesson_row.id
       AND (o.id IS DISTINCT FROM t.storage_object_id
            OR o.version IS DISTINCT FROM t.storage_version
            OR o.metadata IS NULL
            OR NOT (o.metadata ? 'size') OR NOT (o.metadata ? 'mimetype')
            OR coalesce(o.metadata->>'eTag', o.metadata->>'etag', '') = ''
            OR coalesce(o.metadata->>'eTag', o.metadata->>'etag') IS DISTINCT FROM t.storage_etag
            OR (o.metadata->>'size')::bigint IS DISTINCT FROM t.byte_size
            OR o.metadata->>'mimetype' IS DISTINCT FROM t.mime_type)
  ) THEN
    RAISE EXCEPTION 'CF11_ASSET_OBJECT_IDENTITY_DRIFT_AT_READY' USING ERRCODE = '23514';
  END IF;

  SELECT public.cf11_text_sha256(coalesce(string_agg(t.asset_code || ':' || t.attestation_sha256,
                                                     '|' ORDER BY t.asset_code), ''))
    INTO live_attestation_sha
    FROM public.golden_lesson_asset_attestations t WHERE t.lesson_id = lesson_row.id;
  IF live_attestation_sha IS DISTINCT FROM pub.asset_attestation_sha256 THEN
    RAISE EXCEPTION 'CF11_ASSET_ATTESTATION_SET_DRIFT_AT_READY' USING ERRCODE = '23514';
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

  -- CF11-R6: snapshot/hash verification over the CANONICAL seven, iterated from the contract
  -- itself (already proven set-equal to the live rows), so a substituted live row cannot decide
  -- which capabilities get verified.
  FOREACH lifecycle_cap IN ARRAY public.cf11_lifecycle_capabilities()
  LOOP
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

  -- After the transitions, the READY set must be the canonical seven exactly — no more, no less.
  SELECT coalesce(array_agg(DISTINCT capability ORDER BY capability), ARRAY[]::text[]) INTO live_caps
    FROM public.lesson_capability_lifecycle
   WHERE lesson_id = lesson_row.id AND status = 'READY';
  IF live_caps IS DISTINCT FROM public.cf11_lifecycle_capabilities() THEN
    RAISE EXCEPTION 'CF11_READY_SET_NOT_EXACT: live=[%]', array_to_string(live_caps, ',')
      USING ERRCODE = '23514';
  END IF;


  -- READY evidence is appended as an independent record; the publication row stays immutable.
  INSERT INTO public.golden_lesson_ready_attestations(
    publication_id, batch_id, lesson_id, published_by, attested_by, evidence, checks,
    snapshot_set_sha256, asset_attestation_sha256)
  VALUES (pub.id, _batch_id, lesson_row.id, pub.published_by, uid, _evidence, checks,
          public.cf11_text_sha256(checks::text), live_attestation_sha);

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
-- CF11-R5: the upload attestation is a MACHINE measurement. No human role may execute it.
REVOKE ALL ON FUNCTION public.golden_lesson_attest_cf11_asset(uuid, uuid, text, text, bigint, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golden_lesson_attest_cf11_asset(uuid, uuid, text, text, bigint, text, text, text, text)
  TO service_role;
-- The pre-R5 (8-argument) shape must not survive as a callable, human-executable overload.
DROP FUNCTION IF EXISTS public.golden_lesson_attest_cf11_asset(uuid, uuid, text, text, bigint, text, text, text);

GRANT EXECUTE ON FUNCTION public.cf11_manifest_assets(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cf11_magic_matches(text, text) TO authenticated;

-- ------------------------------------------------------------------------------------
-- 9) CF11-R4 — operator-token materialization.
--
-- The CF10 RPC is granted to service_role only and trusts `_actor_id` as passed. Orchestrating
-- CF10 from the app with the service key would let a non-human caller impersonate an operator.
-- This thin wrapper is the ONLY materialization entry point the application uses: it is executed
-- with the signed-in operator's own token, re-derives the actor from auth.uid(), refuses any
-- disagreement with `_actor_id`, requires the `admin` role, and only then delegates. The inner
-- CF10 function keeps its own independent role check, so this adds a gate and removes none.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.golden_lesson_materialize_domain_batch_operator(
  _batch_id uuid,
  _actor_id uuid,
  _mode text DEFAULT 'DRY_RUN',
  _expected_plan_sha256 text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF _mode NOT IN ('DRY_RUN','EXECUTE') THEN
    RAISE EXCEPTION 'CF10_MODE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF uid IS NULL OR _actor_id IS NULL OR uid <> _actor_id THEN
    RAISE EXCEPTION 'CF10_ACTOR_IDENTITY_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF NOT public.golden_lesson_has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'CF10_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _mode = 'EXECUTE' AND (_idempotency_key IS NULL OR length(btrim(_idempotency_key)) < 8) THEN
    RAISE EXCEPTION 'CF10_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF _mode = 'EXECUTE' AND coalesce(_expected_plan_sha256,'') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'CF10_WRITE_PLAN_HASH_REQUIRED' USING ERRCODE = '22023';
  END IF;

  RETURN public.golden_lesson_materialize_domain_batch(
    _batch_id, uid, _mode, _expected_plan_sha256, _idempotency_key);
END $$;

REVOKE ALL ON FUNCTION public.golden_lesson_materialize_domain_batch_operator(uuid,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.golden_lesson_materialize_domain_batch_operator(uuid,uuid,text,text,text) TO authenticated;

-- CF11-R5: the raw CF10 entry point trusts `_actor_id` as passed, so the service role must not
-- be able to reach it at all. The operator wrapper (SECURITY DEFINER, owned by the migration
-- role) keeps working because it delegates as its owner, not as the caller.
REVOKE EXECUTE ON FUNCTION public.golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)
  FROM service_role, authenticated, anon, PUBLIC;

-- ------------------------------------------------------------------------------------
-- 9b) CF11-R6 — SERVICE-ROLE EDITORIAL DENIAL.
--
-- Machine duties (byte readback attestation, reads) stay with the service role. EVERY human
-- editorial decision — publication, READY attestation, package review/state transitions,
-- authoritative identity binding, operator materialization — is denied to the machine roles, so
-- an automated caller holding the service key can never stand in for a reviewer.
-- ------------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.golden_lesson_publish_cf11(uuid, uuid, text, jsonb, text, text)
  FROM service_role, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.golden_lesson_attest_cf11_ready(uuid, uuid, jsonb, text)
  FROM service_role, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.golden_lesson_materialize_domain_batch_operator(uuid,uuid,text,text,text)
  FROM service_role, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.golden_lesson_advance_review(uuid,integer,text,jsonb,text)
  FROM service_role, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.golden_lesson_bind_authoritative_identity(uuid,uuid)
  FROM service_role, anon, PUBLIC;

-- Identity binding still needs a caller, so it gets the same shape as CF10: a SECURITY DEFINER
-- operator wrapper that derives the actor from `auth.uid()` (never from an argument) and can only
-- be reached by an authenticated admin.
CREATE OR REPLACE FUNCTION public.golden_lesson_bind_authoritative_identity_operator(
  _batch_id uuid,
  _actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR _actor_id IS NULL OR uid <> _actor_id THEN
    RAISE EXCEPTION 'CF09_ACTOR_IDENTITY_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF NOT public.golden_lesson_has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'CF09_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN public.golden_lesson_bind_authoritative_identity(_batch_id, uid);
END $$;

REVOKE ALL ON FUNCTION public.golden_lesson_bind_authoritative_identity_operator(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.golden_lesson_bind_authoritative_identity_operator(uuid,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.golden_lesson_bind_authoritative_identity_operator(uuid,uuid)
  FROM service_role, anon, PUBLIC;






-- ------------------------------------------------------------------------------------
-- 9c) CF11-R7 — CONTROLLED, AUDITED WITHDRAWAL of an attested READY publication.
--
-- There is no HOLD status anywhere in production: `lesson_capability_transition` accepts only
-- DRAFT / REVIEW / READY and refuses READY -> REVIEW (`REVIEW_REQUIRES_DRAFT`). The only
-- supported non-visible forward state for an already-READY capability is therefore DRAFT, and
-- this RPC is the ONLY sanctioned way to get there:
--   * authenticated FULL ADMIN only; the actor is re-derived from auth.uid() and must agree with
--     `_actor_id`; service_role / anon / PUBLIC are denied outright;
--   * separation of duties: the human who attested READY may not also withdraw it;
--   * an explicit written reason (>= 12 chars) and a durable idempotency key are mandatory;
--   * publication, READY attestation and all seven lifecycle rows are locked FOR UPDATE;
--   * precondition: the EXACT canonical seven, all READY and all applicability='REQUIRED';
--   * the transition is atomic — either all seven land on DRAFT or the whole call rolls back;
--   * the original READY evidence is COPIED into the append-only revocation ledger and the READY
--     attestation row itself is never mutated or deleted;
--   * replay-safe: a second call with the same key returns the recorded revocation and writes 0,
--     a different key conflicts;
--   * terminal: `golden_lesson_attest_cf11_ready` refuses a revoked publication forever
--     (`CF11_PUBLICATION_REVOKED`), so recovery requires a new package version / batch /
--     publication.
-- ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.golden_lesson_revoke_cf11_ready(
  _batch_id uuid,
  _actor_id uuid,
  _reason text,
  _idempotency_key text DEFAULT NULL,
  _mode text DEFAULT 'DRY_RUN'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := auth.uid();
  pub public.golden_lesson_publications;
  ready_row public.golden_lesson_ready_attestations;
  existing public.golden_lesson_ready_revocations;
  live_caps text[];
  cap text;
  revocation_id uuid := gen_random_uuid();
  transitions integer := 0;
BEGIN
  IF _mode NOT IN ('DRY_RUN','EXECUTE') THEN
    RAISE EXCEPTION 'CF11_INVALID_MODE' USING ERRCODE = '22023';
  END IF;
  IF uid IS NULL OR _actor_id IS NULL OR uid <> _actor_id THEN
    RAISE EXCEPTION 'CF11_ACTOR_IDENTITY_MISMATCH' USING ERRCODE = '42501';
  END IF;
  IF NOT public.golden_lesson_has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'CF11_REVOKE_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF coalesce(btrim(_reason),'') = '' OR length(btrim(_reason)) < 12 THEN
    RAISE EXCEPTION 'CF11_REVOKE_REASON_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO pub FROM public.golden_lesson_publications WHERE batch_id = _batch_id FOR UPDATE;
  IF pub.id IS NULL THEN
    RAISE EXCEPTION 'CF11_PUBLICATION_MISSING' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO ready_row FROM public.golden_lesson_ready_attestations
   WHERE publication_id = pub.id FOR UPDATE;
  IF ready_row.id IS NULL THEN
    RAISE EXCEPTION 'CF11_REVOKE_NO_READY_ATTESTATION' USING ERRCODE = '23514';
  END IF;
  IF ready_row.attested_by = uid THEN
    RAISE EXCEPTION 'CF11_REVOKE_SEPARATION_OF_DUTIES' USING ERRCODE = '42501';
  END IF;

  -- CF11-R8 — EXECUTE always requires a real idempotency key, INCLUDING a replay. This validation
  -- runs BEFORE the existing-row branch, so a null/short key can never be laundered into a
  -- comfortable "already withdrawn" success. DRY_RUN stays zero-write and may omit the key.
  IF _mode = 'EXECUTE' AND (_idempotency_key IS NULL OR length(btrim(_idempotency_key)) < 8) THEN
    RAISE EXCEPTION 'CF11_REVOKE_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- Idempotent: the exact same key replays the recorded withdrawal, anything else conflicts.
  SELECT * INTO existing FROM public.golden_lesson_ready_revocations WHERE publication_id = pub.id;
  IF existing.id IS NOT NULL THEN
    IF _mode = 'EXECUTE'
       AND btrim(_idempotency_key) IS DISTINCT FROM existing.idempotency_key THEN
      RAISE EXCEPTION 'CF11_REVOKE_IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    IF _mode <> 'EXECUTE' AND _idempotency_key IS NOT NULL
       AND btrim(_idempotency_key) IS DISTINCT FROM existing.idempotency_key THEN
      RAISE EXCEPTION 'CF11_REVOKE_IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;

    SELECT coalesce(array_agg(DISTINCT capability ORDER BY capability), ARRAY[]::text[])
      INTO live_caps
      FROM public.lesson_capability_lifecycle
     WHERE lesson_id = pub.lesson_id AND status = 'DRAFT';
    IF live_caps IS DISTINCT FROM public.cf11_lifecycle_capabilities() THEN
      RAISE EXCEPTION 'CF11_REVOKE_REPLAY_CONFLICT: withdrawn=[%]', array_to_string(live_caps,',')
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('mode', _mode, 'batch_id', _batch_id, 'lesson_id', pub.lesson_id,
      'revocation_id', existing.id, 'idempotent', true, 'writes_performed', 0,
      'transitions', 0, 'to_status', existing.to_status,
      'student_visible', public.lesson_student_visible(pub.lesson_id));
  END IF;

  -- Precondition: the EXACT canonical seven, all REQUIRED, all READY. Locked for the transaction.
  PERFORM public.cf11_assert_exact_required_lifecycle_set(
    pub.lesson_id, 'CF11_REVOKE_CAPABILITY_SET_NOT_EXACTLY_SEVEN');
  PERFORM 1 FROM public.lesson_capability_lifecycle WHERE lesson_id = pub.lesson_id FOR UPDATE;
  SELECT coalesce(array_agg(DISTINCT capability ORDER BY capability), ARRAY[]::text[]) INTO live_caps
    FROM public.lesson_capability_lifecycle
   WHERE lesson_id = pub.lesson_id AND status = 'READY';
  IF live_caps IS DISTINCT FROM public.cf11_lifecycle_capabilities() THEN
    RAISE EXCEPTION 'CF11_REVOKE_REQUIRES_ALL_READY: ready=[%]', array_to_string(live_caps,',')
      USING ERRCODE = '23514';
  END IF;

  IF _mode = 'DRY_RUN' THEN
    RETURN jsonb_build_object('mode','DRY_RUN','batch_id',_batch_id,'lesson_id',pub.lesson_id,
      'would_withdraw', to_jsonb(public.cf11_lifecycle_capabilities()), 'to_status','DRAFT',
      'writes_performed', 0, 'idempotent', false);
  END IF;

  IF _idempotency_key IS NULL OR length(btrim(_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'CF11_REVOKE_IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- CF11-R8B: open the transaction-local revocation ticket. The generic 21H transition RPC
  -- refuses READY -> anything-else for a CF11-managed lesson unless this ticket exists, and the
  -- ticket lives in a table that carries NO grant to anon/authenticated/service_role, so it can
  -- only ever be opened from inside this very function.
  PERFORM public.cf11_open_revocation_ticket(pub.lesson_id, uid, revocation_id);
  FOREACH cap IN ARRAY public.cf11_lifecycle_capabilities() LOOP
    PERFORM public.lesson_capability_transition(pub.lesson_id, cap, 'DRAFT', NULL, NULL);
    transitions := transitions + 1;
  END LOOP;
  PERFORM public.cf11_close_revocation_ticket(pub.lesson_id);


  -- Atomicity proof: all seven really left READY and really landed on DRAFT.
  SELECT coalesce(array_agg(DISTINCT capability ORDER BY capability), ARRAY[]::text[]) INTO live_caps
    FROM public.lesson_capability_lifecycle
   WHERE lesson_id = pub.lesson_id AND status = 'DRAFT';
  IF live_caps IS DISTINCT FROM public.cf11_lifecycle_capabilities()
     OR EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle
                 WHERE lesson_id = pub.lesson_id AND status <> 'DRAFT') THEN
    RAISE EXCEPTION 'CF11_REVOKE_NOT_ATOMIC: withdrawn=[%]', array_to_string(live_caps,',')
      USING ERRCODE = '23514';
  END IF;
  IF public.lesson_student_visible(pub.lesson_id) THEN
    RAISE EXCEPTION 'CF11_REVOKE_STILL_STUDENT_VISIBLE' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.golden_lesson_ready_revocations(
    id, publication_id, ready_attestation_id, batch_id, lesson_id, reason, capabilities,
    to_status, preserved_evidence, idempotency_key, revoked_by, attested_by)
  VALUES (revocation_id, pub.id, ready_row.id, _batch_id, pub.lesson_id, btrim(_reason),
          public.cf11_lifecycle_capabilities(), 'DRAFT',
          jsonb_build_object('attestedBy', ready_row.attested_by,
                             'attestedAt', ready_row.attested_at,
                             'publishedBy', ready_row.published_by,
                             'evidence', ready_row.evidence,
                             'checks', ready_row.checks,
                             'snapshotSetSha256', ready_row.snapshot_set_sha256,
                             'assetAttestationSha256', ready_row.asset_attestation_sha256),
          btrim(_idempotency_key), uid, ready_row.attested_by);

  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
  VALUES (uid, 'golden_lesson_cf11_ready_revoked', 'lesson_capability', pub.lesson_id,
          jsonb_build_object('batchId',_batch_id,'publicationId',pub.id,
                             'revocationId',revocation_id,'reason',btrim(_reason),
                             'transitions',transitions,'toStatus','DRAFT'));

  RETURN jsonb_build_object('mode','EXECUTE','batch_id',_batch_id,'lesson_id',pub.lesson_id,
    'revocation_id', revocation_id, 'transitions', transitions, 'to_status','DRAFT',
    'idempotent', false, 'writes_performed', transitions + 1,
    'student_visible', public.lesson_student_visible(pub.lesson_id));
END $$;

REVOKE ALL ON FUNCTION public.golden_lesson_revoke_cf11_ready(uuid, uuid, text, text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.golden_lesson_revoke_cf11_ready(uuid, uuid, text, text, text)
  TO authenticated;
REVOKE EXECUTE ON FUNCTION public.golden_lesson_revoke_cf11_ready(uuid, uuid, text, text, text)
  FROM service_role, anon, PUBLIC;

-- ------------------------------------------------------------------------------------
-- 10) CF11-R4 — lifecycle namespace guard.
--
-- The one true lifecycle table is public.lesson_capability_lifecycle. A relation named
-- lesson_content_lifecycle has never existed; code that reads it fails open (empty lifecycle,
-- "nothing in REVIEW"), which is exactly the wrong direction for a review gate. Fail the
-- migration rather than ship a second, silently-empty namespace.
-- ------------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.lesson_capability_lifecycle') IS NULL THEN
    RAISE EXCEPTION 'CF11_LIFECYCLE_TABLE_MISSING: public.lesson_capability_lifecycle';
  END IF;
  IF to_regclass('public.lesson_content_lifecycle') IS NOT NULL THEN
    RAISE EXCEPTION 'CF11_LIFECYCLE_NAMESPACE_CONFLICT: public.lesson_content_lifecycle must not exist';
  END IF;
END $$;

-- ------------------------------------------------------------------------------------
-- 11) CF11-R8B — DIRECT TRANSITION BYPASS CLOSURE.
--
-- 21H ships a generic, publicly granted RPC `public.lesson_capability_transition`, and its own
-- rule set only demands a FULL ADMIN for `-> READY` and for `REVIEW -> DRAFT`. A plain content
-- staff member could therefore call it directly with `READY -> DRAFT` and silently un-publish an
-- attested CF11 Golden Lesson, bypassing every CF11 control at once: the full-admin requirement,
-- separation of duties, the mandatory written reason, the idempotency key and the immutable
-- `golden_lesson_ready_revocations` ledger.
--
-- This section closes that hole WITHOUT editing a single byte of the 21H migration, and without
-- changing behaviour for legacy, non-CF11 lessons:
--
--   * a transaction-local TICKET table that carries NO privilege for anon / authenticated /
--     service_role. It is written exclusively by SECURITY DEFINER helpers that are themselves
--     ungranted, so the only way a ticket can exist is that `golden_lesson_revoke_cf11_ready`
--     opened it a few statements earlier, in this very transaction. It is not a GUC, not a
--     boolean argument and not anything a caller can set or forge;
--   * the generic transition RPC is re-declared (same signature, same semantics) with one extra
--     precondition: for a CF11-managed lesson and a canonical REQUIRED capability, leaving READY
--     requires that ticket;
--   * a row-level trigger repeats the check at the TABLE, so even a role holding raw DML (today:
--     service_role) cannot demote an attested capability behind the RPC's back.
-- ------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cf11_revocation_tickets (
  xact_id       bigint      NOT NULL,
  lesson_id     uuid        NOT NULL,
  actor_id      uuid        NOT NULL,
  revocation_id uuid        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (xact_id, lesson_id)
);
-- No grants at all: no role reachable from the Data API can read, insert or delete a ticket.
REVOKE ALL ON TABLE public.cf11_revocation_tickets FROM PUBLIC;
REVOKE ALL ON TABLE public.cf11_revocation_tickets FROM anon;
REVOKE ALL ON TABLE public.cf11_revocation_tickets FROM authenticated;
REVOKE ALL ON TABLE public.cf11_revocation_tickets FROM service_role;
ALTER TABLE public.cf11_revocation_tickets ENABLE ROW LEVEL SECURITY;
-- RLS is enabled and deliberately policy-less. Combined with the absent grants this makes the
-- table unreachable for every Data API role; the SECURITY DEFINER helpers below run as the table
-- owner and are the only writers/readers in the system.

/* Is this lesson under CF11 governance at all? Legacy lessons answer NO and keep 21H behaviour. */
CREATE OR REPLACE FUNCTION public.cf11_is_managed_lesson(_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.golden_lesson_publications WHERE lesson_id = _lesson_id);
$$;

/* Ticket lifecycle. All three are ungranted: only other SECURITY DEFINER code can call them. */
CREATE OR REPLACE FUNCTION public.cf11_open_revocation_ticket(
  _lesson_id uuid, _actor_id uuid, _revocation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF _lesson_id IS NULL OR _actor_id IS NULL OR _revocation_id IS NULL THEN
    RAISE EXCEPTION 'CF11_REVOCATION_TICKET_INVALID' USING ERRCODE = '22023';
  END IF;
  -- The ticket is bound to THIS transaction id: a leftover row from any other transaction is
  -- inert, and a transaction id cannot be chosen by the caller.
  INSERT INTO public.cf11_revocation_tickets(xact_id, lesson_id, actor_id, revocation_id)
  VALUES (txid_current(), _lesson_id, _actor_id, _revocation_id)
  ON CONFLICT (xact_id, lesson_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.cf11_close_revocation_ticket(_lesson_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM public.cf11_revocation_tickets
   WHERE xact_id = txid_current() AND lesson_id = _lesson_id;
$$;

CREATE OR REPLACE FUNCTION public.cf11_has_revocation_ticket(_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cf11_revocation_tickets
     WHERE xact_id = txid_current() AND lesson_id = _lesson_id);
$$;

REVOKE ALL ON FUNCTION public.cf11_open_revocation_ticket(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cf11_close_revocation_ticket(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cf11_has_revocation_ticket(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cf11_is_managed_lesson(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

/* The single decision point, shared by the RPC and the table trigger. */
CREATE OR REPLACE FUNCTION public.cf11_assert_demotion_allowed(
  _lesson_id uuid, _capability text, _from_status text, _to_status text, _applicability text,
  _origin text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Only ever restrictive, and only for the exact CF11 surface:
  --   * the lesson is bound to a CF11 publication (legacy lessons are untouched);
  --   * the capability is one of the canonical seven and is REQUIRED;
  --   * the row is leaving READY.
  IF _from_status IS DISTINCT FROM 'READY' THEN RETURN; END IF;
  IF _to_status IS NOT DISTINCT FROM 'READY' THEN RETURN; END IF;
  IF NOT (_capability = ANY (public.cf11_lifecycle_capabilities())) THEN RETURN; END IF;
  IF coalesce(_applicability, 'REQUIRED') <> 'REQUIRED' THEN RETURN; END IF;
  IF NOT public.cf11_is_managed_lesson(_lesson_id) THEN RETURN; END IF;
  IF public.cf11_has_revocation_ticket(_lesson_id) THEN RETURN; END IF;

  RAISE EXCEPTION
    'CF11_DIRECT_TRANSITION_FORBIDDEN: % READY -> % for CF11 lesson % must go through '
    'golden_lesson_revoke_cf11_ready (origin=%)',
    _capability, coalesce(_to_status,'DELETED'), _lesson_id, _origin
    USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.cf11_assert_demotion_allowed(uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

/* ------------------------------------------------------------------------------------
 * The generic 21H RPC, re-declared byte-for-byte identical EXCEPT for the CF11 guard.
 * Signature, grants, error codes and legacy behaviour are preserved exactly.
 * ------------------------------------------------------------------------------------ */
CREATE OR REPLACE FUNCTION public.lesson_capability_transition(
  _lesson_id uuid, _capability text, _to_status text,
  _snapshot jsonb DEFAULT NULL, _hash text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  cur public.lesson_capability_lifecycle;
  frm text;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_content_staff(uid) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _to_status NOT IN ('DRAFT','REVIEW','READY') THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO cur FROM public.lesson_capability_lifecycle
   WHERE lesson_id = _lesson_id AND capability = _capability FOR UPDATE;
  frm := COALESCE(cur.status, 'ABSENT');

  -- CF11-R8B: an attested Golden Lesson may only leave READY through the controlled,
  -- ledger-backed CF11 withdrawal. Legacy lessons never reach this branch.
  PERFORM public.cf11_assert_demotion_allowed(
    _lesson_id, _capability, frm, _to_status, cur.applicability::text,
    'lesson_capability_transition');

  IF _to_status = 'READY' OR (frm = 'REVIEW' AND _to_status = 'DRAFT') THEN
    IF NOT public.is_full_admin(uid) THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF _to_status = 'READY' AND frm <> 'REVIEW' THEN
    RAISE EXCEPTION 'READY_REQUIRES_REVIEW' USING ERRCODE = '22023';
  END IF;
  IF _to_status = 'READY' AND (_snapshot IS NULL OR _hash IS NULL) THEN
    RAISE EXCEPTION 'READY_REQUIRES_SNAPSHOT' USING ERRCODE = '22023';
  END IF;
  IF _to_status = 'REVIEW' AND frm <> 'DRAFT' THEN
    RAISE EXCEPTION 'REVIEW_REQUIRES_DRAFT' USING ERRCODE = '22023';
  END IF;
  IF cur.id IS NULL THEN
    IF _to_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'LIFECYCLE_ROW_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.lesson_capability_lifecycle
      (lesson_id, capability, status, draft_hash, draft_updated_at)
    VALUES (_lesson_id, _capability, 'DRAFT', _hash, now()) RETURNING * INTO cur;
  ELSE
    UPDATE public.lesson_capability_lifecycle
       SET status = _to_status,
           draft_hash = CASE WHEN _to_status = 'DRAFT' THEN COALESCE(_hash, draft_hash) ELSE draft_hash END,
           draft_updated_at = CASE WHEN _to_status = 'DRAFT' THEN now() ELSE draft_updated_at END,
           reviewed_by = CASE WHEN _to_status IN ('REVIEW','READY') THEN uid ELSE reviewed_by END,
           reviewed_at = CASE WHEN _to_status IN ('REVIEW','READY') THEN now() ELSE reviewed_at END,
           ready_snapshot = CASE WHEN _to_status = 'READY' THEN _snapshot ELSE ready_snapshot END,
           ready_hash = CASE WHEN _to_status = 'READY' THEN _hash ELSE ready_hash END,
           ready_by = CASE WHEN _to_status = 'READY' THEN uid ELSE ready_by END,
           ready_at = CASE WHEN _to_status = 'READY' THEN now() ELSE ready_at END
     WHERE id = cur.id RETURNING * INTO cur;
  END IF;
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (uid, 'lesson_capability_lifecycle_transition', 'lesson_capability', _lesson_id,
          jsonb_build_object('lesson_id', _lesson_id, 'capability', _capability,
                             'from_status', frm, 'to_status', cur.status));
  RETURN jsonb_build_object('lesson_id', _lesson_id, 'capability', _capability,
                            'from_status', frm, 'to_status', cur.status,
                            'ready_at', cur.ready_at);
END;
$$;
REVOKE ALL ON FUNCTION public.lesson_capability_transition(uuid,text,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lesson_capability_transition(uuid,text,text,jsonb,text) TO authenticated;

/* Raw-DML defence in depth: the same rule, enforced at the table for EVERY role. */
CREATE OR REPLACE FUNCTION public.cf11_guard_lifecycle_demotion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.cf11_assert_demotion_allowed(
      OLD.lesson_id, OLD.capability, OLD.status, NULL, OLD.applicability::text, 'raw_delete');
    RETURN OLD;
  END IF;
  PERFORM public.cf11_assert_demotion_allowed(
    OLD.lesson_id, OLD.capability, OLD.status, NEW.status, OLD.applicability::text, 'raw_update');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.cf11_guard_lifecycle_demotion()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_cf11_guard_lifecycle_demotion ON public.lesson_capability_lifecycle;
CREATE TRIGGER trg_cf11_guard_lifecycle_demotion
  BEFORE UPDATE OR DELETE ON public.lesson_capability_lifecycle
  FOR EACH ROW EXECUTE FUNCTION public.cf11_guard_lifecycle_demotion();

/* Grant truth: prove at migration time that no Data API role can write the lifecycle table or
   reach the ticket table, so neither bypass path can be reopened silently. */
DO $$
DECLARE r text; p text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH p IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
      IF has_table_privilege(r, 'public.lesson_capability_lifecycle', p) THEN
        RAISE EXCEPTION 'CF11_RAW_TABLE_BYPASS: % holds % on lesson_capability_lifecycle', r, p;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF has_table_privilege(r, 'public.cf11_revocation_tickets', p) THEN
        RAISE EXCEPTION 'CF11_TICKET_TABLE_REACHABLE: % holds % on cf11_revocation_tickets', r, p;
      END IF;
    END LOOP;
    IF has_function_privilege(r, 'public.cf11_open_revocation_ticket(uuid,uuid,uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'CF11_TICKET_FORGEABLE: % may open a revocation ticket', r;
    END IF;
  END LOOP;
END $$;
