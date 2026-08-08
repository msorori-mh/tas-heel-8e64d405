import {
  parseMasterZipBuffer,
  computePackageDeterministicHash,
} from "@/lib/content-import/html-package";
import { defaultSupabaseStorageAdapter, type StorageClientAdapter } from "./storage-adapter";
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

/**
 * Compute the canonical deterministic package hash used by both validation
 * and promotion. This is the single source of truth for content integrity.
 */
async function computeCanonicalPackageHash(zipBytes: Uint8Array): Promise<string> {
  const parseRes = await parseMasterZipBuffer(zipBytes);
  if (!parseRes.isValid) {
    throw new Error("فشل parse ملف ZIP أثناء حساب التوقيع القانوني");
  }

  const packageFiles =
    parseRes.packageMap["package"] || Object.values(parseRes.packageMap)[0] || [];

  if (packageFiles.length === 0) {
    throw new Error("الحزمة فارغة");
  }

  return computePackageDeterministicHash(packageFiles);
}

/**
 * 1. Create Signed Upload URL based on DB upload session
 */
export async function createSignedUploadUrl(
  uploadSessionId: string,
  dbAdapter: DatabaseClientAdapter,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter,
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
    stagingPath,
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
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter,
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
    session.resource_code || undefined,
  );

  // 2c. Record server validation in DB if resourceVersionId is provided.
  // The canonical deterministic hash is required; never fall back to the
  // session expected hash because that would let tampered bytes pass.
  if (resourceVersionId) {
    if (!valResult.packageHash) {
      throw new Error("فشل حساب التوقيع القانوني للحزمة؛ لا يمكن تسجيل نتيجة الفحص الخادمي");
    }

    const validUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const valId = await dbAdapter.recordServerValidation({
      uploadSessionId: session.session_id,
      resourceVersionId,
      packageHash: valResult.packageHash,
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
 *
 * Mandatory ordering:
 * 1. Admin auth (middleware)
 * 2. resolve_promotion_binding
 * 3. Create storage_operation pending
 * 4. Download staging
 * 5. Canonical source hash verify
 * 6. Target existence check
 * 7. Upload target with upsert=false
 * 8. storage_operation -> uploaded
 * 9. Download target
 * 10. Canonical target hash verify
 * 11. storage_operation -> verified
 * 12. storage_operation -> promoted
 * 13. DB publication state mutation
 * 14. storage_operation -> cleanup_pending
 * 15. Remove staging
 * 16. storage_operation -> cleaned
 */
export async function promoteApprovedPackage(
  options: PromotePackageRequest,
  actorId: string,
  dbAdapter: DatabaseClientAdapter,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter,
): Promise<PublishedStorageResult> {
  if (!actorId) {
    throw new Error("معرف ناظر الترقية (actorId) مطلوب");
  }

  // 3a. Resolve promotion binding authoritatively from DB (service-role only)
  const binding = await dbAdapter.resolvePromotionBinding({
    uploadSessionId: options.uploadSessionId,
    resourceVersionId: options.resourceVersionId,
  });

  const publishedPath = binding.published_target_path;

  // 3b. Record storage operation in DB
  let operationId: string;
  try {
    operationId = await dbAdapter.recordStorageOperation({
      actorId,
      resourceId: binding.resource_id,
      resourceVersionId: binding.version_id,
      uploadSessionId: binding.upload_session_id,
      sourcePath: binding.staging_path,
      targetPath: publishedPath,
      expectedHash: binding.expected_hash,
      operationType: "promote_published",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`فشل إنشاء سجل عملية التخزين: ${msg}`);
  }

  const fail = async (failureCode: string): Promise<PublishedStorageResult> => {
    try {
      await dbAdapter.updateStorageOperation(operationId, "failed", failureCode);
    } catch (dbErr: unknown) {
      const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      throw new Error(`فشلت العملية ولم يمكن تسجيل حالة الفشل في قاعدة البيانات: ${dbMsg}`);
    }
    return {
      publishedPath,
      bucket: PUBLISHED_BUCKET,
      contentSha256: binding.expected_hash,
      promoted: false,
      status: "failed",
      errorDetails: failureCode,
    };
  };

  try {
    // 3c. Download staging bytes
    const { data: stagingBytes, error: downErr } = await storageAdapter.download(
      DRAFTS_BUCKET,
      binding.staging_path,
    );

    if (downErr || !stagingBytes || stagingBytes.byteLength === 0) {
      return await fail(`فشل تنزيل ملف Staging: ${downErr?.message || "الملف مفقود"}`);
    }

    // 3d. Canonical source hash verification
    let stagingHash: string;
    try {
      stagingHash = await computeCanonicalPackageHash(stagingBytes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return await fail(`فشل التحقق من توقيع المصدر: ${msg}`);
    }

    if (stagingHash !== binding.expected_hash) {
      return await fail(
        `توقيع Staging (${stagingHash}) لا يطابق التوقيع المتوقع (${binding.expected_hash})`,
      );
    }

    // 3e. Overwrite protection: check target existence
    const { data: existingTarget } = await storageAdapter.download(PUBLISHED_BUCKET, publishedPath);
    if (existingTarget && existingTarget.byteLength > 0) {
      return await fail("الملف موجود مسبقاً في مسار النشر (ممنوع إعادة الكتابة)");
    }

    // 3f. Upload to Published storage with upsert = false
    const { error: upErr } = await storageAdapter.upload(
      PUBLISHED_BUCKET,
      publishedPath,
      stagingBytes,
      "application/octet-stream",
      false,
    );

    if (upErr) {
      return await fail(`فشل رفع الملف للمستهدف: ${upErr.message}`);
    }

    // 3g. storage_operation -> uploaded
    await dbAdapter.updateStorageOperation(operationId, "uploaded");

    // 3h. Download target for verification
    const { data: targetBytes, error: targetErr } = await storageAdapter.download(
      PUBLISHED_BUCKET,
      publishedPath,
    );

    if (targetErr || !targetBytes || targetBytes.byteLength === 0) {
      await storageAdapter.remove(PUBLISHED_BUCKET, [publishedPath]);
      return await fail("فشل تنزيل المستهدف للتحقق من التوقيع بعد النقل");
    }

    // 3i. Canonical target hash verification
    let targetHash: string;
    try {
      targetHash = await computeCanonicalPackageHash(targetBytes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await storageAdapter.remove(PUBLISHED_BUCKET, [publishedPath]);
      return await fail(`فشل التحقق من توقيع المستهدف: ${msg}`);
    }

    if (targetHash !== binding.expected_hash) {
      await storageAdapter.remove(PUBLISHED_BUCKET, [publishedPath]);
      return await fail(
        `توقيع المستهدف (${targetHash}) لا يطابق التوقيع المتوقع (${binding.expected_hash})`,
      );
    }

    // 3j. storage_operation -> verified
    await dbAdapter.updateStorageOperation(operationId, "verified");

    // 3k. storage_operation -> promoted
    await dbAdapter.updateStorageOperation(operationId, "promoted");

    // 3l. Atomic DB publication state mutation (storage-bound, service-role RPC)
    try {
      await dbAdapter.recordSuccessfulResourcePublication({
        resourceId: binding.resource_id,
        versionId: binding.version_id,
        storageOperationId: operationId,
        uploadSessionId: binding.upload_session_id,
        expectedLockVersion: binding.lock_version,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await dbAdapter.updateStorageOperation(
        operationId,
        "failed",
        `فشل تسجيل النشر الذري في قاعدة البيانات: ${msg}`,
      );
      return {
        publishedPath,
        bucket: PUBLISHED_BUCKET,
        contentSha256: binding.expected_hash,
        promoted: false,
        status: "failed",
        errorDetails: `فشل تسجيل النشر الذري في قاعدة البيانات: ${msg}`,
      };
    }

    // 3m. storage_operation -> cleanup_pending
    await dbAdapter.updateStorageOperation(operationId, "cleanup_pending");

    // 3n. Cleanup staging
    const { error: removeErr } = await storageAdapter.remove(DRAFTS_BUCKET, [binding.staging_path]);

    if (removeErr) {
      await dbAdapter.updateStorageOperation(
        operationId,
        "cleanup_pending",
        `تعذر حذف ملف Staging: ${removeErr.message}`,
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

    // 3o. storage_operation -> cleaned
    await dbAdapter.updateStorageOperation(operationId, "cleaned");

    return {
      publishedPath,
      bucket: PUBLISHED_BUCKET,
      contentSha256: binding.expected_hash,
      promoted: true,
      status: "promoted",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return await fail(msg);
  }
}

/**
 * 4. Create Student Signed Access URL based on DB student binding
 */
export async function createSignedStudentAccessUrl(
  request: StudentSignedAccessRequest,
  dbAdapter: DatabaseClientAdapter,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter,
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
    signedUrlTtlSeconds,
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
 * 5. Compensate Partial Operations
 *
 * Accepts only the authoritative storage_operation_id from the client.
 * The server resolves the operation from DB, verifies it is in a state that
 * allows compensation, removes the partial published target, and only then
 * transitions failed -> compensated.
 */
export async function cleanupOrCompensate(
  request: CompensationRequest,
  dbAdapter: DatabaseClientAdapter,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter,
): Promise<CompensationResult> {
  if (!request.storageOperationId) {
    throw new Error("معرف عملية التخزين (storageOperationId) مطلوب للتعويض");
  }

  const op = await dbAdapter.resolveStorageOperation(request.storageOperationId);
  if (!op) {
    throw new Error(`عملية التخزين ${request.storageOperationId} غير موجودة`);
  }

  // Only failed operations may be compensated.
  if (op.status !== "failed") {
    throw new Error(`لا يمكن تنفيذ التعويض على عملية التخزين بحالة ${op.status}`);
  }

  const targetPath = op.targetPath;

  try {
    const { error: removeErr } = await storageAdapter.remove(PUBLISHED_BUCKET, [targetPath]);

    if (removeErr) {
      await dbAdapter.updateStorageOperation(
        request.storageOperationId,
        "failed",
        `فشل إزالة الملف المنشور الجزئي: ${removeErr.message}`,
      );
      return {
        compensated: false,
        status: "failed",
        details: `فشل إزالة الملف المنشور الجزئي: ${removeErr.message}`,
      };
    }

    await dbAdapter.updateStorageOperation(
      request.storageOperationId,
      "compensated",
      "تم تنفيذ التعويض بنجاح",
    );

    return {
      compensated: true,
      status: "compensated",
      details: "تم تنفيذ التعويض بنجاح",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await dbAdapter.updateStorageOperation(request.storageOperationId, "failed", msg);
    return {
      compensated: false,
      status: "failed",
      details: msg,
    };
  }
}
