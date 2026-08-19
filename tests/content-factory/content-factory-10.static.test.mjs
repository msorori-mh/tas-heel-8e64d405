import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(
  "supabase/migrations-pending/20260819230000_content_factory_10_domain_materialization.sql",
  "utf8",
);
const assertSql = readFileSync("scripts/content-factory/pg17/content-factory-10-assert.sql", "utf8");
const rehearse = readFileSync("scripts/content-factory/pg17/rehearse-content-factory-04.sh", "utf8");

test("CF10 materializes the seven capabilities into domain tables", () => {
  for (const table of [
    "lesson_book_contents",
    "lesson_explanations",
    "lesson_summaries",
    "lesson_resources",
    "questions",
    "lesson_assessments",
    "assessment_questions",
    "lesson_capability_lifecycle",
  ]) {
    assert.match(sql, new RegExp(`INSERT INTO public\\.${table}\\b`));
  }
  assert.match(sql, /'status','DRAFT'/);
  assert.match(sql, /'DRAFT', 'REQUIRED'/);
});

test("CF10 never creates curriculum, publishes, or deletes", () => {
  for (const table of ["grades", "curriculum_tracks", "subjects", "subject_curriculum_tracks", "units"]) {
    assert.doesNotMatch(sql, new RegExp(`INSERT INTO public\\.${table}\\b`));
  }
  assert.doesNotMatch(sql, /DELETE FROM public\./);
  assert.doesNotMatch(sql, /publication_status\s*=|status\s*=\s*'READY'/);
  assert.match(sql, /CF10_SUBJECT_NOT_EXACTLY_ONE/);
});

test("CF10 is fail-closed, gated, idempotent and admin-only", () => {
  for (const guard of [
    "CF10_ADMIN_REQUIRED",
    "CF10_VERIFIED_BUNDLE_IDENTITY_MISMATCH",
    "CF10_PAYLOAD_HASH_MISMATCH",
    "CF10_EMPTY_PAYLOAD",
    "CF10_STAGED_CAPABILITY_SET_INVALID",
    "CF10_ANSWER_COMPANION_MISSING",
    "CF10_WRITE_PLAN_HASH_MISMATCH",
    "CF10_IDEMPOTENCY_KEY_REQUIRED",
    "CF10_REPLAY_CONFLICT",
    "CF10_CONTENT_HASH_CONFLICT",
  ]) {
    assert.match(sql, new RegExp(guard));
  }
  assert.match(sql, /GRANT EXECUTE[^;]+TO service_role/s);
  assert.match(sql, /REVOKE ALL[^;]+authenticated/s);
});

test("CF10 keeps answers out of student-visible rows", () => {
  assert.match(sql, /cf10_assert_no_answer_leak/);
  assert.match(sql, /official_question_answers/);
  assert.match(sql, /question_option_rationales/);
  assert.match(sql, /is_correct\s*\)?\s*\n?[^;]*false/s);
  assert.match(sql, /correct_index[\s\S]{0,400}-1/);
});

test("CF10 PG17 rehearsal is wired and asserts the rich path", () => {
  assert.match(rehearse, /content-factory-10-fixture\.sql/);
  assert.match(rehearse, /20260819230000_content_factory_10_domain_materialization\.sql/);
  assert.match(rehearse, /content-factory-10-assert\.sql/);
  assert.match(assertSql, /PASS_CONTENT_FACTORY_10_PG17/);
  assert.match(assertSql, /missing lesson created exactly once/);
  assert.match(assertSql, /options carry no answer key/);
  assert.match(assertSql, /rich replay is idempotent/);
});
