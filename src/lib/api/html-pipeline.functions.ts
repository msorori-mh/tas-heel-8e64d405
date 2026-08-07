import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireAdminAuth,
  requireContentStaffAuth,
  requireSupabaseAuth,
} from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createSupabaseDbAdapter } from "@/lib/server/html-pipeline/db-adapter";
import {
  createSignedUploadUrl,
  downloadAndValidateStoredZip,
  promoteApprovedPackage,
  createSignedStudentAccessUrl,
  cleanupOrCompensate,
} from "@/lib/server/html-pipeline/html-pipeline-service";

/**
 * Build a DB adapter with explicit user-scoped and service-role clients.
 * The service-role client never reaches the browser bundle.
 */
function buildDbAdapter(context: { supabase: typeof supabaseAdmin }) {
  return createSupabaseDbAdapter({
    userClient: context.supabase,
    adminClient: supabaseAdmin,
  });
}

/**
 * 1. Create Signed Upload URL Server Function
 * Bound to authoritative upload session from DB.
 */
export const createHtmlSignedUploadUrlFn = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator(
    z.object({
      uploadSessionId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    const dbAdapter = buildDbAdapter(context);
    return createSignedUploadUrl(data.uploadSessionId, dbAdapter);
  });

/**
 * 2. Download & Validate Stored ZIP Server Function
 * Scans raw bytes downloaded from DB-authoritative staging path.
 */
export const validateStoredHtmlZipFn = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator(
    z.object({
      uploadSessionId: z.string().uuid(),
      resourceVersionId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const dbAdapter = buildDbAdapter(context);
    return downloadAndValidateStoredZip(data.uploadSessionId, data.resourceVersionId, dbAdapter);
  });

/**
 * 3. Promote Approved Package Server Function (Admin-Only)
 * Requires admin role; content_manager is explicitly denied.
 */
export const promoteHtmlPackageFn = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator(
    z.object({
      uploadSessionId: z.string().uuid().optional(),
      resourceVersionId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!context.isFullAdmin) {
      throw new Error("غير مصرح — صلاحيات الإدارة الكاملة مطلوبة لتنفيذ الترقية للنشر");
    }
    const dbAdapter = buildDbAdapter(context);
    return promoteApprovedPackage(data, context.userId, dbAdapter);
  });

/**
 * 4. Create Student Signed Access URL Server Function
 * Bound to authoritative published resource binding from DB.
 */
export const createSignedStudentAccessUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      resourceId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    const dbAdapter = buildDbAdapter(context);
    return createSignedStudentAccessUrl({ resourceId: data.resourceId }, dbAdapter);
  });

/**
 * 5. Compensate Partial Operations Server Function (Admin-Only)
 * Accepts only the authoritative storage_operation_id from the client.
 */
export const compensateHtmlPipelineFn = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator(
    z.object({
      storageOperationId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    const dbAdapter = buildDbAdapter(context);
    return cleanupOrCompensate(data, dbAdapter);
  });
