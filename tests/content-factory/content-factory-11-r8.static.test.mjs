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
  assert.match(server, /storageDownload\(\s*ASSET_BUCKET,\s*declaration\.storagePath,/);
  assert.match(server, /createHash\("sha256"\)\.update\(bytes\)\.digest\("hex"\)/);
  assert.match(server, /CF11_ASSET_BYTES_MISMATCH/);
  assert.match(server, /CF11_ASSET_SIZE_MISMATCH/);
  assert.match(server, /subarray\(0, 16\)\)\.toString\("hex"\)/);
  assert.match(server, /golden_lesson_attest_cf11_asset/);
  // Publication runs attestation first, so an unattested asset can never be published.
  assert.match(fns, /attestStoredAssets\(\s*userId,\s*data\.batchId,\s*declarations,\s*uploadedPaths,\s*"EXECUTE",/);
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

test("CF11 HTML identity — plan, write and replay use one normalized resource code", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.cf11_html_resource_code/);
  assert.match(sql, /public\.normalize_resource_code\(/);
  assert.match(sql, /'resourceCode', public\.cf11_html_resource_code\(ext_code, 'mindMap'\)/);
  assert.match(sql, /'resourceCode', public\.cf11_html_resource_code\(ext_code, 'simulation'\)/);
  assert.match(sql, /v_resource_code := public\.cf11_html_resource_code\(ext_code, cap\)/);
  assert.match(sql, /v_code := public\.normalize_resource_code\(_plan->'html'->cap->>'resourceCode'\)/);
  assert.match(sql, /r\.resource_code = v_code/);
  assert.match(sql, /r\.url = public\.cf10_inline_html_url\(v_code\)/);
  assert.match(sql, /r\.metadata->>'cf11_publication_id' = v_publication_id::text/);
  assert.match(sql, /IF v_count <> 1 OR v_live IS DISTINCT FROM v_expected/);
  assert.doesNotMatch(sql, /v_live IS DISTINCT FROM v_expected\s+OR public\.cf10_html_publication_pending/);
  assert.match(sql, /'assessment', jsonb_build_object\('code', public\.normalize_content_code\(ext_code \|\| '-SELFTEST'\)/);
  assert.match(sql, /assessment_code = public\.normalize_content_code\(ext_code \|\| '-SELFTEST'\)/);
  assert.doesNotMatch(sql, /lower\(r\.resource_code\) = lower\(v_code\)/);
});

test("CF11-R4/4 — strict replay guards: plan hash + idempotency key are mandatory on EXECUTE", () => {
  assert.match(sql, /CF11_IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(sql, /CF11_WRITE_PLAN_HASH_MISMATCH/);
  assert.match(sql, /CF11_REPLAY_IDEMPOTENCY_KEY_CONFLICT/);
  assert.match(sql, /CF10_IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(sql, /CF10_WRITE_PLAN_HASH_REQUIRED/);
  assert.match(server, /export function requirePlan/);
  assert.match(server, /export function idempotencyKey/);
  assert.match(server, /client\.rpc as UntypedRpc\)\.bind\(client\)/);
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

test("CF11 HTML policy — mind map and lab share the isolated interactive contract", () => {
  assert.match(sql, /mind_contract := public\.cf11_assert_interactive_contract\('mindMapHtml', mind_html\)/);
  assert.match(sql, /lab_contract := public\.cf11_assert_interactive_contract\('labExperimentHtml', lab_html\)/);
  assert.doesNotMatch(sql, /cf11_assert_static_contract\('mindMapHtml', mind_html\)/);
  assert.match(sql, /'mindMap',[\s\S]{0,260}'renderMode','INTERACTIVE',[\s\S]{0,80}'csp', mind_contract/);
  assert.match(sql, /'cf11_render_mode', 'INTERACTIVE'/);
  assert.match(sql, /'cf11_csp', CASE cap WHEN 'mindMap' THEN mind_contract ELSE lab_contract END/);
  assert.match(sql, /CF11_INTERACTIVE_EXTERNAL_SCRIPT/);
  assert.match(sql, /CF11_INTERACTIVE_DYNAMIC_EXECUTION/);
  assert.match(asserts, /the mind map must use the interactive runtime contract/);
  assert.doesNotMatch(asserts, /the mind map must stay completely JS-free/);
});

test("CF11 asset extraction — embedded image data is not mistaken for an undeclared file", () => {
  assert.match(sql, /cf11_html_asset_refs[\s\S]{0,420}WHERE m\[1\] !~\* '\^data:image\/\(png\|jpeg\|jpg\|gif\|webp\);base64,'/);
});

test("CF11 question sets come from the verified staged payload, never fixture counts", () => {
  assert.match(sql, /INTO expected_official_codes[\s\S]{0,500}capability = 'officialBookQuestions'/);
  assert.match(sql, /INTO expected_self_codes[\s\S]{0,500}capability = 'selfTest'/);
  assert.match(sql, /official_codes IS DISTINCT FROM expected_official_codes/);
  assert.match(sql, /self_codes IS DISTINCT FROM expected_self_codes/);
  assert.match(sql, /'memberCount', cardinality\(expected_self_codes\)/);
  assert.match(sql, /member_count <> cardinality\(expected_self_codes\)/);
  assert.doesNotMatch(sql, /CF11_OFFICIAL_QUESTION_COUNT/);
  assert.doesNotMatch(sql, /CF11_SELFTEST_QUESTION_COUNT/);
  assert.doesNotMatch(sql, /jsonb_array_length\(official_plan\) <> 5/);
  assert.doesNotMatch(sql, /jsonb_array_length\(self_plan\) <> 40/);
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
  assert.match(sql, /coalesce\(o\.metadata->>'eTag', o\.metadata->>'etag'\) = t\.storage_etag/);
  assert.match(sql, /\(o\.metadata->>'size'\)::bigint = t\.byte_size/);
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

test("CF11 READY separation of duties has no admin bypass", () => {
  const ready = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.golden_lesson_attest_cf11_ready"),
    sql.indexOf("-- 8) Grants."),
  );
  assert.match(ready, /IF pub\.published_by = uid THEN/);
  assert.doesNotMatch(ready, /pub\.published_by = uid AND NOT public\.golden_lesson_has_role/);
  assert.match(ready, /CF11_SEPARATION_OF_DUTIES/);
});

test("CF11-R6/6 — the operator panel gates READY on the exact set, not a count", () => {
  assert.match(panel, /import \{ V3_LIFECYCLE_CAPABILITIES \} from "@\/lib\/lessons\/capability-mapping"/);
  assert.doesNotMatch(panel, /CF11_EXPECTED_CAPABILITY_COUNT/);
  assert.match(panel, /setDiff\.exact\s*&&\s*setDiff\.notInReview\.length === 0/);
  for (const marker of ["missing", "extra", "duplicated", "notInReview"]) {
    assert.match(panel, new RegExp(`setDiff\\.${marker}`));
  }
});

/* ------------------------------------------------------------------------------------ *
 * CF11-R8 — EXECUTE ISOLATION, FAIL-CLOSED METADATA, REVOCATION KEY, EXECUTABLE GATE.
 * ------------------------------------------------------------------------------------ */

/** The publication handler source, isolated from the other server functions in the file. */
const publishHandler = fns.slice(
  fns.indexOf("export const publishGoldenLessonCf11"),
  fns.indexOf("export const attestGoldenLessonCf11Ready"),
);
const verifyHandler = fns.slice(
  fns.indexOf("export const verifyGoldenLessonCf11Assets"),
  fns.indexOf("export const publishGoldenLessonCf11"),
);

test("CF11-R8/1 — publish performs ZERO asset writes in DRY_RUN *and* EXECUTE", () => {
  assert.ok(publishHandler.length > 0, "the publication handler must exist");
  for (const forbidden of [
    "uploadVerifiedAssets",
    "ensureVerifiedAssets",
    "attestStoredAssets",
    "golden_lesson_attest_cf11_asset",
    "storage.from",
    ".upload(",
  ]) {
    assert.ok(
      !publishHandler.includes(forbidden),
      `publish must not reach ${forbidden} in any mode`,
    );
  }
  // No mode-conditional write remains: there is no `execute ? ... upload/attest` ternary.
  assert.doesNotMatch(publishHandler, /execute\s*\?\s*await\s+(upload|attest)/);
  // Both modes go through the same read-only resolution.
  assert.match(publishHandler, /await resolveVerifiedAssets\(data\.batchId\)/);
  assert.match(publishHandler, /assetsAttested: 0/);
  assert.match(publishHandler, /assetsUploaded: 0/);
});

test("CF11-R8/2 — only verifyGoldenLessonCf11Assets may upload or attest", () => {
  assert.match(verifyHandler, /ensureVerifiedAssets/);
  assert.match(verifyHandler, /attestStoredAssets/);
  // Exactly one call site each across the whole server-function module.
  assert.ok((verifyHandler.match(/ensureVerifiedAssets/g) ?? []).length >= 2); // import + call
  assert.ok((verifyHandler.match(/attestStoredAssets/g) ?? []).length >= 2);
  assert.equal((publishHandler.match(/uploadVerifiedAssets/g) ?? []).length, 0);
  // The only storage upload and the only attestation RPC live in the server module.
  assert.match(server, /async function storageUpload/);
  assert.equal((server.match(/await storageUpload\(/g) ?? []).length, 1);
  assert.equal((server.match(/golden_lesson_attest_cf11_asset/g) ?? []).length, 1);
});

test("CF11-R8/3 — publish proves assets were already verified, read-only", () => {
  assert.match(server, /export async function assertAssetsVerified/);
  assert.match(server, /CF11_ASSETS_NOT_VERIFIED/);
  assert.match(publishHandler, /await assertAssetsVerified\(lessonId, declarations\)/);
  // The precondition helper itself never writes.
  const helper = server.slice(
    server.indexOf("export async function assertAssetsVerified"),
    server.indexOf("export const CF11_VERIFICATION_ORIGIN"),
  );
  for (const forbidden of [".upload(", "rpc(", "insert("]) {
    assert.ok(!helper.includes(forbidden), `the precondition helper must not call ${forbidden}`);
  }
  // The operator UI enforces the runbook order: verify assets -> DRY_RUN -> EXECUTE.
  assert.match(panel, /const assetsVerified = \(selected\?\.attestedAssets \?\? 0\) > 0/);
  assert.ok((panel.match(/!assetsVerified/g) ?? []).length >= 2);
  assert.match(panel, /تحقق ورفع الأصول/);
});

test("CF11-R8/4 — asset metadata replay is FAIL-CLOSED (no coalesce fallback)", () => {
  // The old fail-open comparisons are gone everywhere.
  assert.doesNotMatch(sql, /coalesce\(\(o\.metadata->>'size'\)::bigint,\s*t\.byte_size\)/);
  assert.doesNotMatch(sql, /coalesce\(o\.metadata->>'mimetype',\s*o\.metadata->>'contentType'/);
  // Presence is mandatory, values are compared exactly.
  assert.match(sql, /AND o\.metadata IS NOT NULL\n\s*AND \(o\.metadata \? 'size'\) AND \(o\.metadata \? 'mimetype'\)/);
  assert.match(sql, /AND \(o\.metadata->>'size'\)::bigint = t\.byte_size/);
  assert.match(sql, /AND o\.metadata->>'mimetype' = t\.mime_type/);
  // Same contract at first READY.
  assert.match(sql, /OR NOT \(o\.metadata \? 'size'\) OR NOT \(o\.metadata \? 'mimetype'\)/);
  assert.match(sql, /OR \(o\.metadata->>'size'\)::bigint IS DISTINCT FROM t\.byte_size/);
  assert.match(sql, /OR o\.metadata->>'mimetype' IS DISTINCT FROM t\.mime_type/);
  // And at publication time, including a non-empty eTag.
  assert.match(sql, /coalesce\(obj_row\.metadata->>'eTag', obj_row\.metadata->>'etag',''\) = ''/);
});

test("CF11-R8/5 — revocation EXECUTE demands its key BEFORE the replay branch", () => {
  const fn = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.golden_lesson_revoke_cf11_ready"),
  );
  const keyGate = fn.indexOf("CF11_REVOKE_IDEMPOTENCY_KEY_REQUIRED");
  const replayBranch = fn.indexOf("SELECT * INTO existing FROM public.golden_lesson_ready_revocations");
  assert.ok(keyGate > 0 && replayBranch > 0);
  assert.ok(keyGate < replayBranch, "the key gate must run before the existing-row replay branch");
  assert.match(fn, /IF _mode = 'EXECUTE' AND \(_idempotency_key IS NULL OR length\(btrim\(_idempotency_key\)\) < 8\)/);
  assert.match(fn, /IF _mode = 'EXECUTE'\n\s*AND btrim\(_idempotency_key\) IS DISTINCT FROM existing\.idempotency_key/);
  assert.match(fn, /CF11_REVOKE_IDEMPOTENCY_KEY_CONFLICT/);
});

test("CF11-R8/6 — applicability, pinned revisions and READY revalidation stay exact", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.cf11_assert_exact_required_lifecycle_set/);
  assert.ok((sql.match(/cf11_assert_exact_required_lifecycle_set\(/g) ?? []).length >= 4);
  assert.match(sql, /applicability NOT IN \('REQUIRED','OPTIONAL'\)/);
  assert.match(sql, /CF11_LIFECYCLE_APPLICABILITY_NOT_PUBLISHABLE/);
  assert.doesNotMatch(sql, /applicability <> 'REQUIRED'/);
  assert.match(sql, /tamkeen\.content-factory-11\.write-plan\.v2/);
  assert.match(sql, /'revisionId'/);
  assert.match(sql, /'payloadHash'/);
  // First READY revalidates the full live state against the recorded plan.
  const ready = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.golden_lesson_attest_cf11_ready"));
  assert.match(ready, /cf11_assert_replay_state\(pub\.result\)/);
  assert.match(panel, /setDiff\.notRequired/);
});

test("CF11-R8/7 — PG17 negatives are executable, not swallowed", () => {
  const section = asserts.slice(asserts.indexOf("-- N) CF11-R8"));
  assert.ok(section.length > 0, "section N must be the R8 version");
  assert.doesNotMatch(section, /EXCEPTION WHEN OTHERS THEN NULL/);
  // DRY_RUN must succeed and self-report.
  assert.match(section, /res->>'mode' = 'DRY_RUN'/);
  assert.match(section, /writes_performed'\)::int, -1\) = 0|writes_performed'\)::int,-1\) = 0/);
  // A real EXECUTE withdrawal with fixture actors, and its exact aftermath.
  assert.match(section, /_mode => 'EXECUTE'/);
  assert.match(section, /status = 'DRAFT' AND applicability = 'REQUIRED'/);
  assert.match(section, /NOT public\.lesson_student_visible\(lesson\)/);
  assert.match(section, /CF11_EXPECTED_REVOKE_LEDGER: the original READY evidence must be preserved/);
  assert.match(section, /CF11_EXPECTED_REVOKE_REPLAY_IDEMPOTENT/);
  assert.match(section, /CF11_EXPECTED_REVOKE_KEY_REQUIRED: a null key replayed successfully/);
  assert.match(section, /CF11_EXPECTED_REVOKE_KEY_CONFLICT/);
  assert.match(section, /CF11_EXPECTED_TERMINAL_READY_REFUSED/);
  // The nine-argument machine attestation signature is unchanged.
  assert.match(server, /_batch_id:[\s\S]{0,400}_mode: mode,/);
  assert.equal((server.match(/_(batch_id|requested_by|asset_code|observed_sha256|observed_bytes|observed_mime|magic_hex|verification_origin|mode):/g) ?? []).length, 9);
});

/* ------------------------------------------------------------------------------------ *
 * CF11-R8B — the generic 21H transition RPC can no longer demote an attested Golden Lesson.
 * ------------------------------------------------------------------------------------ */

const FIXTURE = "scripts/content-factory/pg17/content-factory-11-fixture.sql";
const fixture = readFileSync(FIXTURE, "utf8");

test("CF11-R8B/1 — CF11 re-declares the generic transition with a demotion guard", () => {
  // The 21H migration itself is never edited: CF11 supersedes the function definition.
  const h21 = readFileSync(
    "supabase/migrations-pending/20260818210000_content_v3_21h_hardened_preflight.sql", "utf8");
  assert.doesNotMatch(h21, /CF11_DIRECT_TRANSITION_FORBIDDEN/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.lesson_capability_transition\(/);
  assert.match(sql, /CF11_DIRECT_TRANSITION_FORBIDDEN/);
  // The guard runs before any privilege branch and before any mutation.
  const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.lesson_capability_transition("));
  const guard = fn.indexOf("cf11_assert_demotion_allowed");
  const update = fn.indexOf("UPDATE public.lesson_capability_lifecycle");
  const insert = fn.indexOf("INSERT INTO public.lesson_capability_lifecycle");
  assert.ok(guard > 0 && guard < update && guard < insert);
  // Signature and grants are unchanged, so 21H callers keep working.
  assert.match(fn, /GRANT EXECUTE ON FUNCTION public\.lesson_capability_transition\(uuid,text,text,jsonb,text\) TO authenticated/);
});

test("CF11-R8B/2 — the guard is narrow: only CF11 lessons, canonical capabilities, leaving READY", () => {
  const guard = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.cf11_assert_demotion_allowed"),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.lesson_capability_transition("),
  );
  assert.match(guard, /IF _from_status IS DISTINCT FROM 'READY' THEN RETURN; END IF;/);
  assert.match(guard, /IF _to_status IS NOT DISTINCT FROM 'READY' THEN RETURN; END IF;/);
  assert.match(guard, /_capability = ANY \(public\.cf11_lifecycle_capabilities\(\)\)/);
  assert.doesNotMatch(guard, /_applicability[^;]*<> 'REQUIRED'/);
  assert.match(guard, /NOT public\.cf11_is_managed_lesson\(_lesson_id\)/);
  // Legacy lessons: managed-ness is decided by an actual CF11 publication row.
  assert.match(sql, /FROM public\.golden_lesson_publications WHERE lesson_id = _lesson_id/);
});

test("CF11-R8B/3 — authorization is transaction-local and not forgeable by a client", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.cf11_revocation_tickets/);
  assert.match(sql, /xact_id\s+bigint\s+NOT NULL/);
  assert.match(sql, /VALUES \(txid_current\(\), _lesson_id, _actor_id, _revocation_id\)/);
  assert.match(sql, /WHERE xact_id = txid_current\(\) AND lesson_id = _lesson_id/);
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.cf11_revocation_tickets FROM ${role};`));
  }
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.cf11_open_revocation_ticket\(uuid, uuid, uuid\)\s*\n\s*FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(sql, /ALTER TABLE public\.cf11_revocation_tickets ENABLE ROW LEVEL SECURITY/);
  // No GUC and no boolean bypass parameter anywhere in the guard path.
  assert.doesNotMatch(sql, /current_setting\('cf11[^']*'/);
  assert.doesNotMatch(sql, /_bypass|_allow_direct|_force\b/);
});

test("CF11-R8B/4 — only the controlled withdrawal opens a ticket, and it closes it", () => {
  // Exactly one call site in the whole migration: the controlled withdrawal.
  assert.equal((sql.match(/PERFORM public\.cf11_open_revocation_ticket\(/g) ?? []).length, 1);
  const revoke = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.golden_lesson_revoke_cf11_ready"));
  const open = revoke.indexOf("cf11_open_revocation_ticket(pub.lesson_id, uid, revocation_id)");
  const loop = revoke.indexOf("FOREACH cap IN ARRAY public.cf11_lifecycle_capabilities() LOOP");
  const close = revoke.indexOf("cf11_close_revocation_ticket(pub.lesson_id)");
  assert.ok(open > 0 && open < loop && loop < close, "ticket must wrap the transition loop only");
  assert.ok(revoke.indexOf("CF11_REVOKE_IDEMPOTENCY_KEY_REQUIRED") < open);
  assert.ok(revoke.indexOf("cf11_assert_exact_required_lifecycle_set") < open);
  assert.ok(!fns.includes("cf11_open_revocation_ticket"));
  assert.ok(!server.includes("cf11_open_revocation_ticket"));
});
