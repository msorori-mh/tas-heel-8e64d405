import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireContentStaffAuth } from "@/integrations/supabase/auth-middleware";
import {
  CONTENT_IMPORT_MAX_FILE_BYTES,
  type ContentImportDryRunReport,
} from "./content-import-types";
import {
  assertAllowedContentImportTemplateKey,
  validateContentImportSheet,
} from "./content-import-validators";
import { getContentImportTemplateByKey } from "./content-import-templates";

const MAX_BASE64_LENGTH =
  Math.ceil(CONTENT_IMPORT_MAX_FILE_BYTES * 1.37) + 64;

const ContentDryRunInput = z.object({
  templateKey: z.string().min(1).max(64),
  fileName: z.string().min(1).max(255),
  fileBase64: z.string().min(1).max(MAX_BASE64_LENGTH),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(CONTENT_IMPORT_MAX_FILE_BYTES),
});

/**
 * Server-side dry-run for lesson content templates 01–09.
 * Parse + validate only — no DB writes, no import execution.
 */
export const dryRunContentImport = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => ContentDryRunInput.parse(input))
  .handler(async ({ data }): Promise<ContentImportDryRunReport> => {
    const templateKey = assertAllowedContentImportTemplateKey(data.templateKey);
    const template = getContentImportTemplateByKey(templateKey);

    const lowerName = data.fileName.toLowerCase();
    if (!lowerName.endsWith(".xlsx")) {
      throw new Error("يُقبل ملف Excel بصيغة .xlsx فقط.");
    }

    const buffer = Buffer.from(data.fileBase64, "base64");
    if (buffer.length > CONTENT_IMPORT_MAX_FILE_BYTES) {
      throw new Error(
        `حجم الملف يتجاوز الحد المسموح (${CONTENT_IMPORT_MAX_FILE_BYTES / (1024 * 1024)} MB).`,
      );
    }

    if (buffer.length !== data.fileSize) {
      throw new Error("حجم الملف المرفوع لا يطابق المحتوى الفعلي.");
    }

    const { parseContentImportBuffer } = await import(
      "./content-import-dry-run.server"
    );
    const parsed = await parseContentImportBuffer(
      buffer,
      data.fileName,
      templateKey,
    );

    const report = validateContentImportSheet(templateKey, parsed);
    return {
      ...report,
      filename: data.fileName,
      templateKey: template.key,
    };
  });
