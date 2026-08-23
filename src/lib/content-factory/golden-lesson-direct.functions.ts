import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireContentStaffAuth,
  type ContentStaffAuthContext,
} from "@/integrations/supabase/auth-middleware";
import type { GoldenLessonPackage } from "./golden-lesson-contract";
import {
  GOLDEN_DIRECT_LIMITS,
  planGoldenLessonDirectFiles,
  verifyGoldenLessonDirectIntake,
} from "./golden-lesson-direct-verifier";

import { GOLDEN_DIRECT_BUCKET as BUCKET, storageObjectName } from "./golden-lesson-direct-storage";

const IntakeId = z.string().uuid();
type DbResult<T> = { data: T | null; error: { message: string } | null };

function assertDb<T>(result: DbResult<T>): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("EMPTY_DATABASE_RESPONSE");
  return result.data;
}

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("CONTENT_FACTORY_ATTESTATION_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const createGoldenLessonDirectUpload = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => z.object({ manifest: z.unknown() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as ContentStaffAuthContext;
    const manifest = data.manifest as GoldenLessonPackage;
    const declarations = planGoldenLessonDirectFiles(manifest);
    const intakeId = randomUUID();
    const uploads = [];
    for (const [index, declaration] of declarations.entries()) {
      const storagePath = `${userId}/${intakeId}/${storageObjectName(declaration, index)}`;
      const signed = assertDb(await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath));
      if (!signed.token) throw new Error("SIGNED_UPLOAD_TOKEN_MISSING");
      uploads.push({
        logicalPath: declaration.path,
        sha256: declaration.sha256,
        storagePath,
        token: signed.token,
      });
    }
    return { bucket: BUCKET, intakeId, uploads };
  });

export const verifyAndStageGoldenLessonDirect = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => z.object({ intakeId: IntakeId, manifest: z.unknown() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as ContentStaffAuthContext;
    const manifest = data.manifest as GoldenLessonPackage;
    const declarations = planGoldenLessonDirectFiles(manifest);
    const files = [];
    let downloadedBytes = 0;
    for (const [index, declaration] of declarations.entries()) {
      const storagePath = `${userId}/${data.intakeId}/${storageObjectName(declaration, index)}`;
      const downloaded = await supabase.storage.from(BUCKET).download(storagePath);
      if (downloaded.error || !downloaded.data) {
        throw new Error(downloaded.error?.message ?? "DIRECT_FILE_DOWNLOAD_FAILED");
      }
      const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > GOLDEN_DIRECT_LIMITS.maxFileBytes) {
        throw new Error("DIRECT_FILE_SIZE_LIMIT");
      }
      downloadedBytes += bytes.byteLength;
      if (downloadedBytes > GOLDEN_DIRECT_LIMITS.maxTotalBytes) {
        throw new Error("DIRECT_TOTAL_SIZE_LIMIT");
      }
      files.push({
        path: declaration.path,
        sha256: declaration.sha256,
        bytes,
      });
    }
    const verified = verifyGoldenLessonDirectIntake(manifest, files);

    const staged = assertDb(await supabase.rpc("golden_lesson_stage_manifest" as never, {
      _manifest: verified.manifest,
      _client_manifest_sha256: verified.manifestSha256,
    } as never)) as unknown as Record<string, unknown>;
    const packageId = String(staged.package_id);
    const version = Number(staged.version);
    const attested = assertDb(await serviceClient().rpc("golden_lesson_attest_direct_intake" as never, {
      _package_id: packageId,
      _version: version,
      _actor_id: userId,
      _intake_id: data.intakeId,
      _intake_sha256: verified.intakeSha256,
      _manifest_sha256: verified.manifestSha256,
      _file_count: verified.fileCount,
      _total_bytes: verified.totalBytes,
    } as never)) as unknown as Record<string, unknown>;

    return {
      packageId,
      version,
      status: String(staged.status),
      idempotent: Boolean(staged.idempotent),
      verifiedIntakeSha256: String(attested.intake_sha256),
      verifiedFileCount: Number(attested.file_count),
      domainWritesPerformed: 0 as const,
    };
  });
