/**
 * Structural contract tests for CONTENT_HTML_DB_RLS_FOUNDATION_IMPLEMENTATION_01
 * Run with: node --test tests/migrations/content-html-db-rls-foundation.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const MIGRATION_FILE = "20260806050000_content_html_db_rls_foundation.sql";

const migrationSql = readFileSync(join(MIGRATIONS_DIR, MIGRATION_FILE), "utf8");

test("migration file exists and is additive", () => {
  assert.ok(migrationSql.length > 0, "Migration file must not be empty");
  assert.doesNotMatch(migrationSql, /DROP\s+TABLE\s+lesson_resources/i, "Must not drop table lesson_resources");
  assert.doesNotMatch(migrationSql, /DROP\s+TABLE\s+IF\s+EXISTS\s+lesson_resources/i, "Must not drop table lesson_resources");
  assert.doesNotMatch(migrationSql, /\bCASCADE\b/i, "Must not use CASCADE in migration");
});

test("no wide revoke on all functions in schema public", () => {
  assert.doesNotMatch(
    migrationSql,
    /REVOKE\s+ALL\s+ON\s+ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+public/i,
    "Must not use broad REVOKE ALL ON ALL FUNCTIONS",
  );
});

test("drops permissive historical policies by exact name", () => {
  assert.match(
    migrationSql,
    /DROP\s+POLICY\s+IF\s+EXISTS\s+"Resources viewable per lesson access"\s+ON\s+public\.lesson_resources/i,
  );
  assert.match(
    migrationSql,
    /DROP\s+POLICY\s+IF\s+EXISTS\s+"Content staff manage resources"\s+ON\s+public\.lesson_resources/i,
  );
  assert.match(
    migrationSql,
    /DROP\s+POLICY\s+IF\s+EXISTS\s+"Admins manage resources"\s+ON\s+public\.lesson_resources/i,
  );
});

test("enforces composite same-resource integrity on lesson_resources", () => {
  assert.match(migrationSql, /lesson_resources_draft_version_fk/i);
  assert.match(migrationSql, /lesson_resources_approved_version_fk/i);
  assert.match(migrationSql, /lesson_resources_published_version_fk/i);
  assert.match(
    migrationSql,
    /FOREIGN\s+KEY\s*\(\s*id\s*,\s*published_version_id\s*\)\s*REFERENCES\s+public\.lesson_resource_versions\s*\(\s*resource_id\s*,\s*id\s*\)/i,
  );
});

test("server-only validation function grants", () => {
  const line = migrationSql
    .split("\n")
    .find((l) => l.includes("GRANT EXECUTE ON FUNCTION public.record_server_validation"));
  assert.ok(line, "record_server_validation GRANT line must exist");
  assert.match(line, /TO\s+service_role/i);
  assert.doesNotMatch(line, /authenticated/i);
  assert.doesNotMatch(line, /anon/i);
});

test("student published-only RLS policy with feature flag check", () => {
  assert.match(
    migrationSql,
    /CREATE\s+POLICY\s+"Students can read published lesson resources"[\s\S]*?USING\s*\(\s*lifecycle_status\s*=\s*'published'/i,
  );
  assert.match(
    migrationSql,
    /public\.is_content_feature_enabled\('html_content_student_read'\)/i,
  );
});

test("storage operations transition triggers and rules", () => {
  assert.match(migrationSql, /trg_storage_operations_rules/i);
  assert.match(migrationSql, /trg_storage_operations_retry/i);
  assert.match(migrationSql, /DELETE on storage_operations is strictly prohibited/i);
});

test("feature flags default to false", () => {
  assert.match(migrationSql, /\('html_content_backend',\s*false/i);
  assert.match(migrationSql, /\('html_content_upload',\s*false/i);
  assert.match(migrationSql, /\('html_content_publish',\s*false/i);
  assert.match(migrationSql, /\('html_content_student_read',\s*false/i);
});
