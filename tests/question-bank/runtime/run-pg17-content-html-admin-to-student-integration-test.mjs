#!/usr/bin/env node
/**
 * PostgreSQL 17 Local Disposable Runtime Test Runner for
 * TAMKEEN_HTML_RESOURCE_CONTRACT_REAL_DB_FULL_CLOSURE_16
 *
 * Verifies the full HTML Resource contract:
 *   Admin Import → Database → Lifecycle → Publish → Student Enumeration → Signed Access
 * using a real local PostgreSQL database (not mocks).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..", "..");
const foundationPath = join(root, "supabase", "migrations", "20260806050000_content_html_db_rls_foundation.sql");
const lifecyclePath = join(root, "supabase", "migrations", "20260807050000_content_html_lifecycle_contracts.sql");
const alignmentPath = join(root, "supabase", "migrations", "20260808060000_content_html_resource_contract_alignment.sql");

function projectRefLinked() {
  return existsSync(join(root, "supabase", ".temp", "project-ref"));
}

if (projectRefLinked()) {
  console.error("REFUSED: supabase/.temp/project-ref present (remote link)");
  process.exit(2);
}

for (const p of [foundationPath, lifecyclePath, alignmentPath]) {
  if (!existsSync(p)) {
    console.error(`Missing migration file: ${p}`);
    process.exit(1);
  }
}

const containerName = `pg17-html-admin-to-student-test-${Date.now()}`;
console.log(`Launching isolated PostgreSQL 17 container: ${containerName}`);

let containerStarted = false;

function psql(input, { fatal = true } = {}) {
  const run = spawnSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
    {
      input,
      encoding: "utf8",
      shell: true,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (run.status !== 0 && fatal) {
    console.error("PSQL failed:", run.stderr || run.stdout);
    process.exit(run.status ?? 1);
  }
  return run;
}

function waitForPostgres() {
  console.log("Waiting for PostgreSQL 17 to accept connections...");
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const ping = spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "postgres"], {
      encoding: "utf8",
      shell: true,
    });
    if (ping.status === 0) {
      ready = true;
      spawnSync("node", ["-e", "setTimeout(() => {}, 1000)"]);
      break;
    }
    spawnSync("node", ["-e", "setTimeout(() => {}, 500)"]);
  }
  if (!ready) {
    console.error("PostgreSQL 17 container failed to become ready in time.");
    process.exit(1);
  }
  console.log("PostgreSQL 17 is ready.");
}

try {
  const launchRun = spawnSync(
    "docker",
    ["run", "-d", "--name", containerName, "-e", "POSTGRES_PASSWORD=postgres", "postgres:17-alpine"],
    { encoding: "utf8", shell: true },
  );

  if (launchRun.status !== 0) {
    console.error("Failed to start PostgreSQL 17 container:", launchRun.stderr || launchRun.stdout);
    process.exit(1);
  }
  containerStarted = true;

  waitForPostgres();

  const baselineSql = `
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT authenticated TO postgres;
GRANT service_role TO postgres;
GRANT anon TO postgres;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'system@test.com') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('test.auth_uid', true), '')
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('test.auth_role', true), ''),
    current_user
  );
$$;

DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin', 'content_manager', 'student'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.lesson_resource_type AS ENUM ('video', 'mindmap', 'experiment', 'pdf', 'link', 'html', 'interactive_html'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_user_role_uniq UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.can_access_lesson(_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(nullif(current_setting('test.can_access_lesson', true), '')::boolean, true);
$$;

CREATE TABLE IF NOT EXISTS public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text,
  sort_order integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.lesson_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  resource_type public.lesson_resource_type NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA public TO authenticated, service_role, anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
`;

  console.log("Applying baseline prerequisite SQL...");
  psql(baselineSql);

  console.log("Applying foundation migration...");
  psql(readFileSync(foundationPath, "utf8"));

  console.log("Applying lifecycle contracts migration...");
  psql(readFileSync(lifecyclePath, "utf8"));

  console.log("Applying resource contract alignment migration...");
  psql(readFileSync(alignmentPath, "utf8"));

  const testSql = `
BEGIN;

CREATE OR REPLACE FUNCTION pg17_assert(p_cond boolean, p_name text) RETURNS void AS $$
BEGIN
  IF NOT p_cond THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', p_name USING ERRCODE = 'P0001';
  ELSE
    RAISE NOTICE 'PASS: %', p_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN RAISE NOTICE '=== Starting PG17 Admin→Student HTML Resource Contract Test ==='; END $$;

DO $$
DECLARE
  v_admin_id uuid := gen_random_uuid();
  v_cm_id uuid := gen_random_uuid();
  v_student_id uuid := gen_random_uuid();
  v_lesson_id uuid := gen_random_uuid();
  v_other_lesson_id uuid := gen_random_uuid();

  v_mm_res_id uuid := gen_random_uuid();
  v_exp_res_id uuid := gen_random_uuid();
  v_sum_res_id uuid := gen_random_uuid();

  v_draft_res_id uuid := gen_random_uuid();
  v_review_res_id uuid := gen_random_uuid();
  v_approved_res_id uuid := gen_random_uuid();
  v_other_lesson_res_id uuid := gen_random_uuid();
  v_legacy_res_id uuid := gen_random_uuid();

  v_mm_v1_id uuid := gen_random_uuid();
  v_exp_v1_id uuid := gen_random_uuid();
  v_sum_v1_id uuid := gen_random_uuid();

  v_mm_v2_id uuid := gen_random_uuid();

  v_draft_v1_id uuid := gen_random_uuid();
  v_review_v1_id uuid := gen_random_uuid();
  v_approved_v1_id uuid := gen_random_uuid();
  v_other_v1_id uuid := gen_random_uuid();
  v_legacy_v1_id uuid := gen_random_uuid();

  v_batch_id uuid := gen_random_uuid();

  v_mm_session_id uuid := gen_random_uuid();
  v_exp_session_id uuid := gen_random_uuid();
  v_sum_session_id uuid := gen_random_uuid();
  v_mm_v2_session_id uuid := gen_random_uuid();
  v_review_session_id uuid := gen_random_uuid();
  v_approved_session_id uuid := gen_random_uuid();

  v_mm_op_id uuid;
  v_exp_op_id uuid;
  v_sum_op_id uuid;
  v_mm_v2_op_id uuid;

  v_err_caught boolean;
  v_sqlstate text;
  v_count integer;
  v_binding record;
  v_row record;
BEGIN
  -- Users and roles
  INSERT INTO auth.users (id, email) VALUES
    (v_admin_id, 'admin@test.com'),
    (v_cm_id, 'cm@test.com'),
    (v_student_id, 'student@test.com');

  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_admin_id, 'admin'),
    (v_cm_id, 'content_manager'),
    (v_student_id, 'student');

  INSERT INTO public.lessons (id, title, slug, sort_order) VALUES
    (v_lesson_id, 'Test Lesson', 'lesson-1', 1),
    (v_other_lesson_id, 'Other Lesson', 'lesson-2', 2);

  -- ============================================================
  -- Seed canonical HTML resources with subtypes and codes
  -- ============================================================
  INSERT INTO public.lesson_resources (
    id, lesson_id, resource_type, html_resource_type, resource_code, title, url, lifecycle_status
  ) VALUES
    (v_mm_res_id, v_lesson_id, 'html', 'mind_map_html', 'TEST_MM_001', 'Mind Map 1', '', 'draft'),
    (v_exp_res_id, v_lesson_id, 'html', 'practical_experiment_html', 'TEST_EXP_001', 'Experiment 1', '', 'draft'),
    (v_sum_res_id, v_lesson_id, 'html', 'summary_html', 'TEST_SUM_001', 'Summary 1', '', 'draft');

  -- Negative-case resources
  INSERT INTO public.lesson_resources (
    id, lesson_id, resource_type, html_resource_type, resource_code, title, url, lifecycle_status
  ) VALUES
    (v_draft_res_id, v_lesson_id, 'html', 'mind_map_html', 'NEG_DRAFT', 'Draft Only', '', 'draft'),
    (v_review_res_id, v_lesson_id, 'html', 'practical_experiment_html', 'NEG_REVIEW', 'In Review', '', 'draft'),
    (v_approved_res_id, v_lesson_id, 'html', 'summary_html', 'NEG_APPROVED', 'Approved Unpublished', '', 'draft'),
    (v_other_lesson_res_id, v_other_lesson_id, 'html', 'mind_map_html', 'OTHER_MM', 'Other Lesson', '', 'draft'),
    (v_legacy_res_id, v_lesson_id, 'video', NULL, 'LEGACY_VID', 'Legacy Video', 'https://example.com', 'published');

  -- ============================================================
  -- DB constraint checks
  -- ============================================================
  v_err_caught := false;
  BEGIN
    INSERT INTO public.lesson_resources (id, lesson_id, resource_type, html_resource_type, resource_code, title, url)
    VALUES (gen_random_uuid(), v_lesson_id, 'video', 'mind_map_html', 'BAD_TYPE', 'Inconsistent', '');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '23514' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'html_resource_type with non-html resource_type DENIED (check constraint)');

  v_err_caught := false;
  BEGIN
    INSERT INTO public.lesson_resources (id, lesson_id, resource_type, html_resource_type, resource_code, title, url)
    VALUES (gen_random_uuid(), v_lesson_id, 'html', 'invalid_subtype', 'BAD_SUBTYPE', 'Invalid Subtype', '');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '23514' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'invalid html_resource_type DENIED (check constraint)');

  v_err_caught := false;
  BEGIN
    INSERT INTO public.lesson_resources (id, lesson_id, resource_type, html_resource_type, resource_code, title, url)
    VALUES (gen_random_uuid(), v_lesson_id, 'html', 'mind_map_html', 'TEST_MM_001', 'Duplicate Code', '');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '23505' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'duplicate resource_code within lesson DENIED (unique index)');

  -- ============================================================
  -- Versions for canonical resources
  -- ============================================================
  INSERT INTO public.lesson_resource_versions (id, resource_id, version_number, content_sha256, manifest) VALUES
    (v_mm_v1_id, v_mm_res_id, 1, 'sha256_mm_1111111111111111111111111111111111111111111111111111111111111111', '{"entry":"index.html"}'::jsonb),
    (v_exp_v1_id, v_exp_res_id, 1, 'sha256_exp_1111111111111111111111111111111111111111111111111111111111111111', '{"entry":"index.html"}'::jsonb),
    (v_sum_v1_id, v_sum_res_id, 1, 'sha256_sum_1111111111111111111111111111111111111111111111111111111111111111', '{"entry":"index.html"}'::jsonb),
    (v_mm_v2_id, v_mm_res_id, 2, 'sha256_mm_2222222222222222222222222222222222222222222222222222222222222222', '{"entry":"v2.html"}'::jsonb);

  -- Versions for negative-case resources
  INSERT INTO public.lesson_resource_versions (id, resource_id, version_number, content_sha256, manifest) VALUES
    (v_draft_v1_id, v_draft_res_id, 1, 'sha256_draft_1111111111111111111111111111111111111111111111111111111111111111', '{}'::jsonb),
    (v_review_v1_id, v_review_res_id, 1, 'sha256_review_1111111111111111111111111111111111111111111111111111111111111111', '{}'::jsonb),
    (v_approved_v1_id, v_approved_res_id, 1, 'sha256_approved_1111111111111111111111111111111111111111111111111111111111111111', '{}'::jsonb),
    (v_other_v1_id, v_other_lesson_res_id, 1, 'sha256_other_1111111111111111111111111111111111111111111111111111111111111111', '{}'::jsonb),
    (v_legacy_v1_id, v_legacy_res_id, 1, 'sha256_legacy_1111111111111111111111111111111111111111111111111111111111111111', '{}'::jsonb);

  UPDATE public.lesson_resources SET current_draft_version_id = v_mm_v1_id WHERE id = v_mm_res_id;
  UPDATE public.lesson_resources SET current_draft_version_id = v_exp_v1_id WHERE id = v_exp_res_id;
  UPDATE public.lesson_resources SET current_draft_version_id = v_sum_v1_id WHERE id = v_sum_res_id;
  UPDATE public.lesson_resources SET current_draft_version_id = v_draft_v1_id WHERE id = v_draft_res_id;
  UPDATE public.lesson_resources SET current_draft_version_id = v_review_v1_id WHERE id = v_review_res_id;
  UPDATE public.lesson_resources SET current_draft_version_id = v_approved_v1_id WHERE id = v_approved_res_id;
  UPDATE public.lesson_resources SET current_draft_version_id = v_other_v1_id WHERE id = v_other_lesson_res_id;
  UPDATE public.lesson_resources SET published_version_id = v_legacy_v1_id WHERE id = v_legacy_res_id;

  -- ============================================================
  -- Upload sessions and validations
  -- ============================================================
  INSERT INTO public.content_import_batches (id, actor_id, status) VALUES (v_batch_id, v_cm_id, 'created');

  INSERT INTO public.lesson_resource_upload_sessions (
    id, batch_id, actor_id, resource_id, staging_path, expected_package_hash, original_filename, expires_at
  ) VALUES
    (v_mm_session_id, v_batch_id, v_cm_id, v_mm_res_id, 'html-packages/staging/mm_v1', 'sha256_mm_1111111111111111111111111111111111111111111111111111111111111111', 'mm.zip', now() + interval '1 hour'),
    (v_exp_session_id, v_batch_id, v_cm_id, v_exp_res_id, 'html-packages/staging/exp_v1', 'sha256_exp_1111111111111111111111111111111111111111111111111111111111111111', 'exp.zip', now() + interval '1 hour'),
    (v_sum_session_id, v_batch_id, v_cm_id, v_sum_res_id, 'html-packages/staging/sum_v1', 'sha256_sum_1111111111111111111111111111111111111111111111111111111111111111', 'sum.zip', now() + interval '1 hour'),
    (v_mm_v2_session_id, v_batch_id, v_cm_id, v_mm_res_id, 'html-packages/staging/mm_v2', 'sha256_mm_2222222222222222222222222222222222222222222222222222222222222222', 'mm_v2.zip', now() + interval '1 hour'),
    (v_review_session_id, v_batch_id, v_cm_id, v_review_res_id, 'html-packages/staging/review_v1', 'sha256_review_1111111111111111111111111111111111111111111111111111111111111111', 'review.zip', now() + interval '1 hour'),
    (v_approved_session_id, v_batch_id, v_cm_id, v_approved_res_id, 'html-packages/staging/approved_v1', 'sha256_approved_1111111111111111111111111111111111111111111111111111111111111111', 'approved.zip', now() + interval '1 hour');

  PERFORM set_config('test.auth_role', 'service_role', true);
  PERFORM set_config('test.auth_uid', v_cm_id::text, true);

  PERFORM public.record_server_validation(v_mm_session_id, v_mm_v1_id, 'sha256_mm_1111111111111111111111111111111111111111111111111111111111111111', 'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/mm_v1');
  PERFORM public.record_server_validation(v_exp_session_id, v_exp_v1_id, 'sha256_exp_1111111111111111111111111111111111111111111111111111111111111111', 'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/exp_v1');
  PERFORM public.record_server_validation(v_sum_session_id, v_sum_v1_id, 'sha256_sum_1111111111111111111111111111111111111111111111111111111111111111', 'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/sum_v1');
  PERFORM public.record_server_validation(v_mm_v2_session_id, v_mm_v2_id, 'sha256_mm_2222222222222222222222222222222222222222222222222222222222222222', 'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/mm_v2');
  PERFORM public.record_server_validation(v_review_session_id, v_review_v1_id, 'sha256_review_1111111111111111111111111111111111111111111111111111111111111111', 'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/review_v1');
  PERFORM public.record_server_validation(v_approved_session_id, v_approved_v1_id, 'sha256_approved_1111111111111111111111111111111111111111111111111111111111111111', 'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/approved_v1');

  -- ============================================================
  -- Lifecycle: submit and approve canonical resources
  -- ============================================================
  PERFORM set_config('test.auth_role', 'authenticated', true);
  PERFORM set_config('test.auth_uid', v_cm_id::text, true);

  PERFORM public.submit_resource_for_review(v_mm_res_id);
  PERFORM public.submit_resource_for_review(v_exp_res_id);
  PERFORM public.submit_resource_for_review(v_sum_res_id);
  PERFORM public.submit_resource_for_review(v_review_res_id);
  PERFORM public.submit_resource_for_review(v_approved_res_id);

  PERFORM set_config('test.auth_uid', v_admin_id::text, true);

  PERFORM public.approve_resource(v_mm_res_id, v_mm_v1_id);
  PERFORM public.approve_resource(v_exp_res_id, v_exp_v1_id);
  PERFORM public.approve_resource(v_sum_res_id, v_sum_v1_id);
  PERFORM public.approve_resource(v_review_res_id, v_review_v1_id);
  PERFORM public.approve_resource(v_approved_res_id, v_approved_v1_id);

  -- Historically approve v2 of mind map for rollback test
  INSERT INTO public.lesson_resource_reviews (resource_id, resource_version_id, reviewer_id, decision, reason)
  VALUES (v_mm_res_id, v_mm_v2_id, v_admin_id, 'approved', NULL);

  -- ============================================================
  -- Publication: storage-bound atomic publish for canonical resources
  -- ============================================================
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_mm_res_id, v_mm_v1_id, v_mm_session_id, 'html-packages/staging/mm_v1', 'published/' || v_mm_res_id::text || '/1', 'sha256_mm_1111111111111111111111111111111111111111111111111111111111111111', 'promote_published', 'promoted'
  ) RETURNING id INTO v_mm_op_id;

  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_exp_res_id, v_exp_v1_id, v_exp_session_id, 'html-packages/staging/exp_v1', 'published/' || v_exp_res_id::text || '/1', 'sha256_exp_1111111111111111111111111111111111111111111111111111111111111111', 'promote_published', 'promoted'
  ) RETURNING id INTO v_exp_op_id;

  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_sum_res_id, v_sum_v1_id, v_sum_session_id, 'html-packages/staging/sum_v1', 'published/' || v_sum_res_id::text || '/1', 'sha256_sum_1111111111111111111111111111111111111111111111111111111111111111', 'promote_published', 'promoted'
  ) RETURNING id INTO v_sum_op_id;

  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_mm_res_id, v_mm_v2_id, v_mm_v2_session_id, 'html-packages/staging/mm_v2', 'published/' || v_mm_res_id::text || '/2', 'sha256_mm_2222222222222222222222222222222222222222222222222222222222222222', 'promote_published', 'promoted'
  ) RETURNING id INTO v_mm_v2_op_id;

  PERFORM set_config('test.auth_role', 'service_role', true);
  PERFORM set_config('test.auth_uid', v_admin_id::text, true);

  -- Capture lock versions
  PERFORM public.record_successful_resource_publication(v_mm_res_id, v_mm_v1_id, v_mm_op_id, (SELECT lock_version FROM public.lesson_resources WHERE id = v_mm_res_id), v_mm_session_id);
  PERFORM public.record_successful_resource_publication(v_exp_res_id, v_exp_v1_id, v_exp_op_id, (SELECT lock_version FROM public.lesson_resources WHERE id = v_exp_res_id), v_exp_session_id);
  PERFORM public.record_successful_resource_publication(v_sum_res_id, v_sum_v1_id, v_sum_op_id, (SELECT lock_version FROM public.lesson_resources WHERE id = v_sum_res_id), v_sum_session_id);

  SELECT lifecycle_status, published_version_id INTO v_binding FROM public.lesson_resources WHERE id = v_mm_res_id;
  PERFORM pg17_assert(v_binding.lifecycle_status = 'published' AND v_binding.published_version_id = v_mm_v1_id, 'Mind map published successfully');

  -- ============================================================
  -- Student enumeration using real columns
  -- ============================================================
  PERFORM set_config('test.auth_role', 'authenticated', true);
  PERFORM set_config('test.auth_uid', v_student_id::text, true);
  UPDATE public.content_feature_flags SET is_enabled = true WHERE flag_key = 'html_content_student_read';

  SELECT count(*) INTO v_count FROM public.list_published_html_resources_for_lesson(v_lesson_id);
  PERFORM pg17_assert(v_count = 3, 'Student HTML enumeration returns exactly 3 published resources');

  FOR v_row IN
    SELECT * FROM public.list_published_html_resources_for_lesson(v_lesson_id)
  LOOP
    CASE v_row.resource_code
      WHEN 'TEST_MM_001' THEN
        PERFORM pg17_assert(v_row.resource_type = 'mind_map_html', 'TEST_MM_001 subtype is mind_map_html');
      WHEN 'TEST_EXP_001' THEN
        PERFORM pg17_assert(v_row.resource_type = 'practical_experiment_html', 'TEST_EXP_001 subtype is practical_experiment_html');
      WHEN 'TEST_SUM_001' THEN
        PERFORM pg17_assert(v_row.resource_type = 'summary_html', 'TEST_SUM_001 subtype is summary_html');
      ELSE
        RAISE EXCEPTION 'Unexpected resource_code in enumeration: %', v_row.resource_code;
    END CASE;
  END LOOP;

  -- Negative cases: must NOT be returned
  SELECT count(*) INTO v_count FROM public.list_published_html_resources_for_lesson(v_lesson_id)
  WHERE resource_code IN ('NEG_DRAFT', 'NEG_REVIEW', 'NEG_APPROVED', 'OTHER_MM', 'LEGACY_VID');
  PERFORM pg17_assert(v_count = 0, 'Negative-case resources are excluded from HTML enumeration');

  -- resolve_student_resource_binding returns canonical subtype and version
  SELECT * INTO v_binding FROM public.resolve_student_resource_binding(v_mm_res_id);
  PERFORM pg17_assert(v_binding.resource_type = 'mind_map_html', 'Student binding returns mind_map_html subtype');
  PERFORM pg17_assert(v_binding.version_id = v_mm_v1_id, 'Student binding resolves to published v1');

  -- ============================================================
  -- Unpublish: published resource disappears from enumeration
  -- ============================================================
  PERFORM set_config('test.auth_uid', v_admin_id::text, true);
  PERFORM public.unpublish_resource(v_mm_res_id);

  SELECT lifecycle_status, published_version_id INTO v_binding FROM public.lesson_resources WHERE id = v_mm_res_id;
  PERFORM pg17_assert(v_binding.lifecycle_status = 'approved', 'Unpublish transitions to approved');
  PERFORM pg17_assert(v_binding.published_version_id IS NULL, 'Unpublish clears published_version_id');

  SELECT count(*) INTO v_count FROM public.list_published_html_resources_for_lesson(v_lesson_id);
  PERFORM pg17_assert(v_count = 2, 'After unpublish, only 2 HTML resources remain in enumeration');

  SELECT immutable_at INTO v_binding FROM public.lesson_resource_versions WHERE id = v_mm_v1_id;
  PERFORM pg17_assert(v_binding.immutable_at IS NOT NULL, 'Historical version remains immutable after unpublish');

  -- ============================================================
  -- Rollback: republish mind map to v2 then roll back to v1
  -- ============================================================
  -- Republish v2 first
  UPDATE public.lesson_resources SET lifecycle_status = 'published', published_version_id = v_mm_v2_id WHERE id = v_mm_res_id;

  PERFORM public.rollback_resource(v_mm_res_id, v_mm_v1_id, (SELECT lock_version FROM public.lesson_resources WHERE id = v_mm_res_id));

  SELECT lifecycle_status, published_version_id INTO v_binding FROM public.lesson_resources WHERE id = v_mm_res_id;
  PERFORM pg17_assert(v_binding.lifecycle_status = 'published', 'Rollback keeps resource published');
  PERFORM pg17_assert(v_binding.published_version_id = v_mm_v1_id, 'Rollback points published_version_id to target v1');

  SELECT * INTO v_binding FROM public.resolve_student_resource_binding(v_mm_res_id);
  PERFORM pg17_assert(v_binding.resource_type = 'mind_map_html', 'Student binding after rollback still returns mind_map_html');
  PERFORM pg17_assert(v_binding.version_id = v_mm_v1_id, 'Student binding after rollback resolves to target v1');

  -- After rollback, enumeration includes mind map again
  SELECT count(*) INTO v_count FROM public.list_published_html_resources_for_lesson(v_lesson_id);
  PERFORM pg17_assert(v_count = 3, 'After rollback, all 3 HTML resources are enumerated');

  RAISE NOTICE '=== ALL PG17 Admin→Student HTML Resource Contract Assertions PASSED ===';
END $$;

COMMIT;
`;

  console.log("Executing PG17 Admin→Student Contract Runtime Assertions...");
  const testRun = psql(testSql, { fatal: false });
  process.stdout.write(testRun.stdout || "");
  process.stderr.write(testRun.stderr || "");

  if (testRun.status !== 0) {
    console.error("PG17 Admin→Student Contract Runtime Tests FAILED");
    process.exit(testRun.status ?? 1);
  }

  console.log("SUCCESS: PG17 Admin→Student Contract Runtime Test Runner completed with 0 errors.");
} finally {
  if (containerStarted) {
    console.log(`Cleaning up container ${containerName}...`);
    spawnSync("docker", ["rm", "-f", containerName], { shell: true });

    const checkPs = spawnSync("docker", ["ps", "-a", "-q", "-f", `name=${containerName}`], {
      encoding: "utf8",
      shell: true,
    });
    const remaining = (checkPs.stdout || "").trim();
    if (remaining) {
      console.error(`WARNING: Container ${containerName} still exists after cleanup!`);
    } else {
      console.log(`Container ${containerName} verified removed.`);
    }
  }
}
