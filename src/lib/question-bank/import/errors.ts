import {
  QB_IMPORT_AR_MESSAGES,
  type QbImportCode,
} from "./validation-codes.ts";

export type QbImportIssue = {
  code: QbImportCode;
  message_ar: string;
  file: string | null;
  sheet: string | null;
  row: number | null;
  column: string | null;
  severity: "error" | "warning";
  row_blocking: boolean;
  file_blocking: boolean;
  suggested_fix: string;
};

export function issue(
  code: QbImportCode,
  opts: Partial<Omit<QbImportIssue, "code" | "message_ar">> & {
    suggested_fix: string;
  },
): QbImportIssue {
  const rowBlocking = opts.row_blocking ?? true;
  return {
    code,
    message_ar: QB_IMPORT_AR_MESSAGES[code],
    file: opts.file ?? null,
    sheet: opts.sheet ?? null,
    row: opts.row ?? null,
    column: opts.column ?? null,
    severity: opts.severity ?? "error",
    row_blocking: rowBlocking,
    file_blocking: opts.file_blocking ?? false,
    suggested_fix: opts.suggested_fix,
  };
}
