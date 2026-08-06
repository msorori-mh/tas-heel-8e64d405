import type { SecurityFinding } from "@/lib/content-import/html-package/types";
import type { StorageAdapter } from "./storage-adapter";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface UploadSessionRow {
  id: string;
  batch_id: string;
  actor_id: string;
  resource_id: string;
  resource_code: string | null;
  staging_path: string;
  expected_package_hash: string;
  original_filename: string;
  status: string;
  expires_at: string;
  finalized_at: string | null;
  created_at: string;
}

export interface ResolveUploadSessionResultRow {
  session_id: string;
  batch_id: string;
  actor_id: string;
  resource_id: string;
  resource_code: string | null;
  staging_path: string;
  expected_package_hash: string;
  status: string;
  expires_at: string;
  is_expired: boolean;
}

export interface ResolvePromotionBindingResultRow {
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

export interface ResolveStudentResourceBindingResultRow {
  resource_id: string;
  lesson_id: string;
  version_id: string;
  resource_type: string;
  title: string;
  published_version_number: number;
}

export interface ClaimIdempotencyKeyResultRow {
  ledger_id: string;
  claimed: boolean;
  current_status: string;
  previous_result: unknown;
  previous_error: unknown;
}

export interface ValidServerValidationResultRow {
  validation_id: string;
  upload_session_id: string;
  resource_version_id: string;
  package_hash: string;
  is_valid: boolean;
  valid_until: string;
  storage_object_path: string;
}

export interface StorageOperationRow {
  id: string;
  actor_id: string;
  resource_id: string;
  resource_version_id: string;
  upload_session_id: string | null;
  source_path: string;
  target_path: string;
  expected_hash: string | null;
  operation_type: 'stage_upload' | 'promote_published' | 'cleanup_staging' | 'cleanup_archived' | 'rollback_promotion';
  parent_operation_id: string | null;
  status: 'pending' | 'uploaded' | 'verified' | 'promoted' | 'cleanup_pending' | 'cleaned' | 'failed' | 'compensated';
  retry_number: number;
  attempt_count: number;
  idempotency_key: string | null;
  failure_code: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ContentPackageValidationRow {
  id: string;
  upload_session_id: string;
  resource_id: string;
  resource_version_id: string;
  package_hash: string;
  scanner_version: string;
  findings: SecurityFinding[];
  is_valid: boolean;
  validated_at: string;
  valid_until: string;
  storage_object_path: string;
  storage_object_version: string | null;
  created_by_server: boolean;
  created_at: string;
}

export interface LessonResourceEventRow {
  id: string;
  resource_id: string | null;
  resource_version_id: string | null;
  actor_id: string | null;
  event_type: 'create' | 'upload_issued' | 'upload_finalized' | 'validation_passed' | 'validation_failed' | 'submit' | 'approve' | 'reject' | 'publish' | 'unpublish' | 'rollback' | 'cleanup' | 'compensation';
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ContentImportBatchRow {
  id: string;
  actor_id: string;
  status: string;
  idempotency_key: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface LessonResourceVersionRow {
  id: string;
  resource_id: string;
  version_number: number;
  content_sha256: string;
  manifest: Record<string, unknown>;
  immutable_at: string | null;
  immutable_reason: string | null;
  created_by: string | null;
  created_at: string;
}

export type PipelineDatabase = {
  public: {
    Tables: Database['public']['Tables'] & {
      lesson_resource_upload_sessions: {
        Row: UploadSessionRow;
        Insert: Omit<UploadSessionRow, 'created_at' | 'finalized_at'> & { created_at?: string; finalized_at?: string | null };
        Update: Partial<UploadSessionRow>;
        Relationships: [];
      };
      content_package_validations: {
        Row: ContentPackageValidationRow;
        Insert: Omit<ContentPackageValidationRow, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<ContentPackageValidationRow>;
        Relationships: [];
      };
      storage_operations: {
        Row: StorageOperationRow;
        Insert: Omit<StorageOperationRow, 'created_at' | 'completed_at'> & { created_at?: string; completed_at?: string | null };
        Update: Partial<StorageOperationRow>;
        Relationships: [];
      };
      lesson_resource_events: {
        Row: LessonResourceEventRow;
        Insert: Omit<LessonResourceEventRow, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<LessonResourceEventRow>;
        Relationships: [];
      };
      content_import_batches: {
        Row: ContentImportBatchRow;
        Insert: Omit<ContentImportBatchRow, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<ContentImportBatchRow>;
        Relationships: [];
      };
      lesson_resource_versions: {
        Row: LessonResourceVersionRow;
        Insert: Omit<LessonResourceVersionRow, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<LessonResourceVersionRow>;
        Relationships: [];
      };
    };
    Views: Database['public']['Views'];
    Functions: {
      is_content_feature_enabled: {
        Args: { p_key: string };
        Returns: boolean;
      };
      claim_idempotency_key: {
        Args: { p_operation: string; p_key: string };
        Returns: ClaimIdempotencyKeyResultRow[];
      };
      complete_idempotency_key: {
        Args: { p_ledger_id: string; p_result: Record<string, unknown> };
        Returns: void;
      };
      fail_idempotency_key: {
        Args: { p_ledger_id: string; p_error: Record<string, unknown> };
        Returns: void;
      };
      resolve_upload_session: {
        Args: { p_upload_session_id: string };
        Returns: ResolveUploadSessionResultRow[];
      };
      record_server_validation: {
        Args: {
          p_upload_session_id: string;
          p_resource_version_id: string;
          p_package_hash: string;
          p_scanner_version: string;
          p_findings: Record<string, unknown>[];
          p_is_valid: boolean;
          p_valid_until: string;
          p_storage_object_path: string;
          p_storage_object_version?: string | null;
        };
        Returns: string;
      };
      get_valid_server_validation: {
        Args: { p_resource_version_id: string; p_upload_session_id: string };
        Returns: ValidServerValidationResultRow[];
      };
      resolve_promotion_binding: {
        Args: { p_upload_session_id?: string | null; p_resource_version_id?: string | null };
        Returns: ResolvePromotionBindingResultRow[];
      };
      resolve_student_resource_binding: {
        Args: { p_resource_id: string };
        Returns: ResolveStudentResourceBindingResultRow[];
      };
    };
    Enums: Database['public']['Enums'];
    CompositeTypes: Database['public']['CompositeTypes'];
  };
};

export interface HtmlPipelineConfig {
  bucketName?: string;
  storageAdapter?: StorageAdapter;
  supabaseClient?: unknown;
}

export interface CreateUploadSessionParams {
  batchId?: string;
  resourceId: string;
  originalFilename: string;
  expectedPackageHash: string;
  resourceCode?: string;
  idempotencyKey?: string;
}

export interface CreateUploadSessionResult {
  uploadSessionId: string;
  batchId: string;
  resourceId: string;
  stagingPath: string;
  expectedPackageHash: string;
  signedUploadUrl: string;
  expiresAt: string;
}

export interface FinalizeUploadSessionParams {
  uploadSessionId: string;
  idempotencyKey?: string;
}

export interface FinalizeUploadSessionResult {
  uploadSessionId: string;
  stagingPath: string;
  contentSha256: string;
  byteSize: number;
  status: string;
}

export interface ValidateStoredPackageParams {
  uploadSessionId: string;
  resourceVersionId?: string;
  idempotencyKey?: string;
}

export interface ValidateStoredPackageResult {
  validationId: string;
  uploadSessionId: string;
  resourceVersionId: string;
  packageHash: string;
  isValid: boolean;
  validUntil: string;
  findings: SecurityFinding[];
  scannerVersion: string;
}

export interface PromoteVersionParams {
  uploadSessionId?: string;
  resourceVersionId?: string;
  idempotencyKey?: string;
}

export interface PromoteVersionResult {
  resourceId: string;
  versionId: string;
  publishedTargetPath: string;
  storageOperationId: string;
  status: string;
}

export interface GetStudentResourceAccessParams {
  resourceId: string;
}

export interface GetStudentResourceAccessResult {
  resourceId: string;
  lessonId: string;
  versionId: string;
  title: string;
  signedUrl: string;
  expiresIn: number;
}
