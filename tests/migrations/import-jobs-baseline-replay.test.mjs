// Static checks for IMPORT-JOBS-BASELINE-MIGRATION-RECONCILIATION-19:
// duplicate public.import_jobs CREATE must not break fresh baseline replay.
// Run from the repo root with:
//   node --test tests/migrations/import-jobs-baseline-replay.test.mjs
// Text-level assertions only: no database, no network, no SQL compilation claim.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

const FIRST =
  "20260628171431_298a038b-a740-482a-9530-10cb6cb377e0.sql";
const SECOND = "20260628190000_import_jobs_foundation.sql";
const QB = "20260801120000_qb01_question_bank_schema_foundation.sql";

const FIRST_SHA =
  "3A529D4CA0D765C390BF64C0B63B25AF2F67F4D9CF24A9A1739E15FF70A7DD0D";

const REQUIRED_COLUMNS = [
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "import_type",
  "template_key",
  "original_filename",
  "file_size_bytes",
  "mime_type",
  "status",
  "mode",
  "total_rows",
  "valid_rows",
  "invalid_rows",
  "warning_rows",
  "inserted_count",
  "updated_count",
  "skipped_count",
  "started_at",
  "completed_at",
  "summary",
  "metadata",
  "error_message",
];

const REQUIRED_CONSTRAINTS = [
  "import_jobs_import_type_check",
  "import_jobs_status_check",
  "import_jobs_mode_check",
  "import_jobs_total_rows_nonneg",
  "import_jobs_valid_rows_nonneg",
  "import_jobs_invalid_rows_nonneg",
  "import_jobs_warning_rows_nonneg",
  "import_jobs_inserted_count_nonneg",
  "import_jobs_updated_count_nonneg",
  "import_jobs_skipped_count_nonneg",
  "import_jobs_file_size_nonneg",
];

const REQUIRED_INDEXES = [
  "import_jobs_created_by_idx",
  "import_jobs_status_idx",
  "import_jobs_import_type_idx",
  "import_jobs_created_at_idx",
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex").toUpperCase();
const readMigration = (name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8");
const stripSqlComments = (sql) =>
  sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

test("both historical import_jobs migration filenames/timestamps are preserved", () => {
  assert.ok(migrationFiles.includes(FIRST), `missing ${FIRST}`);
  assert.ok(migrationFiles.includes(SECOND), `missing ${SECOND}`);
  assert.match(FIRST, /^20260628171431_/);
  assert.match(SECOND, /^20260628190000_/);
});

test("CREATE TABLE public.import_jobs appears exactly once across migrations", () => {
  const creates = [];
  for (const f of migrationFiles) {
    const sql = readMigration(f);
    const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.import_jobs\b/gi;
    let m;
    while ((m = re.exec(sql)) !== null) {
      creates.push(`${f}:${sql.slice(0, m.index).split("\n").length}`);
    }
  }
  assert.equal(creates.length, 1, `expected 1 CREATE, found: ${creates.join(", ")}`);
  assert.ok(creates[0].startsWith(FIRST), `canonical creator must be ${FIRST}`);
});

test("CREATE TABLE public.import_errors appears exactly once across migrations", () => {
  const creates = [];
  for (const f of migrationFiles) {
    const sql = readMigration(f);
    const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.import_errors\b/gi;
    let m;
    while ((m = re.exec(sql)) !== null) {
      creates.push(`${f}:${sql.slice(0, m.index).split("\n").length}`);
    }
  }
  assert.equal(creates.length, 1, `expected 1 CREATE, found: ${creates.join(", ")}`);
  assert.ok(creates[0].startsWith(FIRST));
});

test("canonical creator retains required columns, constraints, indexes, RLS, and policy", () => {
  const first = readMigration(FIRST);
  assert.equal(sha256(readFileSync(join(MIGRATIONS_DIR, FIRST))), FIRST_SHA);

  for (const col of REQUIRED_COLUMNS) {
    assert.match(first, new RegExp(`\\b${col}\\b`), `missing column ${col}`);
  }
  for (const c of REQUIRED_CONSTRAINTS) {
    assert.match(first, new RegExp(`\\b${c}\\b`), `missing constraint ${c}`);
  }
  for (const idx of REQUIRED_INDEXES) {
    assert.match(first, new RegExp(`\\bCREATE INDEX ${idx}\\b`), `missing index ${idx}`);
  }
  assert.match(first, /ALTER TABLE public\.import_jobs ENABLE ROW LEVEL SECURITY;/);
  assert.match(
    first,
    /CREATE POLICY "Admins manage import jobs"\s+ON public\.import_jobs FOR ALL TO authenticated/,
  );
  assert.match(first, /CREATE TRIGGER trg_import_jobs_updated_at/);
  assert.match(
    first,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.import_jobs TO authenticated;/,
  );
  assert.match(first, /GRANT ALL ON public\.import_jobs TO service_role;/);
});

test("reconciled second migration is documentation-only (no CREATE / DROP / TRUNCATE / DML)", () => {
  const second = readMigration(SECOND);
  const code = stripSqlComments(second);
  assert.match(second, /Historical fresh-replay compatibility repair/);
  assert.doesNotMatch(code, /CREATE\s+TABLE\b/i);
  assert.doesNotMatch(code, /DROP\s+TABLE\b/i);
  assert.doesNotMatch(code, /\bTRUNCATE\b/i);
  assert.doesNotMatch(
    code,
    /\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i,
  );
  assert.doesNotMatch(code, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i);
});

test("no DROP TABLE or TRUNCATE against import_jobs in any migration", () => {
  for (const f of migrationFiles) {
    const code = stripSqlComments(readMigration(f));
    assert.doesNotMatch(code, /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?import_jobs\b/i, f);
    assert.doesNotMatch(code, /TRUNCATE\s+(?:TABLE\s+)?(?:public\.)?import_jobs\b/i, f);
  }
});

test("question bank migration is not modified by this package scope", () => {
  // QB-01 may not be present on this branch yet (still a draft under docs/).
  // This package must neither create nor rewrite it.
  const qbTouched = migrationFiles.filter(
    (f) =>
      f === QB ||
      /qb01_question_bank/i.test(f) ||
      /question_bank_schema_foundation/i.test(f),
  );
  if (qbTouched.length === 0) {
    assert.ok(true, "QB migration absent — package did not introduce it");
    return;
  }
  for (const f of qbTouched) {
    const sql = readMigration(f);
    assert.doesNotMatch(
      sql,
      /Historical fresh-replay compatibility repair/,
      `${f} must not receive import_jobs reconciliation edits`,
    );
    assert.doesNotMatch(sql, /IMPORT-JOBS-BASELINE-MIGRATION-RECONCILIATION-19/);
  }
});

test("no unexpected CREATE TABLE IF NOT EXISTS import_jobs workaround", () => {
  for (const f of migrationFiles) {
    const sql = readMigration(f);
    assert.doesNotMatch(
      sql,
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.import_jobs\b/i,
      f,
    );
  }
});
