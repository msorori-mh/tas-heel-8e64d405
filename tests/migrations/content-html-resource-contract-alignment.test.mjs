/**
 * Structural contract tests for
 * 20260808060000_content_html_resource_contract_alignment.sql
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const ALIGNMENT_FILE = "20260808060000_content_html_resource_contract_alignment.sql";
const FOUNDATION_FILE = "20260806050000_content_html_db_rls_foundation.sql";
const LIFECYCLE_FILE = "20260807050000_content_html_lifecycle_contracts.sql";

const alignmentSql = readFileSync(join(MIGRATIONS_DIR, ALIGNMENT_FILE), "utf8");
const foundationSql = readFileSync(join(MIGRATIONS_DIR, FOUNDATION_FILE), "utf8");
const lifecycleSql = readFileSync(join(MIGRATIONS_DIR, LIFECYCLE_FILE), "utf8");

test("alignment migration file exists and is additive", () => {
  assert.ok(alignmentSql.length > 0, "Alignment migration file must not be empty");
  assert.doesNotMatch(alignmentSql, /DROP\s+TABLE\s+lesson_resources/i, "Must not drop lesson_resources");
  assert.doesNotMatch(alignmentSql, /\bCASCADE\b/i, "Must not use CASCADE");
});

test("old migrations are not modified", () => {
  assert.doesNotMatch(
    foundationSql,
    /html_resource_type/i,
    "Foundation migration must not mention html_resource_type",
  );
  assert.doesNotMatch(
    lifecycleSql,
    /html_resource_type/i,
    "Lifecycle migration must not mention html_resource_type",
  );
});

test("alignment migration adds resource_code column", () => {
  assert.match(
    alignmentSql,
    /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+resource_code\s+TEXT/i,
    "Must add resource_code column",
  );
});

test("alignment migration adds html_resource_type column", () => {
  assert.match(
    alignmentSql,
    /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+html_resource_type\s+TEXT/i,
    "Must add html_resource_type column",
  );
});

test("alignment migration defines legal subtype constraint", () => {
  assert.match(
    alignmentSql,
    /html_resource_type\s+IN\s*\(\s*['"]mind_map_html['"]\s*,\s*['"]practical_experiment_html['"]\s*,\s*['"]summary_html['"]\s*\)/i,
    "Must constrain html_resource_type to the three canonical subtypes",
  );
});

test("alignment migration defines broad resource_type compatibility constraint", () => {
  assert.match(
    alignmentSql,
    /html_resource_type\s+IS\s+NULL\s+OR\s+resource_type\s*=\s*['"]html['"]/i,
    "Must enforce html_resource_type only when resource_type is html",
  );
});

test("alignment migration defines partial unique index on resource_code within lesson", () => {
  assert.match(
    alignmentSql,
    /CREATE\s+UNIQUE\s+INDEX\s+idx_lesson_resources_code_per_lesson/i,
    "Must create partial unique index for resource_code per lesson",
  );
  assert.match(
    alignmentSql,
    /WHERE\s+resource_code\s+IS\s+NOT\s+NULL/i,
    "Unique index must be partial on non-null resource_code",
  );
});

test("student binding helpers expose canonical subtype", () => {
  const fnMatch = alignmentSql.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.resolve_student_resource_binding[\s\S]*?\$\$\s*;/i,
  );
  assert.ok(fnMatch, "resolve_student_resource_binding must be redefined");
  const fnBody = fnMatch[0];
  assert.match(
    fnBody,
    /COALESCE\s*\(\s*v_res\.html_resource_type\s*,\s*v_res\.resource_type::text\s*\)/i,
    "Student binding must return html_resource_type with fallback to resource_type",
  );
});

test("fetch_published_lesson_resources exposes canonical subtype", () => {
  const fnMatch = alignmentSql.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.fetch_published_lesson_resources[\s\S]*?\$\$\s*;/i,
  );
  assert.ok(fnMatch, "fetch_published_lesson_resources must be redefined");
  const fnBody = fnMatch[0];
  assert.match(
    fnBody,
    /COALESCE\s*\(\s*lr\.html_resource_type\s*,\s*lr\.resource_type::text\s*\)/i,
    "fetch_published_lesson_resources must return html_resource_type with fallback",
  );
});

test("list_published_html_resources_for_lesson uses real DB columns", () => {
  const fnMatch = alignmentSql.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.list_published_html_resources_for_lesson[\s\S]*?\$\$\s*;/i,
  );
  assert.ok(fnMatch, "list_published_html_resources_for_lesson must be defined");
  const fnBody = fnMatch[0];
  assert.match(fnBody, /lr\.resource_type\s*=\s*['"]html['"]/i, "Must filter by resource_type = html");
  assert.match(
    fnBody,
    /lr\.html_resource_type\s+IN\s*\(\s*['"]mind_map_html['"]\s*,\s*['"]practical_experiment_html['"]\s*,\s*['"]summary_html['"]\s*\)/i,
    "Must filter by html_resource_type IN canonical subtypes",
  );
  assert.match(fnBody, /lr\.lifecycle_status\s*=\s*['"]published['"]/i, "Must require published lifecycle_status");
  assert.match(
    fnBody,
    /lr\.published_version_id\s+IS\s+NOT\s+NULL/i,
    "Must require non-null published_version_id",
  );
});

test("alignment migration grants are explicit and scoped", () => {
  assert.match(
    alignmentSql,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.list_published_html_resources_for_lesson\s*\(\s*uuid\s*\)\s+TO\s+authenticated\s*,\s*service_role/i,
    "Must grant list helper to authenticated and service_role",
  );
  assert.doesNotMatch(
    alignmentSql,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.list_published_html_resources_for_lesson[\s\S]*?TO\s+anon/i,
    "Must not grant list helper to anon",
  );
});

test("alignment migration is source-only and does not reference remote apply", () => {
  assert.doesNotMatch(
    alignmentSql,
    /supabase\s+link|--\s*remote\s*apply|remote\s*sql/i,
    "Migration must not contain remote-apply markers",
  );
});
