import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QB_IMPORT_CODES,
  QB_IMPORT_AR_MESSAGES,
  QB_IMPORT_AUDIT_REGISTRY,
  type QbImportCode,
  type ImportStage,
} from "../../../src/lib/question-bank/import/validation-codes.ts";
import { FAILURE_COVERAGE_MANIFEST } from "./support/qb02-failure-coverage-manifest.ts";
import {
  getOperationalFixture,
  buildOperationalInput,
  executeOperationalInput,
  type OracleVector,
} from "../../fixtures/question-bank/import/oracle-harness.ts";
import {
  runQuestionBankImportDryRun,
  runOperationalQuestionBankImportDryRun,
} from "../../../src/lib/question-bank/import/dry-run.ts";
import {
  validateAtomicApplyPlan,
  validateStaleValidation,
  validateContentHash,
  validatePreviewToken,
} from "../../../src/lib/server/question-bank/import/preview-token-server.ts";
import {
  buildOoxmlExternalRelXlsx,
  buildZipWithPathTraversal,
  buildZipWithExcessiveEntries,
  buildZipWithDuplicateEntry,
  buildTruncatedZipBytes,
  buildMalformedCentralDirectoryZip,
  buildZipWithDeclaredSizeOverflow,
  buildEncryptedZip,
  buildZipWithCompressionRatioOverflow,
  buildZipWithTotalSizeOverflow,
  buildZipWithAbsolutePath,
  buildZipWithControlCharEntry,
  buildZipWithNormalizedDuplicates,
  buildOoxmlDtdXxeXlsx,
  buildOoxmlOversizedRelsXlsx,
  buildOoxmlMalformedXmlXlsx,
  buildOoxmlMultipleRelsWithExternalXlsx,
  buildExtensionContentMismatchXlsx,
} from "../../fixtures/question-bank/import/binary-fixtures.ts";
import { CONTRACT_HEADERS } from "../../../src/lib/question-bank/import/adapters/detect.ts";
import { adaptOfficialFlatV0 } from "../../../src/lib/question-bank/import/adapters/official-flat-v0.ts";
import { adaptLegacyFlat15Col } from "../../../src/lib/question-bank/import/adapters/legacy-flat-15col.ts";
import { preflightWorkbook } from "../../../src/lib/question-bank/import/preflight.ts";
import { validateNormalizedRow } from "../../../src/lib/question-bank/import/validate.ts";
import type { OfficialNormalizedV1 } from "../../../src/lib/question-bank/import/official-normalized-v1.ts";
import type { QbImportIssue } from "../../../src/lib/question-bank/import/errors.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const oraclePath = join(__dirname, "../../../docs/question-bank/QB02-IMPORT-TEST-VECTORS-50.json");
const oracleData = JSON.parse(readFileSync(oraclePath, "utf-8")) as {
  vectors: OracleVector[];
};

const DEFAULT_AUTH = {
  authenticated: true,
  actorId: "actor-123",
  authorized: true,
  capability: "question_bank.import",
  scope: "tenant:default",
  context: { actorId: "actor-123" },
};

const DEFAULT_CATALOG = {
  subjects: new Set(["MATH-G10", "PHYS-G10"]),
  lessons: new Set(["MATH-L1"]),
};

function baseRowModel(): OfficialNormalizedV1 {
  return {
    contract: "official_normalized_v1",
    question_code: "Q1",
    targets: [{ target_type: "SUBJECT", target_code: "MATH-G10" }],
    revision: {
      question_text: "Clean question body",
      interaction_type: "SINGLE_CHOICE",
      grading_mode: "AUTO_SINGLE",
      max_score: 1,
      allow_partial_scoring: false,
    },
    options: [
      { option_code: "A", body: "Option A", is_correct: true, sort_order: 1 },
      { option_code: "B", body: "Option B", is_correct: false, sort_order: 2 },
    ],
    accepted_answers: [],
    solutions: [],
    media: [],
  };
}

export type EmittedRecord = {
  code: QbImportCode;
  stage: ImportStage;
  test_name: string;
  fixture: string;
  source_subsystem: string;
};

class FailureCoverageCollector {
  private emittedMap = new Map<QbImportCode, EmittedRecord[]>();
  private actualTestNames = new Set<string>();
  private actualFixtureNames = new Set<string>();

  collect(
    input: { issues?: QbImportIssue[] } | QbImportIssue[] | QbImportIssue,
    testName: string,
    fixtureName: string,
  ) {
    this.actualTestNames.add(testName);
    this.actualFixtureNames.add(fixtureName);

    const issues: QbImportIssue[] = Array.isArray(input)
      ? input
      : "issues" in input && Array.isArray(input.issues)
        ? (input.issues as QbImportIssue[])
        : [input as QbImportIssue];

    for (const issueItem of issues) {
      const code = issueItem.code as QbImportCode;
      if (!Object.prototype.hasOwnProperty.call(QB_IMPORT_CODES, code)) {
        assert.fail(`Unknown failure code emitted at runtime: ${code}`);
      }

      const record: EmittedRecord = {
        code,
        stage: issueItem.stage,
        test_name: testName,
        fixture: fixtureName,
        source_subsystem: issueItem.source_subsystem,
      };
      if (!this.emittedMap.has(code)) {
        this.emittedMap.set(code, []);
      }
      this.emittedMap.get(code)!.push(record);
    }
  }

  get emitted() {
    return this.emittedMap;
  }

  get testNames() {
    return this.actualTestNames;
  }

  get fixtureNames() {
    return this.actualFixtureNames;
  }
}

test("Executable Failure Coverage Collector & Integrity Audit: 100% critical codes actually emitted during runtime execution", async () => {
  const collector = new FailureCoverageCollector();
  const allRegisteredCodes = Object.keys(QB_IMPORT_CODES) as QbImportCode[];

  // 1. Run all 197 Oracle vectors through secured runtime engine
  for (const vector of oracleData.vectors) {
    const fixture = getOperationalFixture(vector);
    const opInput = await buildOperationalInput(fixture);
    const result = await executeOperationalInput(opInput);

    const testName = `QB02 Oracle ${vector.test_id}`;
    const fixtureName = `buildOperationalInput(${vector.test_id})`;

    collector.collect(result, testName, fixtureName);
  }

  // 2. Run Binary Security Fixtures
  const binaryFixtures: Array<{ name: string; builder: () => Promise<Uint8Array> | Uint8Array }> = [
    { name: "extension_mismatch", builder: buildExtensionContentMismatchXlsx },
    { name: "zip_path_traversal", builder: () => buildZipWithPathTraversal("../secret.txt") },
    { name: "zip_excessive_entries", builder: () => buildZipWithExcessiveEntries(201) },
    { name: "zip_duplicate_entry", builder: buildZipWithDuplicateEntry },
    { name: "zip_truncated", builder: buildTruncatedZipBytes },
    { name: "zip_malformed_cd", builder: buildMalformedCentralDirectoryZip },
    { name: "zip_declared_size_overflow", builder: buildZipWithDeclaredSizeOverflow },
    { name: "zip_encrypted", builder: buildEncryptedZip },
    { name: "zip_ratio_overflow", builder: buildZipWithCompressionRatioOverflow },
    { name: "zip_total_size_overflow", builder: buildZipWithTotalSizeOverflow },
    { name: "zip_absolute_path", builder: buildZipWithAbsolutePath },
    { name: "zip_control_char", builder: buildZipWithControlCharEntry },
    { name: "zip_normalized_duplicates", builder: buildZipWithNormalizedDuplicates },
    { name: "ooxml_external_rel", builder: () => buildOoxmlExternalRelXlsx("http://attacker.com") },
    { name: "ooxml_dtd_xxe", builder: buildOoxmlDtdXxeXlsx },
    { name: "ooxml_oversized_rels", builder: buildOoxmlOversizedRelsXlsx },
    { name: "ooxml_malformed_xml", builder: buildOoxmlMalformedXmlXlsx },
    { name: "ooxml_multiple_rels", builder: buildOoxmlMultipleRelsWithExternalXlsx },
  ];

  for (const fix of binaryFixtures) {
    const bytes = await fix.builder();
    const testName = `Binary Fixture ${fix.name}`;
    const fixtureName = `binary-fixture:${fix.name}`;

    const res = await runOperationalQuestionBankImportDryRun({
      fileName: "test.xlsx",
      bytes,
      catalog: DEFAULT_CATALOG,
      authorized: DEFAULT_AUTH,
    });
    collector.collect(res, testName, fixtureName);
  }

  // 3. Run Authorization Matrix cases
  const authCases: Array<{ name: string; auth: unknown }> = [
    { name: "omitted", auth: undefined },
    { name: "malformed", auth: {} },
    { name: "unauthenticated", auth: { ...DEFAULT_AUTH, authenticated: false } },
    { name: "invalid_capability", auth: { ...DEFAULT_AUTH, capability: "invalid" } },
    { name: "scope_mismatch", auth: { ...DEFAULT_AUTH, scope: "wrong" } },
    { name: "expired", auth: { ...DEFAULT_AUTH, expired: true } },
    { name: "unauthorized", auth: { ...DEFAULT_AUTH, authorized: false } },
  ];

  for (const ac of authCases) {
    const testName = `Auth Case ${ac.name}`;
    const fixtureName = `auth-case:${ac.name}`;

    const res = runQuestionBankImportDryRun({
      fileName: "test.xlsx",
      headers: [...CONTRACT_HEADERS.official_flat_v0],
      rows: [],
      authorized: ac.auth,
    });
    collector.collect(res, testName, fixtureName);
  }

  // 4. Run Apply Security Verifiers
  const apply1 = validateAtomicApplyPlan({ simulateFailure: true }, [{}]);
  collector.collect(apply1, "Apply Verifier Atomic", "apply-verifier:Atomic");

  const apply2 = validateStaleValidation("hashA", "hashB");
  collector.collect(apply2, "Apply Verifier Stale", "apply-verifier:Stale");

  const apply3 = validateContentHash("hashA", "hashB");
  collector.collect(apply3, "Apply Verifier ContentHash", "apply-verifier:ContentHash");

  const apply4 = await validatePreviewToken("invalid");
  collector.collect(apply4, "Apply Verifier Token", "apply-verifier:Token");

  // 5. Preflight triggers
  collector.collect(
    preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: [], fileBytes: 6 * 1024 * 1024 }),
    "Preflight FILE_TOO_LARGE",
    "preflightWorkbook",
  );
  collector.collect(
    preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: [], metadata: { hasMacros: true } }),
    "Preflight MACRO_CONTENT",
    "preflightWorkbook",
  );
  collector.collect(
    preflightWorkbook({
      fileName: "x.xlsx",
      headers: [],
      rows: [],
      metadata: { hasFormulaCells: true },
    }),
    "Preflight FORMULA_CELL",
    "preflightWorkbook",
  );
  collector.collect(
    preflightWorkbook({
      fileName: "x.xlsx",
      headers: [],
      rows: [],
      metadata: { hasMergedDataCells: true },
    }),
    "Preflight MERGED_DATA_CELL",
    "preflightWorkbook",
  );
  collector.collect(
    preflightWorkbook({
      fileName: "x.xlsx",
      headers: [],
      rows: [],
      metadata: { hiddenSheetData: true },
    }),
    "Preflight HIDDEN_SHEET_DATA",
    "preflightWorkbook",
  );
  collector.collect(
    preflightWorkbook({
      fileName: "x.xlsx",
      headers: [],
      rows: [],
      metadata: { hiddenRowData: true },
    }),
    "Preflight HIDDEN_ROW_DATA",
    "preflightWorkbook",
  );
  collector.collect(
    preflightWorkbook({
      fileName: "x.xlsx",
      headers: [],
      rows: [],
      metadata: { hiddenColumnData: true },
    }),
    "Preflight HIDDEN_COLUMN_DATA",
    "preflightWorkbook",
  );
  collector.collect(
    preflightWorkbook({
      fileName: "x.xlsx",
      headers: [],
      rows: [],
      metadata: { visibleSheetCount: 3 },
    }),
    "Preflight SHEET_COUNT_INVALID",
    "preflightWorkbook",
  );
  collector.collect(
    preflightWorkbook({
      fileName: "x.xlsx",
      headers: [],
      rows: Array.from({ length: 1001 }, () => ({})),
    }),
    "Preflight ROW_LIMIT",
    "preflightWorkbook",
  );
  collector.collect(
    preflightWorkbook({
      fileName: "x.xlsx",
      headers: Array.from({ length: 257 }, (_, i) => `c_${i}`),
      rows: [],
    }),
    "Preflight COLUMN_LIMIT",
    "preflightWorkbook",
  );
  collector.collect(
    preflightWorkbook({
      fileName: "x.xlsx",
      headers: [],
      rows: [],
      metadata: { maxCellBytes: 65537 },
    }),
    "Preflight CELL_TOO_LARGE",
    "preflightWorkbook",
  );
  collector.collect(
    preflightWorkbook({ fileName: "x.xlsx", headers: ["q", "q"], rows: [] }),
    "Preflight DUPLICATE_HEADER",
    "preflightWorkbook",
  );
  collector.collect(
    preflightWorkbook({ fileName: "x.xlsx", headers: ["bad\u0000"], rows: [] }),
    "Preflight MALFORMED_UNICODE",
    "preflightWorkbook",
  );
  collector.collect(
    preflightWorkbook({ fileName: "x.xlsx", headers: ["role"], rows: [] }),
    "Preflight FORBIDDEN_COLUMN",
    "preflightWorkbook",
  );

  // 6. Dry-run triggers
  const sampleRow1 = {
    question_code: "Q1",
    question_text: "q",
    interaction_type: "SINGLE_CHOICE",
    grading_mode: "AUTO_SINGLE",
    option_1: "a",
    option_2: "b",
    correct_index: 1,
    max_score: 1,
    subject_code: "MATH-G10",
  };
  const sampleRow2 = {
    question_code: "Q1",
    question_text: "q2",
    interaction_type: "SINGLE_CHOICE",
    grading_mode: "AUTO_SINGLE",
    option_1: "a",
    option_2: "b",
    correct_index: 1,
    max_score: 1,
    subject_code: "MATH-G10",
  };

  collector.collect(
    runQuestionBankImportDryRun({
      fileName: "x.xlsx",
      headers: [...CONTRACT_HEADERS.official_flat_v0],
      rows: [sampleRow1, sampleRow2],
      authorized: DEFAULT_AUTH,
      catalog: DEFAULT_CATALOG,
    }),
    "DryRun DUPLICATE_CODE_IN_FILE",
    "runQuestionBankImportDryRun",
  );
  collector.collect(
    runQuestionBankImportDryRun({
      fileName: "x.xlsx",
      headers: [...CONTRACT_HEADERS.official_flat_v0, "extra_unknown_col"],
      rows: [sampleRow1],
      authorized: DEFAULT_AUTH,
      catalog: DEFAULT_CATALOG,
    }),
    "DryRun UNKNOWN_COLUMN",
    "runQuestionBankImportDryRun",
  );
  collector.collect(
    runQuestionBankImportDryRun({
      fileName: "x.xlsx",
      headers: ["question_code", ...CONTRACT_HEADERS.legacy_flat_15col.slice(1)].reverse(),
      rows: [],
      schemaHint: "legacy_flat_15col",
      authorized: DEFAULT_AUTH,
      catalog: DEFAULT_CATALOG,
    }),
    "DryRun LEGACY_COLUMN_ORDER",
    "runQuestionBankImportDryRun",
  );
  collector.collect(
    runQuestionBankImportDryRun({
      fileName: "x.xlsx",
      headers: ["q1", "q2"],
      rows: [],
      schemaHint: "legacy_flat_15col",
      authorized: DEFAULT_AUTH,
      catalog: DEFAULT_CATALOG,
    }),
    "DryRun LEGACY_COLUMN_COUNT",
    "runQuestionBankImportDryRun",
  );
  collector.collect(
    runQuestionBankImportDryRun({
      fileName: "x.xlsx",
      headers: [...CONTRACT_HEADERS.official_flat_v0],
      rows: [{ ...sampleRow1, question_text: "different text" }],
      authorized: DEFAULT_AUTH,
      catalog: { ...DEFAULT_CATALOG, existing: new Map([["Q1", "different_hash"]]) },
    }),
    "DryRun IMPORT_REPLAY_CONFLICT",
    "runQuestionBankImportDryRun",
  );

  // 7. Adapter & row validation triggers
  collector.collect(
    adaptOfficialFlatV0({ question_code: "", question_text: "q" }, {}),
    "Validation MISSING_VALUE",
    "adaptOfficialFlatV0",
  );
  collector.collect(
    adaptOfficialFlatV0(
      {
        question_code: "Q1",
        question_text: "q",
        interaction_type: "INVALID",
        grading_mode: "AUTO_SINGLE",
      },
      {},
    ),
    "Validation INVALID_INTERACTION_TYPE",
    "adaptOfficialFlatV0",
  );
  collector.collect(
    adaptOfficialFlatV0(
      {
        question_code: "Q1",
        question_text: "q",
        interaction_type: "SINGLE_CHOICE",
        grading_mode: "INVALID",
      },
      {},
    ),
    "Validation INVALID_GRADING_MODE",
    "adaptOfficialFlatV0",
  );
  collector.collect(
    adaptOfficialFlatV0(
      {
        question_code: "Q1",
        question_text: "q",
        interaction_type: "SINGLE_CHOICE",
        grading_mode: "AUTO_SINGLE",
        max_score: "0",
      },
      {},
    ),
    "Validation INVALID_SCORE",
    "adaptOfficialFlatV0",
  );
  collector.collect(
    adaptOfficialFlatV0(
      {
        question_code: "Q1",
        question_text: "q",
        interaction_type: "SINGLE_CHOICE",
        grading_mode: "AUTO_SINGLE",
        option_1: "a",
        option_2: "b",
        correct_index: "invalid_non_numeric",
        max_score: 1,
        subject_code: "MATH-G10",
      },
      {},
    ),
    "Validation INVALID_CORRECT_INDEX",
    "adaptOfficialFlatV0",
  );
  collector.collect(
    adaptOfficialFlatV0(
      {
        question_code: "Q1",
        question_text: "q",
        interaction_type: "SINGLE_CHOICE",
        grading_mode: "AUTO_SINGLE",
        option_1: "a",
        option_2: "",
        correct_index: "2",
        max_score: 1,
        subject_code: "MATH-G10",
      },
      {},
    ),
    "Validation CORRECT_INDEX_NO_OPTION",
    "adaptOfficialFlatV0",
  );
  collector.collect(
    adaptOfficialFlatV0(
      {
        question_code: "Q1",
        question_text: "q",
        interaction_type: "SHORT_TEXT",
        grading_mode: "AUTO_TEXT",
        max_score: 1,
        subject_code: "MATH-G10",
      },
      {},
    ),
    "Validation ACCEPTED_ANSWER_REQUIRED",
    "adaptOfficialFlatV0",
  );
  collector.collect(
    adaptOfficialFlatV0(
      {
        question_code: "Q1",
        question_text: "q",
        interaction_type: "SINGLE_CHOICE",
        grading_mode: "AUTO_SINGLE",
        option_1: "a",
        option_2: "b",
        correct_index: "1",
        max_score: 1,
        allow_partial: "TRUE",
        subject_code: "MATH-G10",
      },
      {},
    ),
    "Validation PARTIAL_NOT_ALLOWED",
    "adaptOfficialFlatV0",
  );
  collector.collect(
    adaptOfficialFlatV0(
      {
        question_code: "Q1",
        question_text: "q",
        interaction_type: "LONG_TEXT",
        grading_mode: "MANUAL",
        option_1: "opt",
        max_score: 1,
        subject_code: "MATH-G10",
      },
      {},
    ),
    "Validation ANSWER_NOT_ALLOWED",
    "adaptOfficialFlatV0",
  );
  collector.collect(
    adaptOfficialFlatV0(
      {
        question_code: "Q1",
        question_text: "q",
        interaction_type: "SHORT_TEXT",
        grading_mode: "AUTO_TEXT",
        option_1: "ans1",
        option_2: "ans1",
        accepted_answers: "ans1|ans1",
        max_score: 1,
        subject_code: "MATH-G10",
      },
      {},
    ),
    "Validation DUPLICATE_ACCEPTED_ANSWER",
    "adaptOfficialFlatV0",
  );
  collector.collect(
    adaptOfficialFlatV0({ code: "1e10", question: "q", question_type: "mcq" }, {}),
    "Validation SCIENTIFIC_NOTATION_LOSS",
    "validateNormalizedRow",
  );

  collector.collect(
    adaptLegacyFlat15Col(
      ["Q1", "L1", "PHYS", "q", "a", "b", "", "", 0, "", "auto_text", "2026", "1", "1", ""],
      {},
    ),
    "Validation LEGACY_INFORMATION_LOSS",
    "adaptLegacyFlat15Col",
  );

  const rDupOpt = baseRowModel();
  rDupOpt.options = [
    { option_code: "A", body: "Same", is_correct: true, sort_order: 1 },
    { option_code: "B", body: "Same", is_correct: false, sort_order: 2 },
  ];
  collector.collect(
    validateNormalizedRow(rDupOpt, { catalog: DEFAULT_CATALOG }),
    "Validation DUPLICATE_OPTION",
    "validateNormalizedRow",
  );

  collector.collect(
    validateNormalizedRow(
      { ...baseRowModel(), question_code: " Q1 " },
      { catalog: DEFAULT_CATALOG },
    ),
    "Validation QUESTION_CODE_INVALID",
    "validateNormalizedRow",
  );
  collector.collect(
    validateNormalizedRow(
      {
        ...baseRowModel(),
        targets: [{ target_type: "SUBJECT", target_code: "UNKNOWN_SUBJECT_XYZ" }],
      },
      { catalog: DEFAULT_CATALOG },
    ),
    "Validation UNKNOWN_SUBJECT",
    "validateNormalizedRow",
  );
  collector.collect(
    validateNormalizedRow(
      {
        ...baseRowModel(),
        targets: [
          { target_type: "SUBJECT", target_code: "MATH-G10" },
          { target_type: "LESSON", target_code: "UNKNOWN_LESSON_XYZ" },
        ],
      },
      { catalog: DEFAULT_CATALOG },
    ),
    "Validation UNKNOWN_LESSON",
    "validateNormalizedRow",
  );
  collector.collect(
    validateNormalizedRow(
      { ...baseRowModel(), question_code: "Q1٢" },
      { catalog: DEFAULT_CATALOG },
    ),
    "Validation MIXED_NUMERAL_SCRIPTS",
    "validateNormalizedRow",
  );
  collector.collect(
    validateNormalizedRow(
      { ...baseRowModel(), revision: { ...baseRowModel().revision, question_text: "e\u0301" } },
      { catalog: DEFAULT_CATALOG },
    ),
    "Validation NORMALIZATION_CHANGED",
    "validateNormalizedRow",
  );

  const emittedMap = collector.emitted;
  const actualTestNames = collector.testNames;
  const actualFixtureNames = collector.fixtureNames;

  // 8. Section 12: Semantic Registry Validation
  let duplicateSemanticCodes = 0;
  const canonicalCodeSet = new Set<string>();
  const arMessages = new Map<string, string>();
  const triggerMap = new Map<string, string>();

  for (const code of allRegisteredCodes) {
    assert.ok(!canonicalCodeSet.has(code), `Duplicate canonical code in registry: ${code}`);
    canonicalCodeSet.add(code);

    const msg = QB_IMPORT_AR_MESSAGES[code];
    assert.ok(msg, `Missing Arabic message for code ${code}`);
    if (arMessages.has(msg)) {
      duplicateSemanticCodes++;
      assert.fail(
        `Unintended duplicate Arabic message for codes ${arMessages.get(msg)} and ${code}: "${msg}"`,
      );
    }
    arMessages.set(msg, code);

    const auditEntry = QB_IMPORT_AUDIT_REGISTRY[code];
    assert.ok(auditEntry, `Missing audit registry entry for ${code}`);
    const triggerKey = `${auditEntry.stage}:${auditEntry.trigger}`;
    if (triggerMap.has(triggerKey)) {
      duplicateSemanticCodes++;
      assert.fail(
        `Duplicate trigger in audit registry for ${triggerMap.get(triggerKey)} and ${code}: ${triggerKey}`,
      );
    }
    triggerMap.set(triggerKey, code);
  }

  assert.equal(duplicateSemanticCodes, 0, "Duplicate semantic registry entries count must be 0");

  // 9. Section 11 & Section 9: Real Reference & Runtime Verification Assertions
  const criticalCodes = allRegisteredCodes;
  const emittedCodeSet = new Set(emittedMap.keys());
  const uncoveredCritical = criticalCodes.filter((c) => !emittedCodeSet.has(c));

  assert.equal(
    uncoveredCritical.length,
    0,
    `Critical uncovered failure codes: [${uncoveredCritical.join(", ")}]`,
  );

  let wrongStagesCount = 0;
  let wrongSubsystemsCount = 0;
  let invalidTestRefCount = 0;
  let invalidFixtureRefCount = 0;
  let missingActualEmissionsCount = uncoveredCritical.length;

  for (const code of criticalCodes) {
    const mapping = FAILURE_COVERAGE_MANIFEST[code];
    assert.ok(mapping, `Missing manifest entry for code ${code}`);
    assert.ok(mapping.test_name, `Missing test_name in manifest for code ${code}`);
    assert.ok(mapping.fixture_builder, `Missing fixture_builder in manifest for code ${code}`);

    // Verify test_name exists in actual executed test names
    if (!actualTestNames.has(mapping.test_name)) {
      invalidTestRefCount++;
      assert.fail(
        `Code ${code}: manifest test_name "${mapping.test_name}" was not executed by runtime test runner!`,
      );
    }

    // Verify fixture_builder exists in actual executed fixture names
    if (!actualFixtureNames.has(mapping.fixture_builder)) {
      invalidFixtureRefCount++;
      assert.fail(
        `Code ${code}: manifest fixture_builder "${mapping.fixture_builder}" was not used by runtime test runner!`,
      );
    }

    const records = emittedMap.get(code) ?? [];
    if (records.length === 0) {
      missingActualEmissionsCount++;
      assert.fail(
        `Critical code ${code} was registered in manifest but NEVER emitted during actual runtime execution!`,
      );
    }

    const matchingRecords = records.filter(
      (r) => r.fixture === mapping.fixture_builder || r.test_name === mapping.test_name,
    );
    const recordsToCheck = matchingRecords.length > 0 ? matchingRecords : records;

    for (const rec of recordsToCheck) {
      if (rec.stage !== mapping.expected_stage) {
        wrongStagesCount++;
        assert.fail(
          `Code ${code}: actual emitted stage "${rec.stage}" does not match manifest expected_stage "${mapping.expected_stage}"`,
        );
      }
      if (rec.source_subsystem !== mapping.source_module) {
        wrongSubsystemsCount++;
        assert.fail(
          `Code ${code}: actual emitted subsystem "${rec.source_subsystem}" does not match manifest source_module "${mapping.source_module}"`,
        );
      }
    }
  }

  assert.equal(wrongStagesCount, 0, "Wrong stages count must be 0");
  assert.equal(wrongSubsystemsCount, 0, "Wrong subsystems count must be 0");
  assert.equal(invalidTestRefCount, 0, "Invalid test references count must be 0");
  assert.equal(invalidFixtureRefCount, 0, "Invalid fixture references count must be 0");
  assert.equal(missingActualEmissionsCount, 0, "Missing actual emissions count must be 0");

  const emittedPercentage = (emittedCodeSet.size / criticalCodes.length) * 100;
  console.log(
    `QB02 Failure Coverage Collector: TotalCodes=${allRegisteredCodes.length}, ActualEmitted=${emittedCodeSet.size} (${emittedPercentage.toFixed(1)}%), Uncovered=0, WrongStages=${wrongStagesCount}, WrongSubsystems=${wrongSubsystemsCount}, InvalidTestRefs=${invalidTestRefCount}, InvalidFixtureRefs=${invalidFixtureRefCount}, MissingEmissions=${missingActualEmissionsCount}, DuplicateSemanticCodes=${duplicateSemanticCodes}`,
  );
});
