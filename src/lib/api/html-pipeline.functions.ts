import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireAdminAuth,
  requireContentStaffAuth,
  requireSupabaseAuth,
} from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createSupabaseDbAdapter,
  type PublishedHtmlResourceRow,
} from "@/lib/server/html-pipeline/db-adapter";
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
 * Input schema: resourceId is the sole identifier.
 */
export const signedStudentAccessInputSchema = z.object({
  resourceId: z.string().uuid(),
});

export const createSignedStudentAccessUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(signedStudentAccessInputSchema)
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

/**
 * 6. Get Published HTML Resources for a Lesson (Student)
 * Returns published HTML resources with short-lived signed access URLs.
 * Each resource is individually authorized via resolveStudentResourceBinding.
 */
export interface LessonHtmlResourceItem {
  resourceId: string;
  resourceType:
    | "mind_map_html"
    | "practical_experiment_html"
    | "summary_html"
    | "concepts_and_terms_html"
    | "equations_and_laws_html"
    | "interactive_activity_html";
  title: string;
  resourceCode: string;
  version: number;
  signedUrl: string;
  expiresInSeconds: number;
}

export const getLessonPublishedHtmlResourcesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      lessonId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }): Promise<{ resources: LessonHtmlResourceItem[] }> => {
    const dbAdapter = buildDbAdapter(context);

    const rows: PublishedHtmlResourceRow[] =
      await dbAdapter.listLessonPublishedHtmlResources(data.lessonId);

    const resources: LessonHtmlResourceItem[] = [];

    for (const row of rows) {
      try {
        const binding = await dbAdapter.resolveStudentResourceBinding(row.id);
        const access = await createSignedStudentAccessUrl(
          { resourceId: row.id },
          dbAdapter,
        );

        if (access.granted && access.signedUrl) {
          resources.push({
            resourceId: row.id,
            resourceType: binding.resource_type,
            title: binding.title,
            resourceCode: row.resource_code || row.id,
            version: binding.published_version_number,
            signedUrl: access.signedUrl,
            expiresInSeconds: access.expiresInSeconds ?? 900,
          });
        }
      } catch {
        // Resource not published or student not authorized — skip silently
      }
    }

    return { resources };
  });

/**
 * Production helper: request a fresh signed URL for a published HTML resource.
 * Used by the lesson route for reload and by tests to verify the real wiring.
 * The caller is the server function handle returned by useServerFn.
 */
export async function requestFreshStudentHtmlSignedUrl(
  callServerFn: (args: { data: { resourceId: string } }) => Promise<{ signedUrl?: string } | null | undefined>,
  resourceId: string,
): Promise<string | null> {
  const result = await callServerFn({ data: { resourceId } });
  return result?.signedUrl ?? null;
}
