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
  malformedUnicode?: boolean;
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
    issues.push(issue(code, { file: input.fileName, stage: "PREFLIGHT_OOXML", source_subsystem: "preflight", ...extra }));
  };

  if (!/\.xlsx$/i.test(input.fileName)) {
    issues.push(issue(QB_IMPORT_CODES.FILE_TYPE_UNSUPPORTED, { file: input.fileName, stage: "PREFLIGHT_RAW", source_subsystem: "zip-preflight" }));
  }
  if ((input.fileBytes ?? 0) > DEFAULT_IMPORT_LIMITS.maxFileBytes) {
    issues.push(issue(QB_IMPORT_CODES.FILE_TOO_LARGE, { file: input.fileName, stage: "PREFLIGHT_RAW", source_subsystem: "zip-preflight" }));
  }
  if (input.rows.length > DEFAULT_IMPORT_LIMITS.maxRows) add("ROW_LIMIT");
  if (input.headers.length > DEFAULT_IMPORT_LIMITS.maxColumns) add("COLUMN_LIMIT");
  if ((meta.zipEntries ?? 0) > DEFAULT_IMPORT_LIMITS.maxZipEntries) {
    issues.push(issue(QB_IMPORT_CODES.ZIP_ENTRY_LIMIT, { file: input.fileName, stage: "PREFLIGHT_ZIP", source_subsystem: "zip-preflight" }));
  }
  if ((meta.uncompressedBytes ?? 0) > DEFAULT_IMPORT_LIMITS.maxUncompressedBytes) {
    issues.push(issue(QB_IMPORT_CODES.ZIP_TOTAL_SIZE_LIMIT, { file: input.fileName, stage: "PREFLIGHT_ZIP", source_subsystem: "zip-preflight" }));
  }
  if (meta.hasZipBomb) {
    issues.push(issue(QB_IMPORT_CODES.ZIP_BOMB_SUSPECTED, { file: input.fileName, stage: "PREFLIGHT_ZIP", source_subsystem: "zip-preflight" }));
  }
  if (meta.hasFormulaCells) {
    issues.push(issue(QB_IMPORT_CODES.FORMULA_CELL, { file: input.fileName, stage: "PREFLIGHT_OOXML", source_subsystem: "workbook-parser" }));
  }
  if (meta.hasMergedDataCells) add("MERGED_DATA_CELL");
  if (meta.encrypted) {
    issues.push(issue(QB_IMPORT_CODES.WORKBOOK_ENCRYPTED, { file: input.fileName, stage: "PREFLIGHT_ZIP", source_subsystem: "workbook-parser" }));
  }
  if (meta.hasMacros) {
    issues.push(issue(QB_IMPORT_CODES.MACRO_CONTENT, { file: input.fileName, stage: "PREFLIGHT_OOXML", source_subsystem: "workbook-parser" }));
  }
  if (meta.hasExternalLinks) {
    issues.push(issue(QB_IMPORT_CODES.EXTERNAL_LINK, { file: input.fileName, stage: "PREFLIGHT_OOXML", source_subsystem: "workbook-parser" }));
  }
  if (meta.hasPathTraversal || meta.suspiciousMediaPaths) {
    issues.push(issue(QB_IMPORT_CODES.PATH_TRAVERSAL, { file: input.fileName, stage: "PREFLIGHT_ZIP", source_subsystem: "zip-preflight" }));
  }
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
    if (seen.has(normalized)) {
      issues.push(issue(QB_IMPORT_CODES.DUPLICATE_HEADER, { file: input.fileName, stage: "PREFLIGHT_OOXML", source_subsystem: "detect" }));
    }
    seen.add(normalized);
    if (hasUnsafeUnicode(header) || meta.malformedUnicode) {
      issues.push(issue(QB_IMPORT_CODES.MALFORMED_UNICODE, { file: input.fileName, stage: "PREFLIGHT_OOXML", source_subsystem: "unicode" }));
    }
    if (/^(id|uuid|role|status|publish|approved_by|publisher|owner_role)$/i.test(normalized)) {
      issues.push(issue(QB_IMPORT_CODES.FORBIDDEN_COLUMN, { file: input.fileName, stage: "ADAPTER_DETECT", source_subsystem: "detect" }));
      issues.push(issue(QB_IMPORT_CODES.PRIVILEGE_ESCALATION, { file: input.fileName, stage: "AUTHORIZATION", source_subsystem: "preflight" }));
    }
  }

  for (const row of input.rows) {
    for (const value of Object.values(row)) {
      if (typeof value === "string" && hasUnsafeUnicode(value)) {
        issues.push(issue(QB_IMPORT_CODES.MALFORMED_UNICODE, { file: input.fileName, stage: "PREFLIGHT_OOXML", source_subsystem: "unicode" }));
      }
      if (isFormulaLike(value) || meta.csvInjectionCells) {
        issues.push(issue(QB_IMPORT_CODES.FORMULA_INJECTION, { file: input.fileName, stage: "PREFLIGHT_OOXML", source_subsystem: "validate" }));
      }
      const limit = meta.maxCellBytes ?? DEFAULT_IMPORT_LIMITS.maxCellBytes;
      if (typeof value === "string" && Buffer.byteLength(value, "utf8") > limit) {
        add("CELL_TOO_LARGE");
      }
    }
  }

  return issues;
}
