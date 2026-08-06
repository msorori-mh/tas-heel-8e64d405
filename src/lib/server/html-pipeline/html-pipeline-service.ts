import {
  defaultSupabaseStorageAdapter,
  type StorageClientAdapter,
} from "./storage-adapter";
import { downloadAndValidateStoredZipWorkflow } from "./package-validator";
import type {
  HtmlUploadSessionRequest,
  HtmlUploadSessionResponse,
  ServerPackageValidationResult,
  PromotePackageOptions,
  PublishedStorageResult,
  StudentSignedAccessOptions,
  StudentSignedAccessResult,
  CompensationOptions,
  CompensationResult,
} from "./types";
import {
  parseMasterZipBuffer,
  computePackageDeterministicHash,
} from "@/lib/content-import/html-package";

const DRAFTS_BUCKET = "lesson-resource-drafts";
const PUBLISHED_BUCKET = "lesson-resource-published";

function sanitizeResourceCode(code: string): string {
  if (!code || code.includes("..") || code.includes("/") || code.includes("\\")) {
    throw new Error("رمز المورد غير صالح أو يحتوي على محاولة تجاوز مسار (Path Traversal)");
  }
  const clean = code.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
  if (clean.length < 3) {
    throw new Error("رمز المورد يجب أن يتكون من 3 أحرف على الأقل");
  }
  return clean;
}

function sanitizeFilename(filename: string): string {
  if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    throw new Error("اسم الملف غير صالح أو يحتوي على محاولة تجاوز مسار (Path Traversal)");
  }
  const clean = filename.replace(/[/\\]|\.\./g, "");
  if (!clean) {
    throw new Error("اسم الملف غير صالح");
  }
  return clean;
}

/**
 * 1. Create Upload Session
 */
export async function createUploadSession(
  actorId: string,
  request: HtmlUploadSessionRequest,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter,
): Promise<HtmlUploadSessionResponse> {
  if (!actorId) {
    throw new Error("غير مصرح: يجب توفر جلسة خادم موثوقة (actorId)");
  }
  if (!request.batchId) {
    throw new Error("معرف الدفعة (batchId) مطلوب");
  }

  const cleanCode = sanitizeResourceCode(request.resourceCode);
  const cleanFilename = sanitizeFilename(request.filename);
  const uploadSessionId = crypto.randomUUID();

  const stagingPath = `staging/${actorId}/${request.batchId}/${uploadSessionId}/${cleanFilename}`;

  const { signedUrl, token } = await storageAdapter.createSignedUploadUrl(
    DRAFTS_BUCKET,
    stagingPath,
  );

  if (!signedUrl) {
    throw new Error("فشل إنشاء رابط التوقيع الخادمي للرفع");
  }

  return {
    uploadSessionId,
    stagingPath,
    bucket: DRAFTS_BUCKET,
    expiresInSeconds: 3600,
    signedUploadUrl: signedUrl,
    token,
  };
}

/**
 * 2. Create Signed Upload URL for existing staging path
 */
export async function createSignedUploadUrl(
  actorId: string,
  stagingPath: string,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter,
): Promise<{ signedUploadUrl: string; token: string }> {
  if (!actorId) {
    throw new Error("غير مصرح: جلسة الخادم مفقودة");
  }
  if (!stagingPath || !stagingPath.startsWith(`staging/${actorId}/`)) {
    throw new Error("مسار Staging غير مصرح به أو لا يتبع جلسة المستخدم الحالية");
  }

  const { signedUrl, token } = await storageAdapter.createSignedUploadUrl(
    DRAFTS_BUCKET,
    stagingPath,
  );

  if (!signedUrl) {
    throw new Error("فشل إنشاء رابط التوقيع للرفع");
  }

  return { signedUploadUrl: signedUrl, token };
}

/**
 * 3. Finalize Uploaded Object (Verify Byte Presence)
 */
export async function finalizeUploadedObject(
  actorId: string,
  stagingPath: string,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter,
): Promise<{ finalized: boolean; stagingPath: string; fileSizeBytes: number }> {
  if (!actorId) {
    throw new Error("غير مصرح: جلسة الخادم مفقودة");
  }
  if (!stagingPath || !stagingPath.startsWith(`staging/${actorId}/`)) {
    throw new Error("مسار Staging غير صالح للتحقق");
  }

  const { data: bytes, error } = await storageAdapter.download(
    DRAFTS_BUCKET,
    stagingPath,
  );

  if (error || !bytes || bytes.byteLength === 0) {
    throw new Error(
      `لم يتم العثور على الملف المرفوع في التخزين المؤقت: ${error?.message || "الملف فارغ"}`,
    );
  }

  return {
    finalized: true,
    stagingPath,
    fileSizeBytes: bytes.byteLength,
  };
}

/**
 * 4. Download & Validate Stored ZIP
 */
export async function downloadAndValidateStoredZip(
  stagingPath: string,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter,
): Promise<ServerPackageValidationResult> {
  if (!stagingPath || !stagingPath.startsWith("staging/")) {
    throw new Error("مسار Staging غير صالح للفحص الخادمي");
  }

  return downloadAndValidateStoredZipWorkflow(stagingPath, storageAdapter);
}

/**
 * 5. Promote Approved Package to Published Storage
 */
export async function promoteApprovedPackage(
  options: PromotePackageOptions,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter,
): Promise<PublishedStorageResult> {
  const cleanCode = sanitizeResourceCode(options.resourceCode);
  if (options.versionNumber < 1) {
    throw new Error("رقم الإصدار غير صالح");
  }
  if (!options.expectedContentSha256) {
    throw new Error("توقيع المحتوى (contentSha256) مطلوب للنقل المحمي");
  }
  if (!options.stagingPath || !options.stagingPath.startsWith("staging/")) {
    return {
      publishedPath: "",
      bucket: PUBLISHED_BUCKET,
      contentSha256: options.expectedContentSha256,
      promoted: false,
      status: "failed",
      errorDetails: "مسار Staging غير صالح",
    };
  }

  const publishedPath = `published/${cleanCode}/${options.versionNumber}/${options.expectedContentSha256}`;

  try {
    // 5a. Download staging bytes
    const { data: stagingBytes, error: downErr } = await storageAdapter.download(
      DRAFTS_BUCKET,
      options.stagingPath,
    );

    if (downErr || !stagingBytes || stagingBytes.byteLength === 0) {
      return {
        publishedPath,
        bucket: PUBLISHED_BUCKET,
        contentSha256: options.expectedContentSha256,
        promoted: false,
        status: "failed",
        errorDetails: `فشل تنزيل ملف Staging: ${downErr?.message || "الملف مفقود"}`,
      };
    }

    // 5b. Verify hash from stored bytes
    const zipScan = await parseMasterZipBuffer(stagingBytes);
    if (!zipScan.isValid) {
      return {
        publishedPath,
        bucket: PUBLISHED_BUCKET,
        contentSha256: options.expectedContentSha256,
        promoted: false,
        status: "failed",
        errorDetails: "فشل قراءة ملف ZIP المخزن قبل النقل",
      };
    }

    const pkgFiles = Object.values(zipScan.packageMap)[0] || [];
    const computedHash = await computePackageDeterministicHash(pkgFiles);

    if (computedHash !== options.expectedContentSha256) {
      return {
        publishedPath,
        bucket: PUBLISHED_BUCKET,
        contentSha256: options.expectedContentSha256,
        promoted: false,
        status: "failed",
        errorDetails: `توقيع الملف المخزن (${computedHash}) لا يطابق التوقيع المتوقع (${options.expectedContentSha256})`,
      };
    }

    // 5c. Upload to Published storage with upsert: false (Overwrite Protection)
    const { error: upErr } = await storageAdapter.upload(
      PUBLISHED_BUCKET,
      publishedPath,
      stagingBytes,
      "application/octet-stream",
      false, // upsert = false
    );

    if (upErr) {
      return {
        publishedPath,
        bucket: PUBLISHED_BUCKET,
        contentSha256: options.expectedContentSha256,
        promoted: false,
        status: "failed",
        errorDetails: `فشل رفع الملف لـ Published (ربما الملف موجود مسبقاً): ${upErr.message}`,
      };
    }

    // 5d. Verify target after transfer
    const { data: targetBytes, error: targetErr } = await storageAdapter.download(
      PUBLISHED_BUCKET,
      publishedPath,
    );

    if (targetErr || !targetBytes || targetBytes.byteLength !== stagingBytes.byteLength) {
      // Compensation: remove target if corrupt/partial
      await storageAdapter.remove(PUBLISHED_BUCKET, [publishedPath]);
      return {
        publishedPath,
        bucket: PUBLISHED_BUCKET,
        contentSha256: options.expectedContentSha256,
        promoted: false,
        status: "cleanup_pending",
        errorDetails: "فشل التحقق من صحة المستهدف بعد النقل",
      };
    }

    // 5e. Cleanup staging after success
    await storageAdapter.remove(DRAFTS_BUCKET, [options.stagingPath]);

    return {
      publishedPath,
      bucket: PUBLISHED_BUCKET,
      contentSha256: options.expectedContentSha256,
      promoted: true,
      status: "promoted",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      publishedPath,
      bucket: PUBLISHED_BUCKET,
      contentSha256: options.expectedContentSha256,
      promoted: false,
      status: "failed",
      errorDetails: msg,
    };
  }
}

/**
 * 6. Create Student Signed Access URL
 */
export async function createSignedStudentAccessUrl(
  options: StudentSignedAccessOptions,
  studentCanAccessLesson: boolean,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter,
): Promise<StudentSignedAccessResult> {
  const { status, publishedVersionId, publishedPath, signedUrlTtlSeconds = 900 } = options;

  if (status !== "published" || !publishedVersionId) {
    return {
      granted: false,
      reason: "المورد غير منشور (ليس في حالة published)",
    };
  }

  if (!studentCanAccessLesson) {
    return {
      granted: false,
      reason: "الطالب ليس لديه صلاحية الوصول لهذا الدرس",
    };
  }

  if (
    !publishedPath ||
    publishedPath.includes("staging") ||
    publishedPath.includes("drafts") ||
    !publishedPath.startsWith("published/")
  ) {
    return {
      granted: false,
      reason: "مسار التخزين غير صالح للوصول الطلابي (مرفوض الوصول للمسودات أو staging)",
    };
  }

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
 * 7. Cleanup or Compensate Partial Operations
 */
export async function cleanupOrCompensate(
  options: CompensationOptions,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter,
): Promise<CompensationResult> {
  try {
    if (options.operationType === "promote_published" && options.publishedPath) {
      // Remove published path if corrupted
      const { error: removePubErr } = await storageAdapter.remove(
        PUBLISHED_BUCKET,
        [options.publishedPath],
      );
      if (removePubErr) {
        return {
          compensated: false,
          status: "failed",
          details: `فشل إزالة الملف المنشور الجزئي: ${removePubErr.message}`,
        };
      }
    }

    if (options.stagingPath) {
      await storageAdapter.remove(DRAFTS_BUCKET, [options.stagingPath]);
    }

    return {
      compensated: true,
      status: "compensated",
      details: `تم تنفيذ التعويض بنجاح للسبب: ${options.reason}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      compensated: false,
      status: "failed",
      details: msg,
    };
  }
}
