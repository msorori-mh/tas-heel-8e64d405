import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("operator template metadata exposes official questions and self-test separately", async () => {
  const source = await readFile(new URL("src/lib/content-import/content-import-templates.ts", root), "utf8");
  assert.match(source, /09_official_book_questions_template\.xlsx/);
  assert.match(source, /10_self_test_questions_template\.xlsx/);
  assert.match(source, /titleAr: "أسئلة الكتاب الأصلية"/);
  assert.match(source, /titleAr: "اختبر فهمك"/);
});

test("generated workbook source keeps different conditional contracts", async () => {
  const source = await readFile(new URL("scripts/generate-content-templates.mjs", root), "utf8");
  const official = source.slice(
    source.indexOf('file: "09_official_book_questions_template.xlsx"'),
    source.indexOf('file: "10_self_test_questions_template.xlsx"'),
  );
  const selfTest = source.slice(source.indexOf('file: "10_self_test_questions_template.xlsx"'));

  assert.match(official, /prompt_kind/);
  assert.match(official, /interaction_type/);
  assert.match(official, /model_answer/);
  assert.match(official, /وجود خيارات في سؤال كتاب أصلي لا ينقله/);

  assert.match(selfTest, /correct_index.*required: true/);
  assert.match(selfTest, /explanation.*required: true/);
  assert.match(selfTest, /why_wrong_2/);
  assert.match(selfTest, /الدور SELF_TEST/);
});

test("import contract derives semantic roles from template identity", async () => {
  const source = await readFile(new URL("src/lib/import/import-contract.ts", root), "utf8");
  assert.match(source, /derived by template: OFFICIAL_BOOK_QUESTION; never inferred from options/);
  assert.match(source, /derived by template: SELF_TEST; never inferred from options/);
  assert.match(source, /self_test_questions:/);
});
