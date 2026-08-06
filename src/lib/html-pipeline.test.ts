import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import type { StorageClientAdapter } from "./server/html-pipeline/storage-adapter";
import type { DatabaseClientAdapter } from "./server/html-pipeline/db-adapter";
import type {
  ResolvedUploadSession,
  RecordServerValidationParams,
  ResolvedServerValidation,
  ResolvedPromotionBinding,
  ResolvedStudentResourceBinding,
  StorageOperationRecord,
  ResolvedStorageOperation,
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

    async upload(bucket: string, path: string, bytes: Uint8Array, _mimeType = "application/octet-stream", upsert = false) {
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
  resources: Map<string, { id: string; lesson_id: string; lifecycle_status: string; approved_version_id: string | null; published_version_id: string | null }>;
  versions: Map<string, { id: string; resource_id: string; version_number: number; content_sha256: string; immutable_at: string | null }>;
  operations: Map<string, ResolvedStorageOperation>;
  currentActorId: string;
  currentRole: "admin" | "content_manager" | "student";
  studentCanAccessLesson: boolean;
} {
  const sessions = new Map<string, ResolvedUploadSession>();
  const validations = new Map<string, ResolvedServerValidation>();
  const resources = new Map<string, { id: string; lesson_id: string; lifecycle_status: string; approved_version_id: string | null; published_version_id: string | null }>();
  const versions = new Map<string, { id: string; resource_id: string; version_number: number; content_sha256: string; immutable_at: string | null }>();
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
        throw new Error(`Actor ${state.currentActorId} cannot resolve upload session belonging to actor ${sess.actor_id}`);
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

    async getValidServerValidation(resourceVersionId: string, uploadSessionId: string): Promise<ResolvedServerValidation | null> {
      for (const val of validations.values()) {
        if (val.resource_version_id === resourceVersionId && val.upload_session_id === uploadSessionId && val.is_valid) {
          return val;
        }
      }
      return null;
    },

    async resolvePromotionBinding(options: { uploadSessionId?: string; resourceVersionId?: string }): Promise<ResolvedPromotionBinding> {
      let sess: ResolvedUploadSession | undefined;
      let ver: { id: string; resource_id: string; version_number: number; content_sha256: string; immutable_at: string | null } | undefined;
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
      };
    },

    async resolveStudentResourceBinding(resourceId: string): Promise<ResolvedStudentResourceBinding> {
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

    async recordPublicationState(resourceId: string, versionId: string): Promise<void> {
      const res = resources.get(resourceId);
      if (res) {
        res.lifecycle_status = "published";
        res.published_version_id = versionId;
      }
    },

    async recordStorageOperation(op: StorageOperationRecord): Promise<string> {
      const id = crypto.randomUUID();
      operations.set(id, {
        id,
        operation_type: op.operationType,
        upload_session_id: op.uploadSessionId,
        resource_version_id: op.resourceVersionId,
        staging_path: op.stagingPath,
        published_path: op.publishedPath,
        status: op.status,
        details: op.details,
      });
      return id;
    },

    async updateStorageOperation(operationId: string, status: string, details?: string): Promise<void> {
      const op = operations.get(operationId);
      if (op) {
        op.status = status;
        if (details) op.details = details;
      }
    },

    async resolveStorageOperation(operationId: string): Promise<ResolvedStorageOperation | null> {
      return operations.get(operationId) || null;
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
    "<!DOCTYPE html><html><head><title>Test Lesson</title></head><body><h1>Content</h1></body></html>"
  );
  zip.file("package/style.css", "body { background: #fff; }");
  return zip.generateAsync({ type: "uint8array" });
}

async function createUnsafeJsZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "package/index.html",
    "<!DOCTYPE html><html><body><script src='app.js'></script></body></html>"
  );
  zip.file("package/app.js", "const secret = eval('window.parent.document.cookie');");
  return zip.generateAsync({ type: "uint8array" });
}

async function createUnsafeCssZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "package/index.html",
    "<!DOCTYPE html><html><head><link rel='stylesheet' href='style.css'></head><body><h1>Test</h1></body></html>"
  );
  zip.file("package/style.css", "@import url('http://malicious.com/evil.css');");
  return zip.generateAsync({ type: "uint8array" });
}

async function createAnswerLeakageZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "package/index.html",
    '<!DOCTYPE html><html><body><div data-answer="secret_answer">Question</div></body></html>'
  );
  return zip.generateAsync({ type: "uint8array" });
}

async function createPiiLeakageZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "package/index.html",
    '<!DOCTYPE html><html><body><p>Contact us at teacher@test.com or 771234567</p></body></html>'
  );
  return zip.generateAsync({ type: "uint8array" });
}

function computeBytesSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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
      }
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
      }
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

    const valRes = await downloadAndValidateStoredZip(sessId, versionId, mockDb.adapter, mockStorage.adapter);
    assert.equal(valRes.isValid, true);
    assert.ok(valRes.validationId);
    assert.equal(mockDb.validations.size, 1);
  });

  test("4. Promotion: DB promotion binding, hash verification, overwrite protection", async () => {
    const mockStorage = createMockStorageAdapter();
    const mockDb = createMockDbAdapter();

    const validZip = await createValidHtmlZip();
    const hash = computeBytesSha256(validZip);

    const sessId = "00000000-0000-0000-0000-000000000030";
    const versionId = "00000000-0000-0000-0000-000000000031";
    const resId = "00000000-0000-0000-0000-000000000032";
    const stagingPath = "staging/usr_actor_1/batch_1/sess_30/package.zip";

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
      mockDb.adapter,
      mockStorage.adapter
    );

    assert.equal(promoteRes.promoted, true);
    assert.equal(promoteRes.status, "promoted");
    assert.equal(promoteRes.publishedPath, `published/${resId}/1`);
    assert.equal(mockDb.resources.get(resId)!.lifecycle_status, "published");
    assert.equal(mockStorage.files.has(`lesson-resource-drafts/${stagingPath}`), false);
    assert.equal(mockStorage.files.has(`lesson-resource-published/published/${resId}/1`), true);

    // 4b. Overwrite protection test (target existing)
    mockDb.resources.get(resId)!.lifecycle_status = "approved";
    mockStorage.files.set(`lesson-resource-drafts/${stagingPath}`, validZip);

    const rePromote = await promoteApprovedPackage(
      { uploadSessionId: sessId },
      mockDb.adapter,
      mockStorage.adapter
    );

    assert.equal(rePromote.promoted, false);
    assert.match(rePromote.errorDetails || "", /موجود مسبقاً/);
  });

  test("5. Cleanup pending: staging removal failure returns cleanup_pending status", async () => {
    const mockStorage = createMockStorageAdapter();
    const mockDb = createMockDbAdapter();

    const validZip = await createValidHtmlZip();
    const hash = computeBytesSha256(validZip);

    const sessId = "00000000-0000-0000-0000-000000000040";
    const versionId = "00000000-0000-0000-0000-000000000041";
    const resId = "00000000-0000-0000-0000-000000000042";
    const stagingPath = "staging/usr_actor_1/batch_1/sess_40/package.zip";

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
      mockDb.adapter,
      mockStorage.adapter
    );

    assert.equal(promoteRes.promoted, true);
    assert.equal(promoteRes.status, "cleanup_pending");
    assert.match(promoteRes.errorDetails || "", /تعذر حذف ملف Staging/);
  });

  test("6. Compensation: partial target removal and fail-closed error handling", async () => {
    const mockStorage = createMockStorageAdapter();
    const mockDb = createMockDbAdapter();

    const opId = "00000000-0000-0000-0000-000000000050";
    const publishedPath = "published/res_50/1";
    const stagingPath = "staging/usr_1/batch_1/sess_50/pkg.zip";

    mockDb.operations.set(opId, {
      id: opId,
      operation_type: "promote_published",
      staging_path: stagingPath,
      published_path: publishedPath,
      status: "failed",
    });

    mockStorage.files.set(`lesson-resource-published/${publishedPath}`, new Uint8Array([1, 2, 3]));
    mockStorage.files.set(`lesson-resource-drafts/${stagingPath}`, new Uint8Array([4, 5, 6]));

    // 6a. Successful compensation
    const compRes = await cleanupOrCompensate(
      { storageOperationId: opId },
      mockDb.adapter,
      mockStorage.adapter
    );

    assert.equal(compRes.compensated, true);
    assert.equal(compRes.status, "compensated");
    assert.equal(mockStorage.files.has(`lesson-resource-published/${publishedPath}`), false);
    assert.equal(mockStorage.files.has(`lesson-resource-drafts/${stagingPath}`), false);

    // 6b. Fail-closed compensation on storage error
    mockStorage.files.set(`lesson-resource-published/${publishedPath}`, new Uint8Array([1, 2, 3]));
    mockStorage.shouldFailRemove = true;

    const compFail = await cleanupOrCompensate(
      { storageOperationId: opId },
      mockDb.adapter,
      mockStorage.adapter
    );

    assert.equal(compFail.compensated, false);
    assert.equal(compFail.status, "failed");
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
      mockStorage.adapter
    );
    assert.equal(grantRes.granted, true);
    assert.ok(grantRes.signedUrl?.includes("signed/lesson-resource-published/published/"));
    assert.equal(grantRes.expiresInSeconds, 900);

    // 7b. Draft denied
    mockDb.resources.get(resId)!.lifecycle_status = "draft";
    await assert.rejects(
      async () => {
        await createSignedStudentAccessUrl({ resourceId: resId }, mockDb.adapter, mockStorage.adapter);
      },
      (err: Error) => {
        assert.match(err.message, /is not published/);
        return true;
      }
    );

    // 7c. Lesson access denied
    mockDb.resources.get(resId)!.lifecycle_status = "published";
    mockDb.studentCanAccessLesson = false;
    await assert.rejects(
      async () => {
        await createSignedStudentAccessUrl({ resourceId: resId }, mockDb.adapter, mockStorage.adapter);
      },
      (err: Error) => {
        assert.match(err.message, /Student cannot access lesson/);
        return true;
      }
    );
  });
});
