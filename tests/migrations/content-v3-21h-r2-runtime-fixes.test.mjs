import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, root), "utf8");
const migration = read(
  "supabase/migrations-pending/20260818210000_content_v3_21h_hardened_preflight.sql",
);
const diff = read("scripts/content-v3/visibility-diff-21h.sql");

function functionBody(sql, name) {
  const start = sql.indexOf(`FUNCTION public.${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = sql.indexOf("$$;", start);
  assert.notEqual(end, -1, `${name} must have a closed body`);
  return sql.slice(start, end);
}

function localPg17Url(value) {
  try {
    const url = new URL(value);
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

test("R2 visibility output contract is PG17 type-safe", () => {
  const output = diff.slice(
    diff.indexOf("SELECT 'EXPECTED_GAIN_COUNT'"),
    diff.indexOf("-- A zero result"),
  );
  for (const counter of [
    "expected_gain_count",
    "security_fix_count",
    "unexpected_gain_count",
    "unexpected_loss_count",
  ]) {
    assert.match(output, new RegExp(`${counter}::text`));
  }
  assert.match(output, /CASE\s+WHEN unexpected_gain_count = 0 AND unexpected_loss_count = 0/s);
});

test("R3 reveal RPC has no undefined alias and uses the canonical lesson-assessment path", () => {
  const body = functionBody(migration, "reveal_official_question_answer");
  assert.match(body, /FROM public\.practice_attempts pa/i);
  assert.match(body, /SELECT la\.lesson_id, paq\.question_revision_id/i);
  assert.match(body, /JOIN public\.lesson_assessments la\s+ON la\.id = pa\.lesson_assessment_id/i);
  assert.doesNotMatch(body, /pa\.lesson_id/i);
});

test("R2 reveal authorization covers correct attempt, user, lesson, and lifecycle state", () => {
  const body = functionBody(migration, "reveal_official_question_answer");
  assert.match(body, /pa\.id = _attempt_id/i);
  assert.match(body, /pa\.user_id = v_user/i);
  assert.match(body, /pa\.attempt_type = 'LESSON'/i);
  assert.match(body, /aq\.assessment_id = la\.id/i);
  assert.match(body, /aq\.question_id = paq\.logical_question_id/i);
  assert.match(body, /q\.lesson_id = la\.lesson_id/i);
  assert.match(body, /paq\.logical_question_id = _question_id/i);
  assert.match(body, /pa\.submitted_at IS NOT NULL/i);
  assert.match(body, /par\.submitted_at IS NOT NULL/i);
  assert.match(body, /lcl\.lesson_id = v_lesson/i);
  assert.match(body, /lcl\.status <> 'READY' OR lcl\.applicability = 'NA'/i);
  assert.match(body, /REVEAL_NOT_AUTHORIZED/i);
  assert.match(body, /LESSON_NOT_READY/i);
});

test("R2 reveal preserves revision pinning and prevents answer/rationale leakage", () => {
  const reveal = functionBody(migration, "reveal_official_question_answer");
  const initial = functionBody(migration, "get_lesson_official_questions");
  assert.match(reveal, /paq\.question_revision_id/i);
  assert.match(reveal, /a\.revision_id = v_revision/i);
  assert.match(reveal, /o\.question_revision_id = v_revision/i);
  assert.match(reveal, /r\.question_revision_id = v_revision/i);
  for (const answerKey of [
    "correct_index",
    "is_correct",
    "model_answer",
    "explanation",
    "why_correct",
    "why_wrong",
  ]) {
    assert.doesNotMatch(initial, new RegExp(`\\b${answerKey}\\b`, "i"), answerKey);
  }
  assert.match(reveal, /ANSWER_NOT_AVAILABLE/i);
});

test(
  "visibility diff runs against an available local PostgreSQL 17 target",
  { skip: !localPg17Url(process.env.TAMKEEN_PG17_LOCAL_URL ?? "") },
  () => {
    const psql = process.platform === "win32" ? "psql.exe" : "psql";
    const result = spawnSync(
      psql,
      [
        process.env.TAMKEEN_PG17_LOCAL_URL,
        "--no-psqlrc",
        "--set=ON_ERROR_STOP=1",
        `--file=${new URL("../../scripts/content-v3/visibility-diff-21h.sql", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (m) => m.slice(1))}`,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.doesNotMatch(
      `${result.stdout}\n${result.stderr}`,
      /UNION types bigint and text cannot be matched|SQLSTATE=42804/i,
    );
  },
);
