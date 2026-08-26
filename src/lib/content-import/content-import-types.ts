/** Shared types for lesson content import dry-run (client + server safe). */

export const CONTENT_IMPORT_MAX_ROWS = 1000;
export const CONTENT_IMPORT_PREVIEW_ROWS = 10;
export const CONTENT_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;

export const CONTENT_IMPORT_RESOURCE_TYPES = [
  "video",
  "mindmap",
  "experiment",
  "pdf",
  "link",
] as const;

export type ContentImportResourceType = (typeof CONTENT_IMPORT_RESOURCE_TYPES)[number];

export type ContentImportDryRunStatus = "pass" | "warn" | "fail";

export interface ContentImportDryRunIssue {
  rowNumber: number | null;
  column: string | null;
  code?: string;
  message: string;
}

export interface ContentImportDryRunReport {
  ok: boolean;
  status: ContentImportDryRunStatus;
  templateKey: string;
  filename: string;
  totalRows: number;
  validRows: number;
  errorCount: number;
  warningCount: number;
  errors: ContentImportDryRunIssue[];
  warnings: ContentImportDryRunIssue[];
  previewRows: Array<Record<string, string>>;
  detectedColumns: string[];
}

export interface ContentImportParsedSheet {
  detectedColumns: string[];
  rows: Array<{ rowNumber: number; data: Record<string, string> }>;
  fileName: string;
}
