import { test, describe } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { StorageClientAdapter } from "./server/html-pipeline/storage-adapter";
import {
  createUploadSession,
  createSignedUploadUrl,
  finalizeUploadedObject,
  downloadAndValidateStoredZip,
  promoteApprovedPackage,
  createSignedStudentAccessUrl,
  cleanupOrCompensate,
} from "./server/html-pipeline/html-pipeline-service";
import { validateServerHtmlPackage, ANSWER_LEAKAGE_CODE } from "./server/html-pipeline/package-validator";

// In-Memory Test Storage Adapter
function createMockStorageAdapter(initialFiles: Record<string, Uint8Array> = {}): {
  adapter: StorageClientAdapter;
  files: Map<string, Uint8Array>;
  shouldFailSignedUploadUrl: boolean;
  shouldFailSignedUrl: boolean;
} {
  const files = new Map<string, Uint8Array>();
  for (const [key, value] of Object.entries(initialFiles)) {
    files.set(key, value);
  }

  const state = {
    shouldFailSignedUploadUrl: false,
    shouldFailSignedUrl: false,
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
  };
}

// Helper to build a sample valid HTML zip inside a folder
async function createValidHtmlZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "package/index.html",
    "<!DOCTYPE html><html><head><title>Test Lesson</title></head><body><h1>Content</h1></body></html>"
  );
  zip.file("package/style.css", "body { background: #fff; }");
  return zip.generateAsync({ type: "uint8array" });
}

// Helper to build an unsafe HTML zip with answer leakage
async function createUnsafeHtmlZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "package/index.html",
    '<!DOCTYPE html><html><body><div data-answer="secret_answer">Question</div></body></html>'
  );
  return zip.generateAsync({ type: "uint8array" });
}

describe("Trusted HTML Storage Server Pipeline Contracts", () => {
  test("Contract 1: signing failure throws clear error", async () => {
    const mock = createMockStorageAdapter();
    mock.shouldFailSignedUploadUrl = true;

    await assert.rejects(
      async () => {
        await createUploadSession(
          "usr_actor_123",
          { batchId: "batch_1", resourceCode: "res_code_1", filename: "package.zip" },
          mock.adapter
        );
      },
      (err: Error) => {
        assert.match(err.message, /Storage signing service unavailable|فشل إنشاء رابط/);
        return true;
      }
    );
  });

  test("Contract 2: real byte upload contract", async () => {
    const mock = createMockStorageAdapter();
    const session = await createUploadSession(
      "usr_actor_123",
      { batchId: "batch_1", resourceCode: "res_code_1", filename: "package.zip" },
      mock.adapter
    );

    assert.ok(session.signedUploadUrl.includes("token=mock"));
    assert.ok(session.stagingPath.startsWith("staging/usr_actor_123/batch_1/"));

    const zipBytes = await createValidHtmlZip();
    mock.files.set(`lesson-resource-drafts/${session.stagingPath}`, zipBytes);

    const finalized = await finalizeUploadedObject("usr_actor_123", session.stagingPath, mock.adapter);
    assert.equal(finalized.finalized, true);
    assert.equal(finalized.fileSizeBytes, zipBytes.byteLength);
  });

  test("Contract 3: hash mismatch prevents promotion", async () => {
    const mock = createMockStorageAdapter();
    const zipBytes = await createValidHtmlZip();
    const stagingPath = "staging/usr_actor_123/batch_1/sess_1/package.zip";
    mock.files.set(`lesson-resource-drafts/${stagingPath}`, zipBytes);

    const wrongSha256 = "0000000000000000000000000000000000000000000000000000000000000000";

    const result = await promoteApprovedPackage(
      {
        stagingPath,
        resourceCode: "res_code_1",
        versionNumber: 1,
        expectedContentSha256: wrongSha256,
      },
      mock.adapter
    );

    assert.equal(result.promoted, false);
    assert.equal(result.status, "failed");
    assert.match(result.errorDetails || "", /لا يطابق التوقيع المتوقع/);
  });

  test("Contract 4: unsafe package is detected on server byte inspection", async () => {
    const mock = createMockStorageAdapter();
    const unsafeZip = await createUnsafeHtmlZip();
    const stagingPath = "staging/usr_actor_123/batch_1/sess_2/package.zip";
    mock.files.set(`lesson-resource-drafts/${stagingPath}`, unsafeZip);

    const validation = await downloadAndValidateStoredZip(stagingPath, mock.adapter);

    assert.equal(validation.isValid, false);
    const answerFinding = validation.findings.find(
      (f) => f.code === ANSWER_LEAKAGE_CODE
    );
    assert.ok(answerFinding, "Should detect answer leakage in raw zip bytes");
  });

  test("Contract 5: forged client validation is rejected by server download check", async () => {
    const mock = createMockStorageAdapter();
    const nonExistentPath = "staging/usr_actor_123/batch_1/sess_fake/package.zip";

    const validation = await downloadAndValidateStoredZip(nonExistentPath, mock.adapter);
    assert.equal(validation.isValid, false);
    assert.equal(validation.findings[0].code, "ZIP_INGESTION_FAILED");
  });

  test("Contract 6: overwrite protection (upsert=false)", async () => {
    const mock = createMockStorageAdapter();
    const zipBytes = await createValidHtmlZip();

    const valResult = await validateServerHtmlPackage(zipBytes);
    assert.equal(valResult.isValid, true);
    const realHash = valResult.packageHash;

    const stagingPath = "staging/usr_actor_123/batch_1/sess_3/package.zip";
    mock.files.set(`lesson-resource-drafts/${stagingPath}`, zipBytes);

    const publishedPath = `published/res_code_1/1/${realHash}`;
    // Pre-populate published path to simulate existing file
    mock.files.set(`lesson-resource-published/${publishedPath}`, new Uint8Array([1, 2, 3]));

    const result = await promoteApprovedPackage(
      {
        stagingPath,
        resourceCode: "res_code_1",
        versionNumber: 1,
        expectedContentSha256: realHash,
      },
      mock.adapter
    );

    assert.equal(result.promoted, false);
    assert.match(result.errorDetails || "", /upsert is disabled|موجود مسبقاً/);
  });

  test("Contract 7 & 8: partial promotion & compensation", async () => {
    const mock = createMockStorageAdapter();

    const compResult = await cleanupOrCompensate(
      {
        operationType: "promote_published",
        publishedPath: "published/res_code_1/1/fakehash",
        stagingPath: "staging/usr_1/batch_1/sess_1/pkg.zip",
        reason: "Test partial failure rollback",
      },
      mock.adapter
    );

    assert.equal(compResult.compensated, true);
    assert.equal(compResult.status, "compensated");
  });

  test("Contract 9: student access denied for draft/staging or unauthorized lesson", async () => {
    const mock = createMockStorageAdapter();

    // Attempt 1: Status is draft
    const res1 = await createSignedStudentAccessUrl(
      {
        lessonId: "00000000-0000-0000-0000-000000000001",
        resourceId: "00000000-0000-0000-0000-000000000002",
        publishedVersionId: "00000000-0000-0000-0000-000000000003",
        status: "draft",
        publishedPath: "published/code/1/hash",
      },
      true,
      mock.adapter
    );
    assert.equal(res1.granted, false);

    // Attempt 2: Staging path provided
    const res2 = await createSignedStudentAccessUrl(
      {
        lessonId: "00000000-0000-0000-0000-000000000001",
        resourceId: "00000000-0000-0000-0000-000000000002",
        publishedVersionId: "00000000-0000-0000-0000-000000000003",
        status: "published",
        publishedPath: "staging/usr/batch/sess/pkg.zip",
      },
      true,
      mock.adapter
    );
    assert.equal(res2.granted, false);

    // Attempt 3: Student has no access to lesson
    const res3 = await createSignedStudentAccessUrl(
      {
        lessonId: "00000000-0000-0000-0000-000000000001",
        resourceId: "00000000-0000-0000-0000-000000000002",
        publishedVersionId: "00000000-0000-0000-0000-000000000003",
        status: "published",
        publishedPath: "published/code/1/hash",
      },
      false, // studentCanAccessLesson = false
      mock.adapter
    );
    assert.equal(res3.granted, false);
  });

  test("Contract 10: signed URL failure handling", async () => {
    const mock = createMockStorageAdapter();
    mock.shouldFailSignedUrl = true;

    const res = await createSignedStudentAccessUrl(
      {
        lessonId: "00000000-0000-0000-0000-000000000001",
        resourceId: "00000000-0000-0000-0000-000000000002",
        publishedVersionId: "00000000-0000-0000-0000-000000000003",
        status: "published",
        publishedPath: "published/code/1/hash",
      },
      true,
      mock.adapter
    );

    assert.equal(res.granted, false);
    assert.match(res.reason || "", /فشل إنشاء رابط الوصول الموقع/);
  });
});
