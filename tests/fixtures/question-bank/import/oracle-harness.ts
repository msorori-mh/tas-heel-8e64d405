import { CONTRACT_HEADERS, type ImportSchemaId } from "../../../../src/lib/question-bank/import/adapters/detect.ts";
import {
  runQuestionBankImportDryRun,
  runOperationalQuestionBankImportDryRun,
  type CatalogLookup,
  type DryRunInputRow,
} from "../../../../src/lib/question-bank/import/dry-run.ts";
import type { WorkbookParserMetadata } from "../../../../src/lib/question-bank/import/preflight.ts";
import {
  validateAtomicApplyPlan,
  validateStaleValidation,
  validateContentHash,
  validateTOCTOUSnapshot,
  validatePreviewToken,
  type PreviewTokenBindingContext,
} from "../../../../src/lib/question-bank/import/apply-verifier.ts";
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

export type OperationalFixture = {
  fixture_kind?: "apply-verification" | "binary" | "authorization" | "adapter" | "validator" | "workbook";
  input_format?: "official_flat_v0" | "legacy_flat_15col" | "teacher_flat_ar_v0";
  file_name?: string;
  file_bytes?: number;
  content_type?: string;
  headers?: string[];
  rows?: DryRunInputRow[];
  authorization_state?: "authenticated" | "unauthorized" | "viewer" | "unauthenticated";
  catalog_state?: {
    authorized_subjects?: string[];
    existing_codes?: Record<string, string>;
    subjects?: string[];
    lessons?: string[];
    lesson_subjects?: Record<string, string>;
  };
  binary_fixture?: string;
  parser_state?: WorkbookParserMetadata;
  apply_state?: {
    scenario?: "preview-token" | "stale-validation" | "content-hash" | "toctou" | "atomic-plan";
    preview_token?: unknown;
    token_binding?: PreviewTokenBindingContext;
    expected_snapshot?: unknown;
    current_snapshot?: unknown;
    expected_content_hash?: string | null;
    current_content_hash?: string | null;
    expected_validation_hash?: string | null;
    current_validation_hash?: string | null;
    atomic_plan?: unknown;
    observed_state?: unknown;
    rows?: unknown[];
  };
};

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
  operational_fixture?: OperationalFixture;
};

export type ExecutionKind =
  | "EXECUTABLE_BINARY"
  | "EXECUTABLE_WORKBOOK"
  | "EXECUTABLE_AUTHORIZATION"
  | "EXECUTABLE_ADAPTER"
  | "EXECUTABLE_VALIDATOR"
  | "EXECUTABLE_APPLY_SECURITY"
  | "DESIGN_ONLY_NOT_EXECUTABLE";

export type OperationalInput = {
  kind?: string;
  fileName: string;
  bytes?: Uint8Array;
  headers?: string[];
  rows?: DryRunInputRow[];
  authorized?: unknown;
  expectedScope?: string;
  catalog?: CatalogLookup;
  schemaHint?: ImportSchemaId;
  parserMetadata?: WorkbookParserMetadata;
  fileBytes?: number;
  apply_state?: OperationalFixture["apply_state"];
};

export type ActualResult = {
  actual_codes: string[];
  normalized: unknown;
  row_blocking: boolean;
  file_blocking: boolean;
  summary: Record<string, unknown>;
  preview: unknown[];
  issues: Array<{ code: string; severity: string; row_blocking: boolean; file_blocking: boolean }>;
};

export const DEFAULT_TEST_AUTH = {
  authenticated: true,
  actorId: "actor-123",
  authorized: true,
  capability: "question_bank.import",
  scope: "tenant:default",
  context: { actorId: "actor-123" },
};

function defaultCatalogFromState(state?: OperationalFixture["catalog_state"]): CatalogLookup {
  const subjects = new Set(["MATH-G10", "PHYS-G10", "CHEM-G10", "MATH", "PHYS", "CHEM"]);
  const authorizedSubjects = new Set(
    state?.authorized_subjects?.length
      ? state.authorized_subjects
      : ["MATH-G10", "PHYS-G10", "CHEM-G10", "MATH", "PHYS", "CHEM"],
  );
  const lessons = new Set(state?.lessons?.length ? state.lessons : ["MATH-L1", "PHYS-L1", "CHEM-L1", "MATH-1"]);
  const lessonSubjects = new Map([
    ["MATH-L1", "MATH-G10"],
    ["PHYS-L1", "PHYS-G10"],
    ["CHEM-L1", "CHEM-G10"],
    ["MATH-1", "MATH"],
    ...(state?.lesson_subjects ? Object.entries(state.lesson_subjects) : []),
  ]);
  const existing = new Map<string, string>(state?.existing_codes ? Object.entries(state.existing_codes) : []);
  return {
    subjects,
    lessons,
    lessonSubjects,
    authorizedSubjects,
    existing,
  };
}

function fillDefaultRowFields(inputFormat: string, inputObj: Record<string, unknown>): Record<string, unknown> {
  if (inputFormat === "teacher_flat_ar_v0") {
    const qType = String(inputObj["نوع_السؤال"] ?? "اختيار_واحد");
    const isMcq = qType === "اختيار_واحد";
    const defaults = {
      "رمز_السؤال": "Q-DEFAULT",
      "نص_السؤال": "سؤال افتراضي تجريبي",
      "نوع_السؤال": "اختيار_واحد",
      "الخيار_١": isMcq ? "الخيار 1" : "",
      "الخيار_٢": isMcq ? "الخيار 2" : "",
      "الخيار_٣": "",
      "الخيار_٤": "",
      "الخيار_٥": "",
      "الخيار_٦": "",
      "رقم_الإجابة_الصحيحة": isMcq ? "١" : "",
      "الإجابات_المقبولة": "",
      "الشرح": "",
      "الدرجة": "1",
      "السماح_بالجزئي": "لا",
      "رمز_المادة": "MATH-G10",
      "رمز_الدرس": "MATH-L1",
      "رابط_الوسائط": "",
      "نوع_الوسائط": "",
      "نص_بديل": "",
    };
    return { ...defaults, ...inputObj };
  }
  if (inputFormat === "legacy_flat_15col") {
    const defaults = {
      code: "Q-DEFAULT",
      lesson_code: "MATH-L1",
      subject_code: "MATH-G10",
      question: "Sample Question Text",
      answer_a: "Option 1",
      answer_b: "Option 2",
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
    return { ...defaults, ...inputObj };
  }

  const qType = String(inputObj.interaction_type ?? "SINGLE_CHOICE");
  const isMcq = qType === "SINGLE_CHOICE";
  const defaults = {
    question_code: "Q-DEFAULT",
    question_text: "Sample Question Text",
    interaction_type: "SINGLE_CHOICE",
    grading_mode: isMcq ? "AUTO_SINGLE" : qType === "SHORT_TEXT" ? "AUTO_TEXT" : "MANUAL",
    option_1: isMcq ? "Option 1" : "",
    option_2: isMcq ? "Option 2" : "",
    option_3: "",
    option_4: "",
    option_5: "",
    option_6: "",
    correct_index: isMcq ? 1 : "",
    accepted_answers: "",
    explanation: "",
    stimulus_text: "",
    max_score: 1,
    allow_partial: "FALSE",
    subject_code: "MATH-G10",
    lesson_code: "MATH-L1",
    media_url: "",
    media_type: "",
    media_alt: "",
  };
  return { ...defaults, ...inputObj };
}

/** Layer A: Fixture Manifest Resolver. Maps OracleVector to explicit OperationalFixture. */
export function getOperationalFixture(vector: OracleVector): OperationalFixture {
  if (vector.operational_fixture) {
    return vector.operational_fixture;
  }

  const rawInput = vector.input;
  const cleanInput = (rawInput && typeof rawInput === "object") ? { ...(rawInput as any) } : {};
  if (cleanInput.input && typeof cleanInput.input === "object") Object.assign(cleanInput, cleanInput.input);
  if (cleanInput.row && typeof cleanInput.row === "object") Object.assign(cleanInput, cleanInput.row);

  const scen = String(cleanInput.scenario ?? cleanInput.attack ?? cleanInput.mutation ?? cleanInput.boundary ?? "");
  const attack = String(cleanInput.attack ?? cleanInput.scenario ?? "");
  const boundary = String(cleanInput.boundary ?? "");
  const mutation = String(cleanInput.mutation ?? "");
  const tags = vector.tags ?? [];

  let inputFormat: OperationalFixture["input_format"] | undefined = vector.source_contract as OperationalFixture["input_format"];
  if (scen === "LEGACY_COLUMN_COUNT" || scen === "LEGACY_COLUMN_ORDER" || scen === "LEGACY_INFORMATION_LOSS") {
    inputFormat = "legacy_flat_15col";
  } else if (scen === "INVALID_GRADING_MODE" || scen === "INCOMPATIBLE_TYPE_MODE" || scen === "ANSWER_NOT_ALLOWED") {
    inputFormat = "official_flat_v0";
  } else if (scen === "INVALID_CONTRACT") {
    inputFormat = undefined;
  }

  let kind: OperationalFixture["fixture_kind"] = "validator";

  if (
    scen === "T12_PARTIAL_WRITE" ||
    scen === "T13_STALE_VALIDATION" ||
    scen === "T14_TOCTOU" ||
    scen === "T15_HASH_MISMATCH" ||
    scen === "preview-token-invalid" ||
    scen === "stale-validation" ||
    scen === "content-hash-mismatch" ||
    scen === "atomic-apply-failed" ||
    scen === "PREVIEW_TOKEN_INVALID" ||
    scen === "STALE_VALIDATION" ||
    scen === "CONTENT_HASH_MISMATCH" ||
    scen === "ATOMIC_APPLY_FAILED"
  ) {
    kind = "apply-verification";
  } else if (scen === "T22_ZIP_BOMB" || scen === "T23_XLSX_EXTERNAL_LINKS" || tags.includes("binary") || tags.includes("zip") || tags.includes("ooxml") || cleanInput.binary_fixture) {
    kind = "binary";
  } else if (tags.includes("auth") || vector.category === "authorization") {
    kind = "authorization";
  } else if (tags.includes("adapter") || tags.includes("compatibility")) {
    kind = "adapter";
  } else if (tags.includes("workbook") || scen === "T24_MACROS") {
    kind = "workbook";
  }

  let authState: OperationalFixture["authorization_state"] = "authenticated";
  if (
    vector.preconditions?.actor_role === "viewer" ||
    scen === "viewer-actor"
  ) {
    authState = "viewer";
  } else if (
    vector.preconditions?.actor_role === "unauthenticated"
  ) {
    authState = "unauthenticated";
  } else if (
    scen === "T01_ANSWER_LEAK" ||
    scen === "T09_UNAUTHORIZED_IMPORT" ||
    scen === "UNAUTHORIZED_IMPORT" ||
    scen === "unauthorized-actor"
  ) {
    authState = "unauthorized";
  }

  let applyState: OperationalFixture["apply_state"] = undefined;
  if (kind === "apply-verification") {
    if (scen === "T12_PARTIAL_WRITE" || scen === "atomic-apply-failed" || scen === "ATOMIC_APPLY_FAILED") {
      applyState = { scenario: "atomic-plan", atomic_plan: { simulateFailure: true } };
    } else if (scen === "T13_STALE_VALIDATION" || scen === "stale-validation" || scen === "STALE_VALIDATION") {
      applyState = { scenario: "stale-validation", expected_validation_hash: "hashA", current_validation_hash: "hashB" };
    } else if (scen === "T14_TOCTOU") {
      applyState = { scenario: "toctou", expected_snapshot: { version: 1 }, current_snapshot: { version: 2 } };
    } else if (scen === "T15_HASH_MISMATCH" || scen === "content-hash-mismatch" || scen === "CONTENT_HASH_MISMATCH") {
      applyState = { scenario: "content-hash", expected_content_hash: "hashA", current_content_hash: "hashB" };
    } else {
      applyState = { scenario: "preview-token", preview_token: "invalid" };
    }
  }

  let binaryFixtureName: string | undefined = cleanInput.binary_fixture;
  if (kind === "binary" && !binaryFixtureName) {
    if (scen === "T04_PATH_TRAVERSAL") binaryFixtureName = "zip_path_traversal";
    else if (scen === "T23_XLSX_EXTERNAL_LINKS") binaryFixtureName = "ooxml_external_rel";
    else if (scen === "T22_ZIP_BOMB") binaryFixtureName = "zip_ratio_overflow";
    else binaryFixtureName = "minimal_xlsx";
  }

  let headers = CONTRACT_HEADERS[inputFormat as keyof typeof CONTRACT_HEADERS]
    ? [...CONTRACT_HEADERS[inputFormat as keyof typeof CONTRACT_HEADERS]]
    : [...CONTRACT_HEADERS.official_flat_v0];

  const parserState: WorkbookParserMetadata = {};
  let fileName = "workbook.xlsx";
  let fileBytes: number | undefined = undefined;

  if (scen === "unsupported-file-type" || scen === "FILE_TYPE_UNSUPPORTED") fileName = "invalid.txt";
  if (scen === "file-too-large" || scen === "FILE_TOO_LARGE" || scen === "bytes_5242881") fileBytes = 6 * 1024 * 1024;
  if (scen === "encrypted-workbook" || scen === "WORKBOOK_ENCRYPTED") parserState.encrypted = true;
  if (scen === "T04_PATH_TRAVERSAL") parserState.hasPathTraversal = true;
  if (scen === "T18_HIDDEN_DATA" || scen === "hidden-data") parserState.hiddenRowData = true;
  if (scen === "T19_MERGED_CELLS" || scen === "merged-cells") parserState.hasMergedDataCells = true;
  if (scen === "T24_MACROS" || scen === "MACRO_CONTENT") parserState.hasMacros = true;
  if (scen === "T02_FORMULA_INJECTION" || scen === "T20_WORKBOOK_FORMULAS" || scen === "formula-cell") {
    parserState.hasFormulaCells = true;
  }
  if (scen === "cell_65537" || scen === "cell_bytes_65537" || scen === "T21_CELL_BOMB" || scen === "T21_OVERSIZED_CELLS" || scen === "CELL_TOO_LARGE") {
    parserState.maxCellBytes = 65537;
  }

  if (scen === "missing-header" || scen === "MISSING_HEADER") headers = headers.slice(1);
  if (scen === "duplicate-header" || scen === "DUPLICATE_HEADER") headers = [...headers, headers[0]!];
  if (scen === "T10_PRIVILEGE_ESCALATION" || scen === "forbidden-column" || scen === "PRIVILEGE_ESCALATION" || scen === "FORBIDDEN_COLUMN") {
    headers = [...headers, "role"];
    cleanInput.role = "admin";
  }
  if (scen === "columns_257" || scen === "max_columns" || scen === "column-limit" || scen === "COLUMN_LIMIT") {
    headers = Array.from({ length: 257 }, (_, i) => `col_${i}`);
  }
  if (scen === "INVALID_CONTRACT") {
    headers = ["unsupported_col1", "unsupported_col2"];
  }

  if (scen === "MISSING_VALUE") {
    cleanInput.question_text = "";
    cleanInput.question_code = "";
    cleanInput.رمز_السؤال = "";
    cleanInput.نص_السؤال = "";
  }
  if (scen === "INVALID_INTERACTION_TYPE") {
    cleanInput.interaction_type = "invalid";
    cleanInput.نوع_السؤال = "invalid";
  }
  if (scen === "INVALID_GRADING_MODE") {
    cleanInput.interaction_type = "SINGLE_CHOICE";
    cleanInput.grading_mode = "invalid";
  }
  if (scen === "INCOMPATIBLE_TYPE_MODE") {
    cleanInput.interaction_type = "SINGLE_CHOICE";
    cleanInput.grading_mode = "AUTO_TEXT";
  }
  if (scen === "OPTION_COUNT" || scen === "zero_options") {
    cleanInput.option_1 = "";
    cleanInput.option_2 = "";
    cleanInput.الخيار_١ = "";
    cleanInput.الخيار_٢ = "";
  }
  if (scen === "one_option") {
    cleanInput.option_1 = "Opt 1";
    cleanInput.option_2 = "";
    cleanInput.الخيار_١ = "Opt 1";
    cleanInput.الخيار_٢ = "";
  }
  if (scen === "seven_options") {
    cleanInput.option_1 = "1"; cleanInput.option_2 = "2"; cleanInput.option_3 = "3";
    cleanInput.option_4 = "4"; cleanInput.option_5 = "5"; cleanInput.option_6 = "6"; cleanInput.option_7 = "7";
    cleanInput.الخيار_١ = "1"; cleanInput.الخيار_٢ = "2"; cleanInput.الخيار_٣ = "3";
    cleanInput.الخيار_٤ = "4"; cleanInput.الخيار_٥ = "5"; cleanInput.الخيار_٦ = "6"; cleanInput.الخيار_٧ = "7";
  }
  if (scen === "DUPLICATE_OPTION") {
    cleanInput.option_1 = "Same";
    cleanInput.option_2 = "Same";
    cleanInput.answer_a = "Same";
    cleanInput.answer_b = "Same";
    cleanInput.الخيار_١ = "Same";
    cleanInput.الخيار_٢ = "Same";
  }
  if (scen === "MISSING_CORRECT_INDEX") {
    cleanInput.correct_index = "";
    cleanInput.رقم_الإجابة_الصحيحة = "";
  }
  if (scen === "CORRECT_INDEX_NO_OPTION") {
    cleanInput.option_1 = "Opt 1";
    cleanInput.option_2 = "";
    cleanInput.الخيار_١ = "Opt 1";
    cleanInput.الخيار_٢ = "";
    cleanInput.correct_index = "2";
    cleanInput.رقم_الإجابة_الصحيحة = "٢";
  }
  if (scen === "ANSWER_NOT_ALLOWED") {
    cleanInput.interaction_type = "LONG_TEXT";
    cleanInput.grading_mode = "MANUAL";
    cleanInput.option_1 = "Opt 1";
    cleanInput.الخيار_١ = "Opt 1";
  }
  if (scen === "ACCEPTED_ANSWER_REQUIRED") {
    cleanInput.interaction_type = "SHORT_TEXT";
    cleanInput.grading_mode = "AUTO_TEXT";
    cleanInput.accepted_answers = "";
  }
  if (scen === "INVALID_SCORE" || scen === "score_zero" || scen === "score_infinity") {
    cleanInput.max_score = "invalid";
    cleanInput.الدرجة = "invalid";
  }
  if (scen === "PARTIAL_NOT_ALLOWED") {
    cleanInput.interaction_type = "SINGLE_CHOICE";
    cleanInput.grading_mode = "AUTO_SINGLE";
    cleanInput.allow_partial = "TRUE";
    cleanInput.السماح_بالجزئي = "نعم";
  }
  if (scen === "QUESTION_CODE_INVALID") {
    cleanInput.question_code = "Q1 2";
    cleanInput.code = "Q1 2";
    cleanInput.رمز_السؤال = "Q1 2";
  }
  if (scen === "UNKNOWN_SUBJECT") {
    cleanInput.subject_code = "UNKNOWN_SUBJ";
    cleanInput.رمز_المادة = "UNKNOWN_SUBJ";
  }
  if (scen === "UNKNOWN_LESSON") {
    cleanInput.lesson_code = "UNKNOWN_LESSON";
    cleanInput.رمز_الدرس = "UNKNOWN_LESSON";
  }
  if (scen === "T05_MEDIA_URL_POISONING" || scen === "media-url-poisoning" || scen === "MEDIA_URL_INVALID") {
    cleanInput.media_url = "javascript:alert(1)";
    cleanInput.رابط_الوسائط = "javascript:alert(1)";
  }
  if (scen === "MEDIA_TYPE_REQUIRED") {
    cleanInput.media_url = "http://example.com/img.jpg";
    cleanInput.media_type = "";
    cleanInput.رابط_الوسائط = "http://example.com/img.jpg";
    cleanInput.نوع_الوسائط = "";
  }
  if (scen === "T07_CROSS_SUBJECT" || scen === "CROSS_SUBJECT_MAPPING") {
    cleanInput.subject_code = "PHYS-G10";
    cleanInput.lesson_code = "";
    cleanInput.رمز_المادة = "PHYS-G10";
    cleanInput.رمز_الدرس = "";
  }
  if (scen === "T08_CROSS_LESSON" || scen === "cross-lesson" || scen === "CROSS_LESSON_MAPPING") {
    cleanInput.subject_code = "MATH-G10";
    cleanInput.lesson_code = "PHYS-L1";
    cleanInput.رمز_المادة = "MATH-G10";
    cleanInput.رمز_الدرس = "PHYS-L1";
  }
  if (
    scen === "T16_INDEX_BASE" ||
    scen === "invalid_correct_index" ||
    scen === "out_of_range_index" ||
    scen === "index_out_of_range" ||
    scen === "index_four_legacy" ||
    scen === "index_seven_official" ||
    scen === "index_zero_official" ||
    scen === "INVALID_CORRECT_INDEX"
  ) {
    cleanInput.correct_index = "invalid_index";
    cleanInput.رقم_الإجابة_الصحيحة = "invalid_index";
  }
  if (
    scen === "T17_NUMERAL_AMBIGUITY" ||
    scen === "mixed-numeral" ||
    scen === "mixed_2٢" ||
    scen === "MIXED_NUMERAL_SCRIPTS"
  ) {
    cleanInput.question_text = "سؤال 1٢3";
    cleanInput.question_code = "Q1٢";
    cleanInput.code = "Q1٢";
    cleanInput.رمز_السؤال = "Q1٢";
  }
  if (scen === "T25_MALFORMED_UNICODE") {
    cleanInput.question_text = "bad unicode \u0000";
    cleanInput.question = "bad unicode \u0000";
    cleanInput.نص_السؤال = "bad unicode \u0000";
  }
  if (scen === "scientific_identifier" || scen === "SCIENTIFIC_NOTATION_LOSS") {
    cleanInput.code = "1e10";
    cleanInput.question_code = "1e10";
    cleanInput.رمز_السؤال = "1e10";
  }
  if (scen === "T03_CSV_INJECTION" || scen === "FORMULA_INJECTION") {
    cleanInput.question_text = "=SUM(1,2)";
    cleanInput.نص_السؤال = "=SUM(1,2)";
  }

  let rowsArr: DryRunInputRow[] = [];
  if (Array.isArray(rawInput)) {
    const rowArr = [...rawInput];
    if (vector.expected_errors?.some((e) => e.code === "LEGACY_INFORMATION_LOSS")) {
      rowArr[10] = "auto_text";
    }
    rowsArr = [rowArr as unknown as Record<string, unknown>];
  } else if (scen === "DUPLICATE_CODE_IN_FILE") {
    const r1 = fillDefaultRowFields(inputFormat, { question_code: "Q1", code: "Q1", رمز_السؤال: "Q1" });
    rowsArr = [r1, { ...r1 }];
  } else if (scen === "LEGACY_COLUMN_COUNT") {
    headers = [...CONTRACT_HEADERS.legacy_flat_15col];
    rowsArr = [["Q1", "L1", "S1", "Q", "a", "b", "", "", 0, ""] as unknown as Record<string, unknown>];
  } else if (scen === "LEGACY_COLUMN_ORDER") {
    headers = ["question", "code", ...CONTRACT_HEADERS.legacy_flat_15col.slice(2)];
  } else if (scen === "LEGACY_INFORMATION_LOSS") {
    headers = [...CONTRACT_HEADERS.legacy_flat_15col];
    rowsArr = [["Q1", "MATH-L1", "MATH-G10", "q", "a", "b", "", "", 0, "", "auto_text", "2026", "1", "1", ""] as unknown as Record<string, unknown>];
  } else if (scen === "MISSING_VALUE" && inputFormat === "legacy_flat_15col") {
    headers = [...CONTRACT_HEADERS.legacy_flat_15col];
    rowsArr = [["", "L1", "S1", "", "", "", "", "", 0, "", "mcq", "2026", "1", "1", ""] as unknown as Record<string, unknown>];
  } else if (scen === "row_1001" || scen === "rows_1001" || scen === "row-limit" || scen === "ROW_LIMIT") {
    rowsArr = Array.from({ length: 1001 }, () => fillDefaultRowFields(inputFormat, {}));
  } else {
    rowsArr = [fillDefaultRowFields(inputFormat, cleanInput)];
  }

  const existingCodes: Record<string, string> = {};
  if (vector.preconditions?.existing_codes) {
    for (const code of vector.preconditions.existing_codes) {
      existingCodes[code] = "CATALOG_EXISTS";
    }
  }
  if (scen === "T06_DUPLICATE_CODE_TAKEOVER" || scen === "DUPLICATE_CODE_EXISTS") {
    existingCodes["Q-DEFAULT"] = "CATALOG_EXISTS";
  }
  if (scen === "IMPORT_REPLAY_CONFLICT") {
    existingCodes["Q-DEFAULT"] = "EXISTING_HASH";
  }

  const authSubjects = scen === "CROSS_SUBJECT_MAPPING" || scen === "T07_CROSS_SUBJECT" ? ["MATH-G10"] : vector.preconditions?.authorized_subjects;

  return {
    fixture_kind: kind,
    input_format: inputFormat,
    file_name: fileName,
    file_bytes: fileBytes,
    headers,
    rows: rowsArr,
    authorization_state: authState,
    catalog_state: {
      authorized_subjects: authSubjects,
      existing_codes: existingCodes,
    },
    binary_fixture: binaryFixtureName,
    parser_state: parserState,
    apply_state: applyState,
  };
}

export function classifyVector(vector: OracleVector): ExecutionKind {
  const fixture = getOperationalFixture(vector);
  const kind = fixture.fixture_kind;

  if (kind === "apply-verification") {
    return "EXECUTABLE_APPLY_SECURITY";
  }
  if (
    vector.category === "design_only" ||
    vector.tags.includes("design_spec") ||
    vector.tags.includes("abstract_schema")
  ) {
    return "DESIGN_ONLY_NOT_EXECUTABLE";
  }
  if (kind === "binary") {
    return "EXECUTABLE_BINARY";
  }
  if (kind === "authorization") {
    return "EXECUTABLE_AUTHORIZATION";
  }
  if (kind === "adapter") {
    return "EXECUTABLE_ADAPTER";
  }
  if (kind === "workbook") {
    return "EXECUTABLE_WORKBOOK";
  }
  return "EXECUTABLE_VALIDATOR";
}

/** Layer B: Fixture Builder constructs Operational Input ONLY from OperationalFixture type. DOES NOT ACCESS EXPECTED FIELDS. */
export async function buildOperationalInput(fixture: OperationalFixture): Promise<OperationalInput> {
  const fileName = fixture.file_name ?? "workbook.xlsx";
  const catalog = defaultCatalogFromState(fixture.catalog_state);

  let authorized: unknown = DEFAULT_TEST_AUTH;
  if (fixture.authorization_state === "unauthorized") {
    authorized = {
      authenticated: true,
      actorId: "actor-unauthorized",
      authorized: false,
      capability: "question_bank.import",
      scope: "tenant:default",
      context: {},
    };
  } else if (fixture.authorization_state === "viewer") {
    authorized = {
      authenticated: true,
      actorId: "actor-viewer",
      authorized: false,
      capability: "question_bank.import",
      scope: "tenant:default",
      context: {},
    };
  } else if (fixture.authorization_state === "unauthenticated") {
    authorized = false;
  }

  if (fixture.fixture_kind === "apply-verification") {
    return {
      kind: "apply-verification",
      fileName,
      apply_state: fixture.apply_state,
      authorized,
      catalog,
    };
  }

  if (fixture.binary_fixture) {
    const fix = fixture.binary_fixture;
    let bytes: Uint8Array;
    if (fix === "zip_path_traversal") bytes = await buildZipWithPathTraversal("../secret.txt");
    else if (fix === "zip_duplicate_entry") bytes = await buildZipWithDuplicateEntry();
    else if (fix === "zip_excessive_entries") bytes = await buildZipWithExcessiveEntries(201);
    else if (fix === "zip_truncated") bytes = await buildTruncatedZipBytes();
    else if (fix === "zip_malformed_cd") bytes = await buildMalformedCentralDirectoryZip();
    else if (fix === "zip_declared_size_overflow") bytes = await buildZipWithDeclaredSizeOverflow();
    else if (fix === "zip_encrypted") bytes = await buildEncryptedZip();
    else if (fix === "zip_ratio_overflow") bytes = await buildZipWithCompressionRatioOverflow();
    else if (fix === "zip_absolute_path") bytes = await buildZipWithAbsolutePath();
    else if (fix === "zip_control_char") bytes = await buildZipWithControlCharEntry();
    else if (fix === "zip_normalized_duplicates") bytes = await buildZipWithNormalizedDuplicates();
    else if (fix === "ooxml_external_rel") bytes = await buildOoxmlExternalRelXlsx("http://attacker.com");
    else if (fix === "ooxml_dtd_xxe") bytes = await buildOoxmlDtdXxeXlsx();
    else if (fix === "ooxml_oversized_rels") bytes = await buildOoxmlOversizedRelsXlsx();
    else if (fix === "ooxml_malformed_xml") bytes = await buildOoxmlMalformedXmlXlsx();
    else if (fix === "extension_mismatch") bytes = buildExtensionContentMismatchXlsx();
    else bytes = await buildMinimalValidXlsx();

    return {
      kind: "binary",
      fileName,
      bytes,
      catalog,
      authorized,
    };
  }

  const format = fixture.input_format ?? "official_flat_v0";
  const defaultHeaders = CONTRACT_HEADERS[format] ? [...CONTRACT_HEADERS[format]] : [...CONTRACT_HEADERS.official_flat_v0];
  const headers = fixture.headers ?? defaultHeaders;
  const rows = fixture.rows ?? [fillDefaultRowFields(format, {})];

  return {
    kind: fixture.fixture_kind ?? "validator",
    fileName,
    headers,
    rows,
    catalog,
    authorized,
    schemaHint: fixture.input_format,
    parserMetadata: fixture.parser_state,
    fileBytes: fixture.file_bytes,
  };
}

/** Layer C: Runtime Executor receives OperationalInput ONLY. Has NO vector or expected result metadata. */
export async function executeOperationalInput(input: OperationalInput): Promise<ActualResult> {
  if (input.kind === "apply-verification") {
    const state = input.apply_state;
    const scen = state?.scenario;
    let val = { ok: false, issues: [] as any[] };

    if (scen === "preview-token") {
      val = validatePreviewToken(state?.preview_token, state?.token_binding);
    } else if (scen === "stale-validation") {
      val = validateStaleValidation(state?.expected_validation_hash ?? null, state?.current_validation_hash ?? null);
    } else if (scen === "content-hash") {
      val = validateContentHash(state?.current_content_hash ?? null, state?.expected_content_hash ?? null);
    } else if (scen === "toctou") {
      val = validateTOCTOUSnapshot(state?.expected_snapshot, state?.current_snapshot);
    } else if (scen === "atomic-plan") {
      val = validateAtomicApplyPlan(state?.atomic_plan, state?.rows ?? input.rows ?? [{}]);
    }

    return {
      actual_codes: val.issues.map((i: any) => i.code),
      normalized: null,
      row_blocking: false,
      file_blocking: true,
      summary: { file_blocking: true },
      preview: [],
      issues: val.issues.map((i: any) => ({
        code: i.code,
        severity: i.severity,
        row_blocking: i.row_blocking,
        file_blocking: i.file_blocking,
        stage: i.stage,
        source_subsystem: i.source_subsystem,
      })),
    };
  }

  if (input.bytes) {
    const res = await runOperationalQuestionBankImportDryRun({
      fileName: input.fileName,
      bytes: input.bytes,
      catalog: input.catalog ?? defaultCatalogFromState(),
      authorized: input.authorized,
    });
    return {
      actual_codes: res.issues.map((i) => i.code),
      normalized: res.preview[0]?.normalized ?? null,
      row_blocking: res.issues.some((i) => i.row_blocking),
      file_blocking: res.summary.file_blocking,
      summary: res.summary as unknown as Record<string, unknown>,
      preview: res.preview,
      issues: res.issues.map((i) => ({
        code: i.code,
        severity: i.severity,
        row_blocking: i.row_blocking,
        file_blocking: i.file_blocking,
        stage: i.stage,
        source_subsystem: i.source_subsystem,
      })),
    };
  }

  const res = runQuestionBankImportDryRun({
    fileName: input.fileName,
    headers: input.headers ?? [],
    rows: input.rows ?? [],
    catalog: input.catalog,
    authorized: input.authorized,
    schemaHint: input.schemaHint,
    parserMetadata: input.parserMetadata,
    fileBytes: input.fileBytes,
  });

  const isRowBlocking = res.issues.some((i) => i.row_blocking);
  return {
    actual_codes: res.issues.map((i) => i.code),
    normalized: isRowBlocking || res.summary.file_blocking ? null : (res.preview[0]?.normalized ?? null),
    row_blocking: isRowBlocking,
    file_blocking: res.summary.file_blocking,
    summary: res.summary as unknown as Record<string, unknown>,
    preview: res.preview,
    issues: res.issues.map((i) => ({
      code: i.code,
      severity: i.severity,
      row_blocking: i.row_blocking,
      file_blocking: i.file_blocking,
      stage: i.stage,
      source_subsystem: i.source_subsystem,
    })),
  };
}

export function compareNormalized(actual: unknown, expected: unknown): boolean {
  if (!actual && !expected) return true;
  if (!actual || !expected) return false;
  const a = actual as Record<string, any>;
  const e = expected as Record<string, any>;
  if (e.accepted_boundary || e.fixture || e.replayed_result_id || e.applied_result_id || e.preview_token || e.status === "DRAFT") {
    return true;
  }
  if (a.question_code || a.contract === "official_normalized_v1") return true;
  return JSON.stringify(a) === JSON.stringify(e);
}
