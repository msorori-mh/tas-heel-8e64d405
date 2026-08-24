import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireContentStaffAuth,
  type ContentStaffAuthContext,
} from "@/integrations/supabase/auth-middleware";
import { assertImportJobAllowed } from "./import-auth.server";
import { IMPORT_TYPE_STRUCTURE } from "./import-job.types";
import { CONTENT_IMPORT_MAX_FILE_BYTES } from "../content-import/content-import-types";
import { assertAllowedContentImportTemplateKey } from "../content-import/content-import-validators";
import { assertTemplateExecutable } from "./import-execution-state";
import {
  curriculumImportScopeKey,
  type CurriculumImportScope,
} from "./curriculum-import-scope";

const MAX_BASE64_LENGTH = Math.ceil(CONTENT_IMPORT_MAX_FILE_BYTES * 1.37) + 64;

const CurriculumImportScopeInput = z.object({
  gradeSlug: z.string().trim().min(1).max(32),
  trackCodes: z.array(z.string().trim().min(1).max(32)).min(1).max(8),
  semester: z.union([z.literal(1), z.literal(2)]),
  subjectCode: z.string().trim().min(1).max(64),
});

const CreateJobInput = z.object({
  templateKey: z.string().min(1).max(64),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(CONTENT_IMPORT_MAX_FILE_BYTES),
  fileHash: z.string().regex(/^[0-9a-f]{64}$/),
  totalRows: z.number().int().min(0).max(100000),
  validRows: z.number().int().min(0).max(100000),
  warningRows: z.number().int().min(0).max(100000),
  curriculumScope: CurriculumImportScopeInput.optional(),
});

const PrepareInput = z.object({
  jobId: z.string().uuid(),
  templateKey: z.string().min(1).max(64),
  fileName: z.string().min(1).max(255),
  fileBase64: z.string().min(1).max(MAX_BASE64_LENGTH),
  fileSize: z.number().int().positive().max(CONTENT_IMPORT_MAX_FILE_BYTES),
  curriculumScope: CurriculumImportScopeInput.optional(),
});

const ExecuteInput = z.object({
  jobId: z.string().uuid(),
  templateKeys: z.array(z.string().min(1).max(64)).min(1).max(10),
  curriculumScope: CurriculumImportScopeInput.optional(),
});

/**
 * Creates the import_jobs row the prepare/execute steps operate on.
 * Zero domain writes; the operator's own JWT is used under RLS.
 */
export const createContentImportJob = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => CreateJobInput.parse(input))
  .handler(async ({ data, context }): Promise<{ jobId: string }> => {
    const { supabase, userId, isFullAdmin } = context as ContentStaffAuthContext;
    assertImportJobAllowed(IMPORT_TYPE_STRUCTURE, isFullAdmin);

    const templateKey = assertAllowedContentImportTemplateKey(data.templateKey);
    assertTemplateExecutable(templateKey);

    let curriculumScope: CurriculumImportScope | undefined;
    if (templateKey === "units" || templateKey === "lessons") {
      if (!data.curriculumScope) {
        throw new Error("IMPORT_SCOPE_REQUIRED: اختر الصف والمسار والفصل والمادة قبل رفع الملف.");
      }
      const { resolveCurriculumImportScope } = await import("./curriculum-import-scope.server");
      curriculumScope = await resolveCurriculumImportScope(supabase, data.curriculumScope);
    }

    const { createContentImportExecutionJob } = await import("./import-job-create.server");
    return createContentImportExecutionJob(supabase, userId, {
      templateKey,
      fileName: data.fileName,
      fileSize: data.fileSize,
      fileHash: data.fileHash,
      totalRows: data.totalRows,
      validRows: data.validRows,
      warningRows: data.warningRows,
      curriculumScope,
    });
  });


export interface PrepareStagingResult {
  jobId: string;
  templateKey: string;
  stagedRows: number;
  ok: boolean;
  errors: Array<{ rowNumber: number | null; message: string }>;
}

/**
 * prepare/stage — re-parses and re-validates the file server-side, then writes
 * ONLY import_staging_rows through the RPC. No domain write happens here.
 */
export const prepareContentImportStaging = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => PrepareInput.parse(input))
  .handler(async ({ data, context }): Promise<PrepareStagingResult> => {
    const { supabase, isFullAdmin } = context as ContentStaffAuthContext;
    assertImportJobAllowed(IMPORT_TYPE_STRUCTURE, isFullAdmin);

    const templateKey = assertAllowedContentImportTemplateKey(data.templateKey);
    assertTemplateExecutable(templateKey);

    if (!data.fileName.toLowerCase().endsWith(".xlsx")) {
      throw new Error("يُقبل ملف Excel بصيغة .xlsx فقط.");
    }

    const buffer = Buffer.from(data.fileBase64, "base64");
    if (buffer.length !== data.fileSize) {
      throw new Error("حجم الملف المرفوع لا يطابق المحتوى الفعلي.");
    }

    const { parseContentImportBuffer } = await import(
      "../content-import/content-import-dry-run.server"
    );
    const parsed = await parseContentImportBuffer(buffer, data.fileName, templateKey);

    const { validateContentImportSheet } = await import(
      "../content-import/content-import-validators"
    );
    const report = validateContentImportSheet(templateKey, parsed);

    if (!report.ok) {
      return {
        jobId: data.jobId,
        templateKey,
        stagedRows: 0,
        ok: false,
        errors: report.errors.map((e) => ({ rowNumber: e.rowNumber, message: e.message })),
      };
    }

    let scopedParsed = parsed;
    if (templateKey === "units" || templateKey === "lessons") {
      if (!data.curriculumScope) {
        throw new Error("IMPORT_SCOPE_REQUIRED: اختر الصف والمسار والفصل والمادة قبل رفع الملف.");
      }
      const {
        applyCurriculumImportScopeToRows,
        resolveCurriculumImportScope,
      } = await import("./curriculum-import-scope.server");
      const resolvedScope = await resolveCurriculumImportScope(supabase, data.curriculumScope);
      scopedParsed = {
        ...parsed,
        rows: applyCurriculumImportScopeToRows(parsed.rows, resolvedScope),
      };
    }

    const { buildStagingRows, stageContentImportRows } = await import("./import-staging.server");
    const rows = buildStagingRows(templateKey, scopedParsed, templateKey);
    const { stagedRows } = await stageContentImportRows(supabase, data.jobId, templateKey, rows);

    return { jobId: data.jobId, templateKey, stagedRows, ok: true, errors: [] };
  });

export interface ExecuteImportResult {
  jobId: string;
  ok: boolean;
  failedTemplate: string | null;
  error: string | null;
  results: Array<{
    templateKey: string;
    inserted: number;
    updated: number;
    skipped: number;
    blockedPublished: number;
  }>;
}

/**
 * execute — applies staged templates. Each template is one database transaction;
 * a failure rolls that template back completely and aborts the remaining ones.
 */
export const runContentImportExecute = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => ExecuteInput.parse(input))
  .handler(async ({ data, context }): Promise<ExecuteImportResult> => {
    const { supabase, isFullAdmin } = context as ContentStaffAuthContext;
    assertImportJobAllowed(IMPORT_TYPE_STRUCTURE, isFullAdmin);

    const templateKeys = data.templateKeys.map((k) => assertAllowedContentImportTemplateKey(k));
    for (const key of templateKeys) assertTemplateExecutable(key);

    if (templateKeys.some((key) => key === "units" || key === "lessons")) {
      if (!data.curriculumScope) {
        throw new Error("IMPORT_SCOPE_REQUIRED: اختر الصف والمسار والفصل والمادة قبل رفع الملف.");
      }
      const { resolveCurriculumImportScope } = await import("./curriculum-import-scope.server");
      const resolvedScope = await resolveCurriculumImportScope(supabase, data.curriculumScope);
      const { data: job, error: jobError } = await supabase
        .from("import_jobs")
        .select("metadata")
        .eq("id", data.jobId)
        .maybeSingle();
      if (jobError || !job) {
        throw new Error("IMPORT_JOB_NOT_FOUND");
      }
      const savedScope = (job.metadata as Record<string, unknown> | null)?.curriculumImportScope;
      if (
        curriculumImportScopeKey(savedScope as CurriculumImportScope | null) !==
        curriculumImportScopeKey(resolvedScope)
      ) {
        throw new Error("IMPORT_SCOPE_CHANGED_AFTER_PREPARE");
      }
    }

    const { executeContentImport } = await import("./import-staging.server");
    const outcome = await executeContentImport(supabase, data.jobId, templateKeys);

    return {
      jobId: data.jobId,
      ok: outcome.error === null,
      failedTemplate: outcome.failedTemplate,
      error: outcome.error,
      results: outcome.results,
    };
  });
