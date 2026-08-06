import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireAdminAuth,
  requireContentStaffAuth,
  requireSupabaseAuth,
} from "@/integrations/supabase/auth-middleware";
import { HtmlPipelineService } from "@/lib/server/html-pipeline/html-pipeline.service";

const sha256HexSchema = z
  .string()
  .regex(/^[a-fA-F0-9]{64}$/, "Hash must be valid 64-character hex SHA-256 string");

export const createUploadSessionFn = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator(
    z.object({
      batchId: z.string().uuid().optional(),
      resourceId: z.string().uuid(),
      originalFilename: z.string().min(1).max(255),
      expectedPackageHash: sha256HexSchema,
      resourceCode: z.string().min(1).max(100).optional(),
      idempotencyKey: z.string().min(1).max(255).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const service = new HtmlPipelineService({ supabaseClient: context.supabase });
    return await service.createUploadSession(context.userId, data);
  });

export const finalizeUploadSessionFn = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator(
    z.object({
      uploadSessionId: z.string().uuid(),
      idempotencyKey: z.string().min(1).max(255).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const service = new HtmlPipelineService({ supabaseClient: context.supabase });
    return await service.finalizeUploadSession(context.userId, data);
  });

export const validateStoredPackageFn = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator(
    z.object({
      uploadSessionId: z.string().uuid(),
      resourceVersionId: z.string().uuid().optional(),
      idempotencyKey: z.string().min(1).max(255).optional(),
    })
  )
  .handler(async ({ data, context }) => {
    const service = new HtmlPipelineService({ supabaseClient: context.supabase });
    return await service.validateStoredPackage(context.userId, data);
  });

export const promoteVersionFn = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator(
    z.object({
      uploadSessionId: z.string().uuid().optional(),
      resourceVersionId: z.string().uuid().optional(),
      idempotencyKey: z.string().min(1).max(255).optional(),
    }).refine((v) => Boolean(v.uploadSessionId || v.resourceVersionId), {
      message: "Must provide either uploadSessionId or resourceVersionId",
    })
  )
  .handler(async ({ data, context }) => {
    const service = new HtmlPipelineService({ supabaseClient: context.supabase });
    return await service.promoteVersion(context.userId, data);
  });

export const getStudentResourceAccessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      resourceId: z.string().uuid(),
    })
  )
  .handler(async ({ data, context }) => {
    const service = new HtmlPipelineService({ supabaseClient: context.supabase });
    return await service.getStudentSignedAccess(data);
  });
