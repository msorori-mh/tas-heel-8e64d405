/** Import job constants aligned with import_jobs schema (types + migrations). */

export const GOVERNORATES_IMPORT_TEMPLATE_KEY = "02_governorates";

export const IMPORT_JOB_MODE_DRY_RUN = "dry_run" as const;

/** import_jobs.status — CHECK constraint values */
export type ImportJobStatus =
  | "draft"
  | "validating"
  | "validated"
  | "validation_failed"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export const IMPORT_JOB_STATUS_VALIDATED: ImportJobStatus = "validated";
export const IMPORT_JOB_STATUS_VALIDATION_FAILED: ImportJobStatus = "validation_failed";

/** import_jobs.import_type — CHECK constraint values */
export const IMPORT_TYPE_STRUCTURE = "structure" as const;

export const IMPORT_ERROR_SEVERITY_ERROR = "error" as const;
export const IMPORT_ERROR_SEVERITY_WARNING = "warning" as const;

export const DRY_RUN_METADATA_VERSION = "01C-B2";
