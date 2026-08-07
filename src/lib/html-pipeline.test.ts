import { test, describe } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { StorageClientAdapter } from "./server/html-pipeline/storage-adapter";
import type { DatabaseClientAdapter } from "./server/html-pipeline/db-adapter";
import { createSupabaseDbAdapter } from "./server/html-pipeline/db-adapter";
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
} from "./server/html-pipeline/types";
import {
  createSignedUploadUrl,
  downloadAndValidateStoredZip,
  promoteApprovedPackage,
  createSignedStudentAccessUrl,
  cleanupOrCompensate,
} from "./server/html-pipeline/html-pipeline-service";
import {
  validateServerHtmlPackage,
  ANSWER_LEAKAGE_CODE,
  PII_LEAKAGE_CODE,
} from "./server/html-pipeline/package-validator";
import {
  parseMasterZipBuffer,
  computePackageDeterministicHash,
} from "@/lib/content-import/html-package";

const DRAFTS_BUCKET = "lesson-resource-drafts";
const PUBLISHED_BUCKET = "lesson-resource-published";

// In-Memory Test Storage Adapter
function createMockStorageAdapter(initialFiles: Record<string, Uint8Array> = {}): {
  adapter: StorageClientAdapter;
  files: Map<string, Uint8Array>;
  shouldFailSignedUploadUrl: boolean;
  shouldFailSignedUrl: boolean;
  shouldFailRemove: boolean;
} {
  const files = new Map<string, Uint8Array>();
  for (const [key, value] of Object.entries(initialFiles)) {
    files.set(key, value);
  }

  const state = {
    shouldFailSignedUploadUrl: false,
    shouldFailSignedUrl: false,
    shouldFailRemove: false,
  };

  const adapter: StorageClientAdapter = {
    async createSignedUploadUrl(bucket: string, path: string) {
      if (state.shouldFailSignedUploadUrl) {
        throw new Error("Storage signing service unavailable");
      }
      return {
        signedUrl: `https://storage.local/upload/${bucket}/${path}?token=mock`,
        token: "mock-token",
      };
    },

    async download(bucket: string, path: string) {
      const key = `${bucket}/${path}`;
      const data = files.get(key);
      if (!data) {
        return { data: null, error: new Error("File not found in storage") };
      }
      return { data, error: null };
    },

    async upload(
      bucket: string,
      path: string,
      bytes: Uint8Array,
      _mimeType = "application/octet-stream",
      upsert = false,
    ) {
      const key = `${bucket}/${path}`;
      if (!upsert && files.has(key)) {
        return { error: new Error("Object already exists and upsert is disabled") };
      }
      files.set(key, bytes);
      return { error: null };
    },

    async copy(fromBucket: string, fromPath: string, toBucket: string, toPath: string) {
      const fromKey = `${fromBucket}/${fromPath}`;
      const toKey = `${toBucket}/${toPath}`;
      const data = files.get(fromKey);
      if (!data) {
        return { error: new Error("Source object not found") };
      }
      if (files.has(toKey)) {
        return { error: new Error("Destination object exists") };
      }
      files.set(toKey, data);
      return { error: null };
    },

    async createSignedUrl(bucket: string, path: string, _expiresIn: number) {
      if (state.shouldFailSignedUrl) {
        return { signedUrl: null, error: new Error("Signed URL creation failed") };
      }
      return {
        signedUrl: `https://storage.local/signed/${bucket}/${path}?token=mock`,
        error: null,
      };
    },

    async remove(bucket: string, paths: string[]) {
      if (state.shouldFailRemove) {
        return { error: new Error("Storage remove operation failed") };
      }
      for (const p of paths) {
        files.delete(`${bucket}/${p}`);
      }
      return { error: null };
    },
  };

  return {
    adapter,
    files,
    get shouldFailSignedUploadUrl() {
      return state.shouldFailSignedUploadUrl;
    },
    set shouldFailSignedUploadUrl(val: boolean) {
      state.shouldFailSignedUploadUrl = val;
    },
    get shouldFailSignedUrl() {
      return state.shouldFailSignedUrl;
    },
    set shouldFailSignedUrl(val: boolean) {
      state.shouldFailSignedUrl = val;
    },
    get shouldFailRemove() {
      return state.shouldFailRemove;
    },
    set shouldFailRemove(val: boolean) {
      state.shouldFailRemove = val;
    },
  };
}

// Mock Database Adapter for Testing
function createMockDbAdapter(): {
  adapter: DatabaseClientAdapter;
  sessions: Map<string, ResolvedUploadSession>;
  validations: Map<string, ResolvedServerValidation>;
  resources: Map<
    string,
    {
      id: string;
      lesson_id: string;
      lifecycle_status: string;
      approved_version_id: string | null;
      published_version_id: string | null;
      lock_version: number;
    }
  >;
  versions: Map<
    string,
    {
      id: string;
      resource_id: string;
      version_number: number;
      content_sha256: string;
      immutable_at: string | null;
    }
  >;
  operations: Map<string, ResolvedStorageOperation>;
  currentActorId: string;
  currentRole: "admin" | "content_manager" | "student";
  studentCanAccessLesson: boolean;
} {
  const sessions = new Map<string, ResolvedUploadSession>();
  const validations = new Map<string, ResolvedServerValidation>();
  const resources = new Map<
    string,
    {
      id: string;
      lesson_id: string;
      lifecycle_status: string;
      approved_version_id: string | null;
      published_version_id: string | null;
      lock_version: number;
    }
  >();
  const versions = new Map<
    string,
    {
      id: string;
      resource_id: string;
      version_number: number;
      content_sha256: string;
      immutable_at: string | null;
    }
  >();
  const operations = new Map<string, ResolvedStorageOperation>();

  const state = {
    currentActorId: "usr_actor_1",
    currentRole: "admin" as "admin" | "content_manager" | "student",
    studentCanAccessLesson: true,
  };

  const adapter: DatabaseClientAdapter = {
    async resolveUploadSession(uploadSessionId: string): Promise<ResolvedUploadSession> {
      const sess = sessions.get(uploadSessionId);
      if (!sess) {
        throw new Error(`Upload session ${uploadSessionId} not found`);
      }
      if (sess.actor_id !== state.currentActorId && state.currentRole !== "admin") {
        throw new Error(
          `Actor ${state.currentActorId} cannot resolve upload session belonging to actor ${sess.actor_id}`,
        );
      }
      if (sess.is_expired || sess.status === "expired") {
        throw new Error(`Upload session ${uploadSessionId} is expired`);
      }
      return sess;
    },

    async recordServerValidation(params: RecordServerValidationParams): Promise<string> {
      const sess = sessions.get(params.uploadSessionId);
      if (!sess) {
        throw new Error(`Upload session ${params.uploadSessionId} not found`);
      }
      if (sess.expected_package_hash && sess.expected_package_hash !== params.packageHash) {
        throw new Error("Package hash mismatch between validation and upload session");
      }
      if (sess.staging_path !== params.storageObjectPath) {
        throw new Error("Storage object path mismatch between validation and upload session");
      }

      const ver = versions.get(params.resourceVersionId);
      if (!ver) {
        throw new Error(`Resource version ${params.resourceVersionId} not found`);
      }
      if (ver.resource_id !== sess.resource_id) {
        throw new Error("Cross-resource validation binding denied");
      }

      const valId = crypto.randomUUID();
      validations.set(valId, {
        validation_id: valId,
        upload_session_id: params.uploadSessionId,
        resource_version_id: params.resourceVersionId,
        package_hash: params.packageHash,
        is_valid: params.isValid,
        valid_until: params.validUntil,
        storage_object_path: params.storageObjectPath,
      });

      return valId;
    },

    async getValidServerValidation(
      resourceVersionId: string,
      uploadSessionId: string,
    ): Promise<ResolvedServerValidation | null> {
      for (const val of validations.values()) {
        if (
          val.resource_version_id === resourceVersionId &&
          val.upload_session_id === uploadSessionId &&
          val.is_valid
        ) {
          return val;
        }
      }
      return null;
    },

    async resolvePromotionBinding(options: {
      uploadSessionId?: string;
      resourceVersionId?: string;
    }): Promise<ResolvedPromotionBinding> {
      let sess: ResolvedUploadSession | undefined;
      let ver:
        | {
            id: string;
            resource_id: string;
            version_number: number;
            content_sha256: string;
            immutable_at: string | null;
          }
        | undefined;
      let val: ResolvedServerValidation | undefined;

      if (options.uploadSessionId) {
        sess = sessions.get(options.uploadSessionId);
        if (!sess) throw new Error("Upload session not found");

        for (const v of validations.values()) {
          if (v.upload_session_id === sess.session_id && v.is_valid) {
            val = v;
            break;
          }
        }
        if (!val) throw new Error("No valid active validation found for upload session");
        ver = versions.get(val.resource_version_id);
      } else if (options.resourceVersionId) {
        ver = versions.get(options.resourceVersionId);
        if (!ver) throw new Error("Resource version not found");

        for (const v of validations.values()) {
          if (v.resource_version_id === ver.id && v.is_valid) {
            val = v;
            break;
          }
        }
        if (!val) throw new Error("No valid active validation found for resource version");
        sess = sessions.get(val.upload_session_id);
      }

      if (!sess || !ver || !val) {
        throw new Error("Invalid promotion binding");
      }

      if (sess.is_expired || sess.status === "expired") {
        throw new Error("Upload session is expired");
      }

      const res = resources.get(ver.resource_id);
      if (!res) throw new Error("Resource not found");
      if (!["approved", "published"].includes(res.lifecycle_status)) {
        throw new Error(`Resource status ${res.lifecycle_status} is not eligible for promotion`);
      }
      if (res.approved_version_id !== ver.id) {
        throw new Error("Resource approved_version_id does not match target version");
      }
      if (!ver.immutable_at) {
        throw new Error("Resource version is not immutable");
      }
      if (sess.expected_package_hash && sess.expected_package_hash !== ver.content_sha256) {
        throw new Error("Package hash mismatch between upload session and resource version");
      }

      return {
        resource_id: res.id,
        version_id: ver.id,
        upload_session_id: sess.session_id,
        staging_path: sess.staging_path,
        expected_hash: ver.content_sha256,
        resource_code: sess.resource_code || res.id,
        version_number: ver.version_number,
        published_target_path: `published/${res.id}/${ver.version_number}`,
        valid_validation_id: val.validation_id,
        lock_version: res.lock_version,
      };
    },

    async resolveStudentResourceBinding(
      resourceId: string,
    ): Promise<ResolvedStudentResourceBinding> {
      const res = resources.get(resourceId);
      if (!res) throw new Error(`Resource ${resourceId} not found`);
      if (res.lifecycle_status !== "published" || !res.published_version_id) {
        throw new Error(`Resource ${resourceId} is not published`);
      }
      if (!state.studentCanAccessLesson) {
        throw new Error(`Student cannot access lesson ${res.lesson_id}`);
      }
      const ver = versions.get(res.published_version_id);
      if (!ver) throw new Error("Published version not found");

      return {
        resource_id: res.id,
        lesson_id: res.lesson_id,
        version_id: ver.id,
        resource_type: "html_interactive",
        title: "Test Lesson Resource",
        published_version_number: ver.version_number,
      };
    },

    async recordSuccessfulResourcePublication(
      params: RecordSuccessfulResourcePublicationParams,
    ): Promise<void> {
      const res = resources.get(params.resourceId);
      if (!res) {
        throw new Error(`Resource ${params.resourceId} not found`);
      }
      if (res.lifecycle_status !== "approved") {
        throw new Error(`Resource ${params.resourceId} is not approved`);
      }
      if (res.approved_version_id !== params.versionId) {
        throw new Error(`Resource approved_version_id does not match requested version`);
      }
      if (
        params.expectedLockVersion !== undefined &&
        res.lock_version !== params.expectedLockVersion
      ) {
        throw new Error(`Resource lock version mismatch`);
      }
      const ver = versions.get(params.versionId);
      if (!ver || ver.resource_id !== params.resourceId) {
        throw new Error(`Version ${params.versionId} does not belong to resource ${params.resourceId}`);
      }
      if (!ver.immutable_at) {
        throw new Error(`Version ${params.versionId} is not immutable`);
      }
      const op = operations.get(params.storageOperationId);
      if (!op) {
        throw new Error(`Storage operation ${params.storageOperationId} not found`);
      }
      if (op.resourceId !== params.resourceId) {
        throw new Error(`Storage operation belongs to a different resource`);
      }
      if (op.resourceVersionId !== params.versionId) {
        throw new Error(`Storage operation belongs to a different version`);
      }
      if (op.operationType !== "promote_published") {
        throw new Error(`Storage operation is not a promote_published operation`);
      }
      if (op.status !== "promoted") {
        throw new Error(`Storage operation status ${op.status} is not promoted`);
      }
      const expectedPath = `published/${params.resourceId}/${ver.version_number}`;
      if (!op.targetPath || op.targetPath !== expectedPath) {
        throw new Error(`Storage operation target_path does not match expected published path`);
      }
      if (!op.expectedHash || op.expectedHash !== ver.content_sha256) {
        throw new Error(`Storage operation expected_hash does not match version content_sha256`);
      }
      res.lifecycle_status = "published";
      res.published_version_id = params.versionId;
      res.lock_version = res.lock_version + 1;
    },

    async recordStorageOperation(op: StorageOperationRecord): Promise<string> {
      const id = crypto.randomUUID();
      operations.set(id, {
        id,
        actorId: op.actorId,
        resourceId: op.resourceId,
        resourceVersionId: op.resourceVersionId,
        uploadSessionId: op.uploadSessionId,
        sourcePath: op.sourcePath,
        targetPath: op.targetPath,
        expectedHash: op.expectedHash,
        operationType: op.operationType,
        parentOperationId: op.parentOperationId,
        status: "pending",
        retryNumber: op.retryNumber ?? 0,
        attemptCount: op.attemptCount ?? 1,
        idempotencyKey: op.idempotencyKey,
        failureCode: op.failureCode,
      });
      return id;
    },

    async updateStorageOperation(
      operationId: string,
      status: string,
      failureCode?: string,
    ): Promise<void> {
      const op = operations.get(operationId);
      if (op) {
        op.status = status;
        if (failureCode !== undefined) op.failureCode = failureCode;
        if (status === "cleaned" || status === "compensated") {
          op.completedAt = new Date().toISOString();
        }
      }
    },

    async resolveStorageOperation(operationId: string): Promise<ResolvedStorageOperation | null> {
      return operations.get(operationId) || null;
    },

    async submitResourceForReview(params: SubmitForReviewParams): Promise<void> {
      const res = resources.get(params.resourceId);
      if (!res) {
        throw new Error(`Resource ${params.resourceId} not found`);
      }
      if (res.lifecycle_status !== "draft") {
        throw new Error("Resource is not in draft status");
      }
      res.lifecycle_status = "in_review";
    },

    async approveResource(params: ApproveResourceParams): Promise<void> {
      const res = resources.get(params.resourceId);
      if (!res) {
        throw new Error(`Resource ${params.resourceId} not found`);
      }
      if (res.lifecycle_status !== "in_review") {
        throw new Error("Resource is not in review");
      }
      res.lifecycle_status = "approved";
      res.approved_version_id = params.versionId;
    },

    async rejectResource(params: RejectResourceParams): Promise<void> {
      const res = resources.get(params.resourceId);
      if (!res) {
        throw new Error(`Resource ${params.resourceId} not found`);
      }
      if (res.lifecycle_status !== "in_review") {
        throw new Error("Resource is not in review");
      }
      res.lifecycle_status = "rejected";
    },

    async unpublishResource(params: UnpublishResourceParams): Promise<void> {
      const res = resources.get(params.resourceId);
      if (!res) {
        throw new Error(`Resource ${params.resourceId} not found`);
      }
      if (res.lifecycle_status !== "published") {
        throw new Error("Resource is not published");
      }
      res.lifecycle_status = "approved";
      res.published_version_id = null;
    },

    async rollbackResource(params: RollbackResourceParams): Promise<void> {
      const res = resources.get(params.resourceId);
      if (!res) {
        throw new Error(`Resource ${params.resourceId} not found`);
      }
      if (res.lifecycle_status !== "published") {
        throw new Error("Resource is not published");
      }
      const ver = versions.get(params.targetVersionId);
      if (!ver || ver.resource_id !== params.resourceId) {
        throw new Error("Target version does not belong to resource");
      }
      if (!ver.immutable_at) {
        throw new Error("Target version is not immutable");
      }
      res.published_version_id = params.targetVersionId;
    },
  };

  return {
    adapter,
    sessions,
    validations,
    resources,
    versions,
    operations,
    get currentActorId() {
      return state.currentActorId;
    },
    set currentActorId(id: string) {
      state.currentActorId = id;
    },
    get currentRole() {
      return state.currentRole;
    },
    set currentRole(r: "admin" | "content_manager" | "student") {
      state.currentRole = r;
    },
    get studentCanAccessLesson() {
      return state.studentCanAccessLesson;
    },
    set studentCanAccessLesson(val: boolean) {
      state.studentCanAccessLesson = val;
    },
  };
}

// Helpers for test zip files
async function createValidHtmlZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "package/index.html",
    "<!DOCTYPE html><html><head><title>Test Lesson</title></head><body><h1>Content</h1></body></html>",
  );
  zip.file("package/style.css", "body { background: #fff; }");
  return zip.generateAsync({ type: "uint8array" });
}

async function createModifiedHtmlZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "package/index.html",
    "<!DOCTYPE html><html><head><title>Modified Lesson</title></head><body><h1>Modified Content</h1></body></html>",
  );
  zip.file("package/style.css", "body { background: #fff; }");
  return zip.generateAsync({ type: "uint8array" });
}

async function createUnsafeJsZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "package/index.html",
    "<!DOCTYPE html><html><body><script src='app.js'></script></body></html>",
  );
  zip.file("package/app.js", "const secret = eval('window.parent.document.cookie');");
  return zip.generateAsync({ type: "uint8array" });
}

async function createUnsafeCssZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "package/index.html",
    "<!DOCTYPE html><html><head><link rel='stylesheet' href='style.css'></head><body><h1>Test</h1></body></html>",
  );
  zip.file("package/style.css", "@import url('http://malicious.com/evil.css');");
  return zip.generateAsync({ type: "uint8array" });
}

async function createAnswerLeakageZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "package/index.html",
    '<!DOCTYPE html><html><body><div data-answer="secret_answer">Question</div></body></html>',
  );
  return zip.generateAsync({ type: "uint8array" });
}

async function createPiiLeakageZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "package/index.html",
    "<!DOCTYPE html><html><body><p>Contact us at teacher@test.com or 771234567</p></body></html>",
  );
  return zip.generateAsync({ type: "uint8array" });
}

async function computeCanonicalHash(zipBytes: Uint8Array): Promise<string> {
  const parseRes = await parseMasterZipBuffer(zipBytes);
  assert.equal(parseRes.isValid, true);
  const packageFiles =
    parseRes.packageMap["package"] || Object.values(parseRes.packageMap)[0] || [];
  return computePackageDeterministicHash(packageFiles);
}

// Stub Supabase clients for adapter wiring tests
interface StubSupabaseClient {
  calls: string[];
  rpc: (fn: string, _args: unknown) => Promise<{ data: unknown; error: null }>;
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (
        _column: string,
        _value: unknown,
      ) => {
        single: () => Promise<{ data: unknown; error: null }>;
      };
    };
    insert: (_values: unknown) => {
      select: (columns?: string) => {
        single: () => Promise<{ data: unknown; error: null }>;
      };
    };
    update: (_values: unknown) => {
      eq: (_column: string, _value: unknown) => Promise<{ error: null }>;
    };
  };
}

function createStubSupabaseClient(
  label: string,
): SupabaseClient<Database> & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    rpc: (fn: string, _args: unknown) => {
      calls.push(`${label}:rpc:${fn}`);
      if (fn === "resolve_upload_session") {
        return Promise.resolve({
          data: [
            {
              session_id: "00000000-0000-0000-0000-000000000001",
              batch_id: "batch_1",
              actor_id: "usr_actor_1",
              resource_id: "00000000-0000-0000-0000-000000000002",
              resource_code: "res_code_1",
              staging_path: "staging/usr_actor_1/batch_1/sess_1/package.zip",
              expected_package_hash: "canonical_hash",
              status: "active",
              expires_at: new Date(Date.now() + 3600000).toISOString(),
              is_expired: false,
            },
          ],
          error: null,
        });
      }
      if (fn === "record_server_validation") {
        return Promise.resolve({ data: "validation-id", error: null });
      }
      if (fn === "record_successful_resource_publication") {
        return Promise.resolve({ data: null, error: null });
      }
      if (fn === "get_valid_server_validation") {
        return Promise.resolve({ data: [], error: null });
      }
      if (fn === "resolve_promotion_binding") {
        return Promise.resolve({
          data: [
            {
              resource_id: "00000000-0000-0000-0000-000000000002",
              version_id: "00000000-0000-0000-0000-000000000003",
              upload_session_id: "00000000-0000-0000-0000-000000000001",
              staging_path: "staging/usr_actor_1/batch_1/sess_1/package.zip",
              expected_hash: "canonical_hash",
              resource_code: "res_code_1",
              version_number: 1,
              published_target_path: "published/res/1",
              valid_validation_id: "validation-id",
              lock_version: 1,
            },
          ],
          error: null,
        });
      }
      if (fn === "resolve_student_resource_binding") {
        return Promise.resolve({
          data: [
            {
              resource_id: "00000000-0000-0000-0000-000000000002",
              lesson_id: "00000000-0000-0000-0000-000000000004",
              version_id: "00000000-0000-0000-0000-000000000003",
              resource_type: "html_interactive",
              title: "Test",
              published_version_number: 1,
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => ({
      select: (columns?: string) => ({
        eq: (_column: string, _value: unknown) => ({
          single: () => {
            calls.push(`${label}:from:${table}:select:${columns ?? "*"}`);
            return Promise.resolve({ data: null, error: null });
          },
        }),
      }),
      insert: (_values: unknown) => ({
        select: (columns?: string) => ({
          single: () => {
            calls.push(`${label}:from:${table}:insert:select:${columns ?? "*"}`);
            return Promise.resolve({ data: { id: "op-id" }, error: null });
          },
        }),
      }),
      update: (_values: unknown) => ({
        eq: (_column: string, _value: unknown) => {
          calls.push(`${label}:from:${table}:update:eq`);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  } as unknown as SupabaseClient<Database> & { calls: string[] };
}

describe("Trusted HTML Server Pipeline — DB & Storage Foundation Contracts", () => {
  test("1. Authorization: cross-user upload session access denied", async () => {
    const mockStorage = createMockStorageAdapter();
    const mockDb = createMockDbAdapter();

    const sessId = "00000000-0000-0000-0000-000000000001";
    mockDb.sessions.set(sessId, {
      session_id: sessId,
      batch_id: "batch_1",
      actor_id: "usr_actor_owner",
      resource_id: "00000000-0000-0000-0000-000000000002",
      resource_code: "res_code_1",
      staging_path: "staging/usr_actor_owner/batch_1/sess_1/package.zip",
      expected_package_hash: null,
      status: "active",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      is_expired: false,
    });

    mockDb.currentActorId = "usr_actor_attacker";
    mockDb.currentRole = "content_manager";

    await assert.rejects(
      async () => {
        await createSignedUploadUrl(sessId, mockDb.adapter, mockStorage.adapter);
      },
      (err: Error) => {
        assert.match(err.message, /cannot resolve upload session belonging to actor/);
        return true;
      },
    );
  });

  test("2. Upload: session ownership, expired session denied, signed URL creation", async () => {
    const mockStorage = createMockStorageAdapter();
    const mockDb = createMockDbAdapter();

    const sessId = "00000000-0000-0000-0000-000000000010";
    const stagingPath = "staging/usr_actor_1/batch_1/sess_10/package.zip";
    mockDb.sessions.set(sessId, {
      session_id: sessId,
      batch_id: "batch_1",
      actor_id: "usr_actor_1",
      resource_id: "00000000-0000-0000-0000-000000000002",
      resource_code: "res_code_1",
      staging_path: stagingPath,
      expected_package_hash: null,
      status: "active",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      is_expired: false,
    });

    mockDb.currentActorId = "usr_actor_1";

    const res = await createSignedUploadUrl(sessId, mockDb.adapter, mockStorage.adapter);
    assert.equal(res.uploadSessionId, sessId);
    assert.equal(res.stagingPath, stagingPath);
    assert.ok(res.signedUploadUrl.includes("token=mock"));

    // Test Expired Session
    mockDb.sessions.get(sessId)!.is_expired = true;
    mockDb.sessions.get(sessId)!.status = "expired";

    await assert.rejects(
      async () => {
        await createSignedUploadUrl(sessId, mockDb.adapter, mockStorage.adapter);
      },
      (err: Error) => {
        assert.match(err.message, /is expired/);
        return true;
      },
    );
  });

  test("3. Validation: JS, CSS, PII, Answer leakage scanners exercised from raw bytes", async () => {
    const mockStorage = createMockStorageAdapter();
    const mockDb = createMockDbAdapter();

    // 3a. Unsafe JS
    const jsZip = await createUnsafeJsZip();
    const valJs = await validateServerHtmlPackage(jsZip);
    assert.equal(valJs.isValid, false);
    assert.ok(valJs.findings.some((f) => f.code === "FORBIDDEN_API_EVAL"));

    // 3b. Unsafe CSS
    const cssZip = await createUnsafeCssZip();
    const valCss = await validateServerHtmlPackage(cssZip);
    assert.equal(valCss.isValid, false);
    assert.ok(valCss.findings.some((f) => f.code === "CSS_IMPORT_NOT_ALLOWED"));

    // 3c. Answer Leakage
    const ansZip = await createAnswerLeakageZip();
    const valAns = await validateServerHtmlPackage(ansZip);
    assert.equal(valAns.isValid, false);
    assert.ok(valAns.findings.some((f) => f.code === ANSWER_LEAKAGE_CODE));

    // 3d. PII Leakage
    const piiZip = await createPiiLeakageZip();
    const valPii = await validateServerHtmlPackage(piiZip);
    assert.equal(valPii.isValid, false);
    assert.ok(valPii.findings.some((f) => f.code === PII_LEAKAGE_CODE));

    // 3e. Valid ZIP workflow with DB session recording
    const validZip = await createValidHtmlZip();
    const sessId = "00000000-0000-0000-0000-000000000020";
    const versionId = "00000000-0000-0000-0000-000000000021";
    const resId = "00000000-0000-0000-0000-000000000022";
    const stagingPath = "staging/usr_actor_1/batch_1/sess_20/package.zip";

    const preVal = await validateServerHtmlPackage(validZip);
    assert.equal(preVal.isValid, true);
    const expectedHash = preVal.packageHash;
    assert.ok(expectedHash.length > 0);

    mockDb.sessions.set(sessId, {
      session_id: sessId,
      batch_id: "batch_1",
      actor_id: "usr_actor_1",
      resource_id: resId,
      resource_code: "res_code_1",
      staging_path: stagingPath,
      expected_package_hash: expectedHash,
      status: "active",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      is_expired: false,
    });

    mockDb.versions.set(versionId, {
      id: versionId,
      resource_id: resId,
      version_number: 1,
      content_sha256: expectedHash,
      immutable_at: new Date().toISOString(),
    });

    mockStorage.files.set(`lesson-resource-drafts/${stagingPath}`, validZip);

    const valRes = await downloadAndValidateStoredZip(
      sessId,
      versionId,
      mockDb.adapter,
      mockStorage.adapter,
    );
    assert.equal(valRes.isValid, true);
    assert.ok(valRes.validationId);
    assert.equal(mockDb.validations.size, 1);
  });

  test("4. Promotion: DB promotion binding, canonical hash verification, overwrite protection", async () => {
    const mockStorage = createMockStorageAdapter();
    const mockDb = createMockDbAdapter();

    const validZip = await createValidHtmlZip();
    const hash = await computeCanonicalHash(validZip);

    const sessId = "00000000-0000-0000-0000-000000000030";
    const versionId = "00000000-0000-0000-0000-000000000031";
    const resId = "00000000-0000-0000-0000-000000000032";
    const stagingPath = "staging/usr_actor_1/batch_1/sess_30/package.zip";
    const actorId = "usr_admin_1";

    mockDb.sessions.set(sessId, {
      session_id: sessId,
      batch_id: "batch_1",
      actor_id: "usr_actor_1",
      resource_id: resId,
      resource_code: "res_code_1",
      staging_path: stagingPath,
      expected_package_hash: hash,
      status: "active",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      is_expired: false,
    });

    mockDb.resources.set(resId, {
      id: resId,
      lesson_id: "00000000-0000-0000-0000-000000000001",
      lifecycle_status: "approved",
      approved_version_id: versionId,
      published_version_id: null,
      lock_version: 1,
    });

    mockDb.versions.set(versionId, {
      id: versionId,
      resource_id: resId,
      version_number: 1,
      content_sha256: hash,
      immutable_at: new Date().toISOString(),
    });

    mockDb.validations.set("val_30", {
      validation_id: "val_30",
      upload_session_id: sessId,
      resource_version_id: versionId,
      package_hash: hash,
      is_valid: true,
      valid_until: new Date(Date.now() + 86400000).toISOString(),
      storage_object_path: stagingPath,
    });

    mockStorage.files.set(`lesson-resource-drafts/${stagingPath}`, validZip);

    // 4a. Successful promotion
    const promoteRes = await promoteApprovedPackage(
      { uploadSessionId: sessId },
      actorId,
      mockDb.adapter,
      mockStorage.adapter,
    );

    assert.equal(promoteRes.promoted, true);
    assert.equal(promoteRes.status, "promoted");
    assert.equal(promoteRes.publishedPath, `published/${resId}/1`);
    assert.equal(mockDb.resources.get(resId)!.lifecycle_status, "published");
    assert.equal(mockStorage.files.has(`lesson-resource-drafts/${stagingPath}`), false);
    assert.equal(mockStorage.files.has(`lesson-resource-published/published/${resId}/1`), true);

    // Operation should be terminal cleaned
    assert.equal(mockDb.operations.size, 1);
    const op = [...mockDb.operations.values()][0];
    assert.equal(op.status, "cleaned");
    assert.equal(op.operationType, "promote_published");
    assert.equal(op.sourcePath, stagingPath);
    assert.equal(op.targetPath, `published/${resId}/1`);
    assert.equal(op.expectedHash, hash);
    assert.equal(op.actorId, actorId);

    // 4b. Overwrite protection test (target existing)
    mockDb.resources.get(resId)!.lifecycle_status = "approved";
    mockDb.resources.get(resId)!.published_version_id = null;
    mockStorage.files.set(`lesson-resource-drafts/${stagingPath}`, validZip);

    const rePromote = await promoteApprovedPackage(
      { uploadSessionId: sessId },
      actorId,
      mockDb.adapter,
      mockStorage.adapter,
    );

    assert.equal(rePromote.promoted, false);
    assert.match(rePromote.errorDetails || "", /موجود مسبقاً/);
  });

  test("5. Cleanup pending: staging removal failure returns cleanup_pending status", async () => {
    const mockStorage = createMockStorageAdapter();
    const mockDb = createMockDbAdapter();

    const validZip = await createValidHtmlZip();
    const hash = await computeCanonicalHash(validZip);

    const sessId = "00000000-0000-0000-0000-000000000040";
    const versionId = "00000000-0000-0000-0000-000000000041";
    const resId = "00000000-0000-0000-0000-000000000042";
    const stagingPath = "staging/usr_actor_1/batch_1/sess_40/package.zip";
    const actorId = "usr_admin_1";

    mockDb.sessions.set(sessId, {
      session_id: sessId,
      batch_id: "batch_1",
      actor_id: "usr_actor_1",
      resource_id: resId,
      resource_code: "res_code_1",
      staging_path: stagingPath,
      expected_package_hash: hash,
      status: "active",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      is_expired: false,
    });

    mockDb.resources.set(resId, {
      id: resId,
      lesson_id: "00000000-0000-0000-0000-000000000001",
      lifecycle_status: "approved",
      approved_version_id: versionId,
      published_version_id: null,
      lock_version: 1,
    });

    mockDb.versions.set(versionId, {
      id: versionId,
      resource_id: resId,
      version_number: 1,
      content_sha256: hash,
      immutable_at: new Date().toISOString(),
    });

    mockDb.validations.set("val_40", {
      validation_id: "val_40",
      upload_session_id: sessId,
      resource_version_id: versionId,
      package_hash: hash,
      is_valid: true,
      valid_until: new Date(Date.now() + 86400000).toISOString(),
      storage_object_path: stagingPath,
    });

    mockStorage.files.set(`lesson-resource-drafts/${stagingPath}`, validZip);
    mockStorage.shouldFailRemove = true; // Force staging remove failure

    const promoteRes = await promoteApprovedPackage(
      { uploadSessionId: sessId },
      actorId,
      mockDb.adapter,
      mockStorage.adapter,
    );

    assert.equal(promoteRes.promoted, true);
    assert.equal(promoteRes.status, "cleanup_pending");
    assert.match(promoteRes.errorDetails || "", /تعذر حذف ملف Staging/);

    const op = [...mockDb.operations.values()][0];
    assert.equal(op.status, "cleanup_pending");
  });

  test("6. Compensation: authoritative storage_operation_id, target removal, fail-closed error handling", async () => {
    const mockStorage = createMockStorageAdapter();
    const mockDb = createMockDbAdapter();

    const opId = "00000000-0000-0000-0000-000000000050";
    const publishedPath = "published/res_50/1";
    const stagingPath = "staging/usr_1/batch_1/sess_50/pkg.zip";
    const actorId = "usr_admin_1";

    mockDb.operations.set(opId, {
      id: opId,
      actorId,
      resourceId: "res_50",
      resourceVersionId: "ver_50",
      sourcePath: stagingPath,
      targetPath: publishedPath,
      expectedHash: "hash50",
      operationType: "promote_published",
      status: "failed",
      retryNumber: 0,
      attemptCount: 1,
    });

    mockStorage.files.set(`lesson-resource-published/${publishedPath}`, new Uint8Array([1, 2, 3]));

    // 6a. Successful compensation removes only the published target
    const compRes = await cleanupOrCompensate(
      { storageOperationId: opId },
      mockDb.adapter,
      mockStorage.adapter,
    );

    assert.equal(compRes.compensated, true);
    assert.equal(compRes.status, "compensated");
    assert.equal(mockStorage.files.has(`lesson-resource-published/${publishedPath}`), false);

    // 6b. Compensation denied for non-failed operations
    mockDb.operations.get(opId)!.status = "cleaned";
    mockStorage.files.set(`lesson-resource-published/${publishedPath}`, new Uint8Array([1, 2, 3]));

    await assert.rejects(
      async () => {
        await cleanupOrCompensate(
          { storageOperationId: opId },
          mockDb.adapter,
          mockStorage.adapter,
        );
      },
      (err: Error) => {
        assert.match(err.message, /لا يمكن تنفيذ التعويض/);
        return true;
      },
    );

    // 6c. Fail-closed compensation on storage error
    mockDb.operations.get(opId)!.status = "failed";
    mockStorage.files.set(`lesson-resource-published/${publishedPath}`, new Uint8Array([1, 2, 3]));
    mockStorage.shouldFailRemove = true;

    const compFail = await cleanupOrCompensate(
      { storageOperationId: opId },
      mockDb.adapter,
      mockStorage.adapter,
    );

    assert.equal(compFail.compensated, false);
    assert.equal(compFail.status, "failed");
    assert.match(compFail.details || "", /فشل إزالة الملف المنشور الجزئي/);
  });

  test("7. Student Access: DB binding resolution, draft denied, TTL server-controlled", async () => {
    const mockStorage = createMockStorageAdapter();
    const mockDb = createMockDbAdapter();

    const resId = "00000000-0000-0000-0000-000000000060";
    const versionId = "00000000-0000-0000-0000-000000000061";
    const lessonId = "00000000-0000-0000-0000-000000000001";

    mockDb.resources.set(resId, {
      id: resId,
      lesson_id: lessonId,
      lifecycle_status: "published",
      approved_version_id: versionId,
      published_version_id: versionId,
      lock_version: 1,
    });

    mockDb.versions.set(versionId, {
      id: versionId,
      resource_id: resId,
      version_number: 1,
      content_sha256: "hash60",
      immutable_at: new Date().toISOString(),
    });

    // 7a. Granted access
    const grantRes = await createSignedStudentAccessUrl(
      { resourceId: resId },
      mockDb.adapter,
      mockStorage.adapter,
    );
    assert.equal(grantRes.granted, true);
    assert.ok(grantRes.signedUrl?.includes("signed/lesson-resource-published/published/"));
    assert.equal(grantRes.expiresInSeconds, 900);

    // 7b. Draft denied
    mockDb.resources.get(resId)!.lifecycle_status = "draft";
    await assert.rejects(
      async () => {
        await createSignedStudentAccessUrl(
          { resourceId: resId },
          mockDb.adapter,
          mockStorage.adapter,
        );
      },
      (err: Error) => {
        assert.match(err.message, /is not published/);
        return true;
      },
    );

    // 7c. Lesson access denied
    mockDb.resources.get(resId)!.lifecycle_status = "published";
    mockDb.studentCanAccessLesson = false;
    await assert.rejects(
      async () => {
        await createSignedStudentAccessUrl(
          { resourceId: resId },
          mockDb.adapter,
          mockStorage.adapter,
        );
      },
      (err: Error) => {
        assert.match(err.message, /Student cannot access lesson/);
        return true;
      },
    );
  });

  test("8. Target canonical hash verification rejects modified target bytes", async () => {
    const mockStorage = createMockStorageAdapter();
    const mockDb = createMockDbAdapter();

    const validZip = await createValidHtmlZip();
    const tamperedZip = await createModifiedHtmlZip();

    const hash = await computeCanonicalHash(validZip);
    const tamperedHash = await computeCanonicalHash(tamperedZip);
    assert.notEqual(hash, tamperedHash);

    const sessId = "00000000-0000-0000-0000-000000000070";
    const versionId = "00000000-0000-0000-0000-000000000071";
    const resId = "00000000-0000-0000-0000-000000000072";
    const stagingPath = "staging/usr_actor_1/batch_1/sess_70/package.zip";
    const publishedPath = `published/${resId}/1`;
    const actorId = "usr_admin_1";

    mockDb.sessions.set(sessId, {
      session_id: sessId,
      batch_id: "batch_1",
      actor_id: "usr_actor_1",
      resource_id: resId,
      resource_code: "res_code_1",
      staging_path: stagingPath,
      expected_package_hash: hash,
      status: "active",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      is_expired: false,
    });

    mockDb.resources.set(resId, {
      id: resId,
      lesson_id: "00000000-0000-0000-0000-000000000001",
      lifecycle_status: "approved",
      approved_version_id: versionId,
      published_version_id: null,
      lock_version: 1,
    });

    mockDb.versions.set(versionId, {
      id: versionId,
      resource_id: resId,
      version_number: 1,
      content_sha256: hash,
      immutable_at: new Date().toISOString(),
    });

    mockDb.validations.set("val_70", {
      validation_id: "val_70",
      upload_session_id: sessId,
      resource_version_id: versionId,
      package_hash: hash,
      is_valid: true,
      valid_until: new Date(Date.now() + 86400000).toISOString(),
      storage_object_path: stagingPath,
    });

    mockStorage.files.set(`lesson-resource-drafts/${stagingPath}`, validZip);

    // Storage adapter that returns tampered bytes when verifying the published target.
    let targetDownloadCount = 0;
    const tamperAdapter: StorageClientAdapter = {
      ...mockStorage.adapter,
      async download(bucket, path) {
        if (bucket === PUBLISHED_BUCKET && path === publishedPath) {
          targetDownloadCount++;
          // First download is the overwrite-protection existence check.
          if (targetDownloadCount === 1) {
            return { data: null, error: new Error("not found") };
          }
          // Second download is the target verification read.
          return { data: tamperedZip, error: null };
        }
        return mockStorage.adapter.download(bucket, path);
      },
    };

    const promoteRes = await promoteApprovedPackage(
      { uploadSessionId: sessId },
      actorId,
      mockDb.adapter,
      tamperAdapter,
    );

    assert.equal(promoteRes.promoted, false);
    assert.equal(promoteRes.status, "failed");
    assert.match(promoteRes.errorDetails || "", /توقيع المستهدف/);

    // Partial target must be removed after verification failure.
    assert.equal(mockStorage.files.has(`lesson-resource-published/${publishedPath}`), false);
  });

  test("9. Source canonical hash verification rejects tampered staging bytes", async () => {
    const mockStorage = createMockStorageAdapter();
    const mockDb = createMockDbAdapter();

    const validZip = await createValidHtmlZip();
    const tamperedZip = await createModifiedHtmlZip();
    const hash = await computeCanonicalHash(validZip);
    const tamperedHash = await computeCanonicalHash(tamperedZip);
    assert.notEqual(hash, tamperedHash);

    const sessId = "00000000-0000-0000-0000-000000000080";
    const versionId = "00000000-0000-0000-0000-000000000081";
    const resId = "00000000-0000-0000-0000-000000000082";
    const stagingPath = "staging/usr_actor_1/batch_1/sess_80/package.zip";
    const actorId = "usr_admin_1";

    mockDb.sessions.set(sessId, {
      session_id: sessId,
      batch_id: "batch_1",
      actor_id: "usr_actor_1",
      resource_id: resId,
      resource_code: "res_code_1",
      staging_path: stagingPath,
      expected_package_hash: hash,
      status: "active",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      is_expired: false,
    });

    mockDb.resources.set(resId, {
      id: resId,
      lesson_id: "00000000-0000-0000-0000-000000000001",
      lifecycle_status: "approved",
      approved_version_id: versionId,
      published_version_id: null,
      lock_version: 1,
    });

    mockDb.versions.set(versionId, {
      id: versionId,
      resource_id: resId,
      version_number: 1,
      content_sha256: hash,
      immutable_at: new Date().toISOString(),
    });

    mockDb.validations.set("val_80", {
      validation_id: "val_80",
      upload_session_id: sessId,
      resource_version_id: versionId,
      package_hash: hash,
      is_valid: true,
      valid_until: new Date(Date.now() + 86400000).toISOString(),
      storage_object_path: stagingPath,
    });

    // Store tampered bytes as staging
    mockStorage.files.set(`lesson-resource-drafts/${stagingPath}`, tamperedZip);

    const promoteRes = await promoteApprovedPackage(
      { uploadSessionId: sessId },
      actorId,
      mockDb.adapter,
      mockStorage.adapter,
    );

    assert.equal(promoteRes.promoted, false);
    assert.equal(promoteRes.status, "failed");
    assert.match(promoteRes.errorDetails || "", /توقيع Staging/);
  });

  test("10. createSupabaseDbAdapter requires admin client and routes service-role contracts to it", async () => {
    const userStub = createStubSupabaseClient("user") as { calls: string[] };
    const adminStub = createStubSupabaseClient("admin") as { calls: string[] };
    const userClient = userStub as unknown as SupabaseClient<Database>;
    const adminClient = adminStub as unknown as SupabaseClient<Database>;

    assert.throws(
      () =>
        createSupabaseDbAdapter({
          userClient,
          adminClient: null as unknown as SupabaseClient<Database>,
        }),
      /Missing admin\/service-role Supabase client/,
    );

    const adapter = createSupabaseDbAdapter({
      userClient,
      adminClient,
    });

    // User-scoped contract
    await adapter.resolveUploadSession("00000000-0000-0000-0000-000000000001");
    assert.ok(userStub.calls.some((c) => c.includes("resolve_upload_session")));

    // Service-role-only contracts
    await adapter.recordServerValidation({
      uploadSessionId: "00000000-0000-0000-0000-000000000001",
      resourceVersionId: "00000000-0000-0000-0000-000000000003",
      packageHash: "canonical_hash",
      scannerVersion: "v-test",
      findings: [],
      isValid: true,
      validUntil: new Date(Date.now() + 3600000).toISOString(),
      storageObjectPath: "staging/path.zip",
    });
    assert.ok(adminStub.calls.some((c) => c.includes("record_server_validation")));

    await adapter.resolvePromotionBinding({
      uploadSessionId: "00000000-0000-0000-0000-000000000001",
    });
    assert.ok(adminStub.calls.some((c) => c.includes("resolve_promotion_binding")));

    await adapter.recordStorageOperation({
      actorId: "usr_admin_1",
      resourceId: "00000000-0000-0000-0000-000000000002",
      resourceVersionId: "00000000-0000-0000-0000-000000000003",
      sourcePath: "staging/path.zip",
      targetPath: "published/res/1",
      expectedHash: "canonical_hash",
      operationType: "promote_published",
    });
    assert.ok(adminStub.calls.some((c) => c.includes("storage_operations:insert")));
  });

  test("11. publication calls atomic record_successful_resource_publication RPC via admin client", async () => {
    const adminStub = createStubSupabaseClient("admin") as { calls: string[] };
    const adminClient = adminStub as unknown as SupabaseClient<Database>;
    const adapter = createSupabaseDbAdapter({
      userClient: adminClient,
      adminClient,
    });

    await adapter.recordSuccessfulResourcePublication({
      resourceId: "00000000-0000-0000-0000-000000000002",
      versionId: "00000000-0000-0000-0000-000000000003",
      storageOperationId: "00000000-0000-0000-0000-000000000010",
      uploadSessionId: "00000000-0000-0000-0000-000000000001",
      expectedLockVersion: 5,
    });

    const call = adminStub.calls.find((c) => c.includes("record_successful_resource_publication"));
    assert.ok(call, "record_successful_resource_publication RPC must be called");
    assert.ok(
      !adminStub.calls.some((c) => c.includes("lesson_resources:update")),
      "publication must not use direct lesson_resources update",
    );
  });

  test("12. record_successful_resource_publication propagates DB RPC errors", async () => {
    const failingClient = {
      rpc: (_fn: string, _args: unknown) =>
        Promise.resolve({ data: null, error: { message: "publication RPC denied" } }),
      from: (_table: string) => ({
        select: (_columns?: string) => ({
          eq: (_column: string, _value: unknown) => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
        insert: (_values: unknown) => ({
          select: (_columns?: string) => ({
            single: () => Promise.resolve({ data: { id: "op-id" }, error: null }),
          }),
        }),
        update: (_values: unknown) => ({
          eq: (_column: string, _value: unknown) => Promise.resolve({ error: null }),
        }),
      }),
    } as unknown as SupabaseClient<Database>;

    const adapter = createSupabaseDbAdapter({
      userClient: failingClient,
      adminClient: failingClient,
    });

    await assert.rejects(
      async () =>
        adapter.recordSuccessfulResourcePublication({
          resourceId: "res-1",
          versionId: "ver-1",
          storageOperationId: "op-1",
        }),
      /publication RPC denied/,
    );
  });
});
