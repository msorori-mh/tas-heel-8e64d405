/**
 * ADMIN_IMPORT_PREPARE_EXECUTE_WIRING_06 — execution job creation (server-only).
 *
 * Creates the import_jobs row that prepare/execute operate on. The row is
 * written with the operator's own JWT under RLS — never service_role.
 * No domain content is touched here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { IMPORT_TYPE_STRUCTURE } from "./import-job.types";
import type { ContentStructureImportScope } from "./curriculum-import-scope";

export interface CreateExecutionJobInput {
  templateKey: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  totalRows: number;
  validRows: number;
  warningRows: number;
  curriculumScope?: ContentStructureImportScope;
}

export async function createContentImportExecutionJob(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: CreateExecutionJobInput,
): Promise<{ jobId: string }> {
  const metadata: Json = {
    fileName: input.fileName,
    fileSize: input.fileSize,
    fileHash: input.fileHash,
    templateKey: input.templateKey,
    source: "admin_import_hub",
    noExecute: false,
    ...(input.curriculumScope
      ? {
          curriculumImportScope: {
            gradeSlug: input.curriculumScope.gradeSlug,
            trackCodes: input.curriculumScope.trackCodes,
            ...("subjectCode" in input.curriculumScope
              ? {
                  semester: input.curriculumScope.semester,
                  subjectCode: input.curriculumScope.subjectCode,
                }
              : {}),
          },
        }
      : {}),
  };

  const { data, error } = await supabase
    .from("import_jobs")
    .insert({
      created_by: userId,
      import_type: IMPORT_TYPE_STRUCTURE,
      template_key: input.templateKey,
      original_filename: input.fileName,
      file_size_bytes: input.fileSize,
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      status: "validated",
      mode: "execute",
      total_rows: input.totalRows,
      valid_rows: input.validRows,
      invalid_rows: 0,
      warning_rows: input.warningRows,
      started_at: new Date().toISOString(),
      summary: {},
      metadata,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`تعذر إنشاء عملية الاستيراد: ${error?.message ?? "خطأ غير معروف"}`);
  }

  return { jobId: data.id };
}
