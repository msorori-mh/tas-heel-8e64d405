import assert from "node:assert/strict";
import test from "node:test";
import { canonicalHash, compareCodePoints } from "../../../src/lib/question-bank/import/canonical-json.ts";
import { adaptOfficialFlatV0 } from "../../../src/lib/question-bank/import/adapters/official-flat-v0.ts";
import { sortIssues, issue } from "../../../src/lib/question-bank/import/errors.ts";
import { QB_IMPORT_CODES } from "../../../src/lib/question-bank/import/validation-codes.ts";

const locales = ["en-US", "ar-YE", "tr-TR"];

test("canonical hash and issue order are locale-independent", () => {
  const hashes: string[] = [];
  const orders: string[] = [];
  for (const locale of locales) {
    const previous = process.env.LC_ALL;
    process.env.LC_ALL = locale;
    const { row } = adaptOfficialFlatV0(
      {
        question_code: "Z-LOCALE",
        question_text: "سؤال",
        interaction_type: "SINGLE_CHOICE",
        grading_mode: "AUTO_SINGLE",
        option_1: "١",
        option_2: "٢",
        correct_index: 2,
        max_score: 1,
        subject_code: "MATH",
        lesson_code: "L1",
      },
      { rowNumber: 2 },
    );
    hashes.push(canonicalHash(row));
    const sorted = sortIssues([
      issue(QB_IMPORT_CODES.MISSING_VALUE, { file: "b.xlsx", row: 3, column: "a", stage: "ROW_VALIDATION", source_subsystem: "validate" }),
      issue(QB_IMPORT_CODES.INVALID_SCORE, { file: "a.xlsx", row: 2, column: "z", stage: "ROW_VALIDATION", source_subsystem: "validate" }),
      issue(QB_IMPORT_CODES.OPTION_COUNT, { file: "a.xlsx", row: 2, column: "a", stage: "ROW_VALIDATION", source_subsystem: "validate" }),
    ]);
    orders.push(sorted.map((item) => `${item.file}:${item.row}:${item.column}:${item.code}`).join("|"));
    if (previous === undefined) delete process.env.LC_ALL;
    else process.env.LC_ALL = previous;
  }
  assert.equal(new Set(hashes).size, 1);
  assert.equal(new Set(orders).size, 1);
  assert.ok(compareCodePoints("a", "b") < 0);
  assert.ok(compareCodePoints("ب", "ت") < 0);
});
