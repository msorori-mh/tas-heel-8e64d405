import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { DEFAULT_IMPORT_LIMITS } from "./limits.ts";
import type { WorkbookParserMetadata } from "./preflight.ts";
import { preflightZipBytes } from "./zip-preflight.ts";
import { issue } from "./errors.ts";
import { QB_IMPORT_CODES } from "./validation-codes.ts";

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

  // Recursive URI decode (up to 3 times) to handle double encoding
  let decoded = raw;
  try {
    let prev = "";
    let depth = 0;
    while (decoded !== prev && depth < 3) {
      prev = decoded;
      decoded = decodeURIComponent(decoded);
      depth++;
    }
  } catch {
    // ignore decode errors
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
): Promise<{ hasExternalLinks: boolean; externalTargets: string[]; invalidStructure: boolean }> {
  const externalTargets: string[] = [];
  let invalidStructure = false;
  const relFiles = Object.keys(zip.files).filter(
    (name) => /\.rels$/i.test(name) || name.includes("_rels/"),
  );

  for (const relPath of relFiles) {
    const entry = zip.file(relPath);
    if (!entry) continue;

    try {
      // Check entry size before reading full string (max 512 KB per .rels)
      const rawBytes = await entry.async("uint8array");
      if (rawBytes.byteLength > 524_288) {
        externalTargets.push("OVERSIZED_RELS_ENTRY");
        continue;
      }

      const content = new TextDecoder("utf-8").decode(rawBytes);
      if (!content || !content.trim()) continue;

      // Reject DTD and XXE entities before XML parsing
      if (/<!DOCTYPE/i.test(content) || /<!ENTITY/i.test(content)) {
        externalTargets.push("DTD_XXE_ATTEMPT");
        continue;
      }

      // Fail-closed XML parsing using safeXmlParser ONLY (no regex fallback!)
      let parsed: any;
      try {
        parsed = safeXmlParser.parse(content);
      } catch {
        externalTargets.push("MALFORMED_RELS_XML");
        invalidStructure = true;
        continue;
      }

      if (!parsed || typeof parsed !== "object") {
        externalTargets.push("MALFORMED_RELS_XML");
        invalidStructure = true;
        continue;
      }

      // Root element verification: Must be Relationships
      const rootKeys = Object.keys(parsed).filter((k) => k !== "?xml");
      if (rootKeys.length !== 1 || rootKeys[0] !== "Relationships") {
        externalTargets.push("OOXML_RELATIONSHIP_STRUCTURE_INVALID");
        invalidStructure = true;
        continue;
      }

      const relsObj = parsed.Relationships;
      if (relsObj === null || relsObj === undefined || typeof relsObj !== "object") {
        externalTargets.push("OOXML_RELATIONSHIP_STRUCTURE_INVALID");
        invalidStructure = true;
        continue;
      }

      // Check child keys inside Relationships: valid empty container has no non-attribute keys
      const childKeys = Object.keys(relsObj).filter((k) => !k.startsWith("@_"));
      if (childKeys.length === 0) {
        // Valid empty Relationships container
        continue;
      }

      if (childKeys.some((k) => k !== "Relationship")) {
        externalTargets.push("OOXML_RELATIONSHIP_STRUCTURE_INVALID");
        invalidStructure = true;
        continue;
      }

      const relsNode = relsObj.Relationship;
      const relsList = Array.isArray(relsNode) ? relsNode : [relsNode];

      for (const rel of relsList) {
        if (!rel || typeof rel !== "object") {
          externalTargets.push("OOXML_RELATIONSHIP_STRUCTURE_INVALID");
          invalidStructure = true;
          continue;
        }

        const target = rel?.["@_Target"];
        const id = rel?.["@_Id"];

        if (target === undefined || target === null || id === undefined || id === null) {
          externalTargets.push("OOXML_RELATIONSHIP_STRUCTURE_INVALID");
          invalidStructure = true;
          continue;
        }

        const targetStr = String(target).trim();
        const targetMode = String(rel?.["@_TargetMode"] ?? "").trim();

        if (targetMode.toLowerCase() === "external" || isForbiddenRelationshipTarget(targetStr)) {
          externalTargets.push(targetStr || "TargetMode=External");
        }
      }
    } catch {
      externalTargets.push("UNREADABLE_RELS");
      invalidStructure = true;
    }
  }

  return {
    hasExternalLinks: externalTargets.length > 0,
    externalTargets,
    invalidStructure,
  };
}

/** Parses bytes only; it performs no persistence and exposes parser-observed security evidence. */
export async function parseQuestionBankWorkbook(
  fileName: string,
  bytes: Uint8Array,
  externalScanner: typeof scanOoxmlRelationships = scanOoxmlRelationships,
): Promise<TrustedWorkbookModel> {
  if (/\.csv$/i.test(fileName)) {
    return rowsToModel(csvRows(Buffer.from(bytes).toString("utf8")), bytes.byteLength);
  }

  // STEP 1: Pre-parse ZIP Preflight BEFORE JSZip and ExcelJS
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
  const metadata: WorkbookParserMetadata = {
    zipEntries: zipPreflight.totalEntries,
    uncompressedBytes: zipPreflight.totalUncompressedBytes,
    maxCellBytes: 0,
  };

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

  // STEP 3: OOXML Relationship Scan
  const relScan = await externalScanner(zip);
  if (relScan.hasExternalLinks || relScan.invalidStructure) {
    metadata.hasExternalLinks = true;
    const isStructureInvalid = relScan.externalTargets.includes("OOXML_RELATIONSHIP_STRUCTURE_INVALID");
    const preflight_issues = [
      issue(
        isStructureInvalid
          ? QB_IMPORT_CODES.OOXML_RELATIONSHIP_STRUCTURE_INVALID
          : QB_IMPORT_CODES.EXTERNAL_LINK,
        { file: fileName },
      ),
    ];
    return {
      trusted_parser_version: TRUSTED_PARSER_VERSION,
      parser_result_hash: hash({ fileName, bytes: bytes.byteLength, metadata, externalTargets: relScan.externalTargets }),
      security_preflight_status: "BLOCKED",
      headers: [],
      rows: [],
      metadata,
      preflight_issues,
    };
  }

  // STEP 4: ExcelJS trusted load
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
  metadata.csvInjectionCells = rawRows.flat().some((cell) => /^[\s]*[=+\-@\t\r]/.test(cell));

  return {
    trusted_parser_version: TRUSTED_PARSER_VERSION,
    parser_result_hash: hash({ headers, rows, metadata }),
    security_preflight_status: "READY",
    headers,
    rows,
    metadata,
  };
}
