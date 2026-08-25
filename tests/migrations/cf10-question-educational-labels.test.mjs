/**
 * Focused regression contract for the CF10_EDULABEL_21H fix.
 *
 * Bug: golden_lesson_materialize_domain_batch() wrote question_revisions with
 * educational_label = NULL, and self-test revisions with
 * interaction_type = 'multiple_choice'. The student RPCs require
 * OFFICIAL_BOOK_QUESTION / SELF_TEST + SINGLE_CHOICE + AUTO_SINGLE, so golden
 * lesson questions (e.g. the iron lesson) never reached students.
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
  readFileSync(join(MIGRATIONS_DIR, f), "utf8").includes("CF10_EDULABEL_21H"),
);

test("a single forward migration carries the CF10 educational-label fix", () => {
  assert.equal(fixFiles.length, 1, "expected exactly one CF10_EDULABEL_21H migration");
});

const sql = readFileSync(join(MIGRATIONS_DIR, fixFiles[0]), "utf8");

test("migration is fail-closed: target function, already-applied and anchor guards", () => {
  assert.match(sql, /CF10_EDULABEL_FIX_TARGET_FUNCTION_MISSING/);
  assert.match(sql, /CF10_EDULABEL_FIX_ALREADY_APPLIED/);
  for (const guard of [
    "CF10_EDULABEL_FIX_ANCHOR_INS_OFFICIAL",
    "CF10_EDULABEL_FIX_ANCHOR_INS_SELF",
    "CF10_EDULABEL_FIX_ANCHOR_COERCE",
    "CF10_EDULABEL_FIX_ANCHOR_REPLAY_OFFICIAL",
    "CF10_EDULABEL_FIX_ANCHOR_REPLAY_SELF",
  ]) {
    assert.ok(sql.includes(guard), `missing guard ${guard}`);
  }
});

test("official question INSERTs carry OFFICIAL_BOOK_QUESTION", () => {
  assert.match(sql, /educational_label,\r?\n\s+payload_hash_version/);
  assert.match(sql, /'OFFICIAL_BOOK_QUESTION', 'canonical_payload_v1'/);
});

test("self-test INSERTs carry SELF_TEST and revisions are coerced to SINGLE_CHOICE/AUTO_SINGLE", () => {
  assert.match(sql, /false, 'SELF_TEST',\r?\n\s+'canonical_payload_v1', payloads->'selfTest'/);
  assert.match(sql, /expected_interaction := 'SINGLE_CHOICE';/);
  assert.match(sql, /expected_grading := 'AUTO_SINGLE';/);
  assert.doesNotMatch(sql, /expected_interaction := expected_type;\r?\n\s+expected_grading := 'AUTO_SINGLE';(?![\s\S]*'SINGLE_CHOICE')/);
});

test("replay normalization is idempotent and strictly DRAFT-scoped", () => {
  const updates = sql.match(/UPDATE public\.question_revisions/g) ?? [];
  assert.equal(updates.length, 3, "expected exactly the three replay UPDATEs");
  const draftGuards = sql.match(/WHERE id = revision_row\.id AND status = 'DRAFT'/g) ?? [];
  assert.equal(draftGuards.length, 3, "every replay UPDATE must be DRAFT-scoped");
  assert.match(sql, /revision_row\.educational_label IS NULL/);
  assert.match(sql, /interaction_type = 'multiple_choice'/);
});

test("migration never modifies PUBLISHED revisions or any lesson content", () => {
  assert.doesNotMatch(sql, /'PUBLISHED'/);
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|FUNCTION)\b/i);
  assert.doesNotMatch(sql, /\b(DELETE\s+FROM|TRUNCATE)\b/i);
  assert.doesNotMatch(sql, /\bUPDATE\s+public\.lesson_/i);
  assert.doesNotMatch(sql, /\bINSERT\s+INTO\s+public\.lesson_/i);
  assert.doesNotMatch(sql, /\bUPDATE\s+public\.questions\b/i);
  assert.doesNotMatch(sql, /\bINSERT\s+INTO\s+public\.questions\b/i);
});

test("migration rewrites exactly one function and verifies the result", () => {
  assert.match(sql, /proname = 'golden_lesson_materialize_domain_batch'/);
  assert.doesNotMatch(sql, /proname = 'golden_lesson_publish_cf11'/);
  assert.match(sql, /CF10_EDULABEL_FIX_POSTVERIFY_MARKER/);
  assert.match(sql, /CF10_EDULABEL_FIX_POSTVERIFY_COERCE_REMAINS/);
  assert.match(sql, /CF10_EDULABEL_FIX_POSTVERIFY_INSERT_REMAINS/);
});

test("question code logic (OFFQ / SELF codes) and earlier normalizations are untouched", () => {
  assert.doesNotMatch(sql, /-OFFQ/);
  assert.doesNotMatch(sql, /-SELF''/);
  assert.doesNotMatch(sql, /normalize_content_code/);
});
