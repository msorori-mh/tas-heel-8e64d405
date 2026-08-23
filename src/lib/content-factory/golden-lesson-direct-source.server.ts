/**
 * Server-only reader that reconstructs a verified direct intake (no ZIP) from the
 * per-file objects stored in the direct intake bucket. Read-only: it downloads,
 * re-hashes and re-verifies the bytes, and never writes.
 */

import { createClient } from "@supabase/supabase-js";

import type { GoldenLessonPackage } from "./golden-lesson-contract";
import {
  directIntakeStoragePath,
  GOLDEN_DIRECT_BUCKET,
} from "./golden-lesson-direct-storage";
import {
  GOLDEN_DIRECT_LIMITS,
  planGoldenLessonDirectFiles,
  verifyGoldenLessonDirectIntake,
  type VerifiedGoldenLessonDirectIntake,
} from "./golden-lesson-direct-verifier";

function serviceClient() {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error("CONTENT_FACTORY_DIRECT_SOURCE_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function loadVerifiedDirectIntake(
  packageId: string,
  version: number,
): Promise<VerifiedGoldenLessonDirectIntake> {
  const admin = serviceClient();
  const result = await admin
    .from("golden_lesson_package_versions")
    .select("manifest,created_by,verified_intake_id,verified_intake_sha256")
    .eq("package_id", packageId)
    .eq("version", version)
    .single();
  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "PACKAGE_VERSION_NOT_FOUND");
  }
  const row = result.data as unknown as Record<string, unknown>;
  const intakeId = row['verified_intake_id'] as string | null;
  const ownerId = row['created_by'] as string | null;
  if (!intakeId || !ownerId) throw new Error("DIRECT_INTAKE_NOT_ATTESTED");
  const manifest = row['manifest'] as GoldenLessonPackage;
  const declarations = planGoldenLessonDirectFiles(manifest);

  const files = [];
  let total = 0;
  for (const [index, declaration] of declarations.entries()) {
    const path = directIntakeStoragePath(ownerId, intakeId, declaration, index);
    const downloaded = await admin.storage.from(GOLDEN_DIRECT_BUCKET).download(path);
    if (downloaded.error || !downloaded.data) {
      throw new Error(downloaded.error?.message ?? "DIRECT_FILE_DOWNLOAD_FAILED");
    }
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    total += bytes.byteLength;
    if (total > GOLDEN_DIRECT_LIMITS.maxTotalBytes) throw new Error("DIRECT_TOTAL_SIZE_LIMIT");
    files.push({ path: declaration.path, sha256: declaration.sha256, bytes });
  }
  const verified = verifyGoldenLessonDirectIntake(manifest, files);
  const expected = row['verified_intake_sha256'] as string | null;
  const attestedManifestSha = row['verified_manifest_sha256'] as string | null;
  if (expected) {
    // Anchor on the attested manifest digest: the manifest read back from jsonb may
    // serialize with a different key order, so only the file set can be re-derived.
    const recomputed = computeGoldenLessonIntakeSha256(
      attestedManifestSha ?? verified.manifestSha256,
      verified.files,
    );
    if (recomputed !== expected && verified.intakeSha256 !== expected) {
      throw new Error("DIRECT_INTAKE_IDENTITY_MISMATCH");
    }
  }
  return verified;
}

