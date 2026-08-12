#!/usr/bin/env node
/**
 * IMPORT_NON_PROD_MIGRATION_INDEPENDENT_REVIEW_04
 *
 * Apply / rebuild rehearsal for
 *   supabase/migrations-pending/20260813010000_import_staging_and_execution_03.sql
 *
 * Runs on a disposable local PostgreSQL 17 cluster. It never connects to any
 * remote database and refuses to run when a Supabase project link is present.
 *
 * Scenarios:
 *   A. baseline (exact current managed-DB shape) + pending migration
 *      → DDL applies, but the resources path fails at runtime because
 *        lesson_resources.resource_code does not exist yet (finding H-1).
 *   B. baseline + content-html prerequisite delta + pending migration
 *      → apply PASS, second apply PASS (idempotent), runtime smoke PASS.
 *   C. rebuild rehearsal: drop everything, rebuild from zero, apply again → PASS.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const fixtures = join(__dirname, "fixtures");

const BASELINE = join(fixtures, "pg17-baseline-schema.sql");
const PREREQ = join(fixtures, "pg17-prereq-resource-code.sql");
const SMOKE = join(fixtures, "pg17-runtime-smoke.sql");
const PENDING = join(
  root,
  "supabase",
  "migrations-pending",
  "20260813010000_import_staging_and_execution_03.sql",
);

if (existsSync(join(root, "supabase", ".temp", "project-ref"))) {
  console.error("REFUSED: supabase/.temp/project-ref present (remote link)");
  process.exit(2);
}
for (const f of [BASELINE, PREREQ, SMOKE, PENDING]) {
  if (!existsSync(f)) {
    console.error(`Missing required file: ${f}`);
    process.exit(1);
  }
}

const dataDir = mkdtempSync(join(tmpdir(), "pg17-import03-"));
const sock = mkdtempSync(join(tmpdir(), "pg17-sock-"));
let started = false;
const results = [];

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}

function psql(db, args) {
  return run("psql", ["-h", sock, "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", ...args]);
}

function expectOk(label, res) {
  if (res.status !== 0) {
    results.push([label, "FAIL"]);
    console.error(`\n[FAIL] ${label}\n${res.stderr || res.stdout}`);
    return false;
  }
  results.push([label, "PASS"]);
  console.log(`[PASS] ${label}`);
  return true;
}

function expectFail(label, res, needle) {
  const out = `${res.stdout}\n${res.stderr}`;
  if (res.status === 0 || !out.includes(needle)) {
    results.push([label, "FAIL"]);
    console.error(`\n[FAIL] ${label} (expected failure containing "${needle}")\n${out}`);
    return false;
  }
  results.push([label, "PASS"]);
  console.log(`[PASS] ${label} — failed as expected on "${needle}"`);
  return true;
}

try {
  let r = run("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "-E", "UTF8"]);
  if (r.status !== 0) {
    console.error("initdb failed:", r.stderr || r.stdout);
    process.exit(1);
  }
  r = run("pg_ctl", ["-D", dataDir, "-o", `-k ${sock} -h ''`, "-w", "-l", join(dataDir, "pg.log"), "start"]);
  if (r.status !== 0) {
    console.error("pg_ctl start failed:", r.stderr || r.stdout);
    process.exit(1);
  }
  started = true;

  // ---------------------------------------------------------------- Scenario A
  run("createdb", ["-h", sock, "-U", "postgres", "rehearsal_a"]);
  expectOk("A1 baseline (current managed-DB shape) applies", psql("rehearsal_a", ["-f", BASELINE]));
  expectOk("A2 pending migration applies on baseline (DDL only)", psql("rehearsal_a", ["-f", PENDING]));
  expectFail(
    "A3 anonymous/unowned execute is refused before any resolution (fail-closed)",
    psql("rehearsal_a", [
      "-c",
      `DO $$ BEGIN PERFORM public.import_execute_template(gen_random_uuid(),'resources'); END $$;`,
    ]),
    "NOT_AUTHORIZED",
  );
  expectFail(
    "A4 authorized resources execute breaks on missing lesson_resources.resource_code (finding H-1)",
    psql("rehearsal_a", ["-f", SMOKE]),
    "resource_code",
  );


  // ---------------------------------------------------------------- Scenario B
  run("createdb", ["-h", sock, "-U", "postgres", "rehearsal_b"]);
  expectOk("B1 baseline applies", psql("rehearsal_b", ["-f", BASELINE]));
  expectOk("B2 content-html prerequisite delta applies", psql("rehearsal_b", ["-f", PREREQ]));
  expectOk("B3 pending migration applies on the complete chain", psql("rehearsal_b", ["-f", PENDING]));
  expectOk("B4 pending migration is re-appliable (idempotent)", psql("rehearsal_b", ["-f", PENDING]));

  const objectCheck = psql("rehearsal_b", [
    "-tA",
    "-c",
    `SELECT
       (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('import_staging_rows','content_review_state')) = 2
   AND (SELECT bool_and(rowsecurity) FROM pg_tables WHERE schemaname='public' AND tablename IN ('import_staging_rows','content_review_state'))
   AND (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('import_staging_rows','content_review_state') AND cmd <> 'SELECT') = 0
   AND (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='anon' AND table_name IN ('import_staging_rows','content_review_state')) = 0
   AND (SELECT bool_and(p.proconfig::text LIKE '%search_path=public, pg_temp%')
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname IN
           ('import_stage_rows','import_execute_template','import_finalize_job',
            'content_review_set_state','assert_import_job_operator','import_touch_review_state'))
   AND (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
         WHERE NOT t.tgisinternal AND t.tgname LIKE 'trg_cleanup_review_state_%') = 6;`,
  ]);
  const ok = objectCheck.status === 0 && objectCheck.stdout.trim() === "t";
  results.push(["B5 objects, RLS, grants, search_path, cleanup triggers", ok ? "PASS" : "FAIL"]);
  console.log(`[${ok ? "PASS" : "FAIL"}] B5 objects, RLS, grants, search_path, cleanup triggers`);
  if (!ok) console.error(objectCheck.stdout || objectCheck.stderr);

  const smoke = psql("rehearsal_b", ["-f", SMOKE]);
  expectOk("B6 runtime smoke (idempotency, blocked-publish, atomicity, RBAC)", smoke);
  if (smoke.status === 0) console.log(smoke.stderr.trim());

  // ---------------------------------------------------------------- Scenario C
  run("createdb", ["-h", sock, "-U", "postgres", "rehearsal_c"]);
  expectOk("C1 fresh rebuild: baseline + prerequisite", psql("rehearsal_c", ["-f", BASELINE]));
  expectOk("C2 fresh rebuild: prerequisite", psql("rehearsal_c", ["-f", PREREQ]));
  expectOk("C3 fresh rebuild: pending migration", psql("rehearsal_c", ["-f", PENDING]));
  expectOk(
    "C4 teardown rehearsal (DROP SCHEMA public CASCADE)",
    psql("rehearsal_c", ["-c", "DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA auth CASCADE;"]),
  );
  expectOk("C5 rebuild after teardown: baseline", psql("rehearsal_c", ["-f", BASELINE]));
  expectOk("C6 rebuild after teardown: prerequisite", psql("rehearsal_c", ["-f", PREREQ]));
  expectOk("C7 rebuild after teardown: pending migration", psql("rehearsal_c", ["-f", PENDING]));
} finally {
  if (started) run("pg_ctl", ["-D", dataDir, "-m", "immediate", "-w", "stop"]);
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(sock, { recursive: true, force: true });
}

const failed = results.filter(([, s]) => s === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
