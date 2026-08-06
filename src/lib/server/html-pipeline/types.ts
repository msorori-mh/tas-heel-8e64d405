import type { SecurityFinding } from "@/lib/content-import/html-package";

export interface ResolvedUploadSession {
  session_id: string;
  batch_id: string;
  actor_id: string;
  resource_id: string;
  resource_code: string | null;
  staging_path: string;
  expected_package_hash: string | null;
  status: string;
  expires_at: string;
  is_expired: boolean;
}

export interface RecordServerValidationParams {
  uploadSessionId: string;
  resourceVersionId: string;
  packageHash: string;
  scannerVersion: string;
  findings: SecurityFinding[];
  isValid: boolean;
  validUntil: string;
  storageObjectPath: string;
  storageObjectVersion?: string;
}

export interface ResolvedServerValidation {
  validation_id: string;
  upload_session_id: string;
  resource_version_id: string;
  package_hash: string;
  is_valid: boolean;
  valid_until: string;
  storage_object_path: string;
}

export interface ResolvedPromotionBinding {
  resource_id: string;
  version_id: string;
  upload_session_id: string;
  staging_path: string;
  expected_hash: string;
  resource_code: string;
  version_number: number;
  published_target_path: string;
  valid_validation_id: string;
}

export interface ResolvedStudentResourceBinding {
  resource_id: string;
  lesson_id: string;
  version_id: string;
  resource_type: string;
  title: string;
  published_version_number: number;
}

export interface StorageOperationRecord {
  operationType: "promote_published" | "upload_staging";
  uploadSessionId?: string;
  resourceVersionId?: string;
  stagingPath?: string;
  publishedPath?: string;
  status: "in_progress" | "cleaned" | "cleanup_pending" | "failed" | "compensated";
  details?: string;
}

export interface ResolvedStorageOperation {
  id: string;
  operation_type: string;
  upload_session_id?: string;
  resource_version_id?: string;
  staging_path?: string;
  published_path?: string;
  status: string;
  details?: string;
}

export interface HtmlSignedUploadUrlRequest {
  uploadSessionId: string;
}

export interface HtmlSignedUploadUrlResponse {
  uploadSessionId: string;
  stagingPath: string;
  bucket: string;
  expiresInSeconds: number;
  signedUploadUrl: string;
  token: string;
}

export interface ProcessedFileInfo {
  filePath: string;
  fileSizeBytes: number;
  mimeType: string;
  sha256Hash: string;
  isEntryPoint: boolean;
}

export interface ServerPackageValidationResult {
  isValid: boolean;
  packageHash: string;
  scannerVersion: string;
  findings: SecurityFinding[];
  files: ProcessedFileInfo[];
  entryFile: string;
  validationId?: string;
}

export interface PromotePackageRequest {
  uploadSessionId?: string;
  resourceVersionId?: string;
}

export interface PublishedStorageResult {
  publishedPath: string;
  bucket: string;
  contentSha256: string;
  promoted: boolean;
  status: "promoted" | "cleanup_pending" | "failed";
  errorDetails?: string;
}

export interface StudentSignedAccessRequest {
  resourceId: string;
}

export interface StudentSignedAccessResult {
  granted: boolean;
  signedUrl?: string;
  reason?: string;
  expiresInSeconds?: number;
}

export interface CompensationRequest {
  uploadSessionId?: string;
  storageOperationId?: string;
}

export interface CompensationResult {
  compensated: boolean;
  status: "cleaned" | "compensated" | "failed";
  details?: string;
}
