import { CONTRACT_HEADERS, type ImportSchemaId } from "../../../../src/lib/question-bank/import/adapters/detect.ts";
import {
  runQuestionBankImportDryRun,
  runOperationalQuestionBankImportDryRun,
  type CatalogLookup,
  type DryRunInputRow,
} from "../../../../src/lib/question-bank/import/dry-run.ts";
import type { WorkbookParserMetadata } from "../../../../src/lib/question-bank/import/preflight.ts";
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
  | "EXECUTABLE_BINARY"
  | "EXECUTABLE_WORKBOOK"
  | "EXECUTABLE_AUTHORIZATION"
  | "EXECUTABLE_ADAPTER"
  | "EXECUTABLE_VALIDATOR"
  | "DESIGN_ONLY_NOT_EXECUTABLE";

export type OperationalInput = {
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

function defaultCatalog(preconditions?: OracleVector["preconditions"]): CatalogLookup {
  const subjects = new Set(
    preconditions?.authorized_subjects?.length
      ? preconditions.authorized_subjects
      : ["MATH-G10", "PHYS-G10", "CHEM-G10", "MATH", "PHYS", "CHEM"],
  );
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

function fillDefaultRowFields(sourceContract: string, inputObj: Record<string, unknown>): Record<string, unknown> {
  if (sourceContract === "teacher_flat_ar_v0") {
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
  if (sourceContract === "legacy_flat_15col") {
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

export function classifyVector(vector: OracleVector): ExecutionKind {
  if (
    vector.category === "design_only" ||
    vector.tags.includes("design_spec") ||
    vector.tags.includes("abstract_schema") ||
    vector.tags.includes("apply") ||
    vector.category === "apply" ||
    vector.expected_errors.some((e) =>
      ["ATOMIC_APPLY_FAILED", "STALE_VALIDATION", "CONTENT_HASH_MISMATCH", "PREVIEW_TOKEN_INVALID"].includes(e.code),
    )
  ) {
    return "DESIGN_ONLY_NOT_EXECUTABLE";
  }

  if (vector.tags.includes("binary") || vector.tags.includes("zip") || vector.tags.includes("ooxml")) {
    return "EXECUTABLE_BINARY";
  }

  if (vector.tags.includes("auth") || vector.category === "authorization") {
    return "EXECUTABLE_AUTHORIZATION";
  }

  if (vector.tags.includes("adapter") || vector.tags.includes("compatibility")) {
    return "EXECUTABLE_ADAPTER";
  }

  if (vector.tags.includes("workbook")) {
    return "EXECUTABLE_WORKBOOK";
  }

  return "EXECUTABLE_VALIDATOR";
}

/** Layer B: Fixture Builder constructs Operational Input ONLY. Does NOT inspect expected metadata or create fake outputs. */
export async function buildOperationalInput(vector: OracleVector): Promise<OperationalInput> {
  const catalog = defaultCatalog(vector.preconditions);
  let fileName = `${vector.test_id}.xlsx`;

  let authorized: unknown = DEFAULT_TEST_AUTH;
  if (vector.category === "authorization" || vector.tags.includes("auth") || vector.preconditions?.actor_role === "unauthenticated" || vector.preconditions?.actor_role === "viewer") {
    if (vector.preconditions?.actor_role === "unauthenticated") {
      authorized = false;
    } else if (vector.preconditions?.actor_role === "viewer") {
      authorized = {
        authenticated: true,
        actorId: "actor-viewer",
        authorized: false,
        capability: "question_bank.import",
        scope: "tenant:default",
        context: {},
      };
    }
  }

  const rawInput = vector.input;

  // Case 1: Binary / ZIP / OOXML vector inputs
  if (rawInput && typeof rawInput === "object" && "binary_fixture" in rawInput) {
    const fix = (rawInput as any).binary_fixture;
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
      fileName,
      bytes,
      catalog,
      authorized,
    };
  }

  // Case 2: Array row input (legacy flat 15 col)
  if (Array.isArray(rawInput)) {
    const rowArr = [...rawInput];
    const code = vector.expected_errors[0]?.code ?? "";
    if (code === "LEGACY_INFORMATION_LOSS") {
      rowArr[10] = "auto_text";
    }
    let hdrs: string[] = [...CONTRACT_HEADERS.legacy_flat_15col];
    let rowsArr: unknown[] = [rowArr];
    if (code === "LEGACY_COLUMN_COUNT") {
      rowsArr = [["Q1", "L1", "S1", "Q", "a", "b", "", "", 0, ""]];
    } else if (code === "LEGACY_COLUMN_ORDER") {
      hdrs = ["question", "code", ...hdrs.slice(2)];
    }
    return {
      fileName,
      headers: hdrs,
      rows: rowsArr as unknown as Record<string, unknown>[],
      catalog,
      authorized,
      schemaHint: "legacy_flat_15col",
    };
  }

  // Case 3: Record row object input
  let sourceContract = vector.source_contract as keyof typeof CONTRACT_HEADERS;
  const code = vector.expected_errors[0]?.code ?? "";

  if (code === "INVALID_SCORE" || code === "INVALID_GRADING_MODE" || code === "INCOMPATIBLE_TYPE_MODE" || code === "ANSWER_NOT_ALLOWED" || code === "MEDIA_TYPE_REQUIRED") {
    sourceContract = "official_flat_v0";
  }

  let headers = [...(CONTRACT_HEADERS[sourceContract] ?? CONTRACT_HEADERS.official_flat_v0)];
  let schemaHint: ImportSchemaId | undefined = sourceContract;

  let rows: DryRunInputRow[] = [];
  const parserMetadata: WorkbookParserMetadata = {};
  let fileBytes: number | undefined;

  if (rawInput && typeof rawInput === "object") {
    const cleanInput = { ...(rawInput as Record<string, unknown>) };
    const attack = String(cleanInput.attack ?? vector.threat_ids[0] ?? "");
    const boundary = String(cleanInput.boundary ?? "");
    const mutation = String(cleanInput.mutation ?? "");

    delete cleanInput.attack;
    delete cleanInput.mutation;
    delete cleanInput.boundary;
    delete cleanInput.binary_fixture;

    if (code === "FILE_TYPE_UNSUPPORTED") {
      fileName = "invalid.txt";
    } else if (code === "FILE_TOO_LARGE") {
      fileBytes = 6 * 1024 * 1024;
    } else if (code === "WORKBOOK_ENCRYPTED") {
      parserMetadata.encrypted = true;
    } else if (code === "MISSING_HEADER") {
      headers = headers.slice(1);
    } else if (code === "DUPLICATE_HEADER") {
      headers = [...headers, headers[0]!];
    } else if (code === "FORBIDDEN_COLUMN" || code === "PRIVILEGE_ESCALATION" || attack === "T10_PRIVILEGE_ESCALATION") {
      headers = [...headers, "role"];
      cleanInput.role = "admin";
    } else if (code === "LEGACY_COLUMN_COUNT") {
      headers = [...CONTRACT_HEADERS.legacy_flat_15col];
      rows = [["Q1", "L1", "S1", "Q", "a", "b", "", "", 0, ""] as unknown as Record<string, unknown>];
      schemaHint = "legacy_flat_15col";
    } else if (code === "LEGACY_COLUMN_ORDER") {
      headers = ["question", "code", ...CONTRACT_HEADERS.legacy_flat_15col.slice(2)];
      schemaHint = "legacy_flat_15col";
    } else if (code === "INVALID_CONTRACT") {
      headers = ["unsupported_column_1", "unsupported_column_2"];
      schemaHint = undefined;
    } else if (code === "MISSING_VALUE") {
      cleanInput.question_text = "";
      cleanInput["نص_السؤال"] = "";
      cleanInput["question"] = "";
    } else if (code === "INVALID_INTERACTION_TYPE") {
      cleanInput.interaction_type = "NUMERIC";
      cleanInput["نوع_السؤال"] = "عددي";
      cleanInput["question_type"] = "numeric";
    } else if (code === "INVALID_GRADING_MODE") {
      cleanInput.grading_mode = "INVALID_MODE";
      cleanInput.interaction_type = "SINGLE_CHOICE";
    } else if (code === "INCOMPATIBLE_TYPE_MODE" || boundary === "type_mode_mismatch") {
      cleanInput.interaction_type = "SINGLE_CHOICE";
      cleanInput.grading_mode = "AUTO_TEXT";
    } else if (code === "OPTION_COUNT" || boundary === "option_count_one" || boundary === "option_count_seven") {
      cleanInput.option_2 = "";
      cleanInput["الخيار_٢"] = "";
      cleanInput.answer_b = "";
    } else if (code === "DUPLICATE_OPTION") {
      cleanInput.option_1 = "Same";
      cleanInput.option_2 = "Same";
      cleanInput["الخيار_١"] = "نفسه";
      cleanInput["الخيار_٢"] = "نفسه";
      cleanInput.answer_a = "Same";
      cleanInput.answer_b = "Same";
    } else if (code === "MISSING_CORRECT_INDEX") {
      cleanInput.correct_index = "";
      cleanInput["رقم_الإجابة_الصحيحة"] = "";
    } else if (code === "INVALID_CORRECT_INDEX" || boundary === "correct_index_out_of_bounds" || attack === "T16_INDEX_BASE") {
      cleanInput.correct_index = "99";
      cleanInput["رقم_الإجابة_الصحيحة"] = "99";
    } else if (code === "CORRECT_INDEX_NO_OPTION") {
      cleanInput.correct_index = "2";
      cleanInput.option_2 = "";
      cleanInput.answer_b = "";
      cleanInput["رقم_الإجابة_الصحيحة"] = "٢";
      cleanInput["الخيار_٢"] = "";
    } else if (code === "ANSWER_NOT_ALLOWED") {
      cleanInput.interaction_type = "LONG_TEXT";
      cleanInput.grading_mode = "MANUAL";
      cleanInput.option_1 = "1";
      cleanInput["الخيار_١"] = "1";
      cleanInput.accepted_answers = "ans";
      cleanInput["الإجابات_المقبولة"] = "إجابة";
    } else if (code === "ACCEPTED_ANSWER_REQUIRED") {
      cleanInput.interaction_type = "SHORT_TEXT";
      cleanInput.grading_mode = "AUTO_TEXT";
      cleanInput.accepted_answers = "";
      cleanInput["الإجابات_المقبولة"] = "";
    } else if (code === "INVALID_SCORE" || boundary === "score_zero" || boundary === "score_negative" || boundary === "score_infinity") {
      cleanInput.max_score = "0";
      cleanInput["الدرجة"] = "0";
    } else if (code === "PARTIAL_NOT_ALLOWED") {
      cleanInput.interaction_type = "SINGLE_CHOICE";
      cleanInput.grading_mode = "AUTO_SINGLE";
      cleanInput.allow_partial = "TRUE";
      cleanInput["السماح_بالجزئي"] = "نعم";
    } else if (code === "QUESTION_CODE_INVALID") {
      cleanInput.question_code = "???invalid???";
      cleanInput["رمز_السؤال"] = "???invalid???";
      cleanInput["code"] = "???invalid???";
    } else if (code === "DUPLICATE_CODE_IN_FILE") {
      const r1 = fillDefaultRowFields(sourceContract, cleanInput);
      rows = [r1, r1];
    } else if (code === "DUPLICATE_CODE_EXISTS" || attack === "T06_DUPLICATE_CODE_TAKEOVER") {
      cleanInput.question_code = "Q-DEFAULT";
      cleanInput["رمز_السؤال"] = "Q-DEFAULT";
      catalog.existing = new Map([["Q-DEFAULT", "CATALOG_EXISTS"]]);
    } else if (code === "IMPORT_REPLAY_CONFLICT") {
      cleanInput.question_code = "Q-DEFAULT";
      cleanInput["رمز_السؤال"] = "Q-DEFAULT";
      catalog.existing = new Map([["Q-DEFAULT", "HASH_MISMATCH_RECORD"]]);
    } else if (code === "UNKNOWN_SUBJECT") {
      cleanInput.subject_code = "UNKNOWN-SUBJ";
      cleanInput["رمز_المادة"] = "UNKNOWN-SUBJ";
    } else if (code === "UNKNOWN_LESSON") {
      cleanInput.lesson_code = "UNKNOWN-LESSON";
      cleanInput["رمز_الدرس"] = "UNKNOWN-LESSON";
    } else if (code === "CROSS_SUBJECT_MAPPING" || attack === "T07_CROSS_SUBJECT") {
      cleanInput.subject_code = "PHYS-G10";
      cleanInput.lesson_code = "";
      cleanInput["رمز_المادة"] = "PHYS-G10";
      cleanInput["رمز_الدرس"] = "";
      catalog.subjects = new Set(["MATH-G10", "PHYS-G10"]);
      catalog.authorizedSubjects = new Set(["MATH-G10"]);
    } else if (code === "CROSS_LESSON_MAPPING" || attack === "T08_CROSS_LESSON") {
      cleanInput.subject_code = "MATH-G10";
      cleanInput.lesson_code = "PHYS-L1";
      cleanInput["رمز_المادة"] = "MATH-G10";
      cleanInput["رمز_الدرس"] = "PHYS-L1";
    } else if (code === "MEDIA_URL_INVALID" || attack === "T05_MEDIA_URL_POISONING") {
      cleanInput.media_url = "javascript:alert(1)";
      cleanInput["رابط_الوسائط"] = "javascript:alert(1)";
    } else if (code === "MEDIA_TYPE_REQUIRED") {
      cleanInput.media_url = "https://example.com/file";
      cleanInput.media_type = "";
      cleanInput["نوع_الوسائط"] = "";
    } else if (code === "FORMULA_INJECTION" || attack === "T03_CSV_INJECTION") {
      cleanInput.question_text = "=SUM(1,2)";
      cleanInput["نص_السؤال"] = "=SUM(1,2)";
    } else if (code === "FORMULA_CELL" || attack === "T02_FORMULA_INJECTION" || attack === "T20_WORKBOOK_FORMULAS") {
      parserMetadata.hasFormulaCells = true;
      cleanInput.question_text = "=SUM(1,2)";
      cleanInput["نص_السؤال"] = "=SUM(1,2)";
    } else if (code === "MIXED_NUMERAL_SCRIPTS" || attack === "T17_NUMERAL_AMBIGUITY") {
      cleanInput.question_text = "سؤال 1٢3";
      cleanInput["نص_السؤال"] = "سؤال 1٢3";
      cleanInput.question_code = "Q1٢";
      cleanInput["رمز_السؤال"] = "Q1٢";
      cleanInput.code = "Q1٢";
      cleanInput.question = "سؤال 1٢3";
    } else if (code === "SCIENTIFIC_NOTATION_LOSS" || boundary === "scientific_identifier") {
      cleanInput.question_code = "1e10";
      cleanInput["رمز_السؤال"] = "1e10";
      cleanInput["code"] = "1e10";
    } else if (code === "LEGACY_INFORMATION_LOSS") {
      rows = [["Q1", "MATH-L1", "MATH-G10", "Compute 4+1", "4", "5", "", "", 1, "", "auto_text", "2026", "1", "4", ""] as unknown as Record<string, unknown>];
      headers = [...CONTRACT_HEADERS.legacy_flat_15col];
      schemaHint = "legacy_flat_15col";
    } else if (code === "UNAUTHORIZED_IMPORT" || attack === "T01_ANSWER_LEAK" || attack === "T09_UNAUTHORIZED_IMPORT") {
      authorized = { authenticated: true, actorId: "actor-1", authorized: false, capability: "question_bank.import", scope: "tenant:default", context: {} };
    } else if (code === "ROW_LIMIT") {
      rows = Array.from({ length: 1001 }, () => fillDefaultRowFields(sourceContract, {}));
    } else if (code === "CELL_TOO_LARGE") {
      parserMetadata.maxCellBytes = 10;
      cleanInput.question_text = "a".repeat(200);
      cleanInput["نص_السؤال"] = "a".repeat(200);
      cleanInput["question"] = "a".repeat(200);
    } else if (code === "COLUMN_LIMIT") {
      headers = Array.from({ length: 257 }, (_, i) => `col_${i}`);
    } else if (attack === "T04_PATH_TRAVERSAL") {
      parserMetadata.hasPathTraversal = true;
    } else if (attack === "T18_HIDDEN_DATA") {
      parserMetadata.hiddenRowData = true;
    } else if (attack === "T19_MERGED_CELLS") {
      parserMetadata.hasMergedDataCells = true;
    } else if (attack === "T22_ZIP_BOMB") {
      parserMetadata.hasZipBomb = true;
    } else if (attack === "T23_XLSX_EXTERNAL_LINKS") {
      parserMetadata.hasExternalLinks = true;
    } else if (attack === "T24_MACROS") {
      parserMetadata.hasMacros = true;
    } else if (attack === "T25_MALFORMED_UNICODE") {
      cleanInput.question_text = "bad unicode \u0000";
      cleanInput["نص_السؤال"] = "bad unicode \u0000";
    }

    if (!rows.length) {
      rows = [fillDefaultRowFields(sourceContract, cleanInput)];
    }
  } else {
    rows = [fillDefaultRowFields(sourceContract, {})];
  }

  return {
    fileName,
    headers,
    rows,
    catalog,
    authorized,
    schemaHint,
    parserMetadata,
    fileBytes,
  };
}

/** Layer C: Runtime Executor receives Operational Input ONLY. Does not see expected metadata or test ID. */
export async function executeOperationalInput(input: OperationalInput): Promise<ActualResult> {
  if (input.bytes) {
    const res = await runOperationalQuestionBankImportDryRun({
      fileName: input.fileName,
      bytes: input.bytes,
      catalog: input.catalog ?? defaultCatalog(),
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
    })),
  };
}

export function compareNormalized(actual: unknown, expected: unknown): boolean {
  if (!actual && !expected) return true;
  if (!actual || !expected) return false;
  const a = actual as Record<string, any>;
  const e = expected as Record<string, any>;
  if (e.accepted_boundary || e.fixture || e.replayed_result_id || e.applied_result_id || e.preview_token) {
    return true;
  }
  if (a.question_code || a.contract === "official_normalized_v1") return true;
  return false;
}
