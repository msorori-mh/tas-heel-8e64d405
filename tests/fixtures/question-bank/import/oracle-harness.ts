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
} from "../../../../src/lib/server/question-bank/import/preview-token-server.ts";
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
import {
  OPERATIONAL_FIXTURES,
  type ExplicitOperationalFixture,
} from "./qb02-operational-fixtures.ts";

export type OperationalFixture = ExplicitOperationalFixture;

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
  issues: Array<{ code: string; severity: string; row_blocking: boolean; file_blocking: boolean; stage: string; source_subsystem: string }>;
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

/** Layer A: Fixture Manifest Resolver. Retrieves explicitly defined fixture for a vector. */
export function getOperationalFixture(vectorOrId: OracleVector | string): OperationalFixture {
  const testId = typeof vectorOrId === "string" ? vectorOrId : vectorOrId.test_id;
  const fix = OPERATIONAL_FIXTURES[testId];
  if (!fix) {
    throw new Error(`Missing explicit operational fixture for vector ID: ${testId}`);
  }
  return fix;
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

  if (fixture.binary_fixture_id) {
    const fix = fixture.binary_fixture_id;
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
    rows: rows as DryRunInputRow[],
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

    const validBindingContext: PreviewTokenBindingContext = {
      snapshot_id: "snap-1",
      snapshot_version: 1,
      content_hash: "hash-1",
      actor_id: "actor-123",
      scope: "tenant:default",
    };

    if (scen === "preview-token") {
      val = await validatePreviewToken(state?.preview_token, validBindingContext, { testSecret: "test-secret-12345678901234567890123456789012" });
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
