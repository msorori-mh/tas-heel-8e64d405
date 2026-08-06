import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import JSZip from "jszip";
import { MemoryStorageAdapter } from "@/lib/server/html-pipeline/storage-adapter";
import { HtmlPipelineService } from "@/lib/server/html-pipeline/html-pipeline.service";
import type {
  ResolvePromotionBindingResultRow,
  ResolveStudentResourceBindingResultRow,
  ResolveUploadSessionResultRow,
  StorageOperationRow,
} from "@/lib/server/html-pipeline/types";

function computeSha256(buffer: Uint8Array): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function buildZipBuffer(
  files: Array<{ name: string; content: string | Uint8Array }>
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.name, f.content);
  }
  return await zip.generateAsync({ type: "uint8array" });
}

function createValidPackageFiles() {
  return [
    {
      name: "RES01/index.html",
      content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Test Package</title>
</head>
<body>
  <h1>Interactive Lesson</h1>
  <script>
    console.log("Clean inline script");
  </script>
</body>
</html>`,
    },
    {
      name: "RES01/manifest.json",
      content: JSON.stringify({
        resource_code: "RES01",
        version: 1,
        resource_type: "mind_map_html",
        title_ar: "درس تفاعلي متوافق",
        entry_file: "index.html",
      }),
    },
  ];
}

class FakeSupabaseClient {
  public featureFlags = new Map<string, boolean>([
    ["html_content_backend", true],
    ["html_content_upload", true],
    ["html_content_publish", true],
    ["html_content_student_read", true],
  ]);

  public batches = new Map<string, any>();
  public sessions = new Map<string, any>();
  public validations = new Map<string, any>();
  public versions = new Map<string, any>();
  public resources = new Map<string, any>();
  public storageOps = new Map<string, StorageOperationRow>();
  public idempotencyLedger = new Map<string, any>();
  public events: any[] = [];
  public studentAccessAllowed = true;

  rpc(fnName: string, args: Record<string, any>): { data: any; error: any } {
    if (fnName === "is_content_feature_enabled") {
      const enabled = this.featureFlags.get(args.p_key) ?? false;
      return { data: enabled, error: null };
    }

    if (fnName === "claim_idempotency_key") {
      const key = `${args.p_operation}::${args.p_key}`;
      if (this.idempotencyLedger.has(key)) {
        const existing = this.idempotencyLedger.get(key);
        return {
          data: [
            {
              ledger_id: existing.id,
              claimed: false,
              current_status: existing.status,
              previous_result: existing.result,
              previous_error: existing.error,
            },
          ],
          error: null,
        };
      }
      const newId = crypto.randomUUID();
      const entry = { id: newId, status: "in_progress", result: null, error: null };
      this.idempotencyLedger.set(key, entry);
      return {
        data: [
          {
            ledger_id: newId,
            claimed: true,
            current_status: "in_progress",
            previous_result: null,
            previous_error: null,
          },
        ],
        error: null,
      };
    }

    if (fnName === "complete_idempotency_key") {
      for (const entry of this.idempotencyLedger.values()) {
        if (entry.id === args.p_ledger_id) {
          entry.status = "succeeded";
          entry.result = args.p_result;
          return { data: null, error: null };
        }
      }
      return { data: null, error: { message: "Ledger entry not found" } };
    }

    if (fnName === "fail_idempotency_key") {
      for (const entry of this.idempotencyLedger.values()) {
        if (entry.id === args.p_ledger_id) {
          entry.status = "failed";
          entry.error = args.p_error;
          return { data: null, error: null };
        }
      }
      return { data: null, error: { message: "Ledger entry not found" } };
    }

    if (fnName === "resolve_upload_session") {
      const sess = this.sessions.get(args.p_upload_session_id);
      if (!sess) {
        return { data: null, error: { message: `Upload session ${args.p_upload_session_id} not found` } };
      }
      if (sess.expires_at && new Date(sess.expires_at).getTime() <= Date.now()) {
        return { data: null, error: { message: "Upload session is expired" } };
      }
      const resultRow: ResolveUploadSessionResultRow = {
        session_id: sess.id,
        batch_id: sess.batch_id,
        actor_id: sess.actor_id,
        resource_id: sess.resource_id,
        resource_code: sess.resource_code,
        staging_path: sess.staging_path,
        expected_package_hash: sess.expected_package_hash,
        status: sess.status,
        expires_at: sess.expires_at,
        is_expired: false,
      };
      return { data: [resultRow], error: null };
    }

    if (fnName === "record_server_validation") {
      const valId = crypto.randomUUID();
      const sess = this.sessions.get(args.p_upload_session_id);
      const record = {
        id: valId,
        upload_session_id: args.p_upload_session_id,
        resource_version_id: args.p_resource_version_id,
        resource_id: sess?.resource_id,
        package_hash: args.p_package_hash,
        scanner_version: args.p_scanner_version,
        findings: args.p_findings,
        is_valid: args.p_is_valid,
        valid_until: args.p_valid_until,
        storage_object_path: args.p_storage_object_path,
      };
      this.validations.set(valId, record);
      return { data: valId, error: null };
    }

    if (fnName === "get_valid_server_validation") {
      for (const val of this.validations.values()) {
        if (
          val.resource_version_id === args.p_resource_version_id &&
          val.upload_session_id === args.p_upload_session_id &&
          val.is_valid &&
          new Date(val.valid_until).getTime() > Date.now()
        ) {
          return {
            data: [
              {
                validation_id: val.id,
                upload_session_id: val.upload_session_id,
                resource_version_id: val.resource_version_id,
                package_hash: val.package_hash,
                is_valid: val.is_valid,
                valid_until: val.valid_until,
                storage_object_path: val.storage_object_path,
              },
            ],
            error: null,
          };
        }
      }
      return { data: [], error: null };
    }

    if (fnName === "resolve_promotion_binding") {
      let valRecord: any = null;
      if (args.p_upload_session_id) {
        for (const v of this.validations.values()) {
          if (v.upload_session_id === args.p_upload_session_id && v.is_valid) {
            valRecord = v;
            break;
          }
        }
      } else if (args.p_resource_version_id) {
        for (const v of this.validations.values()) {
          if (v.resource_version_id === args.p_resource_version_id && v.is_valid) {
            valRecord = v;
            break;
          }
        }
      }

      if (!valRecord) {
        return { data: null, error: { message: "No valid active validation found" } };
      }

      const sess = this.sessions.get(valRecord.upload_session_id);
      const ver = this.versions.get(valRecord.resource_version_id);
      const res = this.resources.get(valRecord.resource_id);

      if (!sess || !ver || !res) {
        return { data: null, error: { message: "Binding entities not found" } };
      }

      if (!res.approved_version_id || res.approved_version_id !== ver.id) {
        return { data: null, error: { message: "Resource approved_version_id does not match target version" } };
      }

      const bindingRow: ResolvePromotionBindingResultRow = {
        resource_id: res.id,
        version_id: ver.id,
        upload_session_id: sess.id,
        staging_path: sess.staging_path,
        expected_hash: ver.content_sha256,
        resource_code: sess.resource_code || res.id,
        version_number: ver.version_number,
        published_target_path: `published/${res.id}/${ver.version_number}`,
        valid_validation_id: valRecord.id,
      };

      return { data: [bindingRow], error: null };
    }

    if (fnName === "resolve_student_resource_binding") {
      if (!this.studentAccessAllowed) {
        return { data: null, error: { message: "Student cannot access lesson" } };
      }

      const res = this.resources.get(args.p_resource_id);
      if (!res || res.lifecycle_status !== "published" || !res.published_version_id) {
        return { data: null, error: { message: "Resource is not published" } };
      }

      const ver = this.versions.get(res.published_version_id);
      const bindingRow: ResolveStudentResourceBindingResultRow = {
        resource_id: res.id,
        lesson_id: res.lesson_id,
        version_id: ver.id,
        resource_type: res.resource_type || "interactive_html",
        title: res.title || "Interactive Resource",
        published_version_number: ver.version_number,
      };

      return { data: [bindingRow], error: null };
    }

    return { data: null, error: { message: `Unknown RPC ${fnName}` } };
  }

  from(tableName: string) {
    const self = this;

    const queryBuilder = {
      select(_cols?: string) {
        return queryBuilder;
      },
      eq(col: string, val: any) {
        (queryBuilder as any)._eqCol = col;
        (queryBuilder as any)._eqVal = val;
        return queryBuilder;
      },
      order(_col: string, _opts?: any) {
        return queryBuilder;
      },
      limit(_n: number) {
        return queryBuilder;
      },
      maybeSingle() {
        if (tableName === "lesson_resource_versions") {
          const col = (queryBuilder as any)._eqCol;
          const val = (queryBuilder as any)._eqVal;
          if (col === "content_sha256") {
            for (const ver of self.versions.values()) {
              if (ver.content_sha256 === val) {
                return Promise.resolve({ data: ver, error: null });
              }
            }
          }
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      single() {
        if (tableName === "storage_operations") {
          const id = (queryBuilder as any)._eqVal;
          const op = self.storageOps.get(id);
          if (!op) return Promise.resolve({ data: null, error: { message: "Operation not found" } });
          return Promise.resolve({ data: op, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      insert(payload: any) {
        if (tableName === "content_import_batches") {
          const batchId = payload.id || crypto.randomUUID();
          const batch = { id: batchId, ...payload };
          self.batches.set(batchId, batch);
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: batch, error: null });
                },
              };
            },
          };
        }
        if (tableName === "lesson_resource_upload_sessions") {
          self.sessions.set(payload.id, payload);
          return Promise.resolve({ data: payload, error: null });
        }
        if (tableName === "lesson_resource_versions") {
          const verId = payload.id || crypto.randomUUID();
          const ver = { id: verId, ...payload };
          self.versions.set(verId, ver);
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: ver, error: null });
                },
              };
            },
          };
        }
        if (tableName === "storage_operations") {
          self.storageOps.set(payload.id, payload);
          return Promise.resolve({ data: payload, error: null });
        }
        if (tableName === "lesson_resource_events") {
          self.events.push(payload);
          return Promise.resolve({ data: payload, error: null });
        }
        return Promise.resolve({ data: payload, error: null });
      },
      update(payload: any) {
        return {
          eq(col: string, val: any) {
            if (tableName === "lesson_resource_upload_sessions" && col === "id") {
              const sess = self.sessions.get(val);
              if (sess) {
                Object.assign(sess, payload);
              }
            } else if (tableName === "storage_operations" && col === "id") {
              const op = self.storageOps.get(val);
              if (op) {
                Object.assign(op, payload);
              }
            } else if (tableName === "lesson_resources" && col === "id") {
              const res = self.resources.get(val);
              if (res) {
                Object.assign(res, payload);
              }
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    };

    return queryBuilder;
  }
}

describe("Trusted HTML Server Pipeline Suite", () => {
  let memoryStorage: MemoryStorageAdapter;
  let fakeDb: FakeSupabaseClient;
  let pipelineService: HtmlPipelineService;

  const contentManagerId = "00000000-0000-0000-0000-000000000001";
  const adminId = "00000000-0000-0000-0000-000000000002";
  const studentId = "00000000-0000-0000-0000-000000000003";

  const resourceId = "11111111-1111-1111-1111-111111111111";
  const lessonId = "22222222-2222-2222-2222-222222222222";

  beforeEach(() => {
    memoryStorage = new MemoryStorageAdapter();
    fakeDb = new FakeSupabaseClient();
    pipelineService = new HtmlPipelineService({
      bucketName: "html-packages",
      storageAdapter: memoryStorage,
      supabaseClient: fakeDb as any,
    });

    fakeDb.resources.set(resourceId, {
      id: resourceId,
      lesson_id: lessonId,
      lifecycle_status: "approved",
      approved_version_id: null,
      published_version_id: null,
      title: "Mind Map HTML",
    });
  });

  describe("1. Authorization Matrix", () => {
    it("denies upload session creation when feature flag is disabled", async () => {
      fakeDb.featureFlags.set("html_content_upload", false);

      await assert.rejects(
        pipelineService.createUploadSession(contentManagerId, {
          resourceId,
          originalFilename: "package.zip",
          expectedPackageHash: "a".repeat(64),
        }),
        /disabled/i
      );
    });

    it("allows content staff upload session creation", async () => {
      const res = await pipelineService.createUploadSession(contentManagerId, {
        resourceId,
        originalFilename: "package.zip",
        expectedPackageHash: "a".repeat(64),
      });

      assert.ok(res.uploadSessionId);
      assert.ok(res.stagingPath.startsWith("html-packages/staging/"));
      assert.ok(res.signedUploadUrl.includes("upload"));
    });

    it("denies promotion by non-admin if role checks enforced upstream", async () => {
      fakeDb.featureFlags.set("html_content_publish", false);
      await assert.rejects(
        pipelineService.promoteVersion(contentManagerId, {
          resourceVersionId: crypto.randomUUID(),
        }),
        /disabled/i
      );
    });
  });

  describe("2. Upload & Session Security", () => {
    it("denies finalize when session belongs to a different actor", async () => {
      const session = await pipelineService.createUploadSession(contentManagerId, {
        resourceId,
        originalFilename: "package.zip",
        expectedPackageHash: "a".repeat(64),
      });

      const fakeBytes = new Uint8Array([1, 2, 3]);
      memoryStorage.seed("html-packages", session.stagingPath, fakeBytes);

      await assert.rejects(
        pipelineService.finalizeUploadSession(studentId, {
          uploadSessionId: session.uploadSessionId,
        }),
        /does not own upload session/i
      );
    });

    it("denies finalize for expired upload session", async () => {
      const session = await pipelineService.createUploadSession(contentManagerId, {
        resourceId,
        originalFilename: "package.zip",
        expectedPackageHash: "a".repeat(64),
      });

      const dbSess = fakeDb.sessions.get(session.uploadSessionId);
      dbSess.expires_at = new Date(Date.now() - 1000).toISOString();

      await assert.rejects(
        pipelineService.finalizeUploadSession(contentManagerId, {
          uploadSessionId: session.uploadSessionId,
        }),
        /expired/i
      );
    });

    it("fails closed on storage signing failure", async () => {
      memoryStorage.shouldFailSigning = true;

      await assert.rejects(
        pipelineService.createUploadSession(contentManagerId, {
          resourceId,
          originalFilename: "package.zip",
          expectedPackageHash: "a".repeat(64),
        }),
        /Storage signing failure/i
      );
    });
  });

  describe("3. Stored Byte Validation & PR59 Security Scanner", () => {
    it("passes validation for clean HTML package and records server validation", async () => {
      const validZipBytes = await buildZipBuffer(createValidPackageFiles());
      const hash = computeSha256(validZipBytes);

      const session = await pipelineService.createUploadSession(contentManagerId, {
        resourceId,
        originalFilename: "clean-package.zip",
        expectedPackageHash: hash,
        resourceCode: "RES01",
      });

      memoryStorage.seed("html-packages", session.stagingPath, validZipBytes);

      await pipelineService.finalizeUploadSession(contentManagerId, {
        uploadSessionId: session.uploadSessionId,
      });

      const valRes = await pipelineService.validateStoredPackage(contentManagerId, {
        uploadSessionId: session.uploadSessionId,
      });

      assert.equal(valRes.isValid, true);
      assert.equal(valRes.packageHash, hash);
      assert.ok(valRes.validationId);
      assert.equal(valRes.scannerVersion, "pr59-v1");
    });

    it("rejects package with unsafe JS (eval) and records invalid validation", async () => {
      const unsafeJsZip = await buildZipBuffer([
        {
          name: "RES01/index.html",
          content: "<html><body><script>eval('alert(1)');</script></body></html>",
        },
        {
          name: "RES01/manifest.json",
          content: JSON.stringify({ resource_code: "RES01", version: 1, title_ar: "Test" }),
        },
      ]);
      const hash = computeSha256(unsafeJsZip);

      const session = await pipelineService.createUploadSession(contentManagerId, {
        resourceId,
        originalFilename: "unsafe-js.zip",
        expectedPackageHash: hash,
        resourceCode: "RES01",
      });

      memoryStorage.seed("html-packages", session.stagingPath, unsafeJsZip);

      await pipelineService.finalizeUploadSession(contentManagerId, {
        uploadSessionId: session.uploadSessionId,
      });

      const valRes = await pipelineService.validateStoredPackage(contentManagerId, {
        uploadSessionId: session.uploadSessionId,
      });

      assert.equal(valRes.isValid, false);
      assert.ok(valRes.findings.some((f) => f.severity === "error"));
    });

    it("rejects stored bytes when hash does not match expected_package_hash", async () => {
      const validZipBytes = await buildZipBuffer(createValidPackageFiles());

      const session = await pipelineService.createUploadSession(contentManagerId, {
        resourceId,
        originalFilename: "mismatch.zip",
        expectedPackageHash: "f".repeat(64),
      });

      memoryStorage.seed("html-packages", session.stagingPath, validZipBytes);

      await assert.rejects(
        pipelineService.finalizeUploadSession(contentManagerId, {
          uploadSessionId: session.uploadSessionId,
        }),
        /hash mismatch/i
      );
    });
  });

  describe("4. Promotion Binding & Storage Copy Integrity", () => {
    it("promotes version to published path ONLY after storage copy verification", async () => {
      const validZipBytes = await buildZipBuffer(createValidPackageFiles());
      const hash = computeSha256(validZipBytes);

      const session = await pipelineService.createUploadSession(contentManagerId, {
        resourceId,
        originalFilename: "valid-promote.zip",
        expectedPackageHash: hash,
        resourceCode: "RES01",
      });

      memoryStorage.seed("html-packages", session.stagingPath, validZipBytes);

      await pipelineService.finalizeUploadSession(contentManagerId, {
        uploadSessionId: session.uploadSessionId,
      });

      const valRes = await pipelineService.validateStoredPackage(contentManagerId, {
        uploadSessionId: session.uploadSessionId,
      });

      const resObj = fakeDb.resources.get(resourceId);
      resObj.approved_version_id = valRes.resourceVersionId;
      const verObj = fakeDb.versions.get(valRes.resourceVersionId);
      verObj.immutable_at = new Date().toISOString();

      const promoRes = await pipelineService.promoteVersion(adminId, {
        uploadSessionId: session.uploadSessionId,
      });

      assert.equal(promoRes.status, "promoted");
      assert.ok(promoRes.publishedTargetPath.startsWith("published/"));

      const publishedBytes = memoryStorage.peek("html-packages", promoRes.publishedTargetPath);
      assert.ok(publishedBytes);
      assert.equal(computeSha256(publishedBytes!), hash);

      const updatedRes = fakeDb.resources.get(resourceId);
      assert.equal(updatedRes.lifecycle_status, "published");
      assert.equal(updatedRes.published_version_id, valRes.resourceVersionId);

      const stagingExists = await memoryStorage.exists("html-packages", session.stagingPath);
      assert.equal(stagingExists, false);
    });

    it("denies promotion if resource approved_version_id does not match target version", async () => {
      const validZipBytes = await buildZipBuffer(createValidPackageFiles());
      const hash = computeSha256(validZipBytes);

      const session = await pipelineService.createUploadSession(contentManagerId, {
        resourceId,
        originalFilename: "unapproved.zip",
        expectedPackageHash: hash,
        resourceCode: "RES01",
      });

      memoryStorage.seed("html-packages", session.stagingPath, validZipBytes);

      await pipelineService.finalizeUploadSession(contentManagerId, {
        uploadSessionId: session.uploadSessionId,
      });

      await pipelineService.validateStoredPackage(contentManagerId, {
        uploadSessionId: session.uploadSessionId,
      });

      const resObj = fakeDb.resources.get(resourceId);
      resObj.approved_version_id = crypto.randomUUID();

      await assert.rejects(
        pipelineService.promoteVersion(adminId, {
          uploadSessionId: session.uploadSessionId,
        }),
        /does not match target version/i
      );

      assert.notEqual(resObj.lifecycle_status, "published");
    });
  });

  describe("5. Compensation & Fault Recovery", () => {
    it("handles partial target creation failure with full compensation removal", async () => {
      const validZipBytes = await buildZipBuffer(createValidPackageFiles());
      const hash = computeSha256(validZipBytes);

      const session = await pipelineService.createUploadSession(contentManagerId, {
        resourceId,
        originalFilename: "fault-promote.zip",
        expectedPackageHash: hash,
        resourceCode: "RES01",
      });

      memoryStorage.seed("html-packages", session.stagingPath, validZipBytes);

      await pipelineService.finalizeUploadSession(contentManagerId, {
        uploadSessionId: session.uploadSessionId,
      });

      const valRes = await pipelineService.validateStoredPackage(contentManagerId, {
        uploadSessionId: session.uploadSessionId,
      });

      const resObj = fakeDb.resources.get(resourceId);
      resObj.approved_version_id = valRes.resourceVersionId;
      const verObj = fakeDb.versions.get(valRes.resourceVersionId);
      verObj.immutable_at = new Date().toISOString();

      const originalDownload = memoryStorage.download.bind(memoryStorage);
      let downloadCount = 0;
      memoryStorage.download = async (b, p) => {
        if (p.startsWith("published/")) {
          downloadCount++;
          if (downloadCount === 1) {
            return new Uint8Array([9, 9, 9]); // Corrupted bytes returned on target verification!
          }
        }
        return originalDownload(b, p);
      };

      await assert.rejects(
        pipelineService.promoteVersion(adminId, {
          uploadSessionId: session.uploadSessionId,
        }),
        /Storage promotion failed/i
      );

      assert.notEqual(resObj.lifecycle_status, "published");

      const op = Array.from(fakeDb.storageOps.values())[0];
      assert.ok(op);
      assert.equal(op.status, "compensated");
    });
  });

  describe("6. Student Signed Access", () => {
    it("returns signed access URL for valid published resource", async () => {
      const versionId = crypto.randomUUID();
      fakeDb.versions.set(versionId, {
        id: versionId,
        version_number: 1,
      });

      fakeDb.resources.set(resourceId, {
        id: resourceId,
        lesson_id: lessonId,
        lifecycle_status: "published",
        published_version_id: versionId,
        title: "Published Interactive Lesson",
      });

      memoryStorage.seed("html-packages", `published/${resourceId}/1`, new Uint8Array([1, 2, 3]));

      const access = await pipelineService.getStudentSignedAccess({ resourceId });

      assert.equal(access.resourceId, resourceId);
      assert.equal(access.lessonId, lessonId);
      assert.ok(access.signedUrl.includes("access"));
    });

    it("denies signed access for draft/unpublished resource", async () => {
      fakeDb.resources.set(resourceId, {
        id: resourceId,
        lesson_id: lessonId,
        lifecycle_status: "draft",
        published_version_id: null,
      });

      await assert.rejects(
        pipelineService.getStudentSignedAccess({ resourceId }),
        /not published/i
      );
    });

    it("denies signed access if student cannot access lesson", async () => {
      fakeDb.studentAccessAllowed = false;

      await assert.rejects(
        pipelineService.getStudentSignedAccess({ resourceId }),
        /Student cannot access lesson/i
      );
    });
  });
});
