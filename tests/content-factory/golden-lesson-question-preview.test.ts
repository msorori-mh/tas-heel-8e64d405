import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { convertQuestionWorkbook } from "../../src/lib/content-factory/golden-lesson-xlsx";
import { buildQuestionPreview } from "../../src/lib/content-factory/golden-lesson-question-preview";

const payload = {
  capability: "selfTest",
  questions: [
    { question_code: "Q-1", question_text: "سؤال أول", options: ["أ", "ب", "ج", "د"] },
    { question_code: "Q-2", question_text: "سؤال ثان", options: ["هـ", "و", "ز", "ح"] },
  ],
};
describe("admin-local question preview", () => {
  it("joins answers by code and capability, preserves order and the one-based correct index", () => {
    const answers = [
      { capability: "selfTest", question_id: "q-2", correct_index: 4, explanation: "تعليل ثان" },
      { capability: "officialBookQuestions", question_id: "Q-1", correct_index: 2 },
      { capability: "selfTest", question_id: "Q-1", correct_index: 3, explanation: "تعليل أول" },
    ];
    const before = JSON.stringify({ payload, answers });
    const preview = buildQuestionPreview("selfTest", payload, answers);
    expect(preview.map((q) => [q.code, q.correctIndex, q.explanation])).toEqual([
      ["Q-1", 3, "تعليل أول"],
      ["Q-2", 4, "تعليل ثان"],
    ]);
    expect(JSON.stringify({ payload, answers })).toBe(before);
  });
  it("does not claim a correct option when an answer is missing or out of range", () => {
    expect(
      buildQuestionPreview("selfTest", payload, [
        { capability: "selfTest", question_id: "Q-1", correct_index: 0 },
      ]).map((q) => q.correctIndex),
    ).toEqual([null, null]);
  });
  it("rejects a mismatched, empty or corrupt artifact", () => {
    for (const invalid of [
      null,
      {},
      { ...payload, capability: "officialBookQuestions" },
      { ...payload, questions: [] },
      { ...payload, questions: [{ options: [1] }] },
    ])
      expect(() => buildQuestionPreview("selfTest", invalid, [])).toThrow();
  });
  it("previews a real Excel conversion without putting its answers in the public artifact", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("أسئلة الكتاب الأصلية");
    sheet.addRow([
      "question_code",
      "subject_code",
      "lesson_code",
      "prompt_kind",
      "question_text",
      "interaction_type",
      "grading_mode",
      "model_answer",
      "accepted_answers",
    ]);
    sheet.addRow([
      "BOOK-01",
      "CHEM",
      "CHEM-IRON",
      "ACTIVITY",
      "عرّف الحديد",
      "LONG_TEXT",
      "MANUAL",
      "الحديد عنصر فلزي",
      "",
    ]);
    sheet.addRow([
      "BOOK-02",
      "CHEM",
      "CHEM-IRON",
      "ACTIVITY",
      "ما رمز الحديد؟",
      "SHORT_TEXT",
      "AUTO_TEXT",
      "Fe",
      "Fe|الحديد",
    ]);
    const bytes = new Uint8Array((await workbook.xlsx.writeBuffer()) as unknown as ArrayBuffer);
    const converted = await convertQuestionWorkbook(
      "officialBookQuestions",
      new File([bytes], "book.xlsx"),
    );
    const raw = await converted.publicFile.text();
    const rows = buildQuestionPreview("officialBookQuestions", JSON.parse(raw), converted.answers);
    expect(rows[0]).toMatchObject({
      interactionType: "LONG_TEXT",
      modelAnswer: "الحديد عنصر فلزي",
      gradingMode: "MANUAL",
    });
    expect(rows[1].acceptedAnswers).toEqual(["Fe", "الحديد"]);
    expect(raw).not.toContain("الحديد عنصر فلزي");
    expect(raw).not.toContain("accepted_answers");
  });
});
