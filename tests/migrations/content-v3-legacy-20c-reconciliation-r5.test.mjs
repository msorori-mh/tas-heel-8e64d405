import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, root), "utf8");

const r5 = read("supabase/migrations-pending/20260819130000_content_v3_legacy_20c_reconciliation_r5.sql");
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
  assert.match(r5, /ready_by = CASE WHEN ev\.audited THEN COALESCE\(x\.ready_by, ev\.actor_id\) ELSE x\.ready_by END/);
  assert.match(r5, /LEGACY_20C_VISIBLE_BASELINE/);
  assert.doesNotMatch(r5, /system_actor|SYSTEM_ACTOR|00000000-0000-0000-0000-000000000000/);
  assert.match(r5, /lesson_capability_lifecycle_legacy_baseline_no_approver_chk/);
});

test("AUDITED_APPROVAL requires a literal REVIEW -> READY transition", () => {
  const fn = r5.slice(r5.indexOf("FUNCTION public.v3_capability_audited_approval("));
  assert.match(fn, /from_status' = 'REVIEW'/);
  assert.match(fn, /to_status' = 'READY'/);
  assert.match(fn, /metadata ->> 'capability' = _capability/);
  assert.match(fn, /a\.target_id = _lesson_id/);
  assert.match(fn, /ORDER BY a\.created_at DESC, a\.id DESC/);
});

test("ready_at provenance comes from the audit row, never from updated_at for audited rows", () => {
  const block = r5.slice(r5.indexOf("ready_at = CASE"), r5.indexOf("END\n  FROM ("));
  assert.match(block, /WHEN x\.ready_at IS NOT NULL THEN x\.ready_at/);
  assert.match(block, /WHEN ev\.audited THEN ev\.approved_at/);
});

test("checkUnderstanding snapshot can never emit a null revisionId", () => {
  const start = r5.indexOf("WHEN 'checkUnderstanding'");
  const body = r5.slice(start, r5.indexOf("WHEN 'lessonAssessment'", start));
  assert.match(body, /JOIN public\.question_revisions rev/);
  assert.match(body, /rev\.id = q\.current_published_revision_id/);
  assert.match(body, /rev\.id IS NOT NULL/);
  assert.match(body, /rev\.status = 'PUBLISHED'/);
  assert.match(r5, /R5_PUBLISHED_REVISION_NULL/);
});

test("every retired capability is handled, not just originalBookPdf", () => {
  assert.match(r5, /FUNCTION public\.v3_retired_capabilities\(\)/);
  assert.match(r5, /ARRAY\['originalBookPdf', 'supportingResources'\]/);
  assert.match(r5, /capability = ANY \(public\.v3_retired_capabilities\(\)\)/);
  assert.match(mapping, /V3_RETIRED_CAPABILITIES = \["originalBookPdf", "supportingResources"\]/);
});

test("empty snapshots fail closed before the first UPDATE", () => {
  const firstUpdate = r5.indexOf("UPDATE public.lesson_capability_lifecycle x\n   SET ready_by");
  const precondition = r5.indexOf("R5_EMPTY_READY_SNAPSHOT=%");
  assert.ok(precondition > 0 && precondition < firstUpdate, "precondition must precede the first UPDATE");
  assert.match(r5, /tamkeen\.r5_manual_review_allowlist/);
  assert.match(r5, /R5_EMPTY_READY_SNAPSHOT_POST/);
});

test("canonical JSON is named honestly and is deterministic", () => {
  assert.match(r5, /DROP FUNCTION IF EXISTS public\._v3_jcs\(jsonb\);/);
  assert.match(r5, /FUNCTION public\._v3_canonical_json_v1\(jsonb\)/);
  assert.match(r5, /NOT RFC 8785 \/ JCS/);
  assert.match(r5, /ORDER BY kv\.key COLLATE "C"/);
  assert.match(r5, /ORDER BY e\.ordinality/);
  assert.match(r5, /sha256\(convert_to\(public\._v3_canonical_json_v1\(_snapshot\), 'UTF8'\)\)/);
});

test("R5 retires capabilities without deleting lifecycle history", () => {
  assert.doesNotMatch(r5, /DELETE\s+FROM\s+public\.lesson_capability_lifecycle/i);
  assert.doesNotMatch(r5, /DROP\s+(TABLE|COLUMN)\b/i);
  assert.match(r5, /retirement_origin = 'LEGACY_20C'/);
});

test("canonical snapshot is structurally answer-free", () => {
  const start = r5.indexOf("FUNCTION public.v3_capability_snapshot(");
  const end = r5.indexOf("$$;", start);
  const body = r5.slice(start, end).replace(/--[^\n]*/g, "");
  for (const leak of ["is_correct", "why_correct", "why_wrong", "model_answer", "correct_index"]) {
    assert.doesNotMatch(body, new RegExp(`\\b${leak}\\b`, "i"), leak);
  }
  assert.match(body, /status = 'PUBLISHED'/);
  assert.match(body, /snapshotVersion/);
});

test("preflight accepts documented legacy evidence and retired-not-ready rows", () => {
  assert.match(preflight, /COALESCE\(x\.evidence_origin, ''\) <> 'LEGACY_20C_VISIBLE_BASELINE'/);
  assert.match(preflight, /originalBookPdf_rows_still_ready/);
  assert.match(preflight, /originalBookPdf_rows_without_retirement_provenance/);
  assert.match(preflight, /capability IN \('originalBookPdf','supportingResources'\)/);
  assert.doesNotMatch(preflight, /legacy_originalBookPdf_lifecycle_rows_present/);
  assert.match(preflight, /SET TRANSACTION READ ONLY/i);
});

test("postverify enforces snapshot evidence and the retirement contract", () => {
  assert.match(postverify, /READY row lacks snapshot evidence/);
  assert.match(postverify, /COALESCE\(evidence_origin, ''\) <> 'LEGACY_20C_VISIBLE_BASELINE'/);
  assert.match(postverify, /originalBookPdf retirement contract/);
  assert.match(postverify, /PUBLISHED_REVISION_NULL in READY snapshot/);
  assert.match(postverify, /EMPTY_READY_SNAPSHOT/);
  assert.match(postverify, /SET TRANSACTION READ ONLY/i);
});

test("unreconcilable rows are flagged, never pinned", () => {
  assert.match(r5, /v3_capability_snapshot_is_reconcilable/);
  assert.match(r5, /evidence_origin = 'NEEDS_MANUAL_REVIEW'/);
  // NEEDS_MANUAL_REVIEW must never satisfy the READY evidence constraint.
  const chk = r5.slice(r5.indexOf("lesson_capability_lifecycle_ready_evidence_chk\n  CHECK"));
  assert.doesNotMatch(chk.slice(0, 400), /NEEDS_MANUAL_REVIEW/);
  assert.match(r5, /AND public\.v3_capability_snapshot_is_reconcilable\(/);
});

test("PG17 rehearsal is executable and covers the R5-R2 negative scenarios", () => {
  const fixture = read("scripts/content-v3/pg17/fixture-legacy-20c.sql");
  assert.match(fixture, /sort_order <= 21/);          // officialBookContent = 21
  assert.match(fixture, /'originalBookPdf', 'READY'/); // 40 lessons
  assert.match(fixture, /'supportingResources','READY'/);
  assert.match(fixture, /"from_status":"REVIEW","to_status":"READY"/);
  assert.match(fixture, /"from_status":"DRAFT","to_status":"READY"/);
  assert.match(fixture, /'77777777-0000-0000-0000-000000000005','66666666-0000-0000-0000-000000000005','DRAFT'/);

  const runner = read("scripts/content-v3/pg17/rehearse-r5.sh");
  assert.match(runner, /EMPTY_SNAPSHOT_FAIL_CLOSED=PASS/);
  assert.match(runner, /production-preflight-readonly\.sql/);
  assert.match(runner, /postverify-21h\.sql/);
  assert.match(runner, /tamkeen\.r5_manual_review_allowlist/);

  const asserts = read("scripts/content-v3/pg17/assert-r5.sql");
  for (const gate of [
    "READY_ROWS_WITHOUT_VALID_EVIDENCE",
    "RETIRED_READY_ROWS",
    "INVENTED_READY_BY",
    "UNEXPECTED_VISIBILITY_GAIN",
    "UNEXPECTED_VISIBILITY_LOSS",
    "ANSWER_LEAK",
    "PUBLISHED_REVISION_NULL",
    "EMPTY_READY_SNAPSHOT",
    "DRAFT_TO_READY_REJECTED",
    "AUDIT_REVIEW_TO_READY_ONLY",
  ]) {
    assert.match(asserts, new RegExp(gate), gate);
  }
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

test("R5-R3: snapshot/hash atomic consistency is fail-closed", () => {
  assert.match(r5, /R5_READY_HASH_WITHOUT_SNAPSHOT=%/);
  assert.match(r5, /R5_READY_SNAPSHOT_HASH_MISMATCH=%/);
  assert.match(r5, /R5_READY_SNAPSHOT_HASH_MISMATCH_POST=%/);
  // Both hash preconditions must precede the first UPDATE.
  const firstUpdate = r5.indexOf("UPDATE public.lesson_capability_lifecycle x\n   SET ready_by");
  assert.ok(r5.indexOf("R5_READY_HASH_WITHOUT_SNAPSHOT=%") < firstUpdate);
  assert.ok(r5.indexOf("R5_READY_SNAPSHOT_HASH_MISMATCH=%") < firstUpdate);
  // The hash is always derived from the effective (stored-first) snapshot.
  assert.match(r5, /ready_snapshot = ev\.snapshot/);
  assert.match(r5, /ready_hash = COALESCE\(x\.ready_hash, public\.v3_capability_snapshot_hash\(ev\.snapshot\)\)/);
  assert.match(r5, /COALESCE\(l\.ready_snapshot,\s*\n\s*public\.v3_capability_snapshot\(l\.lesson_id, l\.capability\)\) AS snapshot/);
});

test("R5-R3: AUDITED_APPROVAL requires actor and time identity", () => {
  assert.match(r5, /\(ap\.actor_id IS NOT NULL\s*\n\s*AND \(l\.ready_by IS NULL OR l\.ready_by = ap\.actor_id\)\s*\n\s*AND \(l\.ready_at IS NULL OR l\.ready_at = ap\.approved_at\)\) AS audited/);
  assert.match(r5, /WHEN ev\.audited\s+THEN 'AUDITED_APPROVAL'/);
  assert.match(r5, /WHEN x\.ready_by IS NOT NULL THEN 'LEGACY_20C_ROW_APPROVER'/);
  assert.match(r5, /ready_by = CASE WHEN ev\.audited THEN COALESCE\(x\.ready_by, ev\.actor_id\) ELSE x\.ready_by END/);
  assert.match(r5, /R5_AUDITED_APPROVAL_ACTOR_MISMATCH=%/);
});

test("R5-R3: audit target scope is pinned to the real audit contract", () => {
  const fn = r5.slice(r5.indexOf("FUNCTION public.v3_capability_audited_approval("));
  assert.match(fn, /a\.target_type = 'lesson_capability'/);
});

test("R5-R3: postverify carries the new read-only gates", () => {
  assert.match(postverify, /MISSING_SNAPSHOT_WITH_EXISTING_HASH/);
  assert.match(postverify, /READY_SNAPSHOT_HASH_MISMATCH/);
  assert.match(postverify, /AUDITED_APPROVAL_ACTOR_MISMATCH/);
  assert.match(postverify, /SET TRANSACTION READ ONLY/i);
});

test("R5-R3: PG17 rehearsal executes every new negative scenario", () => {
  const runner = read("scripts/content-v3/pg17/rehearse-r5.sh");
  assert.match(runner, /R5_READY_HASH_WITHOUT_SNAPSHOT/);
  assert.match(runner, /R5_READY_SNAPSHOT_HASH_MISMATCH/);
  assert.match(runner, /MISSING_SNAPSHOT_WITH_EXISTING_HASH_FAIL_CLOSED=PASS/);
  assert.match(runner, /SNAPSHOT_HASH_MISMATCH_FAIL_CLOSED=PASS/);

  const fixture = read("scripts/content-v3/pg17/fixture-legacy-20c.sql");
  assert.match(fixture, /STORED-ONLY-SNAPSHOT/);
  assert.match(fixture, /44444444-4444-4444-4444-444444444445/);
  assert.match(fixture, /'lesson_capability_lifecycle_transition','lesson',/);

  const asserts = read("scripts/content-v3/pg17/assert-r5.sql");
  for (const gate of [
    "READY_SNAPSHOT_HASH_MISMATCH",
    "MISSING_SNAPSHOT_WITH_EXISTING_HASH",
    "STORED_SNAPSHOT_HASHED_FROM_STORED",
    "AUDITED_APPROVAL_ACTOR_MISMATCH",
    "ROW_APPROVER_CONFLICT_PRESERVED",
    "AUDIT_TARGET_TYPE_ENFORCED",
  ]) {
    assert.match(asserts, new RegExp(gate), gate);
  }
});
