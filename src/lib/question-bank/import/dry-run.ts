import {
  adaptLegacyFlat15Col,
  legacyArrayToRow,
  LEGACY_FLAT_15COL,
} from "./adapters/legacy-flat-15col.ts";
import { adaptTeacherFlatArV0, TEACHER_FLAT_AR_V0 } from "./adapters/teacher-flat-ar-v0.ts";
import { adaptOfficialFlatV0, OFFICIAL_FLAT_V0 } from "./adapters/official-flat-v0.ts";
import {
  CONTRACT_HEADERS,
  detectSchemaFromHeaders,
  normalizeHeader,
  type ImportSchemaId,
} from "./adapters/detect.ts";
import type { OfficialNormalizedV1 } from "./official-normalized-v1.ts";
import {
  validateNormalizedRow,
  contentFingerprint,
  type CatalogLookup,
} from "./validate.ts";
import { canonicalHash } from "./canonical-json.ts";
import { issue, sortIssues } from "./errors.ts";
import { QB_IMPORT_CODES } from "./validation-codes.ts";
import { preflightWorkbook, type WorkbookParserMetadata } from "./preflight.ts";
import { buildPrivilegedPreview, buildPublicPreview } from "./preview.ts";

export type DryRunInputRow = Record<string, unknown> | unknown[];

export type DryRunPreviewRow = {
  row_number: number;
  question_code: string | null;
  status: "ok" | "blocked";
  normalized: OfficialNormalizedV1 | null;
  content_fingerprint: string | null;
  issues: ReturnType<typeof issue>[];
};

export type DryRunOptions = {
  fileName: string;
  headers: string[];
  rows: DryRunInputRow[];
  schemaHint?: ImportSchemaId;
  catalog?: CatalogLookup;
  fileBytes?: number;
  parserMetadata?: WorkbookParserMetadata;
  authorized?: boolean;
  relaxExactHeaders?: boolean;
};

function headersMatchContract(schema: ImportSchemaId, headers: string[]): boolean {
  if (schema === "unknown") return false;
  const expected = CONTRACT_HEADERS[schema];
  if (headers.length !== expected.length) return false;
  return expected.every((h, i) => normalizeHeader(h) === normalizeHeader(headers[i] ?? ""));
}

export function runQuestionBankImportDryRun(opts: DryRunOptions) {
  const objectRows = opts.rows.map((row) =>
    Array.isArray(row) ? legacyArrayToRow(row) : row,
  );
  const issues = preflightWorkbook({
    fileName: opts.fileName,
    headers: opts.headers,
    rows: objectRows,
    fileBytes: opts.fileBytes,
    metadata: opts.parserMetadata,
  });

  if (opts.authorized === false) {
    issues.push(issue(QB_IMPORT_CODES.UNAUTHORIZED_IMPORT, { file: opts.fileName }));
  }

  const detected = detectSchemaFromHeaders(opts.headers);
  let schema: ImportSchemaId = detected.schema;

  if (opts.schemaHint && opts.schemaHint !== "unknown") {
    if (opts.relaxExactHeaders) {
      schema = opts.schemaHint;
    } else if (!headersMatchContract(opts.schemaHint, opts.headers)) {
      issues.push(issue(QB_IMPORT_CODES.INVALID_CONTRACT, { file: opts.fileName }));
    } else if (detected.schema !== "unknown" && detected.schema !== opts.schemaHint) {
      issues.push(issue(QB_IMPORT_CODES.INVALID_CONTRACT, { file: opts.fileName }));
    } else {
      schema = opts.schemaHint;
    }
  }

  if (schema === "unknown") {
    issues.push(issue(QB_IMPORT_CODES.INVALID_CONTRACT, { file: opts.fileName }));
  } else if (!opts.relaxExactHeaders && !headersMatchContract(schema, opts.headers)) {
    if (schema === LEGACY_FLAT_15COL && opts.headers.length !== 15) {
      issues.push(issue(QB_IMPORT_CODES.LEGACY_COLUMN_COUNT, { file: opts.fileName }));
    } else if (schema === LEGACY_FLAT_15COL) {
      issues.push(issue(QB_IMPORT_CODES.LEGACY_COLUMN_ORDER, { file: opts.fileName }));
    } else {
      issues.push(issue(QB_IMPORT_CODES.MISSING_HEADER, { file: opts.fileName }));
    }
  }

  const preview: DryRunPreviewRow[] = [];
  const seenCodes = new Set<string>();
  const seenContent = new Set<string>();
  const fileBlocking = issues.some((item) => item.file_blocking);

  if (!fileBlocking && schema !== "unknown") {
    for (let index = 0; index < opts.rows.length; index += 1) {
      const raw = opts.rows[index]!;
      const rowNumber = index + 2;
      const context = { file: opts.fileName, rowNumber };
      const objectRow: Record<string, unknown> = Array.isArray(raw)
        ? schema === LEGACY_FLAT_15COL
          ? legacyArrayToRow(raw)
          : {}
        : raw;
      const adapted =
        schema === TEACHER_FLAT_AR_V0
          ? adaptTeacherFlatArV0(objectRow, context)
          : schema === OFFICIAL_FLAT_V0
            ? adaptOfficialFlatV0(objectRow, context)
            : adaptLegacyFlat15Col(raw, context);
      const rowIssues = [
        ...adapted.issues,
        ...(adapted.row
          ? validateNormalizedRow(adapted.row, {
              file: opts.fileName,
              rowNumber,
              catalog: opts.catalog,
              seenCodes,
              seenFingerprints: seenContent,
            })
          : []),
      ];
      const blocked = rowIssues.some((item) => item.row_blocking || item.file_blocking);
      const normalized = blocked ? null : adapted.row;
      preview.push({
        row_number: rowNumber,
        question_code: normalized?.question_code ?? null,
        status: blocked ? "blocked" : "ok",
        normalized,
        content_fingerprint: normalized ? contentFingerprint(normalized) : null,
        issues: rowIssues,
      });
      issues.push(...rowIssues);
    }
  }

  const accepted = preview
    .flatMap((p) => (p.normalized ? [p.normalized] : []))
    .sort((a, b) => a.question_code.localeCompare(b.question_code));
  const sorted = sortIssues(issues);
  const hash = accepted.length
    ? canonicalHash({
        contract_version: "official_normalized_v1",
        source_contract: schema,
        rows: accepted,
      })
    : null;

  return {
    summary: {
      schema,
      file: opts.fileName,
      total_rows: opts.rows.length,
      ok_rows: preview.filter((p) => p.status === "ok").length,
      blocked_rows: preview.filter((p) => p.status === "blocked").length,
      warning_count: sorted.filter((i) => i.severity === "warning").length,
      error_count: sorted.filter((i) => i.severity === "error").length,
      file_blocking: sorted.some((i) => i.file_blocking),
      column_shift_suspected: detected.column_shift_suspected,
    },
    preview,
    issues: sorted,
    accepted_set_hash: hash,
    public_preview: buildPublicPreview(preview),
    privileged_preview: buildPrivilegedPreview(preview),
    apply_token_contract: {
      mintable: false,
      reason: "Dry-run package; apply token is designed but not minted.",
      binds: [
        "actor",
        "tenant_scope",
        "contract",
        "canonical_content_hash",
        "authorization_snapshot",
        "expiry",
      ],
    },
  };
}

export function buildErrorExportModel(
  result: ReturnType<typeof runQuestionBankImportDryRun>,
): Array<Record<string, string | number | boolean | null>> {
  return result.issues.map((i) => ({
    code: i.code,
    message_ar: `'${i.message_ar}`,
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
