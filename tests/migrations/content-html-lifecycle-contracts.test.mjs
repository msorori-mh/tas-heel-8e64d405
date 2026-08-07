/**
 * Structural contract tests for CONTENT_HTML_ADMIN_IMPORT_REVIEW_CORRECTION_03
 * Lifecycle SECURITY DEFINER RPCs.
 * Run with: node --test tests/migrations/content-html-lifecycle-contracts.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const MIGRATION_FILE = "20260807050000_content_html_lifecycle_contracts.sql";

const migrationSql = readFileSync(join(MIGRATIONS_DIR, MIGRATION_FILE), "utf8");

test("migration file exists and is non-destructive", () => {
  assert.ok(migrationSql.length > 0, "Migration file must not be empty");
  assert.doesNotMatch(migrationSql, /DROP\s+TABLE\s+lesson_resources/i, "Must not drop table lesson_resources");
  assert.doesNotMatch(migrationSql, /DROP\s+TABLE\s+IF\s+EXISTS\s+lesson_resources/i, "Must not drop table lesson_resources");
  assert.doesNotMatch(migrationSql, /\bCASCADE\b/i, "Must not use CASCADE in migration");
});

test("lifecycle functions are SECURITY DEFINER", () => {
  const lifecycleFns = [
    "submit_resource_for_review",
    "approve_resource",
    "reject_resource",
    "unpublish_resource",
    "record_successful_resource_publication",
    "rollback_resource",
  ];

  for (const fn of lifecycleFns) {
    const pattern = new RegExp(
      `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fn}\\s*\\([^)]*\\)\\s*RETURNS[\\s\\S]*?SECURITY\\s+DEFINER`,
      "i",
    );
    assert.match(migrationSql, pattern, `Function ${fn} must be SECURITY DEFINER`);
  }
});

test("lifecycle functions have explicit REVOKE FROM PUBLIC/anon/authenticated", () => {
  const lifecycleFns = [
    "submit_resource_for_review",
    "approve_resource",
    "reject_resource",
    "unpublish_resource",
    "record_successful_resource_publication",
    "rollback_resource",
  ];

  for (const fn of lifecycleFns) {
    const pattern = new RegExp(
      `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${fn}[\\s\\S]*?FROM\\s+PUBLIC`,
      "i",
    );
    assert.match(migrationSql, pattern, `Function ${fn} must explicitly REVOKE FROM PUBLIC`);
  }
});

test("lifecycle functions GRANT EXECUTE only to service_role", () => {
  const lifecycleFns = [
    "submit_resource_for_review",
    "approve_resource",
    "reject_resource",
    "unpublish_resource",
    "record_successful_resource_publication",
    "rollback_resource",
  ];

  for (const fn of lifecycleFns) {
    const pattern = new RegExp(
      `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}[\\s\\S]*?TO\\s+service_role`,
      "i",
    );
    assert.match(migrationSql, pattern, `Function ${fn} must GRANT EXECUTE to service_role`);

    const denyPattern = new RegExp(
      `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}[\\s\\S]*?TO\\s+(authenticated|anon|public)`,
      "i",
    );
    assert.doesNotMatch(
      migrationSql,
      denyPattern,
      `Function ${fn} must not GRANT EXECUTE to authenticated/anon/public`,
    );
  }
});

test("submit checks draft state, current_draft_version_id, validation, and blocking findings", () => {
  const fnMatch = migrationSql.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.submit_resource_for_review[\s\S]*?\$\$;/i,
  );
  assert.ok(fnMatch, "submit_resource_for_review function definition must exist");
  const fnBody = fnMatch[0];

  assert.match(fnBody, /lifecycle_status\s*<>\s*'draft'/i, "submit must reject non-draft resources");
  assert.match(fnBody, /current_draft_version_id\s+IS\s+NULL/i, "submit must require current_draft_version_id");
  assert.match(fnBody, /is_valid\s*=\s*true/i, "submit must require valid validation");
  assert.match(fnBody, /valid_until\s*>\s*now\(\)/i, "submit must require non-stale validation");
  assert.match(fnBody, /package_hash\s*=\s*v_ver\.content_sha256/i, "submit must match version hash");
  assert.match(fnBody, /package_hash\s*=\s*s\.expected_package_hash/i, "submit must match session hash");
  assert.match(fnBody, /storage_object_path\s*=\s*s\.staging_path/i, "submit must bind to session staging path");
  assert.match(fnBody, /blocking/i, "submit must reject blocking findings");
  assert.match(fnBody, /lifecycle_status\s*=\s*'in_review'/i, "submit must transition to in_review");
  assert.match(fnBody, /INSERT\s+INTO\s+public\.lesson_resource_events[\s\S]{0,300}'submit'/i, "submit must emit audit event");
});

test("approve checks admin, in_review state, version match, validation, and immutability", () => {
  const fnMatch = migrationSql.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.approve_resource[\s\S]*?\$\$;/i,
  );
  assert.ok(fnMatch, "approve_resource function definition must exist");
  const fnBody = fnMatch[0];

  assert.match(fnBody, /_assert_html_admin_caller/i, "approve must assert admin caller");
  assert.match(fnBody, /lifecycle_status\s*<>\s*'in_review'/i, "approve must reject non-in_review resources");
  assert.match(fnBody, /current_draft_version_id\s*<>\s*p_version_id/i, "approve must match current_draft_version_id");
  assert.match(fnBody, /is_valid\s*=\s*true/i, "approve must require valid validation");
  assert.match(fnBody, /blocking/i, "approve must reject blocking findings");
  assert.match(fnBody, /approved_version_id\s*=\s*v_ver\.id/i, "approve must bind approved_version_id");
  assert.match(fnBody, /immutable_at\s*=\s*COALESCE/i, "approve must mark version immutable");
  assert.match(fnBody, /INSERT\s+INTO\s+public\.lesson_resource_reviews[\s\S]{0,300}'approved'/i, "approve must append review record");
  assert.match(fnBody, /INSERT\s+INTO\s+public\.lesson_resource_events[\s\S]{0,300}'approve'/i, "approve must emit audit event");
});

test("reject checks admin, in_review state, version match, and non-empty reason", () => {
  const fnMatch = migrationSql.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.reject_resource[\s\S]*?\$\$;/i,
  );
  assert.ok(fnMatch, "reject_resource function definition must exist");
  const fnBody = fnMatch[0];

  assert.match(fnBody, /_assert_html_admin_caller/i, "reject must assert admin caller");
  assert.match(fnBody, /p_reason\s+IS\s+NULL/i, "reject must require reason");
  assert.match(fnBody, /lifecycle_status\s*<>\s*'in_review'/i, "reject must reject non-in_review resources");
  assert.match(fnBody, /current_draft_version_id\s*<>\s*p_version_id/i, "reject must match current_draft_version_id");
  assert.match(fnBody, /lifecycle_status\s*=\s*'rejected'/i, "reject must transition to rejected");
  assert.match(fnBody, /INSERT\s+INTO\s+public\.lesson_resource_reviews[\s\S]{0,300}'rejected'/i, "reject must append review record");
  assert.match(fnBody, /INSERT\s+INTO\s+public\.lesson_resource_events[\s\S]{0,300}'reject'/i, "reject must emit audit event");
  assert.doesNotMatch(fnBody, /immutable_at\s*=\s*COALESCE[\s\S]*?rejected/i, "reject must not mark version immutable");
});

test("unpublish checks admin, published state, preserves history, and emits audit", () => {
  const fnMatch = migrationSql.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.unpublish_resource[\s\S]*?\$\$;/i,
  );
  assert.ok(fnMatch, "unpublish_resource function definition must exist");
  const fnBody = fnMatch[0];

  assert.match(fnBody, /_assert_html_admin_caller/i, "unpublish must assert admin caller");
  assert.match(fnBody, /lifecycle_status\s*<>\s*'published'/i, "unpublish must reject non-published resources");
  assert.match(fnBody, /published_version_id\s+IS\s+NULL/i, "unpublish must require published_version_id");
  assert.match(fnBody, /lifecycle_status\s*=\s*'approved'/i, "unpublish must transition to approved");
  assert.match(fnBody, /published_version_id\s*=\s*NULL/i, "unpublish must clear published_version_id");
  assert.match(fnBody, /INSERT\s+INTO\s+public\.lesson_resource_events[\s\S]{0,300}'unpublish'/i, "unpublish must emit audit event");
  assert.doesNotMatch(fnBody, /DELETE\s+FROM\s+public\.lesson_resource_files/i, "unpublish must not delete published files");
});

test("rollback checks admin, published state, same-resource target, immutable, approved, and published binding", () => {
  const fnMatch = migrationSql.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.rollback_resource[\s\S]*?\$\$;/i,
  );
  assert.ok(fnMatch, "rollback_resource function definition must exist");
  const fnBody = fnMatch[0];

  assert.match(fnBody, /_assert_html_admin_caller/i, "rollback must assert admin caller");
  assert.match(fnBody, /lifecycle_status\s*<>\s*'published'/i, "rollback must reject non-published resources");
  assert.match(fnBody, /resource_id\s*=\s*p_resource_id/i, "rollback must verify target belongs to resource");
  assert.match(fnBody, /immutable_at\s+IS\s+NULL/i, "rollback must require immutable target");
  assert.match(fnBody, /decision\s*=\s*'approved'/i, "rollback must require historically approved target");
  assert.match(fnBody, /storage_operations/i, "rollback must verify trusted storage operation record");
  assert.match(fnBody, /operation_type\s*=\s*'promote_published'/i, "rollback must check promote_published operation");
  assert.match(fnBody, /published\//i, "rollback must use server-computed published path");
  assert.doesNotMatch(fnBody, /p_published_path|p_target_hash|p_target_status/i, "rollback must not accept client path/hash/status");
  assert.match(fnBody, /published_version_id\s*=\s*v_target\.id/i, "rollback must set published_version_id to target");
  assert.match(fnBody, /INSERT\s+INTO\s+public\.lesson_resource_events[\s\S]{0,300}'rollback'/i, "rollback must emit audit event");
});

test("record_successful_resource_publication is atomic, service-role, CAS, and storage-bound", () => {
  const fnMatch = migrationSql.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.record_successful_resource_publication[\s\S]*?\$\$;/i,
  );
  assert.ok(fnMatch, "record_successful_resource_publication function definition must exist");
  const fnBody = fnMatch[0];

  assert.match(fnBody, /SECURITY\s+DEFINER/i, "publication must be SECURITY DEFINER");
  assert.match(fnBody, /service_role/i, "publication must enforce service_role caller");
  assert.match(fnBody, /lifecycle_status\s*<>\s*'approved'/i, "publication must reject non-approved resources");
  assert.match(fnBody, /approved_version_id\s*<>\s*p_version_id/i, "publication must match approved_version_id");
  assert.match(fnBody, /p_expected_lock_version/i, "publication must accept expected_lock_version for CAS");
  assert.match(fnBody, /SELECT\s+\*\s+INTO\s+v_op\s+FROM\s+public\.storage_operations/i, "publication must resolve storage operation");
  assert.match(fnBody, /v_op\.resource_id\s*<>\s*p_resource_id/i, "publication must reject cross-resource operation");
  assert.match(fnBody, /v_op\.resource_version_id\s*<>\s*p_version_id/i, "publication must reject cross-version operation");
  assert.match(fnBody, /operation_type\s*<>\s*'promote_published'/i, "publication must require promote_published operation");
  assert.match(fnBody, /v_op\.status\s*<>\s*'promoted'/i, "publication must require promoted status");
  assert.match(fnBody, /target_path\s*<>\s*v_expected_path/i, "publication must enforce canonical target path");
  assert.match(fnBody, /expected_hash\s*<>\s*v_ver\.content_sha256/i, "publication must enforce expected_hash = version.content_sha256");
  assert.match(fnBody, /lifecycle_status\s*=\s*'published'/i, "publication must transition to published");
  assert.match(fnBody, /published_version_id\s*=\s*p_version_id/i, "publication must set published_version_id");
  assert.match(fnBody, /lock_version\s*=\s*lock_version\s*\+\s*1/i, "publication must increment lock_version");
  assert.match(fnBody, /INSERT\s+INTO\s+public\.lesson_resource_events[\s\S]{0,300}'publish'/i, "publication must emit audit event");
  assert.match(fnBody, /UPDATE\s+public\.lesson_resources[\s\S]*?lifecycle_status\s*=\s*'published'/i, "publication must update lesson_resources atomically inside the RPC");
});

test("rollback requires trusted storage promotion proof with matching hash and path", () => {
  const fnMatch = migrationSql.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.rollback_resource[\s\S]*?\$\$;/i,
  );
  assert.ok(fnMatch, "rollback_resource function definition must exist");
  const fnBody = fnMatch[0];

  assert.match(fnBody, /_assert_html_admin_caller/i, "rollback must assert admin caller");
  assert.match(fnBody, /immutable_at\s+IS\s+NULL/i, "rollback must require immutable target");
  assert.match(fnBody, /decision\s*=\s*'approved'/i, "rollback must require historically approved target");
  assert.match(fnBody, /SELECT\s+\*\s+INTO\s+v_op\s+FROM\s+public\.storage_operations/i, "rollback must query a trusted storage operation");
  assert.match(fnBody, /operation_type\s*=\s*'promote_published'/i, "rollback must require promote_published operation");
  assert.match(fnBody, /status\s+IN\s*\(\s*'promoted'\s*,\s*'cleaned'\s*\)/i, "rollback must require promoted/cleaned status");
  assert.match(fnBody, /target_path\s*=\s*v_expected_path/i, "rollback must enforce canonical target path");
  assert.match(fnBody, /expected_hash\s*=\s*v_target\.content_sha256/i, "rollback must enforce expected_hash = target version.content_sha256");
  assert.doesNotMatch(fnBody, /p_published_path|p_target_hash|p_target_status/i, "rollback must not accept client path/hash/status");
  assert.match(fnBody, /published_version_id\s*=\s*v_target\.id/i, "rollback must set published_version_id to target");
  assert.match(fnBody, /INSERT\s+INTO\s+public\.lesson_resource_events[\s\S]{0,300}'rollback'/i, "rollback must emit audit event");
});

test("resolve_promotion_binding returns lock_version for CAS publication", () => {
  const fnMatch = migrationSql.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.resolve_promotion_binding[\s\S]*?\$\$;/i,
  );
  assert.ok(fnMatch, "resolve_promotion_binding function definition must exist");
  const fnBody = fnMatch[0];

  assert.match(fnBody, /lock_version\s+integer/i, "resolve_promotion_binding must return lock_version");
  assert.match(fnBody, /v_resource\.lock_version\s+AS\s+lock_version/i, "resolve_promotion_binding must select resource lock_version");
});

test("no wide revoke on all functions in schema public", () => {
  assert.doesNotMatch(
    migrationSql,
    /REVOKE\s+ALL\s+ON\s+ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+public/i,
    "Must not use broad REVOKE ALL ON ALL FUNCTIONS",
  );
});

test("lifecycle functions use SET search_path = public, pg_temp", () => {
  const lifecycleFns = [
    "submit_resource_for_review",
    "approve_resource",
    "reject_resource",
    "unpublish_resource",
    "record_successful_resource_publication",
    "rollback_resource",
    "_assert_html_admin_caller",
    "_assert_html_content_staff_caller",
  ];

  for (const fn of lifecycleFns) {
    const pattern = new RegExp(
      `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fn}[\\s\\S]*?SET\\s+search_path\\s*=\\s*public,\\s*pg_temp`,
      "i",
    );
    assert.match(migrationSql, pattern, `Function ${fn} must set search_path = public, pg_temp`);
  }
});

test("lock_version CAS guard present in lifecycle transitions", () => {
  const lifecycleFns = [
    "submit_resource_for_review",
    "approve_resource",
    "reject_resource",
    "unpublish_resource",
    "record_successful_resource_publication",
    "rollback_resource",
  ];

  for (const fn of lifecycleFns) {
    const pattern = new RegExp(
      `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fn}[\\s\\S]*?p_expected_lock_version`,
      "i",
    );
    assert.match(migrationSql, pattern, `Function ${fn} must accept expected_lock_version parameter`);
  }
});
