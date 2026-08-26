#!/usr/bin/env node
/**
 * PostgreSQL 17 Local Disposable Runtime Test Runner for
 * HTML Resource Code Boundary Hardening
 *
 * Verifies at the real PostgreSQL boundary:
 *   - canonical normalization on INSERT/UPDATE
 *   - empty/whitespace denial
 *   - normalized uniqueness within lesson
 *   - cross-lesson allowance
 *   - NULL legacy allowance
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

const containerName = `pg17-html-resource-code-test-${Date.now()}`;
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

DO $$ BEGIN RAISE NOTICE '=== Starting PG17 Resource Code Boundary Hardening Test ==='; END $$;

DO $$
DECLARE
  v_lesson_id uuid := gen_random_uuid();
  v_other_lesson_id uuid := gen_random_uuid();
  v_res_id uuid;
  v_stored text;
  v_err_caught boolean;
  v_sqlstate text;
BEGIN
  INSERT INTO public.lessons (id, title, slug, sort_order) VALUES
    (v_lesson_id, 'Test Lesson', 'lesson-1', 1),
    (v_other_lesson_id, 'Other Lesson', 'lesson-2', 2);

  -- ============================================================
  -- 1. Valid canonical code is stored as-is
  -- ============================================================
  INSERT INTO public.lesson_resources (
    id, lesson_id, resource_type, html_resource_type, resource_code, title, url
  ) VALUES (
    gen_random_uuid(), v_lesson_id, 'html', 'mind_map_html', 'canonical_001', 'Canonical', ''
  ) RETURNING id INTO v_res_id;

  SELECT resource_code INTO v_stored FROM public.lesson_resources WHERE id = v_res_id;
  PERFORM pg17_assert(v_stored = 'canonical_001', 'valid canonical code stored as-is');

  -- ============================================================
  -- 2. Empty string denied
  -- ============================================================
  v_err_caught := false;
  BEGIN
    INSERT INTO public.lesson_resources (
      id, lesson_id, resource_type, html_resource_type, resource_code, title, url
    ) VALUES (
      gen_random_uuid(), v_lesson_id, 'html', 'mind_map_html', '', 'Empty Code', ''
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '23514' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'empty resource_code DENIED (check constraint)');

  -- ============================================================
  -- 3. Spaces only denied
  -- ============================================================
  v_err_caught := false;
  BEGIN
    INSERT INTO public.lesson_resources (
      id, lesson_id, resource_type, html_resource_type, resource_code, title, url
    ) VALUES (
      gen_random_uuid(), v_lesson_id, 'html', 'mind_map_html', '   ', 'Spaces Only', ''
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '23514' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'spaces-only resource_code DENIED (check constraint)');

  -- ============================================================
  -- 4. Tabs/newlines only denied
  -- ============================================================
  v_err_caught := false;
  BEGIN
    INSERT INTO public.lesson_resources (
      id, lesson_id, resource_type, html_resource_type, resource_code, title, url
    ) VALUES (
      gen_random_uuid(), v_lesson_id, 'html', 'mind_map_html', E'\t\n\r', 'Whitespace Only', ''
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '23514' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'tab/newline-only resource_code DENIED (check constraint)');

  -- ============================================================
  -- 5. Canonical normalization on INSERT
  -- ============================================================
  INSERT INTO public.lesson_resources (
    id, lesson_id, resource_type, html_resource_type, resource_code, title, url
  ) VALUES (
    gen_random_uuid(), v_lesson_id, 'html', 'practical_experiment_html', '  normalized_002  ', 'Normalized', ''
  ) RETURNING id INTO v_res_id;

  SELECT resource_code INTO v_stored FROM public.lesson_resources WHERE id = v_res_id;
  PERFORM pg17_assert(v_stored = 'normalized_002', 'whitespace-padded code normalized to canonical');

  -- ============================================================
  -- 6. Canonical normalization on UPDATE
  -- ============================================================
  UPDATE public.lesson_resources SET resource_code = '  updated_003  ' WHERE id = v_res_id;
  SELECT resource_code INTO v_stored FROM public.lesson_resources WHERE id = v_res_id;
  PERFORM pg17_assert(v_stored = 'updated_003', 'whitespace-padded code normalized on UPDATE');

  -- ============================================================
  -- 7. Exact duplicate within same lesson denied
  -- ============================================================
  v_err_caught := false;
  BEGIN
    INSERT INTO public.lesson_resources (
      id, lesson_id, resource_type, html_resource_type, resource_code, title, url
    ) VALUES (
      gen_random_uuid(), v_lesson_id, 'html', 'summary_html', 'CANONICAL_001', 'Duplicate Exact', ''
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '23505' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'exact duplicate resource_code within lesson DENIED');

  -- ============================================================
  -- 8. Normalized-equivalent duplicate within same lesson denied
  -- ============================================================
  v_err_caught := false;
  BEGIN
    INSERT INTO public.lesson_resources (
      id, lesson_id, resource_type, html_resource_type, resource_code, title, url
    ) VALUES (
      gen_random_uuid(), v_lesson_id, 'html', 'summary_html', ' canonical_001 ', 'Duplicate Normalized', ''
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE;
    IF v_sqlstate = '23505' THEN v_err_caught := true; END IF;
  END;
  PERFORM pg17_assert(v_err_caught, 'normalized-equivalent duplicate within lesson DENIED');

  -- ============================================================
  -- 9. Same code in different lesson allowed
  -- ============================================================
  INSERT INTO public.lesson_resources (
    id, lesson_id, resource_type, html_resource_type, resource_code, title, url
  ) VALUES (
    gen_random_uuid(), v_other_lesson_id, 'html', 'mind_map_html', 'canonical_001', 'Other Lesson Same Code', ''
  );
  PERFORM pg17_assert(true, 'same resource_code in different lesson ALLOWED');

  -- ============================================================
  -- 10. NULL legacy value allowed
  -- ============================================================
  INSERT INTO public.lesson_resources (
    id, lesson_id, resource_type, html_resource_type, resource_code, title, url
  ) VALUES (
    gen_random_uuid(), v_lesson_id, 'video', NULL, NULL, 'Legacy Video', 'https://example.com'
  );
  PERFORM pg17_assert(true, 'NULL resource_code legacy value ALLOWED');

  -- ============================================================
  -- 11. Multiple NULLs in same lesson allowed (partial unique index)
  -- ============================================================
  INSERT INTO public.lesson_resources (
    id, lesson_id, resource_type, html_resource_type, resource_code, title, url
  ) VALUES (
    gen_random_uuid(), v_lesson_id, 'video', NULL, NULL, 'Legacy Video 2', 'https://example.com/2'
  );
  PERFORM pg17_assert(true, 'multiple NULL resource_code in same lesson ALLOWED');

  -- ============================================================
  -- 12. Verify trigger fires before check (stored value is canonical)
  -- ============================================================
  INSERT INTO public.lesson_resources (
    id, lesson_id, resource_type, html_resource_type, resource_code, title, url
  ) VALUES (
    gen_random_uuid(), v_other_lesson_id, 'html', 'summary_html', E'\t trimmed_004 \n', 'Trigger Trim', ''
  ) RETURNING id INTO v_res_id;

  SELECT resource_code INTO v_stored FROM public.lesson_resources WHERE id = v_res_id;
  PERFORM pg17_assert(v_stored = 'trimmed_004', 'trigger normalizes tab/newline/space padded code');

  RAISE NOTICE '=== ALL PG17 Resource Code Boundary Hardening Assertions PASSED ===';
END $$;

COMMIT;
`;

  console.log("Executing PG17 Resource Code Boundary Runtime Assertions...");
  const testRun = psql(testSql, { fatal: false });
  process.stdout.write(testRun.stdout || "");
  process.stderr.write(testRun.stderr || "");

  if (testRun.status !== 0) {
    console.error("PG17 Resource Code Boundary Runtime Tests FAILED");
    process.exit(testRun.status ?? 1);
  }

  console.log("SUCCESS: PG17 Resource Code Boundary Runtime Test Runner completed with 0 errors.");
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
