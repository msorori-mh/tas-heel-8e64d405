import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SQL = readFileSync(
  "supabase/migrations-pending/20260824000000_content_factory_11_publication.sql",
  "utf8",
);
const ASSERTS = readFileSync("scripts/content-factory/pg17/content-factory-11-assert.sql", "utf8");

test("replay re-derives answer-leak from the LIVE delivered text", () => {
  const replay = SQL.slice(SQL.indexOf("FUNCTION public.cf11_assert_replay_state"));
  assert.match(replay, /CF11_REPLAY_LIVE_STATE_CONFLICT: answerLeak/);
  assert.match(
    replay,
    /cf10_assert_no_answer_leak\('officialBookContent',\s*\n?\s*\(SELECT content FROM public\.lesson_book_contents/,
  );
  assert.match(replay, /cf10_assert_no_answer_leak\('mindMapHtml'/);
  assert.match(replay, /cf10_assert_no_answer_leak\('labExperimentHtml'/);
});

test("replay revalidates student gating and the exact 5 + 40 question corpus", () => {
  const replay = SQL.slice(SQL.indexOf("FUNCTION public.cf11_assert_replay_state"));
  assert.match(replay, /CF11_REPLAY_LIVE_STATE_CONFLICT: lessonGating/);
  assert.match(
    replay,
    /l\.is_free IS NOT DISTINCT FROM \(_plan->'lessonGating'->>'isFree'\)::boolean/,
  );
  assert.match(
    replay,
    /l\.visibility IS NOT DISTINCT FROM \(_plan->'lessonGating'->>'visibility'\)::boolean/,
  );
  assert.match(replay, /CF11_REPLAY_LIVE_STATE_CONFLICT: questionCounts/);
  assert.match(replay, /'officialCount'\)::integer IS DISTINCT FROM 5/);
  assert.match(replay, /'selfTestCount'\)::integer IS DISTINCT FROM 40/);
});

test("the durable write plan pins the gating the approval was granted under", () => {
  assert.match(SQL, /'schema','tamkeen\.content-factory-11\.write-plan\.v3'/);
  assert.match(SQL, /'lessonGating', jsonb_build_object\('isFree', lesson_row\.is_free,/);
  assert.match(SQL, /'visibility', lesson_row\.visibility,/);
  assert.doesNotMatch(SQL, /write-plan\.v2'/);
});

test("migration refuses to install over a legacy plan that carries no gating pin", () => {
  assert.match(SQL, /CF11_PREFLIGHT_LEGACY_PUBLICATION_WITHOUT_GATING_PIN/);
});

test("READY replay calls the full live revalidation before any early return", () => {
  const ready = SQL.slice(SQL.indexOf("FUNCTION public.golden_lesson_attest_cf11_ready"));
  const readyRow = ready.indexOf("IF ready_row.id IS NOT NULL THEN");
  const replayCall = ready.indexOf("cf11_assert_replay_state", readyRow);
  const earlyReturn = ready.indexOf("'idempotent', true", readyRow);
  assert.ok(readyRow > 0 && replayCall > readyRow);
  assert.ok(replayCall < earlyReturn, "replay must run before the idempotent return");
});

test("PG17 section P mutates every newly covered category and proves refusal", () => {
  assert.match(ASSERTS, /P\) CF11-R4 AUDIT/);
  for (const cat of [
    "answerLeak.bookContent",
    "answerLeak.html",
    "lessonGating.isFree",
    "lessonGating.visibility",
    "questions.unpublished",
  ]) {
    assert.ok(
      ASSERTS.includes(`cf11_assert_audit_replay_refuses('${cat}')`),
      `missing PG17 negative for ${cat}`,
    );
  }
});

test("PG17 section P proves the READY replay refuses too and appends no ledger row", () => {
  assert.match(
    ASSERTS,
    /golden_lesson_attest_cf11_ready\('51000000-0000-0000-0000-000000000001',\s*\n?\s*attester,/,
  );
  assert.match(ASSERTS, /CF11_EXPECTED_AUDIT_REPLAY_ZERO_WRITES/);
  assert.match(ASSERTS, /CF11_EXPECTED_AUDIT_REPLAY_FULL_SET/);
});
