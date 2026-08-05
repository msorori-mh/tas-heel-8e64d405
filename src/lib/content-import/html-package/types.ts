import type { ValidationCode } from "./validation-codes.ts";

/**
 * Standard resource types for lesson content.
 */
export const LESSON_RESOURCE_TYPES = [
  "mind_map_html",
  "practical_experiment_html",
  "summary_html",
  "image",
  "pdf",
  "video",
  "external_link",
] as const;

export type LessonResourceType = (typeof LESSON_RESOURCE_TYPES)[number];

export type OrientationMode = "auto" | "portrait" | "landscape";
export type HeightMode = "fixed" | "viewport" | "content";
export type CompletionMode = "view" | "interaction_event" | "manual_review";
export type CompletionEvent = "experiment_started" | "step_completed" | "experiment_completed";

export type ResourceStatus = "draft" | "in_review" | "approved" | "published" | "rejected" | "archived";

/**
 * Single row contract in interactive resources Excel sheet.
 */
export interface InteractiveLessonResourceImportRow {
  resource_code: string;
  grade_code: string;
  subject_code: string;
  unit_code?: string | null;
  lesson_code: string;
  resource_type: LessonResourceType;
  title_ar: string;
  description_ar?: string | null;
  alt_text_ar?: string | null;
  package_path: string;
  entry_file?: string;
  sort_order?: number;
  version?: number;
  status?: ResourceStatus;
  offline_enabled?: boolean;
  orientation?: OrientationMode;
  height_mode?: HeightMode;
  completion_mode?: CompletionMode;
  completion_event?: CompletionEvent | null;
  minimum_interaction_seconds?: number;
}

/**
 * Manifest JSON inside interactive HTML package (<resource_code>/manifest.json).
 */
export interface InteractiveResourceManifest {
  resource_code: string;
  entry_file: string;
  version: number;
  resource_type: LessonResourceType;
  offline_enabled: boolean;
  required_files?: string[];
  content_sha256?: string;
}

/**
 * Operational limits enforced during validation.
 */
export const PACKAGE_LIMITS = {
  MAX_MASTER_ZIP_SIZE_BYTES: 50 * 1024 * 1024, // 50 MB
  MAX_RESOURCE_COMPRESSED_BYTES: 20 * 1024 * 1024, // 20 MB
  MAX_RESOURCE_UNCOMPRESSED_BYTES: 50 * 1024 * 1024, // 50 MB
  MAX_FILES_PER_RESOURCE: 100,
  MAX_FOLDER_DEPTH: 5,
  MAX_SINGLE_FILE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_SINGLE_HTML_FILE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_SINGLE_JS_FILE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_SINGLE_IMAGE_FILE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_UNCOMPRESSED_RATIO: 10, // max compression ratio 10x
  MAX_EVENT_PAYLOAD_BYTES: 10240, // 10 KB limit per event payload
  MAX_EVENT_RATE_PER_SECOND: 20,
} as const;

export interface SecurityFinding {
  code: ValidationCode;
  severity: "error" | "warning";
  file?: string;
  line?: number;
  snippet?: string;
  message: string;
}

export interface HtmlScriptInfo {
  type: "inline" | "external";
  src?: string;
  content?: string;
  sha256?: string;
  startLine?: number;
}

export interface HtmlScanResult {
  title?: string;
  inlineScripts: HtmlScriptInfo[];
  scriptHashes: string[];
  referencedAssets: string[];
  findings: SecurityFinding[];
}

export interface PackageFileItem {
  path: string;
  size: number;
  isDir: boolean;
  contentSha256: string;
  mimeType?: string;
  buffer?: Buffer | Uint8Array;
}

export interface PackageValidationResult {
  resourceCode: string;
  isValid: boolean;
  entryFile: string;
  manifest?: InteractiveResourceManifest;
  contentHash: string;
  totalSizeCompressed: number;
  totalSizeUncompressed: number;
  fileCount: number;
  cspHeader: string;
  findings: SecurityFinding[];
  offlineEligible: boolean;
}

export interface ImportDryRunReport {
  summary: {
    totalRows: number;
    validRows: number;
    rejectedRows: number;
    totalResourcesInZip: number;
    validPackages: number;
    rejectedPackages: number;
    offlineEligibleCount: number;
  };
  rows: {
    rowNumber: number;
    row: InteractiveLessonResourceImportRow;
    isValid: boolean;
    findings: SecurityFinding[];
  }[];
  packageResults: Record<string, PackageValidationResult>;
  globalFindings: SecurityFinding[];
}

/**
 * Allowed event bridge messages from sandboxed HTML to App context.
 */
export const ALLOWED_BRIDGE_EVENT_TYPES = [
  "resource_ready",
  "resource_started",
  "interaction",
  "step_completed",
  "experiment_completed",
  "resource_error",
  "resize_request",
] as const;

export type BridgeEventType = (typeof ALLOWED_BRIDGE_EVENT_TYPES)[number];

export interface BridgeEventPayload {
  resource_code: string;
  resource_version: number;
  session_nonce: string;
  event_type: BridgeEventType;
  event_sequence: number;
  timestamp: number;
  payload?: Record<string, unknown>;
}
