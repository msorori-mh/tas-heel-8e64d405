import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, root), "utf8");

const r5 = read("supabase/migrations-pending/20260819120000_content_v3_r5_legacy_evidence_pinning.sql");
const preflight = read("scripts/content-v3/production-preflight-readonly.sql");
const postverify = read("scripts/content-v3/postverify-21h.sql");
const mapping = read("src/lib/lessons/capability-mapping.ts");
const h21 = read("supabase/migrations-pending/20260818210000_content_v3_21h_hardened_preflight.sql");

test("approved 21H migration is untouched", () => {
  const bytes = Buffer.from(h21.replace(/\r\n/g, "\n"), "utf8");
  assert.equal(
    createHash("sha256").update(bytes).digest("hex").toUpperCase(),
    "3D8CDD27A24EA9F0E998BA14E26ADCB87DD0FF6B62FCC3FBD9B790114DD631E3",
  );
});

test("R5 runs before 21H, is transactional, and never fabricates an approver", () => {
  assert.match(r5, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(r5, /R5_MUST_RUN_BEFORE_21H/);
  assert.doesNotMatch(r5, /\bapplicability\b\s*=/i);
  // ready_by may only come from audit_logs evidence.
  assert.match(r5, /ready_by = COALESCE\(x\.ready_by, ev\.actor_id\)/);
  assert.match(r5, /LEGACY_20C_VISIBLE_BASELINE/);
  assert.doesNotMatch(r5, /system_actor|SYSTEM_ACTOR|00000000-0000-0000-0000-000000000000/);
});

test("R5 retires originalBookPdf without deleting lifecycle history", () => {
  assert.doesNotMatch(r5, /DELETE\s+FROM\s+public\.lesson_capability_lifecycle/i);
  assert.doesNotMatch(r5, /DROP\s+(TABLE|COLUMN)\b/i);
  assert.match(r5, /SET status = 'REVIEW',\s*\n\s*retirement_origin = 'LEGACY_20C'/);
});

test("canonical snapshot is deterministic and structurally answer-free", () => {
  const start = r5.indexOf("FUNCTION public.v3_capability_snapshot(");
  const end = r5.indexOf("$$;", start);
  const body = r5.slice(start, end).replace(/--[^\n]*/g, "");
  for (const leak of ["is_correct", "why_correct", "why_wrong", "model_answer", "correct_index"]) {
    assert.doesNotMatch(body, new RegExp(`\\b${leak}\\b`, "i"), leak);
  }
  assert.match(body, /status = 'PUBLISHED'/);
  assert.match(body, /snapshotVersion/);
  assert.match(r5, /ORDER BY kv\.key COLLATE "C"/);
  assert.match(r5, /sha256\(convert_to\(public\._v3_jcs\(_snapshot\), 'UTF8'\)\)/);
});

test("preflight accepts documented legacy evidence and retired-not-ready rows", () => {
  assert.match(preflight, /COALESCE\(x\.evidence_origin, ''\) <> 'LEGACY_20C_VISIBLE_BASELINE'/);
  assert.match(preflight, /originalBookPdf_rows_still_ready/);
  assert.match(preflight, /originalBookPdf_rows_without_retirement_provenance/);
  assert.doesNotMatch(preflight, /legacy_originalBookPdf_lifecycle_rows_present/);
  assert.match(preflight, /SET TRANSACTION READ ONLY/i);
});

test("postverify enforces snapshot evidence and the retirement contract", () => {
  assert.match(postverify, /READY row lacks snapshot evidence/);
  assert.match(postverify, /COALESCE\(evidence_origin, ''\) <> 'LEGACY_20C_VISIBLE_BASELINE'/);
  assert.match(postverify, /originalBookPdf retirement contract/);
  assert.match(postverify, /SET TRANSACTION READ ONLY/i);
});

test("capability mapping translates package names to lifecycle names", () => {
  for (const [pkg, lifecycle] of [
    ["tamkeenExplanationHtml", "tamkeenExplanation"],
    ["lessonSummaryHtml", "quickReview"],
    ["labExperimentHtml", "simulation"],
    ["officialBookQuestions", "checkUnderstanding"],
    ["selfTest", "lessonAssessment"],
  ]) {
    assert.match(mapping, new RegExp(`${pkg}: "${lifecycle}"`));
  }
  assert.match(mapping, /V3_RETIRED_CAPABILITIES/);
});
