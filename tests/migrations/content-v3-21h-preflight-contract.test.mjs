import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, root), "utf8");
const readBytes = (relative) => fs.readFileSync(new URL(relative, root));
const migration = read(
  "supabase/migrations-pending/20260818210000_content_v3_21h_hardened_preflight.sql",
);
const migrationBytes = readBytes(
  "supabase/migrations-pending/20260818210000_content_v3_21h_hardened_preflight.sql",
);
const baseline = read("scripts/content-v3/production-preflight-readonly.sql");
const diff = read("scripts/content-v3/visibility-diff-21h.sql");
const postverify = read("scripts/content-v3/postverify-21h.sql");
const currentSourceSha = "f42c22b9f013834b78347bf125d0742363dc27e0";
const currentMigrationSha256 = "3D8CDD27A24EA9F0E998BA14E26ADCB87DD0FF6B62FCC3FBD9B790114DD631E3";
const releaseMetadata = [
  read("docs/content/TAMKEEN-CONTENT-V3-21H-R3-FINAL-SCHEMA-RUNTIME-CLOSURE.md"),
  read("docs/content/TAMKEEN-CONTENT-V3-PRODUCTION-APPLY-BUNDLE-21H.md"),
  read("docs/content/TAMKEEN-CONTENT-V3-PRODUCTION-APPLY-PREFLIGHT-21H-CODEX-REPORT.md"),
  read("docs/content/TAMKEEN-CONTENT-V3-21H-R4-FINAL-RELEASE-METADATA-CLOSURE.md"),
];

function functionBody(sql, name) {
  const start = sql.indexOf(`FUNCTION public.${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = sql.indexOf("$$;", start);
  assert.notEqual(end, -1, `${name} must have a closed body`);
  return sql.slice(start, end);
}

function executableSql(sql) {
  return sql
    .replace(/--[^\n]*/g, "")
    .replace(/'(?:''|[^'])*'/g, "")
    .replace(/\$q\$[\s\S]*?\$q\$/g, "");
}

test("R4 release metadata pins the current R3 identity and migration bytes", () => {
  const canonicalBytes = Buffer.from(
    migrationBytes.toString("utf8").replace(/\r\n/g, "\n"),
    "utf8",
  );
  const actual = createHash("sha256").update(canonicalBytes).digest("hex").toUpperCase();
  assert.equal(actual, currentMigrationSha256);
  for (const document of releaseMetadata) {
    assert.match(document, new RegExp(`CURRENT_R3_SOURCE_SHA=${currentSourceSha}`));
    assert.match(document, new RegExp(`CURRENT_R3_MIGRATION_SHA256=${currentMigrationSha256}`));
  }
});

test("21H migration is transactional, additive, and has no lifecycle backfill", () => {
  assert.match(migration, /BEGIN;[\s\S]*COMMIT;/);
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN|TYPE)\b/i);
  assert.doesNotMatch(
    migration,
    /INSERT\s+INTO\s+public\.lesson_capability_lifecycle[\s\S]{0,200}\bSELECT\b/i,
  );
  assert.match(migration, /ON DELETE RESTRICT/i);
  assert.match(migration, /question_revision_id uuid NOT NULL/i);
  assert.match(migration, /revision_id uuid NOT NULL/i);
});

test("answer layer is not readable by anon/public and is RLS protected", () => {
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.question_option_rationales FROM PUBLIC, anon/i,
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.official_question_answers FROM PUBLIC, anon/i,
  );
  assert.match(
    migration,
    /ALTER TABLE public\.question_option_rationales ENABLE ROW LEVEL SECURITY/i,
  );
  assert.match(
    migration,
    /ALTER TABLE public\.official_question_answers ENABLE ROW LEVEL SECURITY/i,
  );
  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.official_question_answers TO authenticated/i,
  );
});

test("initial official question RPC contains no answer-bearing field", () => {
  const body = functionBody(migration, "get_lesson_official_questions");
  for (const key of ["correct_index", "is_correct", "model_answer", "rationale", "explanation"]) {
    assert.doesNotMatch(body, new RegExp(`['\"]${key}['\"]|\\b${key}\\b`, "i"), key);
  }
  assert.match(body, /status = 'PUBLISHED'/i);
  assert.match(body, /question_revision_id|current_published_revision_id/i);
});

test("reveal RPC is explicit, authorized, submitted, and revision pinned", () => {
  const body = functionBody(migration, "reveal_official_question_answer");
  assert.match(body, /SECURITY DEFINER/i);
  assert.match(body, /SET search_path = public, pg_temp/i);
  assert.match(body, /auth\.uid\(\)/i);
  assert.match(body, /pa\.submitted_at IS NOT NULL/i);
  assert.match(body, /par\.submitted_at IS NOT NULL/i);
  assert.match(body, /paq\.question_revision_id/i);
  assert.match(body, /a\.revision_id = v_revision/i);
  assert.match(body, /ANSWER_NOT_AVAILABLE/i);
});

test("operator scripts are read-only and visibility diff has explicit two-way gates", () => {
  for (const sql of [baseline, diff, postverify]) {
    assert.match(sql, /SET TRANSACTION READ ONLY/i);
    assert.match(sql, /ROLLBACK;/i);
    assert.doesNotMatch(executableSql(sql), /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
  }
  assert.match(diff, /BEFORE_VISIBLE/i);
  assert.match(diff, /AFTER_EXPECTED_VISIBLE/i);
  assert.match(diff, /EXPECTED_GAIN/i);
  assert.match(diff, /SECURITY_FIX/i);
  assert.match(diff, /UNEXPECTED_GAIN/i);
  assert.match(diff, /UNEXPECTED_LOSS/i);
  assert.match(diff, /UNEXPECTED_GAIN_COUNT/i);
  assert.match(diff, /UNEXPECTED_LOSS_COUNT/i);
  assert.match(diff, /READY_TO_VERIFY/i);
  assert.doesNotMatch(diff, /supportingResources|originalBookPdf|studentPerformance/);
});
