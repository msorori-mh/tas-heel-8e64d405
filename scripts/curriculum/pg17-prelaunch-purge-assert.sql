\set ON_ERROR_STOP on

-- Attach representative immutable triggers after the migration replaced them.
CREATE TRIGGER test_golden_immutable
BEFORE DELETE ON public.golden_lesson_publications
FOR EACH ROW EXECUTE FUNCTION public.reject_golden_publication_mutation();
CREATE TRIGGER test_revision_immutable
BEFORE DELETE ON public.question_revisions
FOR EACH ROW EXECUTE FUNCTION public.qb_guard_question_revision_lifecycle();

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
DO $$ BEGIN
  PERFORM public.admin_curriculum_prelaunch_purge_status();
  RAISE EXCEPTION 'non-admin status unexpectedly succeeded';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

DO $$
DECLARE s jsonb;
BEGIN
  s := public.admin_curriculum_prelaunch_purge_status();
  IF NOT (s->>'enabled')::boolean THEN RAISE EXCEPTION 'purge should start enabled'; END IF;
  IF (s#>>'{counts,units}')::int <> 1 OR (s#>>'{counts,lessons}')::int <> 1 THEN
    RAISE EXCEPTION 'preview counts are wrong: %', s;
  END IF;

  BEGIN
    PERFORM public.admin_curriculum_prelaunch_purge(
      'حذف جميع الوحدات والدروس التجريبية',
      'تنظيف بيانات الاختبار قبل الإنتاج',
      repeat('0', 64),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    RAISE EXCEPTION 'stale preview unexpectedly succeeded';
  EXCEPTION WHEN serialization_failure THEN NULL; END;

  PERFORM public.admin_curriculum_prelaunch_purge(
    s->>'confirmation_phrase',
    'تنظيف بيانات الاختبار قبل الإنتاج',
    s->>'preview_sha256',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  );

  IF EXISTS (SELECT 1 FROM public.units) OR EXISTS (SELECT 1 FROM public.lessons)
     OR EXISTS (SELECT 1 FROM public.questions)
     OR EXISTS (SELECT 1 FROM public.golden_lesson_publications) THEN
    RAISE EXCEPTION 'post-purge rows remain';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subjects)
     OR NOT EXISTS (SELECT 1 FROM public.import_jobs)
     OR NOT EXISTS (SELECT 1 FROM public.import_staging_rows) THEN
    RAISE EXCEPTION 'preserved rows were deleted';
  END IF;

  -- Same key is a true replay even though the curriculum is now empty.
  PERFORM public.admin_curriculum_prelaunch_purge(
    s->>'confirmation_phrase',
    'تنظيف بيانات الاختبار قبل الإنتاج',
    s->>'preview_sha256',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  );

  PERFORM public.admin_lock_curriculum_prelaunch_purge(
    'إغلاق الحذف التجريبي نهائيا',
    'إغلاق نهائي قبل إطلاق الإنتاج'
  );
  IF (public.admin_curriculum_prelaunch_purge_status()->>'enabled')::boolean THEN
    RAISE EXCEPTION 'one-way lock did not disable purge';
  END IF;
END $$;

DO $$ BEGIN
  UPDATE public.curriculum_prelaunch_purge_control SET enabled = true;
  RAISE EXCEPTION 'authenticated role unexpectedly updated protected control';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;

RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.audit_logs) <> 3 THEN
    RAISE EXCEPTION 'expected fixture + purge + lock audit rows';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.curriculum_prelaunch_purge_runs
    WHERE idempotency_key = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ) THEN
    RAISE EXCEPTION 'purge run ledger missing';
  END IF;
END $$;

SELECT 'PRELAUNCH_CURRICULUM_PURGE_PG17_PASS' AS result;
