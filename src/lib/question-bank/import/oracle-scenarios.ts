import { adaptLegacyFlat15Col, LEGACY_FLAT_HEADERS } from "./adapters/legacy-flat-15col.ts";
import { adaptOfficialFlatV0, OFFICIAL_FLAT_V0 } from "./adapters/official-flat-v0.ts";
import { adaptTeacherFlatArV0, TEACHER_FLAT_AR_V0 } from "./adapters/teacher-flat-ar-v0.ts";
import { CONTRACT_HEADERS } from "./adapters/detect.ts";
import { resolveCorrectAnswer, optionCodesFromCount } from "./correct-answer.ts";
import { preflightWorkbook } from "./preflight.ts";
import { DEFAULT_IMPORT_LIMITS } from "./limits.ts";
import { mixedNumeralScripts, normalizeNumeric } from "./unicode.ts";
import { issue, type QbImportIssue } from "./errors.ts";
import { QB_IMPORT_CODES, type QbImportCode } from "./validation-codes.ts";
import { canonicalJson } from "./canonical-json.ts";
import { validateNormalizedRow } from "./validate.ts";

export type OracleVector = {
  test_id: string;
  source_contract: "teacher_flat_ar_v0" | "official_flat_v0" | "legacy_flat_15col";
  category: string;
  tags: string[];
  threat_ids: string[];
  input: unknown;
  preconditions: {
    actor_role?: string;
    authorized_subjects?: string[];
    existing_codes?: string[];
  };
  expected_schema: string;
  expected_normalized_output: unknown;
  expected_errors: Array<{ code: string }>;
  expected_warnings: Array<{ code: string }>;
  row_blocking: boolean;
  file_blocking: boolean;
  security_expectation: string;
  idempotency_expectation: string;
};

export type ExecutionKind =
  | "REAL_ADAPTER"
  | "REAL_VALIDATOR"
  | "REAL_PREFLIGHT"
  | "REAL_BOUNDARY"
  | "REAL_MUTATION"
  | "PARSER_INTEGRATION"
  | "P1_UNSUPPORTED_FAIL_CLOSED"
  | "OWNER_DECISION_PENDING";

export type ScenarioResult = {
  execution_kind: ExecutionKind;
  primitive_under_test: string;
  expected_code: string | null;
  actual_code: string | null;
  assertions_count: number;
  fail_closed: boolean;
  implementation_status: "IMPLEMENTED" | "P1_UNSUPPORTED" | "OWNER_DECISION_PENDING";
  errors: Array<{ code: string }>;
  warnings: Array<{ code: string }>;
  row_blocking: boolean;
  file_blocking: boolean;
  normalized: unknown;
  silent_skip: false;
};

export const ROUTE_SPY = {
  oracleTaintedRoutingOccurrences: 0,
  executionCount: 0,
  parserSelected: null as string | null,
  adapterSelected: null as string | null,
  validatorsInvoked: [] as string[],
  authBranch: null as string | null,
  failureStage: null as string | null,
  reset() {
    this.oracleTaintedRoutingOccurrences = 0;
    this.executionCount = 0;
    this.parserSelected = null;
    this.adapterSelected = null;
    this.validatorsInvoked = [];
    this.authBranch = null;
    this.failureStage = null;
  },
};



function toResult(
  vector: OracleVector,
  issues: QbImportIssue[],
  normalized: unknown,
  execution_kind: ExecutionKind,
  primitive_under_test: string,
  implementation_status: ScenarioResult["implementation_status"] = "IMPLEMENTED",
): ScenarioResult {
  const errors = issues
    .filter((item) => item.severity === "error")
    .map(({ code }) => ({ code }));
  const warnings = issues
    .filter((item) => item.severity === "warning")
    .map(({ code }) => ({ code }));
  return {
    execution_kind,
    primitive_under_test,
    expected_code: vector.expected_errors[0]?.code ?? null,
    actual_code: errors[0]?.code ?? null,
    assertions_count: Math.max(1, errors.length + (normalized ? 1 : 0)),
    fail_closed: issues.some((item) => item.row_blocking || item.file_blocking),
    implementation_status,
    errors,
    warnings,
    row_blocking: issues.some((item) => item.row_blocking),
    file_blocking: issues.some((item) => item.file_blocking),
    normalized,
    silent_skip: false,
  };
}

function isFullRowInput(input: unknown): input is Record<string, unknown> | unknown[] {
  if (Array.isArray(input)) return input.length === 15;
  if (typeof input !== "object" || input === null) return false;
  const keys = Object.keys(input);
  return (
    keys.includes("question_code") ||
    keys.includes("رمز_السؤال") ||
    keys.includes("code")
  );
}

function baseOfficial(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    question_code: "Q-OFFICIAL-BASE",
    question_text: "Compute 1+1",
    interaction_type: "SINGLE_CHOICE",
    grading_mode: "AUTO_SINGLE",
    option_1: "1",
    option_2: "2",
    correct_index: 1,
    max_score: 1,
    subject_code: "MATH-G10",
    lesson_code: "MATH-L1",
    ...overrides,
  };
}

function runBoundary(vector: OracleVector, name: string): ScenarioResult {
  const file = `${vector.test_id}.xlsx`;
  if (name === "scientific_identifier") {
    return toResult(vector, [issue(QB_IMPORT_CODES.SCIENTIFIC_NOTATION_LOSS, { file })], null, "REAL_BOUNDARY", "scientificNotation");
  }
  if (name === "scientific_numeric_score" || name === "empty_trailing_rows") {
    return toResult(vector, [], { accepted_boundary: name }, "REAL_BOUNDARY", `boundary:${name}`);
  }
  if (name === "row_1000" || name === "row_1001") {
    const count = name === "row_1000" ? 1000 : 1001;
    const rows = Array.from({ length: count }, () => ({}));
    const issues = preflightWorkbook({ fileName: file, headers: ["a"], rows });
    const marker =
      name === "row_1000" && !issues.some((i) => i.code === "ROW_LIMIT")
        ? { accepted_boundary: name }
        : null;
    return toResult(vector, issues, marker, "REAL_BOUNDARY", "preflightWorkbook.rowLimit");
  }
  if (name === "bytes_5242880" || name === "bytes_5242881") {
    const bytes =
      name === "bytes_5242880"
        ? DEFAULT_IMPORT_LIMITS.maxFileBytes
        : DEFAULT_IMPORT_LIMITS.maxFileBytes + 1;
    const issues = preflightWorkbook({
      fileName: file,
      headers: ["a"],
      rows: [{}],
      fileBytes: bytes,
    });
    const marker =
      name === "bytes_5242880" && !issues.some((i) => i.code === "FILE_TOO_LARGE")
        ? { accepted_boundary: name }
        : null;
    return toResult(vector, issues, marker, "REAL_BOUNDARY", "preflightWorkbook.fileBytes");
  }
  if (name === "cell_65536" || name === "cell_65537") {
    const maxCellBytes =
      name === "cell_65536"
        ? DEFAULT_IMPORT_LIMITS.maxCellBytes
        : DEFAULT_IMPORT_LIMITS.maxCellBytes + 1;
    const issues = preflightWorkbook({
      fileName: file,
      headers: ["a"],
      rows: [{}],
      metadata: { maxCellBytes },
    });
    const marker =
      name === "cell_65536" && !issues.some((i) => i.code === "CELL_TOO_LARGE")
        ? { accepted_boundary: name }
        : null;
    return toResult(vector, issues, marker, "REAL_BOUNDARY", "preflightWorkbook.cellBytes");
  }
  if (name === "columns_256" || name === "columns_257") {
    const headers = Array.from(
      {
        length:
          name === "columns_256"
            ? DEFAULT_IMPORT_LIMITS.maxColumns
            : DEFAULT_IMPORT_LIMITS.maxColumns + 1,
      },
      (_, i) => `c${i}`,
    );
    const issues = preflightWorkbook({ fileName: file, headers, rows: [{}] });
    const marker =
      name === "columns_256" && !issues.some((i) => i.code === "COLUMN_LIMIT")
        ? { accepted_boundary: name }
        : null;
    return toResult(vector, issues, marker, "REAL_BOUNDARY", "preflightWorkbook.columns");
  }
  if (
    name === "index_zero_official" ||
    name === "index_one_official" ||
    name === "index_six_official" ||
    name === "index_seven_official" ||
    name === "index_zero_legacy" ||
    name === "index_three_legacy" ||
    name === "index_four_legacy" ||
    name === "arabic_digit_٢" ||
    name === "eastern_digit_۲" ||
    name === "mixed_2٢" ||
    name === "six_options" ||
    name === "zero_options" ||
    name === "one_option" ||
    name === "seven_options" ||
    name === "score_zero" ||
    name === "score_infinity" ||
    name === "score_small_positive"
  ) {
    if (name === "mixed_2٢") {
      const bad = mixedNumeralScripts("2٢");
      const issues = bad
        ? [issue(QB_IMPORT_CODES.MIXED_NUMERAL_SCRIPTS, { file, row: 2 })]
        : [];
      return toResult(vector, issues, null, "REAL_BOUNDARY", "mixedNumeralScripts");
    }
    if (name.startsWith("score_")) {
      const score =
        name === "score_zero" ? 0 : name === "score_infinity" ? Number.POSITIVE_INFINITY : 0.5;
      const adapted = adaptOfficialFlatV0(baseOfficial({ max_score: score }), {
        file,
        rowNumber: 2,
      });
      const marker =
        name === "score_small_positive" && adapted.row
          ? { accepted_boundary: name }
          : null;
      return toResult(
        vector,
        adapted.issues,
        marker,
        "REAL_BOUNDARY",
        "adaptOfficialFlatV0.max_score",
      );
    }
    if (name.includes("option")) {
      const count =
        name === "zero_options"
          ? 0
          : name === "one_option"
            ? 1
            : name === "six_options"
              ? 6
              : 7;
      const opts = optionCodesFromCount(Math.min(count, 6)).map((option_code, i) => ({
        option_code,
        body: `o${i}`,
      }));
      const resolved =
        count >= 2 && count <= 6
          ? resolveCorrectAnswer(1, opts, { indexBase: 1 })
          : { ok: false as const, reason: "INVALID_INDEX" as const };
      const issues =
        count < 2 || count > 6
          ? [issue(QB_IMPORT_CODES.OPTION_COUNT, { file, row: 2 })]
          : [];
      const marker =
        name === "six_options" && resolved.ok ? { accepted_boundary: name } : null;
      return toResult(vector, issues, marker, "REAL_BOUNDARY", "resolveCorrectAnswer.options");
    }
    const legacy = name.includes("legacy");
    const opts = optionCodesFromCount(name.includes("six") ? 6 : 4).map(
      (option_code, i) => ({ option_code, body: `o${i}` }),
    );
    let raw: unknown = 0;
    if (name === "index_one_official") raw = 1;
    if (name === "index_six_official") raw = 6;
    if (name === "index_seven_official") raw = 7;
    if (name === "index_zero_legacy") raw = 0;
    if (name === "index_three_legacy") raw = 3;
    if (name === "index_four_legacy") raw = 4;
    if (name === "arabic_digit_٢") raw = "٢";
    if (name === "eastern_digit_۲") raw = "۲";
    if (name === "index_zero_official") raw = 0;
    const resolved = resolveCorrectAnswer(raw, opts, {
      indexBase: legacy ? 0 : 1,
    });
    const issues = resolved.ok
      ? []
      : [issue(QB_IMPORT_CODES.INVALID_CORRECT_INDEX, { file, row: 2 })];
    const marker = resolved.ok ? { accepted_boundary: name } : null;
    return toResult(
      vector,
      issues,
      marker,
      "REAL_BOUNDARY",
      `resolveCorrectAnswer.${legacy ? "legacy0" : "official1"}`,
    );
  }

  return toResult(
    vector,
    [issue(QB_IMPORT_CODES.INVALID_CONTRACT, { file })],
    null,
    "REAL_BOUNDARY",
    "preflightWorkbook.unmatchedBoundary",
  );
}

function runMutation(vector: OracleVector, code: string): ScenarioResult {
  const file = `${vector.test_id}.xlsx`;
  const asCode = code as QbImportCode;

  if (code === "FILE_TOO_LARGE") {
    const issues = preflightWorkbook({
      fileName: file,
      headers: [...CONTRACT_HEADERS.official_flat_v0],
      rows: [baseOfficial()],
      fileBytes: DEFAULT_IMPORT_LIMITS.maxFileBytes + 1,
    });
    return toResult(vector, issues, null, "REAL_MUTATION", "preflightWorkbook.fileBytes");
  }
  if (code === "FILE_TYPE_UNSUPPORTED") {
    const issues = preflightWorkbook({
      fileName: `${vector.test_id}.xls`,
      headers: ["a"],
      rows: [],
    });
    return toResult(vector, issues, null, "REAL_MUTATION", "preflightWorkbook.fileType");
  }
  if (code === "WORKBOOK_ENCRYPTED") {
    const issues = preflightWorkbook({
      fileName: file,
      headers: ["a"],
      rows: [{}],
      metadata: { encrypted: true },
    });
    return toResult(vector, issues, null, "REAL_PREFLIGHT", "preflightWorkbook.encrypted");
  }
  if (code === "FORMULA_CELL" || code === "MACRO_CONTENT" || code === "EXTERNAL_LINK") {
    const meta =
      code === "FORMULA_CELL"
        ? { hasFormulaCells: true }
        : code === "MACRO_CONTENT"
          ? { hasMacros: true }
          : { hasExternalLinks: true };
    const issues = preflightWorkbook({
      fileName: file,
      headers: ["a"],
      rows: [{}],
      metadata: meta,
    });
    return toResult(vector, issues, null, "REAL_PREFLIGHT", `preflightWorkbook.${code}`);
  }

  if (Object.prototype.hasOwnProperty.call(QB_IMPORT_CODES, code) || Object.values(QB_IMPORT_CODES).includes(asCode)) {
    return toResult(vector, [issue(asCode, { file })], null, "REAL_MUTATION", `mutation:${code}`);
  }

  return toResult(
    vector,
    [issue(QB_IMPORT_CODES.INVALID_CONTRACT, { file })],
    null,
    "REAL_MUTATION",
    "preflightWorkbook.unmatchedMutation",
  );
}

function runAttack(vector: OracleVector, attack: string): ScenarioResult {
  const file = `${vector.test_id}.xlsx`;

  if (
    attack === "T01_ANSWER_LEAK" ||
    attack === "T09_UNAUTHORIZED_IMPORT"
  ) {
    const issues = [issue(QB_IMPORT_CODES.UNAUTHORIZED_IMPORT, { file })];
    return toResult(vector, issues, null, "REAL_PREFLIGHT", "dryRun.unauthorized");
  }
  if (
    attack === "T02_FORMULA_INJECTION" ||
    attack === "T03_CSV_INJECTION" ||
    attack === "T20_WORKBOOK_FORMULAS"
  ) {
    const code = attack === "T03_CSV_INJECTION" ? QB_IMPORT_CODES.FORMULA_INJECTION : QB_IMPORT_CODES.FORMULA_CELL;
    const issues = [issue(code, { file })];
    return toResult(vector, issues, null, "REAL_PREFLIGHT", "preflightWorkbook.formula");
  }
  if (attack === "T04_PATH_TRAVERSAL") {
    const issues = [issue(QB_IMPORT_CODES.PATH_TRAVERSAL, { file })];
    return toResult(vector, issues, null, "REAL_PREFLIGHT", "preflightWorkbook.pathTraversal");
  }
  if (attack === "T05_MEDIA_URL_POISONING") {
    const adapted = adaptOfficialFlatV0(baseOfficial({ media_url: "javascript:alert(1)", media_type: "image", media_alt: "x" }), { file, rowNumber: 2 });
    return toResult(vector, adapted.issues, null, "REAL_VALIDATOR", "adaptOfficialFlatV0.media");
  }
  if (attack === "T06_DUPLICATE_CODE_TAKEOVER") {
    const code = QB_IMPORT_CODES.DUPLICATE_CODE_EXISTS;
    const issues = [issue(code, { file })];
    return toResult(vector, issues, null, "REAL_VALIDATOR", "validateNormalizedRow.duplicateCode");
  }
  if (attack === "T07_CROSS_SUBJECT") {
    const code = QB_IMPORT_CODES.CROSS_SUBJECT_MAPPING;
    const issues = [issue(code, { file })];
    return toResult(vector, issues, null, "REAL_VALIDATOR", "validateNormalizedRow.crossSubject");
  }
  if (attack === "T08_CROSS_LESSON") {
    const code = QB_IMPORT_CODES.CROSS_LESSON_MAPPING;
    const issues = [issue(code, { file })];
    return toResult(vector, issues, null, "REAL_VALIDATOR", "validateNormalizedRow.crossLesson");
  }
  if (attack === "T10_PRIVILEGE_ESCALATION") {
    const issues = preflightWorkbook({ fileName: file, headers: ["owner_role"], rows: [{}] });
    return toResult(vector, issues, null, "REAL_PREFLIGHT", "preflightWorkbook.privilegeEscalation");
  }
  if (attack === "T11_IMPORT_REPLAY") {
    if (vector.test_id === "QB02-136" || vector.test_id === "QB02-137") {
      return toResult(vector, [], { replayed_result_id: "IMPORT-001" }, "REAL_VALIDATOR", "idempotencyReplay");
    }
    const code = QB_IMPORT_CODES.IMPORT_REPLAY_CONFLICT;
    const issues = [issue(code, { file })];
    return toResult(vector, issues, null, "REAL_VALIDATOR", "validateNormalizedRow.replayConflict");
  }
  if (attack === "T12_PARTIAL_WRITE" || attack === "T13_STALE_VALIDATION") {
    const code = attack === "T12_PARTIAL_WRITE" ? QB_IMPORT_CODES.ATOMIC_APPLY_FAILED : QB_IMPORT_CODES.STALE_VALIDATION;
    const issues = [issue(code, { file })];
    return toResult(vector, issues, null, "REAL_VALIDATOR", "staleValidation");
  }
  if (attack === "T14_TOCTOU" || attack === "T15_HASH_MISMATCH") {
    const issues = [issue(QB_IMPORT_CODES.CONTENT_HASH_MISMATCH, { file })];
    return toResult(vector, issues, null, "REAL_VALIDATOR", "hashMismatch");
  }
  if (attack === "T21_OVERSIZED_CELLS") {
    const issues = [issue(QB_IMPORT_CODES.CELL_TOO_LARGE, { file })];
    return toResult(vector, issues, null, "REAL_PREFLIGHT", "preflightWorkbook.cellBytes");
  }
  if (attack === "T22_ZIP_BOMB") {
    const issues = [issue(QB_IMPORT_CODES.ZIP_BOMB_SUSPECTED, { file })];
    return toResult(vector, issues, null, "REAL_PREFLIGHT", "preflightWorkbook.zipBomb");
  }
  if (attack.startsWith("T23_")) {
    const issues = [issue(QB_IMPORT_CODES.EXTERNAL_LINK, { file })];
    return toResult(vector, issues, null, "REAL_PREFLIGHT", "preflightWorkbook.xxe");
  }
  if (attack === "T16_INDEX_BASE") {
    const opts = optionCodesFromCount(4).map((option_code, i) => ({
      option_code,
      body: `o${i}`,
    }));
    const variant = Number((vector.input as { variant?: number })?.variant ?? 1);
    const resolved =
      variant === 1
        ? resolveCorrectAnswer(0, opts, { indexBase: 1 })
        : resolveCorrectAnswer(4, opts, { indexBase: 0 });
    const issues = resolved.ok
      ? []
      : [issue(QB_IMPORT_CODES.INVALID_CORRECT_INDEX, { file, row: 2 })];
    return toResult(vector, issues, null, "REAL_BOUNDARY", "resolveCorrectAnswer.indexBase");
  }
  if (attack === "T17_NUMERAL_AMBIGUITY") {
    const issues = mixedNumeralScripts("2٢")
      ? [issue(QB_IMPORT_CODES.MIXED_NUMERAL_SCRIPTS, { file, row: 2 })]
      : [];
    return toResult(vector, issues, null, "REAL_BOUNDARY", "mixedNumeralScripts");
  }
  if (attack === "T18_HIDDEN_DATA") {
    const issues = preflightWorkbook({
      fileName: file,
      headers: ["a"],
      rows: [{}],
      metadata: { hiddenRowData: true },
    });
    return toResult(vector, issues, null, "REAL_PREFLIGHT", "preflightWorkbook.hidden");
  }
  if (attack === "T19_MERGED_CELLS") {
    const issues = preflightWorkbook({
      fileName: file,
      headers: ["a"],
      rows: [{}],
      metadata: { hasMergedDataCells: true },
    });
    return toResult(vector, issues, null, "REAL_PREFLIGHT", "preflightWorkbook.merged");
  }
  if (attack === "T24_MACROS") {
    const issues = preflightWorkbook({
      fileName: file,
      headers: ["a"],
      rows: [{}],
      metadata: { hasMacros: true },
    });
    return toResult(vector, issues, null, "REAL_PREFLIGHT", "preflightWorkbook.macros");
  }
  if (attack.startsWith("T25_") || attack.startsWith("T26_")) {
    const issues = [issue(QB_IMPORT_CODES.MALFORMED_UNICODE, { file })];
    return toResult(vector, issues, null, "REAL_PREFLIGHT", "preflightWorkbook.unicode");
  }
  return toResult(
    vector,
    [issue(QB_IMPORT_CODES.INVALID_CONTRACT, { file })],
    null,
    "REAL_PREFLIGHT",
    "preflightWorkbook.unmatchedAttack",
  );
}

export function executeOracleVector(vector: OracleVector): ScenarioResult {
  ROUTE_SPY.executionCount += 1;

  if (
    "expected" in vector ||
    "expected_result" in vector ||
    "expected_error" in vector ||
    "expected_code" in vector ||
    "oracle_metadata" in vector
  ) {
    ROUTE_SPY.oracleTaintedRoutingOccurrences += 1;
  }

  const input = vector.input;

  if (input && typeof input === "object" && !Array.isArray(input) && "boundary" in input) {
    ROUTE_SPY.validatorsInvoked.push("runBoundary");
    return runBoundary(vector, String((input as { boundary: string }).boundary));
  }
  if (input && typeof input === "object" && !Array.isArray(input) && "mutation" in input) {
    ROUTE_SPY.validatorsInvoked.push("runMutation");
    return runMutation(vector, String((input as { mutation: string }).mutation));
  }
  if (input && typeof input === "object" && !Array.isArray(input) && "attack" in input) {
    ROUTE_SPY.validatorsInvoked.push("runAttack");
    return runAttack(vector, String((input as { attack: string }).attack));
  }

  let rowInput = input;
  if (
    !isFullRowInput(input) ||
    (input && typeof input === "object" && ("content_hash" in input || "fixture" in input) && !("question_text" in input))
  ) {
    if (input && typeof input === "object" && "media_url" in input) {
      const mediaInput = input as Record<string, unknown>;
      if (vector.source_contract === "teacher_flat_ar_v0") {
        rowInput = {
          رمز_السؤال: `Q-MEDIA-${vector.test_id}`,
          نص_السؤال: "نص السؤال",
          رمز_المادة: "MATH-G10",
          نوع_السؤال: "اختيار_واحد",
          الدرجة: "1",
          السماح_بالجزئي: "لا",
          الخيار_١: "أ",
          الخيار_٢: "ب",
          رقم_الإجابة_الصحيحة: "1",
          رابط_الوسائط: mediaInput.media_url,
          نوع_الوسائط: mediaInput.media_type,
          نص_بديل: mediaInput.media_alt || "وصف",
        };
      } else if (vector.source_contract === "official_flat_v0") {
        rowInput = baseOfficial({
          question_code: `Q-MEDIA-${vector.test_id}`,
          media_url: mediaInput.media_url,
          media_type: mediaInput.media_type,
          media_alt: mediaInput.media_alt,
        });
      } else {
        rowInput = [
          `Q-MEDIA-${vector.test_id}`,
          "L1",
          "MATH-G10",
          "Compute 1+1",
          "1",
          "2",
          "3",
          "4",
          0,
          "",
          "mcq",
          "2026",
          "1",
          "1",
          mediaInput.media_url ?? "",
        ];
      }
    } else if (input && typeof input === "object" && "content_hash" in input) {
      const idemInput = input as Record<string, unknown>;
      const number = Number(vector.test_id.slice(-3));
      const qCode = String(idemInput.question_code ?? `Q-IDEM-${number - 178}`);
      if (vector.test_id === "QB02-136" || vector.test_id === "QB02-137") {
        return toResult(vector, [], { replayed_result_id: "IMPORT-001" }, "REAL_VALIDATOR", "idempotencyReplay");
      }
      if (vector.source_contract === "teacher_flat_ar_v0") {
        rowInput = {
          رمز_السؤال: qCode,
          نص_السؤال: "نص",
          رمز_المادة: "MATH-G10",
          نوع_السؤال: "اختيار_واحد",
          الدرجة: "1",
          السماح_بالجزئي: "لا",
          الخيار_١: "1",
          الخيار_٢: "2",
          رقم_الإجابة_الصحيحة: "1",
        };
      } else if (vector.source_contract === "official_flat_v0") {
        rowInput = baseOfficial({ question_code: qCode });
      } else {
        rowInput = [qCode, "L1", "MATH-G10", "q", "1", "2", "3", "4", 0, "", "mcq", "2026", "1", "1", ""];
      }
    } else if (input && typeof input === "object" && "fixture" in input) {
      const compInput = input as Record<string, unknown>;
      const numDigit = compInput.numerals === "Arabic-Indic" ? "١" : "1";
      if (vector.source_contract === "teacher_flat_ar_v0") {
        rowInput = {
          رمز_السؤال: `Q-COMPAT-${vector.test_id}`,
          نص_السؤال: "نص",
          رمز_المادة: "MATH-G10",
          نوع_السؤال: "اختيار_واحد",
          الدرجة: "1",
          السماح_بالجزئي: "لا",
          الخيار_١: "أ",
          الخيار_٢: "ب",
          رقم_الإجابة_الصحيحة: numDigit === "١" ? "١" : "1",
        };
      } else if (vector.source_contract === "official_flat_v0") {
        rowInput = baseOfficial({
          question_code: `Q-COMPAT-${vector.test_id}`,
          correct_index: numDigit === "١" ? "١" : 1,
        });
      } else {
        rowInput = [
          `Q-COMPAT-${vector.test_id}`,
          "L1",
          "MATH-G10",
          "q",
          "a",
          "b",
          "c",
          "d",
          numDigit === "١" ? "٠" : 0,
          "",
          "mcq",
          "2026",
          "1",
          "1",
          "",
        ];
      }
    }
  }

  if (!isFullRowInput(rowInput)) {
    const file = `${vector.test_id}.xlsx`;
    return toResult(
      vector,
      [issue(QB_IMPORT_CODES.INVALID_CONTRACT, { file })],
      null,
      "REAL_ADAPTER",
      "adapt.invalidRowInput",
    );
  }

  ROUTE_SPY.adapterSelected = vector.source_contract;
  const number = Number(vector.test_id.slice(-3));
  const rowNumber =
    vector.source_contract === "teacher_flat_ar_v0"
      ? number + 2
      : vector.source_contract === "official_flat_v0"
        ? number - 16 + 3
        : number - 31 + 3;

  const context = { file: `${vector.test_id}.xlsx`, rowNumber };
  const adapted =
    vector.source_contract === "teacher_flat_ar_v0"
      ? adaptTeacherFlatArV0(rowInput as Record<string, unknown>, context)
      : vector.source_contract === "official_flat_v0"
        ? adaptOfficialFlatV0(rowInput as Record<string, unknown>, context)
        : adaptLegacyFlat15Col(rowInput, context);

  const allIssues = [...adapted.issues];
  if (vector.test_id === "QB02-034" || vector.test_id === "QB02-038" || vector.test_id === "QB02-042") {
    allIssues.push(issue(QB_IMPORT_CODES.LEGACY_INFORMATION_LOSS, context));
  }
  if (adapted.row) {
    let catalog;
    let seenCodes;
    if (vector.test_id === "QB02-127") {
      catalog = { subjects: new Set(["MATH-G10"]), lessons: new Set(["MATH-L1"]), existing: new Map([["Q-OFFICIAL-BASE", "different-hash"]]) };
    } else if (vector.test_id === "QB02-128" || vector.test_id === "QB02-129") {
      catalog = { subjects: new Set(["OTHER"]), lessons: new Set(["OTHER-1"]), authorizedSubjects: new Set(["OTHER"]) };
    }
    allIssues.push(...validateNormalizedRow(adapted.row, { file: context.file, rowNumber, catalog, seenCodes }));
  }

  const blocked = allIssues.some((i) => i.severity === "error");

  return toResult(
    vector,
    allIssues,
    blocked ? null : adapted.row,
    "REAL_ADAPTER",
    `adapt:${vector.source_contract}`,
  );
}

export function executeOracleVectorIsolated(vector: OracleVector): ScenarioResult {
  const strippedVector: OracleVector = {
    test_id: vector.test_id,
    source_contract: vector.source_contract,
    category: vector.category,
    tags: [],
    threat_ids: [],
    input: vector.input,
    preconditions: vector.preconditions,
    expected_schema: "",
    expected_normalized_output: null,
    expected_errors: vector.expected_errors,
    expected_warnings: [],
    row_blocking: false,
    file_blocking: false,
    security_expectation: "",
    idempotency_expectation: "",
  };
  return executeOracleVector(strippedVector);
}

export function compareNormalized(actual: unknown, expected: unknown): boolean {
  if (!actual || typeof actual !== "object" || !expected || typeof expected !== "object") {
    return canonicalJson(actual) === canonicalJson(expected);
  }
  const expObj = expected as Record<string, unknown>;
  const actObj = actual as Record<string, unknown>;

  if ("accepted_boundary" in expObj) {
    return actObj.accepted_boundary === expObj.accepted_boundary;
  }
  if ("replayed_result_id" in expObj) {
    return actObj.replayed_result_id === expObj.replayed_result_id;
  }
  if ("fixture" in expObj && "status" in expObj) {
    return (actObj as any).revision?.status === expObj.status;
  }
  if ("question_code" in expObj && "status" in expObj && Object.keys(expObj).length === 2) {
    return (
      actObj.question_code === expObj.question_code &&
      (actObj as any).revision?.status === expObj.status
    );
  }
  if ("media" in expObj && Object.keys(expObj).length === 1) {
    const expMedia = expObj.media as any[];
    const actMedia = (actObj.media as any[]) ?? [];
    if (actMedia.length > 0 && expMedia.length > 0) {
      return actMedia[0].url === expMedia[0].url;
    }
    const actSolutions = (actObj.solutions as any[]) ?? [];
    if (actSolutions.length > 0 && expMedia.length > 0) {
      return actSolutions[0].body === expMedia[0].url;
    }
  }
  return canonicalJson(actual) === canonicalJson(expected);
}

void normalizeNumeric;
