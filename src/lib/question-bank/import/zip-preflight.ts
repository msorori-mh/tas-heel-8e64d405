import { DEFAULT_IMPORT_LIMITS } from "./limits.ts";
import { issue, type QbImportIssue } from "./errors.ts";
import { QB_IMPORT_CODES } from "./validation-codes.ts";

export type ZipPreflightResult = {
  ok: boolean;
  issues: QbImportIssue[];
  entryNames: string[];
  totalUncompressedBytes: number;
  totalEntries: number;
  isZip: boolean;
};

export function preflightZipBytes(
  bytes: Uint8Array,
  fileName = "workbook.xlsx",
): ZipPreflightResult {
  const issues: QbImportIssue[] = [];

  const addIssue = (code: keyof typeof QB_IMPORT_CODES) => {
    return issue(code, { file: fileName, stage: "PREFLIGHT_ZIP", source_subsystem: "zip-preflight" });
  };

  // 1. Raw File Size Guard
  if (bytes.byteLength > DEFAULT_IMPORT_LIMITS.maxFileBytes) {
    issues.push(addIssue(QB_IMPORT_CODES.FILE_TOO_LARGE));
  }

  // 2. ZIP Structural Signature Verification (0x50, 0x4b)
  if (
    bytes.byteLength < 22 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b
  ) {
    return {
      ok: false,
      issues: [
        ...(issues.length > 0 ? issues : []),
        issue(QB_IMPORT_CODES.FILE_TYPE_UNSUPPORTED, { file: fileName, stage: "PREFLIGHT_RAW", source_subsystem: "zip-preflight" }),
      ],
      entryNames: [],
      totalUncompressedBytes: 0,
      totalEntries: 0,
      isZip: false,
    };
  }

  // 3. Search End of Central Directory (EOCD) signature: 0x06054b50
  let eocdOffset = -1;
  const maxSearch = Math.min(bytes.byteLength, 65557);
  for (let i = bytes.byteLength - 22; i >= bytes.byteLength - maxSearch; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    return {
      ok: false,
      issues: [
        ...(issues.length > 0 ? issues : []),
        addIssue(QB_IMPORT_CODES.ZIP_MISSING_EOCD),
      ],
      entryNames: [],
      totalUncompressedBytes: 0,
      totalEntries: 0,
      isZip: false,
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  // EOCD offset & size boundary validation
  if (cdOffset > eocdOffset || cdOffset + cdSize > bytes.byteLength) {
    issues.push(addIssue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY));
    return {
      ok: false,
      issues,
      entryNames: [],
      totalUncompressedBytes: 0,
      totalEntries,
      isZip: true,
    };
  }

  // Central directory exact end check
  if (cdOffset + cdSize !== eocdOffset) {
    issues.push(addIssue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY));
  }

  if (totalEntries > DEFAULT_IMPORT_LIMITS.maxZipEntries) {
    issues.push(addIssue(QB_IMPORT_CODES.ZIP_ENTRY_LIMIT));
  }

  const entryNames: string[] = [];
  const seenEntries = new Set<string>();
  const occupiedRanges: Array<[number, number]> = [];
  let totalUncompressedBytes = 0;
  let parsedEntriesCount = 0;
  let offset = cdOffset;
  const decoder = new TextDecoder("utf-8");

  while (offset < cdOffset + cdSize) {
    if (offset + 46 > bytes.byteLength) {
      issues.push(addIssue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY));
      return {
        ok: false,
        issues,
        entryNames: [],
        totalUncompressedBytes,
        totalEntries,
        isZip: true,
      };
    }

    const sig = view.getUint32(offset, true);
    if (sig !== 0x02014b50) {
      issues.push(addIssue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY));
      return {
        ok: false,
        issues,
        entryNames: [],
        totalUncompressedBytes,
        totalEntries,
        isZip: true,
      };
    }

    parsedEntriesCount++;
    const flag = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 20, true);
    const uncompSize = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const recordSize = 46 + nameLen + extraLen + commentLen;
    if (offset + recordSize > bytes.byteLength || offset + recordSize > cdOffset + cdSize) {
      issues.push(addIssue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY));
      return {
        ok: false,
        issues,
        entryNames: [],
        totalUncompressedBytes,
        totalEntries,
        isZip: true,
      };
    }

    // Local Header validation
    if (localHeaderOffset + 30 > bytes.byteLength) {
      issues.push(addIssue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY));
      return {
        ok: false,
        issues,
        entryNames: [],
        totalUncompressedBytes: 0,
        totalEntries,
        isZip: true,
      };
    }

    const localSig = view.getUint32(localHeaderOffset, true);
    if (localSig !== 0x04034b50) {
      issues.push(addIssue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY));
      return {
        ok: false,
        issues,
        entryNames: [],
        totalUncompressedBytes: 0,
        totalEntries,
        isZip: true,
      };
    }

    const localFlag = view.getUint16(localHeaderOffset + 6, true);
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compSize;

    if (dataStart > bytes.byteLength || dataEnd > bytes.byteLength) {
      issues.push(addIssue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY));
      return {
        ok: false,
        issues,
        entryNames: [],
        totalUncompressedBytes: 0,
        totalEntries,
        isZip: true,
      };
    }

    // Local vs Central flag check
    if ((localFlag & 1) !== (flag & 1)) {
      issues.push(addIssue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY));
    }

    // Local vs Central filename length / bytes check
    const centralNameBytes = bytes.subarray(offset + 46, offset + 46 + nameLen);
    if (localHeaderOffset + 30 + localNameLen > bytes.byteLength) {
      issues.push(addIssue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY));
      return {
        ok: false,
        issues,
        entryNames: [],
        totalUncompressedBytes: 0,
        totalEntries,
        isZip: true,
      };
    }
    const localNameBytes = bytes.subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localNameLen);
    if (nameLen !== localNameLen || !centralNameBytes.every((b, idx) => b === localNameBytes[idx])) {
      issues.push(addIssue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY));
    }

    // Overlapping entries check
    for (const [start, end] of occupiedRanges) {
      if (Math.max(start, dataStart) < Math.min(end, dataEnd)) {
        issues.push(addIssue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY));
        break;
      }
    }
    occupiedRanges.push([dataStart, dataEnd]);

    // Bit 0 set = encrypted entry (in central or local header)
    if ((flag & 1) !== 0 || (localFlag & 1) !== 0) {
      issues.push(issue(QB_IMPORT_CODES.WORKBOOK_ENCRYPTED, { file: fileName, stage: "PREFLIGHT_ZIP", source_subsystem: "workbook-parser" }));
    }

    // Check single entry declared size limit
    if (uncompSize > DEFAULT_IMPORT_LIMITS.maxSingleEntryUncompressedBytes) {
      issues.push(addIssue(QB_IMPORT_CODES.ZIP_DECLARED_SIZE_LIMIT));
    }

    totalUncompressedBytes += uncompSize;

    // Check compression ratio bomb
    if (
      compSize > 0 &&
      uncompSize > 1_000_000 &&
      uncompSize / compSize > DEFAULT_IMPORT_LIMITS.maxCompressionRatio
    ) {
      issues.push(addIssue(QB_IMPORT_CODES.ZIP_BOMB_SUSPECTED));
    }

    const rawName = decoder.decode(centralNameBytes);

    let decodedName = rawName;
    try {
      let prev = "";
      let depth = 0;
      while (decodedName !== prev && depth < 3) {
        prev = decodedName;
        decodedName = decodeURIComponent(decodedName);
        depth++;
      }
    } catch {
      // Keep best-effort decoded string if URI malformed
    }

    // NUL or control chars -> MALFORMED_UNICODE
    const hasControlChar = /[\0\x01-\x1f\x7f]/.test(rawName) || /[\0\x01-\x1f\x7f]/.test(decodedName);
    if (hasControlChar) {
      issues.push(issue(QB_IMPORT_CODES.MALFORMED_UNICODE, { file: fileName, stage: "PREFLIGHT_OOXML", source_subsystem: "unicode" }));
    }

    // Absolute path check
    if (
      rawName.startsWith("/") ||
      rawName.startsWith("\\") ||
      decodedName.startsWith("/") ||
      decodedName.startsWith("\\") ||
      /^[a-zA-Z]:/.test(rawName) ||
      /^[a-zA-Z]:/.test(decodedName)
    ) {
      issues.push(addIssue(QB_IMPORT_CODES.ZIP_ABSOLUTE_PATH));
    }

    // Path traversal check
    if (
      rawName.includes("..") ||
      decodedName.includes("..") ||
      /%2e/i.test(rawName) ||
      /%252e/i.test(rawName) ||
      (rawName.includes("\\") && rawName.includes("/")) ||
      (decodedName.includes("\\") && decodedName.includes("/")) ||
      /(\.\.[\\/]|[\\/]\.\.)/.test(rawName) ||
      /(\.\.[\\/]|[\\/]\.\.)/.test(decodedName)
    ) {
      issues.push(addIssue(QB_IMPORT_CODES.PATH_TRAVERSAL));
    }

    // Check duplicate ZIP entries (exact and normalized)
    const normalizedEntryName = rawName.replace(/\/+/g, "/").toLowerCase();
    if (seenEntries.has(rawName) || seenEntries.has(normalizedEntryName)) {
      issues.push(addIssue(QB_IMPORT_CODES.ZIP_DUPLICATE_ENTRY));
    } else {
      seenEntries.add(rawName);
      seenEntries.add(normalizedEntryName);
    }

    entryNames.push(rawName);
    offset += recordSize;
  }

  // Declared vs actual count check
  if (parsedEntriesCount !== totalEntries) {
    issues.push(addIssue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY));
  }

  if (totalUncompressedBytes > DEFAULT_IMPORT_LIMITS.maxUncompressedBytes) {
    issues.push(addIssue(QB_IMPORT_CODES.ZIP_TOTAL_SIZE_LIMIT));
  }

  const hasBlocking = issues.some((item) => item.file_blocking || item.row_blocking);

  return {
    ok: !hasBlocking,
    issues,
    entryNames,
    totalUncompressedBytes,
    totalEntries,
    isZip: true,
  };
}
