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
import { compareCodePoints } from "./canonical-json.ts";
import { issue, sortIssues, type QbImportIssue } from "./errors.ts";
import { QB_IMPORT_CODES } from "./validation-codes.ts";
import { preflightWorkbook, type WorkbookParserMetadata } from "./preflight.ts";
import { buildPrivilegedPreview, buildPublicPreview } from "./preview.ts";
import {
  parseQuestionBankWorkbook,
  PARSER_SPY,
  type TrustedWorkbookModel,
} from "./workbook-parser.ts";
import { MUTATION_HOOKS } from "./mutation-hooks.ts";
import { validateImportAuthorization, QB_IMPORT_DEFAULT_SCOPE } from "./authorization.ts";
import { DEFAULT_IMPORT_LIMITS } from "./limits.ts";

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
  authorized?: unknown;
  expectedScope?: string;
  relaxExactHeaders?: boolean;
  unitTestBypassParser?: boolean;
  trustedWorkbook?: TrustedWorkbookModel;
  authIssue?: QbImportIssue;
  preflightIssue?: QbImportIssue;
};

function headersMatchContract(schema: ImportSchemaId, headers: string[]): boolean {
  if (schema === "unknown") return false;
  const expected = CONTRACT_HEADERS[schema];
  if (headers.length !== expected.length) return false;
  return expected.every((h, i) => normalizeHeader(h) === normalizeHeader(headers[i] ?? ""));
}

export function runQuestionBankImportDryRun(opts: DryRunOptions) {
  const authVal = opts.authIssue
    ? { ok: false as const, issue: opts.authIssue }
    : validateImportAuthorization(
        opts.authorized,
        opts.expectedScope ?? QB_IMPORT_DEFAULT_SCOPE,
        opts.fileName ?? "workbook.xlsx",
      );

  if (!authVal.ok) {
    PARSER_SPY.authorizationFailures += 1;
    const sorted = sortIssues([authVal.issue]);
    const validationHash = canonicalHash({ accepted_set_hash: null, issues: sorted });
    return {
      summary: {
        schema: (opts.schemaHint ?? "unknown") as ImportSchemaId,
        file: opts.fileName ?? "workbook.xlsx",
        total_rows: opts.rows?.length ?? 0,
        ok_rows: 0,
        blocked_rows: 0,
        warning_count: 0,
        error_count: sorted.length,
        file_blocking: true,
        column_shift_suspected: false,
      },
      preview: [],
      issues: sorted,
      accepted_set_hash: null,
      validation_hash: validationHash,
      parser_hash: opts.trustedWorkbook?.parser_result_hash ?? null,
      replay_decision: "FILE_BLOCK" as const,
      preview_metadata: {
        contains_sensitive_answers: true,
        required_capability: "question_bank.import.preview_sensitive",
        cache_policy: "NO_STORE",
        parser_version: opts.trustedWorkbook?.trusted_parser_version ?? null,
        validation_hash: validationHash,
        payload_hash: null,
      },
      public_preview: [],
      privileged_preview: [],
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

  if (opts.trustedWorkbook && (!opts.trustedWorkbook.trusted_parser_version || !opts.trustedWorkbook.parser_result_hash)) {
    throw new Error("Trusted parser attestation is incomplete.");
  }
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

  if (opts.preflightIssue) {
    issues.push(opts.preflightIssue);
  }

  if (Array.isArray(opts.trustedWorkbook?.preflight_issues)) {
    issues.push(...(opts.trustedWorkbook.preflight_issues as any[]));
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

  if (!MUTATION_HOOKS.disableRequiredColumnValidation) {
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
  }

  const preview: DryRunPreviewRow[] = [];
  const seenCodes = new Set<string>();
  const seenContent = new Set<string>();
  const fileBlocking = issues.some((item) => item.file_blocking);

  if (!fileBlocking && schema !== "unknown") {
    PARSER_SPY.adapterInvocations += opts.rows.length;
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
    .sort((a, b) => compareCodePoints(a.question_code, b.question_code));
  const sorted = sortIssues(issues);
  const hash = accepted.length
    ? canonicalHash({
        contract_version: "official_normalized_v1",
        source_contract: schema,
        rows: accepted,
      })
    : null;

  const validationHash = canonicalHash({ accepted_set_hash: hash, issues: sorted });
  const okRows = preview.filter((p) => p.status === "ok" && p.normalized);
  const existing = opts.catalog?.existing;
  const allReplaySafe =
    !MUTATION_HOOKS.disableIdempotencyValidation &&
    !!existing?.size &&
    okRows.length > 0 &&
    okRows.every((row) => {
      const prior = existing.get(row.normalized!.question_code);
      return prior != null && prior === row.content_fingerprint;
    });
  const fingerprints = okRows.map((row) => row.content_fingerprint!).filter(Boolean);
  const duplicateContent =
    !MUTATION_HOOKS.disableIdempotencyValidation &&
    fingerprints.length > 0 &&
    new Set(fingerprints).size !== fingerprints.length;

  const replay_decision = sorted.some((item) => item.code === QB_IMPORT_CODES.DUPLICATE_CODE_IN_FILE)
    ? "FILE_BLOCK"
    : sorted.some((item) => item.code === QB_IMPORT_CODES.IMPORT_REPLAY_CONFLICT)
      ? "IMPORT_REPLAY_CONFLICT"
      : sorted.some((item) => item.file_blocking)
        ? "FILE_BLOCK"
        : allReplaySafe
          ? "REPLAY_SAFE_NOOP"
          : duplicateContent
            ? "DUPLICATE_CONTENT"
            : "ACCEPTABLE_DRAFT";

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
    validation_hash: validationHash,
    parser_hash: opts.trustedWorkbook?.parser_result_hash ?? null,
    replay_decision,
    preview_metadata: {
      contains_sensitive_answers: true,
      required_capability: "question_bank.import.preview_sensitive",
      cache_policy: "NO_STORE",
      parser_version: opts.trustedWorkbook?.trusted_parser_version ?? null,
      validation_hash: validationHash,
      payload_hash: hash,
    },
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

/** Operational file-bytes path. First verifies authorization BEFORE any parser or file inspection. */
export async function runOperationalQuestionBankImportDryRun(input: {
  fileName: string;
  bytes: Uint8Array;
  catalog: CatalogLookup;
  authorized?: unknown;
  expectedScope?: string;
}) {
  // STEP 1: AUTHORIZATION (FIRST! Before catalog check, before parser, before ZIP, before JSZip/ExcelJS)
  const authVal = validateImportAuthorization(input.authorized, input.expectedScope ?? QB_IMPORT_DEFAULT_SCOPE, input.fileName);
  if (!authVal.ok) {
    PARSER_SPY.authorizationFailures += 1;
    return runQuestionBankImportDryRun({
      fileName: input.fileName,
      headers: [],
      rows: [],
      fileBytes: input.bytes?.byteLength ?? 0,
      authorized: input.authorized,
      authIssue: authVal.issue,
    });
  }

  // STEP 2: Cheap request metadata validation
  if (!input.catalog?.subjects?.size) {
    throw new Error("Operational dry-run requires a non-empty curriculum catalog snapshot.");
  }

  // STEP 3: Cheap raw-byte file-size guard
  if (input.bytes.byteLength > DEFAULT_IMPORT_LIMITS.maxFileBytes) {
    return runQuestionBankImportDryRun({
      fileName: input.fileName,
      headers: [],
      rows: [],
      fileBytes: input.bytes.byteLength,
      authorized: input.authorized,
      preflightIssue: issue(QB_IMPORT_CODES.FILE_TOO_LARGE, { file: input.fileName }),
    });
  }

  // STEP 4, 5, 6: ZIP preflight, OOXML scan, workbook parsing
  const trustedWorkbook = await parseQuestionBankWorkbook(input.fileName, input.bytes);
  if (!trustedWorkbook.trusted_parser_version || !trustedWorkbook.parser_result_hash) {
    throw new Error("Trusted parser attestation is required.");
  }

  return runQuestionBankImportDryRun({
    fileName: input.fileName,
    headers: trustedWorkbook.headers,
    rows: trustedWorkbook.rows,
    fileBytes: input.bytes.byteLength,
    parserMetadata: trustedWorkbook.metadata,
    trustedWorkbook,
    catalog: input.catalog,
    authorized: input.authorized,
  });
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
