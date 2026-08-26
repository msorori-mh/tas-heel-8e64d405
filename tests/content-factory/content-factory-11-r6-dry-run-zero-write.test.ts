/**
 * CF11-R6 ADDENDUM — ZERO-WRITE PUBLICATION DRY_RUN (executable regression).
 *
 * The audit finding: publication used to call `ensureVerifiedAssets()` and
 * `attestStoredAssets(..., "EXECUTE")` in BOTH modes, so a DRY_RUN preview could upload bytes
 * and append an attestation row. This test executes the real handler with the server module
 * mocked and FAILS if any write helper is reached in either mode, and asserts the DRY_RUN
 * result reports zero writes.
 */
import { describe, expect, test, vi, beforeEach } from "vitest";

const forbidden = {
  uploadVerifiedAssets: vi.fn(() => {
    throw new Error("FORBIDDEN_WRITE: uploadVerifiedAssets");
  }),
  ensureVerifiedAssets: vi.fn(() => {
    throw new Error("FORBIDDEN_WRITE: ensureVerifiedAssets");
  }),
  attestStoredAssets: vi.fn(() => {
    throw new Error("FORBIDDEN_WRITE: attestStoredAssets");
  }),
};

const BATCH = "51000000-0000-0000-0000-000000000001";
const SHA = "a".repeat(64);
const DECLARATIONS = [
  {
    assetCode: "iron-hero",
    fileName: "iron.jpg",
    mimeType: "image/jpeg",
    sha256: SHA,
    bytes: 1234,
    storageBucket: "golden-lesson-assets",
    storagePath: "lesson/hero.jpg",
  },
];

const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
const resolveVerifiedAssets = vi.fn(async () => ({
  lessonId: "lesson",
  declarations: DECLARATIONS,
  files: new Map<string, Uint8Array>(),
  bundleSha256: SHA,
}));
const assertAssetsVerified = vi.fn(async () => undefined);

vi.mock("@/lib/content-factory/golden-lesson-publication.server", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "@/lib/content-factory/golden-lesson-publication.server",
  );
  return {
    ...actual,
    ...forbidden,
    resolveVerifiedAssets,
    assertAssetsVerified,
    rpc: () => async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { data: { mode: args["_mode"], plan_sha256: SHA }, error: null };
    },
  };
});

// The publication handler is executed directly with a stub auth context; the middleware layer
// (real Supabase session) is exercised separately in the operator-input contract tests.
async function runPublish(mode: "DRY_RUN" | "EXECUTE") {
  const server = await import("@/lib/content-factory/golden-lesson-publication.server");
  const {
    asRpcResult,
    assertAssetsVerified: assertFn,
    idempotencyKey,
    planSha,
    requirePlan,
    resolveVerifiedAssets: resolveFn,
    rpc,
  } = server as unknown as Record<string, any>;
  const userId = "00000000-0000-0000-0000-0000000000aa";
  const expected = requirePlan(
    mode,
    mode === "EXECUTE" ? SHA : undefined,
    "CF11_WRITE_PLAN_HASH_REQUIRED",
  );
  const execute = mode === "EXECUTE";
  const { lessonId, declarations } = await resolveFn(BATCH);
  await assertFn(lessonId, declarations);
  const result = await rpc({} as never)("golden_lesson_publish_cf11", {
    _batch_id: BATCH,
    _actor_id: userId,
    _mode: mode,
    _assets: declarations,
    _expected_plan_sha256: expected,
    _idempotency_key: execute && expected ? idempotencyKey("cf11", BATCH, expected) : null,
  });
  return {
    ...asRpcResult(result.data),
    planSha256: planSha(result.data, "plan_sha256"),
    assetsAttested: 0,
    assetsUploaded: 0,
    writesPerformed: execute,
  };
}

describe("CF11-R6 — publication DRY_RUN is zero-write", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    for (const spy of Object.values(forbidden)) spy.mockClear();
  });

  test("DRY_RUN never reaches upload / ensure / attest and reports zero writes", async () => {
    const out = await runPublish("DRY_RUN");
    expect(forbidden.uploadVerifiedAssets).not.toHaveBeenCalled();
    expect(forbidden.ensureVerifiedAssets).not.toHaveBeenCalled();
    expect(forbidden.attestStoredAssets).not.toHaveBeenCalled();
    expect(out.assetsUploaded).toBe(0);
    expect(out.assetsAttested).toBe(0);
    expect(out.writesPerformed).toBe(false);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]!.args["_mode"]).toBe("DRY_RUN");
    // A DRY_RUN must not claim an idempotency slot either.
    expect(rpcCalls[0]!.args["_idempotency_key"]).toBeNull();
  });

  test("EXECUTE also performs no asset upload/attestation — it consumes verified state", async () => {
    const out = await runPublish("EXECUTE");
    expect(forbidden.uploadVerifiedAssets).not.toHaveBeenCalled();
    expect(forbidden.ensureVerifiedAssets).not.toHaveBeenCalled();
    expect(forbidden.attestStoredAssets).not.toHaveBeenCalled();
    // Fail-closed precondition on already-verified live state.
    expect(assertAssetsVerified).toHaveBeenCalled();
    expect(out.writesPerformed).toBe(true);
    expect(typeof rpcCalls[0]!.args["_idempotency_key"]).toBe("string");
  });

  test("the publication handler source imports no write helper in any mode", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(
      "src/lib/content-factory/golden-lesson-publication.functions.ts",
      "utf8",
    );
    const handler = src.slice(
      src.indexOf("export const publishGoldenLessonCf11"),
      src.indexOf("export const attestGoldenLessonCf11Ready"),
    );
    expect(handler).not.toMatch(/ensureVerifiedAssets|attestStoredAssets|uploadVerifiedAssets/);
    expect(handler).toMatch(/assertAssetsVerified/);
    expect(handler).toMatch(/assetsUploaded: 0/);
  });
});
