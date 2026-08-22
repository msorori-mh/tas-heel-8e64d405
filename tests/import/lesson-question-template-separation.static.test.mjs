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

test("both templates bypass the generic upsert executor", async () => {
  const execution = await readFile(new URL("src/lib/import/import-execution-state.ts", root), "utf8");
  const server = await readFile(new URL("src/lib/import/import-staging.server.ts", root), "utf8");
  assert.match(execution, /templateKeys: \["questions", "self_test_questions"\]/);
  assert.match(execution, /import_execute_lesson_question_template/);
  assert.match(server, /questionBankExecuteRpcForTemplate/);
});

test("pending import SQL derives roles from template identity and writes draft QB revisions", async () => {
  const sql = await readFile(
    new URL("supabase/migrations-pending/20260821010000_lesson_question_role_separation.sql", root),
    "utf8",
  );
  assert.match(sql, /qb_import_ingest_lesson_question_revision/);
  assert.match(sql, /import_execute_lesson_question_template/);
  assert.match(sql, /WHEN 'questions' THEN 'OFFICIAL_BOOK_QUESTION'/);
  assert.match(sql, /WHEN 'self_test_questions' THEN 'SELF_TEST'/);
  assert.match(sql, /'DRAFT'/);
  assert.equal((sql.match(/extensions\\.digest\\(/g) ?? []).length, 2);
});
