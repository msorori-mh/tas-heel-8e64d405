import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireContentStaffAuth,
  type ContentStaffAuthContext,
} from "@/integrations/supabase/auth-middleware";
import type { GoldenLessonIdentity, GoldenLessonPackage } from "./golden-lesson-contract";
import {
  canRebindGoldenLessonDraft,
  describeGoldenIdentityConflictAr,
  diffGoldenLessonIdentity,
  type GoldenIdentityDifference,
} from "./golden-lesson-identity-preflight";
import {
  computeGoldenLessonManifestSha256,
  GOLDEN_DIRECT_LIMITS,
  planGoldenLessonDirectFiles,
  verifyGoldenLessonDirectIntake,
} from "./golden-lesson-direct-verifier";
import { GOLDEN_DIRECT_BUCKET as BUCKET, storageObjectName } from "./golden-lesson-direct-storage";

const IntakeId = z.string().uuid();
type DbResult<T> = { data: T | null; error: { message: string } | null };

export type DirectIntakePreflightStatus =
  | "NEW_PACKAGE"
  | "UPLOAD_REQUIRED"
  | "NEW_VERSION"
  | "RESUMABLE"
  | "DRAFT_REBINDABLE"
  | "IDENTITY_CONFLICT";

export interface DirectIntakePreflightResult {
  status: DirectIntakePreflightStatus;
  packageId: string | null;
  version: number | null;
  reviewStatus: string | null;
  manifestSha256: string;
  differences: GoldenIdentityDifference[];
  canRebind: boolean;
  messageAr: string;
  verifiedIntakeSha256: string | null;
  verifiedFileCount: number | null;
}

interface ExistingPackageRow {
  id: string;
  package_code: string;
  profile_id: string;
  identity: GoldenLessonIdentity;
  current_version: number;
  current_manifest_sha256: string;
  review_status: string;
}

interface CurrentVersionRow {
  verified_intake_sha256: string | null;
  verified_manifest_sha256: string | null;
  verified_direct_file_count: number | null;
  direct_intake_verified_at: string | null;
}

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

function rawIdentityMatches(current: GoldenLessonIdentity, incoming: GoldenLessonIdentity) {
  return current.gradeCode === incoming.gradeCode &&
    current.subjectCode === incoming.subjectCode &&
    current.lessonCode === incoming.lessonCode &&
    current.lessonSlug === incoming.lessonSlug &&
    current.unitCode === incoming.unitCode &&
    current.semester === incoming.semester &&
    current.sortOrder === incoming.sortOrder &&
    JSON.stringify(current.curriculumTrackCodes) === JSON.stringify(incoming.curriculumTrackCodes);
}

async function readDirectIntakePreflight(
  context: ContentStaffAuthContext,
  manifest: GoldenLessonPackage,
): Promise<DirectIntakePreflightResult> {
  const manifestSha256 = computeGoldenLessonManifestSha256(manifest);
  const client = context.supabase as any;
  const packageQuery = await client
    .from("golden_lesson_packages")
    .select("id,package_code,profile_id,identity,current_version,current_manifest_sha256,review_status")
    .eq("package_code", manifest.packageCode)
    .maybeSingle();
  if (packageQuery.error) throw new Error(packageQuery.error.message);
  const current = packageQuery.data as ExistingPackageRow | null;

  if (!current) {
    return {
      status: "NEW_PACKAGE",
      packageId: null,
      version: null,
      reviewStatus: null,
      manifestSha256,
      differences: [],
      canRebind: false,
      messageAr: "حزمة جديدة؛ يمكن بدء رفع الملفات ثم نشرها.",
      verifiedIntakeSha256: null,
      verifiedFileCount: null,
    };
  }

  const [versionQuery, reviewQuery, domainBatchQuery] = await Promise.all([
    client
      .from("golden_lesson_package_versions")
      .select("verified_intake_sha256,verified_manifest_sha256,verified_direct_file_count,direct_intake_verified_at")
      .eq("package_id", current.id)
      .eq("version", current.current_version)
      .maybeSingle(),
    client
      .from("golden_lesson_package_reviews")
      .select("id", { count: "exact", head: true })
      .eq("package_id", current.id),
    client
      .from("golden_lesson_domain_stage_batches")
      .select("id", { count: "exact", head: true })
      .eq("package_id", current.id),
  ]);
  if (versionQuery.error) throw new Error(versionQuery.error.message);
  if (reviewQuery.error) throw new Error(reviewQuery.error.message);
  if (domainBatchQuery.error) throw new Error(domainBatchQuery.error.message);

  const currentVersion = versionQuery.data as CurrentVersionRow | null;
  const differences = diffGoldenLessonIdentity(current.identity, manifest.identity);
  const profileMatches = current.profile_id === manifest.profileId;
  const identityMatchesExactly = rawIdentityMatches(current.identity, manifest.identity);
  const reviewCount = Number(reviewQuery.count ?? 0);
  const domainBatchCount = Number(domainBatchQuery.count ?? 0);

  if (profileMatches && identityMatchesExactly) {
    const alreadyVerified = current.current_manifest_sha256 === manifestSha256 &&
      currentVersion?.verified_manifest_sha256 === manifestSha256 &&
      Boolean(currentVersion.direct_intake_verified_at) &&
      Boolean(currentVersion.verified_intake_sha256);
    if (alreadyVerified) {
      return {
        status: "RESUMABLE",
        packageId: current.id,
        version: current.current_version,
        reviewStatus: current.review_status,
        manifestSha256,
        differences,
        canRebind: false,
        messageAr: "هذه النسخة مرفوعة ومتحقق منها مسبقًا؛ سيُستأنف النشر دون إعادة رفع الملفات.",
        verifiedIntakeSha256: currentVersion?.verified_intake_sha256 ?? null,
        verifiedFileCount: currentVersion?.verified_direct_file_count ?? null,
      };
    }

    const status: DirectIntakePreflightStatus = current.current_manifest_sha256 === manifestSha256
      ? "UPLOAD_REQUIRED"
      : "NEW_VERSION";
    return {
      status,
      packageId: current.id,
      version: current.current_version,
      reviewStatus: current.review_status,
      manifestSha256,
      differences,
      canRebind: false,
      messageAr: status === "UPLOAD_REQUIRED"
        ? "الحزمة موجودة، لكن رفع الملفات لم يكتمل؛ سيُعاد الرفع بأمان."
        : "هوية الحزمة مطابقة؛ ستُنشأ نسخة جديدة بعد التحقق من الملفات.",
      verifiedIntakeSha256: currentVersion?.verified_intake_sha256 ?? null,
      verifiedFileCount: currentVersion?.verified_direct_file_count ?? null,
    };
  }

  const rebindable = context.isFullAdmin && canRebindGoldenLessonDraft({
    current: current.identity,
    incoming: manifest.identity,
    profileMatches,
    reviewStatus: current.review_status,
    reviewCount,
    domainBatchCount,
  });
  if (rebindable) {
    return {
      status: "DRAFT_REBINDABLE",
      packageId: current.id,
      version: current.current_version,
      reviewStatus: current.review_status,
      manifestSha256,
      differences,
      canRebind: true,
      messageAr: `المسودة القديمة لم تُراجع ولم تُجهّز للنشر؛ يمكن تصحيح ربطها مع حفظ سجل تدقيق. ${describeGoldenIdentityConflictAr(differences)}`,
      verifiedIntakeSha256: currentVersion?.verified_intake_sha256 ?? null,
      verifiedFileCount: currentVersion?.verified_direct_file_count ?? null,
    };
  }

  const reason = !profileMatches
    ? "نوع ملف الدرس الحالي لا يطابق الحزمة المحفوظة."
    : describeGoldenIdentityConflictAr(differences) || "هوية الحزمة المحفوظة لا تطابق الدرس المختار.";
  return {
    status: "IDENTITY_CONFLICT",
    packageId: current.id,
    version: current.current_version,
    reviewStatus: current.review_status,
    manifestSha256,
    differences,
    canRebind: false,
    messageAr: `تعذر النشر لأن كود الحزمة مستخدم بهوية مختلفة. ${reason}`,
    verifiedIntakeSha256: currentVersion?.verified_intake_sha256 ?? null,
    verifiedFileCount: currentVersion?.verified_direct_file_count ?? null,
  };
}

function directStoragePaths(userId: string, intakeId: string, manifest: GoldenLessonPackage) {
  return planGoldenLessonDirectFiles(manifest).map((declaration, index) =>
    `${userId}/${intakeId}/${storageObjectName(declaration, index)}`
  );
}

async function discardDirectUpload(userId: string, intakeId: string, manifest: GoldenLessonPackage) {
  const paths = directStoragePaths(userId, intakeId, manifest);
  const removed = await serviceClient().storage.from(BUCKET).remove(paths);
  if (removed.error) throw new Error(removed.error.message);
  return paths.length;
}

export const preflightGoldenLessonDirect = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => z.object({ manifest: z.unknown() }).parse(input))
  .handler(async ({ data, context }) =>
    readDirectIntakePreflight(context as ContentStaffAuthContext, data.manifest as GoldenLessonPackage)
  );

export const discardGoldenLessonDirectUpload = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => z.object({ intakeId: IntakeId, manifest: z.unknown() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as ContentStaffAuthContext;
    return { removedFileCount: await discardDirectUpload(userId, data.intakeId, data.manifest as GoldenLessonPackage) };
  });

export const createGoldenLessonDirectUpload = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => z.object({ manifest: z.unknown() }).parse(input))
  .handler(async ({ data, context }) => {
    const authContext = context as ContentStaffAuthContext;
    const { supabase, userId } = authContext;
    const manifest = data.manifest as GoldenLessonPackage;
    const preflight = await readDirectIntakePreflight(authContext, manifest);
    if (preflight.status === "IDENTITY_CONFLICT") throw new Error(preflight.messageAr);
    if (preflight.status === "RESUMABLE") throw new Error("DIRECT_INTAKE_ALREADY_VERIFIED");

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
    return { bucket: BUCKET, intakeId, uploads, preflight };
  });

export const verifyAndStageGoldenLessonDirect = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => z.object({ intakeId: IntakeId, manifest: z.unknown() }).parse(input))
  .handler(async ({ data, context }) => {
    const authContext = context as ContentStaffAuthContext;
    const { supabase, userId } = authContext;
    const manifest = data.manifest as GoldenLessonPackage;
    let databaseWritesStarted = false;

    try {
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
        files.push({ path: declaration.path, sha256: declaration.sha256, bytes });
      }
      const verified = verifyGoldenLessonDirectIntake(manifest, files);
      const preflight = await readDirectIntakePreflight(authContext, manifest);
      if (preflight.status === "IDENTITY_CONFLICT") throw new Error(preflight.messageAr);

      if (preflight.status === "RESUMABLE" && preflight.packageId && preflight.version) {
        await discardDirectUpload(userId, data.intakeId, manifest);
        return {
          packageId: preflight.packageId,
          version: preflight.version,
          status: preflight.reviewStatus ?? "DRAFT",
          idempotent: true,
          verifiedIntakeSha256: preflight.verifiedIntakeSha256 ?? "",
          verifiedFileCount: preflight.verifiedFileCount ?? verified.fileCount,
          domainWritesPerformed: 0 as const,
        };
      }

      const stageRpc = preflight.status === "DRAFT_REBINDABLE"
        ? supabase.rpc("golden_lesson_rebind_draft_identity" as never, {
            _manifest: verified.manifest,
            _client_manifest_sha256: verified.manifestSha256,
            _expected_current_version: preflight.version,
            _reason: "تصحيح ربط مسودة غير مراجعة من فحص الاستيراد المباشر",
          } as never)
        : supabase.rpc("golden_lesson_stage_manifest" as never, {
            _manifest: verified.manifest,
            _client_manifest_sha256: verified.manifestSha256,
          } as never);
      const staged = assertDb(await stageRpc) as unknown as Record<string, unknown>;
      databaseWritesStarted = true;
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
    } catch (error) {
      if (!databaseWritesStarted) {
        try {
          await discardDirectUpload(userId, data.intakeId, manifest);
        } catch {
          // Preserve the primary failure. Cleanup is best-effort and scoped to this intake UUID.
        }
      }
      throw error;
    }
  });
