// Static checks for CONTENT-STAFF-RBAC-BASELINE-MIGRATION-RECONCILIATION-22:
// duplicate Content staff CREATE POLICY must not break fresh baseline replay.
// Run from the repo root with:
//   node --test tests/migrations/content-staff-rbac-baseline-replay.test.mjs
// Text-level assertions only: no database, no network, no SQL compilation claim.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

const FIRST = "20260703121000_content_manager_rbac_policies.sql";
const SECOND = "20260703204450_5223b435-1a4d-44ab-ad03-ab3d9a8f4432.sql";
const IMPORT_JOBS_REPAIR = "20260628190000_import_jobs_foundation.sql";
const QB = "20260801120000_qb01_question_bank_schema_foundation.sql";

const FIRST_SHA =
  "5C8035188769A816FFDA68CBCF9345F7F8F45B5B705BD2258AE36FD3E263EEAF";

const CONTENT_STAFF_POLICIES = [
  "Content staff manage grades",
  "Content staff manage subjects",
  "Content staff manage lessons",
  "Content staff manage questions",
  "Content staff manage tracks",
  "Content staff manage governorates",
  "Content staff manage map",
  "Content staff manage units",
  "Content staff manage book contents",
  "Content staff manage explanations",
  "Content staff manage assessments",
  "Content staff manage resources",
  "Content staff manage assessment questions",
  "Content staff manage simulations",
  "Content staff manage summaries",
  "Content staff manage templates",
  "Content staff manage template questions",
  "Content staff manage import jobs",
  "Content staff manage import errors",
  "Content staff manage lesson files - select",
  "Content staff manage lesson files - insert",
  "Content staff manage lesson files - update",
  "Content staff manage lesson files - delete",
];

const READ_POLICIES = [
  "Authenticated can read active templates",
  "Authenticated can read questions of active templates",
];

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

test("both historical content-staff RBAC migration filenames/timestamps are preserved", () => {
  assert.ok(migrationFiles.includes(FIRST), `missing ${FIRST}`);
  assert.ok(migrationFiles.includes(SECOND), `missing ${SECOND}`);
  assert.match(FIRST, /^20260703121000_/);
  assert.match(SECOND, /^20260703204450_/);
});

test("canonical creator SHA is unchanged and retains is_content_staff helpers", () => {
  const firstBuf = readFileSync(join(MIGRATIONS_DIR, FIRST));
  assert.equal(sha256(firstBuf), FIRST_SHA);
  const first = firstBuf.toString("utf8");
  assert.match(first, /CREATE OR REPLACE FUNCTION public\.is_full_admin\(_user_id uuid\)/);
  assert.match(first, /CREATE OR REPLACE FUNCTION public\.is_content_staff\(_user_id uuid\)/);
  assert.match(
    first,
    /OR public\.has_role\(_user_id, 'content_manager'::public\.app_role\)/,
  );
  assert.match(first, /SELECT public\.has_role\(_user_id, 'admin'::public\.app_role\)/);
  assert.doesNotMatch(first, /'moderator'::public\.app_role/);
  assert.doesNotMatch(first, /'user'::public\.app_role/);
});

test("each Content staff policy is created exactly once across migrations", () => {
  for (const name of CONTENT_STAFF_POLICIES) {
    const hits = [];
    for (const f of migrationFiles) {
      const sql = readMigration(f);
      const n = countCreatePolicy(sql, name);
      for (let i = 0; i < n; i++) hits.push(f);
    }
    assert.equal(
      hits.length,
      1,
      `expected 1 CREATE POLICY "${name}", found: ${hits.join(", ") || "(none)"}`,
    );
    assert.equal(hits[0], FIRST, `canonical creator for "${name}" must be ${FIRST}`);
  }
});

test("exam template read policies are not recreated by the reconciled second file", () => {
  // Earlier migrations may create these names; the canonical RBAC file drops and
  // recreates the content-staff-aware form. The reconciled second file must not
  // add another CREATE POLICY for either name.
  const secondCode = stripSqlComments(readMigration(SECOND));
  for (const name of READ_POLICIES) {
    assert.equal(countCreatePolicy(readMigration(FIRST), name), 1, FIRST);
    assert.equal(countCreatePolicy(secondCode, name), 0, SECOND);
    assert.match(
      readMigration(FIRST),
      new RegExp(
        `DROP POLICY IF EXISTS "${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
      ),
    );
  }
});

test("no conflicting duplicate CREATE POLICY in the two RBAC migrations after repair", () => {
  const first = readMigration(FIRST);
  const secondCode = stripSqlComments(readMigration(SECOND));
  assert.match(first, /CREATE\s+POLICY\s+"Content staff manage grades"/i);
  assert.doesNotMatch(secondCode, /CREATE\s+POLICY\b/i);
  assert.doesNotMatch(secondCode, /CREATE\s+OR\s+REPLACE\s+FUNCTION\b/i);
  assert.doesNotMatch(secondCode, /\bGRANT\b/i);
  assert.doesNotMatch(secondCode, /\bREVOKE\b/i);
});

test("canonical policies keep is_content_staff and do not use USING (true)", () => {
  const first = readMigration(FIRST);
  assert.match(
    first,
    /CREATE POLICY "Content staff manage grades"[\s\S]*?USING \(public\.is_content_staff\(auth\.uid\(\)\)\)/,
  );
  assert.match(
    first,
    /CREATE POLICY "Content staff manage import jobs"[\s\S]*?WITH CHECK \(\s*public\.is_content_staff\(auth\.uid\(\)\)\s*AND/,
  );
  // Content-staff manage policies must not open with USING (true)
  const manageBlocks = first.match(
    /CREATE POLICY "Content staff manage [^"]+"[\s\S]*?(?=CREATE POLICY|CREATE OR REPLACE|-- =+)/g,
  );
  assert.ok(manageBlocks && manageBlocks.length >= 20);
  for (const block of manageBlocks) {
    assert.doesNotMatch(block, /USING\s*\(\s*true\s*\)/i, block.slice(0, 80));
    assert.doesNotMatch(block, /moderator/i, block.slice(0, 80));
  }
});

test("no GRANT ALL TO authenticated and no destructive DML in scoped RBAC files", () => {
  for (const f of [FIRST, SECOND]) {
    const code = stripSqlComments(readMigration(f));
    assert.doesNotMatch(code, /GRANT\s+ALL\s+ON\b[\s\S]*?\bTO\s+authenticated\b/i, f);
    assert.doesNotMatch(code, /DROP\s+TABLE\b/i, f);
    assert.doesNotMatch(code, /\bTRUNCATE\b/i, f);
    assert.doesNotMatch(
      code,
      /\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i,
      f,
    );
  }
});

test("reconciled second migration is documentation-only no-op", () => {
  const second = readMigration(SECOND);
  const code = stripSqlComments(second);
  assert.match(second, /Historical fresh-replay compatibility repair/);
  assert.match(second, /CONTENT-STAFF-RBAC-BASELINE-MIGRATION-RECONCILIATION-22/);
  assert.match(second, /5966098F6D18119CE454CA0849E43A36ABD7E6342E67AB48078C1EA1F510A789/);
  assert.doesNotMatch(code, /CREATE\s+POLICY\b/i);
  assert.doesNotMatch(code, /DROP\s+POLICY\b/i);
  assert.doesNotMatch(code, /CREATE\s+POLICY\s+IF\s+NOT\s+EXISTS/i);
  assert.doesNotMatch(code, /ALTER\s+TABLE\b/i);
  assert.equal(code.replace(/\s+/g, "").length, 0, "second file must have no executable SQL");
});

test("import_jobs baseline repair remains present on this branch", () => {
  assert.ok(migrationFiles.includes(IMPORT_JOBS_REPAIR));
  const repair = readMigration(IMPORT_JOBS_REPAIR);
  assert.match(repair, /IMPORT-JOBS-BASELINE-MIGRATION-RECONCILIATION-19/);
  assert.match(repair, /Historical fresh-replay compatibility repair/);
  const code = stripSqlComments(repair);
  assert.doesNotMatch(code, /CREATE\s+TABLE\b/i);
});

test("question bank executable migration is absent from this branch", () => {
  const qbTouched = migrationFiles.filter(
    (f) =>
      f === QB ||
      /qb01_question_bank/i.test(f) ||
      /question_bank_schema_foundation/i.test(f),
  );
  assert.equal(qbTouched.length, 0, `QB migration must not be present: ${qbTouched.join(", ")}`);
});

test("no CREATE POLICY IF NOT EXISTS workaround in executable RBAC SQL", () => {
  for (const f of [FIRST, SECOND]) {
    const code = stripSqlComments(readMigration(f));
    assert.doesNotMatch(code, /CREATE\s+POLICY\s+IF\s+NOT\s+EXISTS/i, f);
  }
});
