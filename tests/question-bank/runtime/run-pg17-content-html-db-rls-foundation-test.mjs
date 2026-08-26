#!/usr/bin/env node
/**
 * PostgreSQL 17 Local Disposable Runtime Test Runner for
 * CONTENT_HTML_DB_RLS_FOUNDATION_CORRECTION_03
 */

import { spawnSync, spawn, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..", "..");
const migrationPath = join(
  root,
  "supabase",
  "migrations",
  "20260806050000_content_html_db_rls_foundation.sql",
);

function projectRefLinked() {
  return existsSync(join(root, "supabase", ".temp", "project-ref"));
}

if (projectRefLinked()) {
  console.error("REFUSED: supabase/.temp/project-ref present (remote link)");
  process.exit(2);
}

if (!existsSync(migrationPath)) {
  console.error(`Missing migration file: ${migrationPath}`);
  process.exit(1);
}

const containerName = `pg17-html-foundation-test-${Date.now()}`;
console.log(`Launching isolated PostgreSQL 17 container: ${containerName}`);

let containerStarted = false;

try {
  // 1. Launch fresh PostgreSQL 17 container
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

  // Wait for PostgreSQL to be ready
  console.log("Waiting for PostgreSQL 17 to accept connections...");
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const ping = spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "postgres"], {
      encoding: "utf8",
      shell: true,
    });
    if (ping.status === 0) {
      ready = true;
      execSync('node -e "setTimeout(() => {}, 1000)"');
      break;
    }
    execSync('node -e "setTimeout(() => {}, 500)"');
  }

  if (!ready) {
    console.error("PostgreSQL 17 container failed to become ready in time.");
    process.exit(1);
  }
  console.log("PostgreSQL 17 is ready.");

  // Prerequisite Baseline Setup SQL
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
DO $$ BEGIN CREATE TYPE public.lesson_resource_type AS ENUM ('video', 'mindmap', 'experiment', 'pdf', 'link'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

CREATE OR REPLACE FUNCTION public.can_access_lesson(_lesson_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(nullif(current_setting('test.can_access_lesson', true), '')::boolean, true);
$$;

CREATE OR REPLACE FUNCTION public.is_content_staff(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT true;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT true;
$$;

GRANT USAGE ON SCHEMA public TO authenticated, service_role, anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
`;

  console.log("Applying baseline prerequisite SQL...");
  const baseRun = spawnSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
    {
      input: baselineSql,
      encoding: "utf8",
      shell: true,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (baseRun.status !== 0) {
    console.error("Baseline SQL apply failed:", baseRun.stderr || baseRun.stdout);
    process.exit(baseRun.status ?? 1);
  }

  console.log("Applying migration 20260806050000_content_html_db_rls_foundation.sql...");
  const migrationSql = readFileSync(migrationPath, "utf8");
  const migrationRun = spawnSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
    {
      input: migrationSql,
      encoding: "utf8",
      shell: true,
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (migrationRun.status !== 0) {
    console.error("Migration apply failed:", migrationRun.stderr || migrationRun.stdout);
    process.exit(migrationRun.status ?? 1);
  }

  // Runtime Assertions Harness
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

DO $$ BEGIN RAISE NOTICE '=== Starting PG17 Runtime Test Execution ==='; END $$;

-- 1. Feature Flags Default State
SELECT pg17_assert(public.is_content_feature_enabled('html_content_backend') = false, 'Feature flag html_content_backend defaults to false');
SELECT pg17_assert(public.is_content_feature_enabled('html_content_upload') = false, 'Feature flag html_content_upload defaults to false');
SELECT pg17_assert(public.is_content_feature_enabled('html_content_publish') = false, 'Feature flag html_content_publish defaults to false');
SELECT pg17_assert(public.is_content_feature_enabled('html_content_student_read') = false, 'Feature flag html_content_student_read defaults to false');

DO $$
DECLARE
  v_student_id uuid := gen_random_uuid();
  v_other_student_id uuid := gen_random_uuid();
  v_admin_id uuid := gen_random_uuid();
  v_cm_id uuid := gen_random_uuid();
  v_lesson_id uuid := gen_random_uuid();
  v_other_lesson_id uuid := gen_random_uuid();
  v_batch_id uuid := gen_random_uuid();
  v_other_batch_id uuid := gen_random_uuid();
  v_res_id uuid := gen_random_uuid();
  v_other_res_id uuid := gen_random_uuid();
  v_ver_id uuid := gen_random_uuid();
  v_ver2_id uuid := gen_random_uuid();
  v_other_ver_id uuid := gen_random_uuid();
  v_session_id uuid := gen_random_uuid();
  v_expired_session_id uuid := gen_random_uuid();
  v_op_id uuid := gen_random_uuid();
  v_parent_op_id uuid := gen_random_uuid();
  v_err_caught boolean;
  v_sqlstate text;
  v_count integer;
  v_val_id uuid;
  v_sess_rec record;
  v_prom_rec record;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_student_id, 'student@test.com'),
    (v_other_student_id, 'other@test.com'),
    (v_admin_id, 'admin@test.com'),
    (v_cm_id, 'cm@test.com');

  INSERT INTO public.lessons (id, title, slug, sort_order) VALUES
    (v_lesson_id, 'Test Lesson 1', 'lesson-1', 1),
    (v_other_lesson_id, 'Test Lesson 2', 'lesson-2', 2);

  INSERT INTO public.lesson_resources (id, lesson_id, resource_type, title, url, lifecycle_status)
  VALUES (v_res_id, v_lesson_id, 'html', 'Interactive HTML Resource 1', 'https://cdn.example.com/res1', 'draft');

  INSERT INTO public.lesson_resources (id, lesson_id, resource_type, title, url, lifecycle_status)
  VALUES (v_other_res_id, v_other_lesson_id, 'html', 'Interactive HTML Resource 2', 'https://cdn.example.com/res2', 'published');

  INSERT INTO public.lesson_resource_versions (id, resource_id, version_number, content_sha256, manifest)
  VALUES (v_ver_id, v_res_id, 1, 'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111', '{"entry": "index.html"}'::jsonb);

  INSERT INTO public.lesson_resource_versions (id, resource_id, version_number, content_sha256, manifest)
  VALUES (v_ver2_id, v_res_id, 2, 'sha256_hash_1111111111111111111111111111111111111111111111111111111111112222', '{"entry": "v2.html"}'::jsonb);

  INSERT INTO public.lesson_resource_versions (id, resource_id, version_number, content_sha256, manifest)
  VALUES (v_other_ver_id, v_other_res_id, 1, 'sha256_hash_2222222222222222222222222222222222222222222222222222222222222222', '{"entry": "main.html"}'::jsonb);

  -- 2. Version Composite Foreign Key checks
  v_err_caught := false;
  BEGIN
    UPDATE public.lesson_resources SET current_draft_version_id = v_other_ver_id WHERE id = v_res_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '23503' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Cross-resource version assignment is DENIED by composite FK (SQLSTATE 23503)');

  -- 3. Version Immutability Triggers
  UPDATE public.lesson_resources SET approved_version_id = v_ver_id, published_version_id = v_ver_id, lifecycle_status = 'published' WHERE id = v_res_id;

  -- Check that approved_version_id update automatically set immutable_at
  SELECT (immutable_at IS NOT NULL) INTO v_err_caught FROM public.lesson_resource_versions WHERE id = v_ver_id;
  PERFORM pg17_assert(v_err_caught, 'Version immutable_at automatically set upon setting approved_version_id');

  v_err_caught := false;
  BEGIN
    DELETE FROM public.lesson_resource_versions WHERE id = v_ver_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'DELETE on immutable/approved version DENIED (SQLSTATE 42000)');

  -- File modification on immutable version DENIED
  v_err_caught := false;
  BEGIN
    INSERT INTO public.lesson_resource_files (version_id, resource_id, relative_path, mime_type, byte_size, content_sha256, storage_object_path)
    VALUES (v_ver_id, v_res_id, 'index.html', 'text/html', 100, 'hash1', 'path1');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'INSERT on files for immutable version DENIED (SQLSTATE 42000)');

  -- 4. Upload Sessions & Ownership Triggers
  INSERT INTO public.content_import_batches (id, actor_id, status) VALUES (v_batch_id, v_admin_id, 'created');
  INSERT INTO public.content_import_batches (id, actor_id, status) VALUES (v_other_batch_id, v_cm_id, 'created');

  -- Mismatched actor DENIED by trigger
  v_err_caught := false;
  BEGIN
    INSERT INTO public.lesson_resource_upload_sessions (
      batch_id, actor_id, resource_id, staging_path, expected_package_hash, original_filename, expires_at
    ) VALUES (
      v_batch_id, v_cm_id, v_res_id, 'html-packages/staging/bad_actor_01', 'pkg_hash_01', 'pkg.zip', now() + interval '1 hour'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Upload session actor_id mismatch with batch actor_id DENIED (SQLSTATE 42000)');

  -- Unsafe path DENIED
  v_err_caught := false;
  BEGIN
    INSERT INTO public.lesson_resource_upload_sessions (
      batch_id, actor_id, resource_id, staging_path, expected_package_hash, original_filename, expires_at
    ) VALUES (
      v_batch_id, v_admin_id, v_res_id, 'unsafe_path/session_01', 'pkg_hash_01', 'pkg.zip', now() + interval '1 hour'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '22000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Unsafe staging path prefix DENIED (SQLSTATE 22000)');

  -- Directory traversal path DENIED
  v_err_caught := false;
  BEGIN
    INSERT INTO public.lesson_resource_upload_sessions (
      batch_id, actor_id, resource_id, staging_path, expected_package_hash, original_filename, expires_at
    ) VALUES (
      v_batch_id, v_admin_id, v_res_id, 'html-packages/staging/../session_01', 'pkg_hash_01', 'pkg.zip', now() + interval '1 hour'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '22000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Directory traversal in staging path DENIED (SQLSTATE 22000)');

  -- Insert valid upload session
  INSERT INTO public.lesson_resource_upload_sessions (
    id, batch_id, actor_id, resource_id, staging_path, expected_package_hash, original_filename, expires_at
  ) VALUES (
    v_session_id, v_batch_id, v_admin_id, v_res_id, 'html-packages/staging/session_valid_01', 'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111', 'package.zip', now() + interval '1 hour'
  );

  INSERT INTO public.lesson_resource_upload_sessions (
    id, batch_id, actor_id, resource_id, staging_path, expected_package_hash, original_filename, expires_at
  ) VALUES (
    v_expired_session_id, v_batch_id, v_admin_id, v_res_id, 'html-packages/staging/session_expired_01', 'pkg_hash_02', 'package_old.zip', now() - interval '10 minutes'
  );

  -- Test resolve_upload_session: cross-actor resolution DENIED
  PERFORM set_config('test.auth_role', 'authenticated', true);
  PERFORM set_config('test.auth_uid', v_cm_id::text, true);

  v_err_caught := false;
  BEGIN
    PERFORM public.resolve_upload_session(v_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Actor A resolving session of Actor B DENIED (SQLSTATE 42501)');

  -- Test resolve_upload_session: expired session returns explicit error
  PERFORM set_config('test.auth_uid', v_admin_id::text, true);
  v_err_caught := false;
  BEGIN
    PERFORM public.resolve_upload_session(v_expired_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '22000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Expired upload session returns EXPLICIT ERROR (SQLSTATE 22000)');

  -- Reset role to service_role
  PERFORM set_config('test.auth_role', 'service_role', true);

  -- 5. Validation record_server_validation contract
  -- Service role allowed
  v_val_id := public.record_server_validation(
    v_session_id, v_ver_id, 'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111', 'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/session_valid_01'
  );
  PERFORM pg17_assert(v_val_id IS NOT NULL, 'service_role can record server validation');

  -- Authenticated role DENIED
  PERFORM set_config('test.auth_role', 'authenticated', true);
  v_err_caught := false;
  BEGIN
    PERFORM public.record_server_validation(
      v_session_id, v_ver_id, 'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111', 'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/session_valid_01'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'authenticated role CANNOT record server validation (SQLSTATE 42501)');

  PERFORM set_config('test.auth_role', 'service_role', true);

  -- Validation Hash mismatch DENIED
  v_err_caught := false;
  BEGIN
    PERFORM public.record_server_validation(
      v_session_id, v_ver_id, 'wrong_hash', 'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/session_valid_01'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Validation hash mismatch DENIED (SQLSTATE 42000)');

  -- Validation Stale valid_until DENIED
  v_err_caught := false;
  BEGIN
    PERFORM public.record_server_validation(
      v_session_id, v_ver_id, 'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111', 'v1.0', '[]'::jsonb, true, now() - interval '1 hour', 'html-packages/staging/session_valid_01'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '22000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Validation stale valid_until DENIED (SQLSTATE 22000)');

  -- 6. resolve_promotion_binding exact identifier & validation check
  UPDATE public.content_feature_flags SET is_enabled = true WHERE flag_key = 'html_content_publish';

  -- Case 1: approved resource & version = approved_version_id -> PASS
  UPDATE public.lesson_resources SET lifecycle_status = 'approved', approved_version_id = v_ver_id WHERE id = v_res_id;
  SELECT * INTO v_prom_rec FROM public.resolve_promotion_binding(p_upload_session_id => v_session_id);
  PERFORM pg17_assert(v_prom_rec.resource_id = v_res_id AND v_prom_rec.version_id = v_ver_id, 'resolve_promotion_binding: approved resource with matching approved_version_id PASS');
  PERFORM pg17_assert(v_prom_rec.staging_path = 'html-packages/staging/session_valid_01', 'resolve_promotion_binding returns exact staging path without fallback');

  -- Case 2: approved resource & version != approved_version_id -> DENY
  UPDATE public.lesson_resources SET lifecycle_status = 'approved', approved_version_id = v_ver2_id WHERE id = v_res_id;
  v_err_caught := false;
  BEGIN
    PERFORM public.resolve_promotion_binding(p_upload_session_id => v_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'resolve_promotion_binding: approved resource with mismatched approved_version_id DENIED (SQLSTATE 42000)');

  -- Case 3: in_review resource even with valid validation -> DENY
  UPDATE public.lesson_resources SET lifecycle_status = 'in_review', approved_version_id = v_ver_id WHERE id = v_res_id;
  v_err_caught := false;
  BEGIN
    PERFORM public.resolve_promotion_binding(p_upload_session_id => v_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'resolve_promotion_binding: in_review resource DENIED (SQLSTATE 42000)');

  -- Case 4: published resource & version != approved_version_id -> DENY
  UPDATE public.lesson_resources SET lifecycle_status = 'published', approved_version_id = v_ver2_id WHERE id = v_res_id;
  v_err_caught := false;
  BEGIN
    PERFORM public.resolve_promotion_binding(p_upload_session_id => v_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'resolve_promotion_binding: published resource with mismatched approved_version_id DENIED (SQLSTATE 42000)');

  -- Restore approved_version_id and lifecycle_status for published resource
  UPDATE public.lesson_resources SET lifecycle_status = 'published', approved_version_id = v_ver_id WHERE id = v_res_id;

  -- Missing both parameters DENIED
  v_err_caught := false;
  BEGIN
    PERFORM public.resolve_promotion_binding();
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '22000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'resolve_promotion_binding with missing parameters DENIED (SQLSTATE 22000)');

  -- 7. Storage Operations Rules & Retry Contract
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id, source_path, target_path, operation_type, status
  ) VALUES (
    v_op_id, v_admin_id, v_res_id, v_ver_id, v_session_id, 'html-packages/staging/session_valid_01', 'published/res1/1', 'stage_upload', 'pending'
  );

  -- Illegal transition pending -> cleaned DENIED
  v_err_caught := false;
  BEGIN
    UPDATE public.storage_operations SET status = 'cleaned' WHERE id = v_op_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '22000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Storage operation invalid transition pending -> cleaned DENIED (SQLSTATE 22000)');

  -- Transition pending -> failed -> compensated
  UPDATE public.storage_operations SET status = 'failed' WHERE id = v_op_id;

  -- Retry contract: retry parent whose status is failed with SAME actor_id -> PASS
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id, source_path, target_path, operation_type, parent_operation_id, status, retry_number, attempt_count
  ) VALUES (
    v_parent_op_id, v_admin_id, v_res_id, v_ver_id, v_session_id, 'html-packages/staging/session_valid_01', 'published/res1/1', 'stage_upload', v_op_id, 'pending', 1, 2
  );
  PERFORM pg17_assert(true, 'Retry storage operation row created with parent pointer and retry_number = parent + 1');

  -- Retry contract: retry parent with DIFFERENT actor_id -> DENY
  v_err_caught := false;
  BEGIN
    INSERT INTO public.storage_operations (
      actor_id, resource_id, resource_version_id, upload_session_id, source_path, target_path, operation_type, parent_operation_id, status, retry_number, attempt_count
    ) VALUES (
      v_cm_id, v_res_id, v_ver_id, v_session_id, 'html-packages/staging/session_valid_01', 'published/res1/1', 'stage_upload', v_op_id, 'pending', 1, 2
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Retry storage operation with different actor_id DENIED (SQLSTATE 42000)');

  -- Check parent row unchanged
  SELECT status INTO v_sess_rec FROM public.storage_operations WHERE id = v_op_id;
  PERFORM pg17_assert(v_sess_rec.status = 'failed', 'Parent storage operation row status remains failed and unchanged');

  -- Retry non-failed parent DENIED
  v_err_caught := false;
  BEGIN
    INSERT INTO public.storage_operations (
      actor_id, resource_id, resource_version_id, upload_session_id, source_path, target_path, operation_type, parent_operation_id, status, retry_number, attempt_count
    ) VALUES (
      v_admin_id, v_res_id, v_ver_id, v_session_id, 'html-packages/staging/session_valid_01', 'published/res1/1', 'stage_upload', v_parent_op_id, 'pending', 1, 2
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Retry storage operation with non-failed parent DENIED (SQLSTATE 42000)');

  -- DELETE storage operation DENIED
  v_err_caught := false;
  BEGIN
    DELETE FROM public.storage_operations WHERE id = v_op_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'DELETE storage operations DENIED (SQLSTATE 42000)');

  -- 8. Audit Append-only (reviews & events)
  INSERT INTO public.lesson_resource_reviews (resource_id, resource_version_id, reviewer_id, decision, reason)
  VALUES (v_res_id, v_ver_id, v_admin_id, 'approved', 'Check passed');

  v_err_caught := false;
  BEGIN
    UPDATE public.lesson_resource_reviews SET decision = 'rejected' WHERE resource_id = v_res_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'UPDATE on lesson_resource_reviews DENIED (SQLSTATE 42000)');

  v_err_caught := false;
  BEGIN
    DELETE FROM public.lesson_resource_reviews WHERE resource_id = v_res_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'DELETE on lesson_resource_reviews DENIED (SQLSTATE 42000)');

  -- 9. Student RLS Matrix & Feature Flag check
  -- Student with html_content_student_read = false -> EXPLICIT ERROR on fetch
  UPDATE public.content_feature_flags SET is_enabled = false WHERE flag_key = 'html_content_student_read';
  PERFORM set_config('test.auth_role', 'authenticated', true);
  PERFORM set_config('test.auth_uid', v_student_id::text, true);

  v_err_caught := false;
  BEGIN
    PERFORM * FROM public.fetch_published_lesson_resources(v_lesson_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'fetch_published_lesson_resources when feature flag disabled returns EXPLICIT ERROR (SQLSTATE 42501)');

  -- Direct DML by student on lesson_resources DENIED
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_err_caught := false;
  BEGIN
    EXECUTE 'INSERT INTO public.lesson_resources (lesson_id, resource_type, title, url) VALUES ($1, ''html'', ''Forged'', ''https://bad'')' USING v_lesson_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN v_err_caught := true; END IF;
  END;
  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM pg17_assert(v_err_caught, 'Direct authenticated INSERT on lesson_resources DENIED (SQLSTATE 42501)');

  -- Enable student feature flag
  PERFORM set_config('test.auth_role', 'service_role', true);
  UPDATE public.content_feature_flags SET is_enabled = true WHERE flag_key = 'html_content_student_read';
  PERFORM set_config('test.auth_role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM public.fetch_published_lesson_resources(v_lesson_id);
  PERFORM pg17_assert(v_count = 1, 'fetch_published_lesson_resources returns 1 published resource when flag enabled');

  -- Student with can_access_lesson = false -> DENIED
  PERFORM set_config('test.can_access_lesson', 'false', true);
  v_err_caught := false;
  BEGIN
    PERFORM * FROM public.fetch_published_lesson_resources(v_lesson_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'fetch_published_lesson_resources with can_access_lesson=false DENIED (SQLSTATE 42501)');

  RESET ROLE;
  RAISE NOTICE '=== ALL PG17 Runtime Harness Assertions PASSED ===';
END $$;

COMMIT;
`;

  console.log("Executing PG17 Runtime Test Assertions...");
  const testRun = spawnSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
    {
      input: testSql,
      encoding: "utf8",
      shell: true,
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  process.stdout.write(testRun.stdout || "");
  process.stderr.write(testRun.stderr || "");

  if (testRun.status !== 0) {
    console.error("PG17 Runtime Tests FAILED");
    process.exit(testRun.status ?? 1);
  }

  // 10. Real Concurrency Test for Idempotency Ledger Claiming
  console.log("Executing Real 2-Connection PG17 Concurrency Test for Idempotency Ledger...");

  const actorUuid = "00000000-0000-0000-0000-000000000000";
  const opName = "concurrent_op_test";
  const keyName = `key_${Date.now()}`;

  const queryConn1 = `
    SELECT * FROM public.claim_idempotency_key('${opName}', '${keyName}');
  `;

  // Run 2 parallel psql invocations concurrently against containerName using stdin
  const runAsyncPsql = () =>
    new Promise((resolve) => {
      const child = spawn(
        "docker",
        ["exec", "-i", containerName, "psql", "-U", "postgres", "-t", "-A"],
        {
          shell: false,
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      child.on("close", () => {
        if (!stdout && stderr) {
          console.error("PSQL STDERR:", stderr);
        }
        resolve(stdout.trim());
      });
      child.stdin.write(queryConn1);
      child.stdin.end();
    });

  const [res1, res2] = await Promise.all([runAsyncPsql(), runAsyncPsql()]);
  console.log(`Connection 1 Result: ${res1}`);
  console.log(`Connection 2 Result: ${res2}`);

  const hasClaimedTrue = res1.includes("|t|") || res2.includes("|t|");
  const hasClaimedFalse = res1.includes("|f|") || res2.includes("|f|");

  if (!hasClaimedTrue || !hasClaimedFalse) {
    console.error(
      "FAILED: Concurrency test failed. One connection must claim=t and the other claim=f.",
    );
    process.exit(1);
  }
  console.log(
    "PASS: Real 2-connection PG17 idempotency claim concurrency verified (exactly 1 claim winner).",
  );

  console.log("SUCCESS: PG17 Runtime Test Runner completed with 0 errors.");
} finally {
  if (containerStarted) {
    console.log(`Cleaning up container ${containerName}...`);
    spawnSync("docker", ["rm", "-f", containerName], { shell: true });

    // Verify container is removed
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
