-- =============================================================================
-- Runtime behaviour rehearsal for the pending phase-03 migration.
-- Runs against a disposable local PostgreSQL 17 cluster only.
-- Every check RAISEs on failure; the file ends with SMOKE_OK when all pass.
-- =============================================================================
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Seed principals and reference data
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'staff@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'admin@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'other@example.test');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'content_manager'),
  ('22222222-2222-2222-2222-222222222222', 'admin'),
  ('33333333-3333-3333-3333-333333333333', 'content_manager');

INSERT INTO public.curriculum_tracks (track_name, track_code) VALUES ('عدن', 'aden');
INSERT INTO public.grades (slug, name) VALUES ('grade-12', 'الثالث الثانوي');

INSERT INTO public.import_jobs (id, created_by, import_type, mode, status)
VALUES ('44444444-4444-4444-4444-444444444444',
        '11111111-1111-1111-1111-111111111111', 'structure', 'execute', 'validated');

SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- 1. stage + execute a subject (INSERT)
-- ---------------------------------------------------------------------------
SELECT public.import_stage_rows(
  '44444444-4444-4444-4444-444444444444', 'subjects',
  jsonb_build_array(jsonb_build_object(
    'sheet_name','subjects','row_number',2,
    'natural_key','subjects:math12','row_hash','hash-v1','is_valid',true,
    'planned_action','INSERT',
    'payload', jsonb_build_object(
      'subject_code','math12','slug','math-12','name','رياضيات',
      'grade_slug','grade-12','track_code','aden','semester','1','sort_order','1')
  ))) AS staged_subjects \gset

DO $$
DECLARE res jsonb;
BEGIN
  res := public.import_execute_template('44444444-4444-4444-4444-444444444444','subjects');
  IF (res->>'inserted')::int <> 1 THEN
    RAISE EXCEPTION 'CHECK-1 FAILED: expected 1 insert, got %', res;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subjects WHERE code = 'math12') THEN
    RAISE EXCEPTION 'CHECK-1 FAILED: subject not written';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.content_review_state
                 WHERE entity_type='subjects' AND content_hash='hash-v1'
                   AND review_status='pending' AND publication_status='draft') THEN
    RAISE EXCEPTION 'CHECK-1 FAILED: review state not seeded as pending/draft';
  END IF;
  RAISE NOTICE 'CHECK-1 insert + review state: PASS';
END $$;

-- ---------------------------------------------------------------------------
-- 2. idempotency — same hash re-executes as SKIP, no domain write
-- ---------------------------------------------------------------------------
DO $$
DECLARE res jsonb;
BEGIN
  res := public.import_execute_template('44444444-4444-4444-4444-444444444444','subjects');
  IF (res->>'skipped')::int <> 1 OR (res->>'inserted')::int <> 0 THEN
    RAISE EXCEPTION 'CHECK-2 FAILED: expected pure SKIP, got %', res;
  END IF;
  RAISE NOTICE 'CHECK-2 idempotent SKIP: PASS';
END $$;

-- ---------------------------------------------------------------------------
-- 3. published rows are never overwritten (BLOCKED_PUBLISHED)
-- ---------------------------------------------------------------------------
SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
DO $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM public.subjects WHERE code='math12';
  PERFORM public.content_review_set_state('subjects', sid, 'approved', 'published');
END $$;

-- a non-admin must not be able to publish
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
DO $$
DECLARE sid uuid; ok boolean := false;
BEGIN
  SELECT id INTO sid FROM public.subjects WHERE code='math12';
  BEGIN
    PERFORM public.content_review_set_state('subjects', sid, 'approved', 'published');
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK-3a FAILED: content staff could publish'; END IF;
  RAISE NOTICE 'CHECK-3a publish requires full admin: PASS';
END $$;

SELECT public.import_stage_rows(
  '44444444-4444-4444-4444-444444444444', 'subjects',
  jsonb_build_array(jsonb_build_object(
    'sheet_name','subjects','row_number',2,
    'natural_key','subjects:math12','row_hash','hash-v2','is_valid',true,
    'planned_action','UPDATE_DRAFT',
    'payload', jsonb_build_object(
      'subject_code','math12','slug','math-12','name','رياضيات معدّلة',
      'grade_slug','grade-12','track_code','aden','semester','1','sort_order','1')
  ))) AS staged_subjects_v2 \gset

DO $$
DECLARE res jsonb;
BEGIN
  res := public.import_execute_template('44444444-4444-4444-4444-444444444444','subjects');
  IF (res->>'blocked_published')::int <> 1 THEN
    RAISE EXCEPTION 'CHECK-3b FAILED: expected BLOCKED_PUBLISHED, got %', res;
  END IF;
  IF EXISTS (SELECT 1 FROM public.subjects WHERE code='math12' AND name='رياضيات معدّلة') THEN
    RAISE EXCEPTION 'CHECK-3b FAILED: published subject was overwritten';
  END IF;
  RAISE NOTICE 'CHECK-3b BLOCKED_PUBLISHED: PASS';
END $$;

-- ---------------------------------------------------------------------------
-- 4. question bank boundary
-- ---------------------------------------------------------------------------
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.import_execute_template('44444444-4444-4444-4444-444444444444','questions');
  EXCEPTION WHEN feature_not_supported THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK-4 FAILED: questions template was executable'; END IF;
  RAISE NOTICE 'CHECK-4 QUESTION_BANK_WORKFLOW_REQUIRED: PASS';
END $$;

-- ---------------------------------------------------------------------------
-- 5. ownership isolation
-- ---------------------------------------------------------------------------
SET request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.import_execute_template('44444444-4444-4444-4444-444444444444','subjects');
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK-5 FAILED: foreign staff executed another operator job'; END IF;
  RAISE NOTICE 'CHECK-5 NOT_JOB_OWNER: PASS';
END $$;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- 6. atomicity — one invalid row rolls the whole template back
-- ---------------------------------------------------------------------------
SELECT public.import_stage_rows(
  '44444444-4444-4444-4444-444444444444', 'lessons',
  jsonb_build_array(
    jsonb_build_object('row_number',2,'natural_key','lessons:l1','row_hash','lh-1','is_valid',true,
      'planned_action','INSERT',
      'payload', jsonb_build_object('subject_code','math12','lesson_code','l1','title','درس 1','sort_order','1')),
    jsonb_build_object('row_number',3,'natural_key','lessons:l2','row_hash','lh-2','is_valid',false,
      'planned_action','INSERT',
      'payload', jsonb_build_object('subject_code','math12','lesson_code','l2','title','درس 2','sort_order','2'))
  )) AS staged_lessons \gset

DO $$
DECLARE ok boolean := false; st text;
BEGIN
  BEGIN
    PERFORM public.import_execute_template('44444444-4444-4444-4444-444444444444','lessons');
  EXCEPTION WHEN invalid_parameter_value THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK-6 FAILED: invalid staged row did not abort'; END IF;
  IF EXISTS (SELECT 1 FROM public.lessons WHERE slug='l1') THEN
    RAISE EXCEPTION 'CHECK-6 FAILED: partial write survived the abort';
  END IF;
  SELECT execution_state INTO st FROM public.import_jobs
   WHERE id='44444444-4444-4444-4444-444444444444';
  IF st <> 'planned' THEN
    RAISE EXCEPTION 'CHECK-6 FAILED: job stuck in state %', st;
  END IF;
  RAISE NOTICE 'CHECK-6 atomic rollback + state restored: PASS';
END $$;

-- ---------------------------------------------------------------------------
-- 7. valid lesson + resource write, metadata allowlist
-- ---------------------------------------------------------------------------
SELECT public.import_stage_rows(
  '44444444-4444-4444-4444-444444444444', 'lessons',
  jsonb_build_array(
    jsonb_build_object('row_number',2,'natural_key','lessons:l1','row_hash','lh-1','is_valid',true,
      'planned_action','INSERT',
      'payload', jsonb_build_object('subject_code','math12','lesson_code','l1','title','درس 1','sort_order','1'))
  )) AS staged_lessons_ok \gset

DO $$
DECLARE res jsonb;
BEGIN
  res := public.import_execute_template('44444444-4444-4444-4444-444444444444','lessons');
  IF (res->>'inserted')::int <> 1 THEN RAISE EXCEPTION 'CHECK-7 FAILED: %', res; END IF;
  RAISE NOTICE 'CHECK-7 lesson insert: PASS';
END $$;

SELECT public.import_stage_rows(
  '44444444-4444-4444-4444-444444444444', 'resources',
  jsonb_build_array(
    jsonb_build_object('row_number',2,'natural_key','resources:l1:r1','row_hash','rh-1','is_valid',true,
      'planned_action','INSERT',
      'payload', jsonb_build_object('subject_code','math12','lesson_code','l1','resource_code','r1',
        'resource_type','pdf','title','ملزمة','resource_url','https://example.test/a.pdf',
        'metadata', jsonb_build_object('attribution','وزارة التربية')))
  )) AS staged_resources \gset

DO $$
DECLARE res jsonb;
BEGIN
  res := public.import_execute_template('44444444-4444-4444-4444-444444444444','resources');
  IF NOT EXISTS (SELECT 1 FROM public.lesson_resources WHERE resource_code='r1') THEN
    RAISE EXCEPTION 'CHECK-8 FAILED: resource not written (%)', res;
  END IF;
  RAISE NOTICE 'CHECK-8 resource insert: PASS';
END $$;

DO $$
DECLARE ok boolean := false; lid uuid;
BEGIN
  SELECT id INTO lid FROM public.lessons WHERE slug='l1';
  BEGIN
    INSERT INTO public.lesson_resources (lesson_id, resource_code, resource_type, title, url, metadata)
    VALUES (lid, 'r2', 'pdf', 'x', 'https://example.test/b.pdf', '{"evil":"1"}'::jsonb);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK-9 FAILED: metadata allowlist not enforced'; END IF;
  RAISE NOTICE 'CHECK-9 metadata allowlist: PASS';
END $$;

-- ---------------------------------------------------------------------------
-- 10. review state cannot be written directly, and orphans are impossible
-- ---------------------------------------------------------------------------
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.content_review_state (entity_type, entity_id, content_hash)
    VALUES ('lessons', gen_random_uuid(), 'x');
  EXCEPTION WHEN foreign_key_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK-10 FAILED: dangling review state accepted'; END IF;

  ok := false;
  BEGIN
    INSERT INTO public.content_review_state (entity_type, entity_id, content_hash)
    VALUES ('exam_templates', gen_random_uuid(), 'x');
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK-10 FAILED: unknown entity_type accepted'; END IF;
  RAISE NOTICE 'CHECK-10 fail-closed polymorphic reference: PASS';
END $$;

DO $$
DECLARE lid uuid;
BEGIN
  SELECT id INTO lid FROM public.lessons WHERE slug='l1';
  DELETE FROM public.lessons WHERE id = lid;
  IF EXISTS (SELECT 1 FROM public.content_review_state WHERE entity_type='lessons' AND entity_id=lid) THEN
    RAISE EXCEPTION 'CHECK-11 FAILED: orphan review state survived entity delete';
  END IF;
  RAISE NOTICE 'CHECK-11 review state cleanup on delete: PASS';
END $$;

-- ---------------------------------------------------------------------------
-- 12. finalize
-- ---------------------------------------------------------------------------
DO $$
DECLARE res jsonb;
BEGIN
  res := public.import_finalize_job('44444444-4444-4444-4444-444444444444', true, NULL);
  IF res->>'execution_state' <> 'applied' THEN RAISE EXCEPTION 'CHECK-12 FAILED: %', res; END IF;
  RAISE NOTICE 'CHECK-12 finalize: PASS';
END $$;

SELECT 'SMOKE_OK' AS result;
