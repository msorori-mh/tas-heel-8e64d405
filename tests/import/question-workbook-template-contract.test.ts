import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { convertQuestionWorkbook } from "../../src/lib/content-factory/golden-lesson-xlsx.ts";

const TEMPLATE_DIR = join(process.cwd(), "public", "content-import-templates");

async function templateFile(name: string): Promise<File> {
  const bytes = await readFile(join(TEMPLATE_DIR, name));
  return new File([bytes], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

test("قالب 10 «اختبر فهمك» يُقبل كما هو مع صفه النموذجي", async () => {
  const result = await convertQuestionWorkbook(
    "selfTest",
    await templateFile("10_self_test_questions_template.xlsx"),
  );
  assert.equal(result.rowCount, 1);
  assert.equal(result.publicFile.name, "self-test.json");

  const payload = JSON.parse(await result.publicFile.text()) as {
    capability: string;
    questions: Array<Record<string, unknown>>;
  };
  assert.equal(payload.capability, "selfTest");
  assert.equal(payload.questions.length, 1);
  const question = payload.questions[0]!;
  assert.equal((question.options as string[]).length, 4);
  assert.equal(question.correct_index, undefined);
  assert.equal(question.explanation, undefined);

  const answer = result.answers[0]!;
  assert.equal(answer.capability, "selfTest");
  assert.equal(answer.correct_index, 1);
  assert.ok(typeof answer.explanation === "string" && answer.explanation.length > 0);
});

test("قالب 09 «أسئلة الكتاب الأصلية» يُقبل ويحافظ على نوع السؤال وطريقة التصحيح", async () => {
  const result = await convertQuestionWorkbook(
    "officialBookQuestions",
    await templateFile("09_official_book_questions_template.xlsx"),
  );
  assert.equal(result.rowCount, 1);
  assert.equal(result.publicFile.name, "lesson-activities.json");

  const payload = JSON.parse(await result.publicFile.text()) as {
    questions: Array<Record<string, unknown>>;
  };
  const question = payload.questions[0]!;
  assert.equal(question.interaction_type, "LONG_TEXT");
  assert.equal(question.question_type, "EXTENDED_RESPONSE");
  assert.equal(question.type, "extended_response");
  assert.equal(question.model_answer, undefined);

  const answer = result.answers[0]!;
  assert.equal(answer.grading_mode, "MANUAL");
  assert.ok(typeof answer.model_answer === "string" && answer.model_answer.length > 0);
});

test("اختبر فهمك يقبل خيارين ويرفض correct_index خارج عدد الخيارات", async () => {
  const ExcelJS = (await import("exceljs")).default;

  const build = async (rows: Array<Array<string | number>>): Promise<File> => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("اختبر فهمك");
    sheet.addRow([
      "question_code *",
      "subject_code *",
      "lesson_code *",
      "question_text *",
      "option_1 *",
      "option_2 *",
      "option_3",
      "option_4",
      "correct_index *",
      "explanation *",
    ]);
    rows.forEach((row) => sheet.addRow(row));
    const buffer = await workbook.xlsx.writeBuffer();
    return new File([buffer], "case.xlsx");
  };

  const ok = await convertQuestionWorkbook(
    "selfTest",
    await build([["q1", "sub-1", "les-1", "سؤال؟", "أ", "ب", "", "", 2, "تعليل"]]),
  );
  assert.equal(ok.rowCount, 1);
  assert.equal(ok.answers[0]!.correct_index, 2);

  await assert.rejects(
    convertQuestionWorkbook(
      "selfTest",
      await build([["q1", "sub-1", "les-1", "سؤال؟", "أ", "ب", "", "", 4, "تعليل"]]),
    ),
    /correct_index/,
  );
});

test("رسالة الخطأ تسمي الورقة المطلوبة عند رفع القالب الخاطئ", async () => {
  await assert.rejects(
    convertQuestionWorkbook(
      "selfTest",
      await templateFile("09_official_book_questions_template.xlsx"),
    ),
    /اختبر فهمك/,
  );
});

test("النشر المباشر يرفض هوية درس مختلفة وحالة غير معتمدة", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("اختبر فهمك");
  sheet.addRow([
    "question_code *",
    "subject_code *",
    "lesson_code *",
    "question_text *",
    "option_1 *",
    "option_2 *",
    "option_3",
    "option_4",
    "correct_index *",
    "explanation *",
    "review_status",
  ]);
  sheet.addRow([
    "st-1",
    "SUB-OTHER",
    "LESSON-OTHER",
    "سؤال؟",
    "أ",
    "ب",
    "ج",
    "د",
    1,
    "شرح",
    "مسودة",
  ]);
  const buffer = await workbook.xlsx.writeBuffer();
  const file = new File([buffer], "wrong-identity.xlsx");

  await assert.rejects(
    convertQuestionWorkbook("selfTest", file, {
      expectedSubjectCode: "SUB-EXPECTED",
      expectedLessonCode: "LESSON-EXPECTED",
      requireApproved: true,
      requireFourChoices: true,
    }),
    /subject_code لا يطابق المادة المختارة.*lesson_code لا يطابق الدرس المختار.*review_status يجب أن يكون «معتمد»/,
  );
});

test("عقد الطالب الصارم يتطلب أربعة خيارات متصلة بالضبط", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const build = async (values: Array<string | number>): Promise<File> => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("اختبر فهمك");
    sheet.addRow([
      "question_code *",
      "subject_code *",
      "lesson_code *",
      "question_text *",
      "option_1 *",
      "option_2 *",
      "option_3",
      "option_4",
      "correct_index *",
      "explanation *",
      "review_status",
    ]);
    sheet.addRow(values);
    return new File([await workbook.xlsx.writeBuffer()], "strict.xlsx");
  };

  await assert.rejects(
    convertQuestionWorkbook(
      "selfTest",
      await build(["st-1", "SUB-1", "LESSON-1", "سؤال؟", "أ", "ب", "", "د", 1, "شرح", "معتمد"]),
      { requireApproved: true, requireFourChoices: true },
    ),
    /لا يجوز ترك option_3 فارغًا.*يتطلب أربعة خيارات/,
  );

  const accepted = await convertQuestionWorkbook(
    "selfTest",
    await build(["st-1", "SUB-1", "LESSON-1", "سؤال؟", "أ", "ب", "ج", "د", 4, "شرح", "معتمد"]),
    {
      expectedSubjectCode: "sub-1",
      expectedLessonCode: "lesson-1",
      requireApproved: true,
      requireFourChoices: true,
    },
  );
  assert.equal(accepted.rowCount, 1);
});
