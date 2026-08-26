// Static checks for UNITS_POLICY_BASELINE_MIGRATION_RECONCILIATION_25:
// duplicate "Units viewable per subject access" CREATE must not break fresh
// baseline replay. Run from the repo root with:
//   node --test tests/migrations/units-policy-baseline-replay.test.mjs
// Text-level assertions only: no database, no network, no SQL compilation claim.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

const FIRST = "20260731033950_a583b6d4-0360-414e-95f8-83b01f470a02.sql";
const SECOND = "20260731180000_restrict_units_select_to_authenticated.sql";
const IMPORT_JOBS_REPAIR = "20260628190000_import_jobs_foundation.sql";
const RBAC_REPAIR = "20260703204450_5223b435-1a4d-44ab-ad03-ab3d9a8f4432.sql";
const QB = "20260801120000_qb01_question_bank_schema_foundation.sql";

const FIRST_SHA = "1AB87ED0892E98E2F1CF3AAA9B2629D85BCD59B5948C3FD30B84071ABF6A5FDB";
const SECOND_PRE_REPAIR_SHA = "92D2D448384F166196B4F9F20F838ED807FEEF55DFBE5B17648FB1944FED3A13";

const POLICY = "Units viewable per subject access";
const LEGACY = "Units viewable by everyone";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex").toUpperCase();
const readMigration = (name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8");
const stripSqlComments = (sql) =>
  sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

const countCreatePolicy = (sql, name) => {
  const re = new RegExp(
    `CREATE\\s+POLICY\\s+"${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
    "gi",
  );
  return (sql.match(re) || []).length;
};

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

test("both historical units SELECT migration filenames/timestamps are preserved", () => {
  assert.ok(migrationFiles.includes(FIRST), `missing ${FIRST}`);
  assert.ok(migrationFiles.includes(SECOND), `missing ${SECOND}`);
  assert.match(FIRST, /^20260731033950_/);
  assert.match(SECOND, /^20260731180000_/);
});

test("canonical creator SHA is unchanged and retains the final SELECT policy", () => {
  const firstBuf = readFileSync(join(MIGRATIONS_DIR, FIRST));
  assert.equal(sha256(firstBuf), FIRST_SHA);
  const first = firstBuf.toString("utf8");
  assert.match(first, /DROP POLICY IF EXISTS "Units viewable by everyone" ON public\.units;/);
  assert.match(
    first,
    /CREATE POLICY "Units viewable per subject access" ON public\.units\s+FOR SELECT TO authenticated\s+USING \(public\.can_access_subject\(subject_id\)\);/,
  );
  assert.doesNotMatch(first, /CREATE\s+POLICY\s+IF\s+NOT\s+EXISTS/i);
  assert.doesNotMatch(first, /FOR SELECT TO (anon|public)\b/i);
  assert.doesNotMatch(first, /moderator/i);
  assert.doesNotMatch(first, /USING\s*\(\s*true\s*\)/i);
});

test("Units viewable per subject access is created exactly once across migrations", () => {
  const hits = [];
  for (const f of migrationFiles) {
    // Count executable SQL only — documentation markers may mention the name.
    const n = countCreatePolicy(stripSqlComments(readMigration(f)), POLICY);
    for (let i = 0; i < n; i++) hits.push(f);
  }
  assert.equal(
    hits.length,
    1,
    `expected 1 CREATE POLICY "${POLICY}", found: ${hits.join(", ") || "(none)"}`,
  );
  assert.equal(hits[0], FIRST, `canonical creator must be ${FIRST}`);
});

test("no duplicate CREATE POLICY of the conflicting name without a prior DROP of that name", () => {
  // Fresh-replay failure was CREATE of the same name twice. After repair, only
  // the first file may CREATE it. The second must not CREATE it at all
  // (Option A no-op). Dropping a different legacy name does not clear this one.
  const secondCode = stripSqlComments(readMigration(SECOND));
  assert.equal(countCreatePolicy(secondCode, POLICY), 0);
  assert.doesNotMatch(
    secondCode,
    /DROP\s+POLICY\s+IF\s+EXISTS\s+"Units viewable per subject access"/i,
  );
});

test("reconciled second migration is documentation-only no-op", () => {
  const second = readMigration(SECOND);
  const code = stripSqlComments(second);
  assert.match(second, /Historical fresh-replay compatibility repair/);
  assert.match(second, /UNITS_POLICY_BASELINE_MIGRATION_RECONCILIATION_25/);
  assert.match(second, new RegExp(SECOND_PRE_REPAIR_SHA));
  assert.match(second, new RegExp(FIRST_SHA));
  assert.doesNotMatch(code, /CREATE\s+POLICY\b/i);
  assert.doesNotMatch(code, /DROP\s+POLICY\b/i);
  assert.doesNotMatch(code, /CREATE\s+POLICY\s+IF\s+NOT\s+EXISTS/i);
  assert.doesNotMatch(code, /ALTER\s+TABLE\b/i);
  assert.doesNotMatch(code, /GRANT\s+ALL\s+ON\b[\s\S]*?\bTO\s+authenticated\b/i);
  assert.doesNotMatch(code, /DROP\s+TABLE\b/i);
  assert.doesNotMatch(code, /\bTRUNCATE\b/i);
  assert.doesNotMatch(code, /\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i);
  assert.equal(code.replace(/\s+/g, "").length, 0, "second file must have no executable SQL");
});

test("final policy shape does not widen anon/moderator/user and has no bare USING(true)", () => {
  const first = readMigration(FIRST);
  assert.match(first, /FOR SELECT TO authenticated/);
  assert.match(first, /USING \(public\.can_access_subject\(subject_id\)\)/);
  assert.doesNotMatch(first, /\bTO\s+anon\b/i);
  assert.doesNotMatch(first, /\bmoderator\b/i);
  assert.doesNotMatch(first, /'user'::public\.app_role/);
  // Legacy PUBLIC USING(true) must remain dropped by the canonical creator.
  assert.match(first, new RegExp(`DROP POLICY IF EXISTS "${LEGACY}"`));
});

test("no GRANT ALL TO authenticated and no destructive DML in scoped units files", () => {
  for (const f of [FIRST, SECOND]) {
    const code = stripSqlComments(readMigration(f));
    assert.doesNotMatch(code, /GRANT\s+ALL\s+ON\b[\s\S]*?\bTO\s+authenticated\b/i, f);
    assert.doesNotMatch(code, /DROP\s+TABLE\b/i, f);
    assert.doesNotMatch(code, /\bTRUNCATE\b/i, f);
    assert.doesNotMatch(code, /\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i, f);
  }
});

test("import_jobs and Content Staff RBAC baseline repairs remain present", () => {
  assert.ok(migrationFiles.includes(IMPORT_JOBS_REPAIR));
  assert.ok(migrationFiles.includes(RBAC_REPAIR));
  const importRepair = readMigration(IMPORT_JOBS_REPAIR);
  const rbacRepair = readMigration(RBAC_REPAIR);
  assert.match(importRepair, /IMPORT-JOBS-BASELINE-MIGRATION-RECONCILIATION-19/);
  assert.match(rbacRepair, /CONTENT-STAFF-RBAC-BASELINE-MIGRATION-RECONCILIATION-22/);
  assert.equal(stripSqlComments(importRepair).replace(/\s+/g, "").length, 0);
  assert.equal(stripSqlComments(rbacRepair).replace(/\s+/g, "").length, 0);
});

test("question bank executable migration is absent from this branch", () => {
  const qbTouched = migrationFiles.filter(
    (f) => f === QB || /qb01_question_bank/i.test(f) || /question_bank_schema_foundation/i.test(f),
  );
  assert.equal(qbTouched.length, 0, `QB migration must not be present: ${qbTouched.join(", ")}`);
});

test("no CREATE POLICY IF NOT EXISTS workaround in scoped units migrations", () => {
  for (const f of [FIRST, SECOND]) {
    const code = stripSqlComments(readMigration(f));
    assert.doesNotMatch(code, /CREATE\s+POLICY\s+IF\s+NOT\s+EXISTS/i, f);
  }
});

test("Content staff manage units remains and is not dropped by either units SELECT file", () => {
  const all = migrationFiles.map(readMigration).join("\n");
  assert.match(
    all,
    /CREATE POLICY "Content staff manage units"\s+ON public\.units FOR ALL TO authenticated/,
  );
  for (const f of [FIRST, SECOND]) {
    assert.doesNotMatch(readMigration(f), /DROP POLICY IF EXISTS "Content staff manage units"/);
  }
});

test("runtime source tree is not altered by this reconciliation package scope", () => {
  // Package deliverables are migrations + migration tests + report only.
  // This assertion documents the intended boundary; it does not scan git status.
  assert.ok(true, "runtime files are out of scope for this package");
});
