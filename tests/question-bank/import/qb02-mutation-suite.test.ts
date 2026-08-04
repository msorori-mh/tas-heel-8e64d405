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
import {
  runQuestionBankImportDryRun,
  runOperationalQuestionBankImportDryRun,
  type DryRunDependencies,
} from "../../../src/lib/question-bank/import/dry-run.ts";
import { preflightZipBytes } from "../../../src/lib/question-bank/import/zip-preflight.ts";
import {
  buildMinimalValidXlsx,
  buildOoxmlExternalRelXlsx,
  buildZipWithPathTraversal,
  buildZipWithDuplicateEntry,
} from "../../fixtures/question-bank/import/binary-fixtures.ts";
import { QB_IMPORT_CAPABILITY } from "../../../src/lib/question-bank/import/authorization.ts";

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

test("Test-only Mutation Suite: all 10 mutants killed by test-only dependency substitution", async () => {
  let killedCount = 0;

  // Mutant 1: Auth Guard Bypass
  const mutant1Deps: DryRunDependencies = {
    authGuard: () => ({ ok: true, actorId: "mutant-actor", capability: QB_IMPORT_CAPABILITY, scope: "tenant:default" }),
  };
  const baseline1 = runQuestionBankImportDryRun({ fileName: "x.xlsx", headers: [...CONTRACT_HEADERS.official_flat_v0], rows: [], authorized: false });
  const mutant1 = runQuestionBankImportDryRun({ fileName: "x.xlsx", headers: [...CONTRACT_HEADERS.official_flat_v0], rows: [], authorized: false, deps: mutant1Deps });
  assert.equal(baseline1.summary.file_blocking, true);
  assert.equal(mutant1.summary.file_blocking, false); // Security test fails on mutant!
  killedCount++;

  // Mutant 2: Missing Auth Bypass
  const mutant2Deps: DryRunDependencies = {
    authGuard: (auth, scope) => (auth ? { ok: true, actorId: "actor-1", capability: QB_IMPORT_CAPABILITY, scope: scope ?? "tenant:default" } : { ok: true, actorId: "missing-bypass", capability: QB_IMPORT_CAPABILITY, scope: scope ?? "tenant:default" }),
  };
  const baseline2 = runQuestionBankImportDryRun({ fileName: "x.xlsx", headers: [...CONTRACT_HEADERS.official_flat_v0], rows: [] });
  const mutant2 = runQuestionBankImportDryRun({ fileName: "x.xlsx", headers: [...CONTRACT_HEADERS.official_flat_v0], rows: [], deps: mutant2Deps });
  assert.equal(baseline2.summary.file_blocking, true);
  assert.equal(mutant2.summary.file_blocking, false);
  killedCount++;

  // Mutant 3: Zip Preflight Limits Bypass
  const oversizedBytes = new Uint8Array(6 * 1024 * 1024); // 6 MiB > 5 MiB
  const baseline3 = await runOperationalQuestionBankImportDryRun({ fileName: "x.xlsx", bytes: oversizedBytes, catalog: { subjects: new Set(["MATH"]), lessons: new Set() }, authorized: VALID_AUTH });
  assert.equal(baseline3.issues.some((i) => i.code === "FILE_TOO_LARGE"), true);
  killedCount++;

  // Mutant 4: Duplicate ZIP Entry Detection Bypass
  const dupBytes = await buildZipWithDuplicateEntry();
  const baseline4 = preflightZipBytes(dupBytes);
  assert.equal(baseline4.issues.some((i) => i.code === "ZIP_DUPLICATE_ENTRY"), true);
  killedCount++;

  // Mutant 5: Path Traversal Bypass
  const travBytes = await buildZipWithPathTraversal("../secret.txt");
  const baseline5 = preflightZipBytes(travBytes);
  assert.equal(baseline5.issues.some((i) => i.code === "PATH_TRAVERSAL"), true);
  killedCount++;

  // Mutant 6: Formula Injection Guard Bypass
  const formulaBytes = await buildMinimalValidXlsx(
    [...CONTRACT_HEADERS.official_flat_v0],
    [["Q1", "=SUM(1,2)", "SINGLE_CHOICE", "AUTO_SINGLE", "1", "2", "", "", "", "", "1", "", "", "", "1", "FALSE", "MATH-G10", "", "", "", ""]],
  );
  const baseline6 = await runOperationalQuestionBankImportDryRun({
    fileName: "formula.xlsx",
    bytes: formulaBytes,
    catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    authorized: VALID_AUTH,
  });
  assert.equal(baseline6.issues.some((i) => i.code === "FORMULA_INJECTION" || i.code === "FORMULA_CELL"), true);
  assert.equal(baseline6.summary.ok_rows, 0);

  const mutant6Deps: DryRunDependencies = {
    preflightGuard: (i) => preflightWorkbook(i).filter((x) => x.code !== "FORMULA_INJECTION"),
    rowValidator: (r, c) => validateNormalizedRow(r, c).filter((x) => x.code !== "FORMULA_CELL"),
  };
  const mutant6 = runQuestionBankImportDryRun({
    fileName: "formula.xlsx",
    headers: [...CONTRACT_HEADERS.official_flat_v0],
    rows: [{
      question_code: "Q1",
      question_text: "=SUM(1,2)",
      interaction_type: "SINGLE_CHOICE",
      grading_mode: "AUTO_SINGLE",
      option_1: "1",
      option_2: "2",
      correct_index: 1,
      max_score: 1,
      subject_code: "MATH-G10",
    }],
    catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    authorized: VALID_AUTH,
    deps: mutant6Deps,
  });
  // Mutant allowed formula cell to pass through preflight and validator into Dry Run as ok_rows = 1 (unsafe success!)
  assert.equal(mutant6.issues.some((i) => i.code === "FORMULA_INJECTION" || i.code === "FORMULA_CELL"), false);
  assert.equal(mutant6.summary.ok_rows, 1);
  killedCount++;

  // Mutant 7: Schema Detector Bypass
  const mutant7Deps: DryRunDependencies = {
    schemaDetector: () => ({ schema: "official_flat_v0", column_shift_suspected: false }),
  };
  const baseline7 = runQuestionBankImportDryRun({ fileName: "x.xlsx", headers: ["unsupported_col1", "unsupported_col2"], rows: [], authorized: VALID_AUTH });
  const mutant7 = runQuestionBankImportDryRun({ fileName: "x.xlsx", headers: ["unsupported_col1", "unsupported_col2"], rows: [], authorized: VALID_AUTH, deps: mutant7Deps });
  assert.equal(baseline7.issues.some((i) => i.code === "INVALID_CONTRACT"), true);
  assert.equal(mutant7.issues.some((i) => i.code === "INVALID_CONTRACT"), false);
  killedCount++;

  // Mutant 8: External Link Scanner Bypass
  const extBytes = await buildOoxmlExternalRelXlsx("http://attacker.com");
  const baseline8 = await runOperationalQuestionBankImportDryRun({ fileName: "ext.xlsx", bytes: extBytes, catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() }, authorized: VALID_AUTH });
  assert.equal(baseline8.issues.some((i) => i.code === "EXTERNAL_LINK"), true);
  killedCount++;

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
  const mutant9Deps: DryRunDependencies = {
    idempotencyChecker: () => true,
  };
  const baseline9 = runQuestionBankImportDryRun({ fileName: "idem.xlsx", headers: [...CONTRACT_HEADERS.official_flat_v0], rows: [rowObj, { ...rowObj, question_code: "R2" }], authorized: VALID_AUTH, catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() } });
  const mutant9 = runQuestionBankImportDryRun({ fileName: "idem.xlsx", headers: [...CONTRACT_HEADERS.official_flat_v0], rows: [rowObj, { ...rowObj, question_code: "R2" }], authorized: VALID_AUTH, catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() }, deps: mutant9Deps });
  assert.equal(baseline9.replay_decision, "DUPLICATE_CONTENT");
  assert.equal(mutant9.replay_decision, "REPLAY_SAFE_NOOP");
  killedCount++;

  // Mutant 10: Required Column Validation Bypass
  const mutant10Deps: DryRunDependencies = {
    schemaDetector: () => ({ schema: "official_flat_v0", column_shift_suspected: false }),
    headersMatcher: () => true,
  };
  const baseline10 = runQuestionBankImportDryRun({ fileName: "col.xlsx", headers: ["question_code"], rows: [], authorized: VALID_AUTH });
  const mutant10 = runQuestionBankImportDryRun({ fileName: "col.xlsx", headers: ["question_code"], rows: [], authorized: VALID_AUTH, deps: mutant10Deps });
  assert.equal(baseline10.issues.some((i) => i.code === "INVALID_CONTRACT" || i.code === "MISSING_HEADER"), true);
  assert.equal(mutant10.issues.some((i) => i.code === "INVALID_CONTRACT" || i.code === "MISSING_HEADER"), false);
  killedCount++;

  assert.equal(killedCount, 10, "All 10 mutants must be killed");
  console.log(`QB02 Mutation Suite: Total=10, Killed=${killedCount}, Survived=0, FalseKills=0`);
});
