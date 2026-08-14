/**
 * OFFICIAL_CONTENT_CODE_SYSTEM_13B — server functions (read-only).
 *
 * Thin wrappers only: every runtime helper lives in a .server module.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireContentStaffAuth } from "@/integrations/supabase/auth-middleware";
import {
  CONTEXT_TEMPLATE_KEYS,
  type ContentCodeRegistry,
  type ContextTemplateResponse,
} from "./content-codes.types";

const ContextTemplateInput = z.object({
  templateKey: z.enum(CONTEXT_TEMPLATE_KEYS),
  gradeSlug: z.string().min(1).max(32),
  trackCodes: z.array(z.string().min(1).max(32)).max(8).default([]),
  subjectCode: z.string().max(64).optional(),
  unitCode: z.string().max(64).optional(),
  rowCount: z.number().int().min(1).max(200).default(20),
});

/** Master data + already-allocated codes, for the admin code-registry UI. */
export const getContentCodeRegistry = createServerFn({ method: "GET" })
  .middleware([requireContentStaffAuth])
  .handler(async ({ context }): Promise<ContentCodeRegistry> => {
    const { loadContentCodeRegistry } = await import("./content-code-registry.server");
    return loadContentCodeRegistry(context.supabase);
  });

/** Context-aware template with system-owned codes already filled in. */
export const downloadContextualTemplate = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => ContextTemplateInput.parse(input))
  .handler(async ({ data, context }): Promise<ContextTemplateResponse> => {
    const { loadContentCodeRegistry, loadQuestionCodes, loadLessonChildCodes } = await import(
      "./content-code-registry.server"
    );
    const { buildContextualTemplate } = await import("./contextual-template.server");

    const registry = await loadContentCodeRegistry(context.supabase);

    let extraExistingCodes: string[] = [];
    if (data.templateKey === "questions") {
      extraExistingCodes = await loadQuestionCodes(context.supabase);
    } else if (
      data.templateKey === "explanations" ||
      data.templateKey === "resources" ||
      data.templateKey === "assessments"
    ) {
      extraExistingCodes = await loadLessonChildCodes(context.supabase, data.templateKey);
    }

    return buildContextualTemplate({ ...data, registry, extraExistingCodes });
  });
