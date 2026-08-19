-- PG17 rehearsal assertions: run after fixture -> R5 -> 21H -> postverify.
\set ON_ERROR_STOP on

DO $$
DECLARE
  n bigint;
  gain bigint;
  loss bigint;
BEGIN
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE status='READY'
     AND (ready_snapshot IS NULL OR ready_hash IS NULL OR ready_at IS NULL
          OR (ready_by IS NULL AND COALESCE(evidence_origin,'') <> 'LEGACY_20C_VISIBLE_BASELINE'));
  RAISE NOTICE 'READY_WITHOUT_EVIDENCE=%', n;
  IF n <> 0 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: READY_WITHOUT_EVIDENCE=%', n; END IF;

  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE capability='originalBookPdf' AND (status='READY' OR applicability <> 'NA');
  RAISE NOTICE 'ORIGINAL_BOOK_PDF_V3_APPLICABLE=%', n;
  IF n <> 0 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: originalBookPdf still in contract'; END IF;

  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle WHERE capability='originalBookPdf';
  RAISE NOTICE 'ORIGINAL_BOOK_PDF_ROWS=% (expected 40, deleted=0)', n;
  IF n <> 40 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: LEGACY_ROWS_DELETED'; END IF;

  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle;
  RAISE NOTICE 'LIFECYCLE_ROWS_TOTAL=% (fixture inserted 105)', n;
  IF n <> 105 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: lifecycle row count changed'; END IF;

  -- ready_by may only exist where the fixture seeded a real approver (2 rows).
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle WHERE ready_by IS NOT NULL;
  RAISE NOTICE 'READY_BY_PRESENT=% READY_BY_INVENTED=%', n, GREATEST(n - 2, 0);
  IF n <> 2 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: READY_BY_INVENTED=%', n - 2; END IF;

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
     WHERE status='READY' AND capability <> 'originalBookPdf'
    EXCEPT
    SELECT lesson_id, capability FROM _vis_before WHERE capability <> 'originalBookPdf') t;
  SELECT count(*) INTO loss FROM (
    SELECT lesson_id, capability FROM _vis_before WHERE capability <> 'originalBookPdf'
    EXCEPT
    SELECT lesson_id, capability FROM public.lesson_capability_lifecycle
     WHERE status='READY' AND capability <> 'originalBookPdf') t;
  RAISE NOTICE 'VISIBILITY_GAIN=% VISIBILITY_LOSS=%', gain, loss - 1;
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

  -- Revision pinning: every snapshotted question carries its PUBLISHED revision.
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle x,
       LATERAL jsonb_array_elements(x.ready_snapshot -> 'payload') q
   WHERE x.capability='checkUnderstanding'
     AND NOT EXISTS (SELECT 1 FROM public.question_revisions r
                      WHERE r.id = (q ->> 'revisionId')::uuid AND r.status='PUBLISHED');
  RAISE NOTICE 'REVISION_PINNING_UNPINNED=%', n;
  IF n <> 0 THEN RAISE EXCEPTION 'REHEARSAL_FAIL: REVISION_PINNING'; END IF;

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

  RAISE NOTICE 'PG17_REHEARSAL=PASS';
END $$;
