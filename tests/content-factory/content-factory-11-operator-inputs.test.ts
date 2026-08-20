/**
 * CF11-R3 ADDENDUM — operator input contract (runtime).
 *
 * EXECUTE must carry the exact plan SHA the operator reviewed in DRY_RUN, plus a stable
 * idempotency key derived from that same plan. Blank / malformed / drifting hashes must throw
 * before any RPC is reached.
 */
import { describe, expect, it } from "vitest";
import {
  idempotencyKey,
  planSha,
  requirePlan,
} from "@/lib/content-factory/golden-lesson-publication.server";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const BATCH = "51000000-0000-0000-0000-000000000001";

describe("CF11 operator plan/idempotency contract", () => {
  it("EXECUTE refuses a blank plan hash", () => {
    expect(() => requirePlan("EXECUTE", undefined, "CF10_WRITE_PLAN_HASH_REQUIRED")).toThrow(
      "CF10_WRITE_PLAN_HASH_REQUIRED",
    );
    expect(() => requirePlan("EXECUTE", "", "CF11_PLAN_HASH_REQUIRED")).toThrow(
      "CF11_PLAN_HASH_REQUIRED",
    );
  });

  it("EXECUTE refuses a malformed plan hash", () => {
    expect(() => requirePlan("EXECUTE", "not-a-sha", "CF11_PLAN_HASH_REQUIRED")).toThrow();
    expect(() => requirePlan("EXECUTE", SHA_A.slice(0, 63), "CF11_PLAN_HASH_REQUIRED")).toThrow();
  });

  it("EXECUTE passes through an exact 64-hex hash; DRY_RUN never requires one", () => {
    expect(requirePlan("EXECUTE", SHA_A, "X")).toBe(SHA_A);
    expect(requirePlan("DRY_RUN", undefined, "X")).toBeNull();
  });

  it("the idempotency key is deterministic per (stage, batch, plan) and diverges on drift", () => {
    expect(idempotencyKey("cf10", BATCH, SHA_A)).toBe(idempotencyKey("cf10", BATCH, SHA_A));
    expect(idempotencyKey("cf10", BATCH, SHA_A).length).toBeGreaterThanOrEqual(8);
    // A different reviewed plan must NOT reuse the stored key: the RPC then conflicts.
    expect(idempotencyKey("cf10", BATCH, SHA_A)).not.toBe(idempotencyKey("cf10", BATCH, SHA_B));
    // Stages never collide.
    expect(idempotencyKey("cf10", BATCH, SHA_A)).not.toBe(idempotencyKey("cf11", BATCH, SHA_A));
  });

  it("planSha only accepts a real 64-hex hash from the DRY_RUN payload", () => {
    expect(planSha({ write_plan_sha256: SHA_A }, "write_plan_sha256")).toBe(SHA_A);
    expect(planSha({ plan_sha256: "oops" }, "plan_sha256")).toBeNull();
    expect(planSha(null, "plan_sha256")).toBeNull();
  });
});
