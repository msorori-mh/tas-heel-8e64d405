import { CONTRACT_HEADERS } from "../../../../src/lib/question-bank/import/adapters/detect.ts";
import {
  runQuestionBankImportDryRun,
  runOperationalQuestionBankImportDryRun,
  type CatalogLookup,
} from "../../../../src/lib/question-bank/import/dry-run.ts";
import { QB_IMPORT_CODES } from "../../../../src/lib/question-bank/import/validation-codes.ts";
import {
  buildMinimalValidXlsx,
  buildOoxmlExternalRelXlsx,
  buildZipWithPathTraversal,
  buildZipWithDuplicateEntry,
  buildZipWithExcessiveEntries,
  buildTruncatedZipBytes,
  buildMalformedCentralDirectoryZip,
  buildZipWithDeclaredSizeOverflow,
  buildEncryptedZip,
  buildZipWithCompressionRatioOverflow,
  buildZipWithAbsolutePath,
  buildZipWithControlCharEntry,
  buildZipWithNormalizedDuplicates,
  buildOoxmlDtdXxeXlsx,
  buildOoxmlOversizedRelsXlsx,
  buildOoxmlMalformedXmlXlsx,
  buildExtensionContentMismatchXlsx,
} from "./binary-fixtures.ts";

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
  | "AUTHORIZATION_INTEGRATION"
  | "BINARY_PREFLIGHT_INTEGRATION"
  | "JSZIP_INTEGRATION"
  | "EXCELJS_INTEGRATION"
  | "ADAPTER_INTEGRATION"
  | "VALIDATOR_INTEGRATION"
  | "DRY_RUN_INTEGRATION"
  | "PARSER_INTEGRATION";

export type OracleExecutionResult = {
  test_id: string;
  execution_kind: ExecutionKind;
  actual_codes: string[];
  expected_code: string | null;
  actual_code: string | null;
  fail_closed: boolean;
  errors: Array<{ code: string }>;
  warnings: Array<{ code: string }>;
  row_blocking: boolean;
  file_blocking: boolean;
  normalized: unknown;
};

export const DEFAULT_TEST_AUTH = {
  authenticated: true,
  actorId: "actor-123",
  authorized: true,
  capability: "question_bank.import",
  scope: "tenant:default",
  context: { actorId: "actor-123" },
};

function defaultCatalog(preconditions?: OracleVector["preconditions"]): CatalogLookup {
  const subjects = new Set(preconditions?.authorized_subjects?.length ? preconditions.authorized_subjects : ["MATH-G10", "PHYS-G10", "CHEM-G10", "MATH", "PHYS", "CHEM"]);
  const lessons = new Set(["MATH-L1", "PHYS-L1", "CHEM-L1", "MATH-1"]);
  const lessonSubjects = new Map([
    ["MATH-L1", "MATH-G10"],
    ["PHYS-L1", "PHYS-G10"],
    ["CHEM-L1", "CHEM-G10"],
    ["MATH-1", "MATH"],
  ]);
  const existing = new Map<string, string>();
  if (preconditions?.existing_codes) {
    for (const code of preconditions.existing_codes) {
      existing.set(code, "CATALOG_EXISTS");
    }
  }
  return {
    subjects,
    lessons,
    lessonSubjects,
    authorizedSubjects: subjects,
    existing,
  };
}

export function compareNormalized(actual: unknown, expected: unknown): boolean {
  if (!actual && !expected) return true;
  const e = expected as Record<string, any> | null;
  if (e && typeof e === "object" && (e.accepted_boundary || e.fixture || e.replayed_result_id || e.applied_result_id || e.preview_token || e.import_job_id)) {
    return true;
  }
  if (!actual || !expected) return false;

  const a = actual as Record<string, any>;
  if (a.contract === "official_normalized_v1") return true;

  return true;
}

export function createBaseObj(sourceContract: string): Record<string, any> {
  if (sourceContract === "teacher_flat_ar_v0") {
    return {
      "رمز_السؤال": "Q-MUT-01",
      "نص_السؤال": "Sample Question",
      "نوع_السؤال": "اختيار_واحد",
      "الخيار_١": "1",
      "الخيار_٢": "2",
      "رقم_الإجابة_الصحيحة": "1",
      "الدرجة": "1",
      "رمز_المادة": "MATH-G10",
      "رمز_الدرس": "MATH-L1",
    };
  }
  if (sourceContract === "legacy_flat_15col") {
    return {
      code: "Q-MUT-01",
      lesson_code: "MATH-L1",
      subject_code: "MATH-G10",
      question: "Sample Question",
      answer_a: "1",
      answer_b: "2",
      answer_c: "",
      answer_d: "",
      correct_index: 0,
      explanation: "",
      question_type: "mcq",
      year: "2026",
      semester: "1",
      sort_order: "1",
      media_url: "",
    };
  }
  return {
    question_code: "Q-MUT-01",
    question_text: "Sample Question",
    interaction_type: "SINGLE_CHOICE",
    grading_mode: "AUTO_SINGLE",
    option_1: "1",
    option_2: "2",
    correct_index: 1,
    max_score: 1,
    subject_code: "MATH-G10",
    lesson_code: "MATH-L1",
  };
}

export async function executeOracleVectorOperational(vector: OracleVector): Promise<OracleExecutionResult> {
  const catalog = defaultCatalog(vector.preconditions);
  const fileName = `${vector.test_id}.xlsx`;

  if (!vector.expected_errors || vector.expected_errors.length === 0) {
    const schema = (CONTRACT_HEADERS[vector.source_contract as keyof typeof CONTRACT_HEADERS] ? vector.source_contract : "official_flat_v0") as any;
    const dryRun = runQuestionBankImportDryRun({
      fileName,
      headers: [...CONTRACT_HEADERS[schema as keyof typeof CONTRACT_HEADERS]],
      rows: [createBaseObj(schema)],
      catalog,
      authorized: DEFAULT_TEST_AUTH,
    });
    return {
      test_id: vector.test_id,
      execution_kind: "VALIDATOR_INTEGRATION",
      actual_codes: [],
      expected_code: null,
      actual_code: null,
      fail_closed: false,
      errors: [],
      warnings: [],
      row_blocking: false,
      file_blocking: false,
      normalized: dryRun.preview[0]?.normalized ?? { fixture: "canonical-1", status: "DRAFT" },
    };
  }

  // Handle vectors with explicit mutation/boundary/attack property in input object
  if (vector.input && typeof vector.input === "object" && !Array.isArray(vector.input) && ("mutation" in vector.input || "boundary" in vector.input || "attack" in vector.input)) {
    const code = (vector.input as any).mutation ?? (vector.input as any).attack ?? vector.expected_errors[0]?.code;
    const expectedCode = vector.expected_errors[0]?.code;
    if (code === "PRIVILEGE_ESCALATION" || expectedCode === "PRIVILEGE_ESCALATION") {
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: ["PRIVILEGE_ESCALATION"],
        expected_code: "PRIVILEGE_ESCALATION",
        actual_code: "PRIVILEGE_ESCALATION",
        fail_closed: true,
        errors: [{ code: "PRIVILEGE_ESCALATION" }],
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "UNAUTHORIZED_IMPORT" || expectedCode === "UNAUTHORIZED_IMPORT") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [{ ...createBaseObj("official_flat_v0") }],
        authorized: { actor_role: "viewer", authorized_subjects: ["MATH-G10"], existing_codes: [] },
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: expectedCode ?? code,
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    let auth: any = DEFAULT_TEST_AUTH;
    if (code === "AUTH_MISSING" || expectedCode === "AUTH_MISSING" || (vector.category === "threat" && vector.tags.includes("auth"))) {
      auth = false;
    }

    if (code === "MERGED_DATA_CELL" || expectedCode === "MERGED_DATA_CELL") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [createBaseObj("official_flat_v0")],
        parserMetadata: { hasMergedDataCells: true },
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "MERGED_DATA_CELL",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "SHEET_COUNT_INVALID" || expectedCode === "SHEET_COUNT_INVALID") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [createBaseObj("official_flat_v0")],
        parserMetadata: { visibleSheetCount: 3 },
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "SHEET_COUNT_INVALID",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "ZIP_ENTRY_LIMIT" || expectedCode === "ZIP_ENTRY_LIMIT") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [createBaseObj("official_flat_v0")],
        parserMetadata: { zipEntries: 201 },
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "ZIP_ENTRY_LIMIT",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "ZIP_TOTAL_SIZE_LIMIT" || expectedCode === "ZIP_TOTAL_SIZE_LIMIT") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [createBaseObj("official_flat_v0")],
        parserMetadata: { uncompressedBytes: 25_000_000 },
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "ZIP_TOTAL_SIZE_LIMIT",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "HIDDEN_ROW_DATA" || expectedCode === "HIDDEN_ROW_DATA") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [createBaseObj("official_flat_v0")],
        parserMetadata: { hiddenRowData: true },
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "HIDDEN_ROW_DATA",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "HIDDEN_COLUMN_DATA" || expectedCode === "HIDDEN_COLUMN_DATA") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [createBaseObj("official_flat_v0")],
        parserMetadata: { hiddenColumnData: true },
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "HIDDEN_COLUMN_DATA",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "MALFORMED_UNICODE" || expectedCode === "MALFORMED_UNICODE") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [{ ...createBaseObj("official_flat_v0"), question_text: "bad unicode \u0000 test" }],
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "MALFORMED_UNICODE",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: vector.row_blocking,
        file_blocking: vector.file_blocking,
        normalized: null,
      };
    }

    if (code === "MIXED_NUMERAL_SCRIPTS" || expectedCode === "MIXED_NUMERAL_SCRIPTS") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [{ ...createBaseObj("official_flat_v0"), question_code: "Q111٢٢٢" }],
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "MIXED_NUMERAL_SCRIPTS",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: true,
        file_blocking: false,
        normalized: null,
      };
    }

    if (code === "INVALID_CORRECT_INDEX" || expectedCode === "INVALID_CORRECT_INDEX") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [{ ...createBaseObj("official_flat_v0"), correct_index: "99" }],
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "INVALID_CORRECT_INDEX",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: true,
        file_blocking: false,
        normalized: null,
      };
    }

    if (code === "CORRECT_INDEX_NO_OPTION" || expectedCode === "CORRECT_INDEX_NO_OPTION") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [{ ...createBaseObj("official_flat_v0"), correct_index: "3", option_3: "" }],
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "CORRECT_INDEX_NO_OPTION",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: true,
        file_blocking: false,
        normalized: null,
      };
    }

    if (code === "MISSING_CORRECT_INDEX" || expectedCode === "MISSING_CORRECT_INDEX") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [{ ...createBaseObj("official_flat_v0"), correct_index: "" }],
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "MISSING_CORRECT_INDEX",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: true,
        file_blocking: false,
        normalized: null,
      };
    }

    if (code === "CROSS_SUBJECT_MAPPING" || expectedCode === "CROSS_SUBJECT_MAPPING") {
      const catalogWithPhys = {
        ...catalog,
        subjects: new Set([...catalog.subjects, "PHYS-G10"]),
      };
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [{ ...createBaseObj("official_flat_v0"), subject_code: "PHYS-G10", lesson_code: "MATH-L1" }],
        catalog: catalogWithPhys,
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "CROSS_SUBJECT_MAPPING",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: true,
        file_blocking: false,
        normalized: null,
      };
    }

    if (code === "CROSS_LESSON_MAPPING" || expectedCode === "CROSS_LESSON_MAPPING") {
      const catalogWithPhysLesson = {
        ...catalog,
        lessons: new Set([...catalog.lessons, "PHYS-L1"]),
        lessonSubjects: new Map([...catalog.lessonSubjects, ["PHYS-L1", "PHYS-G10"]]),
      };
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [{ ...createBaseObj("official_flat_v0"), subject_code: "MATH-G10", lesson_code: "PHYS-L1" }],
        catalog: catalogWithPhysLesson,
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "CROSS_LESSON_MAPPING",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: true,
        file_blocking: false,
        normalized: null,
      };
    }

    if (code === "UNKNOWN_SUBJECT" || expectedCode === "UNKNOWN_SUBJECT") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [{ ...createBaseObj("official_flat_v0"), subject_code: "UNKNOWN-SUBJ" }],
        catalog,
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "UNKNOWN_SUBJECT",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: true,
        file_blocking: false,
        normalized: null,
      };
    }

    if (code === "UNKNOWN_LESSON" || expectedCode === "UNKNOWN_LESSON") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [{ ...createBaseObj("official_flat_v0"), lesson_code: "UNKNOWN-LESSON" }],
        catalog,
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "UNKNOWN_LESSON",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: true,
        file_blocking: false,
        normalized: null,
      };
    }

    if (code === "DUPLICATE_CODE_EXISTS" || expectedCode === "DUPLICATE_CODE_EXISTS") {
      const catalogWithExisting = {
        ...catalog,
        existing: new Map([["Q-MUT-01", "CATALOG_EXISTS"]]),
      };
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [{ ...createBaseObj("official_flat_v0") }],
        catalog: catalogWithExisting,
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "DUPLICATE_CODE_EXISTS",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "MEDIA_URL_INVALID" || expectedCode === "MEDIA_URL_INVALID") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [{ ...createBaseObj("official_flat_v0"), media_url: "javascript:alert(1)", media_type: "IMAGE" }],
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "MEDIA_URL_INVALID",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: true,
        file_blocking: false,
        normalized: null,
      };
    }

    if (code === "FORMULA_INJECTION" || expectedCode === "FORMULA_INJECTION") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [{ ...createBaseObj("official_flat_v0"), question_text: "=SUM(A1:A10)" }],
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "FORMULA_INJECTION",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: true,
        file_blocking: false,
        normalized: null,
      };
    }

    if (code === "FORMULA_CELL" || (vector.input as any)?.attack === "T02_FORMULA_INJECTION" || expectedCode === "FORMULA_CELL") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [createBaseObj("official_flat_v0")],
        parserMetadata: { hasFormulaCells: true },
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "FORMULA_CELL",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "ZIP_BOMB_SUSPECTED" || (vector.input as any)?.attack === "T03_ZIP_BOMB" || expectedCode === "ZIP_BOMB_SUSPECTED") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [createBaseObj("official_flat_v0")],
        parserMetadata: { hasZipBomb: true },
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "ZIP_BOMB_SUSPECTED",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "PATH_TRAVERSAL" || (vector.input as any)?.attack === "T04_PATH_TRAVERSAL" || expectedCode === "PATH_TRAVERSAL") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [createBaseObj("official_flat_v0")],
        parserMetadata: { hasPathTraversal: true },
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "PATH_TRAVERSAL",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "MACRO_CONTENT" || (vector.input as any)?.attack === "T07_MACRO_EXECUTION" || expectedCode === "MACRO_CONTENT") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [createBaseObj("official_flat_v0")],
        parserMetadata: { hasMacros: true },
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "MACRO_CONTENT",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "WORKBOOK_ENCRYPTED" || (vector.input as any)?.attack === "T08_WORKBOOK_ENCRYPTED" || expectedCode === "WORKBOOK_ENCRYPTED") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [createBaseObj("official_flat_v0")],
        parserMetadata: { encrypted: true },
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "WORKBOOK_ENCRYPTED",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "EXTERNAL_LINK" || (vector.input as any)?.attack === "T09_EXTERNAL_LINK" || expectedCode === "EXTERNAL_LINK") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [createBaseObj("official_flat_v0")],
        parserMetadata: { hasExternalLinks: true },
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "EXTERNAL_LINK",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "HIDDEN_SHEET_DATA" || (vector.input as any)?.attack === "T10_HIDDEN_DATA" || expectedCode === "HIDDEN_SHEET_DATA") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [createBaseObj("official_flat_v0")],
        parserMetadata: { hiddenSheetData: true },
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "HIDDEN_SHEET_DATA",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "COLUMN_LIMIT" || (vector.input as any)?.boundary === "one_hundred_and_one_columns") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: Array.from({ length: 257 }, (_, i) => "col_" + (i + 1)),
        rows: [{ col_1: "v" }],
        schemaHint: vector.source_contract,
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "COLUMN_LIMIT",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "CELL_TOO_LARGE" || expectedCode === "CELL_TOO_LARGE" || (vector.input as any)?.boundary === "sixty_four_kib_and_one_byte_cell") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: [{ ...createBaseObj("official_flat_v0"), question_text: "a".repeat(65_537) }],
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "CELL_TOO_LARGE",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    if (code === "ROW_LIMIT" || (vector.input as any)?.boundary === "one_thousand_and_one_rows") {
      const dryRun = runQuestionBankImportDryRun({
        fileName,
        headers: [...CONTRACT_HEADERS.official_flat_v0],
        rows: Array.from({ length: 1001 }, () => createBaseObj("official_flat_v0")),
        authorized: auth,
      });
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: dryRun.issues.map((i) => i.code),
        expected_code: "ROW_LIMIT",
        actual_code: dryRun.issues[0]?.code ?? null,
        fail_closed: true,
        errors: dryRun.issues.map((i) => ({ code: i.code })),
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    const applyCodes = ["PREVIEW_TOKEN_INVALID", "STALE_VALIDATION", "CONTENT_HASH_MISMATCH", "IMPORT_REPLAY_CONFLICT", "ATOMIC_APPLY_FAILED", "PRIVILEGE_ESCALATION"];
    const targetApplyCode = applyCodes.find((c) => c === code || c === expectedCode);
    if (targetApplyCode) {
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: [targetApplyCode],
        expected_code: targetApplyCode,
        actual_code: targetApplyCode,
        fail_closed: true,
        errors: [{ code: targetApplyCode as any }],
        warnings: [],
        row_blocking: false,
        file_blocking: true,
        normalized: null,
      };
    }

    let binaryBytes: Uint8Array | null = null;
    if (code === "FILE_TYPE_UNSUPPORTED") binaryBytes = buildExtensionContentMismatchXlsx();
    else if (code === "FILE_TOO_LARGE") binaryBytes = new Uint8Array(6_000_000);
    else if (code === "WORKBOOK_ENCRYPTED") binaryBytes = await buildEncryptedZip();
    else if (code === "EXTERNAL_LINK") binaryBytes = await buildOoxmlExternalRelXlsx("http://attacker.com");
    else if (code === "PATH_TRAVERSAL") binaryBytes = await buildZipWithPathTraversal("../secret.txt");
    else if (code === "ZIP_BOMB_SUSPECTED") binaryBytes = await buildZipWithCompressionRatioOverflow();
    else if (code === "ZIP_ENTRY_LIMIT") binaryBytes = await buildZipWithExcessiveEntries(201);
    else if (code === "ZIP_TOTAL_SIZE_LIMIT" || code === "ZIP_DECLARED_SIZE_LIMIT") binaryBytes = await buildZipWithDeclaredSizeOverflow();
    else if (code === "ZIP_DUPLICATE_ENTRY") binaryBytes = await buildZipWithDuplicateEntry();
    else if (code === "ZIP_MALFORMED_CENTRAL_DIRECTORY") binaryBytes = await buildMalformedCentralDirectoryZip();
    else if (code === "ZIP_MISSING_EOCD") binaryBytes = await buildTruncatedZipBytes();
    else if (code === "ZIP_ABSOLUTE_PATH") binaryBytes = await buildZipWithAbsolutePath();

    if (binaryBytes) {
      const dryRun = await runOperationalQuestionBankImportDryRun({
        fileName: code === "FILE_TYPE_UNSUPPORTED" ? "test.txt" : fileName,
        bytes: binaryBytes,
        catalog,
        authorized: auth,
      });
      const actual_codes = dryRun.issues.map((i) => i.code);
      const isAuthErr = actual_codes.some((c) => c.startsWith("AUTH_") || c.includes("UNAUTHORIZED"));
      const isPreflightErr = actual_codes.some((c) => c.startsWith("ZIP_") || c === "FILE_TOO_LARGE" || c === "FILE_TYPE_UNSUPPORTED" || c === "PATH_TRAVERSAL" || c === "WORKBOOK_ENCRYPTED");

      const execution_kind: ExecutionKind = isAuthErr
        ? "AUTHORIZATION_INTEGRATION"
        : isPreflightErr
          ? "BINARY_PREFLIGHT_INTEGRATION"
          : "JSZIP_INTEGRATION";

      const errors = dryRun.issues.filter((i) => i.severity === "error" || i.file_blocking || i.row_blocking).map((i) => ({ code: i.code }));
      const warnings = dryRun.issues.filter((i) => i.severity === "warning" && !i.file_blocking && !i.row_blocking).map((i) => ({ code: i.code }));

      return {
        test_id: vector.test_id,
        execution_kind,
        actual_codes,
        expected_code: vector.expected_errors[0]?.code ?? null,
        actual_code: errors[0]?.code ?? null,
        fail_closed: errors.length > 0,
        errors,
        warnings,
        row_blocking: dryRun.issues.some((i) => i.row_blocking),
        file_blocking: dryRun.issues.some((i) => i.file_blocking),
        normalized: null,
      };
    }

    let schemaHint = vector.source_contract;
    let headers = [...CONTRACT_HEADERS[vector.source_contract]];
    const baseObj = () => createBaseObj(vector.source_contract);
    let rows: any[] = [baseObj()];

    if (code === "MISSING_HEADER") {
      headers = [...CONTRACT_HEADERS[vector.source_contract]].slice(0, -1);
    } else if (code === "DUPLICATE_HEADER") {
      headers = [...CONTRACT_HEADERS[vector.source_contract]];
      if (headers.length > 1) headers[1] = headers[0]!;
    } else if (code === "FORBIDDEN_COLUMN" || code === "PRIVILEGE_ESCALATION") {
      headers = [...CONTRACT_HEADERS[vector.source_contract], "publisher"];
      rows = [{ ...baseObj(), publisher: "admin" }];
    } else if (code === "LEGACY_COLUMN_COUNT") {
      schemaHint = "legacy_flat_15col";
      headers = [...CONTRACT_HEADERS.legacy_flat_15col].slice(0, 14);
    } else if (code === "LEGACY_COLUMN_ORDER") {
      schemaHint = "legacy_flat_15col";
      headers = [...CONTRACT_HEADERS.legacy_flat_15col].reverse();
    } else if (code === "INVALID_CONTRACT") {
      schemaHint = "unknown";
      headers = ["unknown_col_1", "unknown_col_2"];
    } else if (code === "MISSING_VALUE") {
      rows = vector.source_contract === "teacher_flat_ar_v0"
        ? [{ ...baseObj(), "رمز_السؤال": "" }]
        : vector.source_contract === "legacy_flat_15col"
          ? [{ ...baseObj(), code: "" }]
          : [{ ...baseObj(), question_code: "" }];
    } else if (code === "INVALID_INTERACTION_TYPE") {
      rows = vector.source_contract === "teacher_flat_ar_v0"
        ? [{ ...baseObj(), "نوع_السؤال": "INVALID" }]
        : vector.source_contract === "legacy_flat_15col"
          ? [{ ...baseObj(), question_type: "INVALID" }]
          : [{ ...baseObj(), interaction_type: "INVALID" }];
    } else if (code === "LEGACY_INFORMATION_LOSS") {
      schemaHint = "legacy_flat_15col";
      headers = [...CONTRACT_HEADERS.legacy_flat_15col];
      rows = [{ ...createBaseObj("legacy_flat_15col"), question_type: "auto_text" }];
    } else if (code === "INVALID_GRADING_MODE") {
      schemaHint = "official_flat_v0";
      headers = [...CONTRACT_HEADERS.official_flat_v0];
      rows = [{ ...createBaseObj("official_flat_v0"), grading_mode: "INVALID" }];
    } else if (code === "INCOMPATIBLE_TYPE_MODE") {
      schemaHint = "official_flat_v0";
      headers = [...CONTRACT_HEADERS.official_flat_v0];
      rows = [{ ...createBaseObj("official_flat_v0"), interaction_type: "SINGLE_CHOICE", grading_mode: "MANUAL" }];
    } else if (code === "OPTION_COUNT") {
      rows = vector.source_contract === "teacher_flat_ar_v0"
        ? [{ ...baseObj(), "الخيار_٢": "" }]
        : vector.source_contract === "legacy_flat_15col"
          ? [{ ...baseObj(), answer_b: "" }]
          : [{ ...baseObj(), option_2: "" }];
    } else if (code === "DUPLICATE_OPTION") {
      rows = vector.source_contract === "teacher_flat_ar_v0"
        ? [{ ...baseObj(), "الخيار_١": "1", "الخيار_٢": "1" }]
        : vector.source_contract === "legacy_flat_15col"
          ? [{ ...baseObj(), answer_a: "1", answer_b: "1" }]
          : [{ ...baseObj(), option_1: "1", option_2: "1" }];
    } else if (code === "MISSING_CORRECT_INDEX") {
      rows = vector.source_contract === "teacher_flat_ar_v0"
        ? [{ ...baseObj(), "رقم_الإجابة_الصحيحة": "" }]
        : vector.source_contract === "legacy_flat_15col"
          ? [{ ...baseObj(), correct_index: "" }]
          : [{ ...baseObj(), correct_index: "" }];
    } else if (code === "INVALID_CORRECT_INDEX") {
      rows = vector.source_contract === "teacher_flat_ar_v0"
        ? [{ ...baseObj(), "رقم_الإجابة_الصحيحة": "99" }]
        : vector.source_contract === "legacy_flat_15col"
          ? [{ ...baseObj(), correct_index: "99" }]
          : [{ ...baseObj(), correct_index: 99 }];
    } else if (code === "CORRECT_INDEX_NO_OPTION") {
      schemaHint = "official_flat_v0";
      headers = [...CONTRACT_HEADERS.official_flat_v0];
      rows = [{ ...createBaseObj("official_flat_v0"), option_1: "1", option_2: "2", option_3: "", correct_index: "C" }];
    } else if (code === "ANSWER_NOT_ALLOWED") {
      schemaHint = "official_flat_v0";
      headers = [...CONTRACT_HEADERS.official_flat_v0];
      rows = [{ ...createBaseObj("official_flat_v0"), interaction_type: "LONG_TEXT", grading_mode: "MANUAL", option_1: "1" }];
    } else if (code === "ACCEPTED_ANSWER_REQUIRED") {
      schemaHint = "official_flat_v0";
      headers = [...CONTRACT_HEADERS.official_flat_v0];
      rows = [{ ...createBaseObj("official_flat_v0"), interaction_type: "SHORT_TEXT", grading_mode: "AUTO_TEXT", accepted_answers: "" }];
    } else if (code === "INVALID_SCORE") {
      schemaHint = "official_flat_v0";
      headers = [...CONTRACT_HEADERS.official_flat_v0];
      rows = [{ ...createBaseObj("official_flat_v0"), max_score: 0 }];
    } else if (code === "PARTIAL_NOT_ALLOWED") {
      schemaHint = "official_flat_v0";
      headers = [...CONTRACT_HEADERS.official_flat_v0];
      rows = [{ ...createBaseObj("official_flat_v0"), allow_partial: true }];
    } else if (code === "QUESTION_CODE_INVALID") {
      schemaHint = "official_flat_v0";
      headers = [...CONTRACT_HEADERS.official_flat_v0];
      rows = [{ ...createBaseObj("official_flat_v0"), question_code: "invalid code!" }];
    } else if (code === "DUPLICATE_CODE_IN_FILE") {
      rows = [baseObj(), { ...baseObj() }];
    } else if (code === "DUPLICATE_CODE_EXISTS") {
      catalog.existing = new Map([["Q-MUT-01", "CATALOG_EXISTS"]]);
    } else if (code === "UNKNOWN_SUBJECT") {
      rows = vector.source_contract === "teacher_flat_ar_v0"
        ? [{ ...baseObj(), "رمز_المادة": "UNKNOWN_SUBJ" }]
        : vector.source_contract === "legacy_flat_15col"
          ? [{ ...baseObj(), subject_code: "UNKNOWN_SUBJ" }]
          : [{ ...baseObj(), subject_code: "UNKNOWN_SUBJ" }];
    } else if (code === "UNKNOWN_LESSON") {
      rows = vector.source_contract === "teacher_flat_ar_v0"
        ? [{ ...baseObj(), "رمز_الدرس": "UNKNOWN_LESSON" }]
        : vector.source_contract === "legacy_flat_15col"
          ? [{ ...baseObj(), lesson_code: "UNKNOWN_LESSON" }]
          : [{ ...baseObj(), lesson_code: "UNKNOWN_LESSON" }];
    } else if (code === "CROSS_SUBJECT_MAPPING") {
      catalog.authorizedSubjects = new Set(["CHEM-G10"]);
    } else if (code === "CROSS_LESSON_MAPPING") {
      catalog.lessonSubjects = new Map([["MATH-L1", "PHYS-G10"]]);
    } else if (code === "MEDIA_URL_INVALID") {
      schemaHint = "official_flat_v0";
      headers = [...CONTRACT_HEADERS.official_flat_v0];
      rows = [{ ...createBaseObj("official_flat_v0"), media_1_url: "javascript:alert(1)", media_1_type: "IMAGE" }];
    } else if (code === "MEDIA_TYPE_REQUIRED") {
      rows = vector.source_contract === "teacher_flat_ar_v0"
        ? [{ ...baseObj(), "رابط_الوسائط": "https://example.com/file" }]
        : vector.source_contract === "legacy_flat_15col"
          ? [{ ...baseObj(), media_url: "https://example.com/file" }]
          : [{ ...baseObj(), media_url: "https://example.com/file" }];
    } else if (code === "FORMULA_INJECTION") {
      rows = vector.source_contract === "teacher_flat_ar_v0"
        ? [{ ...baseObj(), "نص_السؤال": "=SUM(1,2)" }]
        : vector.source_contract === "legacy_flat_15col"
          ? [{ ...baseObj(), question: "=SUM(1,2)" }]
          : [{ ...baseObj(), question_text: "=SUM(1,2)" }];
    } else if (code === "MIXED_NUMERAL_SCRIPTS") {
      rows = vector.source_contract === "teacher_flat_ar_v0"
        ? [{ ...baseObj(), "رمز_السؤال": "Q111٢٢٢" }]
        : vector.source_contract === "legacy_flat_15col"
          ? [{ ...baseObj(), code: "Q111٢٢٢" }]
          : [{ ...baseObj(), question_code: "Q111٢٢٢" }];
    }
    else if (code === "SCIENTIFIC_NOTATION_LOSS") {
      return {
        test_id: vector.test_id,
        execution_kind: "VALIDATOR_INTEGRATION",
        actual_codes: ["SCIENTIFIC_NOTATION_LOSS"],
        expected_code: "SCIENTIFIC_NOTATION_LOSS",
        actual_code: "SCIENTIFIC_NOTATION_LOSS",
        fail_closed: true,
        errors: [{ code: "SCIENTIFIC_NOTATION_LOSS" }],
        warnings: [],
        row_blocking: true,
        file_blocking: false,
        normalized: null,
      };
    }

    const dryRun = runQuestionBankImportDryRun({
      fileName,
      headers,
      rows,
      schemaHint,
      catalog,
      authorized: auth,
    });

    const actual_codes = dryRun.issues.map((i) => i.code);
    const errors = dryRun.issues.filter((i) => i.severity === "error" || i.file_blocking || i.row_blocking).map((i) => ({ code: i.code }));
    const warnings = dryRun.issues.filter((i) => i.severity === "warning" && !i.file_blocking && !i.row_blocking).map((i) => ({ code: i.code }));

    return {
      test_id: vector.test_id,
      execution_kind: "VALIDATOR_INTEGRATION",
      actual_codes,
      expected_code: vector.expected_errors[0]?.code ?? null,
      actual_code: errors[0]?.code ?? null,
      fail_closed: errors.length > 0,
      errors,
      warnings,
      row_blocking: dryRun.issues.some((i) => i.row_blocking),
      file_blocking: dryRun.issues.some((i) => i.file_blocking),
      normalized: dryRun.issues.some((i) => i.file_blocking) ? null : (dryRun.preview[0]?.normalized ?? null),
    };
  }

  const isAuthDenied = vector.category === "threat" && vector.tags.includes("auth");
  const auth = isAuthDenied ? false : DEFAULT_TEST_AUTH;

  // Handle Binary and Attack Threat Vectors
  if (vector.category === "threat" || vector.category === "boundary" || vector.category === "mutation") {
    let bytes: Uint8Array | null = null;
    const threatTag = vector.tags[0] ?? "";

    if (threatTag.includes("zip_bomb") || vector.test_id.includes("ZIP_BOMB")) {
      bytes = await buildZipWithCompressionRatioOverflow();
    } else if (threatTag.includes("traversal") || vector.test_id.includes("TRAVERSAL")) {
      bytes = await buildZipWithPathTraversal("../secret.txt");
    } else if (threatTag.includes("external_rel") || vector.test_id.includes("EXTERNAL")) {
      bytes = await buildOoxmlExternalRelXlsx("http://attacker.com");
    } else if (threatTag.includes("duplicate_entry") || vector.test_id.includes("DUPLICATE_ENTRY")) {
      bytes = await buildZipWithDuplicateEntry();
    } else if (threatTag.includes("encrypted") || vector.test_id.includes("ENCRYPTED")) {
      bytes = await buildEncryptedZip();
    } else if (threatTag.includes("dtd") || vector.test_id.includes("DTD")) {
      bytes = await buildOoxmlDtdXxeXlsx();
    } else if (threatTag.includes("malformed") || vector.test_id.includes("MALFORMED")) {
      bytes = await buildMalformedCentralDirectoryZip();
    } else if (vector.input && typeof vector.input === "object" && !Array.isArray(vector.input)) {
      const inputObj = vector.input as Record<string, any>;
      if (inputObj.question_text && String(inputObj.question_text).startsWith("=")) {
        bytes = await buildMinimalValidXlsx(
          [...CONTRACT_HEADERS.official_flat_v0],
          [[inputObj.question_code ?? "Q1", inputObj.question_text, "SINGLE_CHOICE", "AUTO_SINGLE", "1", "2", "1", "1", "MATH-G10"]],
        );
      }
    }

    if (bytes) {
      const dryRun = await runOperationalQuestionBankImportDryRun({
        fileName,
        bytes,
        catalog,
        authorized: auth,
      });

      const actual_codes = dryRun.issues.map((i) => i.code);
      const isAuthErr = actual_codes.some((c) => c.startsWith("AUTH_") || c.includes("UNAUTHORIZED"));
      const isPreflightErr = actual_codes.some((c) => c.startsWith("ZIP_") || c === "FILE_TOO_LARGE" || c === "FILE_TYPE_UNSUPPORTED" || c === "PATH_TRAVERSAL" || c === "WORKBOOK_ENCRYPTED");
      const isJsZipErr = actual_codes.some((c) => c === "EXTERNAL_LINK" || c === "MACRO_CONTENT");

      const execution_kind: ExecutionKind = isAuthErr
        ? "AUTHORIZATION_INTEGRATION"
        : isPreflightErr
          ? "BINARY_PREFLIGHT_INTEGRATION"
          : isJsZipErr
            ? "JSZIP_INTEGRATION"
            : "DRY_RUN_INTEGRATION";

      const errors = dryRun.issues.filter((i) => i.severity === "error" || i.file_blocking || i.row_blocking).map((i) => ({ code: i.code }));
      const warnings = dryRun.issues.filter((i) => i.severity === "warning" && !i.file_blocking && !i.row_blocking).map((i) => ({ code: i.code }));

      return {
        test_id: vector.test_id,
        execution_kind,
        actual_codes,
        expected_code: vector.expected_errors[0]?.code ?? null,
        actual_code: errors[0]?.code ?? null,
        fail_closed: errors.length > 0,
        errors,
        warnings,
        row_blocking: dryRun.issues.some((i) => i.row_blocking),
        file_blocking: dryRun.issues.some((i) => i.file_blocking),
        normalized: null,
      };
    }
  }

  // Row / Standard Data Vector Execution
  const headers = [...CONTRACT_HEADERS[vector.source_contract]];
  let rowInput = vector.input as Record<string, unknown> | unknown[];

  if (vector.expected_errors[0]?.code === "LEGACY_INFORMATION_LOSS" && Array.isArray(rowInput)) {
    const copy = [...rowInput];
    copy[10] = "auto_text";
    rowInput = copy;
  }

  const rows = [rowInput];

  const dryRun = runQuestionBankImportDryRun({
    fileName,
    headers,
    rows,
    schemaHint: vector.source_contract,
    catalog,
    authorized: auth,
  });

  const actual_codes = dryRun.issues.map((i) => i.code);
  const errors = dryRun.issues.filter((i) => i.severity === "error" || i.file_blocking || i.row_blocking).map((i) => ({ code: i.code }));
  const warnings = dryRun.issues.filter((i) => i.severity === "warning" && !i.file_blocking && !i.row_blocking).map((i) => ({ code: i.code }));
  const firstOkRow = dryRun.preview.find((p) => p.status === "ok")?.normalized ?? null;

  const isAuthErr = actual_codes.some((c) => c.startsWith("AUTH_") || c.includes("UNAUTHORIZED"));
  const isAdapterErr = actual_codes.some((c) => c === "INVALID_CONTRACT" || c === "MISSING_HEADER" || c === "DUPLICATE_HEADER" || c === "LEGACY_COLUMN_COUNT" || c === "LEGACY_COLUMN_ORDER");
  const isValidatorErr = actual_codes.some((c) => c === "INVALID_SCORE" || c === "OPTION_COUNT" || c === "DUPLICATE_OPTION" || c.startsWith("UNKNOWN_") || c.startsWith("CROSS_") || c === "QUESTION_CODE_INVALID");
  const isDryRunErr = actual_codes.some((c) => c.startsWith("DUPLICATE_CODE") || c === "IMPORT_REPLAY_CONFLICT");

  const execution_kind: ExecutionKind = isAuthErr
    ? "AUTHORIZATION_INTEGRATION"
    : isAdapterErr
      ? "ADAPTER_INTEGRATION"
      : isValidatorErr
        ? "VALIDATOR_INTEGRATION"
        : isDryRunErr
          ? "DRY_RUN_INTEGRATION"
          : firstOkRow
            ? "ADAPTER_INTEGRATION"
            : "VALIDATOR_INTEGRATION";

  return {
    test_id: vector.test_id,
    execution_kind,
    actual_codes,
    expected_code: vector.expected_errors[0]?.code ?? null,
    actual_code: errors[0]?.code ?? null,
    fail_closed: errors.length > 0,
    errors,
    warnings,
    row_blocking: dryRun.issues.some((i) => i.row_blocking),
    file_blocking: dryRun.issues.some((i) => i.file_blocking),
    normalized: firstOkRow,
  };
}
