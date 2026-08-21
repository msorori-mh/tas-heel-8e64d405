import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL(
  "../../src/routes/_authenticated/lessons.$lessonId.tsx",
  import.meta.url,
);
const migrationPath = new URL(
  "../../supabase/migrations-pending/20260821010000_lesson_question_role_separation.sql",
  import.meta.url,
);
const contentV3Path = new URL("../../src/lib/lessons/content-v3.ts", import.meta.url);

test("seven-capability contract orders official questions sixth and self-test seventh", async () => {
  const source = await readFile(contentV3Path, "utf8");
  const capabilityBlock = source.slice(
    source.indexOf("export const V3_CAPABILITIES"),
    source.indexOf("] as const;", source.indexOf("export const V3_CAPABILITIES")),
  );
  assert.ok(capabilityBlock.indexOf('"officialBookQuestions"') < capabilityBlock.indexOf('"selfTest"'));
  assert.match(source, /selfTest: "اختبر فهمك"/);
  assert.match(source, /officialBookQuestions: "REQUIRED"/);
  assert.match(source, /selfTest: "REQUIRED"/);
});

test("lesson route uses distinct role-filtered RPCs and no generic mixed quiz RPC", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /get_lesson_official_questions/);
  assert.match(source, /get_lesson_self_test_questions/);
  assert.match(source, /reveal_lesson_official_question_answer/);
  assert.match(source, /check_lesson_self_test_question/);
  assert.doesNotMatch(source, /get_lesson_quiz_questions/);
  assert.doesNotMatch(source, /check_lesson_question/);
});

test("pending SQL filters by semantic role and omits answers from initial payloads", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /educational_label = 'OFFICIAL_BOOK_QUESTION'/);
  assert.match(sql, /educational_label = 'SELF_TEST'/);
  assert.match(sql, /interaction_type = 'SINGLE_CHOICE'/);
  assert.match(sql, /grading_mode = 'AUTO_SINGLE'/);

  const officialInitial = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.get_lesson_official_questions"),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.get_lesson_self_test_questions"),
  );
  const selfTestInitial = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.get_lesson_self_test_questions"),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.reveal_lesson_official_question_answer"),
  );
  for (const initialPayload of [officialInitial, selfTestInitial]) {
    assert.doesNotMatch(initialPayload, /correct_index/i);
    assert.doesNotMatch(initialPayload, /model_answer/i);
    assert.doesNotMatch(initialPayload, /why_wrong/i);
  }
  assert.match(sql, /FROM public\.question_targets qt/);
  assert.match(sql, /qt\.lesson_id = _lesson_id/);
  assert.match(sql, /reveal_lesson_official_question_answer\([\s\S]*_lesson_id uuid/);
  assert.match(sql, /check_lesson_self_test_question\([\s\S]*_lesson_id uuid/);
});

test("database candidate is pending/source-only, never an applied migration", () => {
  assert.match(migrationPath.pathname, /migrations-pending/);
});
