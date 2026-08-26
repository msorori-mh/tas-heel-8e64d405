/**
 * Server-only lesson content XLSX parsing (exceljs).
 * Dynamic import from server handlers only — never from client components.
 */
import ExcelJS from "exceljs";
import { CONTENT_IMPORT_MAX_FILE_BYTES } from "./content-import-types";
import {
  getContentImportDryRunConfig,
  getContentImportTemplateByKey,
  type ContentImportTemplateKey,
} from "./content-import-templates";
import type { ContentImportParsedSheet } from "./content-import-types";
import {
  cellToImportString,
  isRowEmpty,
  normalizeContentImportHeader,
} from "./content-import-validators";

function normalizedHeadersOf(sheet: ExcelJS.Worksheet): string[] {
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
    const normalized = normalizeContentImportHeader(cellToImportString(cell.value));
    if (normalized) headers.push(normalized);
  });
  return headers;
}

function pickDataWorksheet(
  workbook: ExcelJS.Workbook,
  templateKey: ContentImportTemplateKey,
): ExcelJS.Worksheet {
  const meta = getContentImportTemplateByKey(templateKey);
  const sheet = workbook.worksheets.find(
    (candidate) => candidate.name.trim() === meta.dataSheetName,
  );
  if (!sheet) {
    const available = workbook.worksheets.map((candidate) => `«${candidate.name}»`).join("، ");
    throw new Error(
      `ورقة البيانات المطلوبة «${meta.dataSheetName}» غير موجودة في الملف. الأوراق الموجودة: ${available || "لا توجد أوراق"}. نزّل القالب المعتمد ولا تغيّر أسماء الأوراق.`,
    );
  }

  const present = new Set(normalizedHeadersOf(sheet));
  const missing = getContentImportDryRunConfig(templateKey).requiredColumns.filter(
    (column) => !present.has(column),
  );
  if (missing.length) {
    throw new Error(
      `ورقة «${meta.dataSheetName}» لا تطابق القالب المعتمد؛ الأعمدة الإلزامية المفقودة: ${missing.join("، ")}.`,
    );
  }
  return sheet;
}

export async function parseContentImportBuffer(
  buffer: Buffer,
  fileName: string,
  templateKey: ContentImportTemplateKey,
): Promise<ContentImportParsedSheet> {
  if (buffer.length > CONTENT_IMPORT_MAX_FILE_BYTES) {
    throw new Error(
      `حجم الملف يتجاوز الحد المسموح (${CONTENT_IMPORT_MAX_FILE_BYTES / (1024 * 1024)} MB).`,
    );
  }

  const config = getContentImportDryRunConfig(templateKey);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
  } catch {
    throw new Error(
      "تعذر قراءة ملف XLSX. أعد تنزيل القالب المعتمد واحفظه بصيغة .xlsx دون تشفير أو حماية بكلمة مرور.",
    );
  }

  const sheet = pickDataWorksheet(workbook, templateKey);

  const headerRow = sheet.getRow(1);
  const headerMap = new Map<number, string>();
  const headerLocations = new Map<string, number>();

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const normalized = normalizeContentImportHeader(cellToImportString(cell.value));
    if (!normalized) return;
    const previousColumn = headerLocations.get(normalized);
    if (previousColumn !== undefined) {
      throw new Error(
        `العمود «${normalized}» مكرر في ورقة «${sheet.name}» (العمودان ${previousColumn} و${colNumber}).`,
      );
    }
    headerLocations.set(normalized, colNumber);
    headerMap.set(colNumber, normalized);
  });

  const detectedColumns = [...new Set(headerMap.values())];
  const rows: ContentImportParsedSheet["rows"] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const data: Record<string, string> = {};
    for (const col of config.knownColumns) {
      data[col] = "";
    }

    headerMap.forEach((header, colNumber) => {
      data[header] = cellToImportString(row.getCell(colNumber).value);
    });

    if (isRowEmpty(data)) return;

    rows.push({ rowNumber, data });
  });

  return {
    detectedColumns,
    rows,
    fileName,
  };
}
