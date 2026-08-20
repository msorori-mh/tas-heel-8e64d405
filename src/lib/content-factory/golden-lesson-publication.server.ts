/**
 * CF11 — server-only helpers behind the operator server functions.
 *
 * Security contract (CF11-R4):
 *   * EVERY state transition — CF10 materialization, upload attestation, publication and READY
 *     attestation — is executed with the OPERATOR'S OWN token. The service role never performs,
 *     approves or orchestrates a transition. CF10 is reached exclusively through
 *     `golden_lesson_materialize_domain_batch_operator`, which re-derives the actor from
 *     `auth.uid()` and refuses any disagreement with `_actor_id`.
 *   * The service role is used ONLY to read staging metadata and to move content-addressed,
 *     hash-pinned bytes into the private asset bucket. Storing bytes is not an approval; they
 *     only become usable once a human attests them and the server re-measures them.
 *   * Asset declarations are re-derived server-side from the verified bundle manifest. The client
 *     cannot inject a path, a hash, a MIME type or a bucket.
 *   * Fail-closed: every query/storage/RPC error throws. A read that cannot be completed must
 *     never degrade into "nothing to review".
 *   * Replay-guarded: EXECUTE requires the write-plan hash the operator actually reviewed in the
 *     DRY_RUN, and carries a deterministic idempotency key derived from that same hash.
 */

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { verifyGoldenLessonBundle } from "./golden-lesson-bundle-verifier";

export const INTAKE_BUCKET = "golden-lesson-intake";
export const ASSET_BUCKET = "golden-lesson-assets";

/** The single authoritative lifecycle relation. No other lifecycle relation exists. */
export const CF11_LIFECYCLE_TABLE = "lesson_capability_lifecycle" as const;

export const SHA256_RE = /^[0-9a-f]{64}$/;

export type UntypedRpc = (name: string, args: Record<string, unknown>) =>
  Promise<{ data: unknown; error: { message: string } | null }>;

/** The CF11 RPCs are pending migrations, so they are absent from generated types. */
export function rpc(client: { rpc: unknown }): UntypedRpc {
  return client.rpc as unknown as UntypedRpc;
}

/** RPC payloads are opaque JSON; return them as a string so the boundary stays serializable. */
export function asRpcResult(data: unknown) {
  return { raw: JSON.stringify(data ?? null) };
}

/** Fail-closed helper: a query that errored is never treated as "no rows". */
export function ok<T>(result: { data: T; error: { message: string } | null }, code: string): T {
  if (result.error) throw new Error(`${code}: ${result.error.message}`);
  return result.data;
}

export function planSha(result: unknown, key: "plan_sha256" | "write_plan_sha256"): string | null {
  const value = (result as Record<string, unknown> | null)?.[key];
  return typeof value === "string" && SHA256_RE.test(value) ? value : null;
}

/**
 * Deterministic replay key. Derived from the batch and the exact write plan the operator
 * approved, so a retry of the same approved plan is idempotent while a different plan is a
 * conflict rather than a silent second write.
 */
export function idempotencyKey(prefix: string, batchId: string, sha: string): string {
  return `${prefix}-${batchId}-${sha.slice(0, 16)}`;
}

export function requirePlan(mode: string, expected: string | undefined, code: string): string | null {
  if (mode !== "EXECUTE") return expected ?? null;
  if (!expected || !SHA256_RE.test(expected)) throw new Error(code);
  return expected;
}

export function serviceClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
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

export interface Cf11AssetAttestation extends Cf11AssetDeclaration {
  magicHex: string;
  attestationSha256: string | null;
  uploaded: boolean;
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
  attestedAssets: number;
}

/** Reads the operator dashboard state for every staged batch. Read-only; zero writes. */
export async function readCf11Batches(): Promise<Cf11BatchStatus[]> {
  const admin = serviceClient();
  const batches = ok(
    await admin
      .from("golden_lesson_domain_stage_batches")
      .select("id,package_id,package_version")
      .order("created_at", { ascending: false })
      .limit(25),
    "CF11_BATCHES_READ_FAILED",
  );

  const rows: Cf11BatchStatus[] = [];
  for (const batch of batches ?? []) {
    const [binding, mat, review, publication, readyAttestation] = await Promise.all([
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
      // READY evidence lives in its own append-only ledger, never on the publication row.
      admin.from("golden_lesson_ready_attestations")
        .select("attested_by,attested_at").eq("batch_id", batch.id).maybeSingle(),
    ]);
    const bindingRow = ok(binding, "CF11_BINDING_READ_FAILED") as
      { id?: string; lesson_id?: string; external_lesson_code?: string } | null;
    const matRow = ok(mat, "CF11_MATERIALIZATION_READ_FAILED");
    const reviewRow = ok(review, "CF11_REVIEW_READ_FAILED") as { to_status?: string } | null;
    const publicationRow = ok(publication, "CF11_PUBLICATION_READ_FAILED") as
      { published_by?: string; published_at?: string } | null;
    const readyRow = ok(readyAttestation, "CF11_READY_LEDGER_READ_FAILED") as
      { attested_by?: string; attested_at?: string } | null;

    const lessonId = bindingRow?.lesson_id ?? null;
    let lifecycle: { capability: string; status: string }[] = [];
    let declaredAssets = 0;
    let attestedAssets = 0;
    if (lessonId) {
      lifecycle = (ok(
        await admin.from(CF11_LIFECYCLE_TABLE).select("capability,status").eq("lesson_id", lessonId),
        "CF11_LIFECYCLE_READ_FAILED",
      ) ?? []) as { capability: string; status: string }[];
      const assetRows = await admin
        .from("golden_lesson_published_assets")
        .select("id", { count: "exact", head: true })
        .eq("lesson_id", lessonId);
      ok(assetRows, "CF11_PUBLISHED_ASSETS_READ_FAILED");
      declaredAssets = assetRows.count ?? 0;
      const attestationRows = await admin
        .from("golden_lesson_asset_attestations")
        .select("id", { count: "exact", head: true })
        .eq("lesson_id", lessonId);
      ok(attestationRows, "CF11_ASSET_ATTESTATIONS_READ_FAILED");
      attestedAssets = attestationRows.count ?? 0;
    }

    rows.push({
      batchId: batch.id,
      packageId: batch.package_id,
      packageVersion: batch.package_version,
      reviewStatus: reviewRow?.to_status ?? null,
      bindingId: bindingRow?.id ?? null,
      lessonId,
      externalLessonCode: bindingRow?.external_lesson_code ?? null,
      materialized: Boolean(matRow),
      published: Boolean(publicationRow),
      publishedBy: publicationRow?.published_by ?? null,
      publishedAt: publicationRow?.published_at ?? null,
      readyAttestedBy: readyRow?.attested_by ?? null,
      readyAttestedAt: readyRow?.attested_at ?? null,
      lifecycle,
      declaredAssets,
      attestedAssets,
    });
  }
  return rows;
}

/**
 * Re-derives asset declarations from the verified bundle and stores the bytes in the private
 * asset bucket under a content-addressed, lesson-scoped path. Never overwrites: an existing
 * object at the same path already has the same SHA-256 by construction.
 */
export async function ensureVerifiedAssets(batchId: string): Promise<{
  lessonId: string;
  declarations: Cf11AssetDeclaration[];
  uploadedPaths: Set<string>;
  bundleSha256: string;
}> {
  const admin = serviceClient();
  const batch = ok(
    await admin
      .from("golden_lesson_domain_stage_batches")
      .select("package_id,package_version,verified_bundle_sha256")
      .eq("id", batchId)
      .single(),
    "CF11_BATCH_NOT_FOUND",
  );
  if (!batch) throw new Error("CF11_BATCH_NOT_FOUND");



  const binding = ok(
    await admin
      .from("golden_lesson_identity_bindings")
      .select("lesson_id")
      .eq("batch_id", batchId)
      .single(),
    "CF11_IDENTITY_BINDING_MISSING",
  );
  const lessonId = binding?.lesson_id as string | undefined;
  if (!lessonId) throw new Error("CF11_IDENTITY_BINDING_MISSING");

  const version = ok(
    await admin
      .from("golden_lesson_package_versions")
      .select("verified_storage_path,verified_bundle_sha256")
      .eq("package_id", batch.package_id)
      .eq("version", batch.package_version)
      .single(),
    "CF11_VERIFIED_BUNDLE_REQUIRED",
  );
  if (!version?.verified_storage_path) throw new Error("CF11_VERIFIED_BUNDLE_REQUIRED");

  const downloaded = await admin.storage.from(INTAKE_BUCKET).download(version.verified_storage_path);
  if (downloaded.error || !downloaded.data) {
    throw new Error(`CF11_BUNDLE_DOWNLOAD_FAILED: ${downloaded.error?.message ?? "empty"}`);
  }
  const verified = await verifyGoldenLessonBundle(new Uint8Array(await downloaded.data.arrayBuffer()));
  if (verified.bundleSha256 !== batch.verified_bundle_sha256) {
    throw new Error("CF11_VERIFIED_BUNDLE_IDENTITY_MISMATCH");
  }

  const declarations: Cf11AssetDeclaration[] = [];
  const uploadedPaths = new Set<string>();
  for (const asset of verified.assets) {
    const file = verified.files.find((entry) => entry.path === asset.path);
    if (!file) throw new Error("CF11_ASSET_BYTES_MISSING");
    const objectName = `${asset.sha256}-${asset.path}`;
    const storagePath = `${lessonId}/${objectName}`;
    const existing = await admin.storage.from(ASSET_BUCKET).list(lessonId, { search: objectName });
    if (existing.error) throw new Error(`CF11_ASSET_LIST_FAILED: ${existing.error.message}`);
    const present = (existing.data ?? []).some((object) => object.name === objectName);
    if (!present) {
      const upload = await admin.storage.from(ASSET_BUCKET).upload(storagePath, file.bytes, {
        contentType: asset.mimeType,
        upsert: false,
      });
      if (upload.error) throw new Error(`CF11_ASSET_UPLOAD_FAILED: ${upload.error.message}`);
      uploadedPaths.add(storagePath);
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
  return { lessonId, declarations, uploadedPaths, bundleSha256: verified.bundleSha256 };
}

/**
 * Re-measures the bytes that are actually in the bucket — never the bytes we think we uploaded,
 * and never the object's own filename — then asks the database to append one immutable upload
 * attestation per declared asset with the operator's token.
 */
export async function attestStoredAssets(
  supabase: { rpc: unknown },
  userId: string,
  batchId: string,
  declarations: Cf11AssetDeclaration[],
  uploadedPaths: Set<string>,
  mode: "DRY_RUN" | "EXECUTE",
): Promise<Cf11AssetAttestation[]> {
  const admin = serviceClient();
  const out: Cf11AssetAttestation[] = [];
  for (const declaration of declarations) {
    const stored = await admin.storage.from(ASSET_BUCKET).download(declaration.storagePath);
    if (stored.error || !stored.data) {
      throw new Error(`CF11_ASSET_READBACK_FAILED: ${declaration.assetCode}`);
    }
    const bytes = new Uint8Array(await stored.data.arrayBuffer());
    const observedSha = createHash("sha256").update(bytes).digest("hex");
    if (observedSha !== declaration.sha256) throw new Error(`CF11_ASSET_BYTES_MISMATCH: ${declaration.assetCode}`);
    if (bytes.byteLength !== declaration.bytes) throw new Error(`CF11_ASSET_SIZE_MISMATCH: ${declaration.assetCode}`);
    const magicHex = Buffer.from(bytes.subarray(0, 16)).toString("hex");

    const result = await rpc(supabase)("golden_lesson_attest_cf11_asset", {
      _batch_id: batchId,
      _actor_id: userId,
      _asset_code: declaration.assetCode,
      _observed_sha256: observedSha,
      _observed_bytes: bytes.byteLength,
      _observed_mime: declaration.mimeType,
      _magic_hex: magicHex,
      _mode: mode,
    });
    if (result.error) throw new Error(`CF11_ASSET_ATTESTATION_FAILED: ${result.error.message}`);
    const payload = result.data as { attestationSha256?: string } | null;
    if (!payload?.attestationSha256) throw new Error(`CF11_ASSET_ATTESTATION_EMPTY: ${declaration.assetCode}`);

    out.push({
      ...declaration,
      magicHex,
      attestationSha256: payload.attestationSha256,
      uploaded: uploadedPaths.has(declaration.storagePath),
    });
  }
  return out;
}
