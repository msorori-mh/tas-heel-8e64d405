/**
 * CF11-R3 ADDENDUM — operator input contract (runtime).
 *
 * EXECUTE must carry the exact plan SHA the operator reviewed in DRY_RUN, plus a stable
 * idempotency key derived from that same plan. Blank / malformed / drifting hashes must throw
 * before any RPC is reached.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  idempotencyKey,
  planSha,
  requirePlan,
} from "@/lib/content-factory/golden-lesson-publication.server";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const BATCH = "51000000-0000-0000-0000-000000000001";

test("EXECUTE refuses a blank plan hash", () => {
  assert.throws(
    () => requirePlan("EXECUTE", undefined, "CF10_WRITE_PLAN_HASH_REQUIRED"),
    /CF10_WRITE_PLAN_HASH_REQUIRED/,
  );
  assert.throws(
    () => requirePlan("EXECUTE", "", "CF11_PLAN_HASH_REQUIRED"),
    /CF11_PLAN_HASH_REQUIRED/,
  );
});

test("EXECUTE refuses a malformed plan hash", () => {
  assert.throws(() => requirePlan("EXECUTE", "not-a-sha", "CF11_PLAN_HASH_REQUIRED"));
  assert.throws(() => requirePlan("EXECUTE", SHA_A.slice(0, 63), "CF11_PLAN_HASH_REQUIRED"));
});

test("EXECUTE passes through an exact 64-hex hash; DRY_RUN never requires one", () => {
  assert.equal(requirePlan("EXECUTE", SHA_A, "X"), SHA_A);
  assert.equal(requirePlan("DRY_RUN", undefined, "X"), null);
});

test("the idempotency key is deterministic per (stage, batch, plan) and diverges on drift", () => {
  assert.equal(idempotencyKey("cf10", BATCH, SHA_A), idempotencyKey("cf10", BATCH, SHA_A));
  assert.ok(idempotencyKey("cf10", BATCH, SHA_A).length >= 8);
  // A different reviewed plan must NOT reuse the stored key: the RPC then conflicts.
  assert.notEqual(idempotencyKey("cf10", BATCH, SHA_A), idempotencyKey("cf10", BATCH, SHA_B));
  // Stages never collide.
  assert.notEqual(idempotencyKey("cf10", BATCH, SHA_A), idempotencyKey("cf11", BATCH, SHA_A));
});

test("planSha only accepts a real 64-hex hash from the DRY_RUN payload", () => {
  assert.equal(planSha({ write_plan_sha256: SHA_A }, "write_plan_sha256"), SHA_A);
  assert.equal(planSha({ plan_sha256: "oops" }, "plan_sha256"), null);
  assert.equal(planSha(null, "plan_sha256"), null);
});
