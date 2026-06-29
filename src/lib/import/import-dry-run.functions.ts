import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GOVERNORATES_MAX_FILE_BYTES,
  toGovernoratesDryRunApiResponse,
  type GovernoratesDryRunApiResponse,
} from "./governorates-dry-run.shared";

const MAX_BASE64_LENGTH = Math.ceil(GOVERNORATES_MAX_FILE_BYTES * 1.37) + 64;

const DryRunInput = z.object({
  fileName: z.string().min(1).max(255),
  fileBase64: z.string().min(1).max(MAX_BASE64_LENGTH),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(GOVERNORATES_MAX_FILE_BYTES),
});

type AdminAuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

/**
 * Server-side dry-run for governorates — parse, validate, persist to import_jobs/import_errors.
 * Does not write to governorates or execute import.
 */
export const dryRunGovernoratesImport = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input) => DryRunInput.parse(input))
  .handler(async ({ data, context }): Promise<GovernoratesDryRunApiResponse> => {
    const { supabase, userId } = context as AdminAuthContext;

    const lowerName = data.fileName.toLowerCase();
    if (!lowerName.endsWith(".xlsx")) {
      throw new Error("يُقبل ملف Excel بصيغة .xlsx فقط.");
    }

    const buffer = Buffer.from(data.fileBase64, "base64");
    if (buffer.length > GOVERNORATES_MAX_FILE_BYTES) {
      throw new Error(
        `حجم الملف يتجاوز الحد المسموح (${GOVERNORATES_MAX_FILE_BYTES / (1024 * 1024)} MB).`,
      );
    }

    if (buffer.length !== data.fileSize) {
      throw new Error("حجم الملف المرفوع لا يطابق المحتوى الفعلي.");
    }

    const { parseGovernoratesBuffer } = await import("./governorates-dry-run.server");
    const parsed = await parseGovernoratesBuffer(buffer, data.fileName);

    const { persistGovernoratesDryRun } = await import("./import-dry-run-persist.server");
    const { jobId, jobStatus } = await persistGovernoratesDryRun(
      supabase,
      userId,
      parsed,
      data.fileSize,
    );

    return toGovernoratesDryRunApiResponse(parsed, jobId, jobStatus);
  });
