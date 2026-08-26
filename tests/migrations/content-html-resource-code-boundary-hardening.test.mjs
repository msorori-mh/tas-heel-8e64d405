/**
 * Structural contract tests for
 * 20260809010000_content_html_resource_code_boundary_hardening.sql
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const HARDENING_FILE = "20260809010000_content_html_resource_code_boundary_hardening.sql";
const ALIGNMENT_FILE = "20260808060000_content_html_resource_contract_alignment.sql";

const hardeningSql = readFileSync(join(MIGRATIONS_DIR, HARDENING_FILE), "utf8");
const alignmentSql = readFileSync(join(MIGRATIONS_DIR, ALIGNMENT_FILE), "utf8");

test("hardening migration file exists and is additive", () => {
  assert.ok(hardeningSql.length > 0, "Hardening migration file must not be empty");
  assert.doesNotMatch(
    hardeningSql,
    /DROP\s+TABLE\s+lesson_resources/i,
    "Must not drop lesson_resources",
  );
  assert.doesNotMatch(hardeningSql, /\bCASCADE\b/i, "Must not use CASCADE");
});

test("hardening migration redefines canonical normalizer", () => {
  assert.match(
    hardeningSql,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.normalize_resource_code/i,
    "Must redefine normalize_resource_code",
  );
});

test("hardening migration installs before-insert/update trigger", () => {
  assert.match(
    hardeningSql,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.normalize_lesson_resource_code/i,
    "Must define normalize_lesson_resource_code trigger function",
  );
  assert.match(
    hardeningSql,
    /CREATE\s+TRIGGER\s+trg_normalize_lesson_resource_code/i,
    "Must create trg_normalize_lesson_resource_code trigger",
  );
  assert.match(
    hardeningSql,
    /BEFORE\s+INSERT\s+OR\s+UPDATE\s+ON\s+public\.lesson_resources/i,
    "Trigger must fire before insert or update",
  );
});

test("hardening migration enforces canonical non-empty resource_code", () => {
  assert.match(
    hardeningSql,
    /lesson_resources_resource_code_canonical_check/i,
    "Must add canonical check constraint",
  );
  assert.match(
    hardeningSql,
    /lesson_resources_resource_code_non_empty_check/i,
    "Must add non-empty check constraint",
  );
});

test("hardening migration creates partial unique index on normalized resource_code", () => {
  assert.match(
    hardeningSql,
    /CREATE\s+UNIQUE\s+INDEX\s+idx_lesson_resources_code_per_lesson/i,
    "Must create partial unique index",
  );
  assert.match(
    hardeningSql,
    /WHERE\s+resource_code\s+IS\s+NOT\s+NULL/i,
    "Unique index must be partial on non-null resource_code",
  );
  assert.match(
    hardeningSql,
    /normalize_resource_code\s*\(\s*resource_code\s*\)/i,
    "Unique index must use normalized expression",
  );
});

test("hardening migration does not modify prior migrations", () => {
  assert.doesNotMatch(
    alignmentSql,
    /trg_normalize_lesson_resource_code|normalize_lesson_resource_code/i,
    "Alignment migration must not contain boundary trigger",
  );
});

test("hardening migration is source-only and does not reference remote apply", () => {
  assert.doesNotMatch(
    hardeningSql,
    /supabase\s+link|--\s*remote\s*apply|remote\s*sql/i,
    "Migration must not contain remote-apply markers",
  );
});
