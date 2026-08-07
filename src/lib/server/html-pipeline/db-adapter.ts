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
} from "./types";

export interface PublishedHtmlResourceRow {
  id: string;
  resource_type: string;
  title: string;
  resource_code: string | null;
}

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
  listLessonPublishedHtmlResources(lessonId: string): Promise<PublishedHtmlResourceRow[]>;
  recordPublicationState(resourceId: string, versionId: string): Promise<void>;
  recordStorageOperation(op: StorageOperationRecord): Promise<string>;
  updateStorageOperation(operationId: string, status: string, details?: string): Promise<void>;
  resolveStorageOperation(operationId: string): Promise<ResolvedStorageOperation | null>;
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

    async listLessonPublishedHtmlResources(
      lessonId: string,
    ): Promise<PublishedHtmlResourceRow[]> {
      const admin = untypedAdmin as unknown as {
        from(table: string): {
          select(columns: string): {
            eq(
              column: string,
              value: unknown,
            ): {
              in(column: string, values: unknown[]): {
                order(
                  column: string,
                  opts?: { ascending?: boolean },
                ): Promise<{ data: unknown; error: { message: string } | null }>;
              };
            };
          };
        };
      };

      const { data, error } = await admin
        .from("lesson_resources")
        .select("id,resource_type,title,resource_code")
        .eq("lesson_id", lessonId)
        .in("resource_type", [
          "mind_map_html",
          "practical_experiment_html",
          "summary_html",
        ])
        .order("sort_order", { ascending: true });

      if (error) {
        throw new Error(
          `فشل جلب موارد HTML المنشورة للدرس: ${error.message}`,
        );
      }

      return (data ?? []) as unknown as PublishedHtmlResourceRow[];
    },

    async recordPublicationState(resourceId: string, versionId: string): Promise<void> {
      const { error } = await untypedAdmin
        .from("lesson_resources")
        .update({
          lifecycle_status: "published",
          published_version_id: versionId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", resourceId);

      if (error) {
        throw new Error(`فشل تحديث حالة النشر في قاعدة البيانات: ${error.message}`);
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
  };
}
