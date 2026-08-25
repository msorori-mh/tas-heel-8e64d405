import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import {
  convertQuestionWorkbook,
  resolveExcelJSModule,
} from "../../src/lib/content-factory/golden-lesson-xlsx.ts";

async function buildWorkbook(
  sheetName: string,
  header: string[],
  rows: Array<Array<string | number>>,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(header);
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as unknown as ArrayBuffer);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function toFile(buffer: ArrayBuffer, name: string): File {
  return new File([buffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const SELF_TEST_HEADER = [
  "question_code",
  "subject_code",
  "lesson_code",
  "question_text",
  "option_1",
  "option_2",
  "option_3",
  "option_4",
  "correct_index",
  "explanation",
];

const OFFICIAL_HEADER = [
  "question_code",
  "subject_code",
  "lesson_code",
  "prompt_kind",
  "question_text",
  "interaction_type",
  "grading_mode",
  "model_answer",
  "option_1",
  "option_2",
  "correct_index",
  "explanation",
];

test("resolver accepts the plain CJS/ESM module shapes", () => {
  assert.equal(resolveExcelJSModule(ExcelJS), ExcelJS);
  assert.equal(resolveExcelJSModule({ default: ExcelJS }), ExcelJS);
  assert.equal(resolveExcelJSModule({ default: { default: ExcelJS } }), ExcelJS);
});

test("resolver accepts the Vite production shape with a minified export key", () => {
  // Vite/rollup production chunk exposes the UMD bundle as `{ e: { default: ExcelJS, Workbook } }`.
  const prodNamespace = Object.freeze({ e: { default: ExcelJS, Workbook: ExcelJS.Workbook } });
  const resolved = resolveExcelJSModule(prodNamespace);
  assert.equal(typeof resolved.Workbook, "function");
  assert.equal(new resolved.Workbook().constructor.name, "Workbook");
});

test("resolver fails closed when ExcelJS is absent", () => {
  assert.throws(() => resolveExcelJSModule({}), /ExcelJS/);
  assert.throws(() => resolveExcelJSModule({ default: null, x: 1 }), /ExcelJS/);
});

test("selfTest: converts a real in-memory XLSX ArrayBuffer", async () => {
  const buffer = await buildWorkbook("اختبر فهمك", SELF_TEST_HEADER, [
    ["CHEM-IRON-ST-01", "CHEM", "CHEM-12-IRON", "ما الرمز الكيميائي للحديد؟", "Fe", "Cu", "Ag", "Au", 1, "الحديد رمزه Fe"],
    ["CHEM-IRON-ST-02", "CHEM", "CHEM-12-IRON", "في أي مجموعة يقع الحديد؟", "8", "1", "", "", 1, "شرح"],
  ]);
  const result = await convertQuestionWorkbook("selfTest", toFile(buffer, "self-test.xlsx"));
  assert.equal(result.rowCount, 2);
  assert.equal(result.publicFile.name, "self-test.json");
  const payload = JSON.parse(await result.publicFile.text());
  assert.equal(payload.capability, "selfTest");
  assert.equal(payload.questions.length, 2);
  assert.equal(payload.questions[0].question_code, "CHEM-IRON-ST-01");
  assert.deepEqual(payload.questions[0].options, ["Fe", "Cu", "Ag", "Au"]);
  assert.equal(payload.questions[0].type, "multiple_choice");
  assert.equal(result.answers.length, 2);
  assert.equal(result.answers[0].correct_index, 1);
  assert.equal(result.answers[0].question_id, "CHEM-IRON-ST-01");
});

test("officialBookQuestions: converts a real in-memory XLSX ArrayBuffer", async () => {
  const buffer = await buildWorkbook("أسئلة الكتاب الأصلية", OFFICIAL_HEADER, [
    ["CHEM-IRON-OB-01", "CHEM", "CHEM-12-IRON", "ACTIVITY", "عرّف الحديد", "LONG_TEXT", "MANUAL", "الحديد عنصر فلزي", "", "", "", ""],
    ["CHEM-IRON-OB-02", "CHEM", "CHEM-12-IRON", "ACTIVITY", "اختر رمز الحديد", "SINGLE_CHOICE", "AUTO_SINGLE", "Fe", "Fe", "Cu", 1, "شرح"],
  ]);
  const result = await convertQuestionWorkbook(
    "officialBookQuestions",
    toFile(buffer, "official.xlsx"),
  );
  assert.equal(result.rowCount, 2);
  assert.equal(result.publicFile.name, "lesson-activities.json");
  const payload = JSON.parse(await result.publicFile.text());
  assert.equal(payload.capability, "officialBookQuestions");
  assert.equal(payload.questions.length, 2);
  const essay = payload.questions.find((q: { question_code: string }) => q.question_code === "CHEM-IRON-OB-01");
  assert.equal(essay.interaction_type, "LONG_TEXT");
  assert.equal(essay.question_type, "EXTENDED_RESPONSE");
  const choice = payload.questions.find((q: { question_code: string }) => q.question_code === "CHEM-IRON-OB-02");
  assert.equal(choice.interaction_type, "SINGLE_CHOICE");
  assert.equal(choice.question_type, "MULTIPLE_CHOICE");
  assert.deepEqual(choice.options, ["Fe", "Cu"]);
  assert.equal(result.answers.length, 2);
  const essayAnswer = result.answers.find(
    (a) => a.question_id === "CHEM-IRON-OB-01",
  ) as Record<string, unknown>;
  assert.equal(essayAnswer.model_answer, "الحديد عنصر فلزي");
});

test("rejects a workbook missing the approved sheet and columns", async () => {
  const buffer = await buildWorkbook("ورقة عشوائية", ["a", "b"], [["1", "2"]]);
  await assert.rejects(
    () => convertQuestionWorkbook("selfTest", toFile(buffer, "wrong.xlsx")),
    /اختبر فهمك/,
  );
});
