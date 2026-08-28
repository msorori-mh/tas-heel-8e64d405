-- LESSON_COMPONENT_INDEPENDENT_PUBLISHING_02 — CF11 READY scoped to authored components.
--
-- golden_lesson_attest_cf11_ready verified and promoted the canonical seven as one
-- unit. A lesson carrying one authored component reached REVIEW and then failed with
-- CF11_SNAPSHOT_NOT_RECONCILABLE on the first empty one, so nothing ever became READY
-- and the student saw nothing. That is the defect content staff reported.
--
-- Four READY-scope decisions now follow the AUTHORED subset instead of the canonical
-- seven. Each is marked `LCIP-02` inline:
--
--   1. first-READY snapshot loop  — an unauthored capability is skipped, not refused.
--   2. CF11_READY_SET_NOT_EXACT   — the resulting READY set must equal the authored set.
--   3. replay lifecycle equality  — the live READY set must equal the ATTESTED set,
--                                   read from the frozen ready_row.checks evidence.
--   4. replay snapshot loop       — iterates that same frozen attested set.
--
-- Everything else is byte-for-byte the production body (md5 f26c321c12e1b79c168057dfb86bad03).
-- Deliberately UNCHANGED, because these are what keep the relaxation safe:
--   * actor identity, content-staff authorization, separation of duties, revocation;
--   * cf11_assert_replay_state over the recorded publication plan;
--   * cf11_assert_exact_required_lifecycle_set — the lifecycle ROW set is still exactly
--     the canonical seven; only their CONTENT is independent;
--   * CF11_READY_REQUIRES_REVIEW_FOR_ALL — all seven rows must be in REVIEW, so an
--     out-of-band transition is still refused;
--   * HTML publication probe, asset object identity / attestation drift, answer-leak
--     scan, and the explicit human evidence contract.
--
-- Unauthored components stay in REVIEW. lesson_student_visible and
-- lesson_student_content_gate read status = 'READY' only, so REVIEW content is never
-- student-reachable — the relaxation widens what can be PUBLISHED, never what can be READ.
--
BEGIN;

-- ---------------------------------------------------------------------------
-- LCIP-02: the authored subset of a lesson.
--
-- v3_capability_snapshot_is_reconcilable() is already exactly the predicate
-- "this capability carries content" — it returns true only for a non-empty
-- payload. Naming that subset once keeps every READY-scope decision below
-- derived from the canonical seven, never from a live lifecycle row.
--
-- Deliberately plpgsql, not sql: a LANGUAGE sql body is resolved at CREATE time,
-- which would make this migration depend on the order CF10/CF11 happen to have
-- been applied in. A plpgsql body resolves at call time, so the migration is
-- order-independent and the reference is still checked — just when it is used.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf11_authored_capabilities(_lesson_id uuid)
RETURNS text[] LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $fn$
DECLARE
  result text[];
BEGIN
  SELECT coalesce(array_agg(c ORDER BY c), ARRAY[]::text[])
    INTO result
    FROM unnest(public.cf11_lifecycle_capabilities()) AS t(c)
   WHERE public.v3_capability_snapshot_is_reconcilable(
           public.v3_capability_snapshot(_lesson_id, t.c));
  RETURN result;
END
$fn$;

COMMENT ON FUNCTION public.cf11_authored_capabilities(uuid) IS
  'LCIP-02: the canonical capabilities of a lesson that actually carry content. Unauthored components are excluded from READY verification and promotion; they stay in REVIEW and are never student-reachable.';

CREATE OR REPLACE FUNCTION public.golden_lesson_attest_cf11_ready(
  _batch_id uuid, _actor_id uuid, _evidence jsonb DEFAULT '{}'::jsonb, _mode text DEFAULT 'DRY_RUN'::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
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
  authored_caps text[];   -- LCIP-02
  attested_caps text[];   -- LCIP-02
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
  IF pub.published_by = uid AND NOT public.golden_lesson_has_role(uid, 'admin') THEN
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
    -- lifecycle rows, and re-derives every attested capability snapshot/hash with the canonical
    -- Content V3 functions. A stored ledger checksum is not evidence about today.
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

    -- Exact lifecycle ROW set (not count) is still the canonical seven.
    PERFORM public.cf11_assert_exact_required_lifecycle_set(
      pub.lesson_id, 'CF11_READY_REPLAY_CONFLICT');

    -- LCIP-02 (3): the READY set must reproduce the set this publication actually
    -- attested, read from the FROZEN evidence — never from today's live rows, so a
    -- substituted or newly-authored capability cannot widen or narrow the replay.
    SELECT coalesce(array_agg(DISTINCT c.v->>'capability' ORDER BY c.v->>'capability'),
                    ARRAY[]::text[])
      INTO attested_caps
      FROM jsonb_array_elements(coalesce(ready_row.checks,'[]'::jsonb)) AS c(v);
    IF array_length(attested_caps, 1) IS NULL THEN
      RAISE EXCEPTION 'CF11_READY_REPLAY_CONFLICT: evidenceEmpty' USING ERRCODE = '23505';
    END IF;
    SELECT coalesce(array_agg(DISTINCT capability ORDER BY capability), ARRAY[]::text[])
      INTO live_caps
      FROM public.lesson_capability_lifecycle
     WHERE lesson_id = pub.lesson_id AND status = 'READY';
    IF live_caps IS DISTINCT FROM attested_caps THEN
      RAISE EXCEPTION 'CF11_READY_REPLAY_CONFLICT: lifecycle live=[%] attested=[%]',
        array_to_string(live_caps, ','), array_to_string(attested_caps, ',')
        USING ERRCODE = '23505';
    END IF;

    -- Re-derive each attested snapshot and compare against BOTH the frozen ledger
    -- evidence and the live lifecycle ready_snapshot/ready_hash. Any drift refuses the replay.
    replay_checks := '[]'::jsonb;
    FOREACH lifecycle_cap IN ARRAY attested_caps LOOP   -- LCIP-02 (4)
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

  -- Exact canonical ROW set, not a count, and every row applicability='REQUIRED'. Missing, extra,
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

  -- LCIP-02 (1): the authored subset is derived from the CONTRACT's canonical seven,
  -- not from live lifecycle rows, so a substituted row still cannot decide what gets
  -- verified. A lesson with nothing authored has nothing to attest.
  authored_caps := public.cf11_authored_capabilities(lesson_row.id);
  IF array_length(authored_caps, 1) IS NULL THEN
    RAISE EXCEPTION 'CF11_NO_AUTHORED_CAPABILITY' USING ERRCODE = '23514';
  END IF;

  -- CF11-R6: snapshot/hash verification over the canonical seven, iterated from the contract
  -- itself, so a substituted live row cannot decide which capabilities get verified. An
  -- unauthored capability is skipped: it stays in REVIEW and never becomes student-reachable.
  FOREACH lifecycle_cap IN ARRAY public.cf11_lifecycle_capabilities()
  LOOP
    IF NOT (lifecycle_cap = ANY (authored_caps)) THEN
      CONTINUE;   -- LCIP-02 (1)
    END IF;
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
      'checks', checks, 'transitions', 0, 'would_be_student_visible', false,
      'authored_capabilities', to_jsonb(authored_caps));
  END IF;

  -- LCIP-02 (2): after the transitions the READY set must be exactly the authored set —
  -- no more (nothing empty slipped through) and no less (nothing authored was skipped).
  SELECT coalesce(array_agg(DISTINCT capability ORDER BY capability), ARRAY[]::text[]) INTO live_caps
    FROM public.lesson_capability_lifecycle
   WHERE lesson_id = lesson_row.id AND status = 'READY';
  IF live_caps IS DISTINCT FROM authored_caps THEN
    RAISE EXCEPTION 'CF11_READY_SET_NOT_EXACT: live=[%] authored=[%]',
      array_to_string(live_caps, ','), array_to_string(authored_caps, ',')
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
                             'transitions',transitions,'evidence',_evidence,
                             'authoredCapabilities', to_jsonb(authored_caps)));

  RETURN jsonb_build_object('mode','EXECUTE','batch_id',_batch_id,'lesson_id',lesson_row.id,
    'checks', checks, 'transitions', transitions,
    'student_visible', public.lesson_student_visible(lesson_row.id),
    'authored_capabilities', to_jsonb(authored_caps),
    'published_by', pub.published_by, 'ready_attested_by', uid);
END $function$;

REVOKE ALL ON FUNCTION public.golden_lesson_attest_cf11_ready(uuid, uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.golden_lesson_attest_cf11_ready(uuid, uuid, jsonb, text) TO authenticated;

COMMIT;

-- Rollback:
--   Restore golden_lesson_attest_cf11_ready from
--   20260824000000_content_factory_11_publication.sql. NOTE: the repository copy has
--   drifted from production; the pre-change production body has md5
--   f26c321c12e1b79c168057dfb86bad03 (14285 bytes). No data changes to undo.
