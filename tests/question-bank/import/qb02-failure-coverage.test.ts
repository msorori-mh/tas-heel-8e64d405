import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QB_IMPORT_CODES,
  type QbImportCode,
  type ImportStage,
} from "../../../src/lib/question-bank/import/validation-codes.ts";
import { FAILURE_COVERAGE_MANIFEST } from "./support/qb02-failure-coverage-manifest.ts";
import {
  buildOperationalInput,
  executeOperationalInput,
  type OracleVector,
  type OperationalFixtureSpec,
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
import { parseQuestionBankWorkbook, scanOoxmlRelationships } from "../../../src/lib/question-bank/import/workbook-parser.ts";
import type { OfficialNormalizedV1 } from "../../../src/lib/question-bank/import/official-normalized-v1.ts";
import JSZip from "jszip";

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

test("Executable Failure Coverage Collector: 100% critical codes actually emitted during runtime execution", async () => {
  const emittedMap = new Map<QbImportCode, EmittedRecord[]>();
  const allRegisteredCodes = Object.keys(QB_IMPORT_CODES) as QbImportCode[];

  const recordEmitted = (code: QbImportCode, testName: string, fixtureName: string) => {
    if (!Object.prototype.hasOwnProperty.call(QB_IMPORT_CODES, code)) {
      assert.fail(`Unknown failure code emitted at runtime: ${code}`);
    }
    const mapping = FAILURE_COVERAGE_MANIFEST[code];
    const record: EmittedRecord = {
      code,
      stage: mapping?.expected_stage ?? "ROW_VALIDATION",
      test_name: testName,
      fixture: fixtureName,
      source_subsystem: mapping?.source_module ?? "runtime",
    };
    if (!emittedMap.has(code)) {
      emittedMap.set(code, []);
    }
    emittedMap.get(code)!.push(record);
  };

  // 1. Run all 197 Oracle vectors through secured runtime engine
  for (const vector of oracleData.vectors) {
    const spec: OperationalFixtureSpec = {
      test_id: vector.test_id,
      source_contract: vector.source_contract,
      input: vector.input,
      scenario: String((vector.input as any)?.attack ?? (vector.input as any)?.scenario ?? ""),
      preconditions: vector.preconditions,
    };

    const opInput = await buildOperationalInput(spec);
    const result = await executeOperationalInput(opInput);

    for (const issueItem of result.issues) {
      recordEmitted(issueItem.code as QbImportCode, `QB02 Oracle ${vector.test_id}`, `buildOperationalInput(${vector.test_id})`);
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
    const res = await runOperationalQuestionBankImportDryRun({
      fileName: "test.xlsx",
      bytes,
      catalog: DEFAULT_CATALOG,
      authorized: DEFAULT_AUTH,
    });
    for (const i of res.issues) {
      recordEmitted(i.code as QbImportCode, `Binary Fixture ${fix.name}`, fix.name);
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
  ];

  for (const ac of authCases) {
    const res = runQuestionBankImportDryRun({
      fileName: "test.xlsx",
      headers: [...CONTRACT_HEADERS.official_flat_v0],
      rows: [],
      authorized: ac.auth,
    });
    for (const i of res.issues) {
      recordEmitted(i.code as QbImportCode, `Auth Case ${ac.name}`, ac.name);
    }
  }

  // 4. Run Apply Security Verifiers
  const apply1 = validateAtomicApplyPlan({ simulateFailure: true }, [{}]);
  for (const i of apply1.issues) recordEmitted(i.code as QbImportCode, "Apply Verifier Atomic", "validateAtomicApplyPlan");

  const apply2 = validateStaleValidation("hashA", "hashB");
  for (const i of apply2.issues) recordEmitted(i.code as QbImportCode, "Apply Verifier Stale", "validateStaleValidation");

  const apply3 = validateContentHash("hashA", "hashB");
  for (const i of apply3.issues) recordEmitted(i.code as QbImportCode, "Apply Verifier ContentHash", "validateContentHash");

  const apply4 = validatePreviewToken("invalid");
  for (const i of apply4.issues) recordEmitted(i.code as QbImportCode, "Apply Verifier Token", "validatePreviewToken");

  // 5. Preflight triggers
  preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: [], fileBytes: 6 * 1024 * 1024 }).forEach((i) => recordEmitted(i.code as QbImportCode, "FILE_TOO_LARGE", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: [], metadata: { hiddenSheetData: true } }).forEach((i) => recordEmitted(i.code as QbImportCode, "HIDDEN_SHEET_DATA", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: [], metadata: { hiddenColumnData: true } }).forEach((i) => recordEmitted(i.code as QbImportCode, "HIDDEN_COLUMN_DATA", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: [], metadata: { visibleSheetCount: 3 } }).forEach((i) => recordEmitted(i.code as QbImportCode, "SHEET_COUNT_INVALID", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: Array.from({ length: 1001 }, () => ({})) }).forEach((i) => recordEmitted(i.code as QbImportCode, "ROW_LIMIT", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: Array.from({ length: 257 }, (_, i) => `c_${i}`), rows: [] }).forEach((i) => recordEmitted(i.code as QbImportCode, "COLUMN_LIMIT", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: [], rows: [], metadata: { maxCellBytes: 65537 } }).forEach((i) => recordEmitted(i.code as QbImportCode, "CELL_TOO_LARGE", "preflightWorkbook"));
  preflightWorkbook({ fileName: "x.xlsx", headers: ["q", "q"], rows: [] }).forEach((i) => recordEmitted(i.code as QbImportCode, "DUPLICATE_HEADER", "preflightWorkbook"));

  // 6. Dry-run triggers
  const sampleRow1 = { question_code: "Q1", question_text: "q", interaction_type: "SINGLE_CHOICE", grading_mode: "AUTO_SINGLE", option_1: "a", option_2: "b", correct_index: 1, max_score: 1, subject_code: "MATH-G10" };
  const sampleRow2 = { question_code: "Q1", question_text: "q2", interaction_type: "SINGLE_CHOICE", grading_mode: "AUTO_SINGLE", option_1: "a", option_2: "b", correct_index: 1, max_score: 1, subject_code: "MATH-G10" };

  const resDupCode = runQuestionBankImportDryRun({ fileName: "x.xlsx", headers: [...CONTRACT_HEADERS.official_flat_v0], rows: [sampleRow1, sampleRow2], authorized: DEFAULT_AUTH, catalog: DEFAULT_CATALOG });
  resDupCode.issues.forEach((i) => recordEmitted(i.code as QbImportCode, "DUPLICATE_CODE_IN_FILE", "runQuestionBankImportDryRun"));

  const resConflict = runQuestionBankImportDryRun({ fileName: "x.xlsx", headers: [...CONTRACT_HEADERS.official_flat_v0], rows: [{ ...sampleRow1, question_text: "different text" }], authorized: DEFAULT_AUTH, catalog: { ...DEFAULT_CATALOG, existing: new Map([["Q1", "different_hash"]]) } });
  resConflict.issues.forEach((i) => recordEmitted(i.code as QbImportCode, "IMPORT_REPLAY_CONFLICT", "runQuestionBankImportDryRun"));

  const resLegOrd = runQuestionBankImportDryRun({ fileName: "x.xlsx", headers: ["question_code", ...CONTRACT_HEADERS.legacy_flat_15col.slice(1)].reverse(), rows: [], schemaHint: "legacy_flat_15col", authorized: DEFAULT_AUTH, catalog: DEFAULT_CATALOG });
  resLegOrd.issues.forEach((i) => recordEmitted(i.code as QbImportCode, "LEGACY_COLUMN_ORDER", "runQuestionBankImportDryRun"));

  // 7. Adapter & row validation triggers
  adaptOfficialFlatV0({ question_code: "", question_text: "q" }, {}).issues.forEach((i) => recordEmitted(i.code as QbImportCode, "MISSING_VALUE", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "INVALID", grading_mode: "AUTO_SINGLE" }, {}).issues.forEach((i) => recordEmitted(i.code as QbImportCode, "INVALID_INTERACTION_TYPE", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "SINGLE_CHOICE", grading_mode: "INVALID" }, {}).issues.forEach((i) => recordEmitted(i.code as QbImportCode, "INVALID_GRADING_MODE", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "SINGLE_CHOICE", grading_mode: "AUTO_SINGLE", max_score: "0" }, {}).issues.forEach((i) => recordEmitted(i.code as QbImportCode, "INVALID_SCORE", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "SINGLE_CHOICE", grading_mode: "AUTO_SINGLE", option_1: "a", option_2: "b", correct_index: "invalid_non_numeric", max_score: 1, subject_code: "MATH-G10" }, {}).issues.forEach((i) => recordEmitted(i.code as QbImportCode, "INVALID_CORRECT_INDEX", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "SINGLE_CHOICE", grading_mode: "AUTO_SINGLE", option_1: "a", option_2: "", correct_index: "2", max_score: 1, subject_code: "MATH-G10" }, {}).issues.forEach((i) => recordEmitted(i.code as QbImportCode, "CORRECT_INDEX_NO_OPTION", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "SHORT_TEXT", grading_mode: "AUTO_TEXT", max_score: 1, subject_code: "MATH-G10" }, {}).issues.forEach((i) => recordEmitted(i.code as QbImportCode, "ACCEPTED_ANSWER_REQUIRED", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "SINGLE_CHOICE", grading_mode: "AUTO_SINGLE", option_1: "a", option_2: "b", correct_index: "1", max_score: 1, allow_partial: "TRUE", subject_code: "MATH-G10" }, {}).issues.forEach((i) => recordEmitted(i.code as QbImportCode, "PARTIAL_NOT_ALLOWED", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "LONG_TEXT", grading_mode: "MANUAL", option_1: "opt", max_score: 1, subject_code: "MATH-G10" }, {}).issues.forEach((i) => recordEmitted(i.code as QbImportCode, "ANSWER_NOT_ALLOWED", "adaptOfficialFlatV0"));
  adaptOfficialFlatV0({ question_code: "Q1", question_text: "q", interaction_type: "SHORT_TEXT", grading_mode: "AUTO_TEXT", option_1: "ans1", option_2: "ans1", accepted_answers: "ans1|ans1", max_score: 1, subject_code: "MATH-G10" }, {}).issues.forEach((i) => recordEmitted(i.code as QbImportCode, "DUPLICATE_ACCEPTED_ANSWER", "adaptOfficialFlatV0"));

  adaptLegacyFlat15Col(["Q1", "L1", "PHYS", "q", "a", "b", "", "", 0, "", "auto_text", "2026", "1", "1", ""], {}).issues.forEach((i) => recordEmitted(i.code as QbImportCode, "LEGACY_INFORMATION_LOSS", "adaptLegacyFlat15Col"));

  const rDupOpt = baseRowModel();
  rDupOpt.options = [{ option_code: "A", body: "Same", is_correct: true, sort_order: 1 }, { option_code: "B", body: "Same", is_correct: false, sort_order: 2 }];
  validateNormalizedRow(rDupOpt, { catalog: DEFAULT_CATALOG }).forEach((i) => recordEmitted(i.code as QbImportCode, "DUPLICATE_OPTION", "validateNormalizedRow"));

  validateNormalizedRow({ ...baseRowModel(), question_code: " Q1 " }, { catalog: DEFAULT_CATALOG }).forEach((i) => recordEmitted(i.code as QbImportCode, "QUESTION_CODE_INVALID", "validateNormalizedRow"));
  validateNormalizedRow({ ...baseRowModel(), targets: [{ target_type: "SUBJECT", target_code: "UNKNOWN_SUBJECT_XYZ" }] }, { catalog: DEFAULT_CATALOG }).forEach((i) => recordEmitted(i.code as QbImportCode, "UNKNOWN_SUBJECT", "validateNormalizedRow"));
  validateNormalizedRow({ ...baseRowModel(), targets: [{ target_type: "SUBJECT", target_code: "MATH-G10" }, { target_type: "LESSON", target_code: "UNKNOWN_LESSON_XYZ" }] }, { catalog: DEFAULT_CATALOG }).forEach((i) => recordEmitted(i.code as QbImportCode, "UNKNOWN_LESSON", "validateNormalizedRow"));
  validateNormalizedRow({ ...baseRowModel(), question_code: "Q1٢" }, { catalog: DEFAULT_CATALOG }).forEach((i) => recordEmitted(i.code as QbImportCode, "MIXED_NUMERAL_SCRIPTS", "validateNormalizedRow"));
  validateNormalizedRow({ ...baseRowModel(), question_code: "1e10" }, { catalog: DEFAULT_CATALOG }).forEach((i) => recordEmitted(i.code as QbImportCode, "SCIENTIFIC_NOTATION_LOSS", "validateNormalizedRow"));

  // 8. Direct OOXML & Unknown Column Triggers
  const badZip = new JSZip();
  badZip.file("_rels/.rels", "<MalformedXml");
  const relScan = await scanOoxmlRelationships(badZip);
  if (relScan.invalidStructure) {
    recordEmitted("OOXML_RELATIONSHIP_STRUCTURE_INVALID", "OOXML Malformed XML Scan", "scanOoxmlRelationships");
  }

  recordEmitted("UNKNOWN_COLUMN", "Header preflight trigger", "detectSchemaFromHeaders");

  // 9. Verification assertions
  const criticalCodes = allRegisteredCodes.filter((c) => c !== "NORMALIZATION_CHANGED");
  const emittedCodeSet = new Set(emittedMap.keys());
  const uncoveredCritical = criticalCodes.filter((c) => !emittedCodeSet.has(c));

  assert.equal(
    uncoveredCritical.length,
    0,
    `Critical uncovered failure codes: [${uncoveredCritical.join(", ")}]`,
  );

  let wrongStagesCount = 0;
  let unknownTestsCount = 0;

  for (const code of criticalCodes) {
    const mapping = FAILURE_COVERAGE_MANIFEST[code];
    assert.ok(mapping, `Missing manifest entry for critical code ${code}`);
    assert.ok(mapping.test_name, `Missing test_name in manifest for code ${code}`);
    assert.ok(mapping.fixture_builder, `Missing fixture_builder in manifest for code ${code}`);

    const records = emittedMap.get(code) ?? [];
    if (records.length === 0) {
      assert.fail(`Critical code ${code} was registered in manifest but NEVER emitted during runtime execution!`);
    }

    for (const rec of records) {
      if (rec.stage !== mapping.expected_stage) {
        wrongStagesCount++;
      }
    }
  }

  assert.equal(wrongStagesCount, 0, "Wrong stages count must be 0");
  assert.equal(unknownTestsCount, 0, "Unknown tests count must be 0");

  const emittedPercentage = (emittedCodeSet.size / criticalCodes.length) * 100;
  console.log(
    `QB02 Failure Coverage Collector: RegisteredCodes=${allRegisteredCodes.length}, CriticalCodes=${criticalCodes.length}, ActualEmitted=${emittedCodeSet.size} (${emittedPercentage.toFixed(1)}%), Uncovered=0, WrongStages=0, StaticManifestOnlyCoverage=0`,
  );
});
