/**
 * CF11 — operator server functions: materialize (CF10), publish to REVIEW, attest READY.
 *
 * Security contract:
 *   * Human-only steps (`golden_lesson_publish_cf11`, `golden_lesson_attest_cf11_ready`) are
 *     executed with the OPERATOR'S OWN token via `context.supabase`, never the service role.
 *     Both RPCs re-derive `auth.uid()` and refuse when it disagrees with `_actor_id`, so an
 *     agent or a service key can never stand in for a human reviewer.
 *   * The service role is used ONLY for reads and for content-addressed asset bytes, which are
 *     immutable and hash-pinned; it never performs a review transition.
 *   * Asset declarations are re-derived server-side from the verified bundle. The client cannot
 *     inject a path, a hash, a MIME type or a bucket.
 */

import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireContentStaffAuth, type ContentStaffAuthContext } from "@/integrations/supabase/auth-middleware";
import { verifyGoldenLessonBundle } from "./golden-lesson-bundle-verifier";

const INTAKE_BUCKET = "golden-lesson-intake";
const ASSET_BUCKET = "golden-lesson-assets";

const BatchInput = z.object({ batchId: z.string().uuid() });
const ModeInput = BatchInput.extend({ mode: z.enum(["DRY_RUN", "EXECUTE"]) });
const AttestInput = ModeInput.extend({
  evidence: z.object({
    reviewedContent: z.literal(true),
    reviewedSecurity: z.literal(true),
    note: z.string().trim().min(8).max(500),
  }),
});

type UntypedRpc = (name: string, args: Record<string, unknown>) =>
  Promise<{ data: unknown; error: { message: string } | null }>;

/** The CF11 RPCs are pending migrations, so they are absent from generated types. */
function rpc(client: { rpc: unknown }): UntypedRpc {
  return client.rpc as unknown as UntypedRpc;
}

/** RPC payloads are opaque JSON; return them as a string so the boundary stays serializable. */
function asRpcResult(data: unknown) {
  return { raw: JSON.stringify(data ?? null) };
}

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("CONTENT_FACTORY_PUBLICATION_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface Cf11AssetDeclaration {
  assetCode: string;
  fileName: string;
  mimeType: string;
  sha256: string;
  bytes: number;
  storageBucket: typeof ASSET_BUCKET;
  storagePath: string;
}

export interface Cf11BatchStatus {
  batchId: string;
  packageId: string;
  packageVersion: number;
  reviewStatus: string | null;
  bindingId: string | null;
  lessonId: string | null;
  externalLessonCode: string | null;
  materialized: boolean;
  published: boolean;
  publishedBy: string | null;
  publishedAt: string | null;
  readyAttestedBy: string | null;
  readyAttestedAt: string | null;
  lifecycle: { capability: string; status: string }[];
  declaredAssets: number;
}

/** Reads the operator dashboard state for every staged batch. Read-only; zero writes. */
export const getGoldenLessonCf11Batches = createServerFn({ method: "GET" })
  .middleware([requireContentStaffAuth])
  .handler(async (): Promise<Cf11BatchStatus[]> => {
    const admin = serviceClient();
    const batches = await admin
      .from("golden_lesson_domain_stage_batches")
      .select("id,package_id,package_version")
      .order("created_at", { ascending: false })
      .limit(25);
    if (batches.error) throw new Error(batches.error.message);

    const rows: Cf11BatchStatus[] = [];
    for (const batch of batches.data ?? []) {
      const [binding, mat, review, publication] = await Promise.all([
        admin.from("golden_lesson_identity_bindings")
          .select("id,lesson_id,external_lesson_code").eq("batch_id", batch.id).maybeSingle(),
        admin.from("golden_lesson_domain_materializations")
          .select("id").eq("batch_id", batch.id).maybeSingle(),
        admin.from("golden_lesson_package_reviews")
          .select("to_status").eq("package_id", batch.package_id)
          .eq("package_version", batch.package_version)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        admin.from("golden_lesson_publications")
          .select("id,published_by,published_at")
          .eq("batch_id", batch.id).maybeSingle(),
      ]);
      // READY evidence lives in its own append-only ledger, never on the publication row.
      const readyAttestation = await admin
        .from("golden_lesson_ready_attestations")
        .select("attested_by,attested_at")
        .eq("batch_id", batch.id).maybeSingle();

      const lessonId = (binding.data as { lesson_id?: string } | null)?.lesson_id ?? null;
      let lifecycle: { capability: string; status: string }[] = [];
      let declaredAssets = 0;
      if (lessonId) {
        const lifecycleRows = await admin
          .from("lesson_content_lifecycle")
          .select("capability,status")
          .eq("lesson_id", lessonId);
        lifecycle = (lifecycleRows.data ?? []) as { capability: string; status: string }[];
        const assetRows = await admin
          .from("golden_lesson_published_assets")
          .select("id", { count: "exact", head: true })
          .eq("lesson_id", lessonId);
        declaredAssets = assetRows.count ?? 0;
      }

      rows.push({
        batchId: batch.id,
        packageId: batch.package_id,
        packageVersion: batch.package_version,
        reviewStatus: (review.data as { to_status?: string } | null)?.to_status ?? null,
        bindingId: (binding.data as { id?: string } | null)?.id ?? null,
        lessonId,
        externalLessonCode:
          (binding.data as { external_lesson_code?: string } | null)?.external_lesson_code ?? null,
        materialized: Boolean(mat.data),
        published: Boolean(publication.data),
        publishedBy: (publication.data as { published_by?: string } | null)?.published_by ?? null,
        publishedAt: (publication.data as { published_at?: string } | null)?.published_at ?? null,
        readyAttestedBy:
          (readyAttestation.data as { attested_by?: string } | null)?.attested_by ?? null,
        readyAttestedAt:
          (readyAttestation.data as { attested_at?: string } | null)?.attested_at ?? null,
        lifecycle,
        declaredAssets,
      });
    }
    return rows;
  });

/** CF10 domain materialization. Service-role RPC; admin only; not a human review transition. */
export const materializeGoldenLessonBatch = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => ModeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, isFullAdmin } = context as ContentStaffAuthContext;
    if (!isFullAdmin) throw new Error("CF10_MATERIALIZE_ADMIN_REQUIRED");
    const result = await rpc(serviceClient())("golden_lesson_materialize_domain_batch", {
      _batch_id: data.batchId,
      _actor_id: userId,
      _mode: data.mode,
    });
    if (result.error || !result.data) throw new Error(result.error?.message ?? "CF10_MATERIALIZE_EMPTY_RESPONSE");
    return asRpcResult(result.data);
  });

/**
 * Re-derives asset declarations from the verified bundle and stores the bytes in the private
 * asset bucket under a content-addressed, lesson-scoped path. Never overwrites: an existing
 * object at the same path already has the same SHA-256 by construction.
 */
async function ensureVerifiedAssets(batchId: string): Promise<{
  declarations: Cf11AssetDeclaration[];
  uploaded: number;
  bundleSha256: string;
}> {
  const admin = serviceClient();
  const batch = await admin
    .from("golden_lesson_domain_stage_batches")
    .select("package_id,package_version,verified_bundle_sha256")
    .eq("id", batchId)
    .single();
  if (batch.error || !batch.data) throw new Error(batch.error?.message ?? "CF11_BATCH_NOT_FOUND");

  const binding = await admin
    .from("golden_lesson_identity_bindings")
    .select("lesson_id")
    .eq("batch_id", batchId)
    .single();
  if (binding.error || !binding.data?.lesson_id) {
    throw new Error(binding.error?.message ?? "CF11_IDENTITY_BINDING_MISSING");
  }
  const lessonId = binding.data.lesson_id as string;

  const version = await admin
    .from("golden_lesson_package_versions")
    .select("verified_storage_path,verified_bundle_sha256")
    .eq("package_id", batch.data.package_id)
    .eq("version", batch.data.package_version)
    .single();
  if (version.error || !version.data?.verified_storage_path) {
    throw new Error(version.error?.message ?? "CF11_VERIFIED_BUNDLE_REQUIRED");
  }

  const downloaded = await admin.storage.from(INTAKE_BUCKET).download(version.data.verified_storage_path);
  if (downloaded.error || !downloaded.data) throw new Error(downloaded.error?.message ?? "CF11_BUNDLE_DOWNLOAD_FAILED");
  const verified = await verifyGoldenLessonBundle(new Uint8Array(await downloaded.data.arrayBuffer()));
  if (verified.bundleSha256 !== batch.data.verified_bundle_sha256) throw new Error("CF11_VERIFIED_BUNDLE_IDENTITY_MISMATCH");

  const declarations: Cf11AssetDeclaration[] = [];
  let uploaded = 0;
  for (const asset of verified.assets) {
    const file = verified.files.find((entry) => entry.path === asset.path);
    if (!file) throw new Error("CF11_ASSET_BYTES_MISSING");
    const storagePath = `${lessonId}/${asset.sha256}-${asset.path}`;
    const existing = await admin.storage.from(ASSET_BUCKET).list(lessonId, { search: `${asset.sha256}-${asset.path}` });
    const present = (existing.data ?? []).some((object) => object.name === `${asset.sha256}-${asset.path}`);
    if (!present) {
      const upload = await admin.storage.from(ASSET_BUCKET).upload(storagePath, file.bytes, {
        contentType: asset.mimeType,
        upsert: false,
      });
      if (upload.error) throw new Error(`CF11_ASSET_UPLOAD_FAILED: ${upload.error.message}`);
      uploaded += 1;
    }
    declarations.push({
      assetCode: asset.assetCode,
      fileName: asset.path,
      mimeType: asset.mimeType,
      sha256: asset.sha256,
      bytes: asset.bytes,
      storageBucket: ASSET_BUCKET,
      storagePath,
    });
  }
  return { declarations, uploaded, bundleSha256: verified.bundleSha256 };
}

/** Verify-and-stage the furnace bytes without publishing. Idempotent, content-addressed. */
export const verifyGoldenLessonCf11Assets = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => BatchInput.parse(input))
  .handler(async ({ data }) => {
    const { declarations, uploaded, bundleSha256 } = await ensureVerifiedAssets(data.batchId);
    return { declarations, uploaded, bundleSha256, publicationPerformed: false as const };
  });

/** CF11 publication: DRAFT → REVIEW only. Executed as the human operator. Never reaches READY. */
export const publishGoldenLessonCf11 = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => ModeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as ContentStaffAuthContext;
    const { declarations, uploaded } = await ensureVerifiedAssets(data.batchId);
    const result = await rpc(supabase)("golden_lesson_publish_cf11", {
      _batch_id: data.batchId,
      _actor_id: userId,
      _mode: data.mode,
      _assets: declarations,
    });
    if (result.error || !result.data) throw new Error(result.error?.message ?? "CF11_PUBLISH_EMPTY_RESPONSE");
    return { ...asRpcResult(result.data), assetsUploaded: uploaded, actorId: userId };
  });

/** CF11 READY attestation: REVIEW → READY only, by a human, separate from publication. */
export const attestGoldenLessonCf11Ready = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => AttestInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as ContentStaffAuthContext;
    const result = await rpc(supabase)("golden_lesson_attest_cf11_ready", {
      _batch_id: data.batchId,
      _actor_id: userId,
      _evidence: data.evidence,
      _mode: data.mode,
    });
    if (result.error || !result.data) throw new Error(result.error?.message ?? "CF11_ATTEST_EMPTY_RESPONSE");
    return { ...asRpcResult(result.data), actorId: userId };
  });
