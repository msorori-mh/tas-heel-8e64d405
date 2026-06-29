/** Read-only import jobs history API types (no import_errors / row_data). */

export interface ImportJobHistoryItem {
  id: string;
  createdAt: string;
  completedAt: string | null;
  importType: string;
  templateKey: string | null;
  mode: string;
  status: string;
  originalFilename: string | null;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  noExecute: boolean | null;
  source: string | null;
  dryRunVersion: string | null;
}

export interface ImportJobsHistoryResponse {
  jobs: ImportJobHistoryItem[];
  count: number;
}

export function pickSafeJobMetadata(metadata: unknown): {
  noExecute: boolean | null;
  source: string | null;
  dryRunVersion: string | null;
} {
  if (!metadata || typeof metadata !== "object") {
    return { noExecute: null, source: null, dryRunVersion: null };
  }
  const m = metadata as Record<string, unknown>;
  return {
    noExecute: typeof m.noExecute === "boolean" ? m.noExecute : null,
    source: typeof m.source === "string" ? m.source : null,
    dryRunVersion: typeof m.dryRunVersion === "string" ? m.dryRunVersion : null,
  };
}
