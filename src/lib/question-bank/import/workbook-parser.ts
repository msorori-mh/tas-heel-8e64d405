import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { DEFAULT_IMPORT_LIMITS } from "./limits.ts";
import type { WorkbookParserMetadata } from "./preflight.ts";

export const TRUSTED_PARSER_VERSION = "qb02-workbook-parser-v1" as const;
export type TrustedWorkbookModel = {
  trusted_parser_version: typeof TRUSTED_PARSER_VERSION;
  parser_result_hash: string;
  security_preflight_status: "READY" | "BLOCKED";
  headers: string[];
  rows: Record<string, unknown>[];
  metadata: WorkbookParserMetadata;
};

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += char; index += 1; } else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function rowsToModel(rows: string[][], fileBytes: number): TrustedWorkbookModel {
  const headers = rows[0] ?? [];
  const data = rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  const metadata: WorkbookParserMetadata = {
    csvInjectionCells: rows.flat().some((cell) => /^[\s]*[=+\-@\t\r]/.test(cell)),
    maxCellBytes: Math.max(0, ...rows.flat().map((cell) => Buffer.byteLength(cell, "utf8"))),
  };
  const security_preflight_status = fileBytes > DEFAULT_IMPORT_LIMITS.maxFileBytes ? "BLOCKED" : "READY";
  return {
    trusted_parser_version: TRUSTED_PARSER_VERSION,
    parser_result_hash: hash({ headers, data, metadata }),
    security_preflight_status,
    headers,
    rows: data,
    metadata,
  };
}

/** Parses bytes only; it performs no persistence and exposes parser-observed security evidence. */
export async function parseQuestionBankWorkbook(
  fileName: string,
  bytes: Uint8Array,
): Promise<TrustedWorkbookModel> {
  if (/\.csv$/i.test(fileName)) return rowsToModel(csvRows(Buffer.from(bytes).toString("utf8")), bytes.byteLength);

  const metadata: WorkbookParserMetadata = { zipEntries: 0, uncompressedBytes: 0, maxCellBytes: 0 };
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    metadata.encrypted = true;
    return {
      trusted_parser_version: TRUSTED_PARSER_VERSION,
      parser_result_hash: hash({ fileName, bytes: bytes.byteLength, metadata }),
      security_preflight_status: "BLOCKED",
      headers: [],
      rows: [],
      metadata,
    };
  }
  const entries = Object.values(zip.files);
  metadata.zipEntries = entries.length;
  metadata.uncompressedBytes = entries.reduce((total, entry) => total + (entry as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize! || total, 0);
  metadata.hasMacros = Boolean(zip.file("xl/vbaProject.bin"));
  metadata.hasExternalLinks = entries.some((entry) => /externalLinks|TargetMode="External"/i.test(entry.name));
  metadata.hasPathTraversal = entries.some((entry) => entry.name.split("/").includes(".."));
  metadata.suspiciousMediaPaths = entries.some((entry) => /(?:media|_rels).*\.xml$/i.test(entry.name) && /\.\.\//.test(entry.name));

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as never);
  } catch {
    metadata.encrypted = true;
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet || metadata.encrypted) {
    return {
      trusted_parser_version: TRUSTED_PARSER_VERSION,
      parser_result_hash: hash({ fileName, bytes: bytes.byteLength, metadata }),
      security_preflight_status: "BLOCKED",
      headers: [],
      rows: [],
      metadata,
    };
  }

  metadata.visibleSheetCount = workbook.worksheets.filter((sheet) => sheet.state === "visible").length;
  metadata.hiddenSheetData = workbook.worksheets.some((sheet) => sheet.state !== "visible" && sheet.rowCount > 0);
  metadata.hasMergedDataCells = worksheet.model.merges.length > 0;
  const table: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    if (row.hidden) metadata.hiddenRowData = true;
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      if (worksheet.getColumn(column).hidden) metadata.hiddenColumnData = true;
      if (cell.type === ExcelJS.ValueType.Formula) metadata.hasFormulaCells = true;
      const value = cell.text ?? "";
      metadata.maxCellBytes = Math.max(metadata.maxCellBytes ?? 0, Buffer.byteLength(value, "utf8"));
      values[column - 1] = value;
    });
    table.push(values);
  });
  const model = rowsToModel(table, bytes.byteLength);
  model.metadata = { ...model.metadata, ...metadata };
  model.parser_result_hash = hash({ headers: model.headers, rows: model.rows, metadata: model.metadata });
  model.security_preflight_status =
    model.metadata.encrypted || model.metadata.hasMacros || model.metadata.hasExternalLinks ||
    model.metadata.hasPathTraversal || model.metadata.hasFormulaCells ? "BLOCKED" : "READY";
  return model;
}
