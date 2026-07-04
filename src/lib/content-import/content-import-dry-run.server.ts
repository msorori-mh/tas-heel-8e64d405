/**
 * Server-only lesson content XLSX parsing (exceljs).
 * Dynamic import from server handlers only — never from client components.
 */
import ExcelJS from "exceljs";
import { CONTENT_IMPORT_MAX_FILE_BYTES } from "./content-import-types";
import {
  getContentImportDryRunConfig,
  type ContentImportTemplateKey,
} from "./content-import-templates";
import type { ContentImportParsedSheet } from "./content-import-types";
import {
  cellToImportString,
  isInstructionSheetName,
  isRowEmpty,
  normalizeContentImportHeader,
} from "./content-import-validators";

function pickDataWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  const nonInstruction = workbook.worksheets.filter(
    (sheet) => !isInstructionSheetName(sheet.name),
  );
  if (nonInstruction.length > 0) {
    return nonInstruction[0];
  }
  return workbook.worksheets[0] ?? null;
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
  await workbook.xlsx.load(
    buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );

  const sheet = pickDataWorksheet(workbook);
  if (!sheet) {
    return {
      detectedColumns: [],
      rows: [],
      fileName,
    };
  }

  const headerRow = sheet.getRow(1);
  const headerMap = new Map<number, string>();

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const normalized = normalizeContentImportHeader(cellToImportString(cell.value));
    if (normalized) {
      headerMap.set(colNumber, normalized);
    }
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
