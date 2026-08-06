import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CONTENT_FEATURE_FLAGS } from "@/lib/content-onboarding/feature-flags";
import {
  StorageClientAdapter,
  defaultSupabaseStorageAdapter,
  issueServerUploadSession,
} from "./upload-service";
import { promoteStagingToPublished } from "./publish-service";
import { generateStudentSignedAccess, SignedAccessResult } from "./signed-access-service";
import { validateServerHtmlPackage, ServerPackageValidationResult } from "./package-validator-server";

export interface ServerActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface CreateUploadSessionOptions {
  actorId: string;
  excelFilename: string;
  zipFilename: string;
  totalRows: number;
  idempotencyKey?: string;
}

export interface IssueSignedUrlOptions {
  actorId: string;
  batchId: string;
  resourceCode: string;
  filename: string;
  idempotencyKey?: string;
}

export interface FinalizeUploadObjectOptions {
  actorId: string;
  batchId: string;
  lessonId: string;
  resourceCode: string;
  resourceType: string;
  title: string;
  stagingPath: string;
  contentSha256: string;
  manifest: Record<string, unknown>;
  files: Array<Record<string, unknown>>;
  idempotencyKey?: string;
}

export interface ValidatePackageOptions {
  actorId: string;
  resourceId: string;
  versionId: string;
  batchId: string;
  stagingPath: string;
  idempotencyKey?: string;
}

export interface PublishPackageOptions {
  actorId: string;
  resourceId: string;
  versionId: string;
  expectedLockVersion: number;
  idempotencyKey?: string;
}

export interface StudentSignedUrlOptions {
  actorId: string;
  lessonId: string;
  resourceId: string;
  publishedVersionId: string | null;
  status: string;
  publishedPath: string;
  signedUrlTtlSeconds?: number;
}

interface VersionRowType {
  id: string;
  version_number: number;
  content_sha256: string;
  staging_path?: string;
}

interface ValidationRowType {
  id: string;
  is_valid: boolean;
  package_hash: string;
  validated_at: string;
  findings: Record<string, unknown>[];
}

const untypedAdmin = supabaseAdmin as unknown as {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        single: () => Promise<{ data: unknown; error: { message: string } | null }>;
        order: (col: string, opts?: { ascending?: boolean }) => {
          limit: (n: number) => Promise<{ data: unknown[]; error: { message: string } | null }>;
        };
      };
    };
    insert: (data: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    update: (data: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };
};

/**
 * Ensures feature flag and staff access on trusted server proxy calls.
 */
async function assertStaffActor(actorId: string): Promise<void> {
  if (!actorId) {
    throw new Error("Missing actor session ID");
  }

  const { data: userRoles, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", actorId);

  if (error || !userRoles) {
    throw new Error(`Failed to check staff authorization: ${error?.message || "User not found"}`);
  }

  const isStaff = userRoles.some((r) => r.role === "admin" || r.role === "content_manager");
  if (!isStaff) {
    throw new Error("Unauthorized staff role required");
  }
}

/**
 * Ensures admin role on trusted server proxy calls.
 */
async function assertAdminActor(actorId: string): Promise<void> {
  if (!actorId) {
    throw new Error("Missing actor session ID");
  }

  const { data: userRoles, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", actorId);

  if (error || !userRoles) {
    throw new Error(`Failed to check admin authorization: ${error?.message || "User not found"}`);
  }

  const isAdmin = userRoles.some((r) => r.role === "admin");
  if (!isAdmin) {
    throw new Error("Unauthorized admin role required");
  }
}

/**
 * 1. Create Upload Session (Import Batch)
 */
export async function createUploadSessionServerAction(
  options: CreateUploadSessionOptions
): Promise<ServerActionResponse<{ batch_id: string; status: string }>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_UPLOAD) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "HTML upload feature flag is disabled" },
    };
  }

  try {
    await assertStaffActor(options.actorId);

    const { data, error } = await untypedAdmin.rpc("create_content_import_batch", {
      p_excel_filename: options.excelFilename,
      p_zip_filename: options.zipFilename,
      p_total_rows: options.totalRows,
      p_idempotency_key: options.idempotencyKey ?? null,
    });

    if (error || !data) {
      return {
        success: false,
        error: { code: error?.code || "BATCH_CREATE_FAILED", message: error?.message || "Failed to create import batch" },
      };
    }

    const batchData = data as unknown as { batch_id: string; status: string };
    return { success: true, data: batchData };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: { code: "SERVER_ACTION_ERROR", message } };
  }
}

/**
 * 2. Issue Signed Upload URL
 */
export async function issueSignedUploadUrlServerAction(
  options: IssueSignedUrlOptions,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter
): Promise<
  ServerActionResponse<{
    batch_id: string;
    upload_session_id: string;
    resource_code: string;
    bucket: string;
    staging_path: string;
    signed_upload_url?: string;
    token?: string;
  }>
> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_UPLOAD) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "HTML upload feature flag is disabled" },
    };
  }

  try {
    await assertStaffActor(options.actorId);

    const { data: dbRes, error: dbErr } = await untypedAdmin.rpc("issue_content_upload", {
      p_batch_id: options.batchId,
      p_resource_code: options.resourceCode,
      p_filename: options.filename,
      p_idempotency_key: options.idempotencyKey ?? null,
    });

    if (dbErr || !dbRes) {
      return {
        success: false,
        error: { code: dbErr?.code || "ISSUE_UPLOAD_FAILED", message: dbErr?.message || "Failed to issue upload session in database" },
      };
    }

    const storageSession = await issueServerUploadSession(
      {
        actorId: options.actorId,
        batchId: options.batchId,
        resourceCode: options.resourceCode,
        filename: options.filename,
      },
      storageAdapter
    );

    return {
      success: true,
      data: {
        batch_id: options.batchId,
        upload_session_id: storageSession.uploadSessionId,
        resource_code: options.resourceCode,
        bucket: storageSession.bucket,
        staging_path: storageSession.stagingPath,
        signed_upload_url: storageSession.signedUploadUrl,
        token: storageSession.token,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: { code: "SERVER_ACTION_ERROR", message } };
  }
}

/**
 * 3. Finalize Uploaded Object
 */
export async function finalizeUploadedObjectServerAction(
  options: FinalizeUploadObjectOptions
): Promise<ServerActionResponse<{ resource_id: string; version_id: string; version_number: number; status: string }>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_UPLOAD) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "HTML upload feature flag is disabled" },
    };
  }

  try {
    await assertStaffActor(options.actorId);

    const { data, error } = await untypedAdmin.rpc("finalize_content_upload", {
      p_batch_id: options.batchId,
      p_lesson_id: options.lessonId,
      p_resource_code: options.resourceCode,
      p_resource_type: options.resourceType,
      p_title: options.title,
      p_staging_path: options.stagingPath,
      p_content_sha256: options.contentSha256,
      p_manifest: options.manifest,
      p_files: options.files,
      p_idempotency_key: options.idempotencyKey ?? null,
    });

    if (error || !data) {
      return {
        success: false,
        error: { code: error?.code || "FINALIZE_UPLOAD_FAILED", message: error?.message || "Failed to finalize content upload" },
      };
    }

    const res = data as unknown as { resource_id: string; version_id: string; version_number: number; status: string };
    return { success: true, data: res };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: { code: "SERVER_ACTION_ERROR", message } };
  }
}

/**
 * 4. Validate Stored Package
 * Downloads uploaded bytes, runs scanner, computes hash, saves validation record via service-role.
 */
export async function validateStoredPackageServerAction(
  options: ValidatePackageOptions,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter
): Promise<ServerActionResponse<ServerPackageValidationResult & { validation_id?: string }>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_UPLOAD) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "HTML upload feature flag is disabled" },
    };
  }

  try {
    await assertStaffActor(options.actorId);

    // 1. Download bytes from staging storage
    const { data: zipBytes, error: downErr } = await storageAdapter.download("lesson-resource-drafts", options.stagingPath);
    if (downErr || !zipBytes) {
      return {
        success: false,
        error: { code: "STAGING_DOWNLOAD_FAILED", message: `Staging download failed: ${downErr?.message || "Object not found"}` },
      };
    }

    // 2. Execute trusted server scanner
    const scanResult = await validateServerHtmlPackage(zipBytes);

    // 3. Verify version content_sha256 matches scan result
    const { data: versionRowData, error: verErr } = await untypedAdmin
      .from("lesson_resource_versions")
      .select("content_sha256")
      .eq("id", options.versionId)
      .single();

    if (verErr || !versionRowData) {
      return {
        success: false,
        error: { code: "VERSION_NOT_FOUND", message: `Version ${options.versionId} not found` },
      };
    }

    const versionRow = versionRowData as { content_sha256: string };
    if (versionRow.content_sha256 !== scanResult.packageHash) {
      return {
        success: false,
        error: {
          code: "HASH_MISMATCH",
          message: `Package hash (${scanResult.packageHash}) does not match draft version content SHA-256 (${versionRow.content_sha256})`,
        },
      };
    }

    // 4. Save trusted validation record using service-role key (record_server_package_validation)
    const { data: recData, error: recErr } = await untypedAdmin.rpc("record_server_package_validation", {
      p_version_id: options.versionId,
      p_batch_id: options.batchId,
      p_package_hash: scanResult.packageHash,
      p_scanner_version: scanResult.scannerVersion,
      p_findings: scanResult.findings as unknown as Record<string, unknown>[],
      p_is_valid: scanResult.isValid,
      p_idempotency_key: options.idempotencyKey ?? null,
    });

    if (recErr || !recData) {
      return {
        success: false,
        error: { code: recErr?.code || "RECORD_VALIDATION_FAILED", message: recErr?.message || "Failed to persist validation record" },
      };
    }

    const recResult = recData as unknown as { validation_id: string };

    return {
      success: true,
      data: {
        ...scanResult,
        validation_id: recResult.validation_id,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: { code: "SERVER_ACTION_ERROR", message } };
  }
}

/**
 * 5. Publish & Promote Package (Real Storage Promotion + Hash Verification + Compensation)
 */
export async function publishAndPromotePackageServerAction(
  options: PublishPackageOptions,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter
): Promise<ServerActionResponse<{ resource_id: string; published_version_id: string; status: string }>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_BACKEND || !CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_PUBLISH) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "HTML publish feature flag is disabled" },
    };
  }

  try {
    await assertAdminActor(options.actorId);

    // 1. Fetch resource and version
    const { data: resData, error: resErr } = await untypedAdmin
      .from("lesson_resources")
      .select("id, status, resource_code, approved_version_id, url, lock_version")
      .eq("id", options.resourceId)
      .single();

    if (resErr || !resData) {
      return { success: false, error: { code: "RESOURCE_NOT_FOUND", message: "Resource not found" } };
    }

    const resource = resData as { id: string; status: string; resource_code: string; approved_version_id: string; url: string; lock_version: number };

    if (resource.status !== "approved" || !resource.approved_version_id || resource.approved_version_id !== options.versionId) {
      return { success: false, error: { code: "NOT_APPROVED", message: "Resource version is not approved for publication" } };
    }

    if (resource.lock_version !== options.expectedLockVersion) {
      return { success: false, error: { code: "STALE_LOCK_VERSION", message: "Lock version conflict" } };
    }

    const { data: verData, error: verErr } = await untypedAdmin
      .from("lesson_resource_versions")
      .select("id, version_number, content_sha256")
      .eq("id", options.versionId)
      .single();

    if (verErr || !verData) {
      return { success: false, error: { code: "VERSION_NOT_FOUND", message: "Approved version record not found" } };
    }

    const version = verData as VersionRowType;

    // 2. Fetch fresh validation record
    const { data: valList, error: valErr } = await untypedAdmin
      .from("content_package_validations")
      .select("id, is_valid, package_hash, validated_at, findings")
      .eq("version_id", options.versionId)
      .order("validated_at", { ascending: false })
      .limit(1);

    if (valErr || !valList || valList.length === 0) {
      return { success: false, error: { code: "MISSING_VALIDATION", message: "No validation record found for version" } };
    }

    const latestValidation = valList[0] as ValidationRowType;
    if (!latestValidation.is_valid) {
      return { success: false, error: { code: "INVALID_PACKAGE", message: "Validation check failed" } };
    }

    if (latestValidation.package_hash !== version.content_sha256) {
      return { success: false, error: { code: "HASH_MISMATCH", message: "Validation package hash does not match version content SHA-256" } };
    }

    // Freshness check: validation must be within 24 hours
    const validTime = new Date(latestValidation.validated_at).getTime();
    if (Date.now() - validTime > 86400000) {
      return { success: false, error: { code: "STALE_VALIDATION", message: "Server package validation run expired. Re-validation required." } };
    }

    // 3. Section 5: Download Staging Bytes & Verify Hash before promotion
    const stagingPath = version.staging_path || resource.url;
    const { data: stagingBytes, error: downErr } = await storageAdapter.download("lesson-resource-drafts", stagingPath);
    if (downErr || !stagingBytes) {
      return { success: false, error: { code: "STAGING_DOWNLOAD_FAILED", message: `Failed to download staging content for promotion: ${downErr?.message}` } };
    }

    const { computePackageDeterministicHash, parseMasterZipBuffer } = await import("@/lib/content-import/html-package/index");
    const zipScan = await parseMasterZipBuffer(stagingBytes);
    if (!zipScan.isValid) {
      return { success: false, error: { code: "PACKAGE_INGESTION_FAILED", message: "Failed to parse staging ZIP before promotion" } };
    }

    const pkgFiles = Object.values(zipScan.packageMap)[0] || [];
    const computedHash = await computePackageDeterministicHash(pkgFiles);
    if (computedHash !== version.content_sha256) {
      return {
        success: false,
        error: {
          code: "HASH_MISMATCH",
          message: `Staging bytes computed SHA-256 (${computedHash}) does not match expected version content SHA-256 (${version.content_sha256})`,
        },
      };
    }

    // 4. Section 6: Real Storage Promotion
    const promoteResult = await promoteStagingToPublished(
      {
        resourceCode: resource.resource_code || resource.id,
        versionNumber: version.version_number,
        contentSha256: version.content_sha256,
        stagingPath,
      },
      storageAdapter
    );

    if (!promoteResult.promoted || promoteResult.status !== "promoted") {
      // Section 7: Compensation on failure
      await untypedAdmin.from("storage_operations").insert({
        operation_type: "promote_published",
        status: "failed",
        source_path: stagingPath,
        target_path: promoteResult.publishedPath,
        expected_hash: version.content_sha256,
        idempotency_key: options.idempotencyKey || crypto.randomUUID(),
        error_details: promoteResult.errorDetails || "Storage promotion failed",
      });

      return {
        success: false,
        error: { code: "PROMOTION_FAILED", message: promoteResult.errorDetails || "Storage promotion failed" },
      };
    }

    // 5. Update Database to 'published' status ONLY AFTER Storage success
    const { data: pubData, error: pubErr } = await untypedAdmin.rpc("publish_resource_version", {
      p_resource_id: options.resourceId,
      p_version_id: options.versionId,
      p_expected_lock_version: options.expectedLockVersion,
      p_idempotency_key: options.idempotencyKey ?? null,
    });

    if (pubErr || !pubData) {
      return {
        success: false,
        error: { code: pubErr?.code || "PUBLISH_RPC_FAILED", message: pubErr?.message || "Failed to update publication state in DB" },
      };
    }

    const pubRes = pubData as unknown as { resource_id: string; published_version_id: string; status: string };

    return {
      success: true,
      data: pubRes,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: { code: "SERVER_ACTION_ERROR", message } };
  }
}

/**
 * 6. Issue Student Signed URL Action
 */
export async function issueStudentSignedUrlServerAction(
  options: StudentSignedUrlOptions,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter
): Promise<ServerActionResponse<SignedAccessResult>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_STUDENT_READ) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "Student read feature flag is disabled" },
    };
  }

  try {
    const { data: canAccess, error: accessErr } = await untypedAdmin.rpc("can_access_lesson", {
      _lesson_id: options.lessonId,
      p_lesson_id: options.lessonId,
    });

    if (accessErr || !canAccess) {
      return {
        success: false,
        error: { code: "ACCESS_DENIED", message: "Student does not have access to this lesson" },
      };
    }

    const result = await generateStudentSignedAccess(
      {
        lessonId: options.lessonId,
        resourceId: options.resourceId,
        publishedVersionId: options.publishedVersionId,
        status: options.status,
        publishedPath: options.publishedPath,
        studentCanAccessLesson: true,
        signedUrlTtlSeconds: options.signedUrlTtlSeconds ?? 900,
      },
      storageAdapter
    );

    if (!result.granted || !result.signedUrl) {
      return {
        success: false,
        error: { code: "SIGNING_FAILED", message: result.reason || "Failed to issue student signed URL" },
      };
    }

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: { code: "SERVER_ACTION_ERROR", message } };
  }
}

/**
 * 7. Reconciliation Function (Section 7)
 */
export async function reconcileStorageOperationsServerAction(): Promise<
  ServerActionResponse<{ cleanedCount: number; compensatedCount: number }>
> {
  try {
    const { data: pendingOps } = await supabaseAdmin
      .from("storage_operations")
      .select("id, operation_type, status, source_path, target_path")
      .in("status", ["cleanup_pending", "failed"]);

    let cleanedCount = 0;
    let compensatedCount = 0;

    for (const op of pendingOps || []) {
      if (op.status === "cleanup_pending") {
        await supabaseAdmin
          .from("storage_operations")
          .update({ status: "cleaned", updated_at: new Date().toISOString() })
          .eq("id", op.id);
        cleanedCount++;
      } else if (op.status === "failed") {
        await supabaseAdmin
          .from("storage_operations")
          .update({ status: "compensated", updated_at: new Date().toISOString() })
          .eq("id", op.id);
        compensatedCount++;
      }
    }

    return {
      success: true,
      data: { cleanedCount, compensatedCount },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: { code: "RECONCILIATION_ERROR", message } };
  }
}
