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
} from "../../../src/lib/question-bank/import/apply-verifier.ts";
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
import { validateNormalizedRow } from "../../../src/lib/question-bank/import/validate.ts";
import { adaptOfficialFlatV0 } from "../../../src/lib/question-bank/import/adapters/official-flat-v0.ts";
import { adaptLegacyFlat15Col } from "../../../src/lib/question-bank/import/adapters/legacy-flat-15col.ts";
import { preflightWorkbook } from "../../../src/lib/question-bank/import/preflight.ts";
import type { OfficialNormalizedV1 } from "../../../src/lib/question-bank/import/official-normalized-v1.ts";
import type { QbImportIssue } from "../../../src/lib/question-bank/import/errors.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const oracleData = JSON.parse(
  readFileSync(join(root, "docs/question-bank/QB02-IMPORT-TEST-VECTORS-50.json"), "utf8"),
) as { vectors: OracleVector[] };

type EmittedRecord = {
  code: QbImportCode;
  stage: ImportStage;
  test_name: string;
  fixture: string;
  source_subsystem: string;
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
  lessonSubjects: new Map([["MATH-L1", "MATH-G10"]]),
  authorizedSubjects: new Set(["MATH-G10", "PHYS-G10"]),
};

function baseRowModel(overrides?: Partial<OfficialNormalizedV1["revision"]>): OfficialNormalizedV1 {
  return {
    contract: "official_normalized_v1",
    question_code: "Q100",
    revision: {
      question_text: "Text",
      stimulus_text: null,
      interaction_type: "SINGLE_CHOICE",
      grading_mode: "AUTO_SINGLE",
      max_score: 1,
      allow_partial: false,
      ...overrides,
    },
    options: [
      { option_code: "A", body: "Opt 1", is_correct: true, sort_order: 1 },
      { option_code: "B", body: "Opt 2", is_correct: false, sort_order: 2 },
    ],
    accepted_answers: [],
    solutions: [],
    solution_steps: [],
    media: [],
    targets: [
      { target_type: "SUBJECT", target_code: "MATH-G10" },
      { target_type: "LESSON", target_code: "MATH-L1" },
    ],
    provenance: {
      source_contract: "official_flat_v0",
      source_file: "x.xlsx",
      source_row: 2,
      adapter_version: "v1",
    },
  };
}

test("Executable Failure Coverage Collector & Integrity Audit: 100% critical codes actually emitted during runtime execution", async () => {
  const emittedMap = new Map<QbImportCode, EmittedRecord[]>();
  const actualTestNames = new Set<string>();
  const actualFixtureNames = new Set<string>();
  const allRegisteredCodes = Object.keys(QB_IMPORT_CODES) as QbImportCode[];

  const recordEmittedIssue = (issueItem: QbImportIssue, testName: string, fixtureName: string) => {
    const code = issueItem.code as QbImportCode;
    if (!Object.prototype.hasOwnProperty.call(QB_IMPORT_CODES, code)) {
      assert.fail(`Unknown failure code emitted at runtime: ${code}`);
    }

    actualTestNames.add(testName);
    actualFixtureNames.add(fixtureName);

    // Read ACTUAL stage and source_subsystem directly from the runtime issue object
    const record: EmittedRecord = {
      code,
      stage: issueItem.stage,
      test_name: testName,
      fixture: fixtureName,
      source_subsystem: issueItem.source_subsystem,
    };
    if (!emittedMap.has(code)) {
      emittedMap.set(code, []);
    }
    emittedMap.get(code)!.push(record);
  };

  // 1. Run all 197 Oracle vectors through secured runtime engine
  for (const vector of oracleData.vectors) {
    const fixture = getOperationalFixture(vector);
    const opInput = await buildOperationalInput(fixture);
    const result = await executeOperationalInput(opInput);

    const testName = `QB02 Oracle ${vector.test_id}`;
    const fixtureName = `buildOperationalInput(${vector.test_id})`;

    actualTestNames.add(testName);
    actualFixtureNames.add(fixtureName);

    for (const issueItem of result.issues) {
      recordEmittedIssue(issueItem as QbImportIssue, testName, fixtureName);
    }
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

    actualTestNames.add(testName);
    actualFixtureNames.add(fixtureName);

    const res = await runOperationalQuestionBankImportDryRun({
      fileName: "test.xlsx",
      bytes,
      catalog: DEFAULT_CATALOG,
      authorized: DEFAULT_AUTH,
    });
    for (const i of res.issues) {
      recordEmittedIssue(i as QbImportIssue, testName, fixtureName);
    }
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

    actualTestNames.add(testName);
    actualFixtureNames.add(fixtureName);

    const res = runQuestionBankImportDryRun({
      fileName: "test.xlsx",
      headers: [...CONTRACT_HEADERS.official_flat_v0],
      rows: [],
      authorized: ac.auth,
    });
    for (const i of res.issues) {
      recordEmittedIssue(i as QbImportIssue, testName, fixtureName);
    }
  }

  // 4. Run Apply Security Verifiers
  const apply1 = validateAtomicApplyPlan({ simulateFailure: true }, [{}]);
  for (const i of apply1.issues) recordEmittedIssue(i as QbImportIssue, "Apply Verifier Atomic", "apply-verifier:Atomic");

  const apply2 = validateStaleValidation("hashA", "hashB");
  for (const i of apply2.issues) recordEmittedIssue(i as QbImportIssue, "Apply Verifier Stale", "apply-verifier:Stale");

  const apply3 = validateContentHash("hashA", "hashB");
  for (const i of apply3.issues) recordEmittedIssue(i as QbImportIssue, "Apply Verifier ContentHash", "apply-verifier:ContentHash");

  const apply4 = validatePreviewToken("invalid");
  for (const i of apply4.issues) recordEmittedIssue(i as QbImportIssue, "Apply Verifier Token", "apply-verifier:Token");

  // 5. Preflight triggers
  preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: [], fileBytes: 6 * 1024 * 1024 }).forEach((i) => recordEmittedIssue(i, "Preflight FILE_TOO_LARGE", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: [], metadata: { hasMacros: true } }).forEach((i) => recordEmittedIssue(i, "Preflight MACRO_CONTENT", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: [], metadata: { hasFormulaCells: true } }).forEach((i) => recordEmittedIssue(i, "Preflight FORMULA_CELL", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: [], metadata: { hasMergedDataCells: true } }).forEach((i) => recordEmittedIssue(i, "Preflight MERGED_DATA_CELL", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: [], metadata: { hiddenSheetData: true } }).forEach((i) => recordEmittedIssue(i, "Preflight HIDDEN_SHEET_DATA", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: [], metadata: { hiddenRowData: true } }).forEach((i) => recordEmittedIssue(i, "Preflight HIDDEN_ROW_DATA", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: [], metadata: { hiddenColumnData: true } }).forEach((i) => recordEmittedIssue(i, "Preflight HIDDEN_COLUMN_DATA", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: [], metadata: { visibleSheetCount: 3 } }).forEach((i) => recordEmittedIssue(i, "Preflight SHEET_COUNT_INVALID", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: Array.from({ length: 1001 }, () => ({})) }).forEach((i) => recordEmittedIssue(i, "Preflight ROW_LIMIT", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: Array.from({ length: 257 }, (_, i) => `c_${i}`), rows: [] }).forEach((i) => recordEmittedIssue(i, "Preflight COLUMN_LIMIT", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: [], metadata: { maxCellBytes: 65537 } }).forEach((i) => recordEmittedIssue(i, "Preflight CELL_TOO_LARGE", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: ["q", "q"], rows: [] }).forEach((i) => recordEmittedIssue(i, "Preflight DUPLICATE_HEADER", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: ["bad\u0000"], rows: [] }).forEach((i) => recordEmittedIssue(i, "Preflight MALFORMED_UNICODE", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: ["role"], rows: [] }).forEach((i) => recordEmittedIssue(i, "Preflight FORBIDDEN_COLUMN", "preflightWorkbook"));

  // 6. Dry-run triggers
  const sampleRow1 = { question_code: "Q1", question_text: "q", interaction_type: "SINGLE_CHOICE", grading_mode: "AUTO_SINGLE", option_1: "a", option_2: "b", correct_index: 1, max_score: 1, subject_code: "MATH-G10" };
  const sampleRow2 = { question_code: "Q1", question_text: "q2", interaction_type: "SINGLE_CHOICE", grading_mode: "AUTO_SINGLE", option_1: "a", option_2: "b", correct_index: 1, max_score: 1, subject_code: "MATH-G10" };

  runQuestionBankImportDryRun({ fileName: "x.xlsx", headers: [...CONTRACT_HEADERS.official_flat_v0], rows: [sampleRow1, sampleRow2], authorized: DEFAULT_AUTH, catalog: DEFAULT_CATALOG })
    .issues.forEach((i) => recordEmittedIssue(i as QbImportIssue, "DryRun DUPLICATE_CODE_IN_FILE", "runQuestionBankImportDryRun"));

  runQuestionBankImportDryRun({ fileName: "x.xlsx", headers: [...CONTRACT_HEADERS.official_flat_v0, "extra_unknown_col"], rows: [sampleRow1], authorized: DEFAULT_AUTH, catalog: DEFAULT_CATALOG })
    .issues.forEach((i) => recordEmittedIssue(i as QbImportIssue, "DryRun UNKNOWN_COLUMN", "runQuestionBankImportDryRun"));

  runQuestionBankImportDryRun({ fileName: "x.xlsx", headers: ["question_code", ...CONTRACT_HEADERS.legacy_flat_15col.slice(1)].reverse(), rows: [], schemaHint: "legacy_flat_15col", authorized: DEFAULT_AUTH, catalog: DEFAULT_CATALOG })
    .issues.forEach((i) => recordEmittedIssue(i as QbImportIssue, "DryRun LEGACY_COLUMN_ORDER", "runQuestionBankImportDryRun"));

  runQuestionBankImportDryRun({ fileName: "x.xlsx", headers: ["q1", "q2"], rows: [], schemaHint: "legacy_flat_15col", authorized: DEFAULT_AUTH, catalog: DEFAULT_CATALOG })
    .issues.forEach((i) => recordEmittedIssue(i as QbImportIssue, "DryRun LEGACY_COLUMN_COUNT", "runQuestionBankImportDryRun"));

  runQuestionBankImportDryRun({ fileName: "x.xlsx", headers: [...CONTRACT_HEADERS.official_flat_v0], rows: [{ ...sampleRow1, question_text: "different text" }], authorized: DEFAULT_AUTH, catalog: { ...DEFAULT_CATALOG, existing: new Map([["Q1", "different_hash"]]) } })
    .issues.forEach((i) => recordEmittedIssue(i as QbImportIssue, "DryRun IMPORT_REPLAY_CONFLICT", "runQuestionBankImportDryRun"));

  // 7. Adapter & row validation triggers
  adaptOfficialFlatV0({ question_code: "", question_text: "q" }, {}).issues.forEach((i) => recordEmittedIssue(i, "Validation MISSING_VALUE", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "INVALID", grading_mode: "AUTO_SINGLE" }, {}).issues.forEach((i) => recordEmittedIssue(i, "Validation INVALID_INTERACTION_TYPE", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "SINGLE_CHOICE", grading_mode: "INVALID" }, {}).issues.forEach((i) => recordEmittedIssue(i, "Validation INVALID_GRADING_MODE", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "SINGLE_CHOICE", grading_mode: "AUTO_SINGLE", max_score: "0" }, {}).issues.forEach((i) => recordEmittedIssue(i, "Validation INVALID_SCORE", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "SINGLE_CHOICE", grading_mode: "AUTO_SINGLE", option_1: "a", option_2: "b", correct_index: "invalid_non_numeric", max_score: 1, subject_code: "MATH-G10" }, {}).issues.forEach((i) => recordEmittedIssue(i, "Validation INVALID_CORRECT_INDEX", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "SINGLE_CHOICE", grading_mode: "AUTO_SINGLE", option_1: "a", option_2: "", correct_index: "2", max_score: 1, subject_code: "MATH-G10" }, {}).issues.forEach((i) => recordEmittedIssue(i, "Validation CORRECT_INDEX_NO_OPTION", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "SHORT_TEXT", grading_mode: "AUTO_TEXT", max_score: 1, subject_code: "MATH-G10" }, {}).issues.forEach((i) => recordEmittedIssue(i, "Validation ACCEPTED_ANSWER_REQUIRED", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "SINGLE_CHOICE", grading_mode: "AUTO_SINGLE", option_1: "a", option_2: "b", correct_index: "1", max_score: 1, allow_partial: "TRUE", subject_code: "MATH-G10" }, {}).issues.forEach((i) => recordEmittedIssue(i, "Validation PARTIAL_NOT_ALLOWED", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "LONG_TEXT", grading_mode: "MANUAL", option_1: "opt", max_score: 1, subject_code: "MATH-G10" }, {}).issues.forEach((i) => recordEmittedIssue(i, "Validation ANSWER_NOT_ALLOWED", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "SHORT_TEXT", grading_mode: "AUTO_TEXT", option_1: "ans1", option_2: "ans1", accepted_answers: "ans1|ans1", max_score: 1, subject_code: "MATH-G10" }, {}).issues.forEach((i) => recordEmittedIssue(i, "Validation DUPLICATE_ACCEPTED_ANSWER", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ code: "1e10", question: "q", question_type: "mcq" }, {}).issues.forEach((i) => recordEmittedIssue(i, "Validation SCIENTIFIC_NOTATION_LOSS", "validateNormalizedRow"));

  adaptLegacyFlat15Col(["Q1", "L1", "PHYS", "q", "a", "b", "", "", 0, "", "auto_text", "2026", "1", "1", ""], {}).issues.forEach((i) => recordEmittedIssue(i, "Validation LEGACY_INFORMATION_LOSS", "adaptLegacyFlat15Col"));

  const rDupOpt = baseRowModel();
  rDupOpt.options = [{ option_code: "A", body: "Same", is_correct: true, sort_order: 1 }, { option_code: "B", body: "Same", is_correct: false, sort_order: 2 }];
  validateNormalizedRow(rDupOpt, { catalog: DEFAULT_CATALOG }).forEach((i) => recordEmittedIssue(i, "Validation DUPLICATE_OPTION", "validateNormalizedRow"));

  validateNormalizedRow({ ...baseRowModel(), question_code: " Q1 " }, { catalog: DEFAULT_CATALOG }).forEach((i) => recordEmittedIssue(i, "Validation QUESTION_CODE_INVALID", "validateNormalizedRow"));
  validateNormalizedRow({ ...baseRowModel(), targets: [{ target_type: "SUBJECT", target_code: "UNKNOWN_SUBJECT_XYZ" }] }, { catalog: DEFAULT_CATALOG }).forEach((i) => recordEmittedIssue(i, "Validation UNKNOWN_SUBJECT", "validateNormalizedRow"));
  validateNormalizedRow({ ...baseRowModel(), targets: [{ target_type: "SUBJECT", target_code: "MATH-G10" }, { target_type: "LESSON", target_code: "UNKNOWN_LESSON_XYZ" }] }, { catalog: DEFAULT_CATALOG }).forEach((i) => recordEmittedIssue(i, "Validation UNKNOWN_LESSON", "validateNormalizedRow"));
  validateNormalizedRow({ ...baseRowModel(), question_code: "Q1٢" }, { catalog: DEFAULT_CATALOG }).forEach((i) => recordEmittedIssue(i, "Validation MIXED_NUMERAL_SCRIPTS", "validateNormalizedRow"));
  validateNormalizedRow({ ...baseRowModel(), revision: { ...baseRowModel().revision, question_text: "e\u0301" } }, { catalog: DEFAULT_CATALOG }).forEach((i) => recordEmittedIssue(i, "Validation NORMALIZATION_CHANGED", "validateNormalizedRow"));

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
      assert.fail(`Unintended duplicate Arabic message for codes ${arMessages.get(msg)} and ${code}: "${msg}"`);
    }
    arMessages.set(msg, code);

    const auditEntry = QB_IMPORT_AUDIT_REGISTRY[code];
    assert.ok(auditEntry, `Missing audit registry entry for ${code}`);
    const triggerKey = `${auditEntry.stage}:${auditEntry.trigger}`;
    if (triggerMap.has(triggerKey)) {
      duplicateSemanticCodes++;
      assert.fail(`Duplicate trigger in audit registry for ${triggerMap.get(triggerKey)} and ${code}: ${triggerKey}`);
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
      assert.fail(`Code ${code}: manifest test_name "${mapping.test_name}" was not executed by runtime test runner!`);
    }

    // Verify fixture_builder exists in actual executed fixture names
    if (!actualFixtureNames.has(mapping.fixture_builder)) {
      invalidFixtureRefCount++;
      assert.fail(`Code ${code}: manifest fixture_builder "${mapping.fixture_builder}" was not used by runtime test runner!`);
    }

    const records = emittedMap.get(code) ?? [];
    if (records.length === 0) {
      missingActualEmissionsCount++;
      assert.fail(`Critical code ${code} was registered in manifest but NEVER emitted during actual runtime execution!`);
    }

    const matchingRecords = records.filter(
      (r) => r.fixture === mapping.fixture_builder || r.test_name === mapping.test_name,
    );
    const recordsToCheck = matchingRecords.length > 0 ? matchingRecords : records;

    for (const rec of recordsToCheck) {
      if (rec.stage !== mapping.expected_stage) {
        wrongStagesCount++;
        assert.fail(`Code ${code}: actual emitted stage "${rec.stage}" does not match manifest expected_stage "${mapping.expected_stage}"`);
      }
      if (rec.source_subsystem !== mapping.source_module) {
        wrongSubsystemsCount++;
        assert.fail(`Code ${code}: actual emitted subsystem "${rec.source_subsystem}" does not match manifest source_module "${mapping.source_module}"`);
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
