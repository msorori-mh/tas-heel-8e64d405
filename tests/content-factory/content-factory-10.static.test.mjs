import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(
  "supabase/migrations-pending/20260819230000_content_factory_10_domain_materialization.sql",
  "utf8",
);
const assertSql = readFileSync("scripts/content-factory/pg17/content-factory-10-assert.sql", "utf8");
const rehearse = readFileSync("scripts/content-factory/pg17/rehearse-content-factory-04.sh", "utf8");

test("CF10 materializes the core capabilities into domain tables (HTML deferred to CF11)", () => {
  for (const table of [
    "lesson_book_contents",
    "lesson_explanations",
    "lesson_summaries",
    "questions",
    "question_revisions",
    "question_targets",
    "lesson_assessments",
    "lesson_capability_lifecycle",
  ]) {
    assert.match(sql, new RegExp(`INSERT INTO public\\.${table}\\b`));
  }
  // CF10-R6/R7: zero HTML writes into legacy lesson_resources; the bytes stay in staging.
  assert.doesNotMatch(sql, /INSERT INTO public\.lesson_resources\b/);
  assert.match(sql, /CF10_HTML_LEGACY_ROW_FORBIDDEN/);
  assert.match(sql, /'deferred_to_cf11',true/);
  assert.match(sql, /'status','DRAFT'/);
  // CF10-R4: lifecycle rows are always DRAFT; applicability is copied verbatim from the staged
  // entry (REQUIRED / OPTIONAL / NA) and never hard-coded.
  assert.match(sql, /'DRAFT', expected_applicability::public\.capability_applicability/);
  assert.match(sql, /SELECT capability, lifecycle_capability, applicability\s*\n\s*FROM public\.golden_lesson_domain_stage_entries/);
  assert.doesNotMatch(sql, /applicability'\s*,\s*'REQUIRED'/);
  assert.match(sql, /CF10_LIFECYCLE_STAGED_SET_INVALID/);
});

test("CF10-R7 closes the four independent-review blockers", () => {
  // (2) lesson_resources is entirely outside the immutable seed attestation.
  const seedFn = sql.slice(
    sql.indexOf("FUNCTION public.cf10_seed_state_sha256"),
    sql.indexOf("FUNCTION public.cf10_html_publication_pending"),
  );
  assert.ok(seedFn.length > 200);
  assert.doesNotMatch(seedFn, /FROM public\.lesson_resources/);
  assert.match(seedFn, /'resources','cf10-owns-no-lesson-resources'/);
  // (3) the HTML READY guard is unspoofable: no lesson_resources bypass at all.
  const guard = sql.slice(sql.indexOf("FUNCTION public.cf10_block_ready_before_html_publication"));
  assert.doesNotMatch(guard, /lesson_resources/);
  assert.match(guard, /NEW\.draft_hash IS NOT NULL THEN/);
  assert.doesNotMatch(sql, /cf10_html_publication_pending\(NEW\.lesson_id/);
  // (4) binding_id is NOT NULL in the DDL itself.
  assert.match(sql, /binding_id uuid NOT NULL REFERENCES public\.golden_lesson_identity_bindings/);
  // PG17 rehearsal proves the spoofed row and the NOT NULL constraint.
  for (const marker of [
    "a spoofed cf11_published_at row does not clear the pending flag",
    "a spoofed CF11 row never opens the lesson to students",
    "ledger binding_id is NOT NULL in the DDL",
    "a CF11 resource addition does not break replay",
    "CF10 wrote no legacy lesson_resources row for the HTML capabilities",
  ]) {
    assert.ok(assertSql.includes(marker), `missing assertion: ${marker}`);
  }
});

test("CF10-R2 keeps the question bank DRAFT-only (production schema contract)", () => {
  // assessment membership requires a PUBLISHED revision, so CF10 must defer it.
  const code = sql.replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(code, /INSERT INTO public\.assessment_questions\b/);
  assert.doesNotMatch(code, /status[^\n]*'published'/i);
  assert.doesNotMatch(code, /published_at\s*(=|,)\s*now\(\)/);
  assert.doesNotMatch(code, /SET\s+current_published_revision_id/i);
  assert.match(code, /'DRAFT'::text|'DRAFT'/);
  assert.match(sql, /_qb_compute_revision_payload_hash/);
  assert.match(sql, /source_payload_hash/);
  assert.match(sql, /assessment_membership_deferred/);
});


test("CF10 never creates curriculum, publishes, or deletes", () => {
  for (const table of ["grades", "curriculum_tracks", "subjects", "subject_curriculum_tracks", "units"]) {
    assert.doesNotMatch(sql, new RegExp(`INSERT INTO public\\.${table}\\b`));
  }
  assert.doesNotMatch(sql, /DELETE FROM public\./);
  // CF10 never promotes: no publication writes and no READY assignment.
  // (Read-only `status = 'READY'` predicates inside the visibility gate are fine.)
  assert.doesNotMatch(sql, /SET\s+publication_status\s*=|SET\s+status\s*=\s*'READY'/i);
  assert.doesNotMatch(sql, /'READY'[^\n]*--\s*written/);
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
  // R5: a bound EXECUTE never creates a lesson shell; the shell must pre-exist.
  assert.match(sql, /CF10_IDENTITY_BINDING_LESSON_MISMATCH/);
  assert.match(assertSql, /options carry no answer key/);
  assert.match(assertSql, /rich replay is idempotent/);
});

test("CF10-R3 ships the server-side student visibility gate", () => {
  for (const fn of [
    "lesson_is_editorially_managed",
    "lesson_student_visible",
    "lesson_student_content_gate",
    "lessons_student_visible",
  ]) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\b`));
  }
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.can_access_lesson\b/);
  assert.match(sql, /is_content_staff\(auth\.uid\(\)\) OR public\.lesson_student_visible/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.lesson_student_content_gate\(uuid\) TO authenticated/);
});

test("CF10-R3 adds identity, lifecycle and counter hardening", () => {
  assert.match(sql, /CF10_IDENTITY_CONFLICT/);
  assert.match(sql, /CF10_LIFECYCLE_CONFLICT/);
  assert.match(sql, /GET DIAGNOSTICS/);
  assert.match(sql, /domain_writes := domain_writes \+ rc/);
});

test("CF10-R4 PG17 rehearsal asserts collisions and all-or-nothing student blindness", () => {
  for (const marker of [
    "gate hides the all-DRAFT managed lesson",
    "all-DRAFT: zero questions",
    "gate keeps unmanaged legacy lessons visible",
    "content staff still see DRAFT questions",
    "all REQUIRED READY: the completed lesson appears",
    "1/7 READY: lesson still hidden",
    "6/7 READY: lesson still hidden",
    "lifecycle applicability mirrors the staged entries exactly",
    "staged OPTIONAL capabilities stay OPTIONAL",
    "staged NA capability stays NA",
    "exact staged capability set = 7",
    "OPTIONAL and NA capabilities are still DRAFT while the gate opens",
    "OPTIONAL capability never blocks visibility",
    "NA capability does not block visibility",
    "a managed lesson with zero REQUIRED rows stays hidden",
    "a REQUIRED REVIEW capability closes the gate again",
    "idempotent replay performs zero writes",
    "CF10_EXPECTED_IDENTITY_CONFLICT",
    "CF10_EXPECTED_LIFECYCLE_CONFLICT",
    "CF10_EXPECTED_SELFTEST_TEXT_CONFLICT",
    "CF10_EXPECTED_ASSESSMENT_CONFLICT",
  ]) {
    assert.ok(assertSql.includes(marker), `missing assertion: ${marker}`);
  }
});
