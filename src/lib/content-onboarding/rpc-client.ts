import { supabase } from "@/integrations/supabase/client";
import { CONTENT_FEATURE_FLAGS } from "./feature-flags";

export interface RPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface CreateBatchResult {
  batch_id: string;
  status: string;
  total_rows: number;
  created_at: string;
}

export interface IssueUploadResult {
  batch_id: string;
  upload_session_id: string;
  resource_code: string;
  bucket: string;
  staging_path: string;
}

export interface FinalizeUploadResult {
  resource_id: string;
  version_id: string;
  version_number: number;
  status: string;
  lock_version: number;
}

export interface ValidatePackageResult {
  resource_id: string;
  version_id: string;
  is_valid: boolean;
  content_sha256: string;
  findings: Array<{ code: string; severity: "error" | "warning" | "info"; message: string }>;
  validated_at: string;
}

export interface SubmitReviewResult {
  resource_id: string;
  status: string;
  lock_version: number;
}

export interface ApproveVersionResult {
  resource_id: string;
  status: string;
  approved_version_id: string;
  lock_version: number;
}

export interface RejectVersionResult {
  resource_id: string;
  status: string;
  lock_version: number;
}

export interface PublishVersionResult {
  resource_id: string;
  status: string;
  published_version_id: string;
  published_path: string;
  lock_version: number;
}

export interface UnpublishVersionResult {
  resource_id: string;
  status: string;
  published_version_id: null;
  lock_version: number;
}

export interface ArchiveResourceResult {
  resource_id: string;
  status: string;
  lock_version: number;
}

export interface RollbackVersionResult {
  resource_id: string;
  status: string;
  published_version_id: string;
  previous_published_version_id: string;
  lock_version: number;
}

export interface PublishedStudentResource {
  id: string;
  resource_code: string;
  resource_type: string;
  title: string;
  description: string | null;
  sort_order: number;
  entry_file: string;
  content_sha256: string;
  published_version_id: string;
  url: string;
}

export interface ReviewQueueItem {
  id: string;
  resource_code: string;
  resource_type: string;
  title: string;
  description: string;
  status: "draft" | "in_review" | "approved" | "published" | "rejected" | "archived";
  lock_version: number;
  current_draft_version_id?: string;
  approved_version_id?: string;
  published_version_id?: string;
  lesson_title: string;
  updated_at: string;
}

export interface RecordValidationResult {
  validation_id: string;
  version_id: string;
  is_valid: boolean;
  package_hash: string;
  validated_by_server: boolean;
}

/**
 * Creates a new content import batch. Fail-closed when ENABLE_HTML_CONTENT_UPLOAD is false.
 */
export async function createContentImportBatch(
  excelFilename: string,
  zipFilename: string,
  totalRows: number,
  idempotencyKey?: string
): Promise<RPCResponse<CreateBatchResult>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_UPLOAD) {
    return {
      success: false,
      error: {
        code: "FEATURE_FLAG_DISABLED",
        message: "استيراد محتوى HTML معطّل حالياً عبر Feature Flag.",
      },
    };
  }

  const { data, error } = await supabase.rpc("create_content_import_batch", {
    p_excel_filename: excelFilename,
    p_zip_filename: zipFilename,
    p_total_rows: totalRows,
    p_idempotency_key: idempotencyKey ?? undefined,
  });

  if (error) {
    return { success: false, error: { code: error.code || "RPC_ERROR", message: error.message } };
  }
  return { success: true, data: (data as unknown) as CreateBatchResult };
}

/**
 * Issues a staging upload path for a resource.
 */
export async function issueContentUpload(
  batchId: string,
  resourceCode: string,
  filename: string,
  idempotencyKey?: string
): Promise<RPCResponse<IssueUploadResult>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_UPLOAD) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "رفع محتوى HTML معطّل حالياً." },
    };
  }

  const { data, error } = await supabase.rpc("issue_content_upload", {
    p_batch_id: batchId,
    p_resource_code: resourceCode,
    p_filename: filename,
    p_idempotency_key: idempotencyKey ?? undefined,
  });

  if (error) {
    return { success: false, error: { code: error.code || "RPC_ERROR", message: error.message } };
  }
  return { success: true, data: (data as unknown) as IssueUploadResult };
}

/**
 * Finalizes an uploaded draft version.
 */
export async function finalizeContentUpload(
  batchId: string,
  lessonId: string,
  resourceCode: string,
  resourceType: string,
  title: string,
  stagingPath: string,
  contentSha256: string,
  manifest: Record<string, unknown>,
  files: Array<Record<string, unknown>>,
  idempotencyKey?: string
): Promise<RPCResponse<FinalizeUploadResult>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_UPLOAD) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "تأكيد الرفع معطّل حالياً." },
    };
  }

  const { data, error } = await supabase.rpc("finalize_content_upload", {
    p_batch_id: batchId,
    p_lesson_id: lessonId,
    p_resource_code: resourceCode,
    p_resource_type: resourceType,
    p_title: title,
    p_staging_path: stagingPath,
    p_content_sha256: contentSha256,
    p_manifest: manifest as unknown as Record<string, never>,
    p_files: files as unknown as Record<string, never>[],
    p_idempotency_key: idempotencyKey ?? undefined,
  });

  if (error) {
    return { success: false, error: { code: error.code || "RPC_ERROR", message: error.message } };
  }
  return { success: true, data: (data as unknown) as FinalizeUploadResult };
}

/**
 * Attests validation of an uploaded package via server scanner results.
 */
export async function validateContentPackage(
  resourceId: string,
  versionId: string,
  idempotencyKey?: string
): Promise<RPCResponse<ValidatePackageResult>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_UPLOAD) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "فحص الحزم معطّل حالياً." },
    };
  }

  const { data, error } = await supabase.rpc("validate_content_package", {
    p_resource_id: resourceId,
    p_version_id: versionId,
    p_idempotency_key: idempotencyKey ?? undefined,
  });

  if (error) {
    return { success: false, error: { code: error.code || "RPC_ERROR", message: error.message } };
  }
  return { success: true, data: (data as unknown) as ValidatePackageResult };
}

/**
 * Records server package validation result into database.
 */
export async function recordServerPackageValidation(
  versionId: string,
  batchId: string,
  packageHash: string,
  scannerVersion: string,
  findings: Array<{ code: string; severity: "error" | "warning" | "info"; message: string }>,
  isValid: boolean,
  idempotencyKey?: string
): Promise<RPCResponse<RecordValidationResult>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_UPLOAD) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "تسجيل الفحص معطّل حالياً." },
    };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const client = supabaseAdmin as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
  };

  const { data, error } = await client.rpc("record_server_package_validation", {
    p_version_id: versionId,
    p_batch_id: batchId,
    p_package_hash: packageHash,
    p_scanner_version: scannerVersion,
    p_findings: findings as unknown as Record<string, unknown>[],
    p_is_valid: isValid,
    p_idempotency_key: idempotencyKey ?? null,
  });

  if (error || !data) {
    return {
      success: false,
      error: { code: error?.code || "RPC_ERROR", message: error?.message || "Failed to record package validation" },
    };
  }
  return { success: true, data: data as unknown as RecordValidationResult };
}

/**
 * Submits a draft resource for review.
 */
export async function submitResourceForReview(
  resourceId: string,
  expectedLockVersion: number,
  idempotencyKey?: string
): Promise<RPCResponse<SubmitReviewResult>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_BACKEND) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "إرسال المراجعة معطّل حالياً." },
    };
  }

  const { data, error } = await supabase.rpc("submit_resource_for_review", {
    p_resource_id: resourceId,
    p_expected_lock_version: expectedLockVersion,
    p_idempotency_key: idempotencyKey ?? undefined,
  });

  if (error) {
    return { success: false, error: { code: error.code || "RPC_ERROR", message: error.message } };
  }
  return { success: true, data: (data as unknown) as SubmitReviewResult };
}

/**
 * Approves a resource version (Admin only).
 */
export async function approveResourceVersion(
  resourceId: string,
  versionId: string,
  expectedLockVersion: number,
  idempotencyKey?: string
): Promise<RPCResponse<ApproveVersionResult>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_BACKEND) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "اعتماد الموارد معطّل حالياً." },
    };
  }

  const { data, error } = await supabase.rpc("approve_resource_version", {
    p_resource_id: resourceId,
    p_version_id: versionId,
    p_expected_lock_version: expectedLockVersion,
    p_idempotency_key: idempotencyKey ?? undefined,
  });

  if (error) {
    return { success: false, error: { code: error.code || "RPC_ERROR", message: error.message } };
  }
  return { success: true, data: (data as unknown) as ApproveVersionResult };
}

/**
 * Rejects a resource version (Admin only).
 */
export async function rejectResourceVersion(
  resourceId: string,
  versionId: string,
  reason: string,
  expectedLockVersion: number,
  idempotencyKey?: string
): Promise<RPCResponse<RejectVersionResult>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_BACKEND) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "رفض الموارد معطّل حالياً." },
    };
  }

  const { data, error } = await supabase.rpc("reject_resource_version", {
    p_resource_id: resourceId,
    p_version_id: versionId,
    p_reason: reason,
    p_expected_lock_version: expectedLockVersion,
    p_idempotency_key: idempotencyKey ?? undefined,
  });

  if (error) {
    return { success: false, error: { code: error.code || "RPC_ERROR", message: error.message } };
  }
  return { success: true, data: (data as unknown) as RejectVersionResult };
}

/**
 * Publishes an approved version (Admin only).
 */
export async function publishResourceVersion(
  resourceId: string,
  versionId: string,
  expectedLockVersion: number,
  idempotencyKey?: string
): Promise<RPCResponse<PublishVersionResult>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_PUBLISH) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "نشر الموارد معطّل حالياً." },
    };
  }

  const { data: authData } = await supabase.auth.getUser();
  const actorId = authData.user?.id || "00000000-0000-0000-0000-000000000001";

  const { publishAndPromotePackageServerAction } = await import("@/lib/server/content-onboarding/server-actions");

  const serverRes = await publishAndPromotePackageServerAction({
    actorId,
    resourceId,
    versionId,
    expectedLockVersion,
    idempotencyKey,
  });

  if (!serverRes.success || !serverRes.data) {
    return {
      success: false,
      error: {
        code: serverRes.error?.code || "PUBLISH_FAILED",
        message: serverRes.error?.message || "فشل نشر المورد ونقل الملفات للتخزين الدائم",
      },
    };
  }

  return {
    success: true,
    data: {
      resource_id: serverRes.data.resource_id,
      status: serverRes.data.status,
      published_version_id: serverRes.data.published_version_id,
      published_path: `published/${resourceId}/${versionId}`,
      lock_version: expectedLockVersion + 1,
    },
  };
}

/**
 * Unpublishes a resource (Admin only).
 */
export async function unpublishResourceVersion(
  resourceId: string,
  reason: string,
  expectedLockVersion: number,
  idempotencyKey?: string
): Promise<RPCResponse<UnpublishVersionResult>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_PUBLISH) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "إلغاء النشر معطّل حالياً." },
    };
  }

  const { data, error } = await supabase.rpc("unpublish_resource_version", {
    p_resource_id: resourceId,
    p_reason: reason,
    p_expected_lock_version: expectedLockVersion,
    p_idempotency_key: idempotencyKey ?? undefined,
  });

  if (error) {
    return { success: false, error: { code: error.code || "RPC_ERROR", message: error.message } };
  }
  return { success: true, data: (data as unknown) as UnpublishVersionResult };
}

/**
 * Archives a resource (Admin only).
 */
export async function archiveLessonResource(
  resourceId: string,
  reason: string,
  expectedLockVersion: number,
  idempotencyKey?: string
): Promise<RPCResponse<ArchiveResourceResult>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_BACKEND) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "أرشفة الموارد معطّلة حالياً." },
    };
  }

  const { data, error } = await supabase.rpc("archive_lesson_resource", {
    p_resource_id: resourceId,
    p_reason: reason,
    p_expected_lock_version: expectedLockVersion,
    p_idempotency_key: idempotencyKey ?? undefined,
  });

  if (error) {
    return { success: false, error: { code: error.code || "RPC_ERROR", message: error.message } };
  }
  return { success: true, data: (data as unknown) as ArchiveResourceResult };
}

/**
 * Rollback published resource version (Admin only).
 */
export async function rollbackPublishedResourceVersion(
  resourceId: string,
  targetVersionId: string,
  expectedLockVersion: number,
  reason: string,
  idempotencyKey?: string
): Promise<RPCResponse<RollbackVersionResult>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_PUBLISH) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "استعادة النسخ السابقة معطّلة حالياً." },
    };
  }

  const { data, error } = await supabase.rpc("rollback_published_resource_version", {
    p_resource_id: resourceId,
    p_target_version_id: targetVersionId,
    p_expected_lock_version: expectedLockVersion,
    p_reason: reason,
    p_idempotency_key: idempotencyKey ?? undefined,
  });

  if (error) {
    return { success: false, error: { code: error.code || "RPC_ERROR", message: error.message } };
  }
  return { success: true, data: (data as unknown) as RollbackVersionResult };
}

/**
 * Fetches published resources for a student. Fail-closed error when ENABLE_HTML_CONTENT_STUDENT_READ is false.
 */
export async function fetchPublishedLessonResources(lessonId: string): Promise<RPCResponse<PublishedStudentResource[]>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_STUDENT_READ) {
    return {
      success: false,
      error: {
        code: "FEATURE_FLAG_DISABLED",
        message: "قراءة المحتوى المعزز للطالب معطّلة حالياً عبر Feature Flag.",
      },
    };
  }

  const { data, error } = await supabase.rpc("fetch_published_lesson_resources", {
    p_lesson_id: lessonId,
  });

  if (error) {
    return { success: false, error: { code: error.code || "RPC_ERROR", message: error.message } };
  }
  return { success: true, data: ((data as unknown) as PublishedStudentResource[]) || [] };
}

/**
 * Fetches admin review queue via server RPC.
 */
export async function fetchContentReviewQueue(): Promise<RPCResponse<ReviewQueueItem[]>> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_BACKEND) {
    return {
      success: false,
      error: {
        code: "FEATURE_FLAG_DISABLED",
        message: "طابور المراجعة معطّل حالياً عبر Feature Flag.",
      },
    };
  }

  const client = supabase as unknown as {
    rpc: (
      fn: string
    ) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
  };

  const { data, error } = await client.rpc("fetch_content_review_queue");

  if (error) {
    return { success: false, error: { code: error.code || "RPC_ERROR", message: error.message } };
  }
  return { success: true, data: (data as unknown as ReviewQueueItem[]) || [] };
}
