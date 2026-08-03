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
import { MUTATION_HOOKS, resetMutationHooks } from "../../../src/lib/question-bank/import/mutation-hooks.ts";
import { CONTRACT_HEADERS } from "../../../src/lib/question-bank/import/adapters/detect.ts";
import { runQuestionBankImportDryRun, runOperationalQuestionBankImportDryRun } from "../../../src/lib/question-bank/import/dry-run.ts";
import { preflightZipBytes } from "../../../src/lib/question-bank/import/zip-preflight.ts";
import { buildMinimalValidXlsx, buildOoxmlExternalRelXlsx, buildZipWithPathTraversal, buildZipWithDuplicateEntry } from "../../fixtures/question-bank/import/binary-fixtures.ts";

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

test("MUTATION_HOOKS: all 10 mutants killed by real behavioral execution differences", async () => {
  try {
    // Mutant 1: disableAuthorizationGuard
    resetMutationHooks();
    const defaultAuth = runQuestionBankImportDryRun({
      fileName: "test.xlsx",
      headers: [...CONTRACT_HEADERS.official_flat_v0],
      rows: [],
      authorized: false,
    });
    assert.ok(defaultAuth.issues.some((i) => i.code === "AUTH_MISSING" || i.code === "UNAUTHORIZED_IMPORT"));

    MUTATION_HOOKS.disableAuthorizationGuard = true;
    const mutantAuth = runQuestionBankImportDryRun({
      fileName: "test.xlsx",
      headers: [...CONTRACT_HEADERS.official_flat_v0],
      rows: [],
      authorized: false,
    });
    assert.equal(mutantAuth.issues.some((i) => i.code === "AUTH_MISSING" || i.code === "UNAUTHORIZED_IMPORT"), false);

    // Mutant 2: missingAuthorizationAllows
    resetMutationHooks();
    const defaultMissing = runQuestionBankImportDryRun({
      fileName: "test.xlsx",
      headers: [...CONTRACT_HEADERS.official_flat_v0],
      rows: [],
    });
    assert.ok(defaultMissing.issues.some((i) => i.code === "AUTH_MISSING"));

    MUTATION_HOOKS.missingAuthorizationAllows = true;
    const mutantMissing = runQuestionBankImportDryRun({
      fileName: "test.xlsx",
      headers: [...CONTRACT_HEADERS.official_flat_v0],
      rows: [],
    });
    assert.equal(mutantMissing.issues.some((i) => i.code === "AUTH_MISSING"), false);

    // Mutant 3: disablePreparseZipLimits
    resetMutationHooks();
    const bombBytes = new Uint8Array([0, 1, 2, 3]);
    const defaultZip = preflightZipBytes(bombBytes);
    assert.equal(defaultZip.ok, false);

    MUTATION_HOOKS.disablePreparseZipLimits = true;
    const mutantZip = preflightZipBytes(bombBytes);
    assert.equal(mutantZip.ok, true);

    // Mutant 4: disableDuplicateEntryDetection
    resetMutationHooks();
    const dupBytes = await buildZipWithDuplicateEntry();
    const defaultDup = preflightZipBytes(dupBytes);
    assert.ok(defaultDup.issues.some((i) => i.code === "ZIP_DUPLICATE_ENTRY"));

    MUTATION_HOOKS.disableDuplicateEntryDetection = true;
    const mutantDup = preflightZipBytes(dupBytes);
    assert.equal(mutantDup.issues.some((i) => i.code === "ZIP_DUPLICATE_ENTRY"), false);

    // Mutant 5: disablePathTraversalDetection
    resetMutationHooks();
    const travBytes = await buildZipWithPathTraversal("../secret.txt");
    const defaultTrav = preflightZipBytes(travBytes);
    assert.ok(defaultTrav.issues.some((i) => i.code === "PATH_TRAVERSAL"));

    MUTATION_HOOKS.disablePathTraversalDetection = true;
    const mutantTrav = preflightZipBytes(travBytes);
    assert.equal(mutantTrav.issues.some((i) => i.code === "PATH_TRAVERSAL"), false);

    // Mutant 6: bypassFormulaInjectionGuard
    resetMutationHooks();
    const formulaBytes = await buildMinimalValidXlsx(
      ["question_code", "question_text", "interaction_type", "grading_mode", "option_1", "option_2", "correct_index", "max_score", "subject_code"],
      [["Q1", "=SUM(1,2)", "SINGLE_CHOICE", "AUTO_SINGLE", "1", "2", "1", "1", "MATH-G10"]],
    );
    const defaultForm = await runOperationalQuestionBankImportDryRun({
      fileName: "formula.xlsx",
      bytes: formulaBytes,
      catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
      authorized: VALID_AUTH,
    });
    assert.ok(defaultForm.issues.some((i) => i.code === "FORMULA_INJECTION" || i.code === "FORMULA_CELL"));

    MUTATION_HOOKS.bypassFormulaInjectionGuard = true;
    const mutantForm = await runOperationalQuestionBankImportDryRun({
      fileName: "formula.xlsx",
      bytes: formulaBytes,
      catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
      authorized: VALID_AUTH,
    });
    assert.equal(mutantForm.issues.some((i) => i.code === "FORMULA_CELL"), false);

    // Mutant 7: allowUnsupportedFormat
    resetMutationHooks();
    const defaultUnsup = runQuestionBankImportDryRun({
      fileName: "test.xlsx",
      headers: ["unknown_col_1", "unknown_col_2"],
      rows: [],
      authorized: VALID_AUTH,
    });
    assert.ok(defaultUnsup.issues.some((i) => i.code === "INVALID_CONTRACT"));

    MUTATION_HOOKS.allowUnsupportedFormat = true;
    const mutantUnsup = runQuestionBankImportDryRun({
      fileName: "test.xlsx",
      headers: ["unknown_col_1", "unknown_col_2"],
      rows: [],
      authorized: VALID_AUTH,
    });
    assert.equal(mutantUnsup.issues.some((i) => i.code === "INVALID_CONTRACT"), false);

    // Mutant 8: disableExternalRelRejection
    resetMutationHooks();
    const extBytes = await buildOoxmlExternalRelXlsx("http://attacker.com");
    const defaultExt = await runOperationalQuestionBankImportDryRun({
      fileName: "ext.xlsx",
      bytes: extBytes,
      catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
      authorized: VALID_AUTH,
    });
    assert.ok(defaultExt.issues.some((i) => i.code === "EXTERNAL_LINK"));

    MUTATION_HOOKS.disableExternalRelRejection = true;
    const mutantExt = await runOperationalQuestionBankImportDryRun({
      fileName: "ext.xlsx",
      bytes: extBytes,
      catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
      authorized: VALID_AUTH,
    });
    assert.equal(mutantExt.issues.some((i) => i.code === "EXTERNAL_LINK"), false);

    // Mutant 9: disableIdempotencyValidation
    resetMutationHooks();
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
    const defaultIdem = runQuestionBankImportDryRun({
      fileName: "idem.xlsx",
      headers: [...CONTRACT_HEADERS.official_flat_v0],
      rows: [rowObj, { ...rowObj, question_code: "R2" }],
      authorized: VALID_AUTH,
      catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    });
    assert.equal(defaultIdem.replay_decision, "DUPLICATE_CONTENT");

    MUTATION_HOOKS.disableIdempotencyValidation = true;
    const mutantIdem = runQuestionBankImportDryRun({
      fileName: "idem.xlsx",
      headers: [...CONTRACT_HEADERS.official_flat_v0],
      rows: [rowObj, { ...rowObj, question_code: "R2" }],
      authorized: VALID_AUTH,
      catalog: { subjects: new Set(["MATH-G10"]), lessons: new Set() },
    });
    assert.equal(mutantIdem.replay_decision, "ACCEPTABLE_DRAFT");

    // Mutant 10: disableRequiredColumnValidation
    resetMutationHooks();
    const defaultCol = runQuestionBankImportDryRun({
      fileName: "col.xlsx",
      headers: ["question_code"], // Truncated header list
      rows: [],
      authorized: VALID_AUTH,
    });
    assert.ok(defaultCol.issues.some((i) => i.code === "INVALID_CONTRACT" || i.code === "MISSING_HEADER"));

    MUTATION_HOOKS.disableRequiredColumnValidation = true;
    const mutantCol = runQuestionBankImportDryRun({
      fileName: "col.xlsx",
      headers: ["question_code"],
      rows: [],
      authorized: VALID_AUTH,
    });
    assert.equal(mutantCol.issues.some((i) => i.code === "INVALID_CONTRACT" || i.code === "MISSING_HEADER"), false);
  } finally {
    resetMutationHooks();
  }
});
