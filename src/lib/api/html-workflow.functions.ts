import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireAdminAuth,
  requireContentStaffAuth,
} from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createHtmlWorkflowAdapter } from "@/lib/server/html-pipeline/html-workflow-adapter";
import {
  createSignedUploadUrl,
  downloadAndValidateStoredZip,
  promoteApprovedPackage,
} from "@/lib/server/html-pipeline/html-pipeline-service";
import { createSupabaseDbAdapter } from "@/lib/server/html-pipeline/db-adapter";
import { defaultSupabaseStorageAdapter } from "@/lib/server/html-pipeline/storage-adapter";
import type {
  InitializeImportRequest,
  InitializeImportResult,
  ImportResourceSession,
  FinalizeUploadResult,
  ReviewQueueItem,
  ReviewActionResult,
} from "@/lib/server/html-pipeline/html-workflow.types";

const INTERACTIVE_RESOURCE_TYPES = new Set([
  "mind_map_html",
  "practical_experiment_html",
  "summary_html",
]);

const VALID_RESOURCE_TYPES = new Set([
  "mind_map_html",
  "practical_experiment_html",
  "summary_html",
  "image",
  "pdf",
  "video",
  "external_link",
]);

function buildWorkflowAdapter() {
  return createHtmlWorkflowAdapter(supabaseAdmin);
}

function buildPipelineDbAdapter() {
  return createSupabaseDbAdapter({
    userClient: supabaseAdmin,
    adminClient: supabaseAdmin,
  });
}

/**
 * Parse interactive resource rows from Excel buffer (server-side).
 */
async function parseInteractiveExcel(
  fileBase64: string,
  fileName: string,
): Promise<{
  rows: Array<{
    rowNumber: number;
    data: Record<string, string>;
  }>;
}> {
  const { parseContentImportBuffer } = await import(
    "@/lib/content-import/content-import-dry-run.server"
  );

  const buffer = Buffer.from(fileBase64, "base64");
  const parsed = await parseContentImportBuffer(buffer, fileName, "resources");
  return { rows: parsed.rows };
}

function validateInteractiveRow(
  rowNumber: number,
  data: Record<string, string>,
): {
  valid: boolean;
  errors: string[];
  parsed: {
    resource_code: string;
    grade_code: string;
    subject_code: string;
    unit_code: string | null;
    lesson_code: string;
    resource_type: string;
    title_ar: string;
    description_ar: string | null;
    alt_text_ar: string | null;
    package_path: string;
    entry_file: string;
    sort_order: number;
    version_number: number;
    offline_enabled: boolean;
    orientation: string;
    height_mode: string;
    completion_mode: string;
    completion_event: string | null;
    minimum_interaction_seconds: number;
  } | null;
} {
  const errors: string[] = [];

  const resourceCode = (data.resource_code || "").trim();
  const lessonCode = (data.lesson_code || "").trim();
  const resourceType = (data.resource_type || "").trim();
  const titleAr = (data.title_ar || "").trim();
  const packagePath = (data.package_path || resourceCode).trim();

  if (!resourceCode) errors.push("resource_code مطلوب");
  if (!lessonCode) errors.push("lesson_code مطلوب");
  if (!titleAr) errors.push("title_ar مطلوب");
  if (!resourceType) {
    errors.push("resource_type مطلوب");
  } else if (!VALID_RESOURCE_TYPES.has(resourceType)) {
    errors.push(`resource_type غير قانوني: ${resourceType}`);
  }

  const sortOrder = parseInt(data.sort_order || "1", 10);
  const versionNumber = parseInt(data.version || "1", 10);

  if (!Number.isFinite(sortOrder) || sortOrder < 0) {
    errors.push("sort_order غير صالح");
  }
  if (!Number.isFinite(versionNumber) || versionNumber < 1) {
    errors.push("version غير صالح");
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      parsed: null,
    };
  }

  return {
    valid: true,
    errors: [],
    parsed: {
      resource_code: resourceCode,
      grade_code: (data.grade_code || "").trim(),
      subject_code: (data.subject_code || "").trim(),
      unit_code: (data.unit_code || "").trim() || null,
      lesson_code: lessonCode,
      resource_type: resourceType,
      title_ar: titleAr,
      description_ar: (data.description_ar || "").trim() || null,
      alt_text_ar: (data.alt_text_ar || "").trim() || null,
      package_path: packagePath,
      entry_file: (data.entry_file || "index.html").trim(),
      sort_order: sortOrder,
      version_number: versionNumber,
      offline_enabled: (data.offline_enabled || "true").trim().toLowerCase() !== "false",
      orientation: (data.orientation || "auto").trim(),
      height_mode: (data.height_mode || "viewport").trim(),
      completion_mode: (data.completion_mode || "view").trim(),
      completion_event: (data.completion_event || "").trim() || null,
      minimum_interaction_seconds: parseInt(
        data.minimum_interaction_seconds || "0",
        10,
      ),
    },
  };
}

/**
 * Initialize HTML Import — Server Function
 * Parses Excel, validates rows, looks up lessons, creates batch/resources/versions/sessions.
 */
export const initializeHtmlImportFn = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator(
    z.object({
      excelFileBase64: z.string().min(1),
      excelFileName: z.string().min(1),
      packageHashes: z.record(z.string(), z.string()),
    }),
  )
  .handler(async ({ data, context }): Promise<InitializeImportResult> => {
    const workflow = buildWorkflowAdapter();

    const backendEnabled = await workflow.checkFeatureFlag("html_content_backend");
    if (!backendEnabled) {
      throw new Error(
        "Backend pipeline غير مفعّل. يرجى تفعيل html_content_feature_flag أولاً.",
      );
    }

    const uploadEnabled = await workflow.checkFeatureFlag("html_content_upload");
    if (!uploadEnabled) {
      throw new Error(
        "رفع المحتوى غير مفعّل. يرجى تفعيل html_content_upload أولاً.",
      );
    }

    const { rows } = await parseInteractiveExcel(
      data.excelFileBase64,
      data.excelFileName,
    );

    const errors: InitializeImportResult["errors"] = [];
    const warnings: InitializeImportResult["warnings"] = [];
    const validParsed: Array<{
      rowNumber: number;
      parsed: NonNullable<ReturnType<typeof validateInteractiveRow>["parsed"]>;
    }> = [];

    const seenCodes = new Set<string>();
    for (const row of rows) {
      const validation = validateInteractiveRow(row.rowNumber, row.data);
      if (!validation.valid || !validation.parsed) {
        for (const msg of validation.errors) {
          errors.push({
            row_number: row.rowNumber,
            resource_code: row.data.resource_code || "",
            message: msg,
          });
        }
        continue;
      }

      if (seenCodes.has(validation.parsed.resource_code)) {
        errors.push({
          row_number: row.rowNumber,
          resource_code: validation.parsed.resource_code,
          message: `resource_code مكرر: ${validation.parsed.resource_code}`,
        });
        continue;
      }
      seenCodes.add(validation.parsed.resource_code);

      if (!data.packageHashes[validation.parsed.package_path]) {
        errors.push({
          row_number: row.rowNumber,
          resource_code: validation.parsed.resource_code,
          message: `ZIP غير موجود للحزمة: ${validation.parsed.package_path}`,
        });
        continue;
      }

      validParsed.push({ rowNumber: row.rowNumber, parsed: validation.parsed });
    }

    const lessonCodes = [...new Set(validParsed.map((v) => v.parsed.lesson_code))];
    const lessonsMap = await workflow.lookupLessonsByCode(lessonCodes);

    for (const v of validParsed) {
      if (!lessonsMap.has(v.parsed.lesson_code)) {
        errors.push({
          row_number: v.rowNumber,
          resource_code: v.parsed.resource_code,
          message: `lesson غير موجود: ${v.parsed.lesson_code}`,
        });
      }
    }

    const validWithLessons = validParsed.filter((v) =>
      lessonsMap.has(v.parsed.lesson_code),
    );

    if (validWithLessons.length === 0) {
      return {
        batch_id: "",
        resources: [],
        errors,
        warnings,
      };
    }

    const actorId = context.userId;
    const idempotencyKey = `html-import:${actorId}:${Date.now()}`;
    const batchId = await workflow.createImportBatch({ actor_id: actorId, idempotency_key: idempotencyKey });

    const resources: ImportResourceSession[] = [];

    for (const v of validWithLessons) {
      const { parsed } = v;
      const lesson = lessonsMap.get(parsed.lesson_code)!;

      try {
        const resourceId = await workflow.findOrCreateResource({
          lesson_id: lesson.id,
          resource_type: parsed.resource_type,
          title: parsed.title_ar,
          description: parsed.description_ar,
          sort_order: parsed.sort_order,
          resource_code: parsed.resource_code,
        });

        const packageHash = data.packageHashes[parsed.package_path];
        const versionId = await workflow.createResourceVersion({
          resource_id: resourceId,
          version_number: parsed.version_number,
          content_sha256: packageHash,
          manifest: {
            resource_code: parsed.resource_code,
            entry_file: parsed.entry_file,
            version: parsed.version_number,
            resource_type: parsed.resource_type,
            offline_enabled: parsed.offline_enabled,
          },
          created_by: actorId,
        });

        await workflow.setResourceDraftVersion(resourceId, versionId);

        const stagingPath = `html-packages/staging/${actorId}/${batchId}/${resourceId}/package.zip`;
        const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

        const sessionId = await workflow.createUploadSession({
          batch_id: batchId,
          actor_id: actorId,
          resource_id: resourceId,
          resource_code: parsed.resource_code,
          staging_path: stagingPath,
          expected_package_hash: packageHash,
          original_filename: `${parsed.package_path}.zip`,
          expires_at: expiresAt,
        });

        const pipelineDb = buildPipelineDbAdapter();
        const signedResult = await createSignedUploadUrl(
          sessionId,
          pipelineDb,
          defaultSupabaseStorageAdapter,
        );

        resources.push({
          resource_code: parsed.resource_code,
          resource_id: resourceId,
          version_id: versionId,
          upload_session_id: sessionId,
          staging_path: stagingPath,
          expected_package_hash: packageHash,
          signed_upload_url: signedResult.signedUploadUrl,
          upload_token: signedResult.token,
          title_ar: parsed.title_ar,
          lesson_code: parsed.lesson_code,
          lesson_id: lesson.id,
          resource_type: parsed.resource_type,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({
          row_number: v.rowNumber,
          resource_code: parsed.resource_code,
          message: `فشل إنشاء المورد: ${msg}`,
        });
      }
    }

    return { batch_id: batchId, resources, errors, warnings };
  });

/**
 * Finalize HTML Upload — Server Function
 * After client uploads ZIP to signed URL, validates stored bytes.
 */
export const finalizeHtmlUploadFn = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator(
    z.object({
      uploadSessionId: z.string().uuid(),
      resourceVersionId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }): Promise<FinalizeUploadResult> => {
    const workflow = buildWorkflowAdapter();
    const pipelineDb = buildPipelineDbAdapter();

    await workflow.updateUploadSessionStatus(data.uploadSessionId, "uploaded");

    const validationResult = await downloadAndValidateStoredZip(
      data.uploadSessionId,
      data.resourceVersionId,
      pipelineDb,
      defaultSupabaseStorageAdapter,
    );

    const status = validationResult.isValid ? "validated" : "validation_failed";
    await workflow.updateUploadSessionStatus(data.uploadSessionId, status);

    return {
      upload_session_id: data.uploadSessionId,
      status,
      validation_id: validationResult.validationId ?? null,
      is_valid: validationResult.isValid,
      findings: validationResult.findings,
    };
  });

/**
 * Submit HTML Resources for Review — Server Function
 * Transitions resources from draft to in_review.
 */
export const submitHtmlForReviewFn = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator(
    z.object({
      resourceIds: z.array(z.string().uuid()).min(1),
      lockVersions: z.record(z.string().uuid(), z.number().int().min(1)).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ submitted: string[]; errors: string[] }> => {
    const workflow = buildWorkflowAdapter();
    const submitted: string[] = [];
    const errors: string[] = [];

    for (const resourceId of data.resourceIds) {
      try {
        await workflow.submitResourceForReview(
          resourceId,
          data.lockVersions?.[resourceId],
        );
        submitted.push(resourceId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${resourceId}: ${msg}`);
      }
    }

    return { submitted, errors };
  });

/**
 * Get HTML Review Queue — Server Function
 * Returns resources in review/approved/draft states.
 */
export const getHtmlReviewQueueFn = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .handler(async (): Promise<ReviewQueueItem[]> => {
    const workflow = buildWorkflowAdapter();
    const rows = await workflow.getReviewQueue();

    return rows.map((row) => ({
      resource_id: row.resource_id,
      resource_code: row.resource_code,
      resource_type: row.resource_type,
      title: row.title,
      description: row.description,
      lesson_id: row.lesson_id,
      lesson_title: row.lesson_title,
      subject_name: row.subject_name,
      grade_name: row.grade_name,
      lifecycle_status: row.lifecycle_status,
      current_version_id: row.current_draft_version_id,
      version_number: row.version_number,
      content_sha256: row.content_sha256,
      submitted_by: row.submitted_by,
      submitted_at: row.submitted_at,
      security_findings_count: row.findings_count,
      lock_version: row.lock_version,
    }));
  });

/**
 * Approve HTML Resource — Admin-only Server Function
 * Sets approved_version_id and transitions to approved.
 */
export const approveHtmlResourceFn = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator(
    z.object({
      resourceId: z.string().uuid(),
      versionId: z.string().uuid(),
      lockVersion: z.number().int().min(1).optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<ReviewActionResult> => {
    if (!context.isFullAdmin) {
      return {
        resource_id: data.resourceId,
        new_status: "",
        success: false,
        message: "غير مصرح — صلاحيات الإدارة الكاملة مطلوبة للاعتماد.",
      };
    }

    const workflow = buildWorkflowAdapter();

    try {
      await workflow.approveResource(data.resourceId, data.versionId, data.lockVersion);
      return {
        resource_id: data.resourceId,
        new_status: "approved",
        success: true,
        message: "تم اعتماد المورد بنجاح.",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        resource_id: data.resourceId,
        new_status: "",
        success: false,
        message: `فشل اعتماد المورد: ${msg}`,
      };
    }
  });

/**
 * Reject HTML Resource — Admin-only Server Function
 * Transitions to rejected and records review.
 */
export const rejectHtmlResourceFn = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator(
    z.object({
      resourceId: z.string().uuid(),
      versionId: z.string().uuid(),
      reason: z.string().min(1),
      lockVersion: z.number().int().min(1).optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<ReviewActionResult> => {
    if (!context.isFullAdmin) {
      return {
        resource_id: data.resourceId,
        new_status: "",
        success: false,
        message: "غير مصرح — صلاحيات الإدارة الكاملة مطلوبة للرفض.",
      };
    }

    const workflow = buildWorkflowAdapter();

    try {
      await workflow.rejectResource(
        data.resourceId,
        data.versionId,
        context.userId,
        data.reason,
        data.lockVersion,
      );
      return {
        resource_id: data.resourceId,
        new_status: "rejected",
        success: true,
        message: "تم رفض المورد.",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        resource_id: data.resourceId,
        new_status: "",
        success: false,
        message: `فشل رفض المورد: ${msg}`,
      };
    }
  });

/**
 * Publish HTML Resource — Admin-only Server Function
 * Uses existing promoteApprovedPackage for storage pipeline,
 * then confirms published state.
 */
export const publishHtmlResourceFn = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator(
    z.object({
      resourceId: z.string().uuid(),
      resourceVersionId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<ReviewActionResult> => {
    if (!context.isFullAdmin) {
      return {
        resource_id: data.resourceId,
        new_status: "",
        success: false,
        message: "غير مصرح — صلاحيات الإدارة الكاملة مطلوبة للنشر.",
      };
    }

    const pipelineDb = buildPipelineDbAdapter();

    try {
      const result = await promoteApprovedPackage(
        { resourceVersionId: data.resourceVersionId },
        context.userId,
        pipelineDb,
        defaultSupabaseStorageAdapter,
      );

      if (!result.promoted) {
        return {
          resource_id: data.resourceId,
          new_status: "",
          success: false,
          message: `فشل نشر المورد: ${result.errorDetails || "unknown error"}`,
        };
      }

      return {
        resource_id: data.resourceId,
        new_status: "published",
        success: true,
        message: "تم نشر المورد بنجاح.",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        resource_id: data.resourceId,
        new_status: "",
        success: false,
        message: `فشل نشر المورد: ${msg}`,
      };
    }
  });

/**
 * Unpublish HTML Resource — Admin-only Server Function
 */
export const unpublishHtmlResourceFn = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator(
    z.object({
      resourceId: z.string().uuid(),
      lockVersion: z.number().int().min(1).optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<ReviewActionResult> => {
    if (!context.isFullAdmin) {
      return {
        resource_id: data.resourceId,
        new_status: "",
        success: false,
        message: "غير مصرح — صلاحيات الإدارة الكاملة مطلوبة لإلغاء النشر.",
      };
    }

    const workflow = buildWorkflowAdapter();

    try {
      await workflow.unpublishResource(data.resourceId, data.lockVersion);
      return {
        resource_id: data.resourceId,
        new_status: "approved",
        success: true,
        message: "تم إلغاء نشر المورد.",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        resource_id: data.resourceId,
        new_status: "",
        success: false,
        message: `فشل إلغاء النشر: ${msg}`,
      };
    }
  });

/**
 * Rollback HTML Resource — Admin-only Server Function
 */
export const rollbackHtmlResourceFn = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator(
    z.object({
      resourceId: z.string().uuid(),
      targetVersionId: z.string().uuid(),
      lockVersion: z.number().int().min(1).optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<ReviewActionResult> => {
    if (!context.isFullAdmin) {
      return {
        resource_id: data.resourceId,
        new_status: "",
        success: false,
        message: "غير مصرح — صلاحيات الإدارة الكاملة مطلوبة للتراجع.",
      };
    }

    const workflow = buildWorkflowAdapter();

    try {
      await workflow.rollbackResource(data.resourceId, data.targetVersionId, data.lockVersion);
      return {
        resource_id: data.resourceId,
        new_status: "published",
        success: true,
        message: "تم التراجع إلى الإصدار المحدد.",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        resource_id: data.resourceId,
        new_status: "",
        success: false,
        message: `فشل التراجع: ${msg}`,
      };
    }
  });

/**
 * Check HTML Content Feature Flag — Server Function
 */
export const checkHtmlBackendEnabledFn = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .handler(async (): Promise<{ backendEnabled: boolean; uploadEnabled: boolean; publishEnabled: boolean }> => {
    const workflow = buildWorkflowAdapter();
    const [backend, upload, publish] = await Promise.all([
      workflow.checkFeatureFlag("html_content_backend"),
      workflow.checkFeatureFlag("html_content_upload"),
      workflow.checkFeatureFlag("html_content_publish"),
    ]);
    return { backendEnabled: backend, uploadEnabled: upload, publishEnabled: publish };
  });
