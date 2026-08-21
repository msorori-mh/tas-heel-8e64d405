/**
 * CF11 — server-only helpers behind the operator server functions.
 *
 * Security contract (CF11-R5):
 *   * EVERY editorial transition — CF10 materialization, publication and READY attestation — is
 *     executed with the OPERATOR'S OWN token. The service role never performs, approves or
 *     orchestrates an editorial transition. CF10 is reached exclusively through
 *     `golden_lesson_materialize_domain_batch_operator`, which re-derives the actor from
 *     `auth.uid()` and refuses any disagreement with `_actor_id`; the raw CF10 RPC has no grant
 *     to service_role at all.
 *   * The upload attestation is the one MACHINE step: the server downloads the stored object,
 *     re-measures sha256 / byte size / magic bytes and appends the attestation with the service
 *     role. A human cannot execute that RPC, so no operator can ever claim bytes they did not
 *     produce; the requesting operator is recorded as `requested_by` only.
 *   * Asset declarations are re-derived server-side from the verified bundle manifest. The client
 *     cannot inject a path, a hash, a MIME type or a bucket.
 *   * Fail-closed: every query/storage/RPC error throws. A read that cannot be completed must
 *     never degrade into "nothing to review".
 *   * Replay-guarded: EXECUTE requires the write-plan hash the operator actually reviewed in the
 *     DRY_RUN, carries a deterministic idempotency key derived from that same hash, and every
 *     replay re-derives the full live state before it may report success.

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

type StorageListObject = {
  name: string;
  metadata?: { size?: number; mimetype?: string };
};

function storageServiceConfig() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("CONTENT_FACTORY_PUBLICATION_NOT_CONFIGURED");
  return { url: url.replace(/\/$/, ""), key };
}

function storageObjectPath(bucket: string, path: string, authenticated = false) {
  const { url } = storageServiceConfig();
  const encoded = [bucket, ...path.split("/")].map(encodeURIComponent).join("/");
  return `${url}/storage/v1/object/${authenticated ? "authenticated/" : ""}${encoded}`;
}

function storageHeaders(contentType?: string) {
  const { key } = storageServiceConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

async function storageDownload(bucket: string, path: string, code: string): Promise<Uint8Array> {
  const response = await fetch(storageObjectPath(bucket, path, true), {
    method: "GET",
    headers: storageHeaders(),
  });
  if (!response.ok) throw new Error(`${code}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function storageList(bucket: string, prefix: string, search: string): Promise<StorageListObject[]> {
  const { url } = storageServiceConfig();
  const response = await fetch(`${url}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
    method: "POST",
    headers: storageHeaders("application/json"),
    body: JSON.stringify({
      prefix,
      search,
      limit: 100,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    }),
  });
  if (!response.ok) throw new Error(`CF11_ASSET_LIST_FAILED: HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("CF11_ASSET_LIST_FAILED: invalid response");
  return payload as StorageListObject[];
}

async function storageUpload(
  bucket: string,
  path: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<void> {
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  const response = await fetch(storageObjectPath(bucket, path), {
    method: "POST",
    headers: { ...storageHeaders(mimeType), "x-upsert": "false" },
    body: body.buffer,
  });
  if (!response.ok) throw new Error(`CF11_ASSET_UPLOAD_FAILED: HTTP ${response.status}`);
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
  readyRevokedBy: string | null;
  readyRevokedAt: string | null;
  lifecycle: { capability: string; status: string; applicability: string }[];
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
      // Schema of record orders staged batches by staged_at; there is no created_at column.
      .order("staged_at", { ascending: false })
      .limit(25),
    "CF11_BATCHES_READ_FAILED",
  );

  const rows: Cf11BatchStatus[] = [];
  for (const batch of batches ?? []) {
    const [binding, mat, review, publication, readyAttestation, revocation] = await Promise.all([
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
      // CF11-R7: a withdrawal is a forward fact in its own ledger; the READY row stays intact.
      admin.from("golden_lesson_ready_revocations")
        .select("revoked_by,revoked_at").eq("batch_id", batch.id).maybeSingle(),
    ]);
    const bindingRow = ok(binding, "CF11_BINDING_READ_FAILED") as
      { id?: string; lesson_id?: string; external_lesson_code?: string } | null;
    const matRow = ok(mat, "CF11_MATERIALIZATION_READ_FAILED");
    const reviewRow = ok(review, "CF11_REVIEW_READ_FAILED") as { to_status?: string } | null;
    const publicationRow = ok(publication, "CF11_PUBLICATION_READ_FAILED") as
      { published_by?: string; published_at?: string } | null;
    const readyRow = ok(readyAttestation, "CF11_READY_LEDGER_READ_FAILED") as
      { attested_by?: string; attested_at?: string } | null;
    const revokedRow = ok(revocation, "CF11_REVOCATION_LEDGER_READ_FAILED") as
      { revoked_by?: string; revoked_at?: string } | null;

    const lessonId = bindingRow?.lesson_id ?? null;
    let lifecycle: { capability: string; status: string; applicability: string }[] = [];
    let declaredAssets = 0;
    let attestedAssets = 0;
    if (lessonId) {
      lifecycle = (ok(
        await admin.from(CF11_LIFECYCLE_TABLE)
          .select("capability,status,applicability").eq("lesson_id", lessonId),
        "CF11_LIFECYCLE_READ_FAILED",
      ) ?? []) as { capability: string; status: string; applicability: string }[];
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
      readyRevokedBy: revokedRow?.revoked_by ?? null,
      readyRevokedAt: revokedRow?.revoked_at ?? null,
      lifecycle,
      declaredAssets,
      attestedAssets,
    });
  }
  return rows;
}

/**
 * CF11-R7 — READ-ONLY resolver. Downloads and re-verifies the bundle, then derives the exact
 * asset declarations (content-addressed, lesson-scoped paths) WITHOUT writing anything: no
 * storage upload, no attestation, no RPC. This is the only helper a DRY_RUN may call, which is
 * what makes "preview" genuinely side-effect free.
 */
export async function resolveVerifiedAssets(batchId: string): Promise<{
  lessonId: string;
  declarations: Cf11AssetDeclaration[];
  files: Map<string, Uint8Array>;
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

  const bundleBytes = await storageDownload(
    INTAKE_BUCKET,
    version.verified_storage_path,
    "CF11_BUNDLE_DOWNLOAD_FAILED",
  );
  const verified = await verifyGoldenLessonBundle(bundleBytes);
  if (verified.bundleSha256 !== batch.verified_bundle_sha256) {
    throw new Error("CF11_VERIFIED_BUNDLE_IDENTITY_MISMATCH");
  }

  const declarations: Cf11AssetDeclaration[] = [];
  const files = new Map<string, Uint8Array>();
  for (const asset of verified.assets) {
    const file = verified.files.find((entry) => entry.path === asset.path);
    if (!file) throw new Error("CF11_ASSET_BYTES_MISSING");
    const objectName = `${asset.sha256}-${asset.path}`;
    const storagePath = `${lessonId}/${objectName}`;
    files.set(storagePath, file.bytes);
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
  return { lessonId, declarations, files, bundleSha256: verified.bundleSha256 };
}

/**
 * CF11-R7 — WRITE step, called only on an EXECUTE path. Stores any missing bytes in the private
 * asset bucket. Never overwrites: an existing object at the same path already has the same
 * SHA-256 by construction, because the path is content-addressed.
 */
export async function uploadVerifiedAssets(
  declarations: Cf11AssetDeclaration[],
  files: Map<string, Uint8Array>,
): Promise<Set<string>> {
  const uploadedPaths = new Set<string>();
  for (const declaration of declarations) {
    const bytes = files.get(declaration.storagePath);
    if (!bytes) throw new Error("CF11_ASSET_BYTES_MISSING");
    const [lessonId, ...rest] = declaration.storagePath.split("/");
    const objectName = rest.join("/");
    const existing = await storageList(ASSET_BUCKET, lessonId, objectName);
    if (existing.some((object) => object.name === objectName)) continue;
    await storageUpload(ASSET_BUCKET, declaration.storagePath, bytes, declaration.mimeType);
    uploadedPaths.add(declaration.storagePath);
  }
  return uploadedPaths;
}

/**
 * Convenience for the ONE explicit write path (`verifyGoldenLessonCf11Assets`): resolve, then
 * upload. CF11-R8 forbids reaching this from the publication handler in ANY mode.
 */
export async function ensureVerifiedAssets(batchId: string): Promise<{
  lessonId: string;
  declarations: Cf11AssetDeclaration[];
  uploadedPaths: Set<string>;
  bundleSha256: string;
}> {
  const { lessonId, declarations, files, bundleSha256 } = await resolveVerifiedAssets(batchId);
  const uploadedPaths = await uploadVerifiedAssets(declarations, files);
  return { lessonId, declarations, uploadedPaths, bundleSha256 };
}

/**
 * CF11-R8 — READ-ONLY publication precondition.
 *
 * Proves, without a single write, that the explicit "verify & upload assets" step already ran:
 * every declared object exists in the private bucket with the exact declared size, and every
 * declared asset already carries an immutable machine attestation (`SERVER_BYTE_READBACK`) whose
 * recorded bytes/mime/path match the declaration. Anything else fails with
 * CF11_ASSETS_NOT_VERIFIED — publication never repairs the gap by uploading or attesting.
 */
export async function assertAssetsVerified(
  lessonId: string,
  declarations: Cf11AssetDeclaration[],
): Promise<void> {
  const admin = serviceClient();
  const attestations = (ok(
    await admin
      .from("golden_lesson_asset_attestations")
      .select("asset_code,sha256,byte_size,mime_type,storage_bucket,storage_path,verification_origin")
      .eq("lesson_id", lessonId),
    "CF11_ASSET_ATTESTATIONS_READ_FAILED",
  ) ?? []) as {
    asset_code: string; sha256: string; byte_size: number; mime_type: string;
    storage_bucket: string; storage_path: string; verification_origin: string;
  }[];

  for (const declaration of declarations) {
    const att = attestations.find((row) => row.asset_code === declaration.assetCode);
    if (
      !att
      || att.verification_origin !== CF11_VERIFICATION_ORIGIN
      || att.sha256 !== declaration.sha256
      || Number(att.byte_size) !== declaration.bytes
      || att.mime_type !== declaration.mimeType
      || att.storage_bucket !== declaration.storageBucket
      || att.storage_path !== declaration.storagePath
    ) {
      throw new Error(`CF11_ASSETS_NOT_VERIFIED: ${declaration.assetCode}`);
    }
    const [prefix, ...rest] = declaration.storagePath.split("/");
    const objectName = rest.join("/");
    const listed = await storageList(ASSET_BUCKET, prefix, objectName);
    const object = listed.find((entry) => entry.name === objectName);
    if (!object || Number(object.metadata?.size) !== declaration.bytes) {
      throw new Error(`CF11_ASSETS_NOT_VERIFIED: ${declaration.assetCode}`);
    }
  }
  // Exact set: an extra attestation is drift, never a harmless leftover.
  if (attestations.length !== declarations.length) {
    throw new Error("CF11_ASSETS_NOT_VERIFIED: attestation set mismatch");
  }
}


/**
 * CF11-R5 — MACHINE attestation.
 *
 * Re-measures the bytes that are actually in the bucket — never the bytes we think we uploaded,
 * and never the object's own filename — and then appends one immutable attestation per declared
 * asset THROUGH THE SERVER'S OWN identity. The human operator is recorded as `requested_by`
 * (evidence of intent) and can no longer execute the attestation RPC at all: a human claim about
 * bytes is not evidence, a server readback is.
 */
export const CF11_VERIFICATION_ORIGIN = "SERVER_BYTE_READBACK" as const;

export async function attestStoredAssets(
  requestedBy: string,
  batchId: string,
  declarations: Cf11AssetDeclaration[],
  uploadedPaths: Set<string>,
  mode: "EXECUTE",
): Promise<Cf11AssetAttestation[]> {
  // CF11-R7: attestation is a WRITE. There is deliberately no DRY_RUN variant — a preview must
  // never append to the attestation ledger, so callers on a DRY_RUN path do not call this at all.
  if (mode !== "EXECUTE") throw new Error("CF11_ATTESTATION_IS_WRITE_ONLY");
  const admin = serviceClient();
  const out: Cf11AssetAttestation[] = [];
  for (const declaration of declarations) {
    const bytes = await storageDownload(
      ASSET_BUCKET,
      declaration.storagePath,
      `CF11_ASSET_READBACK_FAILED: ${declaration.assetCode}`,
    );
    const observedSha = createHash("sha256").update(bytes).digest("hex");
    if (observedSha !== declaration.sha256) throw new Error(`CF11_ASSET_BYTES_MISMATCH: ${declaration.assetCode}`);
    if (bytes.byteLength !== declaration.bytes) throw new Error(`CF11_ASSET_SIZE_MISMATCH: ${declaration.assetCode}`);
    const magicHex = Buffer.from(bytes.subarray(0, 16)).toString("hex");

    // Service-role client only: the attestation RPC refuses any session that carries auth.uid().
    const result = await rpc(admin)("golden_lesson_attest_cf11_asset", {
      _batch_id: batchId,
      _requested_by: requestedBy,
      _asset_code: declaration.assetCode,
      _observed_sha256: observedSha,
      _observed_bytes: bytes.byteLength,
      _observed_mime: declaration.mimeType,
      _magic_hex: magicHex,
      _verification_origin: CF11_VERIFICATION_ORIGIN,
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

