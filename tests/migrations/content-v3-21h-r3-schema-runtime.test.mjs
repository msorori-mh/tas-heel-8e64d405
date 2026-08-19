import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, root), "utf8");
const migration = read("supabase/migrations-pending/20260818210000_content_v3_21h_hardened_preflight.sql");
const canonical = [
  "supabase/migrations/20260606003842_a271db04-ff59-4b13-8785-56e938afc1cc.sql",
  "supabase/migrations/20260606004917_18901270-9c14-4c37-bea7-1b33e3e26812.sql",
  "supabase/migrations/20260801120000_qb01_question_bank_schema_foundation.sql",
  "supabase/migrations/20260812234007_72545986-dc43-4ccb-bcde-18d11c1bd95c.sql",
  "supabase/migrations/20260813002624_0b9b5ed3-ed54-4c33-9987-a38d718234d4.sql",
].map(read).join("\n");
const fixture = read("scripts/content-v3/pg17-21h-canonical-fixture.sql");
const contract = read("scripts/content-v3/runtime-contract-21h-r3.sql");
const runner = read("scripts/content-v3/pg17-runner.ps1");
function tableBody(sql, table) {
  const match = new RegExp(`CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`, "i").exec(sql);
  assert.ok(match, `table body missing: ${table}`);
  return match[1];
}

test("canonical schema proves the R2 lesson_id contradiction", () => {
  assert.match(tableBody(canonical, "practice_attempts"), /lesson_assessment_id uuid/i);
  assert.doesNotMatch(tableBody(canonical, "practice_attempts"), /\blesson_id\b/i);
  assert.doesNotMatch(tableBody(fixture, "practice_attempts"), /\blesson_id\b/i);
  assert.match(tableBody(canonical, "lesson_assessments"), /lesson_id uuid/i);
  assert.match(tableBody(canonical, "assessment_questions"), /assessment_id uuid/i);
});

test("R3 reveal derives lesson through assessment and enforces snapshot membership", () => {
  assert.match(migration, /SELECT la\.lesson_id, paq\.question_revision_id/i);
  assert.match(migration, /JOIN public\.lesson_assessments la\s+ON la\.id = pa\.lesson_assessment_id/i);
  assert.match(migration, /JOIN public\.assessment_questions aq\s+ON aq\.assessment_id = la\.id/i);
  assert.match(migration, /JOIN public\.questions q\s+ON q\.id = paq\.logical_question_id/i);
  assert.match(migration, /q\.lesson_id = la\.lesson_id/i);
  assert.doesNotMatch(migration, /pa\.lesson_id/i);
  assert.match(migration, /pa\.attempt_type = 'LESSON'/i);
  assert.match(migration, /par\.practice_attempt_id = pa\.id/i);
});

test("R3 runner has a fail-closed fixture schema gate and local-only runtime path", () => {
  assert.match(runner, /verify-21h-fixture-schema\.mjs/);
  assert.match(runner, /pg17-21h-canonical-fixture\.sql/);
  assert.match(runner, /runtime-contract-21h-r3\.sql/);
  assert.match(runner, /PG17_TARGET_CLASS=LOCAL_ONLY/);
  const result = spawnSync(process.execPath, ["scripts/content-v3/verify-21h-fixture-schema.mjs"], {
    cwd: new URL("../../", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /LESSON_ID_PRESENT=NO/);
  assert.match(result.stdout, /FIXTURE_SCHEMA_MATCH=PASS/);
});

test("R3 runtime contract covers the required reveal matrix", () => {
  for (const marker of [
    "authorized reveal", "wrong user denied", "wrong lesson denied", "wrong question membership denied",
    "DRAFT denied", "REVIEW denied", "READY allowed", "N/A denied", "unsubmitted attempt denied",
    "historical revision remains pinned", "new draft revision is not substituted", "duplicate reveal is deterministic",
    "no answer or rationale before reveal",
  ]) assert.match(contract, new RegExp(marker));
});
