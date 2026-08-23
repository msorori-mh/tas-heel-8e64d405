import type { GoldenCapability } from "./golden-lesson-contract.ts";

type QuestionCapability = Extract<GoldenCapability, "selfTest" | "officialBookQuestions">;

export interface ConvertedQuestionWorkbook {
  publicFile: File;
  answers: Array<Record<string, unknown>>;
  rowCount: number;
}

/**
 * Columns that must exist in the header row of the workbook sheet.
 * Kept in sync with public/content-import-templates/09_* and 10_*.
 */
const REQUIRED_COLUMNS: Record<QuestionCapability, readonly string[]> = {
  selfTest: [
    "question_code",
    "subject_code",
    "lesson_code",
    "question_text",
    "option_1",
    "option_2",
    "correct_index",
    "explanation",
  ],
  officialBookQuestions: [
    "question_code",
    "subject_code",
    "lesson_code",
    "prompt_kind",
    "question_text",
    "interaction_type",
    "grading_mode",
    "model_answer",
  ],
};

/** Values that must be present in every data row (model_answer is conditional). */
const REQUIRED_CELLS: Record<QuestionCapability, readonly string[]> = {
  selfTest: [
    "question_code",
    "subject_code",
    "lesson_code",
    "question_text",
    "option_1",
    "option_2",
    "correct_index",
    "explanation",
  ],
  officialBookQuestions: [
    "question_code",
    "subject_code",
    "lesson_code",
    "prompt_kind",
    "question_text",
    "interaction_type",
    "grading_mode",
  ],
};

const SHEET_NAME: Record<QuestionCapability, string> = {
  selfTest: "اختبر فهمك",
  officialBookQuestions: "أسئلة الكتاب الأصلية",
};

const CAPABILITY_LABEL: Record<QuestionCapability, string> = {
  selfTest: "اختبر فهمك",
  officialBookQuestions: "أنشطة وأسئلة الدرس",
};

const PUBLIC_FILE_NAME: Record<QuestionCapability, string> = {
  selfTest: "self-test.json",
  officialBookQuestions: "lesson-activities.json",
};

const MAX_OPTIONS = 6;
const MAX_REPORTED_ROW_ERRORS = 12;

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
  const list: string[] = [];
  for (let index = 1; index <= MAX_OPTIONS; index += 1) {
    const value = row[`option_${index}`] ?? "";
    if (value) list.push(value);
  }
  return list;
}

function isChoiceInteraction(row: Record<string, string>): boolean {
  const interaction = (row.interaction_type ?? "").toUpperCase();
  if (interaction.includes("CHOICE") || interaction.includes("MCQ")) return true;
  if (interaction) return false;
  return options(row).length >= 2;
}

function splitAcceptedAnswers(value: string): string[] {
  return value
    .split("|")
    .map((entry) => entry.trim())
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
    const choice = isChoiceInteraction(row);
    return {
      ...base,
      prompt_kind: row.prompt_kind || undefined,
      interaction_type: row.interaction_type || (choice ? "SINGLE_CHOICE" : "LONG_TEXT"),
      question_type: choice ? "MULTIPLE_CHOICE" : "EXTENDED_RESPONSE",
      type: choice ? "multiple_choice" : "extended_response",
    };
  }
  return { ...base, type: "multiple_choice" };
}

function toAnswer(capability: QuestionCapability, row: Record<string, string>) {
  if (capability === "officialBookQuestions") {
    const list = options(row);
    const index = row.correct_index ? Number(row.correct_index) : null;
    const answer: Record<string, unknown> = {
      capability,
      question_id: row.question_code,
      grading_mode: row.grading_mode || undefined,
      model_answer: row.model_answer || (index ? list[index - 1] ?? "" : ""),
    };
    if (row.explanation) answer.explanation = row.explanation;
    if (row.accepted_answers) answer.accepted_answers = splitAcceptedAnswers(row.accepted_answers);
    if (index) answer.correct_index = index;
    return answer;
  }
  const index = Number(row.correct_index);
  const answer: Record<string, unknown> = {
    capability,
    question_id: row.question_code,
    correct_index: index,
    explanation: row.explanation,
    correct_option: `(${String.fromCharCode(96 + index)})`,
    rationale: row.explanation,
  };
  for (let position = 1; position <= MAX_OPTIONS; position += 1) {
    if (row[`why_wrong_${position}`]) answer[`why_wrong_${position}`] = row[`why_wrong_${position}`];
  }
  return answer;
}

function validateRow(
  capability: QuestionCapability,
  row: Record<string, string>,
  rowNumber: number,
): string[] {
  const errors: string[] = [];
  const emptyRequired = REQUIRED_CELLS[capability].filter((field) => !row[field]);
  if (emptyRequired.length) {
    errors.push(`الصف ${rowNumber}: حقول إلزامية فارغة: ${emptyRequired.join("، ")}`);
  }
  const list = options(row);

  if (capability === "selfTest") {
    if (list.length < 2) {
      errors.push(`الصف ${rowNumber}: يجب إدخال خيارين على الأقل (حتى ${MAX_OPTIONS} خيارات).`);
    }
    const index = Number(row.correct_index);
    if (!Number.isInteger(index) || index < 1 || index > list.length) {
      errors.push(
        `الصف ${rowNumber}: correct_index يجب أن يكون رقمًا من 1 إلى ${list.length || MAX_OPTIONS} بحسب عدد الخيارات المدخلة.`,
      );
    }
    return errors;
  }

  const choice = isChoiceInteraction(row);
  if (choice) {
    if (list.length < 2) {
      errors.push(`الصف ${rowNumber}: سؤال الاختيار من متعدد يحتاج خيارين على الأقل.`);
    }
    const index = Number(row.correct_index);
    if (!Number.isInteger(index) || index < 1 || index > list.length) {
      errors.push(`الصف ${rowNumber}: correct_index مطلوب لسؤال الاختيار من متعدد ويجب أن يطابق عدد الخيارات.`);
    }
  } else if (!row.model_answer) {
    errors.push(`الصف ${rowNumber}: model_answer إلزامي للأسئلة المقالية أو ذات التصحيح اليدوي.`);
  }
  return errors;
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

  const normalizeHeader = (value: string) =>
    value.replace(/\*/g, "").replace(/\u00a0/g, " ").trim().toLowerCase();
  const readHeaders = (worksheet: import("exceljs").Worksheet) => {
    const map = new Map<number, string>();
    worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
      const header = normalizeHeader(cellText(cell.value));
      if (header) map.set(column, header);
    });
    return map;
  };

  const required = REQUIRED_COLUMNS[capability];
  const otherCapability: QuestionCapability =
    capability === "selfTest" ? "officialBookQuestions" : "selfTest";
  const named = workbook.worksheets.find(
    (worksheet) => worksheet.name.trim() === SHEET_NAME[capability],
  );
  const matching = named
    ? (required.every((column) => Array.from(readHeaders(named).values()).includes(column))
        ? named
        : undefined)
    : workbook.worksheets.find((worksheet) => {
        if (worksheet.name.trim() === SHEET_NAME[otherCapability]) return false;
        const values = Array.from(readHeaders(worksheet).values());
        return required.every((column) => values.includes(column));
      });


  if (!matching) {
    if (named) {
      const values = Array.from(readHeaders(named).values());
      const missing = required.filter((column) => !values.includes(column));
      throw new Error(
        `ورقة «${SHEET_NAME[capability]}» ينقصها أعمدة إلزامية: ${missing.join("، ")} — نزّل القالب المعتمد ولا تغيّر أسماء الأعمدة.`,
      );
    }

    throw new Error(
      `لم يُعثر على ورقة «${SHEET_NAME[capability]}» بأعمدة ${CAPABILITY_LABEL[capability]} المعتمدة — تأكد أنك رفعت القالب الصحيح لهذا المكوّن.`,
    );
  }

  const sheet = matching;
  const headers = readHeaders(sheet);

  const rows: Array<Record<string, string>> = [];
  const rowErrors: string[] = [];
  const seenCodes = new Set<string>();

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const excelRow = sheet.getRow(rowNumber);
    const row: Record<string, string> = {};
    headers.forEach((header, column) => {
      row[header] = cellText(excelRow.getCell(column).value);
    });
    const meaningful = REQUIRED_CELLS[capability].some((field) => row[field]);
    if (!meaningful) continue;

    rowErrors.push(...validateRow(capability, row, rowNumber));
    const code = row.question_code;
    if (code) {
      if (seenCodes.has(code)) {
        rowErrors.push(`الصف ${rowNumber}: كود السؤال ${code} مكرر داخل الملف.`);
      }
      seenCodes.add(code);
    }
    rows.push(row);
  }

  if (rowErrors.length) {
    const shown = rowErrors.slice(0, MAX_REPORTED_ROW_ERRORS);
    const extra = rowErrors.length - shown.length;
    throw new Error(shown.join(" | ") + (extra > 0 ? ` | و${extra} خطأ إضافي.` : ""));
  }
  if (!rows.length) throw new Error("ملف XLSX لا يحتوي أسئلة قابلة للاستيراد.");

  const payload = {
    capability,
    status: "DRAFT",
    source_file: file.name,
    questions: rows.map((row) => toPublicQuestion(capability, row)),
  };
  return {
    publicFile: new File([JSON.stringify(payload)], PUBLIC_FILE_NAME[capability], { type: "application/json" }),
    answers: rows.map((row) => toAnswer(capability, row)),
    rowCount: rows.length,
  };
}
