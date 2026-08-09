import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { SecurityFinding } from "@/lib/content-import/html-package";
import { createSupabaseDbAdapter, type DatabaseClientAdapter } from "./db-adapter";

type UntypedSupabase = {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    select(columns?: string): {
      eq(column: string, value: unknown): {
        single(): Promise<{ data: unknown; error: { message: string } | null }>;
        then<TResult>(
          onfulfilled: (value: { data: unknown; error: { message: string } | null }) => TResult,
        ): Promise<TResult>;
      };
      then<TResult>(
        onfulfilled: (value: { data: unknown; error: { message: string } | null }) => TResult,
      ): Promise<TResult>;
    };
    insert(values: unknown): {
      select(columns?: string): {
        single(): Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    update(values: unknown): {
      eq(column: string, value: unknown): Promise<{
        error: { message: string } | null;
        data: unknown;
      }>;
    };
  };
};

export interface LessonLookup {
  id: string;
  title: string;
  subject_id: string;
  grade_id: string;
}

export interface ResourceWithVersion {
  resource_id: string;
  version_id: string;
  lesson_id: string;
}

export interface UploadSessionRecord {
  id: string;
  batch_id: string;
  resource_id: string;
  staging_path: string;
  expected_package_hash: string;
  status: string;
}

export interface ReviewQueueRow {
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
  current_draft_version_id: string | null;
  version_number: number | null;
  content_sha256: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  findings_count: number;
  lock_version: number;
}

export interface HtmlWorkflowAdapter {
  lookupLessonsByCode(codes: string[]): Promise<Map<string, LessonLookup>>;
  findOrCreateResource(params: {
    lesson_id: string;
    resource_type: string;
    title: string;
    description: string | null;
    sort_order: number;
    resource_code: string;
  }): Promise<string>;
  createResourceVersion(params: {
    resource_id: string;
    version_number: number;
    content_sha256: string;
    manifest: Record<string, unknown>;
    created_by: string;
  }): Promise<string>;
  createImportBatch(params: {
    actor_id: string;
    idempotency_key: string;
  }): Promise<string>;
  createUploadSession(params: {
    batch_id: string;
    actor_id: string;
    resource_id: string;
    resource_code: string;
    staging_path: string;
    expected_package_hash: string;
    original_filename: string;
    expires_at: string;
  }): Promise<string>;
  updateUploadSessionStatus(sessionId: string, status: string): Promise<void>;
  setResourceDraftVersion(resourceId: string, versionId: string): Promise<void>;
  submitResourceForReview(resourceId: string, lockVersion?: number): Promise<void>;
  approveResource(resourceId: string, versionId: string, lockVersion?: number): Promise<void>;
  rejectResource(resourceId: string, versionId: string, reviewerId: string, reason: string | null, lockVersion?: number): Promise<void>;
  unpublishResource(resourceId: string, lockVersion?: number): Promise<void>;
  rollbackResource(resourceId: string, targetVersionId: string, lockVersion: number): Promise<void>;
  getReviewQueue(): Promise<ReviewQueueRow[]>;
  getResourceEvents(resourceId: string): Promise<Array<{ event_type: string; created_at: string; payload: unknown }>>;
  checkFeatureFlag(flagKey: string): Promise<boolean>;
}

export function createHtmlWorkflowAdapter(
  adminClient: SupabaseClient<Database>,
): HtmlWorkflowAdapter {
  const db = adminClient as unknown as UntypedSupabase;
  const lifecycleDb: DatabaseClientAdapter = createSupabaseDbAdapter({
    userClient: adminClient,
    adminClient,
  });

  return {
    async lookupLessonsByCode(codes: string[]): Promise<Map<string, LessonLookup>> {
      const result = new Map<string, LessonLookup>();
      if (codes.length === 0) return result;

      const supabaseLoose = adminClient as unknown as {
        from(table: string): {
          select(columns: string): {
            in(column: string, values: unknown[]): Promise<{
              data: unknown;
              error: { message: string } | null;
            }>;
          };
        };
      };

      // Production schema maps the external lesson_code concept to the lessons.slug column.
      const { data, error } = await supabaseLoose
        .from("lessons")
        .select("id, title, subject_id, grade_id, slug")
        .in("slug", codes);

      if (error) {
        throw new Error(`فشل البحث عن الدروس: ${error.message}`);
      }

      const rows = (data as Array<Record<string, unknown>>) || [];
      for (const row of rows) {
        const code = row.slug as string;
        if (code) {
          result.set(code, {
            id: row.id as string,
            title: row.title as string,
            subject_id: row.subject_id as string,
            grade_id: row.grade_id as string,
          });
        }
      }
      return result;
    },

    async findOrCreateResource(params): Promise<string> {
      const supabaseLoose = adminClient as unknown as {
        from(table: string): {
          select(columns: string): {
            eq(column: string, value: unknown): unknown;
          };
          insert(values: unknown): {
            select(columns?: string): {
              single(): Promise<{ data: unknown; error: { message: string } | null }>;
            };
          };
        };
      };

      const query = supabaseLoose
        .from("lesson_resources")
        .select("id")
        .eq("lesson_id", params.lesson_id);

      const eqChain = query as {
        eq(column: string, value: unknown): Promise<{ data: unknown; error: { message: string } | null }>;
      };

      const { data: existing, error: findErr } = await eqChain.eq("title", params.title);

      if (!findErr && existing) {
        const rows = existing as Array<Record<string, unknown>>;
        if (rows.length > 0) {
          return rows[0].id as string;
        }
      }

      const { data, error } = await db
        .from("lesson_resources")
        .insert({
          id: crypto.randomUUID(),
          lesson_id: params.lesson_id,
          resource_type: "html",
          html_resource_type: params.resource_type,
          resource_code: params.resource_code,
          title: params.title,
          description: params.description,
          sort_order: params.sort_order,
          url: "",
          lifecycle_status: "draft",
          lock_version: 1,
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(`فشل إنشاء المورد: ${error.message}`);
      }

      return (data as { id: string }).id;
    },

    async createResourceVersion(params): Promise<string> {
      const { data, error } = await db
        .from("lesson_resource_versions")
        .insert({
          id: crypto.randomUUID(),
          resource_id: params.resource_id,
          version_number: params.version_number,
          content_sha256: params.content_sha256,
          manifest: params.manifest as Record<string, unknown>,
          created_by: params.created_by,
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(`فشل إنشاء إصدار المورد: ${error.message}`);
      }

      return (data as { id: string }).id;
    },

    async createImportBatch(params): Promise<string> {
      const { data, error } = await db
        .from("content_import_batches")
        .insert({
          id: crypto.randomUUID(),
          actor_id: params.actor_id,
          status: "created",
          idempotency_key: params.idempotency_key,
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(`فشل إنشاء دفعة الاستيراد: ${error.message}`);
      }

      return (data as { id: string }).id;
    },

    async createUploadSession(params): Promise<string> {
      const { data, error } = await db
        .from("lesson_resource_upload_sessions")
        .insert({
          id: crypto.randomUUID(),
          batch_id: params.batch_id,
          actor_id: params.actor_id,
          resource_id: params.resource_id,
          resource_code: params.resource_code,
          staging_path: params.staging_path,
          expected_package_hash: params.expected_package_hash,
          original_filename: params.original_filename,
          status: "issued",
          expires_at: params.expires_at,
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(`فشل إنشاء جلسة الرفع: ${error.message}`);
      }

      return (data as { id: string }).id;
    },

    async updateUploadSessionStatus(sessionId: string, status: string): Promise<void> {
      const { error } = await db
        .from("lesson_resource_upload_sessions")
        .update({ status })
        .eq("id", sessionId);

      if (error) {
        throw new Error(`فشل تحديث حالة جلسة الرفع: ${error.message}`);
      }
    },

    async setResourceDraftVersion(resourceId: string, versionId: string): Promise<void> {
      const { data: existing, error: fetchErr } = await db
        .from("lesson_resources")
        .select("lifecycle_status")
        .eq("id", resourceId)
        .single();

      if (fetchErr) {
        throw new Error(`فشل التحقق من حالة المورد: ${fetchErr.message}`);
      }

      const row = existing as { lifecycle_status: string } | null;
      if (row && row.lifecycle_status !== "draft") {
        throw new Error(
          `Cannot set draft version on resource with status ${row.lifecycle_status}; only draft resources can receive a new draft version through import.`,
        );
      }

      const updateQuery = db.from("lesson_resources").update({
        current_draft_version_id: versionId,
        lifecycle_status: "draft",
      });

      const updateEqChain = updateQuery as unknown as {
        eq(column: string, value: unknown): {
          eq(column: string, value: unknown): Promise<{
            error: { message: string } | null;
            data: unknown;
          }>;
        };
      };

      const { error } = await updateEqChain.eq("id", resourceId).eq("lifecycle_status", "draft");

      if (error) {
        throw new Error(`فشل تعيين نسخة المسودة: ${error.message}`);
      }
    },

    async submitResourceForReview(resourceId: string, lockVersion?: number): Promise<void> {
      await lifecycleDb.submitResourceForReview({ resourceId, expectedLockVersion: lockVersion });
    },

    async approveResource(resourceId: string, versionId: string, lockVersion?: number): Promise<void> {
      await lifecycleDb.approveResource({ resourceId, versionId, expectedLockVersion: lockVersion });
    },

    async rejectResource(
      resourceId: string,
      versionId: string,
      _reviewerId: string,
      reason: string | null,
      lockVersion?: number,
    ): Promise<void> {
      if (!reason || reason.trim().length === 0) {
        throw new Error("سبب الرفض مطلوب");
      }
      await lifecycleDb.rejectResource({
        resourceId,
        versionId,
        reason,
        expectedLockVersion: lockVersion,
      });
    },

    async unpublishResource(resourceId: string, lockVersion?: number): Promise<void> {
      await lifecycleDb.unpublishResource({ resourceId, expectedLockVersion: lockVersion });
    },

    async rollbackResource(resourceId: string, targetVersionId: string, lockVersion: number): Promise<void> {
      await lifecycleDb.rollbackResource({
        resourceId,
        targetVersionId,
        expectedLockVersion: lockVersion,
      });
    },

    async getReviewQueue(): Promise<ReviewQueueRow[]> {
      const supabaseLoose = adminClient as unknown as {
        from(table: string): {
          select(columns: string): {
            in(column: string, values: unknown[]): Promise<{
              data: unknown;
              error: { message: string } | null;
            }>;
            eq(column: string, value: unknown): Promise<{
              data: unknown;
              error: { message: string } | null;
            }>;
          };
        };
      };

      const { data, error } = await supabaseLoose
        .from("lesson_resources")
        .select(
          "id, title, description, resource_type, html_resource_type, resource_code, lesson_id, lifecycle_status, lock_version, current_draft_version_id",
        )
        .in("lifecycle_status", ["in_review", "approved", "draft"]);

      if (error) {
        throw new Error(`فشل جلب طابور المراجعة: ${error.message}`);
      }

      const rows = (data as Array<Record<string, unknown>>) || [];
      const result: ReviewQueueRow[] = [];

      for (const row of rows) {
        const resourceId = row.id as string;
        const draftVersionId = row.current_draft_version_id as string | null;

        let versionNumber: number | null = null;
        let contentSha: string | null = null;
        let submittedBy: string | null = null;
        let submittedAt: string | null = null;
        let findingsCount = 0;

        if (draftVersionId) {
          const { data: verData } = await db
            .from("lesson_resource_versions")
            .select("version_number, content_sha256, created_by, created_at")
            .eq("id", draftVersionId);

          const verRows = (verData as Array<Record<string, unknown>>) || [];
          if (verRows.length > 0) {
            versionNumber = verRows[0].version_number as number;
            contentSha = verRows[0].content_sha256 as string;
            submittedBy = verRows[0].created_by as string;
            submittedAt = verRows[0].created_at as string;
          }

          const { data: valData } = await db
            .from("content_package_validations")
            .select("findings")
            .eq("resource_version_id", draftVersionId);

          const valRows = (valData as Array<Record<string, unknown>>) || [];
          for (const v of valRows) {
            const findings = v.findings as unknown as SecurityFinding[];
            if (Array.isArray(findings)) {
              findingsCount += findings.length;
            }
          }
        }

        let lessonTitle = "";
        let subjectName = "";
        let gradeName = "";

        const lessonId = row.lesson_id as string;
        const { data: lessonData } = await db
          .from("lessons")
          .select("title, subject_id, grade_id")
          .eq("id", lessonId);

        const lessonRows = (lessonData as Array<Record<string, unknown>>) || [];
        if (lessonRows.length > 0) {
          lessonTitle = lessonRows[0].title as string;
        }

        result.push({
          resource_id: resourceId,
          resource_code: (row.resource_code as string | null) || resourceId,
          resource_type: (row.html_resource_type as string | null) || (row.resource_type as string),
          title: row.title as string,
          description: row.description as string | null,
          lesson_id: lessonId,
          lesson_title: lessonTitle,
          subject_name: subjectName,
          grade_name: gradeName,
          lifecycle_status: row.lifecycle_status as string,
          current_draft_version_id: draftVersionId,
          version_number: versionNumber,
          content_sha256: contentSha,
          submitted_by: submittedBy,
          submitted_at: submittedAt,
          findings_count: findingsCount,
          lock_version: row.lock_version as number,
        });
      }

      return result;
    },

    async getResourceEvents(
      resourceId: string,
    ): Promise<Array<{ event_type: string; created_at: string; payload: unknown }>> {
      const { data, error } = await db
        .from("lesson_resource_events")
        .select("event_type, created_at, payload")
        .eq("resource_id", resourceId);

      if (error) {
        return [];
      }

      return ((data as Array<Record<string, unknown>>) || []).map((row) => ({
        event_type: row.event_type as string,
        created_at: row.created_at as string,
        payload: row.payload,
      }));
    },

    async checkFeatureFlag(flagKey: string): Promise<boolean> {
      const { data, error } = await db
        .rpc("is_content_feature_enabled", { p_key: flagKey });

      if (error) return false;

      return data as boolean;
    },
  };
}
