import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireContentStaffAuth,
  type ContentStaffAuthContext,
} from "@/integrations/supabase/auth-middleware";
import { verifyGoldenLessonBundle } from "./golden-lesson-bundle-verifier";
import {
  assertLegacyGoldenDomainStageCompatible,
  buildGoldenDomainStageEnvelope,
} from "./golden-lesson-domain-staging";

const Input = z.object({ packageId: z.string().uuid(), version: z.number().int().positive() });
const BUCKET = "golden-lesson-intake";

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("CONTENT_FACTORY_DOMAIN_STAGING_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const stageApprovedGoldenLessonDomainBundle = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, isFullAdmin } = context as ContentStaffAuthContext;
    if (!isFullAdmin) throw new Error("DOMAIN_STAGE_ADMIN_REQUIRED");
    const admin = serviceClient();
    const packageResult = await admin
      .from("golden_lesson_packages")
      .select("current_version,review_status")
      .eq("id", data.packageId)
      .single();
    if (packageResult.error || !packageResult.data)
      throw new Error(packageResult.error?.message ?? "PACKAGE_NOT_FOUND");
    if (
      packageResult.data.current_version !== data.version ||
      packageResult.data.review_status !== "APPROVED_FOR_STAGING"
    ) {
      throw new Error("PACKAGE_NOT_APPROVED_FOR_DOMAIN_STAGING");
    }
    const versionResult = await admin
      .from("golden_lesson_package_versions")
      .select("verified_storage_path,verified_bundle_sha256,bundle_verified_at")
      .eq("package_id", data.packageId)
      .eq("version", data.version)
      .single();
    if (
      versionResult.error ||
      !versionResult.data?.verified_storage_path ||
      !versionResult.data.verified_bundle_sha256 ||
      !versionResult.data.bundle_verified_at
    ) {
      throw new Error(versionResult.error?.message ?? "VERIFIED_BUNDLE_REQUIRED");
    }
    const downloaded = await admin.storage
      .from(BUCKET)
      .download(versionResult.data.verified_storage_path);
    if (downloaded.error || !downloaded.data)
      throw new Error(downloaded.error?.message ?? "BUNDLE_DOWNLOAD_FAILED");
    const verified = await verifyGoldenLessonBundle(
      new Uint8Array(await downloaded.data.arrayBuffer()),
    );
    if (verified.bundleSha256 !== versionResult.data.verified_bundle_sha256)
      throw new Error("VERIFIED_BUNDLE_IDENTITY_MISMATCH");
    const envelope = buildGoldenDomainStageEnvelope(verified);
    assertLegacyGoldenDomainStageCompatible(envelope);
    const staged = await admin.rpc(
      "golden_lesson_stage_domain_bundle" as never,
      {
        _package_id: data.packageId,
        _version: data.version,
        _actor_id: userId,
        _bundle_sha256: verified.bundleSha256,
        _entries: envelope.entries,
        _answers_companion: envelope.answersCompanion,
      } as never,
    );
    if (staged.error || !staged.data)
      throw new Error(staged.error?.message ?? "DOMAIN_STAGE_EMPTY_RESPONSE");
    const result = staged.data as unknown as Record<string, unknown>;
    return {
      batchId: String(result.batch_id),
      idempotent: Boolean(result.idempotent),
      writesPerformed: Number(result.writes_performed),
      domainWritesPerformed: 0 as const,
      publicationPerformed: false as const,
    };
  });
