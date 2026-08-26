/**
 * Persist governorates dry-run to import_jobs / import_errors (server-only).
 * Uses admin JWT + RLS — no service_role.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  DRY_RUN_METADATA_VERSION,
  GOVERNORATES_IMPORT_TEMPLATE_KEY,
  IMPORT_ERROR_SEVERITY_ERROR,
  IMPORT_JOB_MODE_DRY_RUN,
  IMPORT_JOB_STATUS_VALIDATED,
  IMPORT_JOB_STATUS_VALIDATION_FAILED,
  IMPORT_TYPE_STRUCTURE,
  type ImportJobStatus,
} from "./import-job.types";
import {
  computeGovernorateDryRunCounts,
  GOVERNORATES_SHEET_NAME,
  sanitizeGovernorateRowData,
  type GovernoratesDryRunParseResult,
} from "./governorates-dry-run.shared";

export async function persistGovernoratesDryRun(
  supabase: SupabaseClient<Database>,
  userId: string,
  parsed: GovernoratesDryRunParseResult,
  fileSize: number,
): Promise<{ jobId: string; jobStatus: ImportJobStatus }> {
  const counts = computeGovernorateDryRunCounts(parsed, parsed.issues);
  const jobStatus: ImportJobStatus =
    parsed.issues.length === 0 ? IMPORT_JOB_STATUS_VALIDATED : IMPORT_JOB_STATUS_VALIDATION_FAILED;
  const now = new Date().toISOString();
  const errorCount = parsed.issues.filter((i) => i.code !== "EMPTY_FILE").length;

  const { data: job, error: jobError } = await supabase
    .from("import_jobs")
    .insert({
      created_by: userId,
      import_type: IMPORT_TYPE_STRUCTURE,
      template_key: GOVERNORATES_IMPORT_TEMPLATE_KEY,
      original_filename: parsed.fileName,
      file_size_bytes: fileSize,
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      status: jobStatus,
      mode: IMPORT_JOB_MODE_DRY_RUN,
      total_rows: counts.totalRows,
      valid_rows: counts.validRows,
      invalid_rows: counts.invalidRows,
      warning_rows: counts.warningRows,
      inserted_count: 0,
      updated_count: 0,
      skipped_count: 0,
      started_at: now,
      completed_at: now,
      summary: {
        errorCount,
        detectedColumns: parsed.columns,
        previewRowCount: parsed.previewRows.length,
      },
      metadata: {
        fileName: parsed.fileName,
        fileSize,
        detectedColumns: parsed.columns,
        templateKey: GOVERNORATES_IMPORT_TEMPLATE_KEY,
        source: "admin_import_hub",
        dryRunVersion: DRY_RUN_METADATA_VERSION,
        noExecute: true,
      },
    })
    .select("id")
    .single();

  if (jobError || !job) {
    throw new Error(`تعذر حفظ سجل المعاينة الجافة: ${jobError?.message ?? "خطأ غير معروف"}`);
  }

  if (parsed.issues.length > 0) {
    const rowByNumber = new Map(parsed.rows.map((r) => [r.rowNumber, r]));
    const errorRows = parsed.issues.map((issue) => ({
      job_id: job.id,
      sheet_name: GOVERNORATES_SHEET_NAME,
      row_number: issue.row ?? null,
      field_name: issue.field ?? null,
      column_name: issue.field ?? null,
      error_code: issue.code,
      message: issue.message,
      severity: IMPORT_ERROR_SEVERITY_ERROR,
      row_data: sanitizeGovernorateRowData(
        issue.row != null ? rowByNumber.get(issue.row) : undefined,
      ),
      metadata: {},
    }));

    const { error: errorsError } = await supabase.from("import_errors").insert(errorRows);

    if (errorsError) {
      throw new Error(`تعذر حفظ أخطاء المعاينة: ${errorsError.message}`);
    }
  }

  return { jobId: job.id, jobStatus };
}
