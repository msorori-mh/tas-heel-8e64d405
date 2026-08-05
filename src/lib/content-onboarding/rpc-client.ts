import { supabase } from "@/integrations/supabase/client";
import { CONTENT_FEATURE_FLAGS } from "./feature-flags";

export interface RPCResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Creates a new content import batch. Fail-closed when ENABLE_HTML_CONTENT_UPLOAD is false.
 */
export async function createContentImportBatch(
  excelFilename: string,
  zipFilename: string,
  totalRows: number,
  idempotencyKey?: string
): Promise<RPCResponse> {
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
  return { success: true, data };
}

/**
 * Issues a staging upload path for a resource.
 */
export async function issueContentUpload(
  batchId: string,
  resourceCode: string,
  filename: string,
  idempotencyKey?: string
): Promise<RPCResponse> {
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
  return { success: true, data };
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
  manifest: Record<string, any>,
  files: Array<Record<string, any>>,
  idempotencyKey?: string
): Promise<RPCResponse> {
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
    p_manifest: manifest,
    p_files: files,
    p_idempotency_key: idempotencyKey ?? undefined,
  });

  if (error) {
    return { success: false, error: { code: error.code || "RPC_ERROR", message: error.message } };
  }
  return { success: true, data };
}

/**
 * Attests validation of an uploaded package via server scanner results.
 */
export async function validateContentPackage(
  resourceId: string,
  versionId: string,
  idempotencyKey?: string
): Promise<RPCResponse> {
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
  return { success: true, data };
}

/**
 * Submits a draft resource for review.
 */
export async function submitResourceForReview(
  resourceId: string,
  expectedLockVersion: number,
  idempotencyKey?: string
): Promise<RPCResponse> {
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
  return { success: true, data };
}

/**
 * Approves a resource version (Admin only).
 */
export async function approveResourceVersion(
  resourceId: string,
  versionId: string,
  expectedLockVersion: number,
  idempotencyKey?: string
): Promise<RPCResponse> {
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
  return { success: true, data };
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
): Promise<RPCResponse> {
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
  return { success: true, data };
}

/**
 * Publishes an approved version (Admin only).
 */
export async function publishResourceVersion(
  resourceId: string,
  versionId: string,
  expectedLockVersion: number,
  idempotencyKey?: string
): Promise<RPCResponse> {
  if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_PUBLISH) {
    return {
      success: false,
      error: { code: "FEATURE_FLAG_DISABLED", message: "نشر الموارد معطّل حالياً." },
    };
  }

  const { data, error } = await supabase.rpc("publish_resource_version", {
    p_resource_id: resourceId,
    p_version_id: versionId,
    p_expected_lock_version: expectedLockVersion,
    p_idempotency_key: idempotencyKey ?? undefined,
  });

  if (error) {
    return { success: false, error: { code: error.code || "RPC_ERROR", message: error.message } };
  }
  return { success: true, data };
}

/**
 * Unpublishes a resource (Admin only).
 */
export async function unpublishResourceVersion(
  resourceId: string,
  reason: string,
  expectedLockVersion: number,
  idempotencyKey?: string
): Promise<RPCResponse> {
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
  return { success: true, data };
}

/**
 * Archives a resource (Admin only).
 */
export async function archiveLessonResource(
  resourceId: string,
  reason: string,
  expectedLockVersion: number,
  idempotencyKey?: string
): Promise<RPCResponse> {
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
  return { success: true, data };
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
): Promise<RPCResponse> {
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
  return { success: true, data };
}

/**
 * Fetches published resources for a student. Fail-closed error when ENABLE_HTML_CONTENT_STUDENT_READ is false.
 */
export async function fetchPublishedLessonResources(lessonId: string): Promise<RPCResponse<any[]>> {
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
  return { success: true, data: Array.isArray(data) ? data : [] };
}
