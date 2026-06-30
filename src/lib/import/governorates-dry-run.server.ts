/**
 * Server-only governorates XLSX parsing (exceljs).
 * Import only from server handlers via dynamic import — never from client components.
 */
import ExcelJS from "exceljs";
import {
  GOVERNORATES_ALL_COLUMNS,
  GOVERNORATES_MAX_FILE_BYTES,
  GOVERNORATES_PREVIEW_ROWS,
  GOVERNORATES_SHEET_NAME,
  type GovernoratesColumnKey,
  type GovernoratesDryRunParseResult,
  type GovernoratesRow,
  cellToString,
  isGovernorateRowEmpty,
  normalizeGovernorateHeader,
  validateGovernoratesRows,
} from "./governorates-dry-run.shared";

export async function parseGovernoratesBuffer(
  buffer: Buffer,
  fileName: string,
): Promise<GovernoratesDryRunParseResult> {
  if (buffer.length > GOVERNORATES_MAX_FILE_BYTES) {
    throw new Error(
      `حجم الملف يتجاوز الحد المسموح (${GOVERNORATES_MAX_FILE_BYTES / (1024 * 1024)} MB).`,
    );
  }

  const workbook = new ExcelJS.Workbook();
  // exceljs's load() typing expects a Node Buffer; cast through unknown to
  // bridge @types/node's generic Buffer<ArrayBufferLike> vs exceljs's Buffer.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheet =
    workbook.getWorksheet(GOVERNORATES_SHEET_NAME) ?? workbook.worksheets[0];

  if (!sheet) {
    return {
      columns: [],
      rows: [],
      previewRows: [],
      totalRowCount: 0,
      issues: [
        {
          code: "WRONG_SHEET",
          message: `لم يُعثر على شيت «${GOVERNORATES_SHEET_NAME}» أو أي شيت في الملف.`,
        },
      ],
      fileName,
    };
  }

  const headerRow = sheet.getRow(1);
  const headerMap = new Map<number, GovernoratesColumnKey>();

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const normalized = normalizeGovernorateHeader(cellToString(cell.value));
    if (GOVERNORATES_ALL_COLUMNS.includes(normalized as GovernoratesColumnKey)) {
      headerMap.set(colNumber, normalized as GovernoratesColumnKey);
    }
  });

  const presentColumns = GOVERNORATES_ALL_COLUMNS.filter((col) =>
    [...headerMap.values()].includes(col),
  );

  const rows: GovernoratesRow[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const values = {
      name: "",
      default_track_code: "",
      sort_order: "",
    } satisfies Record<GovernoratesColumnKey, string>;

    headerMap.forEach((col, colNumber) => {
      values[col] = cellToString(row.getCell(colNumber).value);
    });

    if (isGovernorateRowEmpty(values)) return;

    rows.push({
      rowNumber,
      ...values,
    });
  });

  const issues = validateGovernoratesRows(rows, presentColumns);

  return {
    columns: presentColumns,
    rows,
    previewRows: rows.slice(0, GOVERNORATES_PREVIEW_ROWS),
    totalRowCount: rows.length,
    issues,
    fileName,
  };
}
