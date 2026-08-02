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

const reordered = [
  { option_code: "B", body: "two" },
  { option_code: "A", body: "one" },
];

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
  // Mutant: treating 0 as invalid 1-based would kill this row.
  assert.equal(resolveCorrectAnswer(0, reordered, { indexBase: 0 }).ok, true);
});

test("mutation 2: letters resolve by option_code not array position", () => {
  const r = resolveCorrectAnswer("A", reordered, { indexBase: 1 });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.option_code, "A");
    // Mutant using array[0] for "A" would mark B correct here.
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

test("mutation 5: validation registry still contains INVALID_SCORE", () => {
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
