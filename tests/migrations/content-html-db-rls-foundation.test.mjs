/**
 * Structural contract tests for CONTENT_HTML_DB_RLS_FOUNDATION_CORRECTION_03
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

test("migration file exists and is non-destructive", () => {
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

test("explicit REVOKE ALL ON FUNCTION FROM PUBLIC for security definer functions", () => {
  const functionsToRevoke = [
    "is_content_feature_enabled",
    "validate_staging_path",
    "resolve_upload_session",
    "record_server_validation",
    "get_valid_server_validation",
    "resolve_promotion_binding",
    "resolve_student_resource_binding",
    "fetch_published_lesson_resources",
    "claim_idempotency_key",
    "complete_idempotency_key",
    "fail_idempotency_key",
  ];

  for (const fn of functionsToRevoke) {
    const pattern = new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${fn}[\\s\\S]*?FROM\\s+PUBLIC`, "i");
    assert.match(migrationSql, pattern, `Function ${fn} must explicitly REVOKE FROM PUBLIC`);
  }
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

test("enforces composite same-resource integrity on lesson_resources and validation", () => {
  assert.match(migrationSql, /lesson_resources_draft_version_fk/i);
  assert.match(migrationSql, /lesson_resources_approved_version_fk/i);
  assert.match(migrationSql, /lesson_resources_published_version_fk/i);
  assert.match(
    migrationSql,
    /FOREIGN\s+KEY\s*\(\s*id\s*,\s*published_version_id\s*\)\s*REFERENCES\s+public\.lesson_resource_versions\s*\(\s*resource_id\s*,\s*id\s*\)/i,
  );
  assert.match(
    migrationSql,
    /CONSTRAINT\s+content_package_validations_session_composite_fk[\s\S]*?FOREIGN\s+KEY\s*\(\s*upload_session_id\s*,\s*resource_id\s*\)/i,
  );
  assert.match(
    migrationSql,
    /CONSTRAINT\s+content_package_validations_version_composite_fk[\s\S]*?FOREIGN\s+KEY\s*\(\s*resource_version_id\s*,\s*resource_id\s*\)/i,
  );
});

test("upload session actor equals import batch actor constraint and path safety", () => {
  assert.match(migrationSql, /enforce_upload_session_actor_matches_batch/i);
  assert.match(migrationSql, /validate_staging_path/i);
  assert.match(migrationSql, /html-packages\/staging\//i);
});

test("server-only validation function grants and binding checks", () => {
  const line = migrationSql
    .split("\n")
    .find((l) => l.includes("GRANT EXECUTE ON FUNCTION public.record_server_validation"));
  assert.ok(line, "record_server_validation GRANT line must exist");
  assert.match(line, /TO\s+service_role/i);
  assert.doesNotMatch(line, /authenticated/i);
  assert.doesNotMatch(line, /anon/i);
});

test("no latest or COALESCE empty fallback in resolve_promotion_binding", () => {
  const fnMatch = migrationSql.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.resolve_promotion_binding[\s\S]*?\$\$;/i);
  assert.ok(fnMatch, "resolve_promotion_binding function definition must exist");
  const fnBody = fnMatch[0];

  assert.doesNotMatch(
    fnBody,
    /COALESCE\(\s*v_session\.staging_path\s*,\s*''\s*\)/i,
    "resolve_promotion_binding must not use COALESCE empty fallback for staging_path",
  );
  assert.match(
    fnBody,
    /Must provide exactly one of p_upload_session_id or p_resource_version_id/i,
    "resolve_promotion_binding must require exact explicit identifier",
  );
  assert.match(
    fnBody,
    /approved_version_id\s*<>\s*v_version\.id/i,
    "resolve_promotion_binding must explicitly verify approved_version_id = version.id",
  );
  assert.doesNotMatch(
    fnBody,
    /'in_review'/i,
    "resolve_promotion_binding must not accept in_review lifecycle_status",
  );
});

test("student fetch explicitly checks html_content_student_read feature flag", () => {
  const fetchFnMatch = migrationSql.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fetch_published_lesson_resources[\s\S]*?\$\$;/i);
  assert.ok(fetchFnMatch, "fetch_published_lesson_resources function definition must exist");
  const fetchFnBody = fetchFnMatch[0];

  assert.match(
    fetchFnBody,
    /public\.is_content_feature_enabled\('html_content_student_read'\)/i,
    "fetch_published_lesson_resources must explicitly check html_content_student_read flag",
  );
});

test("storage operations transition rules and retry parent failed contract", () => {
  assert.match(migrationSql, /trg_storage_operations_rules/i);
  assert.match(migrationSql, /trg_storage_operations_retry/i);
  assert.match(migrationSql, /DELETE on storage_operations is strictly prohibited/i);
  assert.match(migrationSql, /parent must be failed/i);

  const retryFnMatch = migrationSql.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.enforce_storage_operation_retry_contract[\s\S]*?\$\$;/i);
  assert.ok(retryFnMatch, "enforce_storage_operation_retry_contract function definition must exist");
  assert.match(
    retryFnMatch[0],
    /NEW\.actor_id\s+IS\s+DISTINCT\s+FROM\s+v_parent\.actor_id/i,
    "retry contract must explicitly compare NEW.actor_id with parent actor_id",
  );
});

test("idempotency ledger uses atomic INSERT with RETURNING", () => {
  const claimFnMatch = migrationSql.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.claim_idempotency_key[\s\S]*?\$\$;/i);
  assert.ok(claimFnMatch, "claim_idempotency_key function definition must exist");
  const claimFnBody = claimFnMatch[0];

  assert.match(claimFnBody, /INSERT\s+INTO\s+public\.idempotency_ledger/i);
  assert.match(claimFnBody, /ON\s+CONFLICT\s*\(\s*actor_id\s*,\s*operation\s*,\s*idempotency_key\s*\)\s*DO\s+NOTHING/i);
  assert.match(claimFnBody, /RETURNING\s+id\s+INTO/i);
});

test("feature flags default to false", () => {
  assert.match(migrationSql, /\('html_content_backend',\s*false/i);
  assert.match(migrationSql, /\('html_content_upload',\s*false/i);
  assert.match(migrationSql, /\('html_content_publish',\s*false/i);
  assert.match(migrationSql, /\('html_content_student_read',\s*false/i);
});
