#!/usr/bin/env node
/**
 * PostgreSQL 17 Local Disposable Runtime Test Runner for
 * CONTENT_HTML_ADMIN_IMPORT_REVIEW_CORRECTION_03
 *
 * Tests atomic lifecycle contracts:
 *   submit_resource_for_review
 *   approve_resource
 *   reject_resource
 *   unpublish_resource
 *   rollback_resource
 */

import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..", "..");
const foundationPath = join(
  root,
  "supabase",
  "migrations",
  "20260806050000_content_html_db_rls_foundation.sql",
);
const lifecyclePath = join(
  root,
  "supabase",
  "migrations",
  "20260807050000_content_html_lifecycle_contracts.sql",
);

function projectRefLinked() {
  return existsSync(join(root, "supabase", ".temp", "project-ref"));
}

if (projectRefLinked()) {
  console.error("REFUSED: supabase/.temp/project-ref present (remote link)");
  process.exit(2);
}

if (!existsSync(foundationPath)) {
  console.error(`Missing migration file: ${foundationPath}`);
  process.exit(1);
}
if (!existsSync(lifecyclePath)) {
  console.error(`Missing migration file: ${lifecyclePath}`);
  process.exit(1);
}

const containerName = `pg17-html-lifecycle-test-${Date.now()}`;
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
    [
      "run",
      "-d",
      "--name",
      containerName,
      "-e",
      "POSTGRES_PASSWORD=postgres",
      "postgres:17-alpine",
    ],
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

DO $$ BEGIN RAISE NOTICE '=== Starting PG17 Lifecycle Contracts Test Execution ==='; END $$;

DO $$
DECLARE
  v_admin_id uuid := gen_random_uuid();
  v_cm_id uuid := gen_random_uuid();
  v_student_id uuid := gen_random_uuid();
  v_other_admin_id uuid := gen_random_uuid();
  v_lesson_id uuid := gen_random_uuid();
  v_other_lesson_id uuid := gen_random_uuid();
  v_res_id uuid := gen_random_uuid();
  v_other_res_id uuid := gen_random_uuid();
  v_ver1_id uuid := gen_random_uuid();
  v_ver2_id uuid := gen_random_uuid();
  v_ver4_id uuid := gen_random_uuid();
  v_other_ver_id uuid := gen_random_uuid();
  v_bad_ver_id uuid := gen_random_uuid();
  v_batch_id uuid := gen_random_uuid();
  v_session_id uuid := gen_random_uuid();
  v_stale_session_id uuid := gen_random_uuid();
  v_bad_session_id uuid := gen_random_uuid();
  v_val_id uuid;
  v_stale_val_id uuid;
  v_prom_op_id uuid;
  v_bad_pub_op_id uuid;
  v_wrong_res_pub_op_id uuid;
  v_wrong_ver_pub_op_id uuid;
  v_hash_mismatch_pub_op_id uuid;
  v_bad_path_pub_op_id uuid;
  v_err_caught boolean;
  v_sqlstate text;
  v_count integer;
  v_binding record;
BEGIN
  -- Create users and roles
  INSERT INTO auth.users (id, email) VALUES
    (v_admin_id, 'admin@test.com'),
    (v_cm_id, 'cm@test.com'),
    (v_student_id, 'student@test.com'),
    (v_other_admin_id, 'otheradmin@test.com');

  INSERT INTO public.user_roles (user_id, role) VALUES
    (v_admin_id, 'admin'),
    (v_cm_id, 'content_manager'),
    (v_student_id, 'student'),
    (v_other_admin_id, 'admin');

  INSERT INTO public.lessons (id, title, slug, sort_order) VALUES
    (v_lesson_id, 'Test Lesson', 'lesson-1', 1),
    (v_other_lesson_id, 'Other Lesson', 'lesson-2', 2);

  -- Resources
  INSERT INTO public.lesson_resources (id, lesson_id, resource_type, title, url, lifecycle_status)
  VALUES (v_res_id, v_lesson_id, 'html', 'Resource 1', 'https://example.com/r1', 'draft');

  INSERT INTO public.lesson_resources (id, lesson_id, resource_type, title, url, lifecycle_status)
  VALUES (v_other_res_id, v_other_lesson_id, 'html', 'Resource 2', 'https://example.com/r2', 'published');

  -- Versions
  INSERT INTO public.lesson_resource_versions (id, resource_id, version_number, content_sha256, manifest)
  VALUES (v_ver1_id, v_res_id, 1, 'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111', '{"entry": "index.html"}'::jsonb);

  INSERT INTO public.lesson_resource_versions (id, resource_id, version_number, content_sha256, manifest)
  VALUES (v_ver2_id, v_res_id, 2, 'sha256_hash_2222222222222222222222222222222222222222222222222222222222222222', '{"entry": "v2.html"}'::jsonb);

  INSERT INTO public.lesson_resource_versions (id, resource_id, version_number, content_sha256, manifest)
  VALUES (v_other_ver_id, v_other_res_id, 1, 'sha256_hash_3333333333333333333333333333333333333333333333333333333333333333', '{"entry": "other.html"}'::jsonb);

  INSERT INTO public.lesson_resource_versions (id, resource_id, version_number, content_sha256, manifest)
  VALUES (v_bad_ver_id, v_res_id, 3, 'sha256_hash_4444444444444444444444444444444444444444444444444444444444444444', '{"entry": "bad.html"}'::jsonb);

  INSERT INTO public.lesson_resource_versions (id, resource_id, version_number, content_sha256, manifest)
  VALUES (v_ver4_id, v_res_id, 4, 'sha256_hash_5555555555555555555555555555555555555555555555555555555555555555', '{"entry": "v4.html"}'::jsonb);

  -- Set current draft version
  UPDATE public.lesson_resources SET current_draft_version_id = v_ver1_id WHERE id = v_res_id;

  -- Batches and sessions
  INSERT INTO public.content_import_batches (id, actor_id, status) VALUES (v_batch_id, v_cm_id, 'created');

  INSERT INTO public.lesson_resource_upload_sessions (
    id, batch_id, actor_id, resource_id, staging_path, expected_package_hash, original_filename, expires_at
  ) VALUES (
    v_session_id, v_batch_id, v_cm_id, v_res_id, 'html-packages/staging/session_valid_01',
    'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111', 'package.zip', now() + interval '1 hour'
  );

  INSERT INTO public.lesson_resource_upload_sessions (
    id, batch_id, actor_id, resource_id, staging_path, expected_package_hash, original_filename, expires_at
  ) VALUES (
    v_stale_session_id, v_batch_id, v_cm_id, v_res_id, 'html-packages/staging/session_stale_01',
    'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111', 'package_old.zip', now() - interval '10 minutes'
  );

  INSERT INTO public.lesson_resource_upload_sessions (
    id, batch_id, actor_id, resource_id, staging_path, expected_package_hash, original_filename, expires_at
  ) VALUES (
    v_bad_session_id, v_batch_id, v_cm_id, v_res_id, 'html-packages/staging/session_bad_hash_01',
    'sha256_hash_0000000000000000000000000000000000000000000000000000000000000000', 'package_bad.zip', now() + interval '1 hour'
  );

  -- record_server_validation requires service_role
  PERFORM set_config('test.auth_role', 'service_role', true);
  PERFORM set_config('test.auth_uid', v_cm_id::text, true);

  -- Stale validation: create on non-expired session with future valid_until, then age it to past
  v_stale_val_id := public.record_server_validation(
    v_session_id, v_ver1_id,
    'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111',
    'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/session_valid_01'
  );
  UPDATE public.content_package_validations SET valid_until = now() - interval '1 hour' WHERE id = v_stale_val_id;

  -- Submit must run as content_manager (authenticated role)
  PERFORM set_config('test.auth_role', 'authenticated', true);
  PERFORM set_config('test.auth_uid', v_cm_id::text, true);

  -- ============================================================
  -- SUBMIT TESTS
  -- ============================================================

  -- 1. Submit without validation -> DENY
  UPDATE public.lesson_resources SET current_draft_version_id = v_bad_ver_id WHERE id = v_res_id;
  v_err_caught := false;
  BEGIN
    PERFORM public.submit_resource_for_review(v_res_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Submit without valid validation DENIED (SQLSTATE 42000)');

  -- Restore valid draft version
  UPDATE public.lesson_resources SET current_draft_version_id = v_ver1_id WHERE id = v_res_id;

  -- 2. Submit with stale validation -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.submit_resource_for_review(v_res_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Submit with stale validation DENIED (SQLSTATE 42000)');

  -- Remove stale validation and create a valid one for remaining tests
  DELETE FROM public.content_package_validations WHERE id = v_stale_val_id;
  PERFORM set_config('test.auth_role', 'service_role', true);
  v_val_id := public.record_server_validation(
    v_session_id, v_ver1_id,
    'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111',
    'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/session_valid_01'
  );
  PERFORM set_config('test.auth_role', 'authenticated', true);

  -- 3. Hash mismatch -> DENY (session expects different hash)
  v_err_caught := false;
  BEGIN
    -- Temporarily point validation at bad session to create hash mismatch scenario
    UPDATE public.content_package_validations
    SET upload_session_id = v_bad_session_id,
        storage_object_path = 'html-packages/staging/session_bad_hash_01',
        package_hash = 'sha256_hash_0000000000000000000000000000000000000000000000000000000000000000'
    WHERE id = v_val_id;
    PERFORM public.submit_resource_for_review(v_res_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Submit with hash mismatch DENIED (SQLSTATE 42000)');

  -- Restore valid validation
  UPDATE public.content_package_validations
  SET upload_session_id = v_session_id,
      storage_object_path = 'html-packages/staging/session_valid_01',
      package_hash = 'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111'
  WHERE id = v_val_id;

  -- 4. Blocking findings -> DENY
  UPDATE public.content_package_validations
  SET findings = '[{"severity": "blocking", "code": "unsafe-js"}]'::jsonb
  WHERE id = v_val_id;
  v_err_caught := false;
  BEGIN
    PERFORM public.submit_resource_for_review(v_res_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Submit with blocking findings DENIED (SQLSTATE 42000)');

  -- Restore clean findings
  UPDATE public.content_package_validations SET findings = '[]'::jsonb WHERE id = v_val_id;

  -- 5. Valid draft submit by content_manager -> PASS
  PERFORM public.submit_resource_for_review(v_res_id);
  SELECT lifecycle_status INTO v_binding FROM public.lesson_resources WHERE id = v_res_id;
  PERFORM pg17_assert(v_binding.lifecycle_status = 'in_review', 'Valid draft submit transitions to in_review');
  SELECT count(*) INTO v_count FROM public.lesson_resource_events WHERE resource_id = v_res_id AND event_type = 'submit';
  PERFORM pg17_assert(v_count = 1, 'Submit emits exactly one audit event');

  -- 6. Submit from non-draft -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.submit_resource_for_review(v_res_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Submit from non-draft DENIED (SQLSTATE 42000)');

  -- ============================================================
  -- APPROVE TESTS
  -- ============================================================

  -- 7. Approve by content_manager -> DENY
  PERFORM set_config('test.auth_uid', v_cm_id::text, true);
  v_err_caught := false;
  BEGIN
    PERFORM public.approve_resource(v_res_id, v_ver1_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Approve by content_manager DENIED (SQLSTATE 42501)');

  -- 8. Approve wrong version -> DENY
  PERFORM set_config('test.auth_uid', v_admin_id::text, true);
  v_err_caught := false;
  BEGIN
    PERFORM public.approve_resource(v_res_id, v_ver2_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Approve wrong version DENIED (SQLSTATE 42000)');

  -- 9. Approve wrong state -> DENY (use other resource in published)
  v_err_caught := false;
  BEGIN
    PERFORM public.approve_resource(v_other_res_id, v_other_ver_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Approve non-in_review resource DENIED (SQLSTATE 42000)');

  -- 10. Valid admin approve -> PASS
  PERFORM public.approve_resource(v_res_id, v_ver1_id);
  SELECT lifecycle_status, approved_version_id INTO v_binding FROM public.lesson_resources WHERE id = v_res_id;
  PERFORM pg17_assert(v_binding.lifecycle_status = 'approved', 'Valid admin approve transitions to approved');
  PERFORM pg17_assert(v_binding.approved_version_id = v_ver1_id, 'Approve sets approved_version_id');
  SELECT immutable_at INTO v_binding FROM public.lesson_resource_versions WHERE id = v_ver1_id;
  PERFORM pg17_assert(v_binding.immutable_at IS NOT NULL, 'Approve marks version immutable');
  SELECT count(*) INTO v_count FROM public.lesson_resource_reviews WHERE resource_id = v_res_id AND decision = 'approved';
  PERFORM pg17_assert(v_count = 1, 'Approve appends review record');

  -- ============================================================
  -- REJECT TESTS (use ver2 on a fresh resource)
  -- ============================================================

  UPDATE public.lesson_resources SET lifecycle_status = 'draft', current_draft_version_id = v_ver2_id, approved_version_id = NULL, lock_version = 1 WHERE id = v_res_id;

  -- Create a separate upload session for ver2 (sessions are immutable)
  INSERT INTO public.lesson_resource_upload_sessions (
    id, batch_id, actor_id, resource_id, staging_path, expected_package_hash, original_filename, expires_at
  ) VALUES (
    gen_random_uuid(), v_batch_id, v_cm_id, v_res_id, 'html-packages/staging/session_ver2_01',
    'sha256_hash_2222222222222222222222222222222222222222222222222222222222222222', 'package_v2.zip', now() + interval '1 hour'
  );

  -- Create validation for ver2 (requires service_role)
  PERFORM set_config('test.auth_role', 'service_role', true);
  PERFORM public.record_server_validation(
    (SELECT id FROM public.lesson_resource_upload_sessions WHERE staging_path = 'html-packages/staging/session_ver2_01'),
    v_ver2_id,
    'sha256_hash_2222222222222222222222222222222222222222222222222222222222222222',
    'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/session_ver2_01'
  );
  PERFORM set_config('test.auth_role', 'authenticated', true);

  PERFORM public.submit_resource_for_review(v_res_id);

  -- 11. Reject empty reason -> DENY
  PERFORM set_config('test.auth_uid', v_admin_id::text, true);
  v_err_caught := false;
  BEGIN
    PERFORM public.reject_resource(v_res_id, v_ver2_id, '   ');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '22000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Reject with empty reason DENIED (SQLSTATE 22000)');

  -- 12. Reject by content_manager -> DENY
  PERFORM set_config('test.auth_uid', v_cm_id::text, true);
  v_err_caught := false;
  BEGIN
    PERFORM public.reject_resource(v_res_id, v_ver2_id, 'quality issue');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Reject by content_manager DENIED (SQLSTATE 42501)');

  -- 13. Valid admin reject -> PASS
  PERFORM set_config('test.auth_uid', v_admin_id::text, true);
  PERFORM public.reject_resource(v_res_id, v_ver2_id, 'quality issue');
  SELECT lifecycle_status INTO v_binding FROM public.lesson_resources WHERE id = v_res_id;
  PERFORM pg17_assert(v_binding.lifecycle_status = 'rejected', 'Valid admin reject transitions to rejected');
  SELECT immutable_at INTO v_binding FROM public.lesson_resource_versions WHERE id = v_ver2_id;
  PERFORM pg17_assert(v_binding.immutable_at IS NULL, 'Reject does not mark version immutable');
  SELECT count(*) INTO v_count FROM public.lesson_resource_reviews WHERE resource_id = v_res_id AND decision = 'rejected' AND reason = 'quality issue';
  PERFORM pg17_assert(v_count = 1, 'Reject appends review record with reason');

  -- ============================================================
  -- PUBLISH / UNPUBLISH / ROLLBACK TESTS
  -- ============================================================

  -- Reset resource to approved with ver1
  UPDATE public.lesson_resources SET lifecycle_status = 'approved', current_draft_version_id = v_ver1_id, approved_version_id = v_ver1_id, published_version_id = NULL, lock_version = 1 WHERE id = v_res_id;
  UPDATE public.lesson_resource_versions SET immutable_at = now(), immutable_reason = 'approved' WHERE id = v_ver1_id;
  UPDATE public.lesson_resource_versions SET immutable_at = now(), immutable_reason = 'approved' WHERE id = v_ver4_id;

  -- Historically approve ver4 (for no-storage-operation rollback test)
  INSERT INTO public.lesson_resource_reviews (resource_id, resource_version_id, reviewer_id, decision, reason)
  VALUES (v_res_id, v_ver4_id, v_admin_id, 'approved', NULL);

  -- Trusted promotion record for ver1 (status promoted, as the pipeline sets before publication RPC)
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_res_id, v_ver1_id, v_session_id,
    'html-packages/staging/session_valid_01',
    'published/' || v_res_id::text || '/1',
    'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111',
    'promote_published', 'promoted'
  ) RETURNING id INTO v_prom_op_id;

  -- Prepare additional operations for publication denial tests
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_other_res_id, v_other_ver_id, NULL,
    'html-packages/staging/other',
    'published/' || v_other_res_id::text || '/1',
    'sha256_hash_3333333333333333333333333333333333333333333333333333333333333333',
    'promote_published', 'promoted'
  ) RETURNING id INTO v_wrong_res_pub_op_id;

  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_res_id, v_bad_ver_id, NULL,
    'html-packages/staging/bad',
    'published/' || v_res_id::text || '/3',
    'sha256_hash_4444444444444444444444444444444444444444444444444444444444444444',
    'promote_published', 'promoted'
  ) RETURNING id INTO v_wrong_ver_pub_op_id;

  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_res_id, v_ver1_id, v_session_id,
    'html-packages/staging/session_valid_01',
    'published/' || v_res_id::text || '/1',
    'sha256_hash_0000000000000000000000000000000000000000000000000000000000000000',
    'promote_published', 'promoted'
  ) RETURNING id INTO v_hash_mismatch_pub_op_id;

  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_res_id, v_ver1_id, v_session_id,
    'html-packages/staging/session_valid_01',
    'published/evil/path',
    'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111',
    'promote_published', 'promoted'
  ) RETURNING id INTO v_bad_path_pub_op_id;

  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_res_id, v_ver1_id, v_session_id,
    'html-packages/staging/session_valid_01',
    'published/' || v_res_id::text || '/1',
    'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111',
    'promote_published', 'pending'
  ) RETURNING id INTO v_bad_pub_op_id;

  -- Publication must run as service_role
  PERFORM set_config('test.auth_role', 'service_role', true);
  PERFORM set_config('test.auth_uid', v_admin_id::text, true);

  -- 14. Publication by admin role (not service_role) -> DENY
  PERFORM set_config('test.auth_role', 'authenticated', true);
  PERFORM set_config('test.auth_uid', v_admin_id::text, true);
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_res_id, v_ver1_id, v_prom_op_id, 1, v_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication by non-service_role DENIED (SQLSTATE 42501)');

  PERFORM set_config('test.auth_role', 'service_role', true);

  -- 14b. Publication with explicit NULL lock version -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_res_id, v_ver1_id, v_prom_op_id, NULL, v_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '22000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication with explicit NULL lock version DENIED (SQLSTATE 22000)');

  -- 14c. Publication without CAS argument -> DENY (function signature mismatch)
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_res_id, v_ver1_id, v_prom_op_id, v_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42883' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication without CAS argument DENIED (SQLSTATE 42883)');

  -- 15. Publication with stale lock -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_res_id, v_ver1_id, v_prom_op_id, 99, v_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '40001' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication with stale lock DENIED (SQLSTATE 40001)');

  -- 16. Publication with wrong-resource operation -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_res_id, v_ver1_id, v_wrong_res_pub_op_id, 1, v_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication with wrong-resource operation DENIED (SQLSTATE 42000)');

  -- 17. Publication with wrong-version operation -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_res_id, v_ver1_id, v_wrong_ver_pub_op_id, 1, NULL);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication with wrong-version operation DENIED (SQLSTATE 42000)');

  -- 18. Publication with wrong expected hash -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_res_id, v_ver1_id, v_hash_mismatch_pub_op_id, 1, v_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication with wrong expected_hash DENIED (SQLSTATE 42000)');

  -- 19. Publication with invalid target path -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_res_id, v_ver1_id, v_bad_path_pub_op_id, 1, v_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication with invalid target_path DENIED (SQLSTATE 42000)');

  -- 20. Publication with operation not in promoted status -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_res_id, v_ver1_id, v_bad_pub_op_id, 1, v_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication with non-promoted operation DENIED (SQLSTATE 42000)');

  -- 21. Valid atomic publication -> PASS
  PERFORM public.record_successful_resource_publication(v_res_id, v_ver1_id, v_prom_op_id, 1, v_session_id);
  SELECT lifecycle_status, published_version_id, lock_version INTO v_binding FROM public.lesson_resources WHERE id = v_res_id;
  PERFORM pg17_assert(v_binding.lifecycle_status = 'published', 'Valid publication transitions resource to published');
  PERFORM pg17_assert(v_binding.published_version_id = v_ver1_id, 'Valid publication sets published_version_id');
  PERFORM pg17_assert(v_binding.lock_version = 2, 'Valid publication increments lock_version');
  SELECT count(*) INTO v_count FROM public.lesson_resource_events WHERE resource_id = v_res_id AND event_type = 'publish';
  PERFORM pg17_assert(v_count = 1, 'Publication emits exactly one audit event');

  -- The promoted storage operation remains valid proof for rollback tests.

  -- Switch back to admin caller for unpublish/rollback
  PERFORM set_config('test.auth_role', 'authenticated', true);
  PERFORM set_config('test.auth_uid', v_admin_id::text, true);

  -- 22. Unpublish non-published -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.unpublish_resource(v_other_res_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Unpublish non-published resource DENIED (SQLSTATE 42000)');

  -- 23. Unpublish published -> PASS
  PERFORM public.unpublish_resource(v_res_id);
  SELECT lifecycle_status, published_version_id INTO v_binding FROM public.lesson_resources WHERE id = v_res_id;
  PERFORM pg17_assert(v_binding.lifecycle_status = 'approved', 'Unpublish transitions to approved');
  PERFORM pg17_assert(v_binding.published_version_id IS NULL, 'Unpublish clears published_version_id');
  SELECT count(*) INTO v_count FROM public.lesson_resource_events WHERE resource_id = v_res_id AND event_type = 'unpublish';
  PERFORM pg17_assert(v_count = 1, 'Unpublish emits audit event');

  -- Verify historical version remains immutable
  SELECT immutable_at INTO v_binding FROM public.lesson_resource_versions WHERE id = v_ver1_id;
  PERFORM pg17_assert(v_binding.immutable_at IS NOT NULL, 'Historical version remains immutable after unpublish');

  -- Re-publish resource for rollback tests (manually set published; rollback has its own proof)
  UPDATE public.lesson_resources SET lifecycle_status = 'published', published_version_id = v_ver1_id, lock_version = 1 WHERE id = v_res_id;

  -- 24. Rollback wrong-resource target -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.rollback_resource(v_res_id, v_other_ver_id, 1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Rollback to wrong-resource target DENIED (SQLSTATE 42000)');

  -- 25. Rollback to unapproved target -> DENY (ver3 has no approved review)
  v_err_caught := false;
  BEGIN
    PERFORM public.rollback_resource(v_res_id, v_bad_ver_id, 1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Rollback to unapproved target DENIED (SQLSTATE 42000)');

  -- 26. Rollback to target with no storage operation -> DENY (ver4 is approved but never promoted)
  v_err_caught := false;
  BEGIN
    PERFORM public.rollback_resource(v_res_id, v_ver4_id, 1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Rollback to target without storage operation DENIED (SQLSTATE 42000)');

  -- 27. Rollback with wrong storage operation version -> DENY
  -- Mark the valid v_ver1 operation as failed (storage_operations are append-only)
  -- and create one for v_bad_ver_id only; rollback to v_ver1 must find no
  -- promoted/cleaned proof and deny.
  UPDATE public.storage_operations SET status = 'failed' WHERE id = v_prom_op_id;
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_res_id, v_bad_ver_id, NULL,
    'html-packages/staging/bad',
    'published/' || v_res_id::text || '/3',
    'sha256_hash_4444444444444444444444444444444444444444444444444444444444444444',
    'promote_published', 'promoted'
  );

  v_err_caught := false;
  BEGIN
    PERFORM public.rollback_resource(v_res_id, v_ver1_id, 1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Rollback with only wrong-version operation DENIED (SQLSTATE 42000)');

  -- 28. Rollback with expected_hash mismatch -> DENY
  -- Mark the wrong-version operation as failed and create a v_ver1 operation with mismatched hash.
  UPDATE public.storage_operations SET status = 'failed' WHERE resource_id = v_res_id AND resource_version_id = v_bad_ver_id;
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_res_id, v_ver1_id, v_session_id,
    'html-packages/staging/session_valid_01',
    'published/' || v_res_id::text || '/1',
    'sha256_hash_0000000000000000000000000000000000000000000000000000000000000000',
    'promote_published', 'promoted'
  );

  v_err_caught := false;
  BEGIN
    PERFORM public.rollback_resource(v_res_id, v_ver1_id, 1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Rollback with expected_hash mismatch DENIED (SQLSTATE 42000)');

  -- 29. Rollback with invalid target path -> DENY
  -- Mark the hash-mismatch operation as failed and create a v_ver1 operation with an invalid path.
  UPDATE public.storage_operations SET status = 'failed' WHERE resource_id = v_res_id AND resource_version_id = v_ver1_id AND target_path = 'published/' || v_res_id::text || '/1' AND expected_hash = 'sha256_hash_0000000000000000000000000000000000000000000000000000000000000000';
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_res_id, v_ver1_id, v_session_id,
    'html-packages/staging/session_valid_01',
    'published/evil/path',
    'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111',
    'promote_published', 'promoted'
  );

  v_err_caught := false;
  BEGIN
    PERFORM public.rollback_resource(v_res_id, v_ver1_id, 1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Rollback with invalid target_path DENIED (SQLSTATE 42000)');

  -- Restore valid v_ver1 operation for the remaining tests.
  -- Mark the bad-path operation as failed and insert a new valid cleaned operation.
  UPDATE public.storage_operations SET status = 'failed' WHERE resource_id = v_res_id AND resource_version_id = v_ver1_id AND target_path = 'published/evil/path';
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_res_id, v_ver1_id, v_session_id,
    'html-packages/staging/session_valid_01',
    'published/' || v_res_id::text || '/1',
    'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111',
    'promote_published', 'cleaned'
  ) RETURNING id INTO v_prom_op_id;

  -- 30. Rollback with stale lock -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.rollback_resource(v_res_id, v_ver1_id, 99);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '40001' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Rollback with stale lock DENIED (SQLSTATE 40001)');

  -- 30b. Rollback with explicit NULL lock version -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.rollback_resource(v_res_id, v_ver1_id, NULL);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '22000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Rollback with explicit NULL lock version DENIED (SQLSTATE 22000)');

  -- 30c. Rollback without CAS argument -> DENY (function signature mismatch)
  v_err_caught := false;
  BEGIN
    PERFORM public.rollback_resource(v_res_id, v_ver1_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42883' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Rollback without CAS argument DENIED (SQLSTATE 42883)');

  -- 31. Rollback valid historical published target -> PASS
  PERFORM public.rollback_resource(v_res_id, v_ver1_id, 1);
  SELECT lifecycle_status, published_version_id, lock_version INTO v_binding FROM public.lesson_resources WHERE id = v_res_id;
  PERFORM pg17_assert(v_binding.lifecycle_status = 'published', 'Rollback keeps resource published');
  PERFORM pg17_assert(v_binding.published_version_id = v_ver1_id, 'Rollback sets published_version_id to target');
  PERFORM pg17_assert(v_binding.lock_version = 2, 'Rollback increments lock_version exactly once');
  SELECT count(*) INTO v_count FROM public.lesson_resource_events WHERE resource_id = v_res_id AND event_type = 'rollback';
  PERFORM pg17_assert(v_count = 1, 'Rollback emits audit event');

  -- 32. Student binding resolves to rolled-back target version
  PERFORM set_config('test.auth_role', 'authenticated', true);
  PERFORM set_config('test.auth_uid', v_student_id::text, true);
  UPDATE public.content_feature_flags SET is_enabled = true WHERE flag_key = 'html_content_student_read';
  SELECT * INTO v_binding FROM public.resolve_student_resource_binding(v_res_id);
  PERFORM pg17_assert(v_binding.version_id = v_ver1_id, 'Student binding resolves to rolled-back target version');
  PERFORM pg17_assert(v_binding.published_version_number = 1, 'Student binding uses target version number');

  RAISE NOTICE '=== ALL PG17 Lifecycle Contracts Assertions PASSED ===';
END $$;

COMMIT;
`;

  console.log("Executing PG17 Lifecycle Contracts Runtime Assertions...");
  const testRun = psql(testSql, { fatal: false });
  process.stdout.write(testRun.stdout || "");
  process.stderr.write(testRun.stderr || "");

  if (testRun.status !== 0) {
    console.error("PG17 Lifecycle Contracts Runtime Tests FAILED");
    process.exit(testRun.status ?? 1);
  }

  console.log("SUCCESS: PG17 Lifecycle Contracts Runtime Test Runner completed with 0 errors.");
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
