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
  /** Rows blocked because the target row is already published. */
  blockedCount: number;
  /** Rows that failed validation (never fabricated — derived from invalid_rows). */
  errorsCount: number;
  /** Operator display name resolved from import_jobs.created_by; null when unavailable. */
  operatorName: string | null;
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

/**
 * Blocked-published count, read from the job summary written by the executor.
 * Returns 0 when the executor never reported one — no invented values.
 */
export function pickBlockedPublishedCount(summary: unknown): number {
  if (!summary || typeof summary !== "object") return 0;
  const s = summary as Record<string, unknown>;
  const direct = s.blocked_published ?? s.blockedPublished;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;

  // Per-template summaries: { subjects: { blocked_published: n }, ... }
  let total = 0;
  for (const value of Object.values(s)) {
    if (value && typeof value === "object") {
      const inner = (value as Record<string, unknown>).blocked_published;
      if (typeof inner === "number" && Number.isFinite(inner)) total += inner;
    }
  }
  return total;
}
