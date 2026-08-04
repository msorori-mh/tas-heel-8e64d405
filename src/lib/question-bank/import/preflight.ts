import { issue, type QbImportIssue } from "./errors.ts";
import { QB_IMPORT_CODES } from "./validation-codes.ts";
import { DEFAULT_IMPORT_LIMITS } from "./limits.ts";
import { hasUnsafeUnicode, isFormulaLike } from "./unicode.ts";

/** Metadata extracted by a workbook parser before dry-run adaptation. */
export type WorkbookParserMetadata = {
  hasFormulaCells?: boolean;
  hasMergedDataCells?: boolean;
  encrypted?: boolean;
  hasMacros?: boolean;
  hasExternalLinks?: boolean;
  hasPathTraversal?: boolean;
  suspiciousMediaPaths?: boolean;
  hiddenSheetData?: boolean;
  hiddenRowData?: boolean;
  hiddenColumnData?: boolean;
  visibleSheetCount?: number;
  zipEntries?: number;
  uncompressedBytes?: number;
  maxCellBytes?: number;
  csvInjectionCells?: boolean;
  hasZipBomb?: boolean;
};

export function preflightWorkbook(input: {
  fileName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  fileBytes?: number;
  metadata?: WorkbookParserMetadata;
}): QbImportIssue[] {
  const issues: QbImportIssue[] = [];
  const meta = input.metadata ?? {};
  const add = (code: keyof typeof QB_IMPORT_CODES, extra: Partial<QbImportIssue> = {}) => {
    issues.push(issue(code, { file: input.fileName, ...extra }));
  };

  if (!/\.xlsx$/i.test(input.fileName)) add("FILE_TYPE_UNSUPPORTED");
  if ((input.fileBytes ?? 0) > DEFAULT_IMPORT_LIMITS.maxFileBytes) add("FILE_TOO_LARGE");
  if (input.rows.length > DEFAULT_IMPORT_LIMITS.maxRows) add("ROW_LIMIT");
  if (input.headers.length > DEFAULT_IMPORT_LIMITS.maxColumns) add("COLUMN_LIMIT");
  if ((meta.zipEntries ?? 0) > DEFAULT_IMPORT_LIMITS.maxZipEntries) add("ZIP_ENTRY_LIMIT");
  if ((meta.uncompressedBytes ?? 0) > DEFAULT_IMPORT_LIMITS.maxUncompressedBytes) {
    add("ZIP_TOTAL_SIZE_LIMIT");
  }
  if (meta.hasZipBomb) add("ZIP_BOMB_SUSPECTED");
  if (meta.hasFormulaCells) add("FORMULA_CELL");
  if (meta.hasMergedDataCells) add("MERGED_DATA_CELL");
  if (meta.encrypted) add("WORKBOOK_ENCRYPTED");
  if (meta.hasMacros) add("MACRO_CONTENT");
  if (meta.hasExternalLinks) add("EXTERNAL_LINK");
  if (meta.hasPathTraversal || meta.suspiciousMediaPaths) add("PATH_TRAVERSAL");
  if (meta.hiddenSheetData) add("HIDDEN_SHEET_DATA");
  if (meta.hiddenRowData) add("HIDDEN_ROW_DATA");
  if (meta.hiddenColumnData) add("HIDDEN_COLUMN_DATA");
  if ((meta.visibleSheetCount ?? 1) > DEFAULT_IMPORT_LIMITS.maxVisibleSheets) {
    add("SHEET_COUNT_INVALID");
  }
  if ((meta.maxCellBytes ?? 0) > DEFAULT_IMPORT_LIMITS.maxCellBytes) add("CELL_TOO_LARGE");

  const seen = new Set<string>();
  for (const header of input.headers) {
    const normalized = header.replace(/^\uFEFF/, "").trim().toLowerCase();
    if (seen.has(normalized)) add("DUPLICATE_HEADER");
    seen.add(normalized);
    if (hasUnsafeUnicode(header)) add("MALFORMED_UNICODE");
    if (/^(id|uuid|role|status|publish|approved_by|publisher|owner_role)$/i.test(normalized)) {
      add("FORBIDDEN_COLUMN");
      add("PRIVILEGE_ESCALATION");
    }
  }

  for (const row of input.rows) {
    for (const value of Object.values(row)) {
      if (typeof value === "string" && hasUnsafeUnicode(value)) add("MALFORMED_UNICODE");
      if (isFormulaLike(value) || meta.csvInjectionCells) {
        add("FORMULA_INJECTION");
      }
      const limit = meta.maxCellBytes ?? DEFAULT_IMPORT_LIMITS.maxCellBytes;
      if (typeof value === "string" && Buffer.byteLength(value, "utf8") > limit) {
        add("CELL_TOO_LARGE");
      }
    }
  }

  return issues;
}
