import { detectSchemaFromHeaders, type ImportSchemaId } from "./adapters/detect.ts";
import { adaptLegacyFlat15Col } from "./adapters/legacy-flat-15col.ts";
import { adaptTeacherFlatArV0 } from "./adapters/teacher-flat-ar-v0.ts";
import { adaptOfficialFlatV0 } from "./adapters/official-flat-v0.ts";
import {
  type CatalogLookup,
  type OfficialNormalizedV1,
  OFFICIAL_NORMALIZED_V1,
} from "./official-normalized-v1.ts";
import { validateNormalizedRow, contentFingerprint } from "./validate.ts";
import { issue, type QbImportIssue } from "./errors.ts";
import { QB_IMPORT_CODES } from "./validation-codes.ts";
import { createHash } from "node:crypto";

export const DEFAULT_MAX_ROWS = 5000;
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export type DryRunInputRow = Record<string, unknown>;

export type DryRunPreviewRow = {
  row_number: number;
  question_code: string | null;
  status: "ok" | "blocked";
  normalized: OfficialNormalizedV1 | null;
  content_fingerprint: string | null;
  issues: QbImportIssue[];
};

export type DryRunSummary = {
  schema: ImportSchemaId;
  file: string;
  total_rows: number;
  ok_rows: number;
  blocked_rows: number;
  warning_count: number;
  error_count: number;
  file_blocking: boolean;
  column_shift_suspected: boolean;
};

export type DryRunResult = {
  summary: DryRunSummary;
  preview: DryRunPreviewRow[];
  issues: QbImportIssue[];
  /** Deterministic digest of accepted normalized rows (order by question_code). */
  accepted_set_hash: string | null;
};

export type DryRunOptions = {
  fileName: string;
  headers: string[];
  rows: DryRunInputRow[];
  schemaHint?: ImportSchemaId;
  catalog?: CatalogLookup;
  maxRows?: number;
  fileBytes?: number;
  maxBytes?: number;
  hasFormulaCells?: boolean;
  hasMergedCells?: boolean;
};

function adaptRow(
  schema: ImportSchemaId,
  row: DryRunInputRow,
  ctx: { file: string; rowNumber: number },
): { row: OfficialNormalizedV1 | null; issues: QbImportIssue[] } {
  if (schema === "legacy_flat_15col") {
    return adaptLegacyFlat15Col(row, ctx);
  }
  if (schema === "teacher_flat_ar_v0") {
    return adaptTeacherFlatArV0(row, {
      ...ctx,
      syntheticCode: `GEN-${ctx.rowNumber}`,
    });
  }
  if (schema === "official_flat_v0") {
    return adaptOfficialFlatV0(row, ctx);
  }
  if (schema === OFFICIAL_NORMALIZED_V1) {
    // Already-normalized JSON rows (programmatic / round-trip fixtures).
    const n = row as unknown as OfficialNormalizedV1;
    if (n?.schema_version === OFFICIAL_NORMALIZED_V1 && n.question_code) {
      return { row: n, issues: [] };
    }
  }
  return {
    row: null,
    issues: [
      issue(QB_IMPORT_CODES.QB_IMPORT_UNKNOWN_SCHEMA, {
        file: ctx.file,
        row: ctx.rowNumber,
        file_blocking: true,
        suggested_fix: "استخدم قالباً مدعوماً أو مرر schemaHint صريحاً.",
      }),
    ],
  };
}

export function runQuestionBankImportDryRun(opts: DryRunOptions): DryRunResult {
  const issues: QbImportIssue[] = [];
  const file = opts.fileName;
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  if (opts.fileBytes != null && opts.fileBytes > maxBytes) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_FILE_TOO_LARGE, {
        file,
        file_blocking: true,
        row_blocking: false,
        suggested_fix: `قلّص الملف إلى أقل من ${maxBytes} بايت.`,
      }),
    );
  }
  if (opts.hasFormulaCells) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_FORMULA_CELL_NOT_ALLOWED, {
        file,
        file_blocking: true,
        row_blocking: false,
        suggested_fix: "حوّل الصيغ إلى قيم ثابتة قبل الاستيراد.",
      }),
    );
  }
  if (opts.hasMergedCells) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_MERGED_CELL_NOT_ALLOWED, {
        file,
        file_blocking: true,
        row_blocking: false,
        suggested_fix: "أزل دمج الخلايا من ورقة الأسئلة.",
      }),
    );
  }
  if (opts.rows.length > maxRows) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_ROW_LIMIT_EXCEEDED, {
        file,
        file_blocking: true,
        row_blocking: false,
        suggested_fix: `الحد الأقصى ${maxRows} صفاً لكل ملف.`,
      }),
    );
  }

  const detected = detectSchemaFromHeaders(opts.headers);
  const schema = opts.schemaHint && opts.schemaHint !== "unknown"
    ? opts.schemaHint
    : detected.schema;

  if (schema === "unknown") {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_UNKNOWN_SCHEMA, {
        file,
        file_blocking: true,
        row_blocking: false,
        suggested_fix: "تعذر التعرف على المخطط من العناوين.",
      }),
    );
  }
  if (detected.column_shift_suspected) {
    issues.push(
      issue(QB_IMPORT_CODES.QB_IMPORT_COLUMN_SHIFT_DETECTED, {
        file,
        severity: "warning",
        file_blocking: false,
        row_blocking: false,
        suggested_fix: "تحقق من ترتيب الأعمدة مقابل القالب.",
      }),
    );
  }

  const fileBlocking = issues.some((i) => i.file_blocking);
  const preview: DryRunPreviewRow[] = [];
  const seenCodes = new Set<string>();
  const seenFingerprints = new Set<string>();
  let ok = 0;
  let blocked = 0;

  if (!fileBlocking && schema !== "unknown") {
    opts.rows.forEach((raw, idx) => {
      const rowNumber = idx + 2; // header = 1
      const adapted = adaptRow(schema, raw, { file, rowNumber });
      const rowIssues = [...adapted.issues];
      let normalized = adapted.row;
      if (normalized) {
        rowIssues.push(
          ...validateNormalizedRow(normalized, {
            file,
            rowNumber,
            catalog: opts.catalog,
            seenCodes,
            seenFingerprints,
          }),
        );
      }
      const rowBlocked = rowIssues.some((i) => i.row_blocking);
      if (rowBlocked) {
        blocked += 1;
        normalized = null;
      } else {
        ok += 1;
      }
      preview.push({
        row_number: rowNumber,
        question_code:
          normalized?.question_code ??
          (String(raw.question_code ?? "").trim() || null),
        status: rowBlocked ? "blocked" : "ok",
        normalized,
        content_fingerprint: normalized ? contentFingerprint(normalized) : null,
        issues: rowIssues,
      });
      issues.push(...rowIssues);
    });
  }

  const accepted = preview
    .filter((p) => p.normalized)
    .map((p) => p.normalized!)
    .sort((a, b) => a.question_code.localeCompare(b.question_code));

  const accepted_set_hash =
    accepted.length === 0
      ? null
      : createHash("sha256")
          .update(JSON.stringify(accepted), "utf8")
          .digest("hex");

  return {
    summary: {
      schema,
      file,
      total_rows: opts.rows.length,
      ok_rows: ok,
      blocked_rows: blocked,
      warning_count: issues.filter((i) => i.severity === "warning").length,
      error_count: issues.filter((i) => i.severity === "error").length,
      file_blocking: fileBlocking,
      column_shift_suspected: detected.column_shift_suspected,
    },
    preview,
    issues,
    accepted_set_hash,
  };
}

/** Error export model for UI/CSV (no I/O). */
export function buildErrorExportModel(result: DryRunResult): Array<Record<string, string | number | boolean | null>> {
  return result.issues.map((i) => ({
    code: i.code,
    message_ar: i.message_ar,
    file: i.file,
    sheet: i.sheet,
    row: i.row,
    column: i.column,
    severity: i.severity,
    row_blocking: i.row_blocking,
    file_blocking: i.file_blocking,
    suggested_fix: i.suggested_fix,
  }));
}
