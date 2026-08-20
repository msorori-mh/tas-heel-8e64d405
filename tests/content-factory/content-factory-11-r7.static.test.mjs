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

/* ------------------------------------------------------------------------------------ *
 * CF11-R6 — EXACT SET SEMANTICS.
 * These tests are written so that they FAIL for: seven wrong names, one missing + one
 * extra, mixed REVIEW/READY where an exact state is required, a substituted assessment
 * member at an identical count, an extra published question, storage eTag/metadata drift,
 * READY snapshot/hash drift, and a service_role attempting any human editorial RPC.
 * ------------------------------------------------------------------------------------ */

const CANONICAL = readFileSync("src/lib/lessons/capability-mapping.ts", "utf8");
const canonicalNames = [...CANONICAL.matchAll(/V3_LIFECYCLE_CAPABILITIES = \[([^\]]+)\]/g)]
  .flatMap(([, body]) => [...body.matchAll(/"([A-Za-z]+)"/g)].map(([, n]) => n))
  .sort();

test("CF11-R6/1 — SQL canonical set equals src/lib/lessons/capability-mapping.ts exactly", () => {
  assert.equal(canonicalNames.length, 7);
  const fn = sql.match(/cf11_lifecycle_capabilities\(\)\s*\nRETURNS text\[\][\s\S]*?\$\$;/);
  assert.ok(fn, "cf11_lifecycle_capabilities() must exist");
  const sqlNames = [...fn[0].matchAll(/'([A-Za-z]+)'/g)].map(([, n]) => n);
  // Exact multiset equality: a wrong name, a missing name or an eighth name all fail here.
  assert.deepEqual([...sqlNames].sort(), canonicalNames);
  assert.deepEqual(sqlNames, [...sqlNames].sort(), "must be stored sorted for `=` comparison");
});

test("CF11-R6/2 — every gate compares the SET, never a bare count", () => {
  // Publication plan validation, replay, READY first execution and READY replay.
  assert.match(sql, /CF11_LIFECYCLE_NAMESPACE_MISMATCH: staged=/);
  assert.match(sql, /CF11_LIFECYCLE_SET_FOREIGN_CAPABILITY/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.cf11_assert_exact_lifecycle_set/);
  assert.match(sql, /CF11_READY_SET_NOT_EXACT/);
  assert.ok((sql.match(/cf11_assert_exact_lifecycle_set\(/g) ?? []).length >= 4);
  assert.ok((sql.match(/cf11_lifecycle_capabilities\(\)/g) ?? []).length >= 8);
  // The retired count-only gates are gone.
  assert.doesNotMatch(sql, /lesson_capability_lifecycle WHERE lesson_id = lesson_row\.id\) <> 7/);
  assert.doesNotMatch(sql, /status = 'READY'\) <> 7/);
});

test("CF11-R6/3 — replay proves exact question, assessment and asset sets", () => {
  assert.match(sql, /CF11_REPLAY_LIVE_STATE_CONFLICT: questions live=/);
  assert.match(sql, /CF11_REPLAY_LIVE_STATE_CONFLICT: questionsDuplicatePlan/);
  assert.match(sql, /CF11_REPLAY_LIVE_STATE_CONFLICT: questionRevisions/);
  // A substituted member at an identical count must fail: membership is compared as a code set.
  assert.match(sql, /CF11_REPLAY_LIVE_STATE_CONFLICT: assessmentMembers live=/);
  assert.match(sql, /CF11_REPLAY_LIVE_STATE_CONFLICT: assessmentOfficialLeak/);
  assert.match(sql, /CF11_REPLAY_LIVE_STATE_CONFLICT: assets live=/);
  // Storage identity drift (object id / version / eTag / size / mime) breaks the replay join.
  assert.match(sql, /o\.version = t\.storage_version/);
  assert.match(sql, /metadata->>'eTag'[\s\S]{0,120}IS NOT DISTINCT FROM t\.storage_etag/);
  assert.match(sql, /\(o\.metadata->>'size'\)::bigint, t\.byte_size\) = t\.byte_size/);
  // Honest wording: SQL replays recorded identity/metadata; byte readback is the server step.
  assert.match(sql, /no byte readback happens here/);
});

test("CF11-R6/4 — READY replay re-derives the seven snapshots and hashes", () => {
  assert.match(sql, /CF11_READY_REPLAY_CONFLICT: readySnapshot\./);
  assert.match(sql, /CF11_READY_REPLAY_CONFLICT: readySnapshotBody\./);
  assert.match(sql, /CF11_READY_REPLAY_CONFLICT: evidenceHash\./);
  assert.match(sql, /CF11_READY_REPLAY_CONFLICT: evidenceSet/);
  assert.match(sql, /FOREACH lifecycle_cap IN ARRAY public\.cf11_lifecycle_capabilities\(\)/);
  assert.match(sql, /v3_capability_snapshot_hash\(stored_ready_snapshot\)/);
});

test("CF11-R6/5 — service_role is denied every human editorial RPC", () => {
  for (const fnName of [
    "golden_lesson_publish_cf11",
    "golden_lesson_attest_cf11_ready",
    "golden_lesson_materialize_domain_batch_operator",
    "golden_lesson_advance_review",
    "golden_lesson_bind_authoritative_identity",
  ]) {
    assert.match(
      sql,
      new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fnName}\\([^)]*\\)\\s*\\n?\\s*FROM service_role`),
      `${fnName} must be revoked from service_role`,
    );
  }
  // Machine attestation stays service-role-only.
  assert.match(sql, /CF11_ASSET_ATTESTATION_MACHINE_ONLY/);
  // Identity binding now runs on the operator's own token, not the service key.
  const binding = readFileSync("src/lib/content-factory/golden-lesson-identity-binding.functions.ts", "utf8");
  assert.match(binding, /golden_lesson_bind_authoritative_identity_operator/);
  assert.doesNotMatch(binding, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(asserts, /service_role cannot|CF11_EXPECTED_SERVICE_ROLE_DENIED/);
});

test("CF11-R6/6 — the operator panel gates READY on the exact set, not a count", () => {
  assert.match(panel, /import \{ V3_LIFECYCLE_CAPABILITIES \} from "@\/lib\/lessons\/capability-mapping"/);
  assert.doesNotMatch(panel, /CF11_EXPECTED_CAPABILITY_COUNT/);
  assert.match(panel, /setDiff\.exact && setDiff\.notInReview\.length === 0/);
  for (const marker of ["missing", "extra", "duplicated", "notInReview"]) {
    assert.match(panel, new RegExp(`setDiff\\.${marker}`));
  }
});
