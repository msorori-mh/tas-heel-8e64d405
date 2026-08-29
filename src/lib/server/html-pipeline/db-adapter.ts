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

/**
 * حقول تتبع لتشخيص أعطال الإنتاج من السجلات:
 * rpc   — اسم الـ RPC/الاستعلام الذي فشل
 * req   — معرّف طلب فريد لكل محاولة (يطابق ما يُطبع في toast/السجل)
 * schema— إصدار مخطط خط الأنابيب: القناة القديمة معطلة (LEGACY_HTML_PIPELINE_ENABLED=false)
 */
const HTML_PIPELINE_SCHEMA_MARK = "legacy-html-pipeline@disabled";
export function diagDbError(rpcName: string, cause: string): Error {
  const req =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return new Error(
    `${cause} [rpc=${rpcName}][req=${req}][schema=${HTML_PIPELINE_SCHEMA_MARK}]`,
  );
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
        throw diagDbError("resolve_upload_session", `فشل التحقق من جلسة الرفع من قاعدة البيانات: ${error.message}`);
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
        throw diagDbError("record_server_validation", `فشل تسجيل نتيجة الفحص الخادمي: ${error.message}`);
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
        throw diagDbError("resolve_promotion_binding", `فشل التحقق من رابط الترقية (Promotion Binding): ${error.message}`);
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
        throw diagDbError("resolve_student_resource_binding", `فشل التحقق من وصول الطالب للمورد: ${error.message}`);
      }

      const rows = data as unknown as ResolvedStudentResourceBinding[];
      const binding = rows && rows[0];
      if (!binding) {
        throw new Error(`المورد ${resourceId} غير متاح أو غير منشور للطالب`);
      }

      return binding;
    },

    async listLessonPublishedHtmlResources(lessonId: string): Promise<PublishedHtmlResourceRow[]> {
      type LooseQueryBuilder = {
        eq(column: string, value: unknown): LooseQueryBuilder;
        in(column: string, values: unknown[]): LooseQueryBuilder;
        not(column: string, operator: string, value: unknown): LooseQueryBuilder;
        order(
          column: string,
          opts?: { ascending?: boolean },
        ): Promise<{ data: unknown; error: { message: string } | null }>;
      };

      const admin = untypedAdmin as unknown as {
        from(table: string): {
          select(columns: string): LooseQueryBuilder;
        };
      };

      const { data, error } = await admin
        .from("lesson_resources")
        .select("id,html_resource_type,title,resource_code,published_version_id")
        .eq("lesson_id", lessonId)
        .eq("resource_type", "html")
        .in("html_resource_type", ["mind_map_html", "practical_experiment_html", "summary_html"])
        .eq("lifecycle_status", "published")
        .not("published_version_id", "is", null)
        .order("sort_order", { ascending: true });

      if (error) {
        // خط أنابيب HTML القديم غير موجود في القاعدة الحالية (أعمدة/جداول محذوفة):
        // لا نُفشل عرض الدرس للطالب — نعيد قائمة فارغة بدل رمي استثناء.
        const message = error.message ?? "";
        if (
          /published_version_id|lifecycle_status|lesson_resource_versions/i.test(message) &&
          /does not exist|schema cache/i.test(message)
        ) {
          console.warn("[html-pipeline] legacy query skipped:", diagDbError("lesson_resources.select(published_html)", message).message);
          return [];
        }
        throw diagDbError("lesson_resources.select(published_html)", `فشل جلب موارد HTML المنشورة للدرس: ${message}`);
      }

      const rows = (data ?? []) as Array<{
        id: string;
        html_resource_type: string | null;
        title: string;
        resource_code: string | null;
        published_version_id: string | null;
      }>;

      return rows.map((row) => ({
        id: row.id,
        resource_type: row.html_resource_type ?? "html",
        title: row.title,
        resource_code: row.resource_code,
      }));
    },

    async recordSuccessfulResourcePublication(
      params: RecordSuccessfulResourcePublicationParams,
    ): Promise<void> {
      const { error } = await untypedAdmin.rpc("record_successful_resource_publication", {
        p_resource_id: params.resourceId,
        p_version_id: params.versionId,
        p_storage_operation_id: params.storageOperationId,
        p_upload_session_id: params.uploadSessionId ?? null,
        p_expected_lock_version: params.expectedLockVersion,
      });

      if (error) {
        throw diagDbError("record_successful_resource_publication", `فشل تسجيل النشر الذري في قاعدة البيانات: ${error.message}`);
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
        throw diagDbError("storage_operations.insert", `فشل إنشاء سجل عملية التخزين: ${error.message}`);
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
        throw diagDbError("storage_operations.update", `فشل تحديث حالة عملية التخزين: ${error.message}`);
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
        throw diagDbError("submit_resource_for_review", `فشل إرسال المورد للمراجعة: ${error.message}`);
      }
    },

    async approveResource(params: ApproveResourceParams): Promise<void> {
      const { error } = await untypedAdmin.rpc("approve_resource", {
        p_resource_id: params.resourceId,
        p_version_id: params.versionId,
        p_expected_lock_version: params.expectedLockVersion ?? null,
      });

      if (error) {
        throw diagDbError("approve_resource", `فشل اعتماد المورد: ${error.message}`);
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
        throw diagDbError("reject_resource", `فشل رفض المورد: ${error.message}`);
      }
    },

    async unpublishResource(params: UnpublishResourceParams): Promise<void> {
      const { error } = await untypedAdmin.rpc("unpublish_resource", {
        p_resource_id: params.resourceId,
        p_expected_lock_version: params.expectedLockVersion ?? null,
      });

      if (error) {
        throw diagDbError("unpublish_resource", `فشل إلغاء نشر المورد: ${error.message}`);
      }
    },

    async rollbackResource(params: RollbackResourceParams): Promise<void> {
      const { error } = await untypedAdmin.rpc("rollback_resource", {
        p_resource_id: params.resourceId,
        p_target_version_id: params.targetVersionId,
        p_expected_lock_version: params.expectedLockVersion,
      });

      if (error) {
        throw diagDbError("rollback_resource", `فشل التراجع عن المورد: ${error.message}`);
      }
    },
  };
}
