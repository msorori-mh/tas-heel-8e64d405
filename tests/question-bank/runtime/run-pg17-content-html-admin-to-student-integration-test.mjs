#!/usr/bin/env node
/**
 * PostgreSQL 17 Local Disposable Runtime Test Runner for
 * TAMKEEN_HTML_REAL_PUBLICATION_ROLLBACK_PROOF_FULL_CLOSURE_20
 *
 * Verifies the full HTML Resource operational proof path:
 *   Admin Import → Database → Lifecycle → Publish → Student Enumeration
 *   → v2 Publish → Rollback → Student Enumeration
 * using a real local PostgreSQL database (not mocks).
 *
 * Rules:
 *   - All positive-path lifecycle transitions use production RPCs.
 *   - Storage operations are local test promotion proofs, never remote writes.
 *   - Direct SQL that creates versions/sessions is documented setup fixture only.
 *   - No direct UPDATE of published_version_id or lifecycle_status='published'.
 */

import { spawnSync } from "node:child_process";
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
const alignmentPath = join(
  root,
  "supabase",
  "migrations",
  "20260808060000_content_html_resource_contract_alignment.sql",
);
const hardeningPath = join(
  root,
  "supabase",
  "migrations",
  "20260809010000_content_html_resource_code_boundary_hardening.sql",
);

function projectRefLinked() {
  return existsSync(join(root, "supabase", ".temp", "project-ref"));
}

if (projectRefLinked()) {
  console.error("REFUSED: supabase/.temp/project-ref present (remote link)");
  process.exit(2);
}

for (const p of [foundationPath, lifecyclePath, alignmentPath, hardeningPath]) {
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

  console.log("Applying resource contract alignment migration...");
  psql(readFileSync(alignmentPath, "utf8"));

  console.log("Applying resource code boundary hardening migration...");
  psql(readFileSync(hardeningPath, "utf8"));

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

-- Test-only helper: assert complete publication state for a target version.
-- Does not execute production logic; only performs explicit post-RPC proof.
CREATE OR REPLACE FUNCTION test_assert_publication_state(
  p_resource_id uuid,
  p_expected_published_version_id uuid,
  p_expected_approved_version_id uuid,
  p_expected_lock_version integer,
  p_expected_hash text,
  p_expected_path text,
  p_expected_event_count integer
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_res record;
  v_ver record;
  v_op record;
  v_count integer;
BEGIN
  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id;
  PERFORM pg17_assert(v_res.lifecycle_status = 'published', 'resource lifecycle_status = published');
  PERFORM pg17_assert(v_res.published_version_id = p_expected_published_version_id, 'resource published_version_id correct');
  PERFORM pg17_assert(v_res.approved_version_id = p_expected_approved_version_id, 'resource approved_version_id correct');
  PERFORM pg17_assert(v_res.lock_version = p_expected_lock_version, 'resource lock_version correct (CAS increment)');

  SELECT * INTO v_ver FROM public.lesson_resource_versions WHERE id = p_expected_published_version_id;
  PERFORM pg17_assert(v_ver.content_sha256 = p_expected_hash, 'published version hash matches expected');
  PERFORM pg17_assert(v_ver.immutable_at IS NOT NULL, 'published version is immutable');

  SELECT * INTO v_op FROM public.storage_operations
  WHERE resource_id = p_resource_id
    AND resource_version_id = p_expected_published_version_id
    AND operation_type = 'promote_published'
    AND status = 'promoted'
    AND target_path = p_expected_path
    AND expected_hash = p_expected_hash;
  PERFORM pg17_assert(v_op.id IS NOT NULL, 'trusted promoted storage operation exists with correct hash/path');

  SELECT count(*) INTO v_count FROM public.lesson_resource_events
  WHERE resource_id = p_resource_id AND resource_version_id = p_expected_published_version_id AND event_type = 'publish';
  PERFORM pg17_assert(v_count = p_expected_event_count, 'publication audit event count correct');
END;
$$;

-- Test-only helper: assert complete rollback state.
CREATE OR REPLACE FUNCTION test_assert_rollback_state(
  p_resource_id uuid,
  p_expected_published_version_id uuid,
  p_expected_approved_version_id uuid,
  p_expected_lock_version integer,
  p_expected_hash text,
  p_expected_path text,
  p_previous_published_version_id uuid
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_res record;
  v_ver record;
  v_op record;
  v_event record;
BEGIN
  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id;
  PERFORM pg17_assert(v_res.lifecycle_status = 'published', 'rollback keeps resource published');
  PERFORM pg17_assert(v_res.published_version_id = p_expected_published_version_id, 'rollback published_version_id points to target');
  PERFORM pg17_assert(v_res.approved_version_id = p_expected_approved_version_id, 'rollback preserves approved_version_id');
  PERFORM pg17_assert(v_res.lock_version = p_expected_lock_version, 'rollback lock_version incremented exactly once');

  SELECT * INTO v_ver FROM public.lesson_resource_versions WHERE id = p_expected_published_version_id;
  PERFORM pg17_assert(v_ver.content_sha256 = p_expected_hash, 'rollback target version hash unchanged');
  PERFORM pg17_assert(v_ver.immutable_at IS NOT NULL, 'rollback target version remains immutable');

  SELECT * INTO v_op FROM public.storage_operations
  WHERE resource_id = p_resource_id
    AND resource_version_id = p_expected_published_version_id
    AND operation_type = 'promote_published'
    AND status IN ('promoted', 'cleaned')
    AND target_path = p_expected_path
    AND expected_hash = p_expected_hash;
  PERFORM pg17_assert(v_op.id IS NOT NULL, 'rollback target historical storage proof exists');

  SELECT * INTO v_event FROM public.lesson_resource_events
  WHERE resource_id = p_resource_id AND event_type = 'rollback'
  ORDER BY created_at DESC LIMIT 1;
  PERFORM pg17_assert(v_event.id IS NOT NULL, 'rollback audit event exists');
  PERFORM pg17_assert(
    (v_event.payload->>'previous_published_version_id')::uuid = p_previous_published_version_id,
    'rollback audit references previous published version'
  );
END;
$$;

DO $$ BEGIN RAISE NOTICE '=== Starting PG17 Admin→Student HTML Publication/Rollback Proof Test ==='; END $$;

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
  v_mm_v3_id uuid := gen_random_uuid();

  v_draft_v1_id uuid := gen_random_uuid();
  v_review_v1_id uuid := gen_random_uuid();
  v_approved_v1_id uuid := gen_random_uuid();
  v_approved_v2_id uuid := gen_random_uuid();
  v_other_v1_id uuid := gen_random_uuid();
  v_legacy_v1_id uuid := gen_random_uuid();

  v_batch_id uuid := gen_random_uuid();

  v_mm_v1_session_id uuid := gen_random_uuid();
  v_exp_v1_session_id uuid := gen_random_uuid();
  v_sum_v1_session_id uuid := gen_random_uuid();
  v_mm_v2_session_id uuid := gen_random_uuid();
  v_mm_v3_session_id uuid := gen_random_uuid();
  v_review_session_id uuid := gen_random_uuid();
  v_approved_session_id uuid := gen_random_uuid();

  v_mm_v1_op_id uuid;
  v_exp_v1_op_id uuid;
  v_sum_v1_op_id uuid;
  v_mm_v2_op_id uuid;
  v_approved_v1_op_id uuid;

  -- Negative-case operation IDs
  v_neg_wrong_res_op_id uuid;
  v_neg_wrong_ver_op_id uuid;
  v_neg_hash_op_id uuid;
  v_neg_path_op_id uuid;
  v_neg_status_op_id uuid;
  v_neg_rollback_no_op_id uuid;

  v_lock_before integer;
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
    (v_mm_res_id, v_lesson_id, 'html', 'mind_map_html', 'test_mm_001', 'Mind Map 1', '', 'draft'),
    (v_exp_res_id, v_lesson_id, 'html', 'practical_experiment_html', 'test_exp_001', 'Experiment 1', '', 'draft'),
    (v_sum_res_id, v_lesson_id, 'html', 'summary_html', 'test_sum_001', 'Summary 1', '', 'draft');

  -- Negative-case resources
  INSERT INTO public.lesson_resources (
    id, lesson_id, resource_type, html_resource_type, resource_code, title, url, lifecycle_status
  ) VALUES
    (v_draft_res_id, v_lesson_id, 'html', 'mind_map_html', 'neg_draft', 'Draft Only', '', 'draft'),
    (v_review_res_id, v_lesson_id, 'html', 'practical_experiment_html', 'neg_review', 'In Review', '', 'draft'),
    (v_approved_res_id, v_lesson_id, 'html', 'summary_html', 'neg_approved', 'Approved Unpublished', '', 'draft'),
    (v_other_lesson_res_id, v_other_lesson_id, 'html', 'mind_map_html', 'other_mm', 'Other Lesson', '', 'draft'),
    (v_legacy_res_id, v_lesson_id, 'video', NULL, 'legacy_vid', 'Legacy Video', 'https://example.com', 'published');

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
    VALUES (gen_random_uuid(), v_lesson_id, 'html', 'mind_map_html', 'test_mm_001', 'Duplicate Code', '');
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
    (v_mm_v2_id, v_mm_res_id, 2, 'sha256_mm_2222222222222222222222222222222222222222222222222222222222222222', '{"entry":"v2.html"}'::jsonb),
    (v_mm_v3_id, v_mm_res_id, 3, 'sha256_mm_3333333333333333333333333333333333333333333333333333333333333333', '{"entry":"v3.html"}'::jsonb);

  -- Versions for negative-case resources
  INSERT INTO public.lesson_resource_versions (id, resource_id, version_number, content_sha256, manifest) VALUES
    (v_draft_v1_id, v_draft_res_id, 1, 'sha256_draft_1111111111111111111111111111111111111111111111111111111111111111', '{}'::jsonb),
    (v_review_v1_id, v_review_res_id, 1, 'sha256_review_1111111111111111111111111111111111111111111111111111111111111111', '{}'::jsonb),
    (v_approved_v1_id, v_approved_res_id, 1, 'sha256_approved_1111111111111111111111111111111111111111111111111111111111111111', '{}'::jsonb),
    (v_approved_v2_id, v_approved_res_id, 2, 'sha256_approved_2222222222222222222222222222222222222222222222222222222222222222', '{}'::jsonb),
    (v_other_v1_id, v_other_lesson_res_id, 1, 'sha256_other_1111111111111111111111111111111111111111111111111111111111111111', '{}'::jsonb),
    (v_legacy_v1_id, v_legacy_res_id, 1, 'sha256_legacy_1111111111111111111111111111111111111111111111111111111111111111', '{}'::jsonb);

  -- Setup fixture: bind initial draft versions. Not a lifecycle/publication bypass.
  UPDATE public.lesson_resources SET current_draft_version_id = v_mm_v1_id WHERE id = v_mm_res_id;
  UPDATE public.lesson_resources SET current_draft_version_id = v_exp_v1_id WHERE id = v_exp_res_id;
  UPDATE public.lesson_resources SET current_draft_version_id = v_sum_v1_id WHERE id = v_sum_res_id;
  UPDATE public.lesson_resources SET current_draft_version_id = v_draft_v1_id WHERE id = v_draft_res_id;
  UPDATE public.lesson_resources SET current_draft_version_id = v_review_v1_id WHERE id = v_review_res_id;
  UPDATE public.lesson_resources SET current_draft_version_id = v_approved_v1_id WHERE id = v_approved_res_id;
  UPDATE public.lesson_resources SET current_draft_version_id = v_other_v1_id WHERE id = v_other_lesson_res_id;

  -- ============================================================
  -- Upload sessions and validations
  -- ============================================================
  INSERT INTO public.content_import_batches (id, actor_id, status) VALUES (v_batch_id, v_cm_id, 'created');

  INSERT INTO public.lesson_resource_upload_sessions (
    id, batch_id, actor_id, resource_id, staging_path, expected_package_hash, original_filename, expires_at
  ) VALUES
    (v_mm_v1_session_id, v_batch_id, v_cm_id, v_mm_res_id, 'html-packages/staging/mm_v1', 'sha256_mm_1111111111111111111111111111111111111111111111111111111111111111', 'mm.zip', now() + interval '1 hour'),
    (v_exp_v1_session_id, v_batch_id, v_cm_id, v_exp_res_id, 'html-packages/staging/exp_v1', 'sha256_exp_1111111111111111111111111111111111111111111111111111111111111111', 'exp.zip', now() + interval '1 hour'),
    (v_sum_v1_session_id, v_batch_id, v_cm_id, v_sum_res_id, 'html-packages/staging/sum_v1', 'sha256_sum_1111111111111111111111111111111111111111111111111111111111111111', 'sum.zip', now() + interval '1 hour'),
    (v_mm_v2_session_id, v_batch_id, v_cm_id, v_mm_res_id, 'html-packages/staging/mm_v2', 'sha256_mm_2222222222222222222222222222222222222222222222222222222222222222', 'mm_v2.zip', now() + interval '1 hour'),
    (v_mm_v3_session_id, v_batch_id, v_cm_id, v_mm_res_id, 'html-packages/staging/mm_v3', 'sha256_mm_3333333333333333333333333333333333333333333333333333333333333333', 'mm_v3.zip', now() + interval '1 hour'),
    (v_review_session_id, v_batch_id, v_cm_id, v_review_res_id, 'html-packages/staging/review_v1', 'sha256_review_1111111111111111111111111111111111111111111111111111111111111111', 'review.zip', now() + interval '1 hour'),
    (v_approved_session_id, v_batch_id, v_cm_id, v_approved_res_id, 'html-packages/staging/approved_v1', 'sha256_approved_1111111111111111111111111111111111111111111111111111111111111111', 'approved.zip', now() + interval '1 hour');

  PERFORM set_config('test.auth_role', 'service_role', true);
  PERFORM set_config('test.auth_uid', v_cm_id::text, true);

  -- Trusted validations: is_valid=true, no blocking findings, hash/path match.
  PERFORM public.record_server_validation(v_mm_v1_session_id, v_mm_v1_id, 'sha256_mm_1111111111111111111111111111111111111111111111111111111111111111', 'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/mm_v1');
  PERFORM public.record_server_validation(v_exp_v1_session_id, v_exp_v1_id, 'sha256_exp_1111111111111111111111111111111111111111111111111111111111111111', 'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/exp_v1');
  PERFORM public.record_server_validation(v_sum_v1_session_id, v_sum_v1_id, 'sha256_sum_1111111111111111111111111111111111111111111111111111111111111111', 'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/sum_v1');
  PERFORM public.record_server_validation(v_mm_v2_session_id, v_mm_v2_id, 'sha256_mm_2222222222222222222222222222222222222222222222222222222222222222', 'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/mm_v2');
  PERFORM public.record_server_validation(v_mm_v3_session_id, v_mm_v3_id, 'sha256_mm_3333333333333333333333333333333333333333333333333333333333333333', 'v1.0', '[]'::jsonb, true, now() + interval '1 day', 'html-packages/staging/mm_v3');
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

  -- Assert submit state for v1 mind map
  SELECT lifecycle_status, current_draft_version_id, lock_version INTO v_binding
  FROM public.lesson_resources WHERE id = v_mm_res_id;
  PERFORM pg17_assert(v_binding.lifecycle_status = 'in_review', 'v1 submit transitions resource to in_review');
  PERFORM pg17_assert(v_binding.current_draft_version_id = v_mm_v1_id, 'v1 submit preserves current draft version');
  SELECT count(*) INTO v_count FROM public.lesson_resource_events
  WHERE resource_id = v_mm_res_id AND resource_version_id = v_mm_v1_id AND event_type = 'submit';
  PERFORM pg17_assert(v_count = 1, 'v1 submit emits exactly one audit event');

  PERFORM set_config('test.auth_uid', v_admin_id::text, true);

  PERFORM public.approve_resource(v_mm_res_id, v_mm_v1_id);
  PERFORM public.approve_resource(v_exp_res_id, v_exp_v1_id);
  PERFORM public.approve_resource(v_sum_res_id, v_sum_v1_id);
  PERFORM public.approve_resource(v_review_res_id, v_review_v1_id);
  PERFORM public.approve_resource(v_approved_res_id, v_approved_v1_id);

  -- Assert approve state for v1 mind map
  SELECT lifecycle_status, approved_version_id, current_draft_version_id, lock_version INTO v_binding
  FROM public.lesson_resources WHERE id = v_mm_res_id;
  PERFORM pg17_assert(v_binding.lifecycle_status = 'approved', 'v1 approve transitions resource to approved');
  PERFORM pg17_assert(v_binding.approved_version_id = v_mm_v1_id, 'v1 approve sets approved_version_id');
  PERFORM pg17_assert(v_binding.lock_version >= 3, 'v1 approve incremented lock');
  SELECT immutable_at INTO v_binding FROM public.lesson_resource_versions WHERE id = v_mm_v1_id;
  PERFORM pg17_assert(v_binding.immutable_at IS NOT NULL, 'v1 approve marks version immutable');
  SELECT count(*) INTO v_count FROM public.lesson_resource_reviews
  WHERE resource_id = v_mm_res_id AND resource_version_id = v_mm_v1_id AND decision = 'approved';
  PERFORM pg17_assert(v_count = 1, 'v1 approve appends review record');

  -- ============================================================
  -- V1 Publication: storage-bound atomic publish
  -- ============================================================
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_mm_res_id, v_mm_v1_id, v_mm_v1_session_id,
    'html-packages/staging/mm_v1', 'published/' || v_mm_res_id::text || '/1',
    'sha256_mm_1111111111111111111111111111111111111111111111111111111111111111',
    'promote_published', 'promoted'
  ) RETURNING id INTO v_mm_v1_op_id;

  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_exp_res_id, v_exp_v1_id, v_exp_v1_session_id,
    'html-packages/staging/exp_v1', 'published/' || v_exp_res_id::text || '/1',
    'sha256_exp_1111111111111111111111111111111111111111111111111111111111111111',
    'promote_published', 'promoted'
  ) RETURNING id INTO v_exp_v1_op_id;

  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_sum_res_id, v_sum_v1_id, v_sum_v1_session_id,
    'html-packages/staging/sum_v1', 'published/' || v_sum_res_id::text || '/1',
    'sha256_sum_1111111111111111111111111111111111111111111111111111111111111111',
    'promote_published', 'promoted'
  ) RETURNING id INTO v_sum_v1_op_id;

  PERFORM set_config('test.auth_role', 'service_role', true);
  PERFORM set_config('test.auth_uid', v_admin_id::text, true);

  -- Capture lock versions and publish via production contract (mandatory CAS)
  SELECT lock_version INTO v_lock_before FROM public.lesson_resources WHERE id = v_mm_res_id;
  PERFORM public.record_successful_resource_publication(v_mm_res_id, v_mm_v1_id, v_mm_v1_op_id, v_lock_before, v_mm_v1_session_id);

  SELECT lock_version INTO v_lock_before FROM public.lesson_resources WHERE id = v_exp_res_id;
  PERFORM public.record_successful_resource_publication(v_exp_res_id, v_exp_v1_id, v_exp_v1_op_id, v_lock_before, v_exp_v1_session_id);

  SELECT lock_version INTO v_lock_before FROM public.lesson_resources WHERE id = v_sum_res_id;
  PERFORM public.record_successful_resource_publication(v_sum_res_id, v_sum_v1_id, v_sum_v1_op_id, v_lock_before, v_sum_v1_session_id);

  -- Complete explicit V1 publication proof matrix
  PERFORM test_assert_publication_state(
    v_mm_res_id, v_mm_v1_id, v_mm_v1_id,
    (SELECT lock_version FROM public.lesson_resources WHERE id = v_mm_res_id),
    'sha256_mm_1111111111111111111111111111111111111111111111111111111111111111',
    'published/' || v_mm_res_id::text || '/1',
    1
  );
  PERFORM test_assert_publication_state(
    v_exp_res_id, v_exp_v1_id, v_exp_v1_id,
    (SELECT lock_version FROM public.lesson_resources WHERE id = v_exp_res_id),
    'sha256_exp_1111111111111111111111111111111111111111111111111111111111111111',
    'published/' || v_exp_res_id::text || '/1',
    1
  );
  PERFORM test_assert_publication_state(
    v_sum_res_id, v_sum_v1_id, v_sum_v1_id,
    (SELECT lock_version FROM public.lesson_resources WHERE id = v_sum_res_id),
    'sha256_sum_1111111111111111111111111111111111111111111111111111111111111111',
    'published/' || v_sum_res_id::text || '/1',
    1
  );

  -- ============================================================
  -- Student enumeration after V1
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
      WHEN 'test_mm_001' THEN
        PERFORM pg17_assert(v_row.resource_type = 'mind_map_html', 'test_mm_001 subtype is mind_map_html');
        PERFORM pg17_assert(v_row.version_id = v_mm_v1_id, 'test_mm_001 resolves to v1');
      WHEN 'test_exp_001' THEN
        PERFORM pg17_assert(v_row.resource_type = 'practical_experiment_html', 'test_exp_001 subtype is practical_experiment_html');
        PERFORM pg17_assert(v_row.version_id = v_exp_v1_id, 'test_exp_001 resolves to v1');
      WHEN 'test_sum_001' THEN
        PERFORM pg17_assert(v_row.resource_type = 'summary_html', 'test_sum_001 subtype is summary_html');
        PERFORM pg17_assert(v_row.version_id = v_sum_v1_id, 'test_sum_001 resolves to v1');
      ELSE
        RAISE EXCEPTION 'Unexpected resource_code in enumeration: %', v_row.resource_code;
    END CASE;
  END LOOP;

  -- Negative cases: must NOT be returned
  SELECT count(*) INTO v_count FROM public.list_published_html_resources_for_lesson(v_lesson_id)
  WHERE resource_code IN ('neg_draft', 'neg_review', 'neg_approved', 'other_mm', 'legacy_vid');
  PERFORM pg17_assert(v_count = 0, 'Negative-case resources are excluded from HTML enumeration');

  -- resolve_student_resource_binding returns canonical subtype and version
  SELECT * INTO v_binding FROM public.resolve_student_resource_binding(v_mm_res_id);
  PERFORM pg17_assert(v_binding.resource_type = 'mind_map_html', 'Student binding returns mind_map_html subtype');
  PERFORM pg17_assert(v_binding.version_id = v_mm_v1_id, 'Student binding resolves to published v1');
  PERFORM pg17_assert(v_binding.published_version_number = 1, 'Student binding version number is 1');

  -- ============================================================
  -- Unpublish V1 via production contract (creates approved baseline for V2)
  -- ============================================================
  PERFORM set_config('test.auth_uid', v_admin_id::text, true);
  SELECT lock_version INTO v_lock_before FROM public.lesson_resources WHERE id = v_mm_res_id;
  PERFORM public.unpublish_resource(v_mm_res_id, v_lock_before);

  SELECT lifecycle_status, published_version_id, approved_version_id, lock_version INTO v_binding
  FROM public.lesson_resources WHERE id = v_mm_res_id;
  PERFORM pg17_assert(v_binding.lifecycle_status = 'approved', 'Unpublish transitions to approved');
  PERFORM pg17_assert(v_binding.published_version_id IS NULL, 'Unpublish clears published_version_id');
  PERFORM pg17_assert(v_binding.approved_version_id = v_mm_v1_id, 'Unpublish preserves approved_version_id');
  SELECT immutable_at INTO v_binding FROM public.lesson_resource_versions WHERE id = v_mm_v1_id;
  PERFORM pg17_assert(v_binding.immutable_at IS NOT NULL, 'Historical v1 version remains immutable after unpublish');

  SELECT count(*) INTO v_count FROM public.list_published_html_resources_for_lesson(v_lesson_id);
  PERFORM pg17_assert(v_count = 2, 'After unpublish, only 2 HTML resources remain in enumeration');

  -- ============================================================
  -- V2 Legitimate creation (test setup fixture)
  -- Production contracts have no "create new draft" RPC; this direct UPDATE
  -- establishes a new draft version for the V2 lifecycle proof only.
  -- ============================================================
  UPDATE public.lesson_resources
  SET lifecycle_status = 'draft', current_draft_version_id = v_mm_v2_id
  WHERE id = v_mm_res_id;

  -- ============================================================
  -- V2 Trusted validation → submit → approve
  -- ============================================================
  PERFORM set_config('test.auth_uid', v_cm_id::text, true);
  PERFORM public.submit_resource_for_review(v_mm_res_id);

  SELECT lifecycle_status, current_draft_version_id INTO v_binding
  FROM public.lesson_resources WHERE id = v_mm_res_id;
  PERFORM pg17_assert(v_binding.lifecycle_status = 'in_review', 'v2 submit transitions to in_review');
  PERFORM pg17_assert(v_binding.current_draft_version_id = v_mm_v2_id, 'v2 submit binds current draft version');

  PERFORM set_config('test.auth_uid', v_admin_id::text, true);
  PERFORM public.approve_resource(v_mm_res_id, v_mm_v2_id);

  SELECT lifecycle_status, approved_version_id INTO v_binding
  FROM public.lesson_resources WHERE id = v_mm_res_id;
  PERFORM pg17_assert(v_binding.lifecycle_status = 'approved', 'v2 approve transitions to approved');
  PERFORM pg17_assert(v_binding.approved_version_id = v_mm_v2_id, 'v2 approve sets approved_version_id = v2');
  SELECT immutable_at INTO v_binding FROM public.lesson_resource_versions WHERE id = v_mm_v2_id;
  PERFORM pg17_assert(v_binding.immutable_at IS NOT NULL, 'v2 version is immutable after approve');

  -- ============================================================
  -- V2 Storage promotion proof
  -- ============================================================
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_mm_res_id, v_mm_v2_id, v_mm_v2_session_id,
    'html-packages/staging/mm_v2', 'published/' || v_mm_res_id::text || '/2',
    'sha256_mm_2222222222222222222222222222222222222222222222222222222222222222',
    'promote_published', 'promoted'
  ) RETURNING id INTO v_mm_v2_op_id;

  -- ============================================================
  -- V2 Atomic publication
  -- ============================================================
  PERFORM set_config('test.auth_role', 'service_role', true);
  PERFORM set_config('test.auth_uid', v_admin_id::text, true);
  SELECT lock_version INTO v_lock_before FROM public.lesson_resources WHERE id = v_mm_res_id;
  PERFORM public.record_successful_resource_publication(
    v_mm_res_id, v_mm_v2_id, v_mm_v2_op_id, v_lock_before, v_mm_v2_session_id
  );

  -- Complete explicit V2 publication proof matrix
  PERFORM test_assert_publication_state(
    v_mm_res_id, v_mm_v2_id, v_mm_v2_id, v_lock_before + 1,
    'sha256_mm_2222222222222222222222222222222222222222222222222222222222222222',
    'published/' || v_mm_res_id::text || '/2',
    1
  );

  -- ============================================================
  -- V1 historical proof still exists after V2 publication
  -- ============================================================
  SELECT * INTO v_binding FROM public.storage_operations
  WHERE resource_id = v_mm_res_id AND resource_version_id = v_mm_v1_id
    AND operation_type = 'promote_published' AND status = 'promoted'
    AND target_path = 'published/' || v_mm_res_id::text || '/1'
    AND expected_hash = 'sha256_mm_1111111111111111111111111111111111111111111111111111111111111111';
  PERFORM pg17_assert(v_binding.id IS NOT NULL, 'v1 historical promoted storage operation still exists');

  SELECT content_sha256, immutable_at INTO v_binding FROM public.lesson_resource_versions WHERE id = v_mm_v1_id;
  PERFORM pg17_assert(v_binding.content_sha256 = 'sha256_mm_1111111111111111111111111111111111111111111111111111111111111111', 'v1 hash unchanged after v2 publication');
  PERFORM pg17_assert(v_binding.immutable_at IS NOT NULL, 'v1 remains immutable after v2 publication');

  SELECT count(*) INTO v_count FROM public.lesson_resource_reviews
  WHERE resource_id = v_mm_res_id AND resource_version_id = v_mm_v1_id AND decision = 'approved';
  PERFORM pg17_assert(v_count = 1, 'v1 historical approved review still exists');

  -- ============================================================
  -- Student enumeration after V2
  -- ============================================================
  PERFORM set_config('test.auth_role', 'authenticated', true);
  PERFORM set_config('test.auth_uid', v_student_id::text, true);

  SELECT count(*) INTO v_count FROM public.list_published_html_resources_for_lesson(v_lesson_id);
  PERFORM pg17_assert(v_count = 3, 'After v2 publication, 3 HTML resources enumerated');

  SELECT * INTO v_binding FROM public.resolve_student_resource_binding(v_mm_res_id);
  PERFORM pg17_assert(v_binding.version_id = v_mm_v2_id, 'Student binding resolves to published v2');
  PERFORM pg17_assert(v_binding.published_version_number = 2, 'Student binding version number is 2');

  -- ============================================================
  -- Rollback V2 → V1 via production contract
  -- ============================================================
  PERFORM set_config('test.auth_role', 'authenticated', true);
  PERFORM set_config('test.auth_uid', v_admin_id::text, true);
  SELECT lock_version INTO v_lock_before FROM public.lesson_resources WHERE id = v_mm_res_id;
  PERFORM public.rollback_resource(v_mm_res_id, v_mm_v1_id, v_lock_before);

  -- Complete explicit rollback proof matrix
  PERFORM test_assert_rollback_state(
    v_mm_res_id, v_mm_v1_id, v_mm_v2_id, v_lock_before + 1,
    'sha256_mm_1111111111111111111111111111111111111111111111111111111111111111',
    'published/' || v_mm_res_id::text || '/1',
    v_mm_v2_id
  );

  -- v2 history remains preserved
  SELECT * INTO v_binding FROM public.storage_operations
  WHERE resource_id = v_mm_res_id AND resource_version_id = v_mm_v2_id
    AND operation_type = 'promote_published' AND status = 'promoted'
    AND target_path = 'published/' || v_mm_res_id::text || '/2'
    AND expected_hash = 'sha256_mm_2222222222222222222222222222222222222222222222222222222222222222';
  PERFORM pg17_assert(v_binding.id IS NOT NULL, 'v2 storage operation history preserved after rollback');

  SELECT count(*) INTO v_count FROM public.lesson_resource_reviews
  WHERE resource_id = v_mm_res_id AND resource_version_id = v_mm_v2_id AND decision = 'approved';
  PERFORM pg17_assert(v_count = 1, 'v2 approved review history preserved after rollback');

  -- ============================================================
  -- Student enumeration after rollback
  -- ============================================================
  PERFORM set_config('test.auth_role', 'authenticated', true);
  PERFORM set_config('test.auth_uid', v_student_id::text, true);

  SELECT count(*) INTO v_count FROM public.list_published_html_resources_for_lesson(v_lesson_id);
  PERFORM pg17_assert(v_count = 3, 'After rollback, all 3 HTML resources are enumerated');

  SELECT * INTO v_binding FROM public.resolve_student_resource_binding(v_mm_res_id);
  PERFORM pg17_assert(v_binding.resource_type = 'mind_map_html', 'Student binding after rollback returns mind_map_html');
  PERFORM pg17_assert(v_binding.version_id = v_mm_v1_id, 'Student binding after rollback resolves to target v1');
  PERFORM pg17_assert(v_binding.published_version_number = 1, 'Student binding version number is 1 after rollback');

  -- ============================================================
  -- Negative publication matrix
  -- ============================================================
  PERFORM set_config('test.auth_role', 'service_role', true);
  PERFORM set_config('test.auth_uid', v_admin_id::text, true);

  -- Create a valid promotion operation for the approved negative-case resource
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_approved_res_id, v_approved_v1_id, v_approved_session_id,
    'html-packages/staging/approved_v1', 'published/' || v_approved_res_id::text || '/1',
    'sha256_approved_1111111111111111111111111111111111111111111111111111111111111111',
    'promote_published', 'promoted'
  ) RETURNING id INTO v_approved_v1_op_id;

  -- Bad operations for negative tests (all point at v_approved_res_id / v_approved_v1_id where relevant)
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_other_lesson_res_id, v_other_v1_id, NULL,
    'html-packages/staging/other', 'published/' || v_other_lesson_res_id::text || '/1',
    'sha256_other_1111111111111111111111111111111111111111111111111111111111111111',
    'promote_published', 'promoted'
  ) RETURNING id INTO v_neg_wrong_res_op_id;

  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_approved_res_id, v_approved_v2_id, NULL,
    'html-packages/staging/approved_v2', 'published/' || v_approved_res_id::text || '/2',
    'sha256_approved_2222222222222222222222222222222222222222222222222222222222222222',
    'promote_published', 'promoted'
  ) RETURNING id INTO v_neg_wrong_ver_op_id;

  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_approved_res_id, v_approved_v1_id, v_approved_session_id,
    'html-packages/staging/approved_v1', 'published/' || v_approved_res_id::text || '/1',
    'sha256_mm_0000000000000000000000000000000000000000000000000000000000000000',
    'promote_published', 'promoted'
  ) RETURNING id INTO v_neg_hash_op_id;

  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_approved_res_id, v_approved_v1_id, v_approved_session_id,
    'html-packages/staging/approved_v1', 'published/evil/path',
    'sha256_approved_1111111111111111111111111111111111111111111111111111111111111111',
    'promote_published', 'promoted'
  ) RETURNING id INTO v_neg_path_op_id;

  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_approved_res_id, v_approved_v1_id, v_approved_session_id,
    'html-packages/staging/approved_v1', 'published/' || v_approved_res_id::text || '/1',
    'sha256_approved_1111111111111111111111111111111111111111111111111111111111111111',
    'promote_published', 'pending'
  ) RETURNING id INTO v_neg_status_op_id;

  -- Publication by admin role (not service_role) -> DENY
  PERFORM set_config('test.auth_role', 'authenticated', true);
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_approved_res_id, v_approved_v1_id, v_approved_v1_op_id,
      (SELECT lock_version FROM public.lesson_resources WHERE id = v_approved_res_id), v_approved_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42501' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication by non-service_role DENIED (SQLSTATE 42501)');

  PERFORM set_config('test.auth_role', 'service_role', true);

  -- Publication with NULL CAS -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_approved_res_id, v_approved_v1_id, v_approved_v1_op_id, NULL, v_approved_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '22000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication with NULL CAS DENIED (SQLSTATE 22000)');

  -- Publication with stale CAS -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_approved_res_id, v_approved_v1_id, v_approved_v1_op_id, 9999, v_approved_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '40001' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication with stale CAS DENIED (SQLSTATE 40001)');

  -- Publication with wrong-resource operation -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_approved_res_id, v_approved_v1_id, v_neg_wrong_res_op_id,
      (SELECT lock_version FROM public.lesson_resources WHERE id = v_approved_res_id), v_approved_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication with wrong-resource operation DENIED (SQLSTATE 42000)');

  -- Publication with wrong-version operation -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_approved_res_id, v_approved_v1_id, v_neg_wrong_ver_op_id,
      (SELECT lock_version FROM public.lesson_resources WHERE id = v_approved_res_id), NULL);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication with wrong-version operation DENIED (SQLSTATE 42000)');

  -- Publication with hash mismatch -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_approved_res_id, v_approved_v1_id, v_neg_hash_op_id,
      (SELECT lock_version FROM public.lesson_resources WHERE id = v_approved_res_id), v_approved_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication with hash mismatch DENIED (SQLSTATE 42000)');

  -- Publication with invalid target path -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_approved_res_id, v_approved_v1_id, v_neg_path_op_id,
      (SELECT lock_version FROM public.lesson_resources WHERE id = v_approved_res_id), v_approved_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication with invalid target_path DENIED (SQLSTATE 42000)');

  -- Publication with non-promoted operation status -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.record_successful_resource_publication(v_approved_res_id, v_approved_v1_id, v_neg_status_op_id,
      (SELECT lock_version FROM public.lesson_resources WHERE id = v_approved_res_id), v_approved_session_id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Publication with non-promoted operation status DENIED (SQLSTATE 42000)');

  -- Valid publication for approved resource after negative tests
  SELECT lock_version INTO v_lock_before FROM public.lesson_resources WHERE id = v_approved_res_id;
  PERFORM public.record_successful_resource_publication(v_approved_res_id, v_approved_v1_id, v_approved_v1_op_id, v_lock_before, v_approved_session_id);
  SELECT lifecycle_status, published_version_id INTO v_binding FROM public.lesson_resources WHERE id = v_approved_res_id;
  PERFORM pg17_assert(v_binding.lifecycle_status = 'published', 'Approved resource publishes successfully after negative matrix');
  PERFORM pg17_assert(v_binding.published_version_id = v_approved_v1_id, 'Approved resource published_version_id set');

  -- ============================================================
  -- Negative rollback matrix
  -- ============================================================
  PERFORM set_config('test.auth_role', 'authenticated', true);
  PERFORM set_config('test.auth_uid', v_admin_id::text, true);

  -- Rollback to wrong-resource target -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.rollback_resource(v_mm_res_id, v_other_v1_id,
      (SELECT lock_version FROM public.lesson_resources WHERE id = v_mm_res_id));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Rollback to wrong-resource target DENIED (SQLSTATE 42000)');

  -- Rollback to unapproved target -> DENY (v_mm_v3 has no approved review)
  v_err_caught := false;
  BEGIN
    PERFORM public.rollback_resource(v_mm_res_id, v_mm_v3_id,
      (SELECT lock_version FROM public.lesson_resources WHERE id = v_mm_res_id));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Rollback to unapproved target DENIED (SQLSTATE 42000)');

  -- Rollback to target with no promotion proof -> DENY
  -- Approve v_mm_v3 via direct historical review (negative fixture setup only),
  -- but do not create a promoted storage operation.
  INSERT INTO public.lesson_resource_reviews (resource_id, resource_version_id, reviewer_id, decision, reason)
  VALUES (v_mm_res_id, v_mm_v3_id, v_admin_id, 'approved', NULL);

  v_err_caught := false;
  BEGIN
    PERFORM public.rollback_resource(v_mm_res_id, v_mm_v3_id,
      (SELECT lock_version FROM public.lesson_resources WHERE id = v_mm_res_id));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Rollback to target without promotion proof DENIED (SQLSTATE 42000)');

  -- For the remaining rollback negative tests, disable the original valid v1
  -- promotion operation so that bad operations become the only candidates.
  UPDATE public.storage_operations SET status = 'failed' WHERE id = v_mm_v1_op_id;

  -- Rollback with hash mismatch -> DENY
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_mm_res_id, v_mm_v1_id, v_mm_v1_session_id,
    'html-packages/staging/mm_v1', 'published/' || v_mm_res_id::text || '/1',
    'sha256_mm_0000000000000000000000000000000000000000000000000000000000000000',
    'promote_published', 'promoted'
  ) RETURNING id INTO v_neg_rollback_no_op_id;

  v_err_caught := false;
  BEGIN
    PERFORM public.rollback_resource(v_mm_res_id, v_mm_v1_id,
      (SELECT lock_version FROM public.lesson_resources WHERE id = v_mm_res_id));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Rollback with hash mismatch DENIED (SQLSTATE 42000)');

  -- Rollback with invalid target path -> DENY
  UPDATE public.storage_operations SET status = 'failed'
  WHERE id = v_neg_rollback_no_op_id;
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_mm_res_id, v_mm_v1_id, v_mm_v1_session_id,
    'html-packages/staging/mm_v1', 'published/evil/path',
    'sha256_mm_1111111111111111111111111111111111111111111111111111111111111111',
    'promote_published', 'promoted'
  );

  v_err_caught := false;
  BEGIN
    PERFORM public.rollback_resource(v_mm_res_id, v_mm_v1_id,
      (SELECT lock_version FROM public.lesson_resources WHERE id = v_mm_res_id));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '42000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Rollback with invalid target_path DENIED (SQLSTATE 42000)');

  -- Restore a valid historical proof (cleaned is accepted by rollback contract)
  -- so the resource remains rollback-capable after the negative matrix.
  UPDATE public.storage_operations SET status = 'failed'
  WHERE resource_id = v_mm_res_id AND resource_version_id = v_mm_v1_id AND target_path = 'published/evil/path';
  INSERT INTO public.storage_operations (
    id, actor_id, resource_id, resource_version_id, upload_session_id,
    source_path, target_path, expected_hash, operation_type, status
  ) VALUES (
    gen_random_uuid(), v_admin_id, v_mm_res_id, v_mm_v1_id, v_mm_v1_session_id,
    'html-packages/staging/mm_v1', 'published/' || v_mm_res_id::text || '/1',
    'sha256_mm_1111111111111111111111111111111111111111111111111111111111111111',
    'promote_published', 'cleaned'
  );

  -- Rollback with stale CAS -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.rollback_resource(v_mm_res_id, v_mm_v1_id, 9999);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '40001' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Rollback with stale CAS DENIED (SQLSTATE 40001)');

  -- Rollback with NULL CAS -> DENY
  v_err_caught := false;
  BEGIN
    PERFORM public.rollback_resource(v_mm_res_id, v_mm_v1_id, NULL);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '22000' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Rollback with NULL CAS DENIED (SQLSTATE 22000)');

  -- Confirm rollback still succeeds with a cleaned historical proof
  SELECT lock_version INTO v_lock_before FROM public.lesson_resources WHERE id = v_mm_res_id;
  PERFORM public.rollback_resource(v_mm_res_id, v_mm_v1_id, v_lock_before);
  SELECT published_version_id INTO v_binding FROM public.lesson_resources WHERE id = v_mm_res_id;
  PERFORM pg17_assert(v_binding.published_version_id = v_mm_v1_id, 'Rollback with cleaned historical proof still succeeds');

  -- ============================================================
  -- Final sanity: resource code boundary still enforced
  -- ============================================================
  v_err_caught := false;
  BEGIN
    INSERT INTO public.lesson_resources (id, lesson_id, resource_type, html_resource_type, resource_code, title, url)
    VALUES (gen_random_uuid(), v_lesson_id, 'html', 'mind_map_html', '  ', 'Whitespace Code', '');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '23514' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'Whitespace-only resource_code still DENIED at boundary');

  RAISE NOTICE '=== ALL PG17 Admin→Student HTML Publication/Rollback Proof Assertions PASSED ===';
END $$;

COMMIT;
`;

  console.log("Executing PG17 Admin→Student Publication/Rollback Proof Assertions...");
  const testRun = psql(testSql, { fatal: false });
  process.stdout.write(testRun.stdout || "");
  process.stderr.write(testRun.stderr || "");

  if (testRun.status !== 0) {
    console.error("PG17 Admin→Student Publication/Rollback Proof Tests FAILED");
    process.exit(testRun.status ?? 1);
  }

  console.log(
    "SUCCESS: PG17 Admin→Student Publication/Rollback Proof Test Runner completed with 0 errors.",
  );
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
