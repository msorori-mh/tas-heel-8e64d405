import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { DEFAULT_IMPORT_LIMITS } from "./limits.ts";
import type { WorkbookParserMetadata } from "./preflight.ts";
import { preflightZipBytes } from "./zip-preflight.ts";
import { MUTATION_HOOKS } from "./mutation-hooks.ts";

const safeXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  processEntities: false,
  htmlEntities: false,
});

export const TRUSTED_PARSER_VERSION = "qb02-workbook-parser-v1" as const;
export type TrustedWorkbookModel = {
  trusted_parser_version: typeof TRUSTED_PARSER_VERSION;
  parser_result_hash: string;
  security_preflight_status: "READY" | "BLOCKED";
  headers: string[];
  rows: Record<string, unknown>[];
  metadata: WorkbookParserMetadata;
  preflight_issues?: unknown[];
};

export const PARSER_SPY = {
  parserInvocations: 0,
  zipPreflightInvocations: 0,
  jsZipInvocations: 0,
  excelJsInvocations: 0,
  adapterInvocations: 0,
  fullDecompressionInvocations: 0,
  worksheetParsingInvocations: 0,
  authorizationFailures: 0,
  reset() {
    this.parserInvocations = 0;
    this.zipPreflightInvocations = 0;
    this.jsZipInvocations = 0;
    this.excelJsInvocations = 0;
    this.adapterInvocations = 0;
    this.fullDecompressionInvocations = 0;
    this.worksheetParsingInvocations = 0;
    this.authorizationFailures = 0;
  },
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
      if (quoted && text[index + 1] === '"') {
        cell += char;
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function rowsToModel(rows: string[][], fileBytes: number): TrustedWorkbookModel {
  const headers = rows[0] ?? [];
  const data = rows
    .slice(1)
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  const metadata: WorkbookParserMetadata = {
    csvInjectionCells: MUTATION_HOOKS.bypassFormulaInjectionGuard
      ? false
      : rows.flat().some((cell) => /^[\s]*[=+\-@\t\r]/.test(cell)),
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

export function isForbiddenRelationshipTarget(targetValue: string): boolean {
  if (!targetValue) return false;
  const raw = targetValue.trim();

  // 1. External URI schemes or absolute/UNC paths
  if (
    /^(https?|ftp|file|javascript|data|mailto):/i.test(raw) ||
    /^\\\\/i.test(raw) ||
    /^\/\//.test(raw) ||
    /^[a-zA-Z]:/i.test(raw)
  ) {
    return true;
  }

  // Decode URI encoding (e.g. %2e%2e -> ..)
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // ignore 2nd decode error
    }
  } catch {
    // ignore 1st decode error
  }

  // 2. Traversal: .. or encoded .. or mixed slashes or nested traversal
  if (
    raw.includes("..") ||
    decoded.includes("..") ||
    /%2e/i.test(raw) ||
    /%252e/i.test(raw) ||
    (raw.includes("\\") && raw.includes("/")) ||
    (decoded.includes("\\") && decoded.includes("/")) ||
    /(\.\.[\\/]|[\\/]\.\.)/.test(raw) ||
    /(\.\.[\\/]|[\\/]\.\.)/.test(decoded)
  ) {
    return true;
  }

  return false;
}

export async function scanOoxmlRelationships(
  zip: JSZip,
): Promise<{ hasExternalLinks: boolean; externalTargets: string[] }> {
  if (MUTATION_HOOKS.disableExternalRelRejection) {
    return { hasExternalLinks: false, externalTargets: [] };
  }

  const externalTargets: string[] = [];
  const relFiles = Object.keys(zip.files).filter(
    (name) => /\.rels$/i.test(name) || name.includes("_rels/"),
  );

  for (const relPath of relFiles) {
    const entry = zip.file(relPath);
    if (!entry) continue;

    try {
      const content = await entry.async("text");
      if (!content || !content.trim()) continue;

      // Fail-closed XML parsing using safeXmlParser
      let parsed: any;
      try {
        parsed = safeXmlParser.parse(content);
      } catch {
        externalTargets.push("MALFORMED_RELS_XML");
        continue;
      }

      if (!parsed || typeof parsed !== "object") {
        externalTargets.push("MALFORMED_RELS_XML");
        continue;
      }

      const relsNode = parsed.Relationships?.Relationship;
      const relsList = Array.isArray(relsNode) ? relsNode : relsNode ? [relsNode] : [];

      for (const rel of relsList) {
        const targetMode = String(rel?.["@_TargetMode"] ?? "").trim();
        const target = String(rel?.["@_Target"] ?? "").trim();

        if (targetMode.toLowerCase() === "external" || isForbiddenRelationshipTarget(target)) {
          externalTargets.push(target || "TargetMode=External");
        }
      }

      // Supplementary regex check for edge-case TargetMode whitespace/quotes
      if (/TargetMode\s*=\s*["']\s*External\s*["']/i.test(content) && relsList.length === 0) {
        externalTargets.push("TargetMode=External");
      }
    } catch {
      externalTargets.push("UNREADABLE_RELS");
    }
  }

  return {
    hasExternalLinks: externalTargets.length > 0,
    externalTargets,
  };
}

/** Parses bytes only; it performs no persistence and exposes parser-observed security evidence. */
export async function parseQuestionBankWorkbook(
  fileName: string,
  bytes: Uint8Array,
): Promise<TrustedWorkbookModel> {
  PARSER_SPY.parserInvocations += 1;

  if (/\.csv$/i.test(fileName)) {
    PARSER_SPY.worksheetParsingInvocations += 1;
    return rowsToModel(csvRows(Buffer.from(bytes).toString("utf8")), bytes.byteLength);
  }

  // STEP 1: Pre-parse ZIP Preflight BEFORE JSZip and ExcelJS
  PARSER_SPY.zipPreflightInvocations += 1;
  const zipPreflight = preflightZipBytes(bytes, fileName);
  if (!zipPreflight.ok) {
    const metadata: WorkbookParserMetadata = {
      zipEntries: zipPreflight.totalEntries,
      uncompressedBytes: zipPreflight.totalUncompressedBytes,
      maxCellBytes: 0,
      hasPathTraversal: zipPreflight.issues.some((i) => i.code === "PATH_TRAVERSAL"),
      encrypted: zipPreflight.issues.some((i) => i.code === "WORKBOOK_ENCRYPTED"),
    };
    return {
      trusted_parser_version: TRUSTED_PARSER_VERSION,
      parser_result_hash: hash({ fileName, bytes: bytes.byteLength, metadata, issues: zipPreflight.issues }),
      security_preflight_status: "BLOCKED",
      headers: [],
      rows: [],
      metadata,
      preflight_issues: zipPreflight.issues,
    };
  }

  // STEP 2: JSZip inspection
  PARSER_SPY.jsZipInvocations += 1;
  const metadata: WorkbookParserMetadata = {
    zipEntries: zipPreflight.totalEntries,
    uncompressedBytes: zipPreflight.totalUncompressedBytes,
    maxCellBytes: 0,
  };

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
    PARSER_SPY.fullDecompressionInvocations += 1;
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

  // STEP 3: OOXML Relationship Scan
  const relScan = await scanOoxmlRelationships(zip);
  if (relScan.hasExternalLinks) {
    metadata.hasExternalLinks = true;
    return {
      trusted_parser_version: TRUSTED_PARSER_VERSION,
      parser_result_hash: hash({ fileName, bytes: bytes.byteLength, metadata, externalTargets: relScan.externalTargets }),
      security_preflight_status: "BLOCKED",
      headers: [],
      rows: [],
      metadata,
    };
  }

  // STEP 4: ExcelJS trusted load
  PARSER_SPY.excelJsInvocations += 1;
  const workbook = new ExcelJS.Workbook();

  try {
    await (workbook.xlsx as any).load(Buffer.from(bytes));
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

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return {
      trusted_parser_version: TRUSTED_PARSER_VERSION,
      parser_result_hash: hash({ fileName, bytes: bytes.byteLength, metadata: { ...metadata, visibleSheetCount: 0 } }),
      security_preflight_status: "BLOCKED",
      headers: [],
      rows: [],
      metadata: { ...metadata, visibleSheetCount: 0 },
    };
  }

  PARSER_SPY.worksheetParsingInvocations += 1;
  const rawRows: string[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const text = cell.text ?? String(cell.value ?? "");
      values.push(text);
    });
    rawRows.push(values);
  });

  const headers = rawRows[0] ?? [];
  const dataRows = rawRows.slice(1);
  const rows = dataRows.map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])),
  );

  metadata.maxCellBytes = Math.max(
    0,
    ...rawRows.flat().map((c) => Buffer.byteLength(c, "utf8")),
  );
  metadata.csvInjectionCells = MUTATION_HOOKS.bypassFormulaInjectionGuard
    ? false
    : rawRows.flat().some((cell) => /^[\s]*[=+\-@\t\r]/.test(cell));

  return {
    trusted_parser_version: TRUSTED_PARSER_VERSION,
    parser_result_hash: hash({ headers, rows, metadata }),
    security_preflight_status: "READY",
    headers,
    rows,
    metadata,
  };
}
