import type { GoldenCapability } from "./golden-lesson-contract.ts";

type QuestionCapability = Extract<GoldenCapability, "selfTest" | "officialBookQuestions">;

export interface ConvertedQuestionWorkbook {
  publicFile: File;
  answers: Array<Record<string, unknown>>;
  rowCount: number;
}

const REQUIRED: Record<QuestionCapability, readonly string[]> = {
  selfTest: [
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
  ],
  officialBookQuestions: [
    "question_code",
    "subject_code",
    "lesson_code",
    "question_text",
    "model_answer",
  ],
};

const PUBLIC_FILE_NAME: Record<QuestionCapability, string> = {
  selfTest: "self-test.json",
  officialBookQuestions: "lesson-activities.json",
};

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const rich = value as { text?: unknown; richText?: Array<{ text?: unknown }>; result?: unknown };
    if (typeof rich.text === "string") return rich.text.trim();
    if (Array.isArray(rich.richText)) {
      return rich.richText.map((part) => String(part.text ?? "")).join("").trim();
    }
    if (rich.result !== undefined) return String(rich.result).trim();
  }
  return String(value).trim();
}

function options(row: Record<string, string>): string[] {
  return [1, 2, 3, 4, 5, 6]
    .map((index) => row[`option_${index}`] ?? "")
    .filter(Boolean);
}

function toPublicQuestion(capability: QuestionCapability, row: Record<string, string>) {
  const base = {
    id: row.question_code,
    question_code: row.question_code,
    question: row.question_text,
    question_text: row.question_text,
    options: options(row),
    sort_order: row.sort_order ? Number(row.sort_order) : undefined,
  };
  if (capability === "officialBookQuestions") {
    return {
      ...base,
      prompt_kind: row.prompt_kind || undefined,
      question_type: "EXTENDED_RESPONSE",
      type: base.options.length >= 2 ? "multiple_choice" : "extended_response",
    };
  }
  return { ...base, type: "multiple_choice" };
}

function toAnswer(capability: QuestionCapability, row: Record<string, string>) {
  if (capability === "officialBookQuestions") {
    const answer: Record<string, unknown> = {
      capability,
      question_id: row.question_code,
      model_answer: row.model_answer,
    };
    if (row.explanation) answer.explanation = row.explanation;
    if (row.accepted_answers) answer.accepted_answers = row.accepted_answers;
    if (row.correct_index) answer.correct_index = Number(row.correct_index);
    return answer;
  }
  const answer: Record<string, unknown> = {
    capability,
    question_id: row.question_code,
    correct_index: Number(row.correct_index),
    explanation: row.explanation,
    correct_option: `(${String.fromCharCode(96 + Number(row.correct_index))})`,
    rationale: row.explanation,
  };
  for (let index = 1; index <= 6; index += 1) {
    if (row[`why_wrong_${index}`]) answer[`why_wrong_${index}`] = row[`why_wrong_${index}`];
  }
  return answer;
}


export async function convertQuestionWorkbook(
  capability: QuestionCapability,
  file: File,
): Promise<ConvertedQuestionWorkbook> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("يُقبل قالب XLSX المعتمد فقط.");
  const ExcelJSModule = await import("exceljs");
  const ExcelJS = (ExcelJSModule.default ?? ExcelJSModule) as typeof import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer() as any);
  const normalizeHeader = (value: string) => value.replace(/\*/g, "").trim().toLowerCase();
  const readHeaders = (worksheet: import("exceljs").Worksheet) => {
    const map = new Map<number, string>();
    worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
      const header = normalizeHeader(cellText(cell.value));
      if (header) map.set(column, header);
    });
    return map;
  };

  const sheet = workbook.worksheets.find((worksheet) => {
    const map = readHeaders(worksheet);
    return REQUIRED[capability].every((required) => Array.from(map.values()).includes(required));
  }) ?? workbook.worksheets[0];
  if (!sheet) throw new Error("ملف XLSX لا يحتوي ورقة عمل.");

  const headers = readHeaders(sheet);
  const missing = REQUIRED[capability].filter(
    (required) => !Array.from(headers.values()).includes(required),
  );
  if (missing.length) throw new Error(`أعمدة إلزامية مفقودة: ${missing.join("، ")}`);


  const rows: Array<Record<string, string>> = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const excelRow = sheet.getRow(rowNumber);
    const row: Record<string, string> = {};
    headers.forEach((header, column) => {
      row[header] = cellText(excelRow.getCell(column).value);
    });
    if (!Object.values(row).some(Boolean)) continue;
    const emptyRequired = REQUIRED[capability].filter((field) => !row[field]);
    if (emptyRequired.length) {
      throw new Error(`الصف ${rowNumber}: حقول إلزامية فارغة: ${emptyRequired.join("، ")}`);
    }
    if (capability === "selfTest") {
      const index = Number(row.correct_index);
      const optionCount = options(row).length;
      if (optionCount !== 4 || row.option_5 || row.option_6) {
        throw new Error(`الصف ${rowNumber}: يجب إدخال أربعة خيارات بالضبط.`);
      }
      if (!Number.isInteger(index) || index < 1 || index > 4) {
        throw new Error(`الصف ${rowNumber}: correct_index يجب أن يكون من 1 إلى 4.`);
      }
    }
    rows.push(row);
  }
  if (!rows.length) throw new Error("ملف XLSX لا يحتوي أسئلة قابلة للاستيراد.");

  const payload = {
    capability,
    status: "DRAFT",
    source_file: file.name,
    questions: rows.map((row) => toPublicQuestion(capability, row)),
  };
  return {
    publicFile: new File([JSON.stringify(payload)], "self-test.json", { type: "application/json" }),
    answers: rows.map((row) => toAnswer(capability, row)),
    rowCount: rows.length,
  };
}
