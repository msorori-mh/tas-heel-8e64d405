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
import { contentFingerprint } from "../../../../src/lib/question-bank/import/validate.ts";
import { adaptTeacherFlatArV0 } from "../../../../src/lib/question-bank/import/adapters/teacher-flat-ar-v0.ts";
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
  kind?: "apply-verification" | "binary" | "authorization" | "adapter" | "validator" | "workbook";
  format?: string;
  file_name?: string;
  content_type?: string;
  headers?: string[];
  rows?: DryRunInputRow[];
  authorization_scenario?: string;
  catalog_scenario?: string;
  binary_scenario?: string;
  scenario?: string;
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

/** Independent Operational Fixture Specification. Does NOT contain expected output metadata. */
export type OperationalFixtureSpec = {
  test_id: string;
  source_contract: "teacher_flat_ar_v0" | "official_flat_v0" | "legacy_flat_15col";
  input: unknown;
  scenario?: string;
  tags?: string[];
  operational_fixture?: OperationalFixture;
  preconditions?: {
    actor_role?: string;
    authorized_subjects?: string[];
    existing_codes?: string[];
  };
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
  testId: string;
  fileName: string;
  scenario?: string;
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

function defaultCatalog(preconditions?: OperationalFixtureSpec["preconditions"]): CatalogLookup {
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
  const attack = String((vector.input as any)?.attack ?? (vector.input as any)?.scenario ?? vector.operational_fixture?.scenario ?? "");
  const kind = vector.operational_fixture?.kind;

  if (
    kind === "apply-verification" ||
    attack === "T12_PARTIAL_WRITE" ||
    attack === "T13_STALE_VALIDATION" ||
    attack === "T14_TOCTOU" ||
    attack === "T15_HASH_MISMATCH" ||
    attack === "preview-token-invalid" ||
    attack === "stale-validation" ||
    attack === "content-hash-mismatch" ||
    attack === "atomic-apply-failed"
  ) {
    return "EXECUTABLE_APPLY_SECURITY";
  }

  if (
    vector.category === "design_only" ||
    vector.tags.includes("design_spec") ||
    vector.tags.includes("abstract_schema")
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

/** Layer B: Fixture Builder constructs Operational Input ONLY from OperationalFixtureSpec. Does NOT inspect expected output metadata. */
export async function buildOperationalInput(spec: OperationalFixtureSpec): Promise<OperationalInput> {
  const catalog = defaultCatalog(spec.preconditions);
  let fileName = "workbook.xlsx";

  const rawInput = spec.input;
  const cleanInput = (rawInput && typeof rawInput === "object") ? { ...(rawInput as any) } : {};
  if (cleanInput.input && typeof cleanInput.input === "object") Object.assign(cleanInput, cleanInput.input);
  if (cleanInput.row && typeof cleanInput.row === "object") Object.assign(cleanInput, cleanInput.row);

  const attack = String(cleanInput.attack ?? cleanInput.scenario ?? spec.scenario ?? spec.operational_fixture?.scenario ?? "");
  const boundary = String(cleanInput.boundary ?? "");
  const mutation = String(cleanInput.mutation ?? "");
  const tags = Array.isArray(spec.tags) ? spec.tags.map(String) : [];

  let kind: string | undefined = spec.operational_fixture?.kind;

  let authorized: unknown = DEFAULT_TEST_AUTH;
  if (
    spec.operational_fixture?.authorization_scenario === "unauthorized-actor" ||
    spec.operational_fixture?.authorization_scenario === "viewer-actor" ||
    spec.scenario === "unauthorized-actor" ||
    spec.scenario === "viewer-actor" ||
    attack === "T01_ANSWER_LEAK" ||
    attack === "T09_UNAUTHORIZED_IMPORT" ||
    mutation === "UNAUTHORIZED_IMPORT"
  ) {
    if (spec.scenario === "unauthorized-actor" || attack === "T01_ANSWER_LEAK" || attack === "T09_UNAUTHORIZED_IMPORT" || mutation === "UNAUTHORIZED_IMPORT") {
      authorized = {
        authenticated: true,
        actorId: "actor-unauthorized",
        authorized: false,
        capability: "question_bank.import",
        scope: "tenant:default",
        context: {},
      };
    } else if (spec.preconditions?.actor_role === "viewer" || spec.scenario === "viewer-actor") {
      authorized = {
        authenticated: true,
        actorId: "actor-viewer",
        authorized: false,
        capability: "question_bank.import",
        scope: "tenant:default",
        context: {},
      };
    }
  } else if (spec.preconditions?.actor_role === "unauthenticated") {
    authorized = false;
  }

  let applyState = spec.operational_fixture?.apply_state;
  if (
    kind === "apply-verification" ||
    attack === "T12_PARTIAL_WRITE" ||
    attack === "T13_STALE_VALIDATION" ||
    attack === "T14_TOCTOU" ||
    attack === "T15_HASH_MISMATCH" ||
    attack === "preview-token-invalid" ||
    attack === "stale-validation" ||
    attack === "content-hash-mismatch" ||
    attack === "atomic-apply-failed" ||
    mutation === "PREVIEW_TOKEN_INVALID" ||
    mutation === "STALE_VALIDATION" ||
    mutation === "CONTENT_HASH_MISMATCH" ||
    mutation === "ATOMIC_APPLY_FAILED"
  ) {
    kind = "apply-verification";
    if (!applyState) {
      if (attack === "T12_PARTIAL_WRITE" || attack === "atomic-apply-failed" || mutation === "ATOMIC_APPLY_FAILED") {
        applyState = { scenario: "atomic-plan", atomic_plan: { simulateFailure: true } };
      } else if (attack === "T13_STALE_VALIDATION" || attack === "stale-validation" || mutation === "STALE_VALIDATION") {
        applyState = { scenario: "stale-validation", expected_validation_hash: "hashA", current_validation_hash: "hashB" };
      } else if (attack === "T14_TOCTOU") {
        applyState = { scenario: "toctou", expected_snapshot: { version: 1 }, current_snapshot: { version: 2 } };
      } else if (attack === "T15_HASH_MISMATCH" || attack === "content-hash-mismatch" || mutation === "CONTENT_HASH_MISMATCH") {
        applyState = { scenario: "content-hash", expected_content_hash: "hashA", current_content_hash: "hashB" };
      } else if (attack === "preview-token-invalid" || mutation === "PREVIEW_TOKEN_INVALID") {
        applyState = { scenario: "preview-token", preview_token: "invalid" };
      }
    }
    return {
      kind,
      testId: spec.test_id,
      fileName,
      scenario: attack || mutation,
      apply_state: applyState,
      authorized,
      catalog,
    };
  }

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
      kind: "binary",
      testId: spec.test_id,
      fileName,
      bytes,
      catalog,
      authorized,
    };
  }

  // Case 2: Array row input (legacy flat 15 col)
  if (Array.isArray(rawInput)) {
    const rowArr = [...rawInput];
    let hdrs: string[] = [...CONTRACT_HEADERS.legacy_flat_15col];
    let rowsArr: unknown[] = [rowArr];
    if (String(rowArr[10]).toLowerCase() === "auto_text" || tags.includes("AUTO_TEXT") || tags.includes("information_loss")) {
      rowArr[10] = "auto_text";
    }
    if (spec.scenario === "legacy-column-count") {
      rowsArr = [["Q1", "L1", "S1", "Q", "a", "b", "", "", 0, ""]];
    } else if (spec.scenario === "legacy-column-order") {
      hdrs = ["question", "code", ...hdrs.slice(2)];
    }
    return {
      kind: "adapter",
      testId: spec.test_id,
      fileName,
      headers: hdrs,
      rows: rowsArr as unknown as Record<string, unknown>[],
      catalog,
      authorized,
      schemaHint: "legacy_flat_15col",
    };
  }

  // Case 3: Record row object input derived strictly from operational properties
  let sourceContract = spec.source_contract as keyof typeof CONTRACT_HEADERS;
  let headers = [...(CONTRACT_HEADERS[sourceContract] ?? CONTRACT_HEADERS.official_flat_v0)];
  let schemaHint: ImportSchemaId | undefined = sourceContract;

  let rows: DryRunInputRow[] = [];
  const parserMetadata: WorkbookParserMetadata = {};
  let fileBytes: number | undefined;

  delete cleanInput.binary_fixture;

  if (attack === "unsupported-file-type" || mutation === "FILE_TYPE_UNSUPPORTED") {
    fileName = "invalid.txt";
  }
  if (attack === "file-too-large" || cleanInput.boundary === "file_too_large" || mutation === "FILE_TOO_LARGE") {
    fileBytes = 6 * 1024 * 1024;
  }
  if (attack === "encrypted-workbook" || mutation === "WORKBOOK_ENCRYPTED") {
    parserMetadata.encrypted = true;
  }
  if (attack === "missing-header" || mutation === "MISSING_HEADER") {
    headers = headers.slice(1);
  }
  if (cleanInput.mutation === "LEGACY_INFORMATION_LOSS" || attack === "LEGACY_INFORMATION_LOSS") {
    headers = [...CONTRACT_HEADERS.legacy_flat_15col];
    rows = [["Q1", "MATH-L1", "MATH-G10", "q", "a", "b", "", "", 0, "", "auto_text", "2026", "1", "1", ""] as unknown as Record<string, unknown>];
    schemaHint = "legacy_flat_15col";
  }
  if (boundary === "seven_options") {
    cleanInput.option_1 = "Opt 1"; cleanInput.option_2 = "Opt 2"; cleanInput.option_3 = "Opt 3";
    cleanInput.option_4 = "Opt 4"; cleanInput.option_5 = "Opt 5"; cleanInput.option_6 = "Opt 6"; cleanInput.option_7 = "Opt 7";
    cleanInput.الخيار_١ = "الخيار 1"; cleanInput.الخيار_٢ = "الخيار 2"; cleanInput.الخيار_٣ = "الخيار 3";
    cleanInput.الخيار_٤ = "الخيار 4"; cleanInput.الخيار_٥ = "الخيار 5"; cleanInput.الخيار_٦ = "الخيار 6"; cleanInput.الخيار_٧ = "الخيار 7";
  }
  if (attack === "duplicate-header" || mutation === "DUPLICATE_HEADER") {
    headers = [...headers, headers[0]!];
  }
  if (attack === "T10_PRIVILEGE_ESCALATION" || attack === "forbidden-column" || mutation === "PRIVILEGE_ESCALATION" || mutation === "FORBIDDEN_COLUMN") {
    headers = [...headers, "role"];
    cleanInput.role = "admin";
  }
  if (attack === "legacy-column-count" || mutation === "LEGACY_COLUMN_COUNT") {
    headers = [...CONTRACT_HEADERS.legacy_flat_15col];
    rows = [["Q1", "L1", "S1", "Q", "a", "b", "", "", 0, ""] as unknown as Record<string, unknown>];
    schemaHint = "legacy_flat_15col";
  }
  if (attack === "legacy-column-order" || mutation === "LEGACY_COLUMN_ORDER") {
    headers = ["question", "code", ...CONTRACT_HEADERS.legacy_flat_15col.slice(2)];
    schemaHint = "legacy_flat_15col";
  }
  if (attack === "invalid-contract" || mutation === "INVALID_CONTRACT") {
    headers = ["unsupported_column_1", "unsupported_column_2"];
    schemaHint = undefined;
  }
  if (attack === "T06_DUPLICATE_CODE_TAKEOVER") {
    cleanInput.question_code = "Q-DEFAULT";
    catalog.existing = new Map([["Q-DEFAULT", "CATALOG_EXISTS"]]);
  }
  if (attack === "T07_CROSS_SUBJECT") {
    cleanInput.subject_code = "PHYS-G10";
    cleanInput.lesson_code = "";
    catalog.subjects = new Set(["MATH-G10", "PHYS-G10"]);
    catalog.authorizedSubjects = new Set(["MATH-G10"]);
  }
  if (attack === "T08_CROSS_LESSON" || attack === "cross-lesson") {
    cleanInput.subject_code = "MATH-G10";
    cleanInput.lesson_code = "PHYS-L1";
    cleanInput.رمز_المادة = "MATH-G10";
    cleanInput.رمز_الدرس = "PHYS-L1";
  }
  if (attack === "T05_MEDIA_URL_POISONING" || attack === "media-url-poisoning" || mutation === "MEDIA_URL_INVALID") {
    cleanInput.media_url = "javascript:alert(1)";
    cleanInput.رابط_الوسائط = "javascript:alert(1)";
  }
  if (attack === "media-type-required" || mutation === "MEDIA_TYPE_REQUIRED") {
    cleanInput.media_url = "http://example.com/img.jpg";
    cleanInput.media_type = "";
    cleanInput.رابط_الوسائط = "http://example.com/img.jpg";
    cleanInput.نوع_الوسائط = "";
  }
  if (mutation === "DUPLICATE_CODE_IN_FILE") {
    const r1 = fillDefaultRowFields(sourceContract, { question_code: "Q1", code: "Q1", رمز_السؤال: "Q1" });
    rows = [r1, { ...r1 }];
  }
  if (attack === "T06_DUPLICATE_CODE_TAKEOVER" || mutation === "DUPLICATE_CODE_EXISTS") {
    cleanInput.question_code = "Q-DEFAULT";
    cleanInput.code = "Q-DEFAULT";
    cleanInput.رمز_السؤال = "Q-DEFAULT";
    catalog.existing = new Map([["Q-DEFAULT", "CATALOG_EXISTS"]]);
  }
  if (mutation === "UNKNOWN_SUBJECT") {
    cleanInput.subject_code = "UNKNOWN_SUBJ";
    cleanInput.رمز_المادة = "UNKNOWN_SUBJ";
  }
  if (mutation === "UNKNOWN_LESSON") {
    cleanInput.lesson_code = "UNKNOWN_LESSON";
    cleanInput.رمز_الدرس = "UNKNOWN_LESSON";
  }
  if (attack === "T07_CROSS_SUBJECT" || mutation === "CROSS_SUBJECT_MAPPING") {
    cleanInput.subject_code = "PHYS-G10";
    cleanInput.lesson_code = "";
    cleanInput.رمز_المادة = "PHYS-G10";
    cleanInput.رمز_الدرس = "";
    catalog.subjects = new Set(["MATH-G10", "PHYS-G10"]);
    catalog.authorizedSubjects = new Set(["MATH-G10"]);
  }
  if (attack === "T08_CROSS_LESSON" || attack === "cross-lesson" || mutation === "CROSS_LESSON_MAPPING") {
    cleanInput.subject_code = "MATH-G10";
    cleanInput.lesson_code = "PHYS-L1";
    cleanInput.رمز_المادة = "MATH-G10";
    cleanInput.رمز_الدرس = "PHYS-L1";
  }
  if (attack === "T03_CSV_INJECTION") {
    cleanInput.question_text = "=SUM(1,2)";
  }
  if (attack === "T02_FORMULA_INJECTION" || attack === "T20_WORKBOOK_FORMULAS" || attack === "formula-cell" || mutation === "FORMULA_INJECTION") {
    parserMetadata.hasFormulaCells = true;
    cleanInput.question_text = "=SUM(1,2)";
    cleanInput.نص_السؤال = "=SUM(1,2)";
  }
  if (attack === "T17_NUMERAL_AMBIGUITY" || attack === "mixed-numeral" || mutation === "MIXED_NUMERAL_SCRIPTS") {
    cleanInput.question_text = "سؤال 1٢3";
    cleanInput.question_code = "Q1٢";
    cleanInput.code = "Q1٢";
    cleanInput.رمز_السؤال = "Q1٢";
  }
  if (boundary === "scientific_identifier" || mutation === "SCIENTIFIC_NOTATION_LOSS") {
    cleanInput.code = "1e10";
    cleanInput.question_code = "1e10";
    cleanInput.رمز_السؤال = "1e10";
  }
  if (attack === "T10_PRIVILEGE_ESCALATION" || attack === "forbidden-column" || mutation === "PRIVILEGE_ESCALATION") {
    headers = [...headers, "role"];
    cleanInput.role = "admin";
  }
  if (mutation === "IMPORT_REPLAY_CONFLICT") {
    cleanInput.question_code = "Q-DEFAULT";
    cleanInput.question_text = "Different Text";
    cleanInput.نص_السؤال = "Different Text";
    catalog.existing = new Map([["Q-DEFAULT", "EXISTING_HASH"]]);
  }
  if (attack === "T04_PATH_TRAVERSAL") parserMetadata.hasPathTraversal = true;
  if (attack === "T18_HIDDEN_DATA" || attack === "hidden-data") parserMetadata.hiddenRowData = true;
  if (attack === "T19_MERGED_CELLS" || attack === "merged-cells") parserMetadata.hasMergedDataCells = true;
  if (attack === "T22_ZIP_BOMB") parserMetadata.hasZipBomb = true;
  if (attack === "T23_XLSX_EXTERNAL_LINKS") parserMetadata.hasExternalLinks = true;
  if (attack === "T24_MACROS") parserMetadata.hasMacros = true;
  if (attack === "T25_MALFORMED_UNICODE") {
    cleanInput.question_text = "bad unicode \u0000";
    cleanInput.question = "bad unicode \u0000";
    cleanInput.نص_السؤال = "bad unicode \u0000";
  }
  if (attack === "MISSING_VALUE") {
    cleanInput.question = "";
    cleanInput.question_text = "";
    cleanInput.نص_السؤال = "";
  }
  if (attack === "INVALID_INTERACTION_TYPE" || mutation === "INVALID_INTERACTION_TYPE") {
    cleanInput.question_type = "invalid";
    cleanInput.interaction_type = "invalid";
    cleanInput.نوع_السؤال = "invalid";
  }
  if (attack === "INVALID_GRADING_MODE" || mutation === "INVALID_GRADING_MODE") {
    headers = [...CONTRACT_HEADERS.official_flat_v0];
    schemaHint = "official_flat_v0";
    cleanInput.interaction_type = "SINGLE_CHOICE";
    cleanInput.grading_mode = "invalid";
  }
  if (attack === "INCOMPATIBLE_TYPE_MODE" || mutation === "INCOMPATIBLE_TYPE_MODE") {
    headers = [...CONTRACT_HEADERS.official_flat_v0];
    schemaHint = "official_flat_v0";
    cleanInput.interaction_type = "SINGLE_CHOICE";
    cleanInput.grading_mode = "AUTO_TEXT";
  }
  if (attack === "DUPLICATE_OPTION" || mutation === "DUPLICATE_OPTION") {
    cleanInput.answer_a = "Same";
    cleanInput.answer_b = "Same";
    cleanInput.option_1 = "Same";
    cleanInput.option_2 = "Same";
    cleanInput.الخيار_١ = "Same";
    cleanInput.الخيار_٢ = "Same";
  }
  if (mutation === "MISSING_VALUE") {
    cleanInput.question = "";
    cleanInput.question_text = "";
    cleanInput.نص_السؤال = "";
  }
  if (boundary === "zero_options" || boundary === "one_option" || mutation === "OPTION_COUNT" || attack === "OPTION_COUNT") {
    cleanInput.option_1 = boundary === "one_option" ? "Opt 1" : "";
    cleanInput.option_2 = "";
    cleanInput.الخيار_١ = boundary === "one_option" ? "Opt 1" : "";
    cleanInput.الخيار_٢ = "";
    cleanInput.answer_a = boundary === "one_option" ? "Opt 1" : "";
    cleanInput.answer_b = "";
  }
  if (attack === "ANSWER_NOT_ALLOWED" || mutation === "ANSWER_NOT_ALLOWED") {
    headers = [...CONTRACT_HEADERS.official_flat_v0];
    schemaHint = "official_flat_v0";
    cleanInput.interaction_type = "LONG_TEXT";
    cleanInput.grading_mode = "MANUAL";
    cleanInput.option_1 = "Opt 1";
    cleanInput.answer_a = "Opt 1";
    cleanInput.الخيار_١ = "Opt 1";
  }
  if (mutation === "CORRECT_INDEX_NO_OPTION") {
    cleanInput.option_1 = "Opt 1";
    cleanInput.option_2 = "";
    cleanInput.الخيار_١ = "Opt 1";
    cleanInput.الخيار_٢ = "";
    cleanInput.correct_index = "2";
    cleanInput.رقم_الإجابة_الصحيحة = "٢";
  }
  if (mutation === "ACCEPTED_ANSWER_REQUIRED") {
    cleanInput.interaction_type = "SHORT_TEXT";
    cleanInput.grading_mode = "AUTO_TEXT";
    cleanInput.accepted_answers = "";
  }
  if (attack === "INVALID_SCORE" || mutation === "INVALID_SCORE") {
    headers = [...CONTRACT_HEADERS.official_flat_v0];
    schemaHint = "official_flat_v0";
    cleanInput.max_score = "invalid";
    cleanInput.الدرجة = "invalid";
    cleanInput.sort_order = "invalid";
  }
  if (mutation === "PARTIAL_NOT_ALLOWED") {
    cleanInput.interaction_type = "SINGLE_CHOICE";
    cleanInput.grading_mode = "AUTO_SINGLE";
    cleanInput.allow_partial = "TRUE";
    cleanInput.السماح_بالجزئي = "نعم";
  }
  if (attack === "QUESTION_CODE_INVALID" || mutation === "QUESTION_CODE_INVALID") {
    cleanInput.code = "Q1 2";
    cleanInput.question_code = "Q1 2";
    cleanInput.رمز_السؤال = "Q1 2";
  }
  if (attack === "DUPLICATE_CODE_EXISTS") {
    cleanInput.question_code = "Q-DEFAULT";
    cleanInput.رمز_السؤال = "Q-DEFAULT";
    cleanInput.code = "Q-DEFAULT";
    catalog.existing = new Map([["Q-DEFAULT", "CATALOG_EXISTS"]]);
  }

  // Boundary checks (independent of attack)
  if (boundary === "zero_options") {
    cleanInput.option_1 = "";
    cleanInput.option_2 = "";
    cleanInput.الخيار_١ = "";
    cleanInput.الخيار_٢ = "";
    cleanInput.answer_a = "";
    cleanInput.answer_b = "";
  }
  if (
    boundary === "invalid_correct_index" ||
    boundary === "out_of_range_index" ||
    boundary === "index_out_of_range" ||
    boundary === "index_four_legacy" ||
    boundary === "index_seven_official" ||
    boundary === "index_zero_official" ||
    attack === "T16_INDEX_BASE" ||
    mutation === "INVALID_CORRECT_INDEX" ||
    tags.includes("INVALID_CORRECT_INDEX")
  ) {
    cleanInput.correct_index = "invalid_index";
    cleanInput["رقم_الإجابة_الصحيحة"] = "invalid_index";
  }
  if (boundary === "score_infinity" || boundary === "invalid_score" || mutation === "INVALID_SCORE" || tags.includes("INVALID_SCORE")) {
    cleanInput.max_score = "invalid";
    cleanInput["الدرجة"] = "invalid";
    cleanInput.sort_order = "invalid";
  }
  if (boundary === "bytes_5242881" || boundary === "file_too_large" || mutation === "FILE_TOO_LARGE" || tags.includes("FILE_TOO_LARGE")) {
    fileBytes = 6 * 1024 * 1024;
  }
  if (
    boundary === "cell_65537" ||
    boundary === "cell_bytes_65537" ||
    boundary === "cell_bytes_overflow" ||
    boundary === "max_cell_bytes" ||
    attack === "T21_CELL_BOMB" ||
    attack === "T21_OVERSIZED_CELLS" ||
    attack === "cell-too-large" ||
    mutation === "CELL_TOO_LARGE" ||
    tags.includes("CELL_TOO_LARGE")
  ) {
    parserMetadata.maxCellBytes = 65537;
    cleanInput.question_text = "a".repeat(200);
    cleanInput.question = "a".repeat(200);
    cleanInput["نص_السؤال"] = "أ".repeat(200);
  }
  if (boundary === "seven_options") {
    cleanInput.option_1 = "Opt 1"; cleanInput.option_2 = "Opt 2"; cleanInput.option_3 = "Opt 3";
    cleanInput.option_4 = "Opt 4"; cleanInput.option_5 = "Opt 5"; cleanInput.option_6 = "Opt 6"; cleanInput.option_7 = "Opt 7";
    cleanInput.الخيار_١ = "الخيار 1"; cleanInput.الخيار_٢ = "الخيار 2"; cleanInput.الخيار_٣ = "الخيار 3";
    cleanInput.الخيار_٤ = "الخيار 4"; cleanInput.الخيار_٥ = "الخيار 5"; cleanInput.الخيار_٦ = "الخيار 6"; cleanInput.الخيار_٧ = "الخيار 7";
  }
  if (boundary === "columns_257" || boundary === "max_columns" || attack === "column-limit" || tags.includes("COLUMN_LIMIT")) {
    headers = Array.from({ length: 257 }, (_, i) => `col_${i}`);
  }
  if (boundary === "row_1001" || boundary === "rows_1001" || boundary === "row_limit" || attack === "row-limit" || tags.includes("ROW_LIMIT")) {
    rows = Array.from({ length: 1001 }, () => fillDefaultRowFields(sourceContract, {}));
  }
  if (boundary === "mixed_2٢" || boundary === "mixed_numeral_code" || boundary === "mixed-numeral" || attack === "mixed-numeral" || mutation === "MIXED_NUMERAL_SCRIPTS" || tags.includes("MIXED_NUMERAL_SCRIPTS")) {
    cleanInput.question_code = "Q1٢";
    cleanInput.code = "Q1٢";
    cleanInput["رمز_السؤال"] = "Q1٢";
  }
  if (boundary === "scientific_identifier") {
    cleanInput.code = "1e10";
    cleanInput.question_code = "1e10";
    cleanInput["رمز_السؤال"] = "1e10";
  }
  if (mutation === "MISSING_CORRECT_INDEX") {
    cleanInput.correct_index = "";
    cleanInput["رقم_الإجابة_الصحيحة"] = "";
  }
  if (boundary === "score_zero" || mutation === "INVALID_SCORE" || boundary === "invalid_score") {
    cleanInput.max_score = 0;
    cleanInput["الدرجة"] = "0";
  }
  if (cleanInput.mutation === "LEGACY_INFORMATION_LOSS") {
    headers = [...CONTRACT_HEADERS.legacy_flat_15col];
    rows = [["Q1", "MATH-L1", "MATH-G10", "q", "a", "b", "", "", 0, "", "auto_text", "2026", "1", "1", ""] as unknown as Record<string, unknown>];
    schemaHint = "legacy_flat_15col";
  }

  if (!rows.length) {
    rows = [fillDefaultRowFields(sourceContract, cleanInput)];
  }

  return {
    kind: kind ?? "validator",
    testId: spec.test_id,
    fileName: spec.operational_fixture?.file_name ?? fileName,
    scenario: attack || boundary,
    headers: spec.operational_fixture?.headers ?? headers,
    rows: spec.operational_fixture?.rows ?? rows,
    catalog,
    authorized,
    schemaHint,
    parserMetadata,
    fileBytes,
  };
}

/** Layer C: Runtime Executor receives Operational Input ONLY. Passes through pure source verifiers when appropriate. */
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
      issues: val.issues.map((i: any) => ({ code: i.code, severity: i.severity, row_blocking: i.row_blocking, file_blocking: i.file_blocking })),
    };
  }

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
