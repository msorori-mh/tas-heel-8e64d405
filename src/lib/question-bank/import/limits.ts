export const DEFAULT_IMPORT_LIMITS = {
  maxRows: 1000, maxFileBytes: 5 * 1024 * 1024, maxCellBytes: 64 * 1024,
  maxColumns: 256, maxVisibleSheets: 2, maxZipEntries: 200, maxUncompressedBytes: 20 * 1024 * 1024,
  minOptions: 2, maxOptions: 6,
} as const;
