import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireContentStaffAuth,
  type ContentStaffAuthContext,
} from "@/integrations/supabase/auth-middleware";
import { verifyGoldenLessonBundle } from "./golden-lesson-bundle-verifier";

const BUCKET = "golden-lesson-intake";
const BundlePath = z
  .string()
  .max(160)
  .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.zip$/);
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

export const createGoldenLessonBundleUpload = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .handler(async ({ context }): Promise<{ bucket: typeof BUCKET; path: string; token: string }> => {
    const { supabase, userId } = context as ContentStaffAuthContext;
    const path = `${userId}/${randomUUID()}.zip`;
    const result = assertDb(await supabase.storage.from(BUCKET).createSignedUploadUrl(path));
    if (!result.token) throw new Error("SIGNED_UPLOAD_TOKEN_MISSING");
    return { bucket: BUCKET, path, token: result.token };
  });

export const verifyAndStageGoldenLessonBundle = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => z.object({ path: BundlePath }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as ContentStaffAuthContext;
    if (!data.path.startsWith(`${userId}/`)) throw new Error("BUNDLE_OWNER_MISMATCH");
    const downloaded = await supabase.storage.from(BUCKET).download(data.path);
    if (downloaded.error || !downloaded.data)
      throw new Error(downloaded.error?.message ?? "BUNDLE_DOWNLOAD_FAILED");
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    const verified = await verifyGoldenLessonBundle(bytes);

    const staged = assertDb(
      await supabase.rpc(
        "golden_lesson_stage_manifest" as never,
        {
          _manifest: verified.manifest,
          _client_manifest_sha256: verified.manifestSha256,
        } as never,
      ),
    ) as unknown as Record<string, unknown>;
    const packageId = String(staged.package_id);
    const version = Number(staged.version);
    const attested = assertDb(
      await serviceClient().rpc(
        "golden_lesson_attest_bundle" as never,
        {
          _package_id: packageId,
          _version: version,
          _actor_id: userId,
          _storage_path: data.path,
          _bundle_sha256: verified.bundleSha256,
          _file_count: verified.fileCount,
          _compressed_bytes: verified.compressedBytes,
          _uncompressed_bytes: verified.uncompressedBytes,
        } as never,
      ),
    ) as unknown as Record<string, unknown>;

    return {
      packageId,
      version,
      status: String(staged.status),
      idempotent: Boolean(staged.idempotent),
      verifiedBundleSha256: String(attested.bundle_sha256),
      verifiedFileCount: Number(attested.file_count),
      domainWritesPerformed: 0 as const,
    };
  });
