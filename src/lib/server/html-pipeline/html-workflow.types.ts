import type { SecurityFinding } from "@/lib/content-import/html-package";

export interface InteractiveImportRow {
  resource_code: string;
  grade_code: string;
  subject_code: string;
  unit_code: string | null;
  lesson_code: string;
  resource_type: string;
  title_ar: string;
  description_ar: string | null;
  alt_text_ar: string | null;
  package_path: string;
  entry_file: string;
  sort_order: number;
  version_number: number;
  offline_enabled: boolean;
  orientation: string;
  height_mode: string;
  completion_mode: string;
  completion_event: string | null;
  minimum_interaction_seconds: number;
}

export interface InitializeImportRequest {
  excelFileBase64: string;
  excelFileName: string;
  packageHashes: Record<string, string>;
}

export interface ImportResourceSession {
  resource_code: string;
  resource_id: string;
  version_id: string;
  upload_session_id: string;
  staging_path: string;
  expected_package_hash: string;
  signed_upload_url: string;
  upload_token: string;
  title_ar: string;
  lesson_code: string;
  lesson_id: string;
  resource_type: string;
}

export interface InitializeImportResult {
  batch_id: string;
  resources: ImportResourceSession[];
  errors: Array<{ row_number: number; resource_code: string; message: string }>;
  warnings: Array<{ row_number: number; resource_code: string; message: string }>;
}

export interface FinalizeUploadResult {
  upload_session_id: string;
  status: string;
  validation_id: string | null;
  is_valid: boolean;
  findings: SecurityFinding[];
}

export interface ReviewQueueItem {
  resource_id: string;
  resource_code: string;
  resource_type: string;
  title: string;
  description: string | null;
  lesson_id: string;
  lesson_title: string;
  subject_name: string;
  grade_name: string;
  lifecycle_status: string;
  current_version_id: string | null;
  version_number: number | null;
  content_sha256: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  security_findings_count: number;
  lock_version: number;
}

export interface ReviewActionResult {
  resource_id: string;
  new_status: string;
  success: boolean;
  message: string;
}
