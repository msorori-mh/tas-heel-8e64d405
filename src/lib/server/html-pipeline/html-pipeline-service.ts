import { createHash } from "node:crypto";
import {
  defaultSupabaseStorageAdapter,
  type StorageClientAdapter,
} from "./storage-adapter";
import type { DatabaseClientAdapter } from "./db-adapter";
import { downloadAndValidateStoredZipWorkflow } from "./package-validator";
import type {
  HtmlSignedUploadUrlResponse,
  ServerPackageValidationResult,
  PromotePackageRequest,
  PublishedStorageResult,
  StudentSignedAccessRequest,
  StudentSignedAccessResult,
  CompensationRequest,
  CompensationResult,
} from "./types";

const DRAFTS_BUCKET = "lesson-resource-drafts";
const PUBLISHED_BUCKET = "lesson-resource-published";

function computeBytesSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * 1. Create Signed Upload URL based on DB upload session
 */
export async function createSignedUploadUrl(
  uploadSessionId: string,
  dbAdapter: DatabaseClientAdapter,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter
): Promise<HtmlSignedUploadUrlResponse> {
  if (!uploadSessionId) {
    throw new Error("معرف جلسة الرفع (uploadSessionId) مطلوب");
  }

  // 1a. Resolve upload session authoritatively from DB
  const session = await dbAdapter.resolveUploadSession(uploadSessionId);
  const stagingPath = session.staging_path;

  if (!stagingPath) {
    throw new Error("مسار Staging غير صالح في جلسة الرفع");
  }

  // 1b. Create real signed upload URL for the DB-authoritative staging path
  const { signedUrl, token } = await storageAdapter.createSignedUploadUrl(
    DRAFTS_BUCKET,
    stagingPath
  );

  if (!signedUrl) {
    throw new Error("فشل إنشاء رابط التوقيع الخادمي للرفع");
  }

  return {
    uploadSessionId: session.session_id,
    stagingPath,
    bucket: DRAFTS_BUCKET,
    expiresInSeconds: 3600,
    signedUploadUrl: signedUrl,
    token,
  };
}

/**
 * 2. Download & Validate Stored ZIP based on DB session
 */
export async function downloadAndValidateStoredZip(
  uploadSessionId: string,
  resourceVersionId: string | undefined,
  dbAdapter: DatabaseClientAdapter,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter
): Promise<ServerPackageValidationResult> {
  if (!uploadSessionId) {
    throw new Error("معرف جلسة الرفع (uploadSessionId) مطلوب للفحص الخادمي");
  }

  // 2a. Resolve session authoritatively from DB
  const session = await dbAdapter.resolveUploadSession(uploadSessionId);
  const stagingPath = session.staging_path;

  // 2b. Download and run all security scanners on stored ZIP bytes
  const valResult = await downloadAndValidateStoredZipWorkflow(
    stagingPath,
    storageAdapter,
    session.resource_code || undefined
  );

  // 2c. Record server validation in DB if resourceVersionId is provided
  if (resourceVersionId) {
    const validUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const valId = await dbAdapter.recordServerValidation({
      uploadSessionId: session.session_id,
      resourceVersionId,
      packageHash: valResult.packageHash || session.expected_package_hash || "unknown_hash",
      scannerVersion: valResult.scannerVersion,
      findings: valResult.findings,
      isValid: valResult.isValid,
      validUntil,
      storageObjectPath: stagingPath,
    });
    valResult.validationId = valId;
  }

  return valResult;
}

/**
 * 3. Promote Approved Package based on DB promotion binding
 */
export async function promoteApprovedPackage(
  options: PromotePackageRequest,
  dbAdapter: DatabaseClientAdapter,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter
): Promise<PublishedStorageResult> {
  // 3a. Resolve promotion binding authoritatively from DB
  const binding = await dbAdapter.resolvePromotionBinding({
    uploadSessionId: options.uploadSessionId,
    resourceVersionId: options.resourceVersionId,
  });

  const publishedPath = binding.published_target_path;

  // 3b. Record storage operation in DB
  const operationId = await dbAdapter.recordStorageOperation({
    operationType: "promote_published",
    uploadSessionId: binding.upload_session_id,
    resourceVersionId: binding.version_id,
    stagingPath: binding.staging_path,
    publishedPath,
    status: "in_progress",
  });

  try {
    // 3c. Download staging bytes
    const { data: stagingBytes, error: downErr } = await storageAdapter.download(
      DRAFTS_BUCKET,
      binding.staging_path
    );

    if (downErr || !stagingBytes || stagingBytes.byteLength === 0) {
      await dbAdapter.updateStorageOperation(
        operationId,
        "failed",
        `فشل تنزيل ملف Staging: ${downErr?.message || "الملف مفقود"}`
      );
      return {
        publishedPath,
        bucket: PUBLISHED_BUCKET,
        contentSha256: binding.expected_hash,
        promoted: false,
        status: "failed",
        errorDetails: `فشل تنزيل ملف Staging: ${downErr?.message || "الملف مفقود"}`,
      };
    }

    // 3d. Verify SHA-256 hash of staging bytes against binding expected hash
    const stagingHash = computeBytesSha256(stagingBytes);
    if (stagingHash !== binding.expected_hash) {
      await dbAdapter.updateStorageOperation(
        operationId,
        "failed",
        `توقيع Staging (${stagingHash}) لا يطابق التوقيع المتوقع (${binding.expected_hash})`
      );
      return {
        publishedPath,
        bucket: PUBLISHED_BUCKET,
        contentSha256: binding.expected_hash,
        promoted: false,
        status: "failed",
        errorDetails: `توقيع Staging (${stagingHash}) لا يطابق التوقيع المتوقع (${binding.expected_hash})`,
      };
    }

    // 3e. Overwrite protection: check target existence
    const { data: existingTarget } = await storageAdapter.download(
      PUBLISHED_BUCKET,
      publishedPath
    );
    if (existingTarget && existingTarget.byteLength > 0) {
      await dbAdapter.updateStorageOperation(
        operationId,
        "failed",
        "الملف موجود مسبقاً في مسار النشر (ممنوع إعادة الكتابة)"
      );
      return {
        publishedPath,
        bucket: PUBLISHED_BUCKET,
        contentSha256: binding.expected_hash,
        promoted: false,
        status: "failed",
        errorDetails: "الملف موجود مسبقاً في مسار النشر (ممنوع إعادة الكتابة)",
      };
    }

    // 3f. Upload to Published storage with upsert = false
    const { error: upErr } = await storageAdapter.upload(
      PUBLISHED_BUCKET,
      publishedPath,
      stagingBytes,
      "application/octet-stream",
      false
    );

    if (upErr) {
      await dbAdapter.updateStorageOperation(
        operationId,
        "failed",
        `فشل رفع الملف للمستهدف: ${upErr.message}`
      );
      return {
        publishedPath,
        bucket: PUBLISHED_BUCKET,
        contentSha256: binding.expected_hash,
        promoted: false,
        status: "failed",
        errorDetails: `فشل رفع الملف للمستهدف: ${upErr.message}`,
      };
    }

    // 3g. Target SHA-256 hash verification
    const { data: targetBytes, error: targetErr } = await storageAdapter.download(
      PUBLISHED_BUCKET,
      publishedPath
    );

    if (targetErr || !targetBytes || targetBytes.byteLength === 0) {
      await storageAdapter.remove(PUBLISHED_BUCKET, [publishedPath]);
      await dbAdapter.updateStorageOperation(
        operationId,
        "failed",
        "فشل تنزيل المستهدف للتحقق من التوقيع بعد النقل"
      );
      return {
        publishedPath,
        bucket: PUBLISHED_BUCKET,
        contentSha256: binding.expected_hash,
        promoted: false,
        status: "failed",
        errorDetails: "فشل تنزيل المستهدف للتحقق من التوقيع بعد النقل",
      };
    }

    const targetHash = computeBytesSha256(targetBytes);
    if (targetHash !== binding.expected_hash) {
      // Remove partial target
      await storageAdapter.remove(PUBLISHED_BUCKET, [publishedPath]);
      await dbAdapter.updateStorageOperation(
        operationId,
        "failed",
        `توقيع المستهدف (${targetHash}) لا يطابق التوقيع المتوقع (${binding.expected_hash})`
      );
      return {
        publishedPath,
        bucket: PUBLISHED_BUCKET,
        contentSha256: binding.expected_hash,
        promoted: false,
        status: "failed",
        errorDetails: `توقيع المستهدف (${targetHash}) لا يطابق التوقيع المتوقع (${binding.expected_hash})`,
      };
    }

    // 3h. DB publication state transition
    await dbAdapter.recordPublicationState(binding.resource_id, binding.version_id);

    // 3i. Cleanup staging
    const { error: removeErr } = await storageAdapter.remove(DRAFTS_BUCKET, [
      binding.staging_path,
    ]);

    if (removeErr) {
      await dbAdapter.updateStorageOperation(
        operationId,
        "cleanup_pending",
        `تعذر حذف ملف Staging: ${removeErr.message}`
      );
      return {
        publishedPath,
        bucket: PUBLISHED_BUCKET,
        contentSha256: binding.expected_hash,
        promoted: true,
        status: "cleanup_pending",
        errorDetails: `تعذر حذف ملف Staging: ${removeErr.message}`,
      };
    }

    await dbAdapter.updateStorageOperation(operationId, "cleaned", "تم النشر والتنظيف بنجاح");

    return {
      publishedPath,
      bucket: PUBLISHED_BUCKET,
      contentSha256: binding.expected_hash,
      promoted: true,
      status: "promoted",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await dbAdapter.updateStorageOperation(operationId, "failed", msg);
    return {
      publishedPath,
      bucket: PUBLISHED_BUCKET,
      contentSha256: binding.expected_hash,
      promoted: false,
      status: "failed",
      errorDetails: msg,
    };
  }
}

/**
 * 4. Create Student Signed Access URL based on DB student binding
 */
export async function createSignedStudentAccessUrl(
  request: StudentSignedAccessRequest,
  dbAdapter: DatabaseClientAdapter,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter
): Promise<StudentSignedAccessResult> {
  if (!request.resourceId) {
    return {
      granted: false,
      reason: "معرف المورد (resourceId) مطلوب",
    };
  }

  // 4a. Resolve student access binding authoritatively from DB
  const binding = await dbAdapter.resolveStudentResourceBinding(request.resourceId);

  const publishedPath = `published/${binding.resource_id}/${binding.published_version_number}`;
  const signedUrlTtlSeconds = 900; // Hardcoded server-controlled TTL (15 minutes)

  // 4b. Create real signed URL
  const { signedUrl, error } = await storageAdapter.createSignedUrl(
    PUBLISHED_BUCKET,
    publishedPath,
    signedUrlTtlSeconds
  );

  if (error || !signedUrl) {
    return {
      granted: false,
      reason: `فشل إنشاء رابط الوصول الموقع: ${error?.message || "Storage error"}`,
    };
  }

  return {
    granted: true,
    signedUrl,
    expiresInSeconds: signedUrlTtlSeconds,
  };
}

/**
 * 5. Cleanup or Compensate Partial Operations
 */
export async function cleanupOrCompensate(
  request: CompensationRequest,
  dbAdapter: DatabaseClientAdapter,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter
): Promise<CompensationResult> {
  let publishedPath: string | undefined;
  let stagingPath: string | undefined;

  if (request.storageOperationId) {
    const op = await dbAdapter.resolveStorageOperation(request.storageOperationId);
    if (op) {
      publishedPath = op.published_path;
      stagingPath = op.staging_path;
    }
  } else if (request.uploadSessionId) {
    const session = await dbAdapter.resolveUploadSession(request.uploadSessionId);
    stagingPath = session.staging_path;
  }

  try {
    if (publishedPath) {
      const { error: removePubErr } = await storageAdapter.remove(
        PUBLISHED_BUCKET,
        [publishedPath]
      );
      if (removePubErr) {
        if (request.storageOperationId) {
          await dbAdapter.updateStorageOperation(
            request.storageOperationId,
            "failed",
            `فشل إزالة الملف المنشور الجزئي: ${removePubErr.message}`
          );
        }
        return {
          compensated: false,
          status: "failed",
          details: `فشل إزالة الملف المنشور الجزئي: ${removePubErr.message}`,
        };
      }
    }

    if (stagingPath) {
      const { error: removeStagingErr } = await storageAdapter.remove(
        DRAFTS_BUCKET,
        [stagingPath]
      );
      if (removeStagingErr) {
        if (request.storageOperationId) {
          await dbAdapter.updateStorageOperation(
            request.storageOperationId,
            "failed",
            `فشل إزالة ملف Staging الجزئي: ${removeStagingErr.message}`
          );
        }
        return {
          compensated: false,
          status: "failed",
          details: `فشل إزالة ملف Staging الجزئي: ${removeStagingErr.message}`,
        };
      }
    }

    if (request.storageOperationId) {
      await dbAdapter.updateStorageOperation(
        request.storageOperationId,
        "compensated",
        "تم تنفيذ التعويض بنجاح"
      );
    }

    return {
      compensated: true,
      status: "compensated",
      details: "تم تنفيذ التعويض بنجاح",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (request.storageOperationId) {
      await dbAdapter.updateStorageOperation(request.storageOperationId, "failed", msg);
    }
    return {
      compensated: false,
      status: "failed",
      details: msg,
    };
  }
}
