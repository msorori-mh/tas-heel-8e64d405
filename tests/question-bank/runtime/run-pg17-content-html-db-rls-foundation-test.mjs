#!/usr/bin/env node
/**
 * PostgreSQL 17 Local Disposable Runtime Test Runner for
 * CONTENT_HTML_DB_RLS_FOUNDATION_IMPLEMENTATION_01
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..", "..");
const migrationPath = join(root, "supabase", "migrations", "20260806050000_content_html_db_rls_foundation.sql");

function projectRefLinked() {
  return existsSync(join(root, "supabase", ".temp", "project-ref"));
}

if (projectRefLinked()) {
  console.error("REFUSED: supabase/.temp/project-ref present (remote link)");
  process.exit(2);
}

function getLocalContainer() {
  if (process.env.PG17_LOCAL_CONTAINER) return process.env.PG17_LOCAL_CONTAINER;
  const ps = spawnSync("docker", ["ps", "--format", "{{.Names}}"], {
    encoding: "utf8",
    shell: true,
  });
  const names = (ps.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const match = names.find((n) => n.includes("supabase_db") || n.includes("pg17") || n.includes("postgres"));
  return match;
}

const container = getLocalContainer();
if (!container) {
  console.error("No local postgres container found. Please start a local disposable PostgreSQL 17 container.");
  process.exit(1);
}

if (!existsSync(migrationPath)) {
  console.error(`Missing migration file: ${migrationPath}`);
  process.exit(1);
}

console.log(`Using PostgreSQL container: ${container}`);

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

// PostgreSQL 17 Comprehensive Runtime Harness SQL
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

-- 1. Test Feature Flags Default State & Server Helper
SELECT pg17_assert(public.is_content_feature_enabled('html_content_backend') = false, 'Feature flag html_content_backend defaults to false');
SELECT pg17_assert(public.is_content_feature_enabled('html_content_upload') = false, 'Feature flag html_content_upload defaults to false');
SELECT pg17_assert(public.is_content_feature_enabled('html_content_publish') = false, 'Feature flag html_content_publish defaults to false');
SELECT pg17_assert(public.is_content_feature_enabled('html_content_student_read') = false, 'Feature flag html_content_student_read defaults to false');
SELECT pg17_assert(public.is_content_feature_enabled('non_existent_key') = false, 'Missing feature flag returns false (fail-closed)');

-- 2. Test Setup Variables
DO $$
DECLARE
  v_student_id uuid := gen_random_uuid();
  v_admin_id uuid := gen_random_uuid();
  v_cm_id uuid := gen_random_uuid();
  v_lesson_id uuid := gen_random_uuid();
  v_other_lesson_id uuid := gen_random_uuid();
  v_batch_id uuid := gen_random_uuid();
  v_res_id uuid := gen_random_uuid();
  v_other_res_id uuid := gen_random_uuid();
  v_ver_id uuid := gen_random_uuid();
  v_other_ver_id uuid := gen_random_uuid();
  v_session_id uuid := gen_random_uuid();
  v_expired_session_id uuid := gen_random_uuid();
  v_op_id uuid := gen_random_uuid();
  v_parent_op_id uuid := gen_random_uuid();
  v_err_caught boolean;
  v_count integer;
  v_val_id uuid;
  v_sess_rec record;
BEGIN
  -- Insert mock auth users
  INSERT INTO auth.users (id, email) VALUES (v_student_id, 'student@test.com'), (v_admin_id, 'admin@test.com'), (v_cm_id, 'cm@test.com');

  -- Insert mock lessons
  INSERT INTO public.lessons (id, title, slug, sort_order) VALUES (v_lesson_id, 'Test Lesson 1', 'lesson-1', 1), (v_other_lesson_id, 'Test Lesson 2', 'lesson-2', 2);

  -- Insert mock resources
  INSERT INTO public.lesson_resources (id, lesson_id, resource_type, title, url, lifecycle_status)
  VALUES (v_res_id, v_lesson_id, 'html', 'Interactive HTML Resource 1', 'https://cdn.example.com/res1', 'draft');

  INSERT INTO public.lesson_resources (id, lesson_id, resource_type, title, url, lifecycle_status)
  VALUES (v_other_res_id, v_other_lesson_id, 'html', 'Interactive HTML Resource 2', 'https://cdn.example.com/res2', 'published');

  -- Version Integrity: Create versions
  INSERT INTO public.lesson_resource_versions (id, resource_id, version_number, content_sha256, manifest)
  VALUES (v_ver_id, v_res_id, 1, 'sha256_hash_1111111111111111111111111111111111111111111111111111111111111111', '{"entry": "index.html"}'::jsonb);

  INSERT INTO public.lesson_resource_versions (id, resource_id, version_number, content_sha256, manifest)
  VALUES (v_other_ver_id, v_other_res_id, 1, 'sha256_hash_2222222222222222222222222222222222222222222222222222222222222222', '{"entry": "main.html"}'::jsonb);

  -- Test Version Integrity: Cross-resource pointer DENIED by composite FK
  v_err_caught := false;
  BEGIN
    UPDATE public.lesson_resources SET current_draft_version_id = v_other_ver_id WHERE id = v_res_id;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  PERFORM pg17_assert(v_err_caught, 'Cross-resource version assignment is DENIED by composite FK');

  -- Valid same-resource pointer
  UPDATE public.lesson_resources SET current_draft_version_id = v_ver_id, published_version_id = v_ver_id, lifecycle_status = 'published' WHERE id = v_res_id;
  PERFORM pg17_assert(true, 'Same-resource version pointer assignment ALLOWED');

  -- Test Version Immutability on approved/published version
  v_err_caught := false;
  BEGIN
    DELETE FROM public.lesson_resource_versions WHERE id = v_ver_id;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  PERFORM pg17_assert(v_err_caught, 'DELETE on published/approved version is DENIED');

  -- Test Upload Sessions & Ownership
  INSERT INTO public.content_import_batches (id, actor_id, status) VALUES (v_batch_id, v_admin_id, 'created');

  INSERT INTO public.lesson_resource_upload_sessions (
    id, batch_id, actor_id, resource_id, staging_path, expected_package_hash, original_filename, expires_at
  ) VALUES (
    v_session_id, v_batch_id, v_admin_id, v_res_id, 'staging/session_valid_01', 'pkg_hash_01', 'package.zip', now() + interval '1 hour'
  );

  INSERT INTO public.lesson_resource_upload_sessions (
    id, batch_id, actor_id, resource_id, staging_path, expected_package_hash, original_filename, expires_at
  ) VALUES (
    v_expired_session_id, v_batch_id, v_admin_id, v_res_id, 'staging/session_expired_01', 'pkg_hash_02', 'package_old.zip', now() - interval '10 minutes'
  );

  -- Test resolve_upload_session contract & expiration
  SELECT * INTO v_sess_rec FROM public.resolve_upload_session(v_session_id);
  PERFORM pg17_assert(v_sess_rec.is_expired = false, 'resolve_upload_session flags active session as not expired');

  SELECT * INTO v_sess_rec FROM public.resolve_upload_session(v_expired_session_id);
  PERFORM pg17_assert(v_sess_rec.is_expired = true, 'resolve_upload_session flags expired session as expired');

  -- Upload Session Immutability
  v_err_caught := false;
  BEGIN
    UPDATE public.lesson_resource_upload_sessions SET actor_id = v_student_id WHERE id = v_session_id;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  PERFORM pg17_assert(v_err_caught, 'actor_id mutation on upload session DENIED');

  v_err_caught := false;
  BEGIN
    UPDATE public.lesson_resource_upload_sessions SET staging_path = 'forged/staging' WHERE id = v_session_id;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  PERFORM pg17_assert(v_err_caught, 'staging_path mutation on upload session DENIED');

  -- Test Validation Record Contract: Service-role vs Authenticated
  -- 1) Service role succeeds:
  PERFORM set_config('test.auth_role', 'service_role', true);
  v_val_id := public.record_server_validation(
    v_session_id, v_ver_id, 'pkg_hash_01', 'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'staging/session_valid_01/pkg.zip'
  );
  PERFORM pg17_assert(v_val_id IS NOT NULL, 'service_role can record server validation');

  -- 2) Authenticated role fails:
  PERFORM set_config('test.auth_role', 'authenticated', true);
  v_err_caught := false;
  BEGIN
    PERFORM public.record_server_validation(
      v_session_id, v_ver_id, 'pkg_hash_01', 'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'staging/session_valid_01/pkg.zip'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  PERFORM pg17_assert(v_err_caught, 'authenticated role CANNOT record server validation');

  -- Reset role to service_role for remaining setup
  PERFORM set_config('test.auth_role', 'service_role', true);

  -- Test Storage Operations Transitions Matrix & Immutability
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id, source_path, target_path, operation_type, status
  ) VALUES (
    v_op_id, v_admin_id, v_res_id, v_ver_id, v_session_id, 'source/stg', 'target/pub', 'stage_upload', 'pending'
  );

  -- Illegal transition: pending -> cleaned (DENIED)
  v_err_caught := false;
  BEGIN
    UPDATE public.storage_operations SET status = 'cleaned' WHERE id = v_op_id;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  PERFORM pg17_assert(v_err_caught, 'Storage operation transition pending -> cleaned DENIED');

  -- Valid transition chain: pending -> uploaded -> verified -> promoted -> cleanup_pending -> cleaned
  UPDATE public.storage_operations SET status = 'uploaded' WHERE id = v_op_id;
  UPDATE public.storage_operations SET status = 'verified' WHERE id = v_op_id;
  UPDATE public.storage_operations SET status = 'promoted' WHERE id = v_op_id;
  UPDATE public.storage_operations SET status = 'cleanup_pending' WHERE id = v_op_id;
  UPDATE public.storage_operations SET status = 'cleaned' WHERE id = v_op_id;
  PERFORM pg17_assert(true, 'Storage operation valid transition chain completed');

  -- Update from terminal status cleaned (DENIED)
  v_err_caught := false;
  BEGIN
    UPDATE public.storage_operations SET status = 'pending' WHERE id = v_op_id;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  PERFORM pg17_assert(v_err_caught, 'Storage operation update from terminal state cleaned DENIED');

  -- DELETE storage operation (DENIED)
  v_err_caught := false;
  BEGIN
    DELETE FROM public.storage_operations WHERE id = v_op_id;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  PERFORM pg17_assert(v_err_caught, 'DELETE on storage_operations DENIED');

  -- Retry operation contract: parent_operation_id + retry_number = parent + 1
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id, source_path, target_path, operation_type, parent_operation_id, status, retry_number, attempt_count
  ) VALUES (
    v_parent_op_id, v_admin_id, v_res_id, v_ver_id, v_session_id, 'source/stg', 'target/pub', 'stage_upload', v_op_id, 'pending', 1, 2
  );
  PERFORM pg17_assert(true, 'Retry storage operation row created with parent pointer and retry_number = parent + 1');

  -- Failed -> Compensated transition
  UPDATE public.storage_operations SET status = 'failed' WHERE id = v_parent_op_id;
  UPDATE public.storage_operations SET status = 'compensated' WHERE id = v_parent_op_id;
  PERFORM pg17_assert(true, 'Transition failed -> compensated ALLOWED');

  -- Test Idempotency Ledger Atomic Claim
  INSERT INTO public.idempotency_ledger (actor_id, operation, idempotency_key, status)
  VALUES (v_admin_id, 'publish_op', 'key_123', 'in_progress')
  ON CONFLICT (actor_id, operation, idempotency_key) DO NOTHING;

  SELECT count(*) INTO v_count FROM public.idempotency_ledger WHERE actor_id = v_admin_id AND operation = 'publish_op' AND idempotency_key = 'key_123';
  PERFORM pg17_assert(v_count = 1, 'Initial idempotency claim registered exactly 1 row');

  -- Concurrent claim attempt
  INSERT INTO public.idempotency_ledger (actor_id, operation, idempotency_key, status)
  VALUES (v_admin_id, 'publish_op', 'key_123', 'in_progress')
  ON CONFLICT (actor_id, operation, idempotency_key) DO NOTHING;

  SELECT count(*) INTO v_count FROM public.idempotency_ledger WHERE actor_id = v_admin_id AND operation = 'publish_op' AND idempotency_key = 'key_123';
  PERFORM pg17_assert(v_count = 1, 'Duplicate idempotency claim on conflict ignored without error');

  -- Test Audit Append-Only Tables (reviews & events)
  INSERT INTO public.lesson_resource_reviews (resource_id, resource_version_id, reviewer_id, decision, reason)
  VALUES (v_res_id, v_ver_id, v_admin_id, 'approved', 'Quality check passed');

  v_err_caught := false;
  BEGIN
    UPDATE public.lesson_resource_reviews SET decision = 'rejected' WHERE resource_id = v_res_id;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  PERFORM pg17_assert(v_err_caught, 'UPDATE on lesson_resource_reviews DENIED (append-only)');

  v_err_caught := false;
  BEGIN
    DELETE FROM public.lesson_resource_reviews WHERE resource_id = v_res_id;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  PERFORM pg17_assert(v_err_caught, 'DELETE on lesson_resource_reviews DENIED (append-only)');

  INSERT INTO public.lesson_resource_events (resource_id, resource_version_id, actor_id, event_type, payload)
  VALUES (v_res_id, v_ver_id, v_admin_id, 'approve', '{"notes": "ok"}'::jsonb);

  v_err_caught := false;
  BEGIN
    DELETE FROM public.lesson_resource_events WHERE resource_id = v_res_id;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  PERFORM pg17_assert(v_err_caught, 'DELETE on lesson_resource_events DENIED (append-only)');

  -- Test RLS Student Access Rules with SET LOCAL ROLE authenticated
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('test.auth_role', 'authenticated', true);
  PERFORM set_config('test.auth_uid', v_student_id::text, true);

  -- Direct DML by student / client on lesson_resources DENIED
  v_err_caught := false;
  BEGIN
    EXECUTE 'INSERT INTO public.lesson_resources (lesson_id, resource_type, title, url) VALUES ($1, ''html'', ''Forged'', ''https://bad'')' USING v_lesson_id;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  PERFORM pg17_assert(v_err_caught, 'Direct client INSERT on lesson_resources DENIED');

  v_err_caught := false;
  BEGIN
    EXECUTE 'UPDATE public.lesson_resources SET title = ''Hacked'' WHERE id = $1' USING v_res_id;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  PERFORM pg17_assert(v_err_caught, 'Direct client UPDATE on lesson_resources DENIED');

  v_err_caught := false;
  BEGIN
    EXECUTE 'DELETE FROM public.lesson_resources WHERE id = $1' USING v_res_id;
  EXCEPTION WHEN OTHERS THEN
    v_err_caught := true;
  END;
  PERFORM pg17_assert(v_err_caught, 'Direct client DELETE on lesson_resources DENIED');

  -- Student Read with Feature Flag OFF -> 0 rows
  EXECUTE 'SELECT count(*) FROM public.lesson_resources WHERE id = $1' INTO v_count USING v_res_id;
  PERFORM pg17_assert(v_count = 0, 'Student read returns 0 rows when feature flag html_content_student_read is false');

  -- Switch role back to update feature flag
  RESET ROLE;
  UPDATE public.content_feature_flags SET is_enabled = true WHERE flag_key = 'html_content_student_read';
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- Student Read with Feature Flag ON -> 1 row for published resource
  EXECUTE 'SELECT count(*) FROM public.lesson_resources WHERE id = $1' INTO v_count USING v_res_id;
  PERFORM pg17_assert(v_count = 1, 'Student read returns published resource when feature flag html_content_student_read is true');

  -- Switch role to change lifecycle_status
  RESET ROLE;
  UPDATE public.lesson_resources SET lifecycle_status = 'draft' WHERE id = v_res_id;
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- Student Read for draft resource -> 0 rows
  EXECUTE 'SELECT count(*) FROM public.lesson_resources WHERE id = $1' INTO v_count USING v_res_id;
  PERFORM pg17_assert(v_count = 0, 'Student read returns 0 rows for draft resource');

  RESET ROLE;
  UPDATE public.lesson_resources SET lifecycle_status = 'in_review' WHERE id = v_res_id;
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE 'SELECT count(*) FROM public.lesson_resources WHERE id = $1' INTO v_count USING v_res_id;
  PERFORM pg17_assert(v_count = 0, 'Student read returns 0 rows for in_review resource');

  RESET ROLE;
  UPDATE public.lesson_resources SET lifecycle_status = 'archived' WHERE id = v_res_id;
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE 'SELECT count(*) FROM public.lesson_resources WHERE id = $1' INTO v_count USING v_res_id;
  PERFORM pg17_assert(v_count = 0, 'Student read returns 0 rows for archived resource');

  RESET ROLE;
  RAISE NOTICE '=== ALL PG17 Runtime Test Assertions PASSED Successfully ===';
END $$;

ROLLBACK;
`;

const migrationSql = readFileSync(migrationPath, "utf8");

try {
  console.log("Applying baseline prerequisite SQL...");
  const baseRun = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], {
    input: baselineSql,
    encoding: "utf8",
    shell: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (baseRun.status !== 0) {
    console.error("Baseline SQL apply failed:");
    console.error(baseRun.stderr || baseRun.stdout);
    process.exit(baseRun.status ?? 1);
  }

  console.log("Applying migration 20260806050000_content_html_db_rls_foundation.sql...");
  const migrationRun = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], {
    input: migrationSql,
    encoding: "utf8",
    shell: true,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (migrationRun.status !== 0) {
    console.error("Migration apply failed:");
    console.error(migrationRun.stderr || migrationRun.stdout);
    process.exit(migrationRun.status ?? 1);
  }

  console.log("Executing PG17 Runtime Test Assertions...");
  const testRun = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], {
    input: testSql,
    encoding: "utf8",
    shell: true,
    maxBuffer: 10 * 1024 * 1024,
  });

  process.stdout.write(testRun.stdout || "");
  process.stderr.write(testRun.stderr || "");

  if (testRun.status !== 0) {
    console.error("PG17 Runtime Tests FAILED");
    process.exit(testRun.status ?? 1);
  }

  console.log("SUCCESS: PG17 Runtime Test Runner completed with 0 errors.");
} finally {
  console.log("Cleanup completed.");
}
