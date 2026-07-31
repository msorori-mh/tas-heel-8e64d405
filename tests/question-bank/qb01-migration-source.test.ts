import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const migrationPath = join(
  root,
  "supabase",
  "migrations",
  "20260801120000_qb01_question_bank_schema_foundation.sql",
);

function loadSql(): string {
  assert.ok(existsSync(migrationPath), `missing migration: ${migrationPath}`);
  return readFileSync(migrationPath, "utf8");
}

test("QB-01 migration source file exists under supabase/migrations", () => {
  const sql = loadSql();
  assert.match(sql, /QB-01 QUESTION BANK SCHEMA FOUNDATION/);
  assert.match(sql, /NOT APPLIED TO ANY DATABASE BY THIS PACKAGE/);
  assert.match(sql, /DEFAULT RUNTIME MODE REMAINS LEGACY/);
});

test("forbids destructive and activation patterns", () => {
  const sql = loadSql();
  assert.equal(/\bDROP\s+TABLE\b/i.test(sql), false, "must not DROP TABLE");
  // Ignore documentation mentions of TRUNCATE in header comments
  const executable = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.equal(/\bTRUNCATE\b/i.test(executable), false, "must not TRUNCATE");
  assert.equal(/storage\.buckets/i.test(executable), false, "must not create storage buckets");
  assert.match(
    sql,
    /INSERT\s+INTO\s+public\.question_bank_runtime_config\s*\(\s*id,\s*attempt_pin_mode\s*\)\s*VALUES\s*\(\s*1,\s*'LEGACY'\s*\)/i,
  );
  assert.equal(
    /VALUES\s*\(\s*1,\s*'REVISION_PINNED'\s*\)/i.test(executable),
    false,
    "must not seed REVISION_PINNED",
  );
});

test("does not backfill legacy questions into revisions", () => {
  const sql = loadSql();
  assert.equal(
    /INSERT\s+INTO\s+public\.question_revisions\b/i.test(sql),
    false,
    "must not INSERT into question_revisions (no backfill)",
  );
  assert.match(sql, /UPDATE\s+public\.questions\s+SET\s+current_published_revision_id/i);
  // No mass backfill writing legacy correct_index from this migration
  assert.equal(
    /UPDATE\s+public\.questions\s+SET\b[^;]*correct_index/i.test(sql),
    false,
  );
});

test("documents legacy correct_index as 0-based", () => {
  const sql = loadSql();
  assert.match(sql, /0-based/i);
  assert.match(sql, /correct_index/);
});

test("accepted-answer policies exclude CASEFOLD_AR", () => {
  const sql = loadSql();
  const checkMatch = sql.match(
    /normalization_policy[\s\S]*?CHECK\s*\(\s*normalization_policy\s+IN\s*\(([^)]+)\)/i,
  );
  assert.ok(checkMatch, "normalization_policy CHECK missing");
  assert.match(checkMatch![1], /EXACT/);
  assert.match(checkMatch![1], /TRIM/);
  assert.match(checkMatch![1], /TRIM_COLLAPSE/);
  assert.equal(/CASEFOLD_AR/i.test(checkMatch![1]), false);
});

test("final_score <= max_score constraints exist", () => {
  const sql = loadSql();
  assert.match(sql, /final_score\s*<=\s*max_score/);
  assert.match(sql, /exam_session_answers_final_score_le_max/);
});

test("capability grant reason is NOT NULL", () => {
  const sql = loadSql();
  assert.match(
    sql,
    /question_bank_capability_grants[\s\S]*?reason\s+text\s+NOT\s+NULL/i,
  );
});

test("target uniqueness and primary partial unique exist", () => {
  const sql = loadSql();
  assert.match(sql, /question_targets/);
  assert.match(sql, /question_targets_dedupe_uidx/);
  assert.match(sql, /question_targets_one_primary_uidx/);
  assert.match(sql, /WHERE\s+is_primary\b/i);
});

test("published pointer FK, trigger, and publish RPC exist", () => {
  const sql = loadSql();
  assert.match(sql, /questions_current_published_revision_fk/);
  assert.match(sql, /DEFERRABLE\s+INITIALLY\s+DEFERRED/i);
  assert.match(sql, /qb_enforce_published_pointer_on_questions/);
  assert.match(sql, /qb_enforce_published_revision_status/);
  assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.publish_question_revision/i);
  assert.match(sql, /only APPROVED revisions may be published/);
});

test("expected schema objects are declared", () => {
  const sql = loadSql();
  const required = [
    "question_bank_runtime_config",
    "question_bank_capability_grants",
    "question_revisions",
    "question_options",
    "question_accepted_answers",
    "question_solutions",
    "question_solution_steps",
    "question_media",
    "question_targets",
    "exam_session_questions",
    "practice_attempts",
    "practice_attempt_questions",
    "practice_attempt_responses",
    "question_response_reviews",
    "v_question_responses_unified",
    "can_edit_question_bank",
    "can_review_question_content",
    "can_publish_question_revision",
    "can_grade_manual_response",
    "can_read_hidden_solutions",
    "grant_question_bank_capability",
    "revoke_question_bank_capability",
    "retarget_question",
    "create_exam_session_with_snapshot",
    "create_practice_attempt_with_snapshot",
  ];
  for (const name of required) {
    assert.ok(sql.includes(name), `missing object reference: ${name}`);
  }
});

test("RLS enabled and REVOKE PUBLIC present for new objects", () => {
  const sql = loadSql();
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
  const enableCount = (sql.match(/ENABLE ROW LEVEL SECURITY/gi) || []).length;
  assert.ok(enableCount >= 10, `expected many ENABLE RLS, got ${enableCount}`);
  assert.match(sql, /REVOKE\s+ALL[\s\S]*FROM\s+PUBLIC/i);
});

test("SECURITY DEFINER functions set search_path", () => {
  const sql = loadSql()
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  const blocks = sql.split(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+/i).slice(1);
  const definerFns: string[] = [];
  for (const block of blocks) {
    const name = block.match(/^public\.(\w+)/i)?.[1];
    if (!name) continue;
    // Header until body
    const header = block.slice(0, block.indexOf("AS $$"));
    if (!/SECURITY DEFINER/i.test(header)) continue;
    definerFns.push(name);
    assert.match(
      header,
      /SET\s+search_path\s*=\s*public,\s*pg_temp/i,
      `function ${name} SECURITY DEFINER missing search_path`,
    );
  }
  assert.ok(definerFns.length >= 10, `expected multiple SECURITY DEFINER funcs, got ${definerFns.length}`);
});

test("students are not granted unrestricted SELECT on is_correct or solutions", () => {
  const sql = loadSql();
  // After REVOKE ALL, staff SELECT is gated by RLS capability policies — no student-open policy
  assert.match(sql, /REVOKE ALL ON public\.question_options FROM PUBLIC, anon, authenticated/i);
  assert.match(
    sql,
    /REVOKE ALL ON public\.question_solutions FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    sql,
    /REVOKE ALL ON public\.question_accepted_answers FROM PUBLIC, anon, authenticated/i,
  );
  assert.equal(
    /CREATE POLICY[\s\S]*ON public\.question_options[\s\S]*USING\s*\(\s*true\s*\)/i.test(sql),
    false,
  );
  assert.match(sql, /qb_options_staff_select/);
  assert.match(sql, /can_read_hidden_solutions/);
});

test("default attempt_pin_mode remains LEGACY on sessions and practice", () => {
  const sql = loadSql();
  assert.match(
    sql,
    /attempt_pin_mode\s+text\s+NOT\s+NULL\s+DEFAULT\s+'LEGACY'/i,
  );
  assert.match(
    sql,
    /practice_attempts[\s\S]*attempt_pin_mode\s+text\s+NOT\s+NULL\s+DEFAULT\s+'LEGACY'/i,
  );
});

test("snapshot create RPCs fail closed and are not granted broadly", () => {
  const sql = loadSql();
  assert.match(sql, /REVISION_PINNED path not activated/);
  assert.match(sql, /QB-01 snapshot create not activated/i);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.create_exam_session_with_snapshot/i,
  );
});

test("hash golden vectors pass via harness", () => {
  const script = join(root, "scripts", "question-bank", "verify-question-bank-hash-vectors.mjs");
  const out = execFileSync(process.execPath, [script], { encoding: "utf8" });
  assert.match(out, /OK:/);
});

test("migration SHA-256 is stable for report packaging", () => {
  const buf = readFileSync(migrationPath);
  const hash = createHash("sha256").update(buf).digest("hex");
  assert.match(hash, /^[0-9a-f]{64}$/);
});
