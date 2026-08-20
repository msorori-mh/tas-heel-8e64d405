/**
 * CF11 — operator server functions: materialize (CF10), attest assets, publish to REVIEW,
 * attest READY. Thin RPC wrappers only; the security contract lives in
 * `./golden-lesson-publication.server`.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireContentStaffAuth, type ContentStaffAuthContext } from "@/integrations/supabase/auth-middleware";
import type {
  Cf11AssetAttestation,
  Cf11AssetDeclaration,
  Cf11BatchStatus,
} from "./golden-lesson-publication.server";

export type { Cf11AssetAttestation, Cf11AssetDeclaration, Cf11BatchStatus };

const SHA256 = /^[0-9a-f]{64}$/;

const BatchInput = z.object({ batchId: z.string().uuid() });
const ModeInput = BatchInput.extend({
  mode: z.enum(["DRY_RUN", "EXECUTE"]),
  /** Required for EXECUTE: the write-plan hash returned by the DRY_RUN the operator reviewed. */
  expectedPlanSha256: z.string().regex(SHA256).optional(),
});
const AttestInput = BatchInput.extend({
  mode: z.enum(["DRY_RUN", "EXECUTE"]),
  evidence: z.object({
    reviewedContent: z.literal(true),
    reviewedSecurity: z.literal(true),
    note: z.string().trim().min(8).max(500),
  }),
});

/** Reads the operator dashboard state for every staged batch. Read-only; zero writes. */
export const getGoldenLessonCf11Batches = createServerFn({ method: "GET" })
  .middleware([requireContentStaffAuth])
  .handler(async (): Promise<Cf11BatchStatus[]> => {
    const { readCf11Batches } = await import("./golden-lesson-publication.server");
    return readCf11Batches();
  });

/**
 * CF10 domain materialization, executed with the OPERATOR'S token through the R4 wrapper RPC.
 * The service role is not involved: `auth.uid()` inside the wrapper is the human operator.
 */
export const materializeGoldenLessonBatch = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => ModeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { asRpcResult, idempotencyKey, planSha, requirePlan, rpc } =
      await import("./golden-lesson-publication.server");
    const { supabase, userId, isFullAdmin } = context as ContentStaffAuthContext;
    if (!isFullAdmin) throw new Error("CF10_MATERIALIZE_ADMIN_REQUIRED");
    const expected = requirePlan(data.mode, data.expectedPlanSha256, "CF10_WRITE_PLAN_HASH_REQUIRED");
    const result = await rpc(supabase)("golden_lesson_materialize_domain_batch_operator", {
      _batch_id: data.batchId,
      _actor_id: userId,
      _mode: data.mode,
      _expected_plan_sha256: expected,
      _idempotency_key:
        data.mode === "EXECUTE" && expected ? idempotencyKey("cf10", data.batchId, expected) : null,
    });
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error("CF10_MATERIALIZE_EMPTY_RESPONSE");
    return { ...asRpcResult(result.data), planSha256: planSha(result.data, "write_plan_sha256") };
  });

/**
 * Verify-and-stage the furnace bytes and append their upload attestations, without publishing.
 * Idempotent and content-addressed; the attestation RPC refuses a second, different attestation.
 */
export const verifyGoldenLessonCf11Assets = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => BatchInput.parse(input))
  .handler(async ({ data, context }) => {
    const { attestStoredAssets, ensureVerifiedAssets } =
      await import("./golden-lesson-publication.server");
    const { supabase, userId } = context as ContentStaffAuthContext;
    const { declarations, uploadedPaths, bundleSha256 } = await ensureVerifiedAssets(data.batchId);
    const attestations = await attestStoredAssets(
      supabase, userId, data.batchId, declarations, uploadedPaths, "EXECUTE",
    );
    return {
      declarations,
      attestations,
      uploaded: uploadedPaths.size,
      bundleSha256,
      publicationPerformed: false as const,
    };
  });

/** CF11 publication: DRAFT → REVIEW only. Executed as the human operator. Never reaches READY. */
export const publishGoldenLessonCf11 = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => ModeInput.parse(input))
  .handler(async ({ data, context }) => {
    const {
      asRpcResult, attestStoredAssets, ensureVerifiedAssets, idempotencyKey, planSha, requirePlan, rpc,
    } = await import("./golden-lesson-publication.server");
    const { supabase, userId } = context as ContentStaffAuthContext;
    const expected = requirePlan(data.mode, data.expectedPlanSha256, "CF11_WRITE_PLAN_HASH_REQUIRED");
    const { declarations, uploadedPaths } = await ensureVerifiedAssets(data.batchId);
    // Publication may only proceed on bytes that are already attested by a human operator.
    const attestations = await attestStoredAssets(
      supabase, userId, data.batchId, declarations, uploadedPaths, "EXECUTE",
    );
    const result = await rpc(supabase)("golden_lesson_publish_cf11", {
      _batch_id: data.batchId,
      _actor_id: userId,
      _mode: data.mode,
      _assets: declarations,
      _expected_plan_sha256: expected,
      _idempotency_key:
        data.mode === "EXECUTE" && expected ? idempotencyKey("cf11", data.batchId, expected) : null,
    });
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error("CF11_PUBLISH_EMPTY_RESPONSE");
    return {
      ...asRpcResult(result.data),
      planSha256: planSha(result.data, "plan_sha256"),
      assetsAttested: attestations.length,
      assetsUploaded: uploadedPaths.size,
      actorId: userId,
    };
  });

/** CF11 READY attestation: REVIEW → READY only, by a human, separate from publication. */
export const attestGoldenLessonCf11Ready = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => AttestInput.parse(input))
  .handler(async ({ data, context }) => {
    const { asRpcResult, rpc } = await import("./golden-lesson-publication.server");
    const { supabase, userId } = context as ContentStaffAuthContext;
    const result = await rpc(supabase)("golden_lesson_attest_cf11_ready", {
      _batch_id: data.batchId,
      _actor_id: userId,
      _evidence: data.evidence,
      _mode: data.mode,
    });
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error("CF11_ATTEST_EMPTY_RESPONSE");
    return { ...asRpcResult(result.data), actorId: userId };
  });
