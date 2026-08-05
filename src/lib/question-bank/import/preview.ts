import type { OfficialNormalizedV1 } from "./official-normalized-v1.ts";
import { issue, type QbImportIssue } from "./errors.ts";
import { QB_IMPORT_CODES } from "./validation-codes.ts";

export type PreviewRow = {
  row_number: number;
  question_code: string | null;
  status: "ok" | "blocked";
  normalized: OfficialNormalizedV1 | null;
  content_fingerprint: string | null;
  issues: QbImportIssue[];
};

function redact(row: OfficialNormalizedV1): OfficialNormalizedV1 {
  return {
    ...row,
    options: row.options.map((option) => ({ ...option, is_correct: false })),
    accepted_answers: [],
    solutions: [],
    solution_steps: [],
  };
}

/** Public/student-safe preview — answers and solutions removed. */
export function buildPublicPreview(rows: PreviewRow[]) {
  return rows.map((row) => ({
    ...row,
    normalized: row.normalized ? redact(row.normalized) : null,
  }));
}

/** Privileged editor preview — full normalized payload retained. */
export function buildPrivilegedPreview(rows: PreviewRow[]) {
  return rows;
}

export function previewRows(
  rows: OfficialNormalizedV1[],
  privileged: boolean,
): OfficialNormalizedV1[] {
  return privileged ? rows : rows.map(redact);
}

/** Apply is deliberately unavailable in this dry-run package. */
export function rejectApplyContract(code: keyof typeof QB_IMPORT_CODES = "PREVIEW_TOKEN_INVALID"): QbImportIssue {
  return issue(code, {
    file: null,
    stage: "AUTHORIZATION",
    source_subsystem: "preview",
    suggested_fix: "لا تتوفر عملية التطبيق في حزمة التشغيل الجاف.",
  });
}
