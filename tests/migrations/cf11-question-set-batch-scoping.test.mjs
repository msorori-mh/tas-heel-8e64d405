import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIG_DIR = 'supabase/migrations';

function findMigration() {
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql'));
  const hits = files.filter((f) =>
    readFileSync(join(MIG_DIR, f), 'utf8').includes('CF11_SCOPING_MIGRATION_UNEXPECTED_OCCURRENCES'),
  );
  assert.equal(hits.length, 1, 'exactly one CF11 question-set scoping migration must exist');
  return readFileSync(join(MIG_DIR, hits[0]), 'utf8');
}

const sql = findMigration();

test('targets exactly the two old broad-prefix live-set SELECTs', () => {
  assert.ok(sql.includes("code LIKE ext_code || ''-OFFQ-%''"));
  assert.ok(sql.includes("code LIKE ext_code || ''-SELF-%''"));
  assert.match(sql, /n_off <> 1 OR n_self <> 1/);
});

test('proves both new batch-scoped SELECTs exist after replacement', () => {
  assert.ok(sql.includes('code = ANY (expected_official_codes)'));
  assert.ok(sql.includes('code = ANY (expected_self_codes)'));
  assert.match(sql, /CF11_SCOPING_MIGRATION_REPLACEMENT_FAILED/);
  assert.match(sql, /CF11_SCOPING_MIGRATION_RESIDUAL_PREFIX_SELECT/);
});

test('official and selfTest use the same batch-scoping rule', () => {
  const off = sql.match(/lesson_id = lesson_row\.id AND code = ANY \(expected_official_codes\)/g) ?? [];
  const self = sql.match(/lesson_id = lesson_row\.id AND code = ANY \(expected_self_codes\)/g) ?? [];
  assert.equal(off.length, 1);
  assert.equal(self.length, 1);
});

test('is idempotent / fail-closed on replay and on a missing function', () => {
  assert.match(sql, /CF11_SCOPING_MIGRATION_ALREADY_APPLIED/);
  assert.match(sql, /CF11_SCOPING_MIGRATION_FUNCTION_MISSING/);
});

test('preserves exact-equality mismatch checks so a missing expected code still fails', () => {
  assert.match(sql, /CF11_OFFICIAL_QUESTION_SET_MISMATCH/);
  assert.match(sql, /CF11_SELFTEST_QUESTION_SET_MISMATCH/);
  assert.match(sql, /CF11_SCOPING_MIGRATION_INVARIANT_LOST/);
});

test('preserves the pinned question plan scoping and does not touch data', () => {
  assert.ok(sql.includes('qq.code = ANY (self_codes)'));
  assert.ok(sql.includes('qq.code = ANY (official_codes)'));
  assert.ok(sql.includes('question_codes := official_codes || self_codes;'));
  assert.doesNotMatch(sql, /\b(DELETE FROM|TRUNCATE|DROP TABLE|ALTER TABLE)\b/i);
  assert.doesNotMatch(sql, /\bUPDATE\s+public\./i);
  assert.doesNotMatch(sql, /\bINSERT\s+INTO\s+public\./i);
});

test('historical extra DRAFT codes cannot pollute the live set (semantic model)', () => {
  // Model the new SELECT: live sets are filtered by the verified batch expected arrays.
  const expectedSelf = Array.from({ length: 20 }, (_, i) =>
    `SELF st-chem-g12-iron-v2-${String(i + 1).padStart(5, '0')}`,
  ).sort();
  const historicalDrafts = Array.from({ length: 20 }, (_, i) => `SELF st-chem-g12-iron-v1-${i}`);
  const lessonRows = [...expectedSelf, ...historicalDrafts];

  const scoped = lessonRows.filter((c) => expectedSelf.includes(c)).sort();
  assert.deepEqual(scoped, expectedSelf, 'historical rows must be ignored');

  const broad = lessonRows.filter((c) => c.startsWith('SELF ')).sort();
  assert.notDeepEqual(broad, expectedSelf, 'old broad-prefix behaviour was the defect');

  // Missing expected code still fails closed.
  const missing = lessonRows.filter((c) => c !== expectedSelf[0] && expectedSelf.includes(c)).sort();
  assert.notDeepEqual(missing, expectedSelf);
});
