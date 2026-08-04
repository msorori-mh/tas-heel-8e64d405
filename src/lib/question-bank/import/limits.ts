export const MAX_SINGLE_ENTRY_UNCOMPRESSED_SIZE = 10 * 1024 * 1024;

export const DEFAULT_IMPORT_LIMITS = {
  maxRows: 1000,
  maxFileBytes: 5 * 1024 * 1024,
  maxCellBytes: 64 * 1024,
  maxColumns: 256,
  maxVisibleSheets: 2,
  maxZipEntries: 200,
  maxUncompressedBytes: 20 * 1024 * 1024,
  maxSingleEntryUncompressedBytes: MAX_SINGLE_ENTRY_UNCOMPRESSED_SIZE,
  maxCompressionRatio: 10,
  minOptions: 2,
  maxOptions: 6,
} as const;
