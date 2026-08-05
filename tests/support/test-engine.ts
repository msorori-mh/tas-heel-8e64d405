import JSZip from "jszip";
import ExcelJS from "exceljs";
import {
  adaptLegacyFlat15Col,
  legacyArrayToRow,
  LEGACY_FLAT_15COL,
} from "../../src/lib/question-bank/import/adapters/legacy-flat-15col.ts";
import { adaptTeacherFlatArV0, TEACHER_FLAT_AR_V0 } from "../../src/lib/question-bank/import/adapters/teacher-flat-ar-v0.ts";
import { adaptOfficialFlatV0, OFFICIAL_FLAT_V0 } from "../../src/lib/question-bank/import/adapters/official-flat-v0.ts";
import {
  CONTRACT_HEADERS,
  detectSchemaFromHeaders,
  normalizeHeader,
  type ImportSchemaId,
} from "../../src/lib/question-bank/import/adapters/detect.ts";
import type { OfficialNormalizedV1 } from "../../src/lib/question-bank/import/official-normalized-v1.ts";
import {
  validateNormalizedRow,
  contentFingerprint,
  type CatalogLookup,
} from "../../src/lib/question-bank/import/validate.ts";
import { canonicalHash, compareCodePoints } from "../../src/lib/question-bank/import/canonical-json.ts";
import { issue, sortIssues, type QbImportIssue } from "../../src/lib/question-bank/import/errors.ts";
import { QB_IMPORT_CODES } from "../../src/lib/question-bank/import/validation-codes.ts";
import { preflightWorkbook, type WorkbookParserMetadata } from "../../src/lib/question-bank/import/preflight.ts";
import { buildPrivilegedPreview, buildPublicPreview } from "../../src/lib/question-bank/import/preview.ts";
import {
  parseQuestionBankWorkbook,
  scanOoxmlRelationships,
} from "../../src/lib/question-bank/import/workbook-parser.ts";
import { validateImportAuthorization, QB_IMPORT_DEFAULT_SCOPE } from "../../src/lib/question-bank/import/authorization.ts";
import { preflightZipBytes } from "../../src/lib/question-bank/import/zip-preflight.ts";
import { DEFAULT_IMPORT_LIMITS } from "../../src/lib/question-bank/import/limits.ts";

export type TestEngineInputRow = Record<string, unknown> | unknown[];

export type TestEnginePreviewRow = {
  row_number: number;
  question_code: string | null;
  status: "ok" | "blocked";
  normalized: OfficialNormalizedV1 | null;
  content_fingerprint: string | null;
  issues: ReturnType<typeof issue>[];
};

export type TestEngineOverrides = {
  authGuard?: typeof validateImportAuthorization;
  preflightGuard?: typeof preflightWorkbook;
  schemaDetector?: typeof detectSchemaFromHeaders;
  headersMatcher?: (schema: ImportSchemaId, headers: string[]) => boolean;
  adapter?: (row: any, context?: any, catalog?: any) => { row: OfficialNormalizedV1 | null; issues: QbImportIssue[] };
  rowValidator?: typeof validateNormalizedRow;
  idempotencyChecker?: (existing: Map<string, string>, rows: TestEnginePreviewRow[]) => boolean;
  zipPreflightGuard?: typeof preflightZipBytes;
  externalRelScanner?: typeof scanOoxmlRelationships;
};

export type TestEngineRunOptions = {
  fileName: string;
  headers: string[];
  rows: TestEngineInputRow[];
  schemaHint?: ImportSchemaId;
  catalog?: CatalogLookup;
  fileBytes?: number;
  parserMetadata?: WorkbookParserMetadata;
  authorized?: unknown;
  expectedScope?: string;
  relaxExactHeaders?: boolean;
  overrides?: TestEngineOverrides;
};

function defaultHeadersMatchContract(schema: ImportSchemaId, headers: string[]): boolean {
  if (schema === "unknown") return false;
  const expected = CONTRACT_HEADERS[schema];
  if (headers.length !== expected.length) return false;
  return expected.every((h, i) => normalizeHeader(h) === normalizeHeader(headers[i] ?? ""));
}

export function runTestEngineDryRun(opts: TestEngineRunOptions) {
  const authFn = opts.overrides?.authGuard ?? validateImportAuthorization;
  const preflightFn = opts.overrides?.preflightGuard ?? preflightWorkbook;
  const detectSchemaFn = opts.overrides?.schemaDetector ?? detectSchemaFromHeaders;
  const headersMatcherFn = opts.overrides?.headersMatcher ?? defaultHeadersMatchContract;
  const validateRowFn = opts.overrides?.rowValidator ?? validateNormalizedRow;

  const authVal = authFn(
    opts.authorized,
    opts.expectedScope ?? QB_IMPORT_DEFAULT_SCOPE,
    opts.fileName ?? "workbook.xlsx",
  );

  if (!authVal.ok) {
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
      replay_decision: "FILE_BLOCK" as const,
      public_preview: [],
      privileged_preview: [],
    };
  }

  const objectRows = opts.rows.map((row) =>
    Array.isArray(row) ? legacyArrayToRow(row) : row,
  );
  const issues = [
    ...(opts.parserMetadata?.hasExternalLinks ? [issue(QB_IMPORT_CODES.EXTERNAL_LINK, { file: opts.fileName, stage: "PREFLIGHT_OOXML", source_subsystem: "workbook-parser" })] : []),
    ...preflightFn({
      fileName: opts.fileName,
      headers: opts.headers,
      rows: objectRows,
      fileBytes: opts.fileBytes,
      metadata: opts.parserMetadata,
    }),
  ];

  const detected = detectSchemaFn(opts.headers);
  let schema: ImportSchemaId = detected.schema;

  if (opts.schemaHint && opts.schemaHint !== "unknown") {
    if (detected.schema !== "unknown" && detected.schema !== opts.schemaHint) {
      issues.push(issue(QB_IMPORT_CODES.INVALID_CONTRACT, { file: opts.fileName, stage: "ADAPTER_DETECT", source_subsystem: "detect" }));
    }
    schema = opts.schemaHint;
  }

  if (schema === "unknown") {
    issues.push(issue(QB_IMPORT_CODES.INVALID_CONTRACT, { file: opts.fileName, stage: "ADAPTER_DETECT", source_subsystem: "detect" }));
  } else if (!opts.relaxExactHeaders && !headersMatcherFn(schema, opts.headers)) {
    if (schema === LEGACY_FLAT_15COL && opts.headers.length !== 15) {
      issues.push(issue(QB_IMPORT_CODES.LEGACY_COLUMN_COUNT, { file: opts.fileName, stage: "ADAPTER_DETECT", source_subsystem: "legacy-flat-15col" }));
    } else if (schema === LEGACY_FLAT_15COL) {
      issues.push(issue(QB_IMPORT_CODES.LEGACY_COLUMN_ORDER, { file: opts.fileName, stage: "ADAPTER_DETECT", source_subsystem: "legacy-flat-15col" }));
    } else {
      issues.push(issue(QB_IMPORT_CODES.MISSING_HEADER, { file: opts.fileName, stage: "ADAPTER_DETECT", source_subsystem: "detect" }));
    }
  }

  const preview: TestEnginePreviewRow[] = [];
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
      const adapterFn =
        opts.overrides?.adapter ??
        (schema === TEACHER_FLAT_AR_V0
          ? adaptTeacherFlatArV0
          : schema === OFFICIAL_FLAT_V0
            ? adaptOfficialFlatV0
            : adaptLegacyFlat15Col);
      const adapted = adapterFn(objectRow as any, context as any);
      const rowIssues = [
        ...adapted.issues,
        ...(adapted.row
          ? validateRowFn(adapted.row, {
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

  let allReplaySafe = false;
  let duplicateContent = false;

  if (opts.overrides?.idempotencyChecker) {
    const passed = opts.overrides.idempotencyChecker(existing ?? new Map(), preview);
    allReplaySafe = passed;
    duplicateContent = !passed;
  } else {
    allReplaySafe =
      !!existing?.size &&
      okRows.length > 0 &&
      okRows.every((row) => {
        const prior = existing.get(row.normalized!.question_code);
        return prior != null && prior === row.content_fingerprint;
      });
    const fingerprints = okRows.map((row) => row.content_fingerprint!).filter(Boolean);
    duplicateContent =
      fingerprints.length > 0 &&
      new Set(fingerprints).size !== fingerprints.length;
  }

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
    replay_decision,
    public_preview: buildPublicPreview(preview as any),
    privileged_preview: buildPrivilegedPreview(preview as any),
  };
}

export async function runTestEngineOperationalDryRun(input: {
  fileName: string;
  bytes: Uint8Array;
  catalog: CatalogLookup;
  authorized?: unknown;
  expectedScope?: string;
  parserMetadata?: WorkbookParserMetadata;
  overrides?: TestEngineOverrides;
}) {
  const authFn = input.overrides?.authGuard ?? validateImportAuthorization;
  const zipGuard = input.overrides?.zipPreflightGuard ?? preflightZipBytes;

  // STEP 1: Auth check
  const authVal = authFn(input.authorized, input.expectedScope ?? QB_IMPORT_DEFAULT_SCOPE, input.fileName);
  if (!authVal.ok) {
    return runTestEngineDryRun({
      fileName: input.fileName,
      headers: [],
      rows: [],
      fileBytes: input.bytes?.byteLength ?? 0,
      authorized: input.authorized,
      overrides: input.overrides,
    });
  }

  // STEP 2: Catalog check
  if (!input.catalog?.subjects?.size) {
    throw new Error("Operational dry-run requires catalog.");
  }

  // STEP 3: Raw byte size check
  if (input.bytes.byteLength > DEFAULT_IMPORT_LIMITS.maxFileBytes) {
    return runTestEngineDryRun({
      fileName: input.fileName,
      headers: [],
      rows: [],
      fileBytes: input.bytes.byteLength,
      authorized: input.authorized,
      overrides: input.overrides,
    });
  }

  // STEP 4: ZIP preflight with optional test override
  const zipResult = zipGuard(input.bytes, input.fileName);
  if (!zipResult.ok) {
    return {
      summary: {
        schema: "unknown" as ImportSchemaId,
        file: input.fileName,
        total_rows: 0,
        ok_rows: 0,
        blocked_rows: 0,
        warning_count: 0,
        error_count: zipResult.issues.length,
        file_blocking: true,
        column_shift_suspected: false,
      },
      preview: [],
      issues: sortIssues(zipResult.issues),
      accepted_set_hash: null,
      validation_hash: canonicalHash({ accepted_set_hash: null, issues: sortIssues(zipResult.issues) }),
      replay_decision: "FILE_BLOCK" as const,
      public_preview: [],
      privileged_preview: [],
    };
  }

  // Parse workbook
  const trusted = await parseQuestionBankWorkbook(input.fileName, input.bytes);
  if (input.overrides?.externalRelScanner) {
    try {
      const zip = await JSZip.loadAsync(input.bytes);
      const relScan = await input.overrides.externalRelScanner(zip);
      if (!relScan.hasExternalLinks && !relScan.invalidStructure) {
        trusted.preflight_issues = (trusted.preflight_issues ?? []).filter(
          (i: any) => i.code !== QB_IMPORT_CODES.EXTERNAL_LINK && i.code !== QB_IMPORT_CODES.OOXML_RELATIONSHIP_STRUCTURE_INVALID,
        );
        trusted.metadata = { ...trusted.metadata, hasExternalLinks: false };
        try {
          const workbook = new ExcelJS.Workbook();
          await (workbook.xlsx as any).load(Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength));
          const worksheet = workbook.worksheets[0];
          if (worksheet) {
            const rawRows: string[][] = [];
            worksheet.eachRow({ includeEmpty: true }, (row) => {
              const values: string[] = [];
              row.eachCell({ includeEmpty: true }, (cell) => {
                values.push(cell.text ?? String(cell.value ?? ""));
              });
              rawRows.push(values);
            });
            trusted.headers = rawRows[0] ?? [];
            trusted.rows = rawRows.slice(1).map((r) => Object.fromEntries(trusted.headers.map((h, i) => [h, r[i] ?? ""])));
          }
        } catch {}
      }
    } catch {}
  }
  return runTestEngineDryRun({
    fileName: input.fileName,
    headers: trusted.headers,
    rows: trusted.rows,
    fileBytes: input.bytes.byteLength,
    parserMetadata: { ...trusted.metadata, ...input.parserMetadata },
    catalog: input.catalog,
    authorized: input.authorized,
    overrides: input.overrides,
  });
}
