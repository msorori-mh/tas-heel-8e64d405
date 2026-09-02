export const MINISTERIAL_PACKAGE_CONTRACT_VERSION = "ministerial_track_package_v1" as const;

export type MinisterialPackageTrack = "sanaa" | "aden";

export type MinisterialPackageQuestion = {
  question_text: string;
  options: Array<{ option_code: "A" | "B" | "C" | "D"; body: string }>;
  correct_option_code: "A" | "B" | "C" | "D" | null;
  model_answer: string;
  explanation: string;
  display_order: number;
  marks: number;
};

export type MinisterialPackageModel = {
  model_label: string;
  academic_year: number;
  variant_code: string;
  worksheet_name: string;
  declared_question_count: number;
  questions: MinisterialPackageQuestion[];
};

export type MinisterialTrackPackage = {
  contract_version: typeof MINISTERIAL_PACKAGE_CONTRACT_VERSION;
  track_code: MinisterialPackageTrack;
  subject_code: string;
  subject_name: string;
  source_filename: string;
  source_sha256: string;
  models: MinisterialPackageModel[];
};

export const MINISTERIAL_INDEX_SHEET = "📋 الفهرس";
export const MINISTERIAL_INDEX_HEADERS = [
  "اسم النموذج",
  "السنة",
  "المادة",
  "عدد الأسئلة",
  "منشور",
  "اسم الورقة",
] as const;

export const SANAA_QUESTION_HEADERS = [
  "نص السؤال",
  "الخيار أ",
  "الخيار ب",
  "الخيار ج",
  "الخيار د",
  "الإجابة الصحيحة",
  "الشرح",
  "ترتيب العرض",
] as const;

export const ADEN_QUESTION_HEADERS = [
  "نص السؤال",
  "الإجابة النموذجية",
  "الشرح",
  "ترتيب العرض",
] as const;

const MAX_MODELS = 50;
const MAX_QUESTIONS_PER_MODEL = 500;
const MAX_TOTAL_QUESTIONS = 5_000;
const MAX_TEXT_LENGTH = 20_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

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

function normalizeHeader(value: unknown): string {
  return cellText(value)
    .replace(/\*/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedArabic(value: string): string {
  return value
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parsePositiveInteger(value: unknown, label: string, context: string): number {
  const parsed = Number(cellText(value));
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${context}: «${label}» يجب أن يكون عددًا صحيحًا موجبًا.`);
  }
  return parsed;
}

function normalizeCorrectOption(value: unknown, context: string): "A" | "B" | "C" | "D" {
  const normalized = cellText(value).trim().toUpperCase();
  const aliases: Record<string, "A" | "B" | "C" | "D"> = {
    A: "A",
    أ: "A",
    ا: "A",
    "1": "A",
    B: "B",
    ب: "B",
    "2": "B",
    C: "C",
    ج: "C",
    "3": "C",
    D: "D",
    د: "D",
    "4": "D",
  };
  const option = aliases[normalized];
  if (!option) {
    throw new Error(`${context}: الإجابة الصحيحة يجب أن تكون أ أو ب أو ج أو د.`);
  }
  return option;
}

function assertText(value: string, label: string, context: string): string {
  if (!value) throw new Error(`${context}: «${label}» إلزامي.`);
  if (value.length > MAX_TEXT_LENGTH) {
    throw new Error(`${context}: «${label}» يتجاوز الحد الأقصى (${MAX_TEXT_LENGTH} حرف).`);
  }
  return value;
}

function findHeaderRow(
  worksheet: {
    rowCount: number;
    columnCount: number;
    getRow: (row: number) => { getCell: (column: number) => { value: unknown } };
  },
  requiredHeaders: readonly string[],
): { rowNumber: number; columns: Map<string, number> } {
  const scanUntil = Math.min(worksheet.rowCount, 12);
  for (let rowNumber = 1; rowNumber <= scanUntil; rowNumber += 1) {
    const columns = new Map<string, number>();
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      const header = normalizeHeader(worksheet.getRow(rowNumber).getCell(column).value);
      if (header) columns.set(header, column);
    }
    if (requiredHeaders.every((header) => columns.has(header))) return { rowNumber, columns };
  }
  throw new Error(`لم يُعثر على صف الأعمدة المعتمد: ${requiredHeaders.join("، ")}.`);
}

function rowValue(
  worksheet: { getRow: (row: number) => { getCell: (column: number) => { value: unknown } } },
  rowNumber: number,
  columns: Map<string, number>,
  header: string,
): string {
  const column = columns.get(header);
  return column ? cellText(worksheet.getRow(rowNumber).getCell(column).value) : "";
}

function assertExactHeaders(
  columns: Map<string, number>,
  expectedHeaders: readonly string[],
  context: string,
) {
  const expected = new Set<string>(expectedHeaders);
  const unexpected = [...columns.keys()].filter((header) => !expected.has(header));
  if (unexpected.length > 0 || columns.size !== expected.size) {
    throw new Error(
      `${context}: يجب استخدام أعمدة القالب فقط. الأعمدة غير المعتمدة: ${unexpected.join("، ") || "تكرار أو عمود فارغ الاسم"}.`,
    );
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const stableBytes = new Uint8Array(bytes.byteLength);
  stableBytes.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", stableBytes.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function excelModule() {
  const module = await import("exceljs");
  return (
    "Workbook" in module ? module : (module as { default: typeof module }).default
  ) as typeof module;
}

export async function parseMinisterialPackageWorkbook(
  file: File,
  input: {
    trackCode: MinisterialPackageTrack;
    subjectCode: string;
    subjectName: string;
  },
): Promise<MinisterialTrackPackage> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("يُقبل ملف XLSX فقط.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("ملف الاستيراد فارغ.");
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("حجم ملف الاستيراد يتجاوز 25MB.");

  const ExcelJS = await excelModule();
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (error) {
    throw new Error(
      `تعذرت قراءة ملف XLSX. تأكد من استخدام القالب المعتمد (${error instanceof Error ? error.message : "ملف غير صالح"}).`,
    );
  }

  const indexSheet = workbook.worksheets.find(
    (sheet) => sheet.name.trim() === MINISTERIAL_INDEX_SHEET,
  );
  if (!indexSheet) throw new Error(`ورقة «${MINISTERIAL_INDEX_SHEET}» مفقودة.`);
  const indexHeader = findHeaderRow(indexSheet, MINISTERIAL_INDEX_HEADERS);
  assertExactHeaders(indexHeader.columns, MINISTERIAL_INDEX_HEADERS, "ورقة الفهرس");
  const indexRows: Array<{
    rowNumber: number;
    modelLabel: string;
    year: number;
    worksheetName: string;
    declaredCount: number;
  }> = [];
  const seenSheets = new Set<string>();

  for (
    let rowNumber = indexHeader.rowNumber + 1;
    rowNumber <= indexSheet.rowCount;
    rowNumber += 1
  ) {
    const modelLabel = rowValue(indexSheet, rowNumber, indexHeader.columns, "اسم النموذج");
    const worksheetName = rowValue(indexSheet, rowNumber, indexHeader.columns, "اسم الورقة");
    if (!modelLabel && !worksheetName) continue;
    const context = `الفهرس، الصف ${rowNumber}`;
    assertText(modelLabel, "اسم النموذج", context);
    assertText(worksheetName, "اسم الورقة", context);
    const subjectName = rowValue(indexSheet, rowNumber, indexHeader.columns, "المادة");
    if (
      subjectName &&
      normalizedArabic(subjectName) !== normalizedArabic(input.subjectName) &&
      subjectName.trim().toLowerCase() !== input.subjectCode.trim().toLowerCase()
    ) {
      throw new Error(
        `${context}: المادة «${subjectName}» لا تطابق المادة المختارة «${input.subjectName}».`,
      );
    }
    const published = rowValue(indexSheet, rowNumber, indexHeader.columns, "منشور");
    if (published && !["لا", "no", "false", "0"].includes(published.trim().toLowerCase())) {
      throw new Error(`${context}: الاستيراد ينشئ مسودة فقط؛ يجب أن تكون قيمة «منشور» = لا.`);
    }
    const year = parsePositiveInteger(
      rowValue(indexSheet, rowNumber, indexHeader.columns, "السنة"),
      "السنة",
      context,
    );
    if (year < 2000 || year > 2100)
      throw new Error(`${context}: السنة يجب أن تكون بين 2000 و2100.`);
    const declaredCount = parsePositiveInteger(
      rowValue(indexSheet, rowNumber, indexHeader.columns, "عدد الأسئلة"),
      "عدد الأسئلة",
      context,
    );
    if (seenSheets.has(worksheetName))
      throw new Error(`${context}: اسم الورقة «${worksheetName}» مكرر.`);
    seenSheets.add(worksheetName);
    indexRows.push({ rowNumber, modelLabel, year, worksheetName, declaredCount });
  }

  if (indexRows.length === 0) throw new Error("الفهرس لا يحتوي أي نموذج.");
  if (indexRows.length > MAX_MODELS)
    throw new Error(`الملف يتجاوز الحد الأقصى (${MAX_MODELS} نموذجًا).`);

  const groups = new Map<number, typeof indexRows>();
  indexRows.forEach((row) => groups.set(row.year, [...(groups.get(row.year) ?? []), row]));
  const expectedQuestionHeaders =
    input.trackCode === "sanaa" ? SANAA_QUESTION_HEADERS : ADEN_QUESTION_HEADERS;
  let totalQuestions = 0;
  const models: MinisterialPackageModel[] = [];

  for (const indexRow of indexRows) {
    const worksheet = workbook.worksheets.find(
      (sheet) => sheet.name.trim() === indexRow.worksheetName.trim(),
    );
    if (!worksheet) {
      throw new Error(`الفهرس يشير إلى ورقة غير موجودة: «${indexRow.worksheetName}».`);
    }
    let header: ReturnType<typeof findHeaderRow>;
    try {
      header = findHeaderRow(worksheet, expectedQuestionHeaders);
      assertExactHeaders(
        header.columns,
        expectedQuestionHeaders,
        `ورقة «${indexRow.worksheetName}»`,
      );
    } catch {
      throw new Error(
        `ورقة «${indexRow.worksheetName}» لا تطابق قالب ${input.trackCode === "sanaa" ? "صنعاء (اختيار متعدد)" : "عدن (إجابة نصية)"}.`,
      );
    }
    const questions: MinisterialPackageQuestion[] = [];
    const seenOrders = new Set<number>();
    for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const questionText = rowValue(worksheet, rowNumber, header.columns, "نص السؤال");
      if (!questionText) continue;
      const context = `ورقة «${indexRow.worksheetName}»، الصف ${rowNumber}`;
      assertText(questionText, "نص السؤال", context);
      const displayOrder = parsePositiveInteger(
        rowValue(worksheet, rowNumber, header.columns, "ترتيب العرض"),
        "ترتيب العرض",
        context,
      );
      if (seenOrders.has(displayOrder))
        throw new Error(`${context}: ترتيب العرض ${displayOrder} مكرر.`);
      seenOrders.add(displayOrder);
      const explanation = rowValue(worksheet, rowNumber, header.columns, "الشرح");
      if (explanation.length > MAX_TEXT_LENGTH) throw new Error(`${context}: الشرح طويل جدًا.`);

      if (input.trackCode === "sanaa") {
        const optionTexts = ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"].map((label) =>
          assertText(rowValue(worksheet, rowNumber, header.columns, label), label, context),
        );
        const correctOption = normalizeCorrectOption(
          rowValue(worksheet, rowNumber, header.columns, "الإجابة الصحيحة"),
          context,
        );
        questions.push({
          question_text: questionText,
          options: optionTexts.map((body, index) => ({
            option_code: (["A", "B", "C", "D"] as const)[index],
            body,
          })),
          correct_option_code: correctOption,
          model_answer: optionTexts[["A", "B", "C", "D"].indexOf(correctOption)],
          explanation,
          display_order: displayOrder,
          marks: 1,
        });
      } else {
        const modelAnswer = assertText(
          rowValue(worksheet, rowNumber, header.columns, "الإجابة النموذجية"),
          "الإجابة النموذجية",
          context,
        );
        questions.push({
          question_text: questionText,
          options: [],
          correct_option_code: null,
          model_answer: modelAnswer,
          explanation,
          display_order: displayOrder,
          marks: 1,
        });
      }
    }
    questions.sort((left, right) => left.display_order - right.display_order);
    if (questions.length !== indexRow.declaredCount) {
      throw new Error(
        `ورقة «${indexRow.worksheetName}»: عدد الأسئلة الفعلي (${questions.length}) لا يطابق الفهرس (${indexRow.declaredCount}).`,
      );
    }
    if (questions.length > MAX_QUESTIONS_PER_MODEL) {
      throw new Error(`ورقة «${indexRow.worksheetName}» تتجاوز ${MAX_QUESTIONS_PER_MODEL} سؤال.`);
    }
    totalQuestions += questions.length;
    if (totalQuestions > MAX_TOTAL_QUESTIONS) {
      throw new Error(`الحزمة تتجاوز الحد الأقصى (${MAX_TOTAL_QUESTIONS} سؤال).`);
    }
    const yearGroup = groups.get(indexRow.year) ?? [];
    const position = yearGroup.findIndex(
      (candidate) => candidate.worksheetName === indexRow.worksheetName,
    );
    const variantCode =
      yearGroup.length === 1 ? "main" : `m${String(position + 1).padStart(2, "0")}`;
    models.push({
      model_label: indexRow.modelLabel,
      academic_year: indexRow.year,
      variant_code: variantCode,
      worksheet_name: indexRow.worksheetName,
      declared_question_count: indexRow.declaredCount,
      questions,
    });
  }

  return {
    contract_version: MINISTERIAL_PACKAGE_CONTRACT_VERSION,
    track_code: input.trackCode,
    subject_code: input.subjectCode.trim().toLowerCase(),
    subject_name: input.subjectName.trim(),
    source_filename: file.name,
    source_sha256: await sha256Hex(bytes),
    models,
  };
}

function applyHeaderStyle(row: {
  eachCell: (
    cb: (cell: { font: unknown; fill: unknown; alignment: unknown; border: unknown }) => void,
  ) => void;
}) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF253B80" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD7DBE8" } },
      left: { style: "thin", color: { argb: "FFD7DBE8" } },
      bottom: { style: "thin", color: { argb: "FFD7DBE8" } },
      right: { style: "thin", color: { argb: "FFD7DBE8" } },
    };
  });
}

export async function buildMinisterialPackageTemplate(input: {
  trackCode: MinisterialPackageTrack;
  subjectCode: string;
  subjectName: string;
}): Promise<Uint8Array> {
  const ExcelJS = await excelModule();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "تمكين الطالب";
  workbook.subject = `استيراد نماذج وزارية — ${input.trackCode === "sanaa" ? "صنعاء" : "عدن"}`;
  workbook.created = new Date(0);
  workbook.modified = new Date(0);

  const index = workbook.addWorksheet(MINISTERIAL_INDEX_SHEET, { views: [{ rightToLeft: true }] });
  index.addRow([`قالب استيراد — اختبارات مسار ${input.trackCode === "sanaa" ? "صنعاء" : "عدن"}`]);
  index.mergeCells("A1:F1");
  index.getRow(1).height = 28;
  index.getCell("A1").font = { bold: true, size: 15, color: { argb: "FF17203B" } };
  index.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  index.addRow([]);
  const indexHeader = index.addRow([...MINISTERIAL_INDEX_HEADERS]);
  applyHeaderStyle(indexHeader);
  index.addRow(["نموذج تجريبي", 2025, input.subjectName, 2, "لا", "نموذج_1"]);
  index.columns = [
    { width: 32 },
    { width: 12 },
    { width: 24 },
    { width: 14 },
    { width: 12 },
    { width: 22 },
  ];
  index.autoFilter = "A3:F3";
  index.views = [{ state: "frozen", ySplit: 3, rightToLeft: true }];

  const questions = workbook.addWorksheet("نموذج_1", { views: [{ rightToLeft: true }] });
  questions.addRow(["اسم النموذج: نموذج تجريبي"]);
  questions.mergeCells(`A1:${input.trackCode === "sanaa" ? "H" : "D"}1`);
  questions.addRow([
    `المسار: ${input.trackCode === "sanaa" ? "صنعاء" : "عدن"} | المادة: ${input.subjectName} (${input.subjectCode}) | الحالة: مسودة`,
  ]);
  questions.mergeCells(`A2:${input.trackCode === "sanaa" ? "H" : "D"}2`);
  questions.addRow([]);
  if (input.trackCode === "sanaa") {
    const header = questions.addRow([...SANAA_QUESTION_HEADERS]);
    applyHeaderStyle(header);
    questions.addRow(["مثال: 2 + 2 = ؟", "3", "4", "5", "6", "ب", "الإجابة الصحيحة هي 4.", 1]);
    questions.addRow([
      "اكتب السؤال الثاني هنا",
      "الخيار الأول",
      "الخيار الثاني",
      "الخيار الثالث",
      "الخيار الرابع",
      "أ",
      "شرح اختياري",
      2,
    ]);
    questions.columns = [
      { width: 48 },
      { width: 25 },
      { width: 25 },
      { width: 25 },
      { width: 25 },
      { width: 18 },
      { width: 44 },
      { width: 14 },
    ];
    for (let rowNumber = 5; rowNumber <= 504; rowNumber += 1) {
      questions.getCell(rowNumber, 6).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: ['"أ,ب,ج,د"'],
      };
    }
  } else {
    const header = questions.addRow([...ADEN_QUESTION_HEADERS]);
    applyHeaderStyle(header);
    questions.addRow(["اكتب السؤال الأول هنا", "اكتب الإجابة النموذجية هنا", "شرح اختياري", 1]);
    questions.addRow(["اكتب السؤال الثاني هنا", "اكتب الإجابة النموذجية هنا", "شرح اختياري", 2]);
    questions.columns = [{ width: 58 }, { width: 58 }, { width: 44 }, { width: 14 }];
  }
  questions.getRow(1).font = { bold: true, size: 14 };
  questions.getRow(2).font = { color: { argb: "FF5C647A" } };
  questions.views = [{ state: "frozen", ySplit: 4, rightToLeft: true }];
  questions.eachRow((row, rowNumber) => {
    if (rowNumber >= 5) row.alignment = { vertical: "top", wrapText: true, horizontal: "right" };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
