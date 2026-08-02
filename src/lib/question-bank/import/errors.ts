import {
  QB_IMPORT_AR_MESSAGES,
  VALIDATION_CODE_DEFAULTS,
  type QbImportCode,
} from "./validation-codes.ts";
import { compareCodePoints } from "./canonical-json.ts";

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
  opts: Partial<Omit<QbImportIssue, "code" | "message_ar">> = {},
): QbImportIssue {
  const defaults = VALIDATION_CODE_DEFAULTS[code];
  return {
    code,
    message_ar: QB_IMPORT_AR_MESSAGES[code],
    file: opts.file ?? null,
    sheet: opts.sheet ?? null,
    row: opts.row ?? null,
    column: opts.column ?? null,
    severity: opts.severity ?? defaults.severity,
    row_blocking: opts.row_blocking ?? defaults.row_blocking,
    file_blocking: opts.file_blocking ?? defaults.file_blocking,
    suggested_fix: opts.suggested_fix ?? "صحح البيانات وفق قالب الاستيراد المعتمد.",
  };
}

export function sortIssues(issues: QbImportIssue[]): QbImportIssue[] {
  return [...issues].sort((a, b) =>
    compareCodePoints(String(a.file), String(b.file)) || compareCodePoints(String(a.sheet), String(b.sheet)) ||
    (a.row ?? -1) - (b.row ?? -1) ||
    compareCodePoints(String(a.column), String(b.column)) ||
    compareCodePoints(a.code, b.code));
}
