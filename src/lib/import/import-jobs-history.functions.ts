import { createServerFn } from "@tanstack/react-start";
import { requireAdminAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  pickSafeJobMetadata,
  type ImportJobHistoryItem,
  type ImportJobsHistoryResponse,
} from "./import-jobs-history.types";

const HISTORY_LIMIT = 10;

type AdminAuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

const IMPORT_JOBS_LIST_COLUMNS =
  "id, created_at, completed_at, import_type, template_key, mode, status, original_filename, total_rows, valid_rows, invalid_rows, warning_rows, inserted_count, updated_count, skipped_count, metadata";

/**
 * Read-only recent import jobs for admin history stub.
 * Does not query import_errors or row_data.
 */
export const listRecentImportJobs = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async ({ context }): Promise<ImportJobsHistoryResponse> => {
    const { supabase } = context as AdminAuthContext;

    const { data, error } = await supabase
      .from("import_jobs")
      .select(IMPORT_JOBS_LIST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    if (error) {
      throw new Error(`تعذر تحميل سجل الاستيراد: ${error.message}`);
    }

    const jobs: ImportJobHistoryItem[] = (data ?? []).map((row) => {
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
        noExecute: meta.noExecute,
        source: meta.source,
        dryRunVersion: meta.dryRunVersion,
      };
    });

    return { jobs, count: jobs.length };
  });
