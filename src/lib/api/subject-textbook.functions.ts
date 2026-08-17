/** 21B — subject textbook server functions (content staff only). */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listSubjectTextbooksAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ subjectId: z.string().uuid(), includeInactive: z.boolean().optional() }))
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/textbooks/subject-textbook.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await m.assertContentStaff(context.supabase as never, context.userId);
    return {
      textbooks: await m.listSubjectTextbooks(supabaseAdmin as never, {
        subjectId: data.subjectId,
        includeInactive: data.includeInactive ?? true,
      }),
    };
  });

export const createSubjectTextbookUploadTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      subjectId: z.string().uuid(),
      fileName: z.string().min(1).max(300),
      fileSize: z.number().int().positive(),
    }),
  )
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/textbooks/subject-textbook.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await m.assertContentStaff(context.supabase as never, context.userId);
    return m.createTextbookUploadTarget(
      supabaseAdmin as never,
      data.subjectId,
      data.fileName,
      data.fileSize,
    );
  });

export const bindSubjectTextbookFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      subjectId: z.string().uuid(),
      curriculumTrackId: z.string().uuid().nullable(),
      title: z.string().min(1).max(200),
      path: z.string().min(1).max(500),
      fileName: z.string().min(1).max(300),
      fileSize: z.number().int().positive(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
      replaceId: z.string().uuid().nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/textbooks/subject-textbook.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await m.assertContentStaff(context.supabase as never, context.userId);
    return m.bindSubjectTextbook(supabaseAdmin as never, context.userId, {
      subjectId: data.subjectId,
      curriculumTrackId: data.curriculumTrackId,
      title: data.title,
      path: data.path,
      fileName: data.fileName,
      fileSize: data.fileSize,
      sha256: data.sha256,
      replaceId: data.replaceId ?? null,
    });
  });

export const cloneSubjectTextbookForTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ textbookId: z.string().uuid(), curriculumTrackId: z.string().uuid().nullable() }),
  )
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/textbooks/subject-textbook.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await m.assertContentStaff(context.supabase as never, context.userId);
    return m.cloneTextbookForTrack(supabaseAdmin as never, context.userId, data);
  });

export const setSubjectTextbookActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ textbookId: z.string().uuid(), isActive: z.boolean() }))
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/textbooks/subject-textbook.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await m.assertContentStaff(context.supabase as never, context.userId);
    return m.setTextbookActive(supabaseAdmin as never, data.textbookId, data.isActive);
  });

export const deleteSubjectTextbook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ textbookId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const m = await import("@/lib/textbooks/subject-textbook.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await m.assertContentStaff(context.supabase as never, context.userId);
    return m.deleteTextbook(supabaseAdmin as never, data.textbookId);
  });
