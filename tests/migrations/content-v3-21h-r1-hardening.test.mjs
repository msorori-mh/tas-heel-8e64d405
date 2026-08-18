import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, root), "utf8");
const diff = read("scripts/content-v3/visibility-diff-21h.sql");
const preflight = read("scripts/content-v3/production-preflight-readonly.sql");
const postverify = read("scripts/content-v3/postverify-21h.sql");
const migration = read("supabase/migrations-pending/20260818210000_content_v3_21h_hardened_preflight.sql");
const runner = new URL("scripts/content-v3/pg17-runner.ps1", root).pathname.replace(/^\//, "").replaceAll("/", "\\");

function classify({ before, expected, observed, security = false }) {
  if (before && expected && observed) return "UNCHANGED";
  if (!expected && observed) return "UNEXPECTED_GAIN";
  if (!before && expected && observed) return "EXPECTED_GAIN";
  if (before && !expected && !observed && security) return "SECURITY_FIX";
  if (before && !expected) return "UNEXPECTED_LOSS";
  if (!before && expected && !observed) return "UNEXPECTED_LOSS";
  return "UNCHANGED";
}

function runRunner(target) {
  const shell = process.env.ComSpec
    ? `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
    : "pwsh";
  return spawnSync(shell, [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", runner,
    "-DatabaseUrl", target,
  ], {
    encoding: "utf8",
    env: { ...process.env, Path: `${process.env.SystemRoot ?? "C:\\Windows"}\\System32` },
  });
}

test("visibility diff detects an expected gain", () => {
  assert.equal(classify({ before: false, expected: true, observed: true }), "EXPECTED_GAIN");
  assert.match(diff, /EXPECTED_GAIN/);
});

test("visibility diff detects an unexpected gain from the snapshot exception", () => {
  assert.equal(classify({ before: true, expected: false, observed: true }), "UNEXPECTED_GAIN");
  assert.match(diff, /status IN \('DRAFT', 'REVIEW'\).*snapshot_present/s);
});

test("visibility diff detects an unexpected loss", () => {
  assert.equal(classify({ before: true, expected: false, observed: false }), "UNEXPECTED_LOSS");
  assert.match(diff, /UNEXPECTED_LOSS_COUNT/);
});

test("visibility diff preserves the unchanged case", () => {
  assert.equal(classify({ before: true, expected: true, observed: true }), "UNCHANGED");
  assert.match(diff, /'UNCHANGED'/);
});

test("security fixes are distinct from unexplained losses", () => {
  assert.equal(classify({ before: true, expected: false, observed: false, security: true }), "SECURITY_FIX");
  assert.match(diff, /SECURITY_FIX/);
});

test("20C duplicate state is a hard preflight finding", () => {
  assert.match(preflight, /duplicate_lifecycle_keys/);
  assert.match(preflight, /duplicate_or_overlapping_20C_relations/);
  assert.match(preflight, /duplicate_20C_migration_history/);
  assert.match(preflight, /STOP_PRODUCTION_STATE_INCOMPATIBLE/);
});

test("20C incompatible function signatures and definitions are inspected", () => {
  assert.match(preflight, /lesson_capability_transition\(uuid,text,text,jsonb,text\)/);
  assert.match(preflight, /actual_definition/);
  assert.match(preflight, /transition_function_overloaded/);
});

test("orphan and invalid lesson-capability rows are detected", () => {
  assert.match(preflight, /orphan_or_invalid_lesson_capability_rows/);
  assert.match(postverify, /orphan lifecycle row/);
});

test("READY applicability semantics distinguish REQUIRED, OPTIONAL, and NA", () => {
  assert.match(diff, /applicability <> 'NA'/);
  assert.match(migration, /'REQUIRED'/);
  assert.match(migration, /'OPTIONAL'/);
  assert.match(migration, /'NA'/);
});

test("DRAFT and REVIEW are denied even when a ready snapshot exists", () => {
  assert.match(migration, /lcl\.status <> 'READY'/);
  assert.match(diff, /status IN \('DRAFT', 'REVIEW'\) AND snapshot_present/);
  assert.match(postverify, /DRAFT','REVIEW/);
});

test("N/A is excluded from student visibility and final capability", () => {
  assert.match(diff, /applicability = 'NA'/);
  assert.match(postverify, /legacy reference capability is final/);
  assert.match(postverify, /NA row is READY/);
});

test("missing companion answers remain a separate revealability condition", () => {
  assert.match(migration, /ANSWER_NOT_AVAILABLE/);
  assert.match(migration, /a\.revision_id = v_revision/);
  assert.match(postverify, /answer revision pin broken/);
});

test("pinned revisions and unpublished revisions are protected", () => {
  assert.match(migration, /r\.status = 'PUBLISHED'/);
  assert.match(migration, /question_revision_id/);
  assert.match(migration, /paq\.question_revision_id/);
  assert.match(diff, /r\.status = 'PUBLISHED'/);
});

test("RPC and snapshot semantics use one strict READY contract", () => {
  assert.match(migration, /status <> 'READY' OR lcl\.applicability = 'NA'/);
  assert.match(diff, /status = 'READY' AND applicability <> 'NA'/);
  assert.match(postverify, /visibility_runtime_gate/);
});

test("localhost is accepted by the PG17 guard", () => {
  const result = runRunner("postgresql://localhost:5432/tamkeen");
  assert.match(`${result.stdout}${result.stderr}`, /PG17_TARGET_CLASS=LOCAL_ONLY/);
});

test("127.0.0.1 is accepted by the PG17 guard", () => {
  const result = runRunner("postgresql://127.0.0.1:5432/tamkeen");
  assert.match(`${result.stdout}${result.stderr}`, /PG17_TARGET_CLASS=LOCAL_ONLY/);
});

test("::1 is accepted by the PG17 guard", () => {
  const result = runRunner("postgresql://[::1]:5432/tamkeen");
  assert.match(`${result.stdout}${result.stderr}`, /PG17_TARGET_CLASS=LOCAL_ONLY/);
});

test("remote hostname is rejected before psql lookup", () => {
  const result = runRunner("postgresql://db.example.com:5432/tamkeen");
  assert.match(`${result.stdout}${result.stderr}`, /STOP_NON_LOCAL_DATABASE_TARGET/);
});

test("Supabase host is rejected before psql lookup", () => {
  const result = runRunner("postgresql://postgres.abcdefghijklmnop.supabase.co:5432/postgres");
  assert.match(`${result.stdout}${result.stderr}`, /STOP_NON_LOCAL_DATABASE_TARGET/);
});

test("ambiguous target and locality-looking query text are rejected", () => {
  const queryTextRemote = runRunner("postgresql://db.example.com:5432/postgres?note=localhost");
  const noHost = runRunner("dbname=tamkeen options=localhost");
  assert.match(`${queryTextRemote.stdout}${queryTextRemote.stderr}`, /STOP_NON_LOCAL_DATABASE_TARGET/);
  assert.match(`${noHost.stdout}${noHost.stderr}`, /STOP_NON_LOCAL_DATABASE_TARGET/);
});

test("PG17 guard emits its fail-closed locality contract", () => {
  const source = read("scripts/content-v3/pg17-runner.ps1");
  assert.match(source, /PG17_TARGET_CLASS=LOCAL_ONLY/);
  assert.match(source, /STOP_NON_LOCAL_DATABASE_TARGET/);
  assert.match(source, /localhost.*127\.0\.0\.1.*::1/s);
});
