/**
 * Regression contract for the CF10 lifecycle replay/update defect.
 *
 * Bug: golden_lesson_materialize_domain_batch() raised CF10_LIFECYCLE_CONFLICT whenever an
 * existing lesson_capability_lifecycle row was still DRAFT but carried a stale draft_hash from
 * an earlier unpublished staged version. Since the table holds one row per
 * (lesson_id, capability), a newer verified package version could never be materialized.
 *
 * Fix: when the existing row is exactly DRAFT and applicability matches the staged entry, the
 * function refreshes only draft_hash / draft_updated_at (exactly one row) and counts it as a
 * lifecycle/domain write. REVIEW / READY rows and applicability mismatches still fail closed.
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
  readFileSync(join(MIGRATIONS_DIR, f), "utf8").includes("CF10_LIFECYCLE_DRAFT_REFRESH_FAILED"),
);

test("exactly one forward migration introduces the DRAFT hash refresh", () => {
  assert.equal(fixFiles.length, 1, "expected exactly one CF10 lifecycle draft-refresh migration");
});

const sql = readFileSync(join(MIGRATIONS_DIR, fixFiles[0]), "utf8");

test("same-hash replay stays a no-op", () => {
  // The refresh only fires when the staged hash differs from the stored draft_hash.
  assert.match(sql, /existing_draft_hash IS DISTINCT FROM \(payloads->cap->>'sha256'\)/);
  assert.match(sql, /IF existing_status = 'DRAFT'\s*\n\s*AND existing_draft_hash IS DISTINCT FROM/);
});

test("differing hash on a DRAFT row refreshes exactly one row and counts the write", () => {
  assert.match(sql, /UPDATE public\.lesson_capability_lifecycle/);
  assert.match(sql, /GET DIAGNOSTICS rc = ROW_COUNT;[\s\S]*IF rc <> 1 THEN/);
  assert.match(sql, /lifecycle_written := lifecycle_written \+ rc;/);
  assert.match(sql, /domain_writes := domain_writes \+ rc;/);
});

test("REVIEW/READY status or applicability mismatch still fails closed", () => {
  assert.match(sql, /existing_status IS DISTINCT FROM 'DRAFT'/);
  assert.match(sql, /OR existing_applicability IS DISTINCT FROM expected_applicability\) THEN/);
  assert.match(sql, /RAISE EXCEPTION 'CF10_LIFECYCLE_CONFLICT: %'/);
  // The UPDATE is pinned to DRAFT + the staged applicability.
  assert.match(sql, /WHERE lesson_id = lesson_row\.id/);
  assert.match(sql, /AND status = 'DRAFT'/);
  assert.match(
    sql,
    /AND applicability = expected_applicability::public\.capability_applicability;/,
  );
});

test("the update touches only draft_hash and draft_updated_at", () => {
  const update = sql.slice(
    sql.indexOf("UPDATE public.lesson_capability_lifecycle"),
    sql.indexOf("GET DIAGNOSTICS rc = ROW_COUNT;\n      IF rc <> 1"),
  );
  assert.match(update, /SET draft_hash = payloads->cap->>'sha256',\s*\n\s*draft_updated_at = now\(\)/);
  for (const forbidden of [
    "ready_at",
    "ready_snapshot",
    "reviewed_at",
    "review",
    "evidence",
    "status =",
    "applicability =",
  ]) {
    assert.ok(
      !update.slice(update.indexOf("SET"), update.indexOf("WHERE")).includes(forbidden),
      `SET clause must not touch ${forbidden}`,
    );
  }
});

test("migration is fail-closed and preserves the EXP/SELFTEST normalization fixes", () => {
  assert.match(sql, /CF10_LIFECYCLE_FIX_UNEXPECTED_OCCURRENCES/);
  assert.match(sql, /CF10_LIFECYCLE_FIX_ALREADY_APPLIED/);
  assert.match(sql, /CF10_LIFECYCLE_FIX_EXP_PRECONDITION/);
  assert.match(sql, /CF10_LIFECYCLE_FIX_SELFTEST_PRECONDITION/);
  assert.match(sql, /CF10_LIFECYCLE_FIX_POSTVERIFY_OLD_REMAINS/);
  assert.match(sql, /CF10_LIFECYCLE_FIX_POSTVERIFY_NEW_MISSING/);
  assert.match(sql, /CF10_LIFECYCLE_FIX_POSTVERIFY_EXP_LOST/);
  assert.match(sql, /CF10_LIFECYCLE_FIX_POSTVERIFY_SELFTEST_LOST/);
});

test("migration performs no content deletion or data overwrite", () => {
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|FUNCTION)\b/i);
  assert.doesNotMatch(sql, /\b(DELETE\s+FROM|TRUNCATE)\b/i);
  assert.doesNotMatch(sql, /\bINSERT\s+INTO\s+public\./i);
  // The only UPDATE text in the migration is inside the new function body snippet.
  assert.equal((sql.match(/UPDATE public\./g) || []).length, 1);
});
