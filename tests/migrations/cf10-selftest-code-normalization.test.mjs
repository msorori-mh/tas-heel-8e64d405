/**
 * Regression contract for the CF10 SELFTEST replay-idempotency fix.
 *
 * Bug: golden_lesson_materialize_domain_batch() matched/inserted lesson_assessments by the
 * UPPERCASE identity code (external_lesson_code || '-SELFTEST') while the BEFORE
 * INSERT/UPDATE trigger normalize_lesson_assessment_code() stores it normalized
 * (lowercased). A replay with an uppercase external lesson code therefore missed the
 * existing lowercase row and the normalized INSERT violated lesson_assessments_code_uniq.
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
    "public.normalize_content_code(external_lesson_code || ''-SELFTEST'')",
  ),
);

test("a forward migration normalizes the CF10 self-test assessment code", () => {
  assert.equal(fixFiles.length, 1, "expected exactly one CF10 SELFTEST fix migration");
});

const sql = readFileSync(join(MIGRATIONS_DIR, fixFiles[0]), "utf8");

test("fix migration is fail-closed on the expected occurrence state", () => {
  assert.match(sql, /CF10_SELFTEST_FIX_UNEXPECTED_OCCURRENCES/);
  assert.match(sql, /CF10_SELFTEST_FIX_ALREADY_APPLIED/);
  assert.match(sql, /v_count <> 4/);
});

test("fix migration proves all four SELFTEST expressions end up normalized", () => {
  assert.match(sql, /CF10_SELFTEST_FIX_POSTVERIFY_NORMALIZED_COUNT/);
  assert.match(sql, /CF10_SELFTEST_FIX_POSTVERIFY_BARE_REMAINS/);
});

test("fix migration preserves the already-deployed EXP normalization", () => {
  assert.match(sql, /CF10_SELFTEST_FIX_EXP_PRECONDITION/);
  assert.match(sql, /CF10_SELFTEST_FIX_POSTVERIFY_EXP_LOST/);
});

test("fix migration performs no content deletion or overwrite", () => {
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|FUNCTION)\b/i);
  assert.doesNotMatch(sql, /\b(DELETE\s+FROM|TRUNCATE)\b/i);
  assert.doesNotMatch(sql, /\bUPDATE\s+public\.lesson_/i);
  assert.doesNotMatch(sql, /\bINSERT\s+INTO\s+public\.lesson_/i);
});

test("question code logic (OFFQ / SELF question codes) is untouched", () => {
  assert.doesNotMatch(sql, /-OFFQ/);
  assert.doesNotMatch(sql, /-SELF''/);
});
