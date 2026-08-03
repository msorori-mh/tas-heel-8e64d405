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

  if (bytes.byteLength > DEFAULT_IMPORT_LIMITS.maxFileBytes) {
    issues.push(issue(QB_IMPORT_CODES.FILE_TOO_LARGE, { file: fileName }));
  }

  // Check ZIP signature PK\x03\x04 or PK\x05\x06
  if (
    bytes.byteLength < 22 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b
  ) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.FILE_TYPE_UNSUPPORTED, { file: fileName })],
      entryNames: [],
      totalUncompressedBytes: 0,
      totalEntries: 0,
      isZip: false,
    };
  }

  // Find End of Central Directory (EOCD) signature: 0x06054b50
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
      issues: [issue(QB_IMPORT_CODES.FILE_TYPE_UNSUPPORTED, { file: fileName })],
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

  if (totalEntries > DEFAULT_IMPORT_LIMITS.maxZipEntries) {
    issues.push(issue(QB_IMPORT_CODES.ZIP_ENTRY_LIMIT, { file: fileName }));
  }

  if (cdOffset + cdSize > bytes.byteLength) {
    issues.push(issue(QB_IMPORT_CODES.PATH_TRAVERSAL, { file: fileName }));
    return {
      ok: false,
      issues,
      entryNames: [],
      totalUncompressedBytes: 0,
      totalEntries,
      isZip: true,
    };
  }

  const entryNames: string[] = [];
  const seenEntries = new Set<string>();
  let totalUncompressedBytes = 0;
  let offset = cdOffset;
  const decoder = new TextDecoder("utf-8");

  for (let i = 0; i < totalEntries && offset + 46 <= bytes.byteLength; i++) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x02014b50) break; // Central directory header signature PK\x01\x02

    const flag = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 20, true);
    const uncompSize = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);

    // Encrypted entry check (bit 0 set)
    if ((flag & 1) !== 0) {
      issues.push(issue(QB_IMPORT_CODES.WORKBOOK_ENCRYPTED, { file: fileName }));
    }

    totalUncompressedBytes += uncompSize;

    // Check compression ratio bomb
    if (
      compSize > 0 &&
      uncompSize > 1_000_000 &&
      uncompSize / compSize > 100
    ) {
      issues.push(issue(QB_IMPORT_CODES.ZIP_BOMB_SUSPECTED, { file: fileName }));
    }

    if (offset + 46 + nameLen <= bytes.byteLength) {
      const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLen);
      const name = decoder.decode(nameBytes);

      // Check NUL bytes or control chars
      if (/[\0\x01-\x1f\x7f]/.test(name)) {
        issues.push(issue(QB_IMPORT_CODES.PATH_TRAVERSAL, { file: fileName }));
      }

      // Check path traversal & absolute paths
      if (
        !MUTATION_HOOKS.disablePathTraversalDetection &&
        (name.includes("..") ||
          name.startsWith("/") ||
          name.startsWith("\\") ||
          /^[a-zA-Z]:/.test(name) ||
          name.includes("%2e%2e"))
      ) {
        issues.push(issue(QB_IMPORT_CODES.PATH_TRAVERSAL, { file: fileName }));
      }

      // Check duplicate ZIP entries
      if (!MUTATION_HOOKS.disableDuplicateEntryDetection) {
        if (seenEntries.has(name)) {
          issues.push(issue(QB_IMPORT_CODES.PATH_TRAVERSAL, { file: fileName }));
        } else {
          seenEntries.add(name);
        }
      }

      entryNames.push(name);
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }

  if (totalUncompressedBytes > DEFAULT_IMPORT_LIMITS.maxUncompressedBytes) {
    issues.push(issue(QB_IMPORT_CODES.ZIP_BOMB_SUSPECTED, { file: fileName }));
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
