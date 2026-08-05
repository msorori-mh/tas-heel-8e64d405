import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateServerHtmlPackage, executeServerPackageValidationWorkflow } from "./package-validator-server";
import { issueServerUploadSession, StorageClientAdapter } from "./upload-service";
import { buildPublishedStoragePath, promoteStagingToPublished } from "./publish-service";
import { generateStudentSignedAccess } from "./signed-access-service";
import { ValidationCodes } from "../../content-import/html-package";
import JSZip from "jszip";

// Mock storage adapter for DI tests
function createMockStorageAdapter(initialFiles: Record<string, Uint8Array> = {}): StorageClientAdapter & { files: Record<string, Uint8Array> } {
  const files: Record<string, Uint8Array> = { ...initialFiles };
  return {
    files,
    async createSignedUploadUrl(bucket: string, path: string) {
      return {
        signedUrl: `https://storage.test/${bucket}/${path}?sign=token`,
        token: "test-token-123",
      };
    },
    async download(bucket: string, path: string) {
      const key = `${bucket}/${path}`;
      if (files[key]) {
        return { data: files[key], error: null };
      }
      return { data: null, error: new Error(`File not found: ${key}`) };
    },
    async upload(bucket: string, path: string, bytes: Uint8Array) {
      const key = `${bucket}/${path}`;
      if (files[key]) {
        return { error: new Error("File already exists (overwrite forbidden)") };
      }
      files[key] = bytes;
      return { error: null };
    },
    async copy(fromBucket: string, fromPath: string, toBucket: string, toPath: string) {
      const srcKey = `${fromBucket}/${fromPath}`;
      const dstKey = `${toBucket}/${toPath}`;
      if (!files[srcKey]) {
        return { error: new Error("Source file not found") };
      }
      if (files[dstKey]) {
        return { error: new Error("Destination file already exists") };
      }
      files[dstKey] = files[srcKey];
      return { error: null };
    },
    async createSignedUrl(bucket: string, path: string, expiresIn: number) {
      const key = `${bucket}/${path}`;
      if (!files[key]) {
        return { signedUrl: null, error: new Error("File not found") };
      }
      return {
        signedUrl: `https://cdn.test/${bucket}/${path}?token=signed-token-expires-${expiresIn}`,
        error: null,
      };
    },
  };
}

describe("Server-side Content Onboarding Operational Adapters & Workflow", () => {
  it("should validate server HTML package and reject PII & answer leakage", async () => {
    const zip = new JSZip();
    zip.file("MM-001/index.html", `
      <!DOCTYPE html>
      <html>
      <head><title>Test</title></head>
      <body>
        <div data-answer="secret_key">Answer</div>
        <p>Contact us at test@example.com</p>
      </body>
      </html>
    `);

    const zipBytes = await zip.generateAsync({ type: "uint8array" });
    const res = await validateServerHtmlPackage(zipBytes, "MM-001");

    assert.equal(res.isValid, false, "Package with answer leakage and PII must be rejected");
    assert.ok(res.findings.some((f) => f.code === ValidationCodes.PII_LEAKAGE_DETECTED), "Must detect PII leakage");
    assert.ok(res.findings.some((f) => f.code === ValidationCodes.ANSWER_LEAKAGE_DETECTED), "Must detect answer leakage");
  });

  it("should issue staging upload session with signed upload URL via operational adapter", async () => {
    const mockAdapter = createMockStorageAdapter();
    const session = await issueServerUploadSession(
      {
        actorId: "actor-123",
        batchId: "batch-456",
        resourceCode: "MM-G12-BIO-001",
        filename: "package.zip",
      },
      mockAdapter
    );

    assert.ok(session.stagingPath.startsWith("staging/actor-123/batch-456/"), "Staging path must use actor/batch ownership prefix");
    assert.equal(session.bucket, "lesson-resource-drafts");
    assert.ok(session.signedUploadUrl?.includes("lesson-resource-drafts"), "Signed upload URL must be issued");
  });

  it("should build deterministic published path and execute staging-to-published promotion via adapter", async () => {
    const zipContent = new Uint8Array([1, 2, 3, 4]);
    const mockAdapter = createMockStorageAdapter({
      "lesson-resource-drafts/staging/actor-1/batch-1/session-1/pkg.zip": zipContent,
    });

    const options = {
      resourceCode: "MM-G12-BIO-001",
      versionNumber: 2,
      contentSha256: "abc123hash",
      stagingPath: "staging/actor-1/batch-1/session-1/pkg.zip",
    };

    const pubPath = buildPublishedStoragePath(options);
    assert.equal(pubPath.publishedPath, "published/mm-g12-bio-001/2/abc123hash");
    assert.equal(pubPath.bucket, "lesson-resource-published");

    const promRes = await promoteStagingToPublished(options, mockAdapter);
    assert.equal(promRes.promoted, true, "Staging content must be promoted");
    assert.equal(promRes.status, "promoted");
    assert.ok(mockAdapter.files["lesson-resource-published/published/mm-g12-bio-001/2/abc123hash"], "Promoted file must exist in published bucket");

    // Overwrite attempt must fail
    const overwriteRes = await promoteStagingToPublished(options, mockAdapter);
    assert.equal(overwriteRes.promoted, false, "Overwrite of existing published package must be rejected");
    assert.equal(overwriteRes.status, "failed");
  });

  it("should handle partial failure and record cleanup status when staging download fails", async () => {
    const mockAdapter = createMockStorageAdapter();
    const res = await promoteStagingToPublished(
      {
        resourceCode: "MM-001",
        versionNumber: 1,
        contentSha256: "hash123",
        stagingPath: "staging/non-existent/file.zip",
      },
      mockAdapter
    );

    assert.equal(res.promoted, false);
    assert.equal(res.status, "cleanup_pending");
  });

  it("should execute server package validation workflow on uploaded bytes", async () => {
    const zip = new JSZip();
    zip.file("index.html", `<!DOCTYPE html><html><head><title>Clean</title></head><body><h1>Hello</h1></body></html>`);
    const zipBytes = await zip.generateAsync({ type: "uint8array" });

    const mockAdapter = createMockStorageAdapter({
      "lesson-resource-drafts/staging/user-1/batch-1/sess-1/pkg.zip": zipBytes,
    });

    const res = await executeServerPackageValidationWorkflow("staging/user-1/batch-1/sess-1/pkg.zip", mockAdapter);
    assert.equal(res.isValid, true, "Clean HTML package must be valid");
    assert.ok(res.packageHash.length > 0, "Must calculate deterministic package hash");
  });

  it("should enforce student signed access rules and issue short-lived URL via adapter", async () => {
    const publishedBytes = new Uint8Array([10, 20, 30]);
    const mockAdapter = createMockStorageAdapter({
      "lesson-resource-published/published/mm-g12-bio-001/1/hash123": publishedBytes,
    });

    const draftAccess = await generateStudentSignedAccess(
      {
        lessonId: "less-1",
        resourceId: "res-1",
        publishedVersionId: null,
        status: "draft",
        publishedPath: "staging/path",
        studentCanAccessLesson: true,
      },
      mockAdapter
    );
    assert.equal(draftAccess.granted, false, "Draft access must be denied for student");

    const pubAccess = await generateStudentSignedAccess(
      {
        lessonId: "less-1",
        resourceId: "res-1",
        publishedVersionId: "ver-1",
        status: "published",
        publishedPath: "published/mm-g12-bio-001/1/hash123",
        studentCanAccessLesson: true,
      },
      mockAdapter
    );

    assert.equal(pubAccess.granted, true, "Published access with valid lesson access must be granted");
    assert.ok(pubAccess.signedUrl?.includes("published/mm-g12-bio-001/1/hash123"), "Signed URL must contain published path");
  });
});
