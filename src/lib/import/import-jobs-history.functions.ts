import { createServerFn } from "@tanstack/react-start";
import {
  requireContentStaffAuth,
  type ContentStaffAuthContext,
} from "@/integrations/supabase/auth-middleware";
import {
  pickBlockedPublishedCount,
  pickSafeJobMetadata,
  type ImportJobHistoryItem,
  type ImportJobsHistoryResponse,
} from "./import-jobs-history.types";

const HISTORY_LIMIT = 10;

const IMPORT_JOBS_LIST_COLUMNS =
  "id, created_at, completed_at, created_by, import_type, template_key, mode, status, original_filename, total_rows, valid_rows, invalid_rows, warning_rows, inserted_count, updated_count, skipped_count, metadata, summary";

/**
 * Read-only recent import jobs for the admin operations log.
 * Does not query import_errors or row_data.
 */
export const listRecentImportJobs = createServerFn({ method: "GET" })
  .middleware([requireContentStaffAuth])
  .handler(async ({ context }): Promise<ImportJobsHistoryResponse> => {
    const { supabase } = context as ContentStaffAuthContext;

    const { data, error } = await supabase
      .from("import_jobs")
      .select(IMPORT_JOBS_LIST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    if (error) {
      throw new Error(`تعذر تحميل سجل الاستيراد: ${error.message}`);
    }

    const rows = data ?? [];

    // Operator names come from real profiles only — never fabricated.
    const operatorIds = Array.from(
      new Set(rows.map((r) => r.created_by).filter((v): v is string => !!v)),
    );
    const operatorNames = new Map<string, string>();
    if (operatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", operatorIds);
      for (const p of profiles ?? []) {
        if (p.full_name) operatorNames.set(p.id, p.full_name);
      }
    }

    const jobs: ImportJobHistoryItem[] = rows.map((row) => {
      const meta = pickSafeJobMetadata(row.metadata);
      return {
        id: row.id,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        importType: row.import_type,
        templateKey: row.template_key,
        mode: row.mode,
        status: row.status,
        originalFilename: row.original_filename,
        totalRows: row.total_rows,
        validRows: row.valid_rows,
        invalidRows: row.invalid_rows,
        warningRows: row.warning_rows,
        insertedCount: row.inserted_count,
        updatedCount: row.updated_count,
        skippedCount: row.skipped_count,
        blockedCount: pickBlockedPublishedCount(row.summary),
        errorsCount: row.invalid_rows,
        operatorName: row.created_by
          ? (operatorNames.get(row.created_by) ??
            `#${row.created_by.slice(0, 8)}`)
          : null,
        noExecute: meta.noExecute,
        source: meta.source,
        dryRunVersion: meta.dryRunVersion,
      };
    });

    return { jobs, count: jobs.length };
  });
