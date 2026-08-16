import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getLessonPrimaryPdfState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lessonId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/lessons/lesson-pdf-upload.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await m.assertContentStaff(context.supabase as never, context.userId);
    return { primary: await m.loadPrimaryPdf(supabaseAdmin as never, data.lessonId) };
  });

/** 18E1 — allows RETRY_BIND_EXISTING_OBJECT without re-uploading bytes. */
export const findUploadedLessonPdfObject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lessonId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/lessons/lesson-pdf-upload.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await m.assertContentStaff(context.supabase as never, context.userId);
    return m.findUploadedLessonPdf(supabaseAdmin as never, data.lessonId);
  });

export const createLessonPdfUploadTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      lessonId: z.string().uuid(),
      fileName: z.string().min(1).max(300),
      fileSize: z.number().int().positive(),
    }),
  )
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/lessons/lesson-pdf-upload.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await m.assertContentStaff(context.supabase as never, context.userId);
    return m.createUploadTarget(
      supabaseAdmin as never,
      data.lessonId,
      data.fileName,
      data.fileSize,
    );
  });

export const bindLessonPrimaryPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      lessonId: z.string().uuid(),
      path: z.string().min(1).max(500),
      fileName: z.string().min(1).max(300),
      fileSize: z.number().int().positive(),
      title: z.string().max(200).optional().nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/lessons/lesson-pdf-upload.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await m.assertContentStaff(context.supabase as never, context.userId);
    return m.bindPrimaryPdf(supabaseAdmin as never, context.supabase as never, data.lessonId, {
      path: data.path,
      fileName: data.fileName,
      fileSize: data.fileSize,
      title: data.title ?? null,
    });
  });

export const deleteLessonPrimaryPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ lessonId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/lessons/lesson-pdf-upload.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await m.assertContentStaff(context.supabase as never, context.userId);
    return m.deletePrimaryPdf(supabaseAdmin as never, context.supabase as never, data.lessonId);
  });

export const planSubjectPdfBulkUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      subjectId: z.string().uuid(),
      files: z
        .array(
          z.object({
            name: z.string().min(1).max(300),
            size: z.number().int().nonnegative(),
            type: z.string().max(200).optional().nullable(),
          }),
        )
        .max(500),
    }),
  )
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/lessons/lesson-pdf-upload.server");
    const p = await import("@/lib/lessons/lesson-pdf-bulk.server");
    await m.assertContentStaff(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return p.planSubjectBulk(supabaseAdmin as never, data.subjectId, data.files);
  });
