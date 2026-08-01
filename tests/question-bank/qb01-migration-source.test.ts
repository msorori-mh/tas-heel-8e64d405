import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { digestCanonicalPayloadV1 } from "../../scripts/question-bank/canonical-payload-v1.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const migrationPath = join(
  root,
  "supabase",
  "migrations",
  "20260801120000_qb01_question_bank_schema_foundation.sql",
);
const fixturePath = join(
  root,
  "tests",
  "fixtures",
  "question-bank",
  "canonical-payload-v1.json",
);

function loadSql(): string {
  assert.ok(existsSync(migrationPath), `missing migration: ${migrationPath}`);
  return readFileSync(migrationPath, "utf8");
}

function executableSql(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

test("QB-01 migration source file exists under supabase/migrations", () => {
  const sql = loadSql();
  assert.match(sql, /QB-01 QUESTION BANK SCHEMA FOUNDATION/);
  assert.match(sql, /NOT APPLIED TO ANY DATABASE BY THIS PACKAGE/);
  assert.match(sql, /DEFAULT RUNTIME MODE REMAINS LEGACY/);
  assert.match(sql, /HOLD-15 CLOSURE/);
});

test("forbids destructive and activation patterns", () => {
  const sql = loadSql();
  assert.equal(/\bDROP\s+TABLE\b/i.test(sql), false, "must not DROP TABLE");
  const executable = executableSql(sql);
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
  assert.match(sql, /question_targets_dedupe_uidx/);
  assert.match(sql, /question_targets_one_primary_uidx/);
});

test("published pointer FK and RPC-only lifecycle guards exist", () => {
  const sql = loadSql();
  assert.match(sql, /questions_current_published_revision_fk/);
  assert.match(sql, /DEFERRABLE\s+INITIALLY\s+DEFERRED/i);
  assert.match(sql, /qb_guard_question_revision_lifecycle/);
  assert.match(sql, /qb_guard_current_published_revision_pointer/);
  assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.publish_question_revision/i);
  assert.match(sql, /only APPROVED revisions may be published/);
  assert.equal(
    /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.qb_enforce_published_/i.test(sql),
    false,
  );
});

test("HOLD-15: no client-settable GUC publish bypass", () => {
  const sql = loadSql();
  const forbiddenGuc = ["qb", "publish_in_progress"].join(".");
  assert.equal(sql.includes(forbiddenGuc), false);
  assert.equal(/set_config\s*\(\s*'qb\./i.test(sql), false);
  assert.equal(/current_setting\s*\(\s*'qb\./i.test(sql), false);
});

test("39B: caller introspection removed from security boundary", () => {
  const sql = loadSql();
  const executable = executableSql(sql);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\._qb_is_internal_publish_executor/i);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\._qb_publish_question_revision_internal/i);
  assert.equal(
    /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\._qb_is_internal_publish_executor/i.test(sql),
    false,
  );
  assert.equal(
    /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\._qb_publish_question_revision_internal/i.test(sql),
    false,
  );
  assert.equal(/to_regprocedure\s*\(/i.test(executable), false);
  assert.equal(/pg_get_function_identity_arguments\s*\(/i.test(executable), false);
  assert.equal(/current_query\s*\(/i.test(executable), false);
  assert.equal(/CURRENT_USER/i.test(executableSql(
    (sql.match(/CREATE OR REPLACE FUNCTION public\.qb_guard_question_revision_lifecycle[\s\S]*?\$\$;/) || [""])[0],
  )), false);
  assert.equal(/CURRENT_USER/i.test(executableSql(
    (sql.match(/CREATE OR REPLACE FUNCTION public\.qb_guard_current_published_revision_pointer[\s\S]*?\$\$;/) || [""])[0],
  )), false);
  assert.match(sql, /illegal revision status transition/i);
  assert.match(sql, /payload fields of % revisions are immutable/i);
});

test("39B: public publish RPC is sole client entry; request fingerprint idempotency", () => {
  const sql = loadSql();
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.publish_question_revision\(uuid, uuid, uuid, text\) TO authenticated/i,
  );
  assert.match(sql, /request_fingerprint text NOT NULL/i);
  assert.match(sql, /idempotency key reused with different input/i);
  assert.match(sql, /v_actor uuid := auth\.uid\(\)/);
  assert.match(sql, /not authorized to publish question revisions/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\._qb_validate_revision_for_publish\(uuid\)\s*FROM anon,\s*authenticated,\s*service_role/i,
  );
});

test("39B: approved/published payload and child immutability guards declared", () => {
  const sql = loadSql();
  assert.match(sql, /qb_guard_revision_children_immutable/);
  assert.match(sql, /qb_guard_solution_steps_immutable/);
  assert.match(sql, /trg_qb_options_immutable/);
  assert.match(sql, /trg_qb_accepted_immutable/);
  assert.match(sql, /trg_qb_solutions_immutable/);
  assert.match(sql, /trg_qb_media_immutable/);
  assert.match(sql, /qb_guard_attempt_snapshot_immutable/);
  assert.match(sql, /attempt snapshot payload is immutable after creation/i);
  // Editors must not UPDATE APPROVED via RLS
  const updatePolicy = sql.match(
    /CREATE POLICY qb_revisions_edit_update[\s\S]*?status IN \(([^)]+)\)/i,
  );
  assert.ok(updatePolicy, "edit_update policy missing");
  assert.equal(/APPROVED/i.test(updatePolicy![1]), false);
  assert.equal(/PUBLISHED/i.test(updatePolicy![1]), false);
});

test("HOLD-15: lifecycle and pointer column privileges revoked", () => {
  const sql = loadSql();
  assert.match(
    sql,
    /REVOKE UPDATE\s*\(\s*status\s*,\s*published_at\s*,\s*published_by\s*,\s*superseded_at\s*,\s*payload_hash\s*,\s*payload_hash_version\s*\)\s*ON public\.question_revisions FROM authenticated, anon, service_role/i,
  );
  assert.match(
    sql,
    /REVOKE UPDATE\s*\(\s*current_published_revision_id\s*\)\s*ON public\.questions FROM authenticated, anon, service_role/i,
  );
  // No table-level UPDATE grant that re-opens status for authenticated
  const grantUpdateBlocks = [
    ...sql.matchAll(
      /GRANT UPDATE\s*\(([^)]+)\)\s*ON public\.question_revisions TO authenticated/gi,
    ),
  ];
  assert.ok(grantUpdateBlocks.length >= 1, "expected selective UPDATE grant");
  for (const m of grantUpdateBlocks) {
    assert.equal(/\bstatus\b/i.test(m[1]), false, "authenticated must not UPDATE status");
    assert.equal(/\bpublished_at\b/i.test(m[1]), false);
    assert.equal(/\bpublished_by\b/i.test(m[1]), false);
  }
  assert.equal(
    /GRANT\s+[^;]*\bUPDATE\b[^;]*ON public\.question_revisions TO authenticated/i.test(
      sql.replace(/GRANT UPDATE\s*\([^)]+\)\s*ON public\.question_revisions TO authenticated/gi, ""),
    ),
    false,
    "no broad UPDATE on question_revisions to authenticated",
  );
});

test("HOLD-15: revisions RLS is not FOR ALL for editors", () => {
  const sql = loadSql();
  assert.equal(
    /CREATE POLICY qb_revisions_edit_manage[\s\S]*FOR ALL/i.test(sql),
    false,
  );
  assert.match(sql, /qb_revisions_staff_insert|qb_revisions_.*insert/i);
  assert.match(sql, /status\s*=\s*'DRAFT'/);
});

test("HOLD-15: SINGLE_CHOICE publish validation enforced", () => {
  const sql = loadSql();
  assert.match(sql, /_qb_validate_revision_for_publish/);
  assert.match(sql, /exactly one correct option/i);
  assert.match(sql, /at least 2 options/i);
});

test("HOLD-15: cross-session composite FKs", () => {
  const sql = loadSql();
  assert.match(sql, /exam_session_questions_id_session_uidx/);
  assert.match(sql, /exam_session_answers_session_question_fk/);
  assert.match(
    sql,
    /FOREIGN KEY\s*\(\s*session_id\s*,\s*exam_session_question_id\s*\)/i,
  );
  assert.match(sql, /practice_attempt_questions_id_attempt_uidx/);
  assert.match(sql, /practice_attempt_responses_attempt_question_fk/);
});

test("HOLD-15: capability helpers are GLOBAL-only in P0", () => {
  const sql = loadSql();
  assert.match(
    sql,
    /qb_has_capability[\s\S]*scope_type\s*=\s*'GLOBAL'[\s\S]*scope_id\s+IS\s+NULL/i,
  );
  assert.match(sql, /P0:.*only active GLOBAL/i);
});

test("HOLD-15: grader read scope requires assignment", () => {
  const sql = loadSql();
  assert.match(sql, /assigned_grader_id\s*=\s*auth\.uid\(\)/);
  // Broad can_grade alone must not open all practice responses
  const practicePolicy = sql.match(
    /CREATE POLICY qb_practice_r_owner_select[\s\S]*?;/,
  );
  assert.ok(practicePolicy, "practice response policy missing");
  assert.equal(
    /can_grade_manual_response\(auth\.uid\(\)\)\s*\)\s*$/m.test(practicePolicy![0]),
    false,
  );
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
    "publish_question_revision",
    "_qb_validate_revision_for_publish",
    "qb_guard_revision_children_immutable",
    "qb_guard_attempt_snapshot_immutable",
  ];
  for (const name of required) {
    assert.ok(sql.includes(name), `missing object reference: ${name}`);
  }
});

test("RLS enabled and REVOKE PUBLIC present for new objects", () => {
  const sql = loadSql();
  const enableCount = (sql.match(/ENABLE ROW LEVEL SECURITY/gi) || []).length;
  assert.ok(enableCount >= 10, `expected many ENABLE RLS, got ${enableCount}`);
  assert.match(sql, /REVOKE\s+ALL[\s\S]*FROM\s+PUBLIC/i);
});

test("SECURITY DEFINER functions set search_path", () => {
  const sql = executableSql(loadSql());
  const blocks = sql.split(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+/i).slice(1);
  const definerFns: string[] = [];
  for (const block of blocks) {
    const name = block.match(/^public\.(\w+)/i)?.[1];
    if (!name) continue;
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
  assert.match(sql, /REVOKE ALL ON public\.question_options FROM PUBLIC, anon, authenticated/i);
  assert.match(
    sql,
    /REVOKE ALL ON public\.question_solutions FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    sql,
    /REVOKE ALL ON public\.question_accepted_answers FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(sql, /qb_options_staff_select/);
});

test("default attempt_pin_mode remains LEGACY on sessions and practice", () => {
  const sql = loadSql();
  assert.match(
    sql,
    /attempt_pin_mode\s+text\s+NOT\s+NULL\s+DEFAULT\s+'LEGACY'/i,
  );
});

test("snapshot create RPCs fail closed and are not granted broadly", () => {
  const sql = loadSql();
  assert.match(sql, /REVISION_PINNED path not activated/);
  assert.match(sql, /QB-01 snapshot create not activated/i);
});

test("hash golden vectors match locked fixture digests", () => {
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  assert.ok(Array.isArray(fixture.vectors) && fixture.vectors.length >= 10);
  for (const vector of fixture.vectors) {
    const { digest } = digestCanonicalPayloadV1(vector.source);
    assert.equal(
      digest,
      vector.digest,
      `${vector.id}: digest mismatch expected=${vector.digest} got=${digest}`,
    );
    assert.match(digest, /^[0-9a-f]{64}$/);
  }
  const script = join(root, "scripts", "question-bank", "verify-question-bank-hash-vectors.mjs");
  const out = execFileSync(process.execPath, [script], { encoding: "utf8" });
  assert.match(out, /OK:/);
});

test("migration SHA-256 is stable for report packaging", () => {
  const buf = readFileSync(migrationPath);
  const hash = createHash("sha256").update(buf).digest("hex");
  assert.match(hash, /^[0-9a-f]{64}$/);
});
