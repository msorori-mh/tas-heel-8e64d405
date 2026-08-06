import type { SecurityFinding } from "@/lib/content-import/html-package";

export interface HtmlUploadSessionRequest {
  batchId: string;
  resourceCode: string;
  filename: string;
}

export interface HtmlUploadSessionResponse {
  uploadSessionId: string;
  stagingPath: string;
  bucket: string;
  expiresInSeconds: number;
  signedUploadUrl: string;
  token: string;
}

export interface CreateSignedUploadUrlOptions {
  stagingPath: string;
}

export interface FinalizeUploadedObjectOptions {
  stagingPath: string;
}

export interface ValidateStoredZipOptions {
  stagingPath: string;
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
}

export interface PromotePackageOptions {
  stagingPath: string;
  resourceCode: string;
  versionNumber: number;
  expectedContentSha256: string;
  idempotencyKey?: string;
}

export interface PublishedStorageResult {
  publishedPath: string;
  bucket: string;
  contentSha256: string;
  promoted: boolean;
  status: "promoted" | "cleanup_pending" | "failed";
  errorDetails?: string;
}

export interface StudentSignedAccessOptions {
  lessonId: string;
  resourceId: string;
  publishedVersionId: string;
  status: string;
  publishedPath: string;
  signedUrlTtlSeconds?: number;
}

export interface StudentSignedAccessResult {
  granted: boolean;
  signedUrl?: string;
  reason?: string;
  expiresInSeconds?: number;
}

export interface CompensationOptions {
  operationType: "promote_published" | "upload_staging";
  stagingPath?: string;
  publishedPath?: string;
  idempotencyKey?: string;
  reason: string;
}

export interface CompensationResult {
  compensated: boolean;
  status: "cleaned" | "compensated" | "failed";
  details?: string;
}
