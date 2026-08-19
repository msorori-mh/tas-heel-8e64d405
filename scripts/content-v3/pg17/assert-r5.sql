-- PG17 rehearsal assertions: run after fixture -> R5-R2 -> 21H -> postverify.
\set ON_ERROR_STOP on

DO $$
DECLARE
  n bigint;
  gain bigint;
  loss bigint;
  t timestamptz;
  retired text[] := ARRAY['originalBookPdf','supportingResources'];
BEGIN
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE status='READY'
     AND (ready_snapshot IS NULL OR ready_hash IS NULL OR ready_at IS NULL
          OR (ready_by IS NULL AND COALESCE(evidence_origin,'') <> 'LEGACY_20C_VISIBLE_BASELINE'));
  RAISE NOTICE 'READY_ROWS_WITHOUT_VALID_EVIDENCE=%', n;
  IF n <> 0 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: READY_ROWS_WITHOUT_VALID_EVIDENCE=%', n; END IF;

  -- Every retired capability is out of READY and carries provenance.
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE capability = ANY (retired) AND (status='READY' OR applicability <> 'NA'
         OR COALESCE(retirement_origin,'') <> 'LEGACY_20C');
  RAISE NOTICE 'RETIRED_READY_ROWS=%', n;
  IF n <> 0 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: RETIRED_READY_ROWS=%', n; END IF;

  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle WHERE capability = ANY (retired);
  RAISE NOTICE 'RETIRED_ROWS_RETAINED=% (expected 41, deleted=0)', n;
  IF n <> 41 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: LEGACY_ROWS_DELETED'; END IF;

  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle;
  RAISE NOTICE 'LIFECYCLE_ROWS_TOTAL=% (fixture inserted 106)', n;
  IF n <> 106 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: lifecycle row count changed'; END IF;

  -- ready_by may only exist where the fixture seeded a real approver (3 rows:
  -- quickReview, one explanation, one conflicting-approver row) or where a
  -- literal REVIEW->READY audit transition exists (1 row).
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle WHERE ready_by IS NOT NULL;
  RAISE NOTICE 'READY_BY_PRESENT=% INVENTED_READY_BY=%', n, GREATEST(n - 4, 0);
  IF n <> 4 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: INVENTED_READY_BY=%', n - 4; END IF;

  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE evidence_origin='LEGACY_20C_VISIBLE_BASELINE' AND ready_by IS NOT NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: legacy baseline row claims an approver'; END IF;

  -- (c) REVIEW->READY audit grants AUDITED_APPROVAL, and ready_at comes from
  --     the NEWEST matching audit row, not from lifecycle.updated_at.
  SELECT ready_at INTO t FROM public.lesson_capability_lifecycle
   WHERE capability='officialBookContent' AND lesson_id='55555555-0000-0000-0000-000000000003';
  RAISE NOTICE 'AUDIT_REVIEW_TO_READY_ONLY ready_at=%', t;
  IF t <> timestamptz '2026-07-01 10:00:00+00' THEN
    RAISE EXCEPTION 'REHEARSAL_FAIL: READY_AT_FROM_AUDIT expected 2026-07-01, got %', t;
  END IF;
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE capability='officialBookContent' AND lesson_id='55555555-0000-0000-0000-000000000003'
     AND evidence_origin='AUDITED_APPROVAL' AND ready_by IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: REVIEW->READY audit did not grant AUDITED_APPROVAL'; END IF;

  -- (d) DRAFT->READY audit must NOT grant AUDITED_APPROVAL.
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE capability='officialBookContent' AND lesson_id='55555555-0000-0000-0000-000000000004'
     AND evidence_origin='LEGACY_20C_VISIBLE_BASELINE' AND ready_by IS NULL
     AND ready_at = timestamptz '2026-02-02 00:00:00+00';
  RAISE NOTICE 'DRAFT_TO_READY_REJECTED=%', n;
  IF n <> 1 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: DRAFT->READY audit was treated as an approval'; END IF;

  -- The unreconcilable row must be flagged, never pinned.
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE evidence_origin='NEEDS_MANUAL_REVIEW';
  RAISE NOTICE 'MANUAL_REVIEW_ROWS=% (fixture-only, production=0)', n;
  IF n <> 1 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: manual review branch not exercised'; END IF;
  IF EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle
              WHERE evidence_origin='NEEDS_MANUAL_REVIEW' AND (status='READY' OR ready_snapshot IS NOT NULL)) THEN
    RAISE EXCEPTION 'REHEARSAL_FAIL: manual-review row was pinned';
  END IF;

  -- Visibility diff over the seven V3 capabilities.
  SELECT count(*) INTO gain FROM (
    SELECT lesson_id, capability FROM public.lesson_capability_lifecycle
     WHERE status='READY' AND NOT (capability = ANY (retired))
    EXCEPT
    SELECT lesson_id, capability FROM _vis_before WHERE NOT (capability = ANY (retired))) t2;
  SELECT count(*) INTO loss FROM (
    SELECT lesson_id, capability FROM _vis_before WHERE NOT (capability = ANY (retired))
    EXCEPT
    SELECT lesson_id, capability FROM public.lesson_capability_lifecycle
     WHERE status='READY' AND NOT (capability = ANY (retired))) t2;
  RAISE NOTICE 'UNEXPECTED_VISIBILITY_GAIN=% UNEXPECTED_VISIBILITY_LOSS=%', gain, loss - 1;
  IF gain <> 0 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: UNEXPECTED_GAIN=%', gain; END IF;
  -- The only expected loss is the fixture-only unreconcilable mindMap row.
  IF loss <> 1 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: UNEXPECTED_LOSS=%', loss - 1; END IF;

  -- Source content untouched.
  SELECT count(*) INTO n FROM public.lesson_book_contents;
  IF n <> 21 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: book content mutated'; END IF;
  SELECT count(*) INTO n FROM public.lesson_resources WHERE resource_type='pdf';
  IF n <> 40 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: pdf resources mutated'; END IF;

  -- Answer leak: no snapshot may contain an answer key or rationale field.
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE ready_snapshot::text ~* '(is_correct|isCorrect|why_correct|why_wrong|model_answer|correct_option)';
  RAISE NOTICE 'ANSWER_LEAK=%', n;
  IF n <> 0 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: ANSWER_LEAK=%', n; END IF;

  -- Revision pinning: every snapshotted question carries its PUBLISHED revision
  -- and no snapshot entry may carry a null revisionId.
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle x,
       LATERAL jsonb_array_elements(x.ready_snapshot -> 'payload') q
   WHERE x.capability='checkUnderstanding'
     AND (COALESCE(q ->> 'revisionId','') = ''
          OR NOT EXISTS (SELECT 1 FROM public.question_revisions r
                          WHERE r.id = (q ->> 'revisionId')::uuid AND r.status='PUBLISHED'));
  RAISE NOTICE 'PUBLISHED_REVISION_NULL=%', n;
  IF n <> 0 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: REVISION_PINNING'; END IF;

  -- The two unpublishable questions never entered the snapshot.
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle x,
       LATERAL jsonb_array_elements(x.ready_snapshot -> 'payload') q
   WHERE x.capability='checkUnderstanding'
     AND (q ->> 'questionId') IN ('66666666-0000-0000-0000-000000000004',
                                  '66666666-0000-0000-0000-000000000005');
  IF n <> 0 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: unpublished question entered snapshot'; END IF;

  -- No READY row carries an empty snapshot payload.
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE status='READY' AND NOT public.v3_capability_snapshot_is_reconcilable(ready_snapshot);
  RAISE NOTICE 'EMPTY_READY_SNAPSHOT=%', n;
  IF n <> 0 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: EMPTY_READY_SNAPSHOT=%', n; END IF;

  -- Determinism: recomputing the snapshot hash reproduces the stored hash.
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle x
   WHERE x.ready_hash IS NOT NULL
     AND x.ready_hash <> public.v3_capability_snapshot_hash(x.ready_snapshot);
  RAISE NOTICE 'HASH_NONDETERMINISM=%', n;
  IF n <> 0 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: snapshot hash not deterministic'; END IF;

  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND c.relname='lesson_capability_lifecycle' AND c.relrowsecurity;
  RAISE NOTICE 'RLS=%', CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END;
  IF n <> 1 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: RLS disabled'; END IF;

  -- ------------------------------------------------------------------
  -- R5-R3 gates
  -- ------------------------------------------------------------------

  -- Gate A: snapshot/hash atomic consistency across the whole table.
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE status='READY'
     AND ready_hash IS DISTINCT FROM public.v3_capability_snapshot_hash(ready_snapshot);
  RAISE NOTICE 'READY_SNAPSHOT_HASH_MISMATCH=%', n;
  IF n <> 0 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: READY_SNAPSHOT_HASH_MISMATCH=%', n; END IF;

  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE status='READY' AND ready_snapshot IS NULL AND ready_hash IS NOT NULL;
  RAISE NOTICE 'MISSING_SNAPSHOT_WITH_EXISTING_HASH=%', n;
  IF n <> 0 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: MISSING_SNAPSHOT_WITH_EXISTING_HASH=%', n; END IF;

  -- (e) stored snapshot + missing hash: the STORED snapshot is kept and hashed.
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE capability='officialBookContent' AND lesson_id='55555555-0000-0000-0000-000000000005'
     AND ready_snapshot::text LIKE '%STORED-ONLY-SNAPSHOT%'
     AND ready_hash = public.v3_capability_snapshot_hash(ready_snapshot);
  RAISE NOTICE 'STORED_SNAPSHOT_HASHED_FROM_STORED=%', n;
  IF n <> 1 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: stored snapshot was replaced or hashed from the rebuilt value'; END IF;

  -- Gate B: AUDITED_APPROVAL identity consistency.
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle x
   WHERE x.evidence_origin='AUDITED_APPROVAL'
     AND NOT EXISTS (SELECT 1 FROM public.v3_capability_audited_approval(x.lesson_id, x.capability) ap
                      WHERE ap.actor_id = x.ready_by AND ap.approved_at = x.ready_at);
  RAISE NOTICE 'AUDITED_APPROVAL_ACTOR_MISMATCH=%', n;
  IF n <> 0 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: AUDITED_APPROVAL_ACTOR_MISMATCH=%', n; END IF;

  -- (f) a conflicting pre-existing approver is documented, never overwritten.
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE capability='officialBookContent' AND lesson_id='55555555-0000-0000-0000-000000000006'
     AND evidence_origin='LEGACY_20C_ROW_APPROVER'
     AND ready_by='44444444-4444-4444-4444-444444444445'
     AND ready_at=timestamptz '2026-03-03 00:00:00+00';
  RAISE NOTICE 'ROW_APPROVER_CONFLICT_PRESERVED=%', n;
  IF n <> 1 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: conflicting ready_by was silently replaced'; END IF;

  -- (g) an otherwise valid audit row with the wrong target_type grants nothing.
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE capability='officialBookContent' AND lesson_id='55555555-0000-0000-0000-000000000007'
     AND evidence_origin='LEGACY_20C_VISIBLE_BASELINE' AND ready_by IS NULL;
  RAISE NOTICE 'AUDIT_TARGET_TYPE_ENFORCED=%', CASE WHEN n=1 THEN 'YES' ELSE 'NO' END;
  IF n <> 1 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: wrong target_type audit granted approval'; END IF;

  RAISE NOTICE 'PG17_REHEARSAL=PASS';
END $$;
