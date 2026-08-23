-- CF11 dynamic question-set contract.
-- Derives exact official/self-test sets from the verified, byte-pinned CF08 stage payload.

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
  mind_contract jsonb;
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
  expected_official_codes text[];
  expected_self_codes text[];
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

  mind_contract := public.cf11_assert_interactive_contract('mindMapHtml', mind_html);
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
  -- The verified, byte-pinned CF08 payload is authoritative. Counts vary by lesson, so CF11
  -- compares exact sorted code sets instead of enforcing the five/forty Iron rehearsal fixture.
  SELECT coalesce(array_agg(ext_code || '-OFFQ-' || coalesce(item->>'question_number', item->>'id')
                            ORDER BY ext_code || '-OFFQ-' || coalesce(item->>'question_number', item->>'id')),
                  ARRAY[]::text[])
    INTO expected_official_codes
    FROM public.golden_lesson_domain_stage_entries e
    CROSS JOIN LATERAL jsonb_array_elements(
      coalesce((convert_from(e.source_payload,'UTF8')::jsonb)->'questions','[]'::jsonb)) AS item
   WHERE e.batch_id = _batch_id AND e.capability = 'officialBookQuestions';
  SELECT coalesce(array_agg(ext_code || '-SELF-' || (item->>'id')
                            ORDER BY ext_code || '-SELF-' || (item->>'id')),
                  ARRAY[]::text[])
    INTO expected_self_codes
    FROM public.golden_lesson_domain_stage_entries e
    CROSS JOIN LATERAL jsonb_array_elements(
      coalesce((convert_from(e.source_payload,'UTF8')::jsonb)->'questions','[]'::jsonb)) AS item
   WHERE e.batch_id = _batch_id AND e.capability = 'selfTest';

  IF coalesce(array_length(expected_official_codes,1),0) = 0
     OR array_position(expected_official_codes,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'CF11_OFFICIAL_QUESTION_SET_INVALID' USING ERRCODE = '23514';
  END IF;
  IF coalesce(array_length(expected_self_codes,1),0) = 0
     OR array_position(expected_self_codes,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'CF11_SELFTEST_QUESTION_SET_INVALID' USING ERRCODE = '23514';
  END IF;
  IF cardinality(expected_official_codes) <> cardinality(ARRAY(SELECT DISTINCT unnest(expected_official_codes))) THEN
    RAISE EXCEPTION 'CF11_OFFICIAL_QUESTION_CODES_DUPLICATED' USING ERRCODE = '23514';
  END IF;
  IF cardinality(expected_self_codes) <> cardinality(ARRAY(SELECT DISTINCT unnest(expected_self_codes))) THEN
    RAISE EXCEPTION 'CF11_SELFTEST_QUESTION_CODES_DUPLICATED' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(array_agg(code ORDER BY code), ARRAY[]::text[]) INTO official_codes
    FROM public.questions WHERE lesson_id = lesson_row.id AND code LIKE ext_code || '-OFFQ-%';
  SELECT coalesce(array_agg(code ORDER BY code), ARRAY[]::text[]) INTO self_codes
    FROM public.questions WHERE lesson_id = lesson_row.id AND code LIKE ext_code || '-SELF-%';
  IF official_codes IS DISTINCT FROM expected_official_codes THEN
    RAISE EXCEPTION 'CF11_OFFICIAL_QUESTION_SET_MISMATCH: expected=[%] actual=[%]',
      array_to_string(expected_official_codes,','), array_to_string(official_codes,',')
      USING ERRCODE = '23514';
  END IF;
  IF self_codes IS DISTINCT FROM expected_self_codes THEN
    RAISE EXCEPTION 'CF11_SELFTEST_QUESTION_SET_MISMATCH: expected=[%] actual=[%]',
      array_to_string(expected_self_codes,','), array_to_string(self_codes,',')
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
  IF jsonb_array_length(official_plan) <> cardinality(expected_official_codes)
     OR jsonb_array_length(self_plan) <> cardinality(expected_self_codes) THEN
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
                                    'renderMode','INTERACTIVE',
                                    'csp', mind_contract),
      'simulation', jsonb_build_object('resourceCode', ext_code || '-EXPERIMENT',
                                       'sha256', public.cf11_text_sha256(lab_html),
                                       'renderMode','INTERACTIVE',
                                       'csp', lab_contract)),
    'questions', jsonb_build_object('official', official_plan, 'selfTest', self_plan),
    'assessment', jsonb_build_object('code', ext_code || '-SELFTEST',
                                     'memberCount', cardinality(expected_self_codes),
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
      'INTERACTIVE',
      jsonb_build_object(
        'cf11_publication_id', publication_id,
        'cf11_published_at', now(),
        'cf11_published_by', uid,
        'cf11_body_sha256', public.cf11_text_sha256(
          CASE cap WHEN 'mindMap' THEN mind_html ELSE lab_html END),
        'cf11_render_mode', 'INTERACTIVE',
        'cf11_verified_bundle_sha256', batch.verified_bundle_sha256,
        'cf11_csp', CASE cap WHEN 'mindMap' THEN mind_contract ELSE lab_contract END),
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

  -- 5) assessment membership: EXACTLY the self-test set pinned from the staged payload
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
  IF member_count <> cardinality(expected_self_codes) OR official_in_assessment <> 0 THEN
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

REVOKE ALL ON FUNCTION public.golden_lesson_publish_cf11(uuid, uuid, text, jsonb, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.golden_lesson_publish_cf11(uuid, uuid, text, jsonb, text, text)
  TO authenticated;
