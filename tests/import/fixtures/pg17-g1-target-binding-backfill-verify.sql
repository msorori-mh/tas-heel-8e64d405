-- Verify the deterministic backfill result after stage 11 applied.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.question_targets
    WHERE question_id = '33333333-1111-0000-0000-000000000001'
      AND revision_id = '33333333-2222-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'BF FAIL: Q1 target not bound to the PUBLISHED revision';
  END IF;
  RAISE NOTICE 'PASS BF1 target of a published question bound to its published revision';

  IF EXISTS (
    SELECT 1 FROM public.question_targets
    WHERE question_id = '33333333-1111-0000-0000-000000000001'
      AND revision_id = '33333333-2222-0000-0000-000000000002'
  ) THEN
    RAISE EXCEPTION 'BF FAIL: target bound to the newer DRAFT revision';
  END IF;
  RAISE NOTICE 'PASS BF2 newer draft revision did not capture the legacy target';

  IF NOT EXISTS (
    SELECT 1 FROM public.question_targets
    WHERE question_id = '33333333-1111-0000-0000-000000000002'
      AND revision_id = '33333333-2222-0000-0000-000000000003'
  ) THEN
    RAISE EXCEPTION 'BF FAIL: Q2 target not bound to its single revision';
  END IF;
  RAISE NOTICE 'PASS BF3 single-revision question bound deterministically';

  IF (SELECT count(*) FROM public.question_targets) <> 2 THEN
    RAISE EXCEPTION 'BF FAIL: target rows were created or deleted by the backfill';
  END IF;
  RAISE NOTICE 'PASS BF4 backfill neither deleted nor duplicated target rows';
END $$;
