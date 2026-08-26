/**
 * Regression contract for the CF10 retry-idempotency fix.
 *
 * Bug: golden_lesson_materialize_domain_batch() matched lesson_explanations by the
 * UPPERCASE identity code while the BEFORE INSERT/UPDATE trigger stores it lowercased,
 * so retries missed the existing row and violated lesson_explanations_code_lesson_uniq.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "..", "supabase", "migrations");

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
const fixFiles = files.filter((f) =>
  readFileSync(join(MIGRATIONS_DIR, f), "utf8").includes(
    "public.normalize_content_code(external_lesson_code || ''-EXP'')",
  ),
);

test("a forward migration normalizes the CF10 explanation code", () => {
  assert.equal(fixFiles.length, 1, "expected exactly one CF10 explanation-code fix migration");
});

const sql = readFileSync(join(MIGRATIONS_DIR, fixFiles[0]), "utf8");

test("fix migration is guarded on exactly three occurrences", () => {
  assert.match(sql, /CF10_FIX_UNEXPECTED_OCCURRENCES/);
  assert.match(sql, /CF10_FIX_POSTVERIFY_NORMALIZED_COUNT/);
  assert.match(sql, /CF10_FIX_POSTVERIFY_UNNORMALIZED_REMAINS/);
});

test("fix migration performs no content deletion or overwrite", () => {
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|FUNCTION)\b/i);
  assert.doesNotMatch(sql, /\b(DELETE\s+FROM|TRUNCATE)\b/i);
  assert.doesNotMatch(sql, /\bUPDATE\s+public\.lesson_/i);
  assert.doesNotMatch(sql, /\bINSERT\s+INTO\s+public\.lesson_/i);
});

test("EXPERIMENT resource code is not rewritten", () => {
  assert.doesNotMatch(sql, /normalize_content_code\(external_lesson_code \|\| ''-EXPERIMENT''\)/);
});
