/* ------------------------------------------------------------------------------------
 * CF11-R3 ADDENDUM — static regression for the two operator blockers raised by the audit:
 *   1) EXECUTE must send the exact reviewed plan SHA + a stable idempotency key.
 *   2) Batch status must read `lesson_capability_lifecycle` and FAIL CLOSED on query error.
 * Also pins: human transitions/publish/READY run with the operator's own token (auth.uid()),
 * never a service-role editorial write.
 * ------------------------------------------------------------------------------------ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PANEL = readFileSync("src/components/admin/GoldenLessonCf11OperatorPanel.tsx", "utf8");
const FUNCTIONS = readFileSync("src/lib/content-factory/golden-lesson-publication.functions.ts", "utf8");
const SERVER = readFileSync("src/lib/content-factory/golden-lesson-publication.server.ts", "utf8");
const SQL = readFileSync(
  "supabase/migrations-pending/20260824000000_content_factory_11_publication.sql",
  "utf8",
);

test("ADDENDUM/1 — DRY_RUN captures the plan SHA and EXECUTE resends it", () => {
  // DRY_RUN results are captured per stage…
  assert.match(PANEL, /planSha256\?: string \| null/);
  assert.match(PANEL, /\[capture\.batchId\]: \{ \.\.\.current\[capture\.batchId\], \[capture\.stage\]: sha \}/);
  // …and EXECUTE is unreachable until the operator has reviewed that stage's plan.
  for (const stage of ["cf10", "cf11"]) {
    assert.match(PANEL, new RegExp(`!selectedPlans\\.${stage}`));
    assert.match(PANEL, new RegExp(`expectedPlanSha256: selectedPlans\\.${stage}!`));
  }
});

test("ADDENDUM/2 — server inputs accept the SHA and derive the idempotency key from it", () => {
  assert.match(FUNCTIONS, /expectedPlanSha256: z\.string\(\)\.regex\(SHA256\)\.optional\(\)/);
  // Both CF10 and CF11 EXECUTE paths require the plan and key off it.
  assert.match(FUNCTIONS, /requirePlan\(data\.mode, data\.expectedPlanSha256, "CF10_WRITE_PLAN_HASH_REQUIRED"\)/);
  assert.ok((FUNCTIONS.match(/requirePlan\(/g) ?? []).length >= 2);
  assert.ok((FUNCTIONS.match(/idempotencyKey\("cf1[01]", data\.batchId, expected\)/g) ?? []).length >= 2);
  // Blank/malformed hashes throw before the RPC.
  assert.match(SERVER, /if \(!expected \|\| !SHA256_RE\.test\(expected\)\) throw new Error\(code\)/);
  // The SQL side refuses a blank key on EXECUTE, so a regression in the client still rolls back.
  assert.ok((SQL.match(/length\(btrim\(_idempotency_key\)\) < 8/g) ?? []).length >= 3);
  assert.match(SQL, /CF11_EXPECTED_PLAN|EXPECTED_PLAN_SHA256/);
});

test("ADDENDUM/3 — batch status reads lesson_capability_lifecycle and fails closed", () => {
  assert.match(SERVER, /CF11_LIFECYCLE_TABLE = "lesson_capability_lifecycle"/);
  assert.doesNotMatch(SERVER, /lesson_content_lifecycle/);
  assert.doesNotMatch(PANEL, /lesson_content_lifecycle/);
  // Every read is wrapped in ok(), which throws on `error` instead of silently returning [].
  assert.match(SERVER, /ok\(\s*await admin\.from\(CF11_LIFECYCLE_TABLE\)[\s\S]*?"CF11_LIFECYCLE_READ_FAILED",\s*\)/);
  assert.match(SERVER, /if \(result\.error\) throw new Error\(`\$\{code\}: \$\{result\.error\.message\}`\)/);
  for (const code of [
    "CF11_BINDING_READ_FAILED",
    "CF11_MATERIALIZATION_READ_FAILED",
    "CF11_PUBLICATION_READ_FAILED",
    "CF11_READY_LEDGER_READ_FAILED",
    "CF11_PUBLISHED_ASSETS_READ_FAILED",
    "CF11_ASSET_ATTESTATIONS_READ_FAILED",
  ]) {
    assert.ok(SERVER.includes(code), `${code} must fail closed`);
  }
});

test("ADDENDUM/4 — human stages use the operator's token, not a service-role editorial write", () => {
  // materialize / publish / attest / revoke all go through rpc(supabase) on the request context.
  assert.ok((FUNCTIONS.match(/rpc\(supabase\)\(/g) ?? []).length >= 4);
  assert.doesNotMatch(FUNCTIONS, /serviceClient\(\)[\s\S]{0,200}?golden_lesson_(publish|attest_cf11_ready|revoke)/);
  assert.match(FUNCTIONS, /_actor_id: userId/);
  // The wrapper re-derives the actor server-side; raw CF10 materialization is not callable.
  assert.match(SQL, /golden_lesson_materialize_domain_batch_operator/);
  assert.match(SQL, /REVOKE[\s\S]{0,120}golden_lesson_materialize_domain_batch\(/);
});
