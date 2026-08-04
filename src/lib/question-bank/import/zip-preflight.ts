import { DEFAULT_IMPORT_LIMITS } from "./limits.ts";
import { issue, type QbImportIssue } from "./errors.ts";
import { QB_IMPORT_CODES } from "./validation-codes.ts";
import { MUTATION_HOOKS } from "./mutation-hooks.ts";

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

  if (MUTATION_HOOKS.disablePreparseZipLimits) {
    return {
      ok: true,
      issues: [],
      entryNames: [],
      totalUncompressedBytes: 0,
      totalEntries: 0,
      isZip: true,
    };
  }

  // 1. Raw File Size Guard
  if (bytes.byteLength > DEFAULT_IMPORT_LIMITS.maxFileBytes) {
    issues.push(issue(QB_IMPORT_CODES.FILE_TOO_LARGE, { file: fileName }));
  }

  // 2. ZIP Structural Signature Verification
  if (
    bytes.byteLength < 22 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b
  ) {
    return {
      ok: false,
      issues: [
        ...(issues.length > 0 ? issues : []),
        issue(QB_IMPORT_CODES.FILE_TYPE_UNSUPPORTED, { file: fileName }),
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
        issue(QB_IMPORT_CODES.ZIP_MISSING_EOCD, { file: fileName }),
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

  if (cdOffset + cdSize > bytes.byteLength) {
    issues.push(issue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY, { file: fileName }));
    return {
      ok: false,
      issues,
      entryNames: [],
      totalUncompressedBytes: 0,
      totalEntries,
      isZip: true,
    };
  }

  if (totalEntries > DEFAULT_IMPORT_LIMITS.maxZipEntries) {
    issues.push(issue(QB_IMPORT_CODES.ZIP_ENTRY_LIMIT, { file: fileName }));
  }

  const entryNames: string[] = [];
  const seenEntries = new Set<string>();
  let totalUncompressedBytes = 0;
  let offset = cdOffset;
  const decoder = new TextDecoder("utf-8");

  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > bytes.byteLength) {
      issues.push(issue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY, { file: fileName }));
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
      issues.push(issue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY, { file: fileName }));
      return {
        ok: false,
        issues,
        entryNames: [],
        totalUncompressedBytes,
        totalEntries,
        isZip: true,
      };
    }

    const flag = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 20, true);
    const uncompSize = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const recordSize = 46 + nameLen + extraLen + commentLen;
    if (offset + recordSize > bytes.byteLength) {
      issues.push(issue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY, { file: fileName }));
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
      issues.push(issue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY, { file: fileName }));
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
      issues.push(issue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY, { file: fileName }));
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

    if (dataStart > bytes.byteLength || dataStart + compSize > bytes.byteLength) {
      issues.push(issue(QB_IMPORT_CODES.ZIP_MALFORMED_CENTRAL_DIRECTORY, { file: fileName }));
      return {
        ok: false,
        issues,
        entryNames: [],
        totalUncompressedBytes: 0,
        totalEntries,
        isZip: true,
      };
    }

    // Bit 0 set = encrypted entry (in central or local header)
    if ((flag & 1) !== 0 || (localFlag & 1) !== 0) {
      issues.push(issue(QB_IMPORT_CODES.WORKBOOK_ENCRYPTED, { file: fileName }));
    }

    // Check single entry declared size limit
    if (uncompSize > DEFAULT_IMPORT_LIMITS.maxSingleEntryUncompressedBytes) {
      issues.push(issue(QB_IMPORT_CODES.ZIP_DECLARED_SIZE_LIMIT, { file: fileName }));
    }

    totalUncompressedBytes += uncompSize;

    // Check compression ratio bomb (canonical threshold 10:1 for uncompressed > 1MB)
    if (
      compSize > 0 &&
      uncompSize > 1_000_000 &&
      uncompSize / compSize > DEFAULT_IMPORT_LIMITS.maxCompressionRatio
    ) {
      issues.push(issue(QB_IMPORT_CODES.ZIP_BOMB_SUSPECTED, { file: fileName }));
    }

    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLen);
    const rawName = decoder.decode(nameBytes);

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
    if (/[\0\x01-\x1f\x7f]/.test(rawName) || /[\0\x01-\x1f\x7f]/.test(decodedName)) {
      issues.push(issue(QB_IMPORT_CODES.MALFORMED_UNICODE, { file: fileName }));
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
      issues.push(issue(QB_IMPORT_CODES.ZIP_ABSOLUTE_PATH, { file: fileName }));
    }

    // Path traversal check
    if (
      !MUTATION_HOOKS.disablePathTraversalDetection &&
      (rawName.includes("..") ||
        decodedName.includes("..") ||
        /%2e%2e/i.test(rawName) ||
        /%252e%252e/i.test(rawName) ||
        /(\.\.[\\/]|[\\/]\.\.)/.test(rawName) ||
        /(\.\.[\\/]|[\\/]\.\.)/.test(decodedName))
    ) {
      issues.push(issue(QB_IMPORT_CODES.PATH_TRAVERSAL, { file: fileName }));
    }

    // Check duplicate ZIP entries (exact and normalized)
    const normalizedEntryName = rawName.replace(/\/+/g, "/").toLowerCase();
    if (!MUTATION_HOOKS.disableDuplicateEntryDetection) {
      if (seenEntries.has(rawName) || seenEntries.has(normalizedEntryName)) {
        issues.push(issue(QB_IMPORT_CODES.ZIP_DUPLICATE_ENTRY, { file: fileName }));
      } else {
        seenEntries.add(rawName);
        seenEntries.add(normalizedEntryName);
      }
    }

    entryNames.push(rawName);
    offset += recordSize;
  }

  if (totalUncompressedBytes > DEFAULT_IMPORT_LIMITS.maxUncompressedBytes) {
    issues.push(issue(QB_IMPORT_CODES.ZIP_TOTAL_SIZE_LIMIT, { file: fileName }));
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
