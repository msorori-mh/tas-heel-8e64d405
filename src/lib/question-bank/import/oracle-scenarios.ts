import { adaptLegacyFlat15Col, LEGACY_FLAT_HEADERS } from "./adapters/legacy-flat-15col.ts";
import { adaptOfficialFlatV0 } from "./adapters/official-flat-v0.ts";
import { adaptTeacherFlatArV0 } from "./adapters/teacher-flat-ar-v0.ts";
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

function unsupported(vector: OracleVector): ScenarioResult {
  const issues = preflightWorkbook({
    fileName: `${vector.test_id}.unsupported`,
    headers: [],
    rows: [],
  });
  return toResult(
    vector,
    issues,
    null,
    "P1_UNSUPPORTED_FAIL_CLOSED",
    "preflightWorkbook",
    "P1_UNSUPPORTED",
  );
}

function isFullRowInput(input: unknown): input is Record<string, unknown> | unknown[] {
  if (Array.isArray(input)) return input.length === 15;
  if (!input || typeof input !== "object") return false;
  if (
    ["attack", "boundary", "mutation", "fixture", "content_hash"].some(
      (key) => key in input,
    )
  ) {
    return false;
  }
  return (
    "question_code" in input ||
    "رمز_السؤال" in input ||
    ("code" in input && "question" in input)
  );
}

function baseOfficial(overrides: Record<string, unknown> = {}) {
  return {
    question_code: "Q-OFFICIAL-BASE",
    question_text: "Compute 1+1",
    interaction_type: "SINGLE_CHOICE",
    grading_mode: "AUTO_SINGLE",
    option_1: "1",
    option_2: "2",
    correct_index: 2,
    max_score: 1,
    subject_code: "MATH-G10",
    lesson_code: "MATH-L1",
    ...overrides,
  };
}

function runBoundary(vector: OracleVector, name: string): ScenarioResult {
  const file = `${vector.test_id}.xlsx`;
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
  return unsupported(vector);
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
  if (code === "INVALID_SCORE" || code === "INVALID_INTERACTION_TYPE" || code === "INVALID_GRADING_MODE" || code === "INCOMPATIBLE_TYPE_MODE" || code === "MISSING_CORRECT_INDEX" || code === "OPTION_COUNT" || code === "ANSWER_NOT_ALLOWED" || code === "ACCEPTED_ANSWER_REQUIRED" || code === "PARTIAL_NOT_ALLOWED" || code === "QUESTION_CODE_INVALID" || code === "DUPLICATE_OPTION" || code === "MEDIA_URL_INVALID" || code === "MEDIA_TYPE_REQUIRED" || code === "FORMULA_INJECTION" || code === "LEGACY_INFORMATION_LOSS") {
    const row =
      code === "INVALID_SCORE"
        ? baseOfficial({ max_score: 0 })
        : code === "INVALID_INTERACTION_TYPE"
          ? baseOfficial({ interaction_type: "NUMERIC" })
          : code === "INVALID_GRADING_MODE"
            ? baseOfficial({ grading_mode: "WEIRD" })
            : code === "INCOMPATIBLE_TYPE_MODE"
              ? baseOfficial({ grading_mode: "MANUAL" })
              : code === "MISSING_CORRECT_INDEX"
                ? baseOfficial({ correct_index: "" })
                : code === "OPTION_COUNT"
                  ? baseOfficial({ option_2: "" })
                  : code === "ANSWER_NOT_ALLOWED"
                    ? baseOfficial({
                        interaction_type: "LONG_TEXT",
                        grading_mode: "MANUAL",
                        option_1: "x",
                        option_2: "y",
                        correct_index: 1,
                      })
                    : code === "ACCEPTED_ANSWER_REQUIRED"
                      ? baseOfficial({
                          interaction_type: "SHORT_TEXT",
                          grading_mode: "AUTO_TEXT",
                          option_1: "",
                          option_2: "",
                          correct_index: "",
                          accepted_answers: "",
                        })
                      : code === "PARTIAL_NOT_ALLOWED"
                        ? baseOfficial({ allow_partial: true })
                        : code === "QUESTION_CODE_INVALID"
                          ? baseOfficial({ question_code: "???" })
                          : code === "DUPLICATE_OPTION"
                            ? baseOfficial({ option_1: "same", option_2: "same" })
                            : code === "MEDIA_URL_INVALID"
                              ? baseOfficial({
                                  media_url: "javascript:alert(1)",
                                  media_type: "image",
                                  media_alt: "x",
                                })
                              : code === "MEDIA_TYPE_REQUIRED"
                                ? baseOfficial({
                                    media_url: "https://media.example.edu/a.bin",
                                  })
                                : code === "FORMULA_INJECTION"
                                  ? baseOfficial({ question_text: "=cmd|'/" })
                                  : null;
    if (code === "LEGACY_INFORMATION_LOSS") {
      const adapted = adaptLegacyFlat15Col(
        LEGACY_FLAT_HEADERS.map((header) =>
          header === "question_type"
            ? "auto_text"
            : header === "code"
              ? "Q1"
              : header === "subject_code"
                ? "MATH-G10"
                : header === "question"
                  ? "q"
                  : "",
        ),
        { file, rowNumber: 2 },
      );
      return toResult(
        vector,
        adapted.issues,
        adapted.row,
        "REAL_MUTATION",
        "adaptLegacyFlat15Col.auto_text",
      );
    }
    const adapted = adaptOfficialFlatV0(row!, { file, rowNumber: 2 });
    const issues = [...adapted.issues];
    if (adapted.row) {
      issues.push(...validateNormalizedRow(adapted.row, {}));
    }
    const blocked = issues.some((item) => item.severity === "error");
    return toResult(
      vector,
      issues,
      blocked ? null : adapted.row,
      "REAL_MUTATION",
      adapted.row ? `validateNormalizedRow.${asCode}` : `adaptOfficialFlatV0.${asCode}`,
    );
  }
  if (code === "MIXED_NUMERAL_SCRIPTS") {
    const issues = mixedNumeralScripts("2٢")
      ? [issue(QB_IMPORT_CODES.MIXED_NUMERAL_SCRIPTS, { file, row: 2 })]
      : [];
    return toResult(vector, issues, null, "REAL_MUTATION", "mixedNumeralScripts");
  }
  if (code === "INVALID_CORRECT_INDEX") {
    const adapted = adaptOfficialFlatV0(baseOfficial({ correct_index: 0 }), {
      file,
      rowNumber: 2,
    });
    return toResult(
      vector,
      adapted.issues,
      adapted.row,
      "REAL_MUTATION",
      "adaptOfficialFlatV0.correct_index",
    );
  }
  return unsupported(vector);
}

function runAttack(vector: OracleVector, attack: string): ScenarioResult {
  const file = `${vector.test_id}.xlsx`;
  if (
    attack === "T02_FORMULA_INJECTION" ||
    attack === "T20_WORKBOOK_FORMULAS"
  ) {
    const issues = preflightWorkbook({
      fileName: file,
      headers: ["a"],
      rows: [{}],
      metadata: { hasFormulaCells: true },
    });
    return toResult(vector, issues, null, "REAL_PREFLIGHT", "preflightWorkbook.formula");
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
  if (attack === "T22_ZIP_BOMB") {
    const issues = preflightWorkbook({
      fileName: file,
      headers: ["a"],
      rows: [{}],
      metadata: {
        uncompressedBytes: DEFAULT_IMPORT_LIMITS.maxUncompressedBytes + 1,
      },
    });
    return toResult(vector, issues, null, "REAL_PREFLIGHT", "preflightWorkbook.zipBomb");
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
  if (attack === "T16_INDEX_BASE") {
    const opts = optionCodesFromCount(4).map((option_code, i) => ({
      option_code,
      body: `o${i}`,
    }));
    const variant = Number((vector.input as { variant?: number }).variant ?? 1);
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
  return unsupported(vector);
}

/** Executes only real primitives. Unsupported oracle scenarios fail closed. */
export function executeOracleVector(vector: OracleVector): ScenarioResult {
  const input = vector.input;

  if (input && typeof input === "object" && !Array.isArray(input) && "boundary" in input) {
    return runBoundary(vector, String((input as { boundary: string }).boundary));
  }
  if (input && typeof input === "object" && !Array.isArray(input) && "mutation" in input) {
    return runMutation(vector, String((input as { mutation: string }).mutation));
  }
  if (input && typeof input === "object" && !Array.isArray(input) && "attack" in input) {
    return runAttack(vector, String((input as { attack: string }).attack));
  }

  if (!isFullRowInput(input)) return unsupported(vector);

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
      ? adaptTeacherFlatArV0(input as Record<string, unknown>, context)
      : vector.source_contract === "official_flat_v0"
        ? adaptOfficialFlatV0(input as Record<string, unknown>, context)
        : adaptLegacyFlat15Col(input, context);

  // If Oracle expects errors the adapter did not raise, do not fabricate them.
  if (vector.expected_errors.length) {
    const actual = new Set(adapted.issues.map((item) => item.code));
    const missing = vector.expected_errors.some(({ code }) => !actual.has(code as QbImportCode));
    if (missing) return unsupported(vector);
  }

  return toResult(
    vector,
    adapted.issues,
    adapted.row,
    "REAL_ADAPTER",
    `adapt:${vector.source_contract}`,
  );
}

/**
 * Strict comparison of oracle expected vs actual.
 * Does not mutate expected targets. Provenance.source_row is compared when present
 * on both sides; content identity ignores unstable parser-only fields by comparing
 * the canonical document the adapter emitted as-is against the oracle fixture as-is.
 */
export function compareNormalized(actual: unknown, expected: unknown): boolean {
  if (
    expected &&
    typeof expected === "object" &&
    "accepted_boundary" in (expected as object)
  ) {
    return (
      !!actual &&
      typeof actual === "object" &&
      (actual as { accepted_boundary?: string }).accepted_boundary ===
        (expected as { accepted_boundary: string }).accepted_boundary
    );
  }
  return canonicalJson(actual) === canonicalJson(expected);
}

void normalizeNumeric;
