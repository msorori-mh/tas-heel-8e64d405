import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CONTENT,
  MIGRATION_PATH,
  OUTPUT_PATH,
} from "../../scripts/content-factory/production/build-cf10-managed-revision-backfill.mjs";

const committed = readFileSync(OUTPUT_PATH, "utf8");
const migration = readFileSync(MIGRATION_PATH, "utf8").replace(/\r\n/g, "\n");

const TABLES = ["lesson_book_contents", "lesson_explanations", "lesson_summaries"];

test("the committed backfill matches what the generator produces today", () => {
  assert.equal(
    committed.replace(/\r\n/g, "\n"),
    CONTENT,
    "regenerate with: node scripts/content-factory/production/build-cf10-managed-revision-backfill.mjs",
  );
});

test("the middle step is the migration verbatim, not a retyped copy", () => {
  assert.ok(
    CONTENT.includes(migration.trimEnd()),
    "the backfill must embed 20260827010000 character-for-character",
  );
});

/**
 * The unguard step has to hand 20260827010000 exactly the text it pins as its
 * precondition, and the reguard step has to find exactly what that migration wrote.
 * Both are asserted against the migration file itself, so a change there fails here
 * instead of failing in production halfway through a three-step script.
 */
test("the reguard anchors are the migration's own replacement text", () => {
  for (const table of TABLES) {
    const written =
      `  ELSIF existing_hash IS DISTINCT FROM new_hash THEN\n` +
      `    IF binding_count IS DISTINCT FROM 1 THEN\n` +
      `      RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: ${table}' USING ERRCODE = '23514';`;
    assert.ok(
      migration.includes(written),
      `20260827010000 no longer writes the branch the reguard step looks for (${table})`,
    );
    // The same text, escaped for the E'' literal the generated SQL uses.
    assert.ok(
      CONTENT.includes(written.replace(/\n/g, "\\n").replace(/'/g, "''")),
      `the backfill does not look for the branch 20260827010000 writes (${table})`,
    );
  }
});

test("the unguard anchors are the migration's own precondition text", () => {
  for (const table of TABLES) {
    const pinned =
      `  ELSIF existing_hash IS DISTINCT FROM new_hash THEN\n` +
      `    RAISE EXCEPTION 'CF10_CONTENT_HASH_CONFLICT: ${table}' USING ERRCODE = '23514';`;
    assert.ok(
      migration.includes(pinned),
      `20260827010000 no longer pins the branch the unguard step produces (${table})`,
    );
    assert.ok(
      CONTENT.includes(pinned.replace(/\n/g, "\\n").replace(/'/g, "''")),
      `the backfill does not produce the branch 20260827010000 pins (${table})`,
    );
  }
});

test("every anchor is required to match exactly once, in both directions", () => {
  const guards = CONTENT.match(/IF hits <> 1 THEN/g) ?? [];
  assert.equal(guards.length, 6, "three unguard anchors and three reguard anchors");
});

/**
 * The NULL guard is the reason a batch carrying one component does not write the other
 * six as empty rows. Taking it off is step one of this script, so putting it back has
 * to be proved before the transaction commits -- not assumed.
 */
test("the script proves the NULL guard is back before it commits", () => {
  assert.match(CONTENT, /BEGIN;/);
  assert.match(CONTENT, /COMMIT;/);
  assert.match(CONTENT, /CF10_BACKFILL_PROOF_NULL_GUARD/);
  assert.ok(
    CONTENT.indexOf("CF10_BACKFILL_PROOF_NULL_GUARD") < CONTENT.indexOf("COMMIT;"),
    "the proof must run inside the transaction it protects",
  );
});

test("the script proves the earlier CF10 relaxations and the original guards both survive", () => {
  for (const marker of [
    "CF10_BACKFILL_PROOF_LOST_LCIP04",
    "CF10_BACKFILL_PROOF_LOST_LCIP05",
    "CF10_BACKFILL_PROOF_EMPTY_PAYLOAD_RETURNED",
    "CF10_BACKFILL_PROOF_LOST_ANSWER_LEAK_GUARD",
    "CF10_BACKFILL_PROOF_LOST_PAYLOAD_HASH_GUARD",
    "CF10_BACKFILL_PROOF_LOST_IDENTITY_GUARD",
    "CF10_BACKFILL_PROOF_LOST_QUESTION_VERSION_GUARD",
    "CF10_BACKFILL_PROOF_LOST_WRITE_PLAN_GUARD",
  ]) {
    assert.ok(CONTENT.includes(marker), `missing proof: ${marker}`);
  }
});

test("the backfill records the migration it delivers", () => {
  assert.match(CONTENT, /VALUES \('20260827010000', 'cf10_managed_content_revision'\)/);
});
