// Static policy checks for SECONDARY-EXAM-ANSWERS-POSTGREST-LEAK-HARDENING-01.
// Run from the repo root with:
//   node --test tests/security/
// Text-level assertions only: no database, no network.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const MIGRATIONS_DIR = new URL("../../supabase/migrations/", import.meta.url);
const HARDENING_NAME = "20260731120000_exam_answers_postgrest_leak_hardening.sql";

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const read = (name) => readFileSync(new URL(name, MIGRATIONS_DIR), "utf8");
const hardening = read(HARDENING_NAME);

const SAFE_COLUMNS = [
  "id",
  "lesson_id",
  "subject_id",
  "question_text",
  "options",
  "question_type",
  "year",
  "sort_order",
  "created_at",
  "unit",
  "semester",
  "code",
];

test("table-level SELECT on questions is revoked from client roles", () => {
  // Critical line: a table-level GRANT would silently re-open the answer
  // columns regardless of any column-level REVOKE.
  assert.match(hardening, /REVOKE SELECT ON public\.questions FROM anon;/);
  assert.match(hardening, /REVOKE SELECT ON public\.questions FROM authenticated;/);
});

test("student payload allowlist grants exactly the safe columns", () => {
  const grantMatch = hardening.match(
    /GRANT SELECT \(([^)]*)\) ON public\.questions TO authenticated;/,
  );
  assert.ok(grantMatch, "column allowlist GRANT must exist");
  const granted = grantMatch[1].split(",").map((c) => c.trim());
  for (const col of SAFE_COLUMNS) {
    assert.ok(granted.includes(col), `safe column missing from allowlist: ${col}`);
  }
  assert.ok(!granted.includes("correct_index"), "correct_index must never be granted");
  assert.ok(!granted.includes("explanation"), "explanation must never be granted");
});

test("answer columns are explicitly revoked from anon and authenticated", () => {
  assert.match(
    hardening,
    /REVOKE SELECT \(correct_index, explanation\) ON public\.questions FROM anon, authenticated;/,
  );
});

test("service_role keeps full access for server-side paths", () => {
  assert.match(hardening, /GRANT ALL ON public\.questions TO service_role;/);
});

test("no later migration re-opens table-level SELECT on questions", () => {
  const later = migrationFiles.filter((f) => f > HARDENING_NAME);
  for (const f of later) {
    const sql = read(f);
    assert.doesNotMatch(
      sql,
      /GRANT (SELECT|ALL) ON (ALL TABLES IN SCHEMA public|public\.questions) TO (anon|authenticated)/,
      `${f} re-grants table-level SELECT on questions to a client role — this would re-open correct_index/explanation`,
    );
  }
});

test("hardening migration contains no destructive, financial, or storage changes", () => {
  const code = hardening
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(code, /\b(DELETE FROM|DROP TABLE|TRUNCATE|UPDATE public\.)\b/i);
  assert.doesNotMatch(code, /wallet|payment|subscription|storage\./i);
  assert.doesNotMatch(code, /CREATE POLICY|DROP POLICY|ALTER POLICY/i);
});

test("exam session state reveals answers only after submission", () => {
  const examSql = migrationFiles.map(read).join("\n");
  assert.match(examSql, /'correct_index', CASE WHEN v_reveal THEN q\.correct_index ELSE NULL END/);
  assert.match(examSql, /'explanation', CASE WHEN v_reveal THEN q\.explanation ELSE NULL END/);
  assert.match(examSql, /v_reveal := \(v_session\.status <> 'in_progress'\)/);
});

test("lesson quiz question list RPC never returns the answer key", () => {
  const quizMigration = migrationFiles
    .map((f) => [f, read(f)])
    .find(([, sql]) => sql.includes("FUNCTION public.get_lesson_quiz_questions"));
  assert.ok(quizMigration, "get_lesson_quiz_questions definition not found");
  const sql = quizMigration[1];
  const fnStart = sql.indexOf("FUNCTION public.get_lesson_quiz_questions");
  const fnBody = sql.slice(fnStart, sql.indexOf("$$;", fnStart));
  assert.doesNotMatch(fnBody, /correct_index|explanation/);
  assert.match(fnBody, /auth\.uid\(\) IS NULL THEN RETURN/);
  assert.match(fnBody, /can_access_lesson/);
});

test("check_lesson_question reveals only behind auth and lesson access", () => {
  const sql = migrationFiles.map(read).join("\n");
  const fnStart = sql.indexOf("FUNCTION public.check_lesson_question");
  assert.ok(fnStart >= 0, "check_lesson_question definition not found");
  const fnBody = sql.slice(fnStart, sql.indexOf("$$;", fnStart));
  assert.match(fnBody, /auth\.uid\(\) IS NULL THEN RAISE EXCEPTION 'unauthorized'/);
  assert.match(fnBody, /can_access_lesson/);
});

test("client code never selects answer columns from questions", () => {
  const srcDir = new URL("../../src/", import.meta.url);
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir)],
    );
  const files = walk(srcDir).filter((u) => /\.(ts|tsx)$/.test(u.pathname));
  for (const f of files) {
    const code = readFileSync(f, "utf8");
    for (const m of code.matchAll(
      /\.select\(\s*[`]([^`]*)[`]|\.select\(\s*"([^"]*)"|\.select\(\s*'([^']*)'/g,
    )) {
      const cols = m[1] ?? m[2] ?? m[3];
      assert.doesNotMatch(
        cols,
        /correct_index|explanation/,
        `${f.pathname.split("/src/")[1]} selects answer columns directly`,
      );
    }
  }
});
