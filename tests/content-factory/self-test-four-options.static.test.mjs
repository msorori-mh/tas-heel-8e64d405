import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  "src/lib/content-factory/golden-lesson-xlsx.ts",
  "utf8",
);
const generator = readFileSync("scripts/generate-content-templates.mjs", "utf8");

test("self-test XLSX requires exactly four option columns and four rationale columns", () => {
  const requiredBlock = source.match(/selfTest:\s*\[([\s\S]*?)\n\s*\],/)?.[1] ?? "";

  for (const column of [
    "option_1",
    "option_2",
    "option_3",
    "option_4",
    "why_wrong_1",
    "why_wrong_2",
    "why_wrong_3",
    "why_wrong_4",
  ]) {
    assert.match(requiredBlock, new RegExp(`"${column}"`));
  }
  assert.doesNotMatch(requiredBlock, /"option_[56]"|"why_wrong_[56]"/);
});

test("self-test conversion exposes exactly four options and rejects option 5 or 6", () => {
  assert.match(source, /options:\s*options\(row, 4\)/);
  assert.match(source, /selfTestOptions\.length !== 4/);
  assert.match(source, /row\.option_5 \|\| row\.option_6/);
  assert.match(source, /correct_index يجب أن يكون رقمًا من 1 إلى 4/);
  assert.match(source, /for \(let index = 1; index <= 4; index \+= 1\)/);
});

test("every incorrect option requires its own rationale", () => {
  assert.match(source, /REQUIRED_ROW_VALUES/);
  assert.match(source, /!field\.startsWith\("why_wrong_"\)/);
  assert.match(source, /\[1, 2, 3, 4\]/);
  assert.match(source, /optionIndex !== index/);
  assert.match(source, /!row\[`why_wrong_\$\{optionIndex\}`\]/);
  assert.match(source, /تعليل الخيار الخاطئ مفقود/);
});

test("template 10 generates the same exact four-option contract", () => {
  const selfTestTemplate = generator.match(
    /file: "10_self_test_questions_template\.xlsx",([\s\S]*?)\n\s*\},\n\];/,
  )?.[1] ?? "";

  for (const column of [
    "option_1",
    "option_2",
    "option_3",
    "option_4",
    "why_wrong_1",
    "why_wrong_2",
    "why_wrong_3",
    "why_wrong_4",
  ]) {
    assert.match(selfTestTemplate, new RegExp(`key: "${column}"`));
  }
  assert.doesNotMatch(selfTestTemplate, /option_[56]|why_wrong_[56]/);
  assert.match(selfTestTemplate, /1=option_1 … 4=option_4/);
  assert.match(selfTestTemplate, /تعليل كل خيار خاطئ/);
});
