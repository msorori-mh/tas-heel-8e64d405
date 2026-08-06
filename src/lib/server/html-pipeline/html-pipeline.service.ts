import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseMasterZipBuffer, validateSingleHtmlPackage, ValidationCodes } from "@/lib/content-import/html-package";
import type { SecurityFinding } from "@/lib/content-import/html-package/types";
import { ProductionSupabaseStorageAdapter, type StorageAdapter } from "./storage-adapter";
import type {
  ClaimIdempotencyKeyResultRow,
  CreateUploadSessionParams,
  CreateUploadSessionResult,
  FinalizeUploadSessionParams,
  FinalizeUploadSessionResult,
  GetStudentResourceAccessParams,
  GetStudentResourceAccessResult,
  HtmlPipelineConfig,
  PipelineDatabase,
  PromoteVersionParams,
  PromoteVersionResult,
  ResolvePromotionBindingResultRow,
  ResolveStudentResourceBindingResultRow,
  ResolveUploadSessionResultRow,
  StorageOperationRow,
  ValidServerValidationResultRow,
  ValidateStoredPackageParams,
  ValidateStoredPackageResult,
} from "./types";

const DEFAULT_BUCKET = "html-packages";

function normalizeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function computeSha256Hex(buffer: Uint8Array): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export class HtmlPipelineService {
  private bucketName: string;
  private storageAdapter: StorageAdapter;
  private supabase: SupabaseClient<PipelineDatabase>;

  constructor(config: HtmlPipelineConfig = {}) {
    this.bucketName = config.bucketName ?? DEFAULT_BUCKET;
    this.storageAdapter = config.storageAdapter ?? new ProductionSupabaseStorageAdapter();
    this.supabase = (config.supabaseClient ?? supabaseAdmin) as unknown as SupabaseClient<PipelineDatabase>;
  }

  /**
   * Helper to check feature flag via DB RPC
   */
  async isFeatureEnabled(flagKey: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("is_content_feature_enabled", {
      p_key: flagKey,
    });
    if (error || data !== true) {
      return false;
    }
    return true;
  }

  /**
   * Helper for atomic idempotency claiming
   */
  private async claimIdempotency(
    operation: string,
    key?: string
  ): Promise<{ ledgerId: string | null; result?: unknown }> {
    if (!key) return { ledgerId: null };

    const { data, error } = await this.supabase.rpc("claim_idempotency_key", {
      p_operation: operation,
      p_key: key,
    });

    if (error || !data || data.length === 0) {
      throw new Error(`Idempotency claim failed for key ${key}: ${error?.message ?? "unknown error"}`);
    }

    const row = data[0] as unknown as ClaimIdempotencyKeyResultRow;

    if (!row.claimed) {
      if (row.current_status === "succeeded") {
        return { ledgerId: row.ledger_id, result: row.previous_result };
      }
      if (row.current_status === "in_progress") {
        throw new Error(`Operation ${operation} with key ${key} is currently in progress`);
      }
      if (row.current_status === "failed") {
        throw new Error(`Operation ${operation} with key ${key} previously failed`);
      }
    }

    return { ledgerId: row.ledger_id };
  }

  private async completeIdempotency(ledgerId: string | null, result: unknown): Promise<void> {
    if (!ledgerId) return;
    const { error } = await this.supabase.rpc("complete_idempotency_key", {
      p_ledger_id: ledgerId,
      p_result: result as Record<string, unknown>,
    });
    if (error) {
      console.error(`Failed to complete idempotency key ${ledgerId}: ${error.message}`);
    }
  }

  private async failIdempotency(ledgerId: string | null, errorObj: unknown): Promise<void> {
    if (!ledgerId) return;
    const errMsg = normalizeError(errorObj);
    const { error } = await this.supabase.rpc("fail_idempotency_key", {
      p_ledger_id: ledgerId,
      p_error: { message: errMsg },
    });
    if (error) {
      console.error(`Failed to record idempotency failure for ${ledgerId}: ${error.message}`);
    }
  }

  /**
   * 1. Create Authoritative Upload Session
   */
  async createUploadSession(
    actorId: string,
    params: CreateUploadSessionParams
  ): Promise<CreateUploadSessionResult> {
    const backendEnabled = await this.isFeatureEnabled("html_content_backend");
    const uploadEnabled = await this.isFeatureEnabled("html_content_upload");
    if (!backendEnabled || !uploadEnabled) {
      throw new Error("HTML content upload feature is disabled");
    }

    const claim = await this.claimIdempotency("create_upload_session", params.idempotencyKey);
    if (claim.result) {
      return claim.result as CreateUploadSessionResult;
    }

    try {
      let batchId = params.batchId;
      if (!batchId) {
        const { data: newBatch, error: batchErr } = await this.supabase
          .from("content_import_batches")
          .insert({
            actor_id: actorId,
            status: "created",
          })
          .select("id")
          .single();

        if (batchErr || !newBatch) {
          throw new Error(`Failed to create import batch: ${batchErr?.message ?? "unknown error"}`);
        }
        batchId = (newBatch as { id: string }).id;
      }

      const uploadSessionId = crypto.randomUUID();
      const stagingPath = `html-packages/staging/${batchId}/${params.resourceId}/${uploadSessionId}.zip`;
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

      const { error: sessionErr } = await this.supabase
        .from("lesson_resource_upload_sessions")
        .insert({
          id: uploadSessionId,
          batch_id: batchId,
          actor_id: actorId,
          resource_id: params.resourceId,
          resource_code: params.resourceCode ?? null,
          staging_path: stagingPath,
          expected_package_hash: params.expectedPackageHash,
          original_filename: params.originalFilename,
          status: "issued",
          expires_at: expiresAt,
        });

      if (sessionErr) {
        throw new Error(`Failed to create upload session: ${sessionErr.message}`);
      }

      const signed = await this.storageAdapter.createSignedUploadUrl(
        this.bucketName,
        stagingPath,
        3600
      );

      const result: CreateUploadSessionResult = {
        uploadSessionId,
        batchId,
        resourceId: params.resourceId,
        stagingPath,
        expectedPackageHash: params.expectedPackageHash,
        signedUploadUrl: signed.signedUrl,
        expiresAt,
      };

      await this.completeIdempotency(claim.ledgerId, result);
      return result;
    } catch (err) {
      await this.failIdempotency(claim.ledgerId, err);
      throw err;
    }
  }

  /**
   * 2. Finalize Stored Upload
   */
  async finalizeUploadSession(
    actorId: string,
    params: FinalizeUploadSessionParams
  ): Promise<FinalizeUploadSessionResult> {
    const backendEnabled = await this.isFeatureEnabled("html_content_backend");
    if (!backendEnabled) {
      throw new Error("HTML content backend feature is disabled");
    }

    const claim = await this.claimIdempotency("finalize_upload_session", params.idempotencyKey);
    if (claim.result) {
      return claim.result as FinalizeUploadSessionResult;
    }

    try {
      const { data: sessionData, error: sessionErr } = await this.supabase.rpc(
        "resolve_upload_session",
        { p_upload_session_id: params.uploadSessionId }
      );

      if (sessionErr || !sessionData || sessionData.length === 0) {
        throw new Error(`Failed to resolve upload session: ${sessionErr?.message ?? "Session not found or invalid"}`);
      }

      const session = sessionData[0] as unknown as ResolveUploadSessionResultRow;

      if (session.actor_id !== actorId) {
        throw new Error(`Actor ${actorId} does not own upload session ${params.uploadSessionId}`);
      }

      const bytes = await this.storageAdapter.download(this.bucketName, session.staging_path);
      if (!bytes || bytes.length === 0) {
        throw new Error(`Stored file is empty or missing at ${session.staging_path}`);
      }

      const computedHash = computeSha256Hex(bytes);

      if (computedHash !== session.expected_package_hash) {
        await this.supabase
          .from("lesson_resource_upload_sessions")
          .update({ status: "failed" })
          .eq("id", session.session_id);
        throw new Error(
          `Stored package hash mismatch: expected ${session.expected_package_hash}, got ${computedHash}`
        );
      }

      const { error: updateErr } = await this.supabase
        .from("lesson_resource_upload_sessions")
        .update({
          status: "uploaded",
          finalized_at: new Date().toISOString(),
        })
        .eq("id", session.session_id);

      if (updateErr) {
        throw new Error(`Failed to finalize upload session in DB: ${updateErr.message}`);
      }

      const result: FinalizeUploadSessionResult = {
        uploadSessionId: session.session_id,
        stagingPath: session.staging_path,
        contentSha256: computedHash,
        byteSize: bytes.length,
        status: "uploaded",
      };

      await this.completeIdempotency(claim.ledgerId, result);
      return result;
    } catch (err) {
      await this.failIdempotency(claim.ledgerId, err);
      throw err;
    }
  }

  /**
   * 3. Server Package Validation & Persistence
   */
  async validateStoredPackage(
    actorId: string,
    params: ValidateStoredPackageParams
  ): Promise<ValidateStoredPackageResult> {
    const backendEnabled = await this.isFeatureEnabled("html_content_backend");
    if (!backendEnabled) {
      throw new Error("HTML content backend feature is disabled");
    }

    const claim = await this.claimIdempotency("validate_stored_package", params.idempotencyKey);
    if (claim.result) {
      return claim.result as ValidateStoredPackageResult;
    }

    try {
      const { data: sessionData, error: sessionErr } = await this.supabase.rpc(
        "resolve_upload_session",
        { p_upload_session_id: params.uploadSessionId }
      );

      if (sessionErr || !sessionData || sessionData.length === 0) {
        throw new Error(`Failed to resolve upload session: ${sessionErr?.message ?? "Session not found"}`);
      }

      const session = sessionData[0] as unknown as ResolveUploadSessionResultRow;

      if (session.actor_id !== actorId) {
        throw new Error(`Actor ${actorId} does not own upload session ${params.uploadSessionId}`);
      }

      const bytes = await this.storageAdapter.download(this.bucketName, session.staging_path);
      const computedHash = computeSha256Hex(bytes);

      if (computedHash !== session.expected_package_hash) {
        throw new Error(`Stored package hash mismatch during validation: expected ${session.expected_package_hash}, got ${computedHash}`);
      }

      const zipIngest = await parseMasterZipBuffer(bytes);
      const findings: SecurityFinding[] = [...zipIngest.findings];

      let isValid = zipIngest.isValid;
      let manifest: Record<string, unknown> = {};

      if (isValid && Object.keys(zipIngest.packageMap).length > 0) {
        const resCode = session.resource_code || Object.keys(zipIngest.packageMap)[0];
        const files = zipIngest.packageMap[resCode] || Object.values(zipIngest.packageMap)[0] || [];
        const singleValidation = await validateSingleHtmlPackage(resCode, files, bytes.length);
        findings.push(...singleValidation.findings);
        isValid = singleValidation.isValid && findings.filter((f) => f.severity === "error").length === 0;
        manifest = (singleValidation.manifest as unknown as Record<string, unknown>) || {};
      } else if (Object.keys(zipIngest.packageMap).length === 0) {
        isValid = false;
        findings.push({
          code: ValidationCodes.MISSING_INDEX_HTML,
          severity: "error",
          message: "No resource folder found inside master ZIP package",
        });
      }

      let versionId = params.resourceVersionId;
      if (!versionId) {
        const { data: existingVer, error: verQueryErr } = await this.supabase
          .from("lesson_resource_versions")
          .select("id")
          .eq("resource_id", session.resource_id)
          .eq("content_sha256", computedHash)
          .maybeSingle();

        if (verQueryErr) {
          throw new Error(`Failed to check existing version: ${verQueryErr.message}`);
        }

        if (existingVer) {
          versionId = (existingVer as { id: string }).id;
        } else {
          const { data: maxVerRow } = await this.supabase
            .from("lesson_resource_versions")
            .select("version_number")
            .eq("resource_id", session.resource_id)
            .order("version_number", { ascending: false })
            .limit(1)
            .maybeSingle();

          const nextVerNum = ((maxVerRow as { version_number: number } | null)?.version_number ?? 0) + 1;

          const { data: newVer, error: createVerErr } = await this.supabase
            .from("lesson_resource_versions")
            .insert({
              resource_id: session.resource_id,
              version_number: nextVerNum,
              content_sha256: computedHash,
              manifest,
              created_by: actorId,
            })
            .select("id")
            .single();

          if (createVerErr || !newVer) {
            throw new Error(`Failed to create lesson resource version: ${createVerErr?.message ?? "unknown error"}`);
          }

          versionId = (newVer as { id: string }).id;
        }
      }

      const scannerVersion = "pr59-v1";
      const validUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

      const { data: validationId, error: recErr } = await this.supabase.rpc(
        "record_server_validation",
        {
          p_upload_session_id: session.session_id,
          p_resource_version_id: versionId,
          p_package_hash: computedHash,
          p_scanner_version: scannerVersion,
          p_findings: findings as unknown as Record<string, unknown>[],
          p_is_valid: isValid,
          p_valid_until: validUntil,
          p_storage_object_path: session.staging_path,
          p_storage_object_version: null,
        }
      );

      if (recErr || !validationId) {
        throw new Error(`Failed to record server validation: ${recErr?.message ?? "unknown error"}`);
      }

      if (isValid) {
        const { data: validCheck, error: checkErr } = await this.supabase.rpc(
          "get_valid_server_validation",
          {
            p_resource_version_id: versionId,
            p_upload_session_id: session.session_id,
          }
        );

        if (checkErr || !validCheck || validCheck.length === 0) {
          throw new Error("Recorded validation failed DB get_valid_server_validation verification");
        }
      }

      const result: ValidateStoredPackageResult = {
        validationId: validationId as string,
        uploadSessionId: session.session_id,
        resourceVersionId: versionId,
        packageHash: computedHash,
        isValid,
        validUntil,
        findings,
        scannerVersion,
      };

      await this.completeIdempotency(claim.ledgerId, result);
      return result;
    } catch (err) {
      await this.failIdempotency(claim.ledgerId, err);
      throw err;
    }
  }

  /**
   * 4. Admin Promotion Binding & Compensation State Machine
   */
  async promoteVersion(
    actorId: string,
    params: PromoteVersionParams
  ): Promise<PromoteVersionResult> {
    const publishEnabled = await this.isFeatureEnabled("html_content_publish");
    if (!publishEnabled) {
      throw new Error("HTML content publish feature is disabled");
    }

    const claim = await this.claimIdempotency("promote_version", params.idempotencyKey);
    if (claim.result) {
      return claim.result as PromoteVersionResult;
    }

    try {
      const { data: bindingData, error: bindErr } = await this.supabase.rpc(
        "resolve_promotion_binding",
        {
          p_upload_session_id: params.uploadSessionId ?? null,
          p_resource_version_id: params.resourceVersionId ?? null,
        }
      );

      if (bindErr || !bindingData || bindingData.length === 0) {
        throw new Error(`Failed to resolve promotion binding: ${bindErr?.message ?? "Binding not found"}`);
      }

      const binding = bindingData[0] as unknown as ResolvePromotionBindingResultRow;

      const stagingBytes = await this.storageAdapter.download(this.bucketName, binding.staging_path);
      const computedStagingHash = computeSha256Hex(stagingBytes);

      if (computedStagingHash !== binding.expected_hash) {
        throw new Error(`Staging content hash mismatch: expected ${binding.expected_hash}, got ${computedStagingHash}`);
      }

      const storageOpId = crypto.randomUUID();
      const { error: opInsertErr } = await this.supabase.from("storage_operations").insert({
        id: storageOpId,
        actor_id: actorId,
        resource_id: binding.resource_id,
        resource_version_id: binding.version_id,
        upload_session_id: binding.upload_session_id,
        source_path: binding.staging_path,
        target_path: binding.published_target_path,
        expected_hash: binding.expected_hash,
        operation_type: "promote_published",
        status: "pending",
        retry_number: 0,
        attempt_count: 1,
        idempotency_key: params.idempotencyKey ?? null,
      });

      if (opInsertErr) {
        throw new Error(`Failed to create storage operation record: ${opInsertErr.message}`);
      }

      let storageUploadSuccessful = false;

      try {
        const targetExists = await this.storageAdapter.exists(
          this.bucketName,
          binding.published_target_path
        );

        if (targetExists) {
          const existingTargetBytes = await this.storageAdapter.download(
            this.bucketName,
            binding.published_target_path
          );
          const existingHash = computeSha256Hex(existingTargetBytes);
          if (existingHash !== binding.expected_hash) {
            throw new Error(`Target path ${binding.published_target_path} already exists with differing content hash`);
          }
        } else {
          await this.storageAdapter.upload(
            this.bucketName,
            binding.published_target_path,
            stagingBytes,
            { contentType: "application/zip", upsert: false }
          );
        }

        await this.supabase
          .from("storage_operations")
          .update({ status: "uploaded" })
          .eq("id", storageOpId);

        const targetBytes = await this.storageAdapter.download(
          this.bucketName,
          binding.published_target_path
        );
        const computedTargetHash = computeSha256Hex(targetBytes);

        if (computedTargetHash !== binding.expected_hash) {
          throw new Error(`Target object hash verification failed: expected ${binding.expected_hash}, got ${computedTargetHash}`);
        }

        await this.supabase
          .from("storage_operations")
          .update({ status: "verified" })
          .eq("id", storageOpId);

        await this.supabase
          .from("storage_operations")
          .update({ status: "promoted" })
          .eq("id", storageOpId);

        storageUploadSuccessful = true;
      } catch (storageErr) {
        const errMsg = normalizeError(storageErr);
        await this.supabase
          .from("storage_operations")
          .update({ status: "failed", failure_code: errMsg })
          .eq("id", storageOpId);

        try {
          const partialExists = await this.storageAdapter.exists(
            this.bucketName,
            binding.published_target_path
          );
          if (partialExists) {
            await this.storageAdapter.remove(this.bucketName, binding.published_target_path);
          }
          await this.supabase
            .from("storage_operations")
            .update({ status: "compensated" })
            .eq("id", storageOpId);
        } catch (compensationErr) {
          throw new Error(
            `Storage promotion failed (${errMsg}) AND compensation removal failed: ${normalizeError(compensationErr)}`
          );
        }

        throw new Error(`Storage promotion failed: ${errMsg}`);
      }

      if (!storageUploadSuccessful) {
        throw new Error("Storage promotion failed prior to DB publish contract");
      }

      const { error: dbPublishErr } = await this.supabase
        .from("lesson_resources")
        .update({
          published_version_id: binding.version_id,
          lifecycle_status: "published",
        })
        .eq("id", binding.resource_id);

      if (dbPublishErr) {
        throw new Error(`DB publish status update failed after storage promotion: ${dbPublishErr.message}`);
      }

      await this.supabase.from("lesson_resource_events").insert({
        resource_id: binding.resource_id,
        resource_version_id: binding.version_id,
        actor_id: actorId,
        event_type: "publish",
        payload: {
          upload_session_id: binding.upload_session_id,
          published_target_path: binding.published_target_path,
          expected_hash: binding.expected_hash,
        },
      });

      try {
        await this.supabase
          .from("storage_operations")
          .update({ status: "cleanup_pending" })
          .eq("id", storageOpId);

        await this.storageAdapter.remove(this.bucketName, binding.staging_path);

        await this.supabase
          .from("storage_operations")
          .update({ status: "cleaned" })
          .eq("id", storageOpId);
      } catch (cleanupErr) {
        console.warn(`Staging cleanup warning for ${binding.staging_path}: ${normalizeError(cleanupErr)}`);
      }

      const result: PromoteVersionResult = {
        resourceId: binding.resource_id,
        versionId: binding.version_id,
        publishedTargetPath: binding.published_target_path,
        storageOperationId: storageOpId,
        status: "promoted",
      };

      await this.completeIdempotency(claim.ledgerId, result);
      return result;
    } catch (err) {
      await this.failIdempotency(claim.ledgerId, err);
      throw err;
    }
  }

  /**
   * Helper to retry a failed storage operation following the retry contract
   */
  async retryStorageOperation(
    actorId: string,
    parentOperationId: string
  ): Promise<StorageOperationRow> {
    const { data: parentData, error: parentErr } = await this.supabase
      .from("storage_operations")
      .select("*")
      .eq("id", parentOperationId)
      .single();

    if (parentErr || !parentData) {
      throw new Error(`Parent storage operation ${parentOperationId} not found`);
    }

    const parent = parentData as unknown as StorageOperationRow;

    if (parent.status !== "failed") {
      throw new Error(`Cannot retry operation with status ${parent.status}, parent must be in 'failed' status`);
    }

    const newOpId = crypto.randomUUID();
    const newRetryNum = parent.retry_number + 1;
    const newAttemptCount = parent.attempt_count + 1;

    const { data: newOp, error: insertErr } = await this.supabase
      .from("storage_operations")
      .insert({
        id: newOpId,
        actor_id: parent.actor_id,
        resource_id: parent.resource_id,
        resource_version_id: parent.resource_version_id,
        upload_session_id: parent.upload_session_id,
        source_path: parent.source_path,
        target_path: parent.target_path,
        expected_hash: parent.expected_hash,
        operation_type: parent.operation_type,
        parent_operation_id: parent.id,
        status: "pending",
        retry_number: newRetryNum,
        attempt_count: newAttemptCount,
        idempotency_key: parent.idempotency_key ? `${parent.idempotency_key}_retry_${newRetryNum}` : null,
      })
      .select("*")
      .single();

    if (insertErr || !newOp) {
      throw new Error(`Failed to create retry storage operation: ${insertErr?.message ?? "unknown error"}`);
    }

    return newOp as unknown as StorageOperationRow;
  }

  /**
   * 5. Student Signed Resource Access
   */
  async getStudentSignedAccess(
    params: GetStudentResourceAccessParams
  ): Promise<GetStudentResourceAccessResult> {
    const studentReadEnabled = await this.isFeatureEnabled("html_content_student_read");
    if (!studentReadEnabled) {
      throw new Error("HTML content student access feature is disabled");
    }

    const { data: bindingData, error: bindErr } = await this.supabase.rpc(
      "resolve_student_resource_binding",
      { p_resource_id: params.resourceId }
    );

    if (bindErr || !bindingData || bindingData.length === 0) {
      throw new Error(`Student access denied: ${bindErr?.message ?? "Resource not published or inaccessible"}`);
    }

    const binding = bindingData[0] as unknown as ResolveStudentResourceBindingResultRow;

    const storagePath = `published/${binding.resource_id}/${binding.published_version_number}`;

    const signed = await this.storageAdapter.createSignedUrl(
      this.bucketName,
      storagePath,
      600
    );

    if (!signed.signedUrl) {
      throw new Error("Failed to generate student signed URL");
    }

    return {
      resourceId: binding.resource_id,
      lessonId: binding.lesson_id,
      versionId: binding.version_id,
      title: binding.title,
      signedUrl: signed.signedUrl,
      expiresIn: 600,
    };
  }
}
