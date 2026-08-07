import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  ResolvedUploadSession,
  RecordServerValidationParams,
  ResolvedServerValidation,
  ResolvedPromotionBinding,
  ResolvedStudentResourceBinding,
  StorageOperationRecord,
  ResolvedStorageOperation,
  RecordSuccessfulResourcePublicationParams,
  SubmitForReviewParams,
  ApproveResourceParams,
  RejectResourceParams,
  UnpublishResourceParams,
  RollbackResourceParams,
} from "./types";

export interface DatabaseClientAdapter {
  resolveUploadSession(uploadSessionId: string): Promise<ResolvedUploadSession>;
  recordServerValidation(params: RecordServerValidationParams): Promise<string>;
  getValidServerValidation(
    resourceVersionId: string,
    uploadSessionId: string,
  ): Promise<ResolvedServerValidation | null>;
  resolvePromotionBinding(options: {
    uploadSessionId?: string;
    resourceVersionId?: string;
  }): Promise<ResolvedPromotionBinding>;
  resolveStudentResourceBinding(resourceId: string): Promise<ResolvedStudentResourceBinding>;
  recordSuccessfulResourcePublication(
    params: RecordSuccessfulResourcePublicationParams,
  ): Promise<void>;
  recordStorageOperation(op: StorageOperationRecord): Promise<string>;
  updateStorageOperation(operationId: string, status: string, details?: string): Promise<void>;
  resolveStorageOperation(operationId: string): Promise<ResolvedStorageOperation | null>;
  submitResourceForReview(params: SubmitForReviewParams): Promise<void>;
  approveResource(params: ApproveResourceParams): Promise<void>;
  rejectResource(params: RejectResourceParams): Promise<void>;
  unpublishResource(params: UnpublishResourceParams): Promise<void>;
  rollbackResource(params: RollbackResourceParams): Promise<void>;
}

type UntypedSupabaseClient = {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    select(columns?: string): {
      eq(
        column: string,
        value: unknown,
      ): {
        single(): Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    insert(values: unknown): {
      select(columns?: string): {
        single(): Promise<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
    };
    update(values: unknown): {
      eq(column: string, value: unknown): Promise<{ error: { message: string } | null }>;
    };
  };
};

export interface CreateSupabaseDbAdapterOptions {
  userClient: SupabaseClient<Database>;
  adminClient: SupabaseClient<Database>;
}

export function createSupabaseDbAdapter({
  userClient,
  adminClient,
}: CreateSupabaseDbAdapterOptions): DatabaseClientAdapter {
  if (!adminClient) {
    throw new Error(
      "Missing admin/service-role Supabase client. Server-only operations are not available.",
    );
  }
  const untypedSupabase = userClient as unknown as UntypedSupabaseClient;
  const untypedAdmin = adminClient as unknown as UntypedSupabaseClient;

  return {
    async resolveUploadSession(uploadSessionId: string): Promise<ResolvedUploadSession> {
      const { data, error } = await untypedSupabase.rpc("resolve_upload_session", {
        p_upload_session_id: uploadSessionId,
      });

      if (error) {
        throw new Error(`فشل التحقق من جلسة الرفع من قاعدة البيانات: ${error.message}`);
      }

      const rows = data as unknown as ResolvedUploadSession[];
      const session = rows && rows[0];
      if (!session) {
        throw new Error(`جلسة الرفع ${uploadSessionId} غير موجودة أو منتهية الصلاحية`);
      }

      return session;
    },

    async recordServerValidation(params: RecordServerValidationParams): Promise<string> {
      const { data, error } = await untypedAdmin.rpc("record_server_validation", {
        p_upload_session_id: params.uploadSessionId,
        p_resource_version_id: params.resourceVersionId,
        p_package_hash: params.packageHash,
        p_scanner_version: params.scannerVersion,
        p_findings: params.findings as unknown as Record<string, unknown>[],
        p_is_valid: params.isValid,
        p_valid_until: params.validUntil,
        p_storage_object_path: params.storageObjectPath,
        p_storage_object_version: params.storageObjectVersion ?? null,
      });

      if (error) {
        throw new Error(`فشل تسجيل نتيجة الفحص الخادمي: ${error.message}`);
      }

      return data as string;
    },

    async getValidServerValidation(
      resourceVersionId: string,
      uploadSessionId: string,
    ): Promise<ResolvedServerValidation | null> {
      const { data, error } = await untypedAdmin.rpc("get_valid_server_validation", {
        p_resource_version_id: resourceVersionId,
        p_upload_session_id: uploadSessionId,
      });

      if (error) {
        return null;
      }

      const rows = data as unknown as ResolvedServerValidation[];
      return (rows && rows[0]) || null;
    },

    async resolvePromotionBinding(options: {
      uploadSessionId?: string;
      resourceVersionId?: string;
    }): Promise<ResolvedPromotionBinding> {
      const { data, error } = await untypedAdmin.rpc("resolve_promotion_binding", {
        p_upload_session_id: options.uploadSessionId ?? null,
        p_resource_version_id: options.resourceVersionId ?? null,
      });

      if (error) {
        throw new Error(`فشل التحقق من رابط الترقية (Promotion Binding): ${error.message}`);
      }

      const rows = data as unknown as ResolvedPromotionBinding[];
      const binding = rows && rows[0];
      if (!binding) {
        throw new Error("لم يتم العثور على رابط ترقية صالحة وفق القواعد المعتمدة");
      }

      return binding;
    },

    async resolveStudentResourceBinding(
      resourceId: string,
    ): Promise<ResolvedStudentResourceBinding> {
      const { data, error } = await untypedSupabase.rpc("resolve_student_resource_binding", {
        p_resource_id: resourceId,
      });

      if (error) {
        throw new Error(`فشل التحقق من وصول الطالب للمورد: ${error.message}`);
      }

      const rows = data as unknown as ResolvedStudentResourceBinding[];
      const binding = rows && rows[0];
      if (!binding) {
        throw new Error(`المورد ${resourceId} غير متاح أو غير منشور للطالب`);
      }

      return binding;
    },

    async recordSuccessfulResourcePublication(
      params: RecordSuccessfulResourcePublicationParams,
    ): Promise<void> {
      const { error } = await untypedAdmin.rpc("record_successful_resource_publication", {
        p_resource_id: params.resourceId,
        p_version_id: params.versionId,
        p_storage_operation_id: params.storageOperationId,
        p_upload_session_id: params.uploadSessionId ?? null,
        p_expected_lock_version: params.expectedLockVersion ?? null,
      });

      if (error) {
        throw new Error(`فشل تسجيل النشر الذري في قاعدة البيانات: ${error.message}`);
      }
    },

    async recordStorageOperation(op: StorageOperationRecord): Promise<string> {
      const { data, error } = await untypedAdmin
        .from("storage_operations")
        .insert({
          actor_id: op.actorId,
          resource_id: op.resourceId,
          resource_version_id: op.resourceVersionId,
          upload_session_id: op.uploadSessionId ?? null,
          source_path: op.sourcePath,
          target_path: op.targetPath,
          expected_hash: op.expectedHash,
          operation_type: op.operationType,
          parent_operation_id: op.parentOperationId ?? null,
          retry_number: op.retryNumber ?? 0,
          attempt_count: op.attemptCount ?? 1,
          idempotency_key: op.idempotencyKey ?? null,
          status: "pending",
          failure_code: op.failureCode ?? null,
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(`فشل إنشاء سجل عملية التخزين: ${error.message}`);
      }

      return (data as { id: string }).id;
    },

    async updateStorageOperation(
      operationId: string,
      status: string,
      failureCode?: string,
    ): Promise<void> {
      const update: Record<string, unknown> = {
        status,
        failure_code: failureCode ?? null,
      };

      if (status === "cleaned" || status === "compensated") {
        update.completed_at = new Date().toISOString();
      }

      const { error } = await untypedAdmin
        .from("storage_operations")
        .update(update)
        .eq("id", operationId);

      if (error) {
        throw new Error(`فشل تحديث حالة عملية التخزين: ${error.message}`);
      }
    },

    async resolveStorageOperation(operationId: string): Promise<ResolvedStorageOperation | null> {
      const { data, error } = await untypedAdmin
        .from("storage_operations")
        .select("*")
        .eq("id", operationId)
        .single();

      if (error || !data) {
        return null;
      }

      const row = data as Record<string, unknown>;

      return {
        id: row.id as string,
        actorId: row.actor_id as string,
        resourceId: row.resource_id as string,
        resourceVersionId: row.resource_version_id as string,
        uploadSessionId: row.upload_session_id as string | undefined,
        sourcePath: row.source_path as string,
        targetPath: row.target_path as string,
        expectedHash: row.expected_hash as string,
        operationType: row.operation_type as string,
        parentOperationId: row.parent_operation_id as string | undefined,
        status: row.status as string,
        retryNumber: row.retry_number as number,
        attemptCount: row.attempt_count as number,
        idempotencyKey: row.idempotency_key as string | undefined,
        failureCode: row.failure_code as string | undefined,
        completedAt: row.completed_at as string | undefined,
        createdAt: row.created_at as string | undefined,
      };
    },

    async submitResourceForReview(params: SubmitForReviewParams): Promise<void> {
      const { error } = await untypedAdmin.rpc("submit_resource_for_review", {
        p_resource_id: params.resourceId,
        p_expected_lock_version: params.expectedLockVersion ?? null,
      });

      if (error) {
        throw new Error(`فشل إرسال المورد للمراجعة: ${error.message}`);
      }
    },

    async approveResource(params: ApproveResourceParams): Promise<void> {
      const { error } = await untypedAdmin.rpc("approve_resource", {
        p_resource_id: params.resourceId,
        p_version_id: params.versionId,
        p_expected_lock_version: params.expectedLockVersion ?? null,
      });

      if (error) {
        throw new Error(`فشل اعتماد المورد: ${error.message}`);
      }
    },

    async rejectResource(params: RejectResourceParams): Promise<void> {
      const { error } = await untypedAdmin.rpc("reject_resource", {
        p_resource_id: params.resourceId,
        p_version_id: params.versionId,
        p_reason: params.reason,
        p_expected_lock_version: params.expectedLockVersion ?? null,
      });

      if (error) {
        throw new Error(`فشل رفض المورد: ${error.message}`);
      }
    },

    async unpublishResource(params: UnpublishResourceParams): Promise<void> {
      const { error } = await untypedAdmin.rpc("unpublish_resource", {
        p_resource_id: params.resourceId,
        p_expected_lock_version: params.expectedLockVersion ?? null,
      });

      if (error) {
        throw new Error(`فشل إلغاء نشر المورد: ${error.message}`);
      }
    },

    async rollbackResource(params: RollbackResourceParams): Promise<void> {
      const { error } = await untypedAdmin.rpc("rollback_resource", {
        p_resource_id: params.resourceId,
        p_target_version_id: params.targetVersionId,
        p_expected_lock_version: params.expectedLockVersion ?? null,
      });

      if (error) {
        throw new Error(`فشل التراجع عن المورد: ${error.message}`);
      }
    },
  };
}
