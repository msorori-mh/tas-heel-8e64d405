\set ON_ERROR_STOP on

DO $$
DECLARE
  v_status jsonb;
  v_result jsonb;
BEGIN
  v_status := public.admin_grade12_subject_catalog_status();
  ASSERT v_status->>'status' = 'READY', v_status::text;
  ASSERT (v_status->>'expected_subjects')::integer = 14, v_status::text;
  ASSERT (v_status->>'expected_track_links')::integer = 28, v_status::text;
  ASSERT (v_status->>'conflict_count')::integer = 0, v_status::text;

  v_result := public.admin_initialize_grade12_subject_catalog(v_status->>'preview_sha256');
  ASSERT v_result->>'status' = 'COMPLETE', v_result::text;
  ASSERT (v_result->>'created_subjects')::integer = 14, v_result::text;
  ASSERT (v_result->>'matched_track_links')::integer = 28, v_result::text;
END $$;

DO $$
DECLARE
  v_status jsonb;
  v_result jsonb;
BEGIN
  v_status := public.admin_grade12_subject_catalog_status();
  v_result := public.admin_initialize_grade12_subject_catalog(v_status->>'preview_sha256');
  ASSERT v_result->>'status' = 'COMPLETE', v_result::text;
  ASSERT (v_result->>'created_subjects')::integer = 0, v_result::text;
END $$;

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.subjects) = 14;
  ASSERT (SELECT count(*) FROM public.subject_curriculum_tracks WHERE is_active) = 28;
  ASSERT (SELECT count(*) FROM public.subjects WHERE semester IS NULL) = 14;
  ASSERT (SELECT count(*) FROM public.subjects WHERE curriculum_track_id IS NULL) = 14;
  ASSERT (SELECT count(DISTINCT coalesce(group_name, name)) FROM public.subjects) = 8;
  ASSERT (SELECT count(*) FROM public.subjects WHERE group_name = 'التربية الإسلامية') = 4;
  ASSERT (SELECT count(*) FROM public.subjects WHERE group_name = 'اللغة العربية') = 3;
  ASSERT (SELECT count(*) FROM public.subjects WHERE group_name = 'الرياضيات') = 2;
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.subject_curriculum_tracks st
    JOIN public.curriculum_tracks ct ON ct.id = st.curriculum_track_id
    WHERE ct.track_code NOT IN ('sanaa', 'aden')
  );
  ASSERT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE action = 'GRADE12_SUBJECT_CATALOG_INITIALIZED'
  );
END $$;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
DO $$
BEGIN
  PERFORM public.admin_grade12_subject_catalog_status();
  RAISE EXCEPTION 'unauthorized status unexpectedly succeeded';
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
END $$;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
BEGIN;
UPDATE public.subjects SET name = 'اسم متعارض' WHERE code = 'sub-g12-013';
DO $$
DECLARE
  v_status jsonb;
BEGIN
  v_status := public.admin_grade12_subject_catalog_status();
  ASSERT v_status->>'status' = 'CONFLICT', v_status::text;
  BEGIN
    PERFORM public.admin_initialize_grade12_subject_catalog(v_status->>'preview_sha256');
    RAISE EXCEPTION 'conflicting catalog unexpectedly initialized';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;
END $$;
ROLLBACK;

DO $$
DECLARE v_status jsonb;
BEGIN
  v_status := public.admin_grade12_subject_catalog_status();
  ASSERT v_status->>'status' = 'COMPLETE', v_status::text;
END $$;
