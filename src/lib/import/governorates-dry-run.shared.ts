/** Shared types/constants/validation for governorates dry-run (client + server safe). */

import type { ImportJobStatus } from "./import-job.types";

export const GOVERNORATES_TEMPLATE_FILE = "02_governorates_template.xlsx";
export const GOVERNORATES_SHEET_NAME = "governorates";
export const GOVERNORATES_UPSERT_KEY = "name";

export const GOVERNORATES_REQUIRED_COLUMNS = ["name"] as const;
export const GOVERNORATES_OPTIONAL_COLUMNS = ["default_track_code", "sort_order"] as const;
export const GOVERNORATES_ALL_COLUMNS = [
  ...GOVERNORATES_REQUIRED_COLUMNS,
  ...GOVERNORATES_OPTIONAL_COLUMNS,
] as const;

export type GovernoratesColumnKey = (typeof GOVERNORATES_ALL_COLUMNS)[number];

export const GOVERNORATES_MAX_ROWS = 500;
export const GOVERNORATES_PREVIEW_ROWS = 10;
export const GOVERNORATES_MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface GovernoratesRow {
  rowNumber: number;
  name: string;
  default_track_code: string;
  sort_order: string;
}

export type GovernoratesValidationCode =
  | "MISSING_COLUMNS"
  | "MISSING_NAME"
  | "DUPLICATE_NAME"
  | "ROW_LIMIT"
  | "INVALID_SORT_ORDER"
  | "EMPTY_FILE"
  | "WRONG_SHEET";

export interface GovernoratesValidationIssue {
  row?: number;
  field?: GovernoratesColumnKey;
  code: GovernoratesValidationCode;
  message: string;
}

export interface GovernoratesDryRunParseResult {
  columns: GovernoratesColumnKey[];
  rows: GovernoratesRow[];
  previewRows: GovernoratesRow[];
  totalRowCount: number;
  issues: GovernoratesValidationIssue[];
  fileName: string;
}

export type GovernoratesDryRunStatus = "valid" | "invalid";

export interface GovernoratesDryRunApiResponse {
  status: GovernoratesDryRunStatus;
  jobId: string;
  jobStatus: ImportJobStatus;
  persisted: true;
  message: string;
  detectedColumns: GovernoratesColumnKey[];
  previewRows: GovernoratesRow[];
  issues: GovernoratesValidationIssue[];
  totalRowCount: number;
  errorCount: number;
  counts: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    warningRows: number;
  };
  fileName: string;
}

export function sanitizeGovernorateRowData(
  row: GovernoratesRow | undefined,
): Record<GovernoratesColumnKey, string> {
  if (!row) {
    return { name: "", default_track_code: "", sort_order: "" };
  }
  return {
    name: row.name,
    default_track_code: row.default_track_code,
    sort_order: row.sort_order,
  };
}

const FILE_LEVEL_ERROR_CODES: GovernoratesValidationCode[] = [
  "MISSING_COLUMNS",
  "EMPTY_FILE",
  "ROW_LIMIT",
  "WRONG_SHEET",
];

export function computeGovernorateDryRunCounts(
  parsed: GovernoratesDryRunParseResult,
  issues: GovernoratesValidationIssue[],
): { totalRows: number; validRows: number; invalidRows: number; warningRows: number } {
  const totalRows = parsed.totalRowCount;
  const hasFileLevelError = issues.some((i) => FILE_LEVEL_ERROR_CODES.includes(i.code));
  const rowNumbersWithErrors = new Set(
    issues.filter((i) => i.row != null).map((i) => i.row as number),
  );
  const invalidRows = hasFileLevelError ? totalRows : rowNumbersWithErrors.size;
  const validRows = Math.max(0, totalRows - invalidRows);
  return { totalRows, validRows, invalidRows, warningRows: 0 };
}

export function normalizeGovernorateHeader(label: string): string {
  return label.replace(/\s*\*\s*$/, "").trim().toLowerCase();
}

export function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in (value as object)) {
    return String((value as { text: unknown }).text ?? "").trim();
  }
  return String(value).trim();
}

export function isGovernorateRowEmpty(values: Record<GovernoratesColumnKey, string>): boolean {
  return GOVERNORATES_ALL_COLUMNS.every((col) => values[col] === "");
}

export function validateGovernoratesRows(
  rows: GovernoratesRow[],
  presentColumns: GovernoratesColumnKey[],
): GovernoratesValidationIssue[] {
  const issues: GovernoratesValidationIssue[] = [];

  for (const col of GOVERNORATES_REQUIRED_COLUMNS) {
    if (!presentColumns.includes(col)) {
      issues.push({
        code: "MISSING_COLUMNS",
        field: col,
        message: `العمود المطلوب «${col}» غير موجود في الملف.`,
      });
    }
  }

  if (rows.length === 0 && issues.length === 0) {
    issues.push({
      code: "EMPTY_FILE",
      message: "لا توجد صفوف بيانات بعد تجاهل الصفوف الفارغة.",
    });
  }

  if (rows.length > GOVERNORATES_MAX_ROWS) {
    issues.push({
      code: "ROW_LIMIT",
      message: `عدد الصفوف (${rows.length}) يتجاوز الحد الأقصى (${GOVERNORATES_MAX_ROWS}).`,
    });
  }

  const seenNames = new Map<string, number>();

  for (const row of rows) {
    if (!row.name) {
      issues.push({
        row: row.rowNumber,
        field: "name",
        code: "MISSING_NAME",
        message: "حقل الاسم (name) مطلوب ولا يمكن أن يكون فارغاً.",
      });
    } else {
      const key = row.name.toLowerCase();
      const first = seenNames.get(key);
      if (first != null) {
        issues.push({
          row: row.rowNumber,
          field: "name",
          code: "DUPLICATE_NAME",
          message: `اسم مكرر «${row.name}» (مكرر مع الصف ${first}).`,
        });
      } else {
        seenNames.set(key, row.rowNumber);
      }
    }

    if (row.sort_order !== "") {
      const n = Number(row.sort_order);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        issues.push({
          row: row.rowNumber,
          field: "sort_order",
          code: "INVALID_SORT_ORDER",
          message: "حقل sort_order يجب أن يكون رقماً صحيحاً عند وجوده.",
        });
      }
    }
  }

  return issues;
}

export function toGovernoratesDryRunApiResponse(
  parsed: GovernoratesDryRunParseResult,
  jobId: string,
  jobStatus: ImportJobStatus,
): GovernoratesDryRunApiResponse {
  const errorCount = parsed.issues.filter((i) => i.code !== "EMPTY_FILE").length;
  const counts = computeGovernorateDryRunCounts(parsed, parsed.issues);
  return {
    status: parsed.issues.length === 0 ? "valid" : "invalid",
    jobId,
    jobStatus,
    persisted: true,
    message: "تم إنشاء سجل معاينة جافة، ولم يتم تنفيذ أي استيراد.",
    detectedColumns: parsed.columns,
    previewRows: parsed.previewRows,
    issues: parsed.issues,
    totalRowCount: parsed.totalRowCount,
    errorCount,
    counts,
    fileName: parsed.fileName,
  };
}
