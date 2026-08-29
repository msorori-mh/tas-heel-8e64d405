-- COMPONENT_PUBLISHING_EXACTNESS_03 — executable PostgreSQL 17 proof.

-- A -> B -> A is a normal sequence of current versions, not a global-uniqueness error.
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
SET ROLE authenticated;

DO $aba$
DECLARE
  base_manifest jsonb;
  manifest_a jsonb;
  manifest_b jsonb;
  artifacts_a jsonb;
  artifacts_b jsonb;
  r1 jsonb;
  r2 jsonb;
  r3 jsonb;
BEGIN
  SELECT manifest INTO base_manifest
    FROM public.golden_lesson_package_versions
   WHERE manifest->'artifacts' IS NOT NULL
   ORDER BY created_at, version
   LIMIT 1;
  IF base_manifest IS NULL THEN
    RAISE EXCEPTION 'LCP_EXACTNESS_FIXTURE_MANIFEST_MISSING';
  END IF;

  SELECT jsonb_agg(
           CASE WHEN item->>'capability' = 'officialBookContent'
                THEN item || jsonb_build_object('sha256', repeat('a', 64))
                ELSE item END ORDER BY ord)
    INTO artifacts_a
    FROM jsonb_array_elements(base_manifest->'artifacts') WITH ORDINALITY AS x(item, ord);
  SELECT jsonb_agg(
           CASE WHEN item->>'capability' = 'officialBookContent'
                THEN item || jsonb_build_object('sha256', repeat('b', 64))
                ELSE item END ORDER BY ord)
    INTO artifacts_b
    FROM jsonb_array_elements(base_manifest->'artifacts') WITH ORDINALITY AS x(item, ord);

  manifest_a := jsonb_set(
    jsonb_set(base_manifest, '{packageCode}', to_jsonb('LCP-EXACTNESS-ABA'::text)),
    '{artifacts}', artifacts_a);
  manifest_b := jsonb_set(
    jsonb_set(base_manifest, '{packageCode}', to_jsonb('LCP-EXACTNESS-ABA'::text)),
    '{artifacts}', artifacts_b);

  r1 := public.golden_lesson_stage_manifest(manifest_a, repeat('1', 64));
  r2 := public.golden_lesson_stage_manifest(manifest_b, repeat('2', 64));
  r3 := public.golden_lesson_stage_manifest(manifest_a, repeat('1', 64));

  IF (r1->>'version')::integer <> 1
     OR (r2->>'version')::integer <> 2
     OR (r3->>'version')::integer <> 3
     OR coalesce((r3->>'idempotent')::boolean, true) THEN
    RAISE EXCEPTION 'LCP_EXACTNESS_ABA_NOT_VERSIONED: r1=% r2=% r3=%', r1, r2, r3;
  END IF;
  IF (SELECT count(*) FROM public.golden_lesson_package_versions
       WHERE package_id = (r1->>'package_id')::uuid) <> 3 THEN
    RAISE EXCEPTION 'LCP_EXACTNESS_ABA_VERSION_COUNT_WRONG';
  END IF;

  RAISE NOTICE 'LCP exactness A -> B -> A version proof passed.';
END
$aba$;

-- A duplicated request writes/publishes once and then replays the immutable receipt.
DO $replay$
DECLARE
  v_batch uuid;
  v_lesson uuid;
  v_lifecycle text;
  first_result jsonb;
  second_result jsonb;
  ready_after_first timestamptz;
  ready_after_second timestamptz;
  receipts_after_first integer;
  receipts_after_second integer;
  conflict_refused boolean := false;
BEGIN
  SELECT e.batch_id, b.lesson_id, e.lifecycle_capability
    INTO v_batch, v_lesson, v_lifecycle
    FROM public.golden_lesson_domain_stage_entries e
    JOIN public.golden_lesson_identity_bindings b ON b.batch_id = e.batch_id
    JOIN public.golden_lesson_domain_materializations m ON m.batch_id = e.batch_id
   WHERE e.capability = 'officialBookContent'
     AND e.source_path IS NOT NULL
   ORDER BY e.batch_id
   LIMIT 1;
  IF v_batch IS NULL THEN
    RAISE EXCEPTION 'LCP_EXACTNESS_MATERIALIZED_BOOK_BATCH_MISSING';
  END IF;

  first_result := public.golden_lesson_publish_component(
    v_batch, 'officialBookContent', 'lcp-exactness-replay-proof');
  SELECT ready_at INTO ready_after_first
    FROM public.lesson_capability_lifecycle
   WHERE lesson_id = v_lesson AND capability = v_lifecycle;
  SELECT count(*) INTO receipts_after_first
    FROM public.golden_lesson_component_publications
   WHERE batch_id = v_batch AND capability = 'officialBookContent';

  second_result := public.golden_lesson_publish_component(
    v_batch, 'officialBookContent', 'lcp-exactness-replay-proof');
  SELECT ready_at INTO ready_after_second
    FROM public.lesson_capability_lifecycle
   WHERE lesson_id = v_lesson AND capability = v_lifecycle;
  SELECT count(*) INTO receipts_after_second
    FROM public.golden_lesson_component_publications
   WHERE batch_id = v_batch AND capability = 'officialBookContent';

  IF coalesce((first_result->>'idempotent_replay')::boolean, true)
     OR coalesce((second_result->>'idempotent_replay')::boolean, false) IS NOT TRUE
     OR receipts_after_first <> 1 OR receipts_after_second <> 1
     OR ready_after_first IS DISTINCT FROM ready_after_second
     OR (second_result->>'writes_performed')::integer <> 0 THEN
    RAISE EXCEPTION 'LCP_EXACTNESS_REPLAY_WROTE_TWICE: first=% second=% receipts=%/% ready=%/%',
      first_result, second_result, receipts_after_first, receipts_after_second,
      ready_after_first, ready_after_second;
  END IF;

  BEGIN
    PERFORM public.golden_lesson_publish_component(
      v_batch, 'officialBookContent', 'lcp-exactness-different-key');
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE '%LCP_REPLAY_IDEMPOTENCY_KEY_CONFLICT%' THEN
      RAISE;
    END IF;
    conflict_refused := true;
  END;
  IF NOT conflict_refused THEN
    RAISE EXCEPTION 'LCP_EXACTNESS_DIFFERENT_REPLAY_KEY_WAS_ACCEPTED';
  END IF;

  RAISE NOTICE 'LCP exactness idempotent replay proof passed.';
END
$replay$;

RESET ROLE;
