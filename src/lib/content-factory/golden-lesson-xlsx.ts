import type { GoldenCapability } from "./golden-lesson-contract.ts";

type QuestionCapability = Extract<GoldenCapability, "selfTest" | "officialBookQuestions">;

export interface ConvertedQuestionWorkbook {
  publicFile: File;
  answers: Array<Record<string, unknown>>;
  rowCount: number;
}

export interface QuestionWorkbookGuard {
  /** Selected package identity; every workbook row must match it exactly. */
  expectedSubjectCode?: string;
  expectedLessonCode?: string;
  /** Direct publication accepts reviewed content only. */
  requireApproved?: boolean;
  /** The student self-test contract used by the golden lesson is exactly four choices. */
  requireFourChoices?: boolean;
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

const PUBLIC_FILE_NAME: Record<QuestionCapability, string> = {
  selfTest: "self-test.json",
  officialBookQuestions: "lesson-activities.json",
};

const MAX_OPTIONS = 6;
const MAX_REPORTED_ROW_ERRORS = 12;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const rich = value as {
      text?: unknown;
      richText?: Array<{ text?: unknown }>;
      result?: unknown;
    };
    if (typeof rich.text === "string") return rich.text.trim();
    if (Array.isArray(rich.richText)) {
      return rich.richText
        .map((part) => String(part.text ?? ""))
        .join("")
        .trim();
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
      model_answer: row.model_answer || (index ? (list[index - 1] ?? "") : ""),
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
    if (row[`why_wrong_${position}`])
      answer[`why_wrong_${position}`] = row[`why_wrong_${position}`];
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
  const populatedOptionPositions = Array.from(
    { length: MAX_OPTIONS },
    (_, index) => index + 1,
  ).filter((position) => Boolean(row[`option_${position}`]));
  const lastOptionPosition = populatedOptionPositions.at(-1) ?? 0;
  for (let position = 1; position <= lastOptionPosition; position += 1) {
    if (!row[`option_${position}`]) {
      errors.push(
        `الصف ${rowNumber}: لا يجوز ترك option_${position} فارغًا بين الخيارات؛ أدخل الخيارات بترتيب متصل.`,
      );
    }
  }

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

  const interaction = row.interaction_type?.toUpperCase();
  const grading = row.grading_mode?.toUpperCase();
  const allowedInteractions = new Set(["LONG_TEXT", "SHORT_TEXT", "SINGLE_CHOICE"]);
  const allowedGradings = new Set(["MANUAL", "AUTO_TEXT", "AUTO_SINGLE"]);
  if (!allowedInteractions.has(interaction)) {
    errors.push(`الصف ${rowNumber}: interaction_type غير معتمد.`);
  }
  if (!allowedGradings.has(grading)) {
    errors.push(`الصف ${rowNumber}: grading_mode غير معتمد.`);
  }
  if (interaction === "SINGLE_CHOICE" && grading !== "AUTO_SINGLE") {
    errors.push(`الصف ${rowNumber}: SINGLE_CHOICE يتطلب grading_mode=AUTO_SINGLE.`);
  }
  if (interaction === "SHORT_TEXT" && grading !== "AUTO_TEXT") {
    errors.push(`الصف ${rowNumber}: SHORT_TEXT يتطلب grading_mode=AUTO_TEXT.`);
  }
  if (interaction === "LONG_TEXT" && grading !== "MANUAL") {
    errors.push(`الصف ${rowNumber}: LONG_TEXT يتطلب grading_mode=MANUAL.`);
  }

  const choice = isChoiceInteraction(row);
  if (choice) {
    if (list.length < 2) {
      errors.push(`الصف ${rowNumber}: سؤال الاختيار من متعدد يحتاج خيارين على الأقل.`);
    }
    const index = Number(row.correct_index);
    if (!Number.isInteger(index) || index < 1 || index > list.length) {
      errors.push(
        `الصف ${rowNumber}: correct_index مطلوب لسؤال الاختيار من متعدد ويجب أن يطابق عدد الخيارات.`,
      );
    }
  } else if (!row.model_answer) {
    errors.push(`الصف ${rowNumber}: model_answer إلزامي للأسئلة المقالية أو ذات التصحيح اليدوي.`);
  }
  return errors;
}

const SPREADSHEETML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

/**
 * Accept a workbook written with prefixed SpreadsheetML elements.
 *
 * OOXML lets a writer put the spreadsheet namespace on a prefix -- `<x:workbook>`,
 * `<x:sheet>` -- instead of declaring it as the default namespace. Excel itself opens
 * both forms, and several common writers (the OpenXML SDK, ClosedXML, and the exporters
 * built on them) emit the prefixed one. Our reader matched only unprefixed element names,
 * so it built a workbook with no sheets and then failed on it, and the operator was told
 * their perfectly valid Excel file could not be read.
 *
 * The prefix is rewritten to a default namespace before parsing. An already-unprefixed
 * workbook is returned untouched, so nothing changes for files that worked before.
 */
async function normalizeSpreadsheetNamespaces(bytes: Uint8Array): Promise<Uint8Array> {
  // Not a zip at all: leave it for ExcelJS to reject with its own message.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return bytes;

  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  const workbookPart = zip.file("xl/workbook.xml");
  if (!workbookPart) return bytes;

  const workbookXml = await workbookPart.async("string");
  const prefixMatch = /<([A-Za-z_][\w.-]*):workbook[\s>]/.exec(workbookXml);
  if (!prefixMatch) return bytes;
  const prefix = prefixMatch[1];

  const openTag = new RegExp(`<${prefix}:`, "g");
  const closeTag = new RegExp(`</${prefix}:`, "g");
  const declaration = new RegExp(`xmlns:${prefix}\\s*=\\s*"${SPREADSHEETML_NS}"`, "g");

  const parts = Object.keys(zip.files).filter(
    (name) => !zip.files[name]!.dir && /\.(xml|rels)$/i.test(name),
  );
  for (const name of parts) {
    const original = await zip.file(name)!.async("string");
    if (!original.includes(`<${prefix}:`)) continue;
    zip.file(
      name,
      original
        .replace(declaration, `xmlns="${SPREADSHEETML_NS}"`)
        .replace(openTag, "<")
        .replace(closeTag, "</"),
    );
  }
  return await zip.generateAsync({ type: "uint8array" });
}

export async function convertQuestionWorkbook(
  capability: QuestionCapability,
  file: File,
  guard: QuestionWorkbookGuard = {},
): Promise<ConvertedQuestionWorkbook> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("يُقبل قالب XLSX المعتمد فقط.");
  // exceljs is CommonJS. A bundler gives the namespace the interop shape, plain Node ESM
  // puts everything on .default -- so reach through it when it is there. Without this the
  // module cannot be exercised outside a browser build, which is why its behaviour on real
  // uploaded files went unverified for so long.
  const ExcelJSModule = await import("exceljs");
  const ExcelJS = (
    "Workbook" in ExcelJSModule ? ExcelJSModule : (ExcelJSModule as { default: unknown }).default
  ) as typeof ExcelJSModule;
  const workbook = new ExcelJS.Workbook();
  const workbookBytes = await normalizeSpreadsheetNamespaces(
    new Uint8Array(await file.arrayBuffer()),
  );
  try {
    await workbook.xlsx.load(workbookBytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (error) {
    throw new Error(
      `تعذّرت قراءة ملف Excel — تأكد أنه ملف ‎.xlsx‎ سليم وليس ‎.xls‎ قديمًا أو ملفًا تالفًا. (${
        error instanceof Error ? error.message : "سبب غير معروف"
      })`,
    );
  }

  const normalizeHeader = (value: string) =>
    value
      .replace(/\*/g, "")
      .replace(/\u00a0/g, " ")
      .trim()
      .toLowerCase();
  const readRows = (sheetName: string): unknown[][] => {
    const worksheet = workbook.worksheets.find(
      (candidate) => candidate.name.trim() === sheetName.trim(),
    );
    if (!worksheet) return [];
    return Array.from({ length: worksheet.rowCount }, (_, rowIndex) =>
      Array.from(
        { length: worksheet.columnCount },
        (_, columnIndex) => worksheet.getRow(rowIndex + 1).getCell(columnIndex + 1).value,
      ),
    );
  };
  const readHeaders = (rows: unknown[][]) => {
    const map = new Map<number, string>();
    (rows[0] ?? []).forEach((value, column) => {
      const header = normalizeHeader(cellText(value));
      if (header) map.set(column, header);
    });
    return map;
  };

  const required = REQUIRED_COLUMNS[capability];
  const matching = workbook.worksheets
    .map((worksheet) => worksheet.name)
    .find((sheetName) => sheetName.trim() === SHEET_NAME[capability]);
  if (!matching) {
    throw new Error(
      `لم يُعثر على ورقة «${SHEET_NAME[capability]}» — نزّل القالب المعتمد ولا تغيّر اسم ورقة البيانات.`,
    );
  }
  const namedHeaders = Array.from(readHeaders(readRows(matching)).values());
  const missing = required.filter((column) => !namedHeaders.includes(column));
  if (missing.length) {
    throw new Error(
      `ورقة «${SHEET_NAME[capability]}» ينقصها أعمدة إلزامية: ${missing.join("، ")} — نزّل القالب المعتمد ولا تغيّر أسماء الأعمدة.`,
    );
  }

  const sheetRows = readRows(matching);
  const headers = readHeaders(sheetRows);

  const rows: Array<Record<string, string>> = [];
  const rowErrors: string[] = [];
  const seenCodes = new Set<string>();

  for (let rowNumber = 2; rowNumber <= sheetRows.length; rowNumber += 1) {
    const excelRow = sheetRows[rowNumber - 1] ?? [];
    const row: Record<string, string> = {};
    headers.forEach((header, column) => {
      row[header] = cellText(excelRow[column]);
    });
    const meaningful = REQUIRED_CELLS[capability].some((field) => row[field]);
    if (!meaningful) continue;

    rowErrors.push(...validateRow(capability, row, rowNumber));
    const normalizedSubject = row.subject_code?.trim().toUpperCase();
    const normalizedLesson = row.lesson_code?.trim().toUpperCase();
    if (
      guard.expectedSubjectCode &&
      normalizedSubject !== guard.expectedSubjectCode.trim().toUpperCase()
    ) {
      rowErrors.push(
        `الصف ${rowNumber}: subject_code لا يطابق المادة المختارة (${guard.expectedSubjectCode}).`,
      );
    }
    if (
      guard.expectedLessonCode &&
      normalizedLesson !== guard.expectedLessonCode.trim().toUpperCase()
    ) {
      rowErrors.push(
        `الصف ${rowNumber}: lesson_code لا يطابق الدرس المختار (${guard.expectedLessonCode}).`,
      );
    }
    if (guard.requireApproved && row.review_status?.trim() !== "معتمد") {
      rowErrors.push(`الصف ${rowNumber}: review_status يجب أن يكون «معتمد» قبل النشر المباشر.`);
    }
    if (capability === "selfTest" && guard.requireFourChoices && options(row).length !== 4) {
      rowErrors.push(
        `الصف ${rowNumber}: اختبر فهمك في الدرس الذهبي يتطلب أربعة خيارات مكتملة بالضبط.`,
      );
    }
    const code = row.question_code;
    const normalizedCode = code?.trim().toUpperCase();
    if (normalizedCode) {
      if (seenCodes.has(normalizedCode)) {
        rowErrors.push(
          `الصف ${rowNumber}: كود السؤال ${code} مكرر داخل الملف (المقارنة غير حساسة لحالة الأحرف).`,
        );
      }
      seenCodes.add(normalizedCode);
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
    publicFile: new File([JSON.stringify(payload)], PUBLIC_FILE_NAME[capability], {
      type: "application/json",
    }),
    answers: rows.map((row) => toAnswer(capability, row)),
    rowCount: rows.length,
  };
}
