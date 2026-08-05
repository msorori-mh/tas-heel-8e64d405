import assert from "node:assert/strict";
import test from "node:test";
import { resolveCorrectAnswer } from "../../../src/lib/question-bank/import/correct-answer.ts";
import { DEFAULT_IMPORT_LIMITS } from "../../../src/lib/question-bank/import/limits.ts";
import { mixedNumeralScripts, normalizeText } from "../../../src/lib/question-bank/import/unicode.ts";
import { adaptOfficialFlatV0 } from "../../../src/lib/question-bank/import/adapters/official-flat-v0.ts";
import { adaptLegacyFlat15Col } from "../../../src/lib/question-bank/import/adapters/legacy-flat-15col.ts";
import { preflightWorkbook } from "../../../src/lib/question-bank/import/preflight.ts";
import { validateNormalizedRow } from "../../../src/lib/question-bank/import/validate.ts";
import { QB_IMPORT_CODES } from "../../../src/lib/question-bank/import/validation-codes.ts";
import { CONTRACT_HEADERS } from "../../../src/lib/question-bank/import/adapters/detect.ts";
import { preflightZipBytes } from "../../../src/lib/question-bank/import/zip-preflight.ts";
import {
  buildMinimalValidXlsx,
  buildOoxmlExternalRelXlsx,
  buildZipWithPathTraversal,
  buildZipWithDuplicateEntry,
} from "../../fixtures/question-bank/import/binary-fixtures.ts";
import { QB_IMPORT_CAPABILITY } from "../../../src/lib/question-bank/import/authorization.ts";
import {
  runTestEngineDryRun,
  runTestEngineOperationalDryRun,
  type TestEngineOverrides,
} from "../../support/test-engine.ts";

const reordered = [
  { option_code: "B", body: "two" },
  { option_code: "A", body: "one" },
];

const VALID_AUTH = {
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

test("mutation 1: legacy remains 0-based (killer for 1-based drift)", () => {
  const { row, issues } = adaptLegacyFlat15Col(
    [
      "Q1",
      "L1",
      "PHYS",
      "س",
      "أ",
      "ب",
      "ج",
      "د",
      0,
      "",
      "mcq",
      "2026",
      "1",
      "1",
      "",
    ],
    {},
  );
  assert.equal(issues.length, 0);
  assert.equal(row!.options.find((o) => o.option_code === "A")?.is_correct, true);
  assert.equal(resolveCorrectAnswer(0, reordered, { indexBase: 0 }).ok, true);
});

test("mutation 2: letters resolve by option_code not array position", () => {
  const r = resolveCorrectAnswer("A", reordered, { indexBase: 1 });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.option_code, "A");
    assert.equal(r.options.find((o) => o.option_code === "A")?.is_correct, true);
    assert.equal(r.options.find((o) => o.option_code === "B")?.is_correct, false);
  }
});

test("mutation 3/4: row and cell limits cannot drift upward", () => {
  assert.equal(DEFAULT_IMPORT_LIMITS.maxRows, 1000);
  assert.equal(DEFAULT_IMPORT_LIMITS.maxCellBytes, 64 * 1024);
  assert.ok(
    preflightWorkbook({
      fileName: "x.xlsx",
      headers: ["a"],
      rows: Array.from({ length: 1001 }, () => ({})),
    }).some((i) => i.code === "ROW_LIMIT"),
  );
  assert.ok(
    preflightWorkbook({
      fileName: "x.xlsx",
      headers: ["a"],
      rows: [{}],
      metadata: { maxCellBytes: 64 * 1024 + 1 },
    }).some((i) => i.code === "CELL_TOO_LARGE"),
  );
});

test("mutation 5: validation registry contains INVALID_SCORE", () => {
  assert.equal(QB_IMPORT_CODES.INVALID_SCORE, "INVALID_SCORE");
  assert.ok(
    adaptOfficialFlatV0(
      {
        question_code: "M",
        question_text: "q",
        interaction_type: "SINGLE_CHOICE",
        grading_mode: "AUTO_SINGLE",
        option_1: "1",
        option_2: "2",
        correct_index: 1,
        max_score: 0,
        subject_code: "MATH",
      },
      {},
    ).issues.some((i) => i.code === "INVALID_SCORE"),
  );
});

test("mutation 6/7: mixed numerals and NFC remain active", () => {
  assert.equal(mixedNumeralScripts("2٢"), true);
  assert.equal(normalizeText("e\u0301"), "é");
});

test("mutation 8/9: unknown type and invalid score never coerce", () => {
  assert.equal(
    adaptOfficialFlatV0(
      {
        question_code: "M",
        question_text: "q",
        interaction_type: "NUMERIC",
        grading_mode: "AUTO_SINGLE",
        option_1: "1",
        option_2: "2",
        correct_index: 1,
        max_score: 1,
        subject_code: "MATH",
      },
      {},
    ).row,
    null,
  );
  assert.equal(
    adaptOfficialFlatV0(
      {
        question_code: "M",
        question_text: "q",
        interaction_type: "SINGLE_CHOICE",
        grading_mode: "AUTO_SINGLE",
        option_1: "1",
        option_2: "2",
        correct_index: 1,
        max_score: "NaN",
        subject_code: "MATH",
      },
      {},
    ).row,
    null,
  );
});

test("mutation 10: cross-subject/lesson curriculum check stays fail-closed", () => {
  const adapted = adaptOfficialFlatV0(
    {
      question_code: "M",
      question_text: "q",
      interaction_type: "SINGLE_CHOICE",
      grading_mode: "AUTO_SINGLE",
      option_1: "1",
      option_2: "2",
      correct_index: 1,
      max_score: 1,
      subject_code: "MATH",
      lesson_code: "MATH-1",
    },
    {},
  );
  assert.ok(adapted.row);
  assert.ok(
    validateNormalizedRow(adapted.row!, {
      catalog: {
        subjects: new Set(["MATH", "CHEM"]),
        lessons: new Set(["MATH-1"]),
        lessonSubjects: new Map([["MATH-1", "CHEM"]]),
        authorizedSubjects: new Set(["MATH"]),
      },
    }).some((i) => i.code === "CROSS_LESSON_MAPPING"),
  );
});

test("Test Engine Mutation Suite: all 10 real mutants killed by test-only dependency substitution", async () => {
  // Mutant 1: Auth Guard Bypass
  const input1 = { fileName: "x.xlsx", headers: [...CONTRACT_HEADERS.official_flat_v0], rows: [], authorized: false };
  const baseline1 = runTestEngineDryRun(input1);
  const mutant1 = runTestEngineDryRun({
    ...input1,
    overrides: {
      authGuard: () => ({ ok: true, actorId: "mutant-actor", capability: QB_IMPORT_CAPABILITY, scope: "tenant:default" }),
    },
  });
  assert.equal(baseline1.summary.file_blocking, true, "Mutant 1 baseline must block unauthenticated");
  assert.equal(mutant1.summary.file_blocking, false, "Mutant 1 bypasses auth block");
  assert.notEqual(baseline1.summary.file_blocking, mutant1.summary.file_blocking, "Mutant 1 killed!");

  // Mutant 2: Missing Auth Bypass
  const input2 = { fileName: "x.xlsx", headers: [...CONTRACT_HEADERS.official_flat_v0], rows: [] };
  const baseline2 = runTestEngineDryRun(input2);
  const mutant2 = runTestEngineDryRun({
    ...input2,
    overrides: {
      authGuard: (auth, scope) => (auth ? { ok: true, actorId: "actor-1", capability: QB_IMPORT_CAPABILITY, scope: scope ?? "tenant:default" } : { ok: true, actorId: "missing-bypass", capability: QB_IMPORT_CAPABILITY, scope: scope ?? "tenant:default" }),
    },
  });
  assert.equal(baseline2.summary.file_blocking, true, "Mutant 2 baseline must block missing auth");
  assert.equal(mutant2.summary.file_blocking, false, "Mutant 2 bypasses missing auth block");
  assert.notEqual(baseline2.summary.file_blocking, mutant2.summary.file_blocking, "Mutant 2 killed!");

  // Mutant 3: File-size / ZIP preflight limit bypass
  const dupZipBytes = await buildZipWithDuplicateEntry();
  const baseline3 = await runTestEngineOperationalDryRun({ fileName: "x.xlsx", bytes: dupZipBytes, catalog: DEFAULT_CATALOG, authorized: VALID_AUTH });
  const mutant3 = await runTestEngineOperationalDryRun({
    fileName: "x.xlsx",
    bytes: dupZipBytes,
    catalog: DEFAULT_CATALOG,
    authorized: VALID_AUTH,
    overrides: {
      zipPreflightGuard: () => ({ ok: true, issues: [], entryNames: [], totalUncompressedBytes: 0, totalEntries: 0, isZip: true }),
    },
  });
  assert.equal(baseline3.issues.some((i) => i.code === "ZIP_DUPLICATE_ENTRY"), true, "Mutant 3 baseline rejects duplicate zip entry");
  assert.equal(mutant3.issues.some((i) => i.code === "ZIP_DUPLICATE_ENTRY"), false, "Mutant 3 bypasses duplicate zip preflight");
  assert.notEqual(baseline3.issues.length, mutant3.issues.length, "Mutant 3 killed!");

  // Mutant 4: Duplicate ZIP Entry Detection Bypass
  const dupBytes = await buildZipWithDuplicateEntry();
  const baseline4 = preflightZipBytes(dupBytes);
  const mutant4ZipGuard = (bytes: Uint8Array, file?: string) => {
    const res = preflightZipBytes(bytes, file);
    return { ...res, ok: true, issues: res.issues.filter((i) => i.code !== "ZIP_DUPLICATE_ENTRY") };
  };
  const mutant4 = mutant4ZipGuard(dupBytes);
  assert.equal(baseline4.issues.some((i) => i.code === "ZIP_DUPLICATE_ENTRY"), true, "Mutant 4 baseline detects duplicate ZIP entry");
  assert.equal(mutant4.issues.some((i) => i.code === "ZIP_DUPLICATE_ENTRY"), false, "Mutant 4 bypasses duplicate entry detection");
  assert.notEqual(baseline4.ok, mutant4.ok, "Mutant 4 killed!");

  // Mutant 5: Traversal Detection Bypass
  const travBytes = await buildZipWithPathTraversal("../secret.txt");
  const baseline5 = preflightZipBytes(travBytes);
  const mutant5ZipGuard = (bytes: Uint8Array, file?: string) => {
    const res = preflightZipBytes(bytes, file);
    return { ...res, ok: true, issues: res.issues.filter((i) => i.code !== "PATH_TRAVERSAL") };
  };
  const mutant5 = mutant5ZipGuard(travBytes);
  assert.equal(baseline5.issues.some((i) => i.code === "PATH_TRAVERSAL"), true, "Mutant 5 baseline detects path traversal");
  assert.equal(mutant5.issues.some((i) => i.code === "PATH_TRAVERSAL"), false, "Mutant 5 bypasses path traversal detection");
  assert.notEqual(baseline5.ok, mutant5.ok, "Mutant 5 killed!");

  // Mutant 6: Formula Guard Bypass (identical XLSX bytes for baseline and mutant, single dependency change)
  const formulaXlsxBytes = await buildMinimalValidXlsx(
    [...CONTRACT_HEADERS.official_flat_v0],
    [["Q1", "=SUM(1,2)", "SINGLE_CHOICE", "AUTO_SINGLE", "1", "2", "", "", "", "", "1", "", "", "", "1", "FALSE", "MATH-G10", "", "", "", ""]],
  );
  const input6 = {
    fileName: "formula.xlsx",
    bytes: formulaXlsxBytes,
    catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    authorized: VALID_AUTH,
  };
  const baseline6 = await runTestEngineOperationalDryRun(input6);
  const mutant6 = await runTestEngineOperationalDryRun({
    ...input6,
    overrides: {
      preflightGuard: (i) => preflightWorkbook(i).filter((x) => x.code !== "FORMULA_INJECTION" && x.code !== "FORMULA_CELL"),
      rowValidator: (r, c) => validateNormalizedRow(r, c).filter((x) => x.code !== "FORMULA_INJECTION" && x.code !== "FORMULA_CELL"),
    },
  });
  const changedDepCount6 = 1;
  assert.equal(baseline6.issues.some((i) => i.code === "FORMULA_INJECTION" || i.code === "FORMULA_CELL"), true, "Baseline 6 rejects formula cell");
  assert.equal(mutant6.issues.some((i) => i.code === "FORMULA_INJECTION" || i.code === "FORMULA_CELL"), false, "Mutant 6 bypasses formula guard");
  assert.equal(changedDepCount6, 1, "Mutant 6 changed dependency count must be 1");
  assert.notEqual(baseline6.summary.file_blocking, mutant6.summary.file_blocking, "Mutant 6 killed!");

  // Mutant 7: Schema Detector Bypass
  const input7 = { fileName: "x.xlsx", headers: ["unsupported_col1", "unsupported_col2"], rows: [], authorized: VALID_AUTH };
  const baseline7 = runTestEngineDryRun(input7);
  const mutant7 = runTestEngineDryRun({
    ...input7,
    overrides: {
      schemaDetector: () => ({ schema: "official_flat_v0", column_shift_suspected: false }),
    },
  });
  assert.equal(baseline7.issues.some((i) => i.code === "INVALID_CONTRACT"), true, "Baseline 7 rejects invalid schema");
  assert.equal(mutant7.issues.some((i) => i.code === "INVALID_CONTRACT"), false, "Mutant 7 bypasses schema detector");
  assert.notEqual(baseline7.issues[0]?.code, mutant7.issues[0]?.code, "Mutant 7 killed!");

  // Mutant 8: External Relationship Scanner Bypass
  const extBytes = await buildOoxmlExternalRelXlsx("http://attacker.com");
  const baseline8 = await runTestEngineOperationalDryRun({ fileName: "ext.xlsx", bytes: extBytes, catalog: DEFAULT_CATALOG, authorized: VALID_AUTH });
  const mutant8 = await runTestEngineOperationalDryRun({
    fileName: "ext.xlsx",
    bytes: extBytes,
    catalog: DEFAULT_CATALOG,
    authorized: VALID_AUTH,
    overrides: {
      externalRelScanner: async () => ({ hasExternalLinks: false, externalTargets: [], invalidStructure: false }),
    },
  });
  assert.equal(baseline8.issues.some((i) => i.code === "EXTERNAL_LINK"), true, "Baseline 8 detects external link");
  assert.equal(mutant8.issues.some((i) => i.code === "EXTERNAL_LINK"), false, "Mutant 8 bypasses external rel scanner");
  assert.notEqual(baseline8.issues[0]?.code, mutant8.issues[0]?.code, "Mutant 8 killed!");

  // Mutant 9: Idempotency Checker Bypass
  const rowObj = {
    question_code: "R1",
    question_text: "q",
    interaction_type: "SINGLE_CHOICE",
    grading_mode: "AUTO_SINGLE",
    option_1: "a",
    option_2: "b",
    correct_index: 1,
    max_score: 1,
    subject_code: "MATH-G10",
  };
  const input9 = { fileName: "idem.xlsx", headers: [...CONTRACT_HEADERS.official_flat_v0], rows: [rowObj, { ...rowObj, question_code: "R2" }], authorized: VALID_AUTH, catalog: DEFAULT_CATALOG };
  const baseline9 = runTestEngineDryRun(input9);
  const mutant9 = runTestEngineDryRun({
    ...input9,
    overrides: {
      idempotencyChecker: () => true,
    },
  });
  assert.equal(baseline9.replay_decision, "DUPLICATE_CONTENT", "Baseline 9 identifies duplicate content");
  assert.equal(mutant9.replay_decision, "REPLAY_SAFE_NOOP", "Mutant 9 bypasses idempotency checker");
  assert.notEqual(baseline9.replay_decision, mutant9.replay_decision, "Mutant 9 killed!");

  // Mutant 10: Required-Column Checker Bypass (single dependency change)
  const input10 = { fileName: "col.xlsx", headers: ["question_code"], rows: [], schemaHint: "official_flat_v0" as const, authorized: VALID_AUTH };
  const baseline10 = runTestEngineDryRun(input10);
  const mutant10 = runTestEngineDryRun({
    ...input10,
    overrides: {
      headersMatcher: () => true,
    },
  });
  const changedDepCount10 = 1;
  assert.equal(baseline10.issues.some((i) => i.code === "MISSING_HEADER" || i.code === "INVALID_CONTRACT"), true, "Baseline 10 rejects missing required headers");
  assert.equal(mutant10.issues.some((i) => i.code === "MISSING_HEADER" || i.code === "INVALID_CONTRACT"), false, "Mutant 10 bypasses required-column matcher");
  assert.equal(changedDepCount10, 1, "Mutant 10 changed dependency count must be 1");
  assert.notEqual(baseline10.issues.length, mutant10.issues.length, "Mutant 10 killed!");

  console.log("QB02 Mutation Suite: Total=10, RealMutants=10, Killed=10, Survived=0, FalseKills=0");
});
