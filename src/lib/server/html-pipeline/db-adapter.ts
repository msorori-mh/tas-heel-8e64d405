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

export interface DatabaseClientAdapter {
  resolveUploadSession(uploadSessionId: string): Promise<ResolvedUploadSession>;
  recordServerValidation(params: RecordServerValidationParams): Promise<string>;
  getValidServerValidation(
    resourceVersionId: string,
    uploadSessionId: string
  ): Promise<ResolvedServerValidation | null>;
  resolvePromotionBinding(options: {
    uploadSessionId?: string;
    resourceVersionId?: string;
  }): Promise<ResolvedPromotionBinding>;
  resolveStudentResourceBinding(
    resourceId: string
  ): Promise<ResolvedStudentResourceBinding>;
  recordPublicationState(resourceId: string, versionId: string): Promise<void>;
  recordStorageOperation(op: StorageOperationRecord): Promise<string>;
  updateStorageOperation(
    operationId: string,
    status: string,
    details?: string
  ): Promise<void>;
  resolveStorageOperation(
    operationId: string
  ): Promise<ResolvedStorageOperation | null>;
}

type UntypedSupabaseClient = {
  rpc(
    fn: string,
    args?: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    select(columns?: string): {
      eq(
        column: string,
        value: unknown
      ): {
        single(): Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    insert(values: unknown): Promise<{ error: { message: string } | null }>;
    update(values: unknown): {
      eq(
        column: string,
        value: unknown
      ): Promise<{ error: { message: string } | null }>;
    };
  };
};

export function createSupabaseDbAdapter(
  supabase: SupabaseClient<Database>,
  adminSupabase?: SupabaseClient<Database>
): DatabaseClientAdapter {
  const admin = adminSupabase ?? supabase;
  const untypedSupabase = supabase as unknown as UntypedSupabaseClient;
  const untypedAdmin = admin as unknown as UntypedSupabaseClient;

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
      uploadSessionId: string
    ): Promise<ResolvedServerValidation | null> {
      const { data, error } = await untypedSupabase.rpc("get_valid_server_validation", {
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
      const { data, error } = await untypedSupabase.rpc("resolve_promotion_binding", {
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
      resourceId: string
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
      const id = crypto.randomUUID();
      const { error } = await untypedAdmin.from("idempotency_ledger").insert({
        id,
        scope: `storage_op_${op.operationType}`,
        idempotency_key: `${op.operationType}:${op.uploadSessionId || op.resourceVersionId || id}`,
        status: op.status,
        result: {
          stagingPath: op.stagingPath,
          publishedPath: op.publishedPath,
          details: op.details,
        },
      });

      if (error) {
        return id;
      }
      return id;
    },

    async updateStorageOperation(
      operationId: string,
      status: string,
      details?: string
    ): Promise<void> {
      await untypedAdmin
        .from("idempotency_ledger")
        .update({
          status,
          updated_at: new Date().toISOString(),
          ...(details ? { result: { details } } : {}),
        })
        .eq("id", operationId);
    },

    async resolveStorageOperation(
      operationId: string
    ): Promise<ResolvedStorageOperation | null> {
      const { data, error } = await untypedAdmin
        .from("idempotency_ledger")
        .select("*")
        .eq("id", operationId)
        .single();

      if (error || !data) {
        return null;
      }

      const row = data as unknown as {
        id: string;
        scope: string;
        status: string;
        result?: { stagingPath?: string; publishedPath?: string; details?: string };
      };

      return {
        id: row.id,
        operation_type: row.scope,
        staging_path: row.result?.stagingPath,
        published_path: row.result?.publishedPath,
        status: row.status,
        details: row.result?.details,
      };
    },
  };
}
