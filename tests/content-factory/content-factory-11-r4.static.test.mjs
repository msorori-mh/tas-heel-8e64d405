import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const MIGRATION = "supabase/migrations-pending/20260824000000_content_factory_11_publication.sql";
const FUNCTIONS = "src/lib/content-factory/golden-lesson-publication.functions.ts";
const SERVER = "src/lib/content-factory/golden-lesson-publication.server.ts";
const PANEL = "src/components/admin/GoldenLessonCf11OperatorPanel.tsx";
const ASSERTS = "scripts/content-factory/pg17/content-factory-11-assert.sql";

const sql = readFileSync(MIGRATION, "utf8");
const fns = readFileSync(FUNCTIONS, "utf8");
const server = readFileSync(SERVER, "utf8");
const panel = readFileSync(PANEL, "utf8");
const asserts = readFileSync(ASSERTS, "utf8");

test("CF11-R4/1 — lifecycle namespace: only lesson_capability_lifecycle exists anywhere", () => {
  // A read against a non-existent relation fails OPEN (empty lifecycle => "nothing in REVIEW"),
  // which is precisely the wrong direction for a review gate.
  for (const [name, source] of Object.entries({
    [FUNCTIONS]: fns,
    [SERVER]: server,
    [PANEL]: panel,
  })) {
    assert.doesNotMatch(source, /lesson_content_lifecycle/, `${name} must not reference lesson_content_lifecycle`);
  }
  // The migration may only NAME the phantom relation inside the guard that forbids it.
  assert.doesNotMatch(sql, /(FROM|INTO|UPDATE|JOIN)\s+public\.lesson_content_lifecycle/);

  assert.match(server, /CF11_LIFECYCLE_TABLE = "lesson_capability_lifecycle"/);
  assert.match(server, /from\(CF11_LIFECYCLE_TABLE\)/);
  // The migration itself refuses to install alongside a second, silently-empty namespace.
  assert.match(sql, /CF11_LIFECYCLE_NAMESPACE_CONFLICT/);
  assert.match(sql, /CF11_LIFECYCLE_TABLE_MISSING/);
  assert.match(asserts, /CF11_LIFECYCLE_NAMESPACE|lesson_capability_lifecycle/);
});

test("CF11-R4/2 — publication requires server-side upload attestation of the real bytes", () => {
  // The app re-downloads what is actually in the bucket and re-measures it; it never trusts the
  // bytes it believes it uploaded, nor the object's filename.
  assert.match(server, /storage\.from\(ASSET_BUCKET\)\.download\(declaration\.storagePath\)/);
  assert.match(server, /createHash\("sha256"\)\.update\(bytes\)\.digest\("hex"\)/);
  assert.match(server, /CF11_ASSET_BYTES_MISMATCH/);
  assert.match(server, /CF11_ASSET_SIZE_MISMATCH/);
  assert.match(server, /subarray\(0, 16\)\)\.toString\("hex"\)/);
  assert.match(server, /golden_lesson_attest_cf11_asset/);
  // Publication runs attestation first, so an unattested asset can never be published.
  assert.match(fns, /attestStoredAssets\(\s*\n?\s*userId, data\.batchId, declarations, uploadedPaths, "EXECUTE",/);
  // CF11-R5: attestation is MACHINE-only — the server signs for bytes it re-read itself and the
  // human is recorded as the requester, never as the attester.
  assert.match(server, /const admin = serviceClient\(\);[\s\S]{0,4000}rpc\(admin\)\("golden_lesson_attest_cf11_asset"/);
  assert.match(server, /SERVER_BYTE_READBACK/);
  assert.match(sql, /CF11_ASSET_ATTESTATION_MACHINE_ONLY/);
  assert.match(sql, /CF11_ASSET_VERIFICATION_ORIGIN_INVALID/);
});

test("CF11-R4/5 — every human transition uses the operator token, never the service role", () => {
  // CF10 is reached only through the operator wrapper, which re-derives the actor from auth.uid().
  assert.match(fns, /golden_lesson_materialize_domain_batch_operator/);
  assert.doesNotMatch(fns, /rpc\(serviceClient\(\)\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.golden_lesson_materialize_domain_batch_operator/);
  assert.match(sql, /CF10_ACTOR_IDENTITY_MISMATCH/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.golden_lesson_materialize_domain_batch_operator/);
  // The service role keeps read/byte-movement duties only.
  for (const rpcName of [
    "golden_lesson_publish_cf11",
    "golden_lesson_attest_cf11_ready",
  ]) {
    assert.match(fns + server, new RegExp(`rpc\\(supabase\\)\\("${rpcName}"`));
  }
});

test("CF11-R5 — an idempotent replay re-verifies every live category", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.cf11_assert_replay_state/);
  assert.match(sql, /CF11_REPLAY_LIVE_STATE_CONFLICT/);
  // Both replay branches (publication and READY) must run the exhaustive validator.
  assert.ok((sql.match(/cf11_assert_replay_state\(/g) ?? []).length >= 3);
  assert.match(asserts, /CF11_EXPECTED_REPLAY_REFUSED_/);
  // The raw CF10 entry point is denied to the service role: only the operator wrapper may reach it.
  assert.match(sql, /REVOKE[\s\S]{0,200}golden_lesson_materialize_domain_batch\(/);
});

test("CF11-R4/4 — strict replay guards: plan hash + idempotency key are mandatory on EXECUTE", () => {
  assert.match(sql, /CF11_IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(sql, /CF11_WRITE_PLAN_HASH_MISMATCH/);
  assert.match(sql, /CF11_REPLAY_IDEMPOTENCY_KEY_CONFLICT/);
  assert.match(sql, /CF10_IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(sql, /CF10_WRITE_PLAN_HASH_REQUIRED/);
  assert.match(server, /export function requirePlan/);
  assert.match(server, /export function idempotencyKey/);
  assert.match(fns, /CF11_WRITE_PLAN_HASH_REQUIRED/);
  assert.match(fns, /CF10_WRITE_PLAN_HASH_REQUIRED/);
  assert.match(fns, /_expected_plan_sha256: expected/);
  // The operator UI can only EXECUTE with the hash of the DRY_RUN plan it just displayed.
  assert.match(panel, /expectedPlanSha256: selectedPlans\.cf10!/);
  assert.match(panel, /expectedPlanSha256: selectedPlans\.cf11!/);
  assert.match(panel, /!selectedPlans\.cf10/);
  assert.match(panel, /!selectedPlans\.cf11/);
});

test("CF11-R4/fail-closed — no read error is allowed to degrade into an empty review queue", () => {
  assert.match(server, /export function ok<T>/);
  assert.match(server, /if \(result\.error\) throw new Error/);
  for (const code of [
    "CF11_BATCHES_READ_FAILED",
    "CF11_BINDING_READ_FAILED",
    "CF11_LIFECYCLE_READ_FAILED",
    "CF11_PUBLISHED_ASSETS_READ_FAILED",
    "CF11_ASSET_ATTESTATIONS_READ_FAILED",
    "CF11_ASSET_LIST_FAILED",
    "CF11_ASSET_READBACK_FAILED",
  ]) {
    assert.match(server, new RegExp(code));
  }
  // Nothing may silently swallow a Supabase error object.
  assert.doesNotMatch(server, /\.data \?\? \[\]\) as \{ capability/);
});
