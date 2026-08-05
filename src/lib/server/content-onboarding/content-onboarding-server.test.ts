import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateServerHtmlPackage } from "./package-validator-server";
import { issueServerUploadSession } from "./upload-service";
import { buildPublishedStoragePath } from "./publish-service";
import { generateStudentSignedAccess } from "./signed-access-service";
import { ValidationCodes } from "../../content-import/html-package";
import JSZip from "jszip";

describe("Server-side Content Onboarding Modules", () => {
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

  it("should issue staging upload session with ownership prefix", () => {
    const session = issueServerUploadSession({
      actorId: "actor-123",
      batchId: "batch-456",
      resourceCode: "MM-G12-BIO-001",
      filename: "package.zip",
    });

    assert.ok(session.stagingPath.startsWith("staging/actor-123/batch-456/"), "Staging path must use actor/batch ownership prefix");
    assert.equal(session.bucket, "lesson-resource-drafts");
  });

  it("should build deterministic published path", () => {
    const pub = buildPublishedStoragePath({
      resourceCode: "MM-G12-BIO-001",
      versionNumber: 2,
      contentSha256: "abc123hash",
      stagingPath: "staging/1/2/3/file.zip",
    });

    assert.equal(pub.publishedPath, "published/mm-g12-bio-001/2/abc123hash");
    assert.equal(pub.bucket, "lesson-resource-published");
  });

  it("should enforce student signed access rules", () => {
    const draftAccess = generateStudentSignedAccess({
      lessonId: "less-1",
      resourceId: "res-1",
      publishedVersionId: null,
      status: "draft",
      publishedPath: "staging/path",
      studentCanAccessLesson: true,
    });

    assert.equal(draftAccess.granted, false, "Draft access must be denied for student");

    const pubAccess = generateStudentSignedAccess({
      lessonId: "less-1",
      resourceId: "res-1",
      publishedVersionId: "ver-1",
      status: "published",
      publishedPath: "published/code/1/hash",
      studentCanAccessLesson: true,
    });

    assert.equal(pubAccess.granted, true, "Published access with valid lesson access must be granted");
    assert.ok(pubAccess.signedUrl?.startsWith("/api/signed-resource/"), "Signed URL must be generated");
  });
});
