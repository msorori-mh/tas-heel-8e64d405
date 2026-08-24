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
import type { CurriculumImportScope } from "@/lib/import/curriculum-import-scope";

const MAX_BASE64_LENGTH =
  Math.ceil(CONTENT_IMPORT_MAX_FILE_BYTES * 1.37) + 64;

const CurriculumImportScopeInput = z.object({
  gradeSlug: z.string().trim().min(1).max(32),
  trackCodes: z.array(z.string().trim().min(1).max(32)).min(1).max(8),
  semester: z.union([z.literal(1), z.literal(2)]),
  subjectCode: z.string().trim().min(1).max(64),
});

const ContentDryRunInput = z.object({
  templateKey: z.string().min(1).max(64),
  fileName: z.string().min(1).max(255),
  fileBase64: z.string().min(1).max(MAX_BASE64_LENGTH),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(CONTENT_IMPORT_MAX_FILE_BYTES),
  curriculumScope: CurriculumImportScopeInput.optional(),
});

/**
 * Server-side dry-run for lesson content templates 01–09.
 * Parse + validate only — no DB writes, no import execution.
 */
export const dryRunContentImport = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => ContentDryRunInput.parse(input))
  .handler(async ({ data, context }): Promise<ContentImportDryRunReport> => {
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
    if (templateKey !== "units" && templateKey !== "lessons") {
      return {
        ...report,
        filename: data.fileName,
        templateKey: template.key,
      };
    }

    if (!data.curriculumScope) {
      throw new Error("IMPORT_SCOPE_REQUIRED: اختر الصف والمسار والفصل والمادة قبل رفع الملف.");
    }
    const { resolveCurriculumImportScope } = await import(
      "@/lib/import/curriculum-import-scope.server"
    );
    const resolved = await resolveCurriculumImportScope(
      context.supabase,
      data.curriculumScope as CurriculumImportScope,
    );
    const workbookCodes = [
      ...new Set(
        parsed.rows
          .map((row) => row.data.subject_code?.trim())
          .filter((code): code is string => Boolean(code)),
      ),
    ];
    const differs = workbookCodes.some(
      (code) => code.toLowerCase() !== resolved.subjectCode.toLowerCase(),
    );
    const scopeWarning = differs
      ? [{
          rowNumber: null,
          column: "subject_code",
          code: "SUBJECT_CODE_OVERRIDDEN_BY_SCOPE",
          message:
            `سيُربط الملف بالمادة المختارة ${resolved.subjectName} (${resolved.subjectCode}) بدل كود Excel: ${workbookCodes.join("، ")}.`,
        }]
      : [];

    return {
      ...report,
      status: scopeWarning.length > 0 || report.warningCount > 0 ? "warn" : report.status,
      warningCount: report.warningCount + scopeWarning.length,
      warnings: [...report.warnings, ...scopeWarning],
      previewRows: report.previewRows.map((row) => ({
        ...row,
        subject_code: resolved.subjectCode,
        semester: String(resolved.semester),
      })),
      filename: data.fileName,
      templateKey: template.key,
    };
  });
