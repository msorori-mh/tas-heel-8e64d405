import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireContentStaffAuth,
  requireSupabaseAuth,
} from "@/integrations/supabase/auth-middleware";
import {
  createUploadSession,
  createSignedUploadUrl,
  finalizeUploadedObject,
  downloadAndValidateStoredZip,
  promoteApprovedPackage,
  createSignedStudentAccessUrl,
  cleanupOrCompensate,
} from "@/lib/server/html-pipeline/html-pipeline-service";

/**
 * 1. Create Upload Session Server Function
 */
export const createHtmlUploadSessionFn = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator(
    z.object({
      batchId: z.string().min(1),
      resourceCode: z.string().min(3).max(100),
      filename: z.string().min(1).max(255),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    return createUploadSession(userId, {
      batchId: data.batchId,
      resourceCode: data.resourceCode,
      filename: data.filename,
    });
  });

/**
 * 2. Create Signed Upload URL Server Function
 */
export const createHtmlSignedUploadUrlFn = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator(
    z.object({
      stagingPath: z.string().min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    return createSignedUploadUrl(userId, data.stagingPath);
  });

/**
 * 3. Finalize Uploaded Object Server Function
 */
export const finalizeHtmlUploadFn = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator(
    z.object({
      stagingPath: z.string().min(1),
    }),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    return finalizeUploadedObject(userId, data.stagingPath);
  });

/**
 * 4. Download & Validate Stored ZIP Server Function
 */
export const validateStoredHtmlZipFn = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator(
    z.object({
      stagingPath: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    return downloadAndValidateStoredZip(data.stagingPath);
  });

/**
 * 5. Promote Approved Package Server Function
 */
export const promoteHtmlPackageFn = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator(
    z.object({
      stagingPath: z.string().min(1),
      resourceCode: z.string().min(3).max(100),
      versionNumber: z.number().int().positive(),
      expectedContentSha256: z.string().length(64),
      idempotencyKey: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    return promoteApprovedPackage({
      stagingPath: data.stagingPath,
      resourceCode: data.resourceCode,
      versionNumber: data.versionNumber,
      expectedContentSha256: data.expectedContentSha256,
      idempotencyKey: data.idempotencyKey,
    });
  });

/**
 * 6. Create Student Signed Access URL Server Function
 */
export const createSignedStudentAccessUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      lessonId: z.string().uuid(),
      resourceId: z.string().uuid(),
      publishedVersionId: z.string().uuid(),
      status: z.string().min(1),
      publishedPath: z.string().min(1),
      signedUrlTtlSeconds: z.number().int().positive().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Check student lesson access using RPC
    const { data: allowed, error: rpcErr } = await supabase.rpc(
      "can_access_lesson",
      { _lesson_id: data.lessonId },
    );

    if (rpcErr || !allowed) {
      return {
        granted: false,
        reason: "الطالب ليس لديه صلاحية الوصول لهذا الدرس",
      };
    }

    return createSignedStudentAccessUrl(
      {
        lessonId: data.lessonId,
        resourceId: data.resourceId,
        publishedVersionId: data.publishedVersionId,
        status: data.status,
        publishedPath: data.publishedPath,
        signedUrlTtlSeconds: data.signedUrlTtlSeconds ?? 900,
      },
      true,
    );
  });

/**
 * 7. Compensate Partial Operations Server Function
 */
export const compensateHtmlPipelineFn = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator(
    z.object({
      operationType: z.enum(["promote_published", "upload_staging"]),
      stagingPath: z.string().optional(),
      publishedPath: z.string().optional(),
      idempotencyKey: z.string().optional(),
      reason: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    return cleanupOrCompensate({
      operationType: data.operationType,
      stagingPath: data.stagingPath,
      publishedPath: data.publishedPath,
      idempotencyKey: data.idempotencyKey,
      reason: data.reason,
    });
  });
