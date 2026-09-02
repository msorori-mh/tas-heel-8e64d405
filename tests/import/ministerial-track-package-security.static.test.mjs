import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const importSql = readFileSync(
  "supabase/migrations/20260912010000_ministerial_track_package_import.sql",
  "utf8",
);
const adenSql = readFileSync(
  "supabase/migrations/20260912020000_ministerial_aden_text_answers.sql",
  "utf8",
);
const adminApi = readFileSync("src/lib/ministerial/ministerial-admin-api.ts", "utf8");
const studentApi = readFileSync("src/lib/ministerial/ministerial-student-api.ts", "utf8");
const sessionRoute = readFileSync(
  "src/routes/_authenticated/ministerial-exams.sessions.$sessionId.tsx",
  "utf8",
);

test("package writes stay RPC-only, authorized, draft-only, pinned and fingerprinted", () => {
  assert.match(adminApi, /ministerial_track_package_prepare/);
  assert.match(adminApi, /ministerial_track_package_execute/);
  assert.doesNotMatch(
    adminApi,
    /\.from\(["'](?:ministerial_exam_models|questions)["']\)\.(?:insert|update|delete)/,
  );
  assert.match(importSql, /is_content_staff\(v_actor\)/);
  assert.match(importSql, /source_fingerprint/);
  assert.match(importSql, /_expected_fingerprint/);
  assert.match(importSql, /published_revision_id/);
  assert.match(importSql, /_qb_compute_revision_payload_hash/);
  assert.match(importSql, /can_publish_ministerial_model/);
  assert.match(importSql, /'published_models', 0/);
  assert.match(importSql, /status, created_by,[\s\S]*'draft'/);
  assert.match(importSql, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon/);
});

test("Sanaa and Aden contracts fail closed and never overwrite existing content", () => {
  assert.match(importSql, /v_track_code NOT IN \('sanaa', 'aden'\)/);
  assert.match(importSql, /v_option_count <> 4/);
  assert.match(importSql, /ADEN_PACKAGE_TEXT_CONTRACT_INVALID/);
  assert.match(importSql, /MODEL_IDENTITY_IMMUTABLE/);
  assert.match(importSql, /MODEL_CONTENT_CONFLICT/);
  assert.match(importSql, /v_existing\.source_fingerprint = v_model_hash/);
  assert.doesNotMatch(importSql, /UPDATE public\.questions\s+SET question_text/);
});

test("Aden answer key remains server-only until an attempted reveal", () => {
  assert.match(adenSql, /answer_ministerial_text_question/);
  assert.match(adenSql, /v_track_code IS DISTINCT FROM 'aden'/);
  assert.match(adenSql, /ANSWER_REQUIRED_BEFORE_REVEAL/);
  assert.match(adenSql, /REVEAL_NOT_ALLOWED_IN_STRICT/);
  assert.match(adenSql, /CREATE OR REPLACE FUNCTION public\.submit_ministerial_exam_session/);
  assert.match(adenSql, /v_is_aden := v_track_code = 'aden'/);
  assert.match(adenSql, /nullif\(btrim\(coalesce\(v_row\.response_text, ''\)\), ''\)/);
  assert.match(adenSql, /'self_review', v_is_aden/);
  assert.match(adenSql, /'reveal', false/);
  const stateFunction = adenSql.slice(
    adenSql.indexOf("CREATE OR REPLACE FUNCTION public.get_ministerial_session_state"),
    adenSql.indexOf("CREATE OR REPLACE FUNCTION public.get_ministerial_session_result"),
  );
  assert.doesNotMatch(stateFunction, /question_solutions|model_answer/);
  assert.match(studentApi, /answerMinisterialTextQuestion/);
  assert.match(sessionRoute, /إظهار الإجابة النموذجية/);
  assert.match(sessionRoute, /saveAndRevealTextAnswer/);
});

test("audit metadata excludes raw questions and answers", () => {
  const auditSection = importSql.slice(importSql.indexOf("INSERT INTO public.audit_logs"));
  assert.doesNotMatch(auditSection, /question_text|model_answer|response_text/);
});
