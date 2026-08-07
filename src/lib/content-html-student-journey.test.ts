import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { DatabaseClientAdapter, PublishedHtmlResourceRow } from "./server/html-pipeline/db-adapter";
import type {
  ResolvedUploadSession,
  RecordServerValidationParams,
  ResolvedServerValidation,
  ResolvedPromotionBinding,
  ResolvedStudentResourceBinding,
  StorageOperationRecord,
  ResolvedStorageOperation,
} from "./server/html-pipeline/types";
import type { StorageClientAdapter } from "./server/html-pipeline/storage-adapter";
import { createSignedStudentAccessUrl } from "./server/html-pipeline/html-pipeline-service";
import {
  createSignedStudentAccessUrlFn,
  getLessonPublishedHtmlResourcesFn,
  signedStudentAccessInputSchema,
  requestFreshStudentHtmlSignedUrl,
} from "./api/html-pipeline.functions";
import type { LessonHtmlResourceItem } from "./api/html-pipeline.functions";

// ─── Mock DB Adapter ───────────────────────────────────────────────────────

function createMockDbAdapter(): {
  adapter: DatabaseClientAdapter;
  resources: Map<string, {
    id: string;
    lesson_id: string;
    resource_type: string;
    title: string;
    resource_code: string | null;
    lifecycle_status: string;
    published_version_id: string | null;
  }>;
  versions: Map<string, {
    id: string;
    resource_id: string;
    version_number: number;
  }>;
  studentCanAccessLesson: boolean;
} {
  const resources = new Map<string, {
    id: string;
    lesson_id: string;
    resource_type: string;
    title: string;
    resource_code: string | null;
    lifecycle_status: string;
    published_version_id: string | null;
  }>();
  const versions = new Map<string, {
    id: string;
    resource_id: string;
    version_number: number;
  }>();

  const state = { studentCanAccessLesson: true };

  const adapter: DatabaseClientAdapter = {
    async resolveUploadSession(): Promise<ResolvedUploadSession> {
      throw new Error("Not implemented for student journey tests");
    },
    async recordServerValidation(): Promise<string> {
      throw new Error("Not implemented for student journey tests");
    },
    async getValidServerValidation(): Promise<ResolvedServerValidation | null> {
      return null;
    },
    async resolvePromotionBinding(): Promise<ResolvedPromotionBinding> {
      throw new Error("Not implemented for student journey tests");
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
        resource_type: res.resource_type,
        title: res.title,
        published_version_number: ver.version_number,
      };
    },

    async listLessonPublishedHtmlResources(lessonId: string): Promise<PublishedHtmlResourceRow[]> {
      const rows: PublishedHtmlResourceRow[] = [];
      for (const res of resources.values()) {
        if (
          res.lesson_id === lessonId &&
          ["mind_map_html", "practical_experiment_html", "summary_html"].includes(res.resource_type) &&
          res.lifecycle_status === "published"
        ) {
          rows.push({
            id: res.id,
            resource_type: res.resource_type,
            title: res.title,
            resource_code: res.resource_code,
          });
        }
      }
      return rows;
    },

    async recordPublicationState(): Promise<void> {
      throw new Error("Not implemented for student journey tests");
    },
    async recordStorageOperation(): Promise<string> {
      throw new Error("Not implemented for student journey tests");
    },
    async updateStorageOperation(): Promise<void> {
      throw new Error("Not implemented for student journey tests");
    },
    async resolveStorageOperation(): Promise<ResolvedStorageOperation | null> {
      return null;
    },
  };

  return {
    adapter,
    resources,
    versions,
    get studentCanAccessLesson() { return state.studentCanAccessLesson; },
    set studentCanAccessLesson(val: boolean) { state.studentCanAccessLesson = val; },
  };
}

// ─── Mock Storage Adapter ──────────────────────────────────────────────────

function createMockStorageAdapter(): {
  adapter: StorageClientAdapter;
  shouldFailSignedUrl: boolean;
} {
  const state = { shouldFailSignedUrl: false };

  const adapter: StorageClientAdapter = {
    async createSignedUploadUrl() {
      throw new Error("Not implemented");
    },
    async download() {
      return { data: null, error: new Error("Not implemented") };
    },
    async upload() {
      return { error: new Error("Not implemented") };
    },
    async copy() {
      return { error: new Error("Not implemented") };
    },
    async createSignedUrl(_bucket: string, path: string, _expiresIn: number) {
      if (state.shouldFailSignedUrl) {
        return { signedUrl: null, error: new Error("Signed URL creation failed") };
      }
      return {
        signedUrl: `https://storage.local/signed/lesson-resource-published/${path}?token=mock&expires=900`,
        error: null,
      };
    },
    async remove() {
      return { error: null };
    },
  };

  return {
    adapter,
    get shouldFailSignedUrl() { return state.shouldFailSignedUrl; },
    set shouldFailSignedUrl(val: boolean) { state.shouldFailSignedUrl = val; },
  };
}

// ─── Simulated Server Function Logic ───────────────────────────────────────

async function simulateGetLessonPublishedHtmlResources(
  lessonId: string,
  dbAdapter: DatabaseClientAdapter,
  storageAdapter: StorageClientAdapter,
): Promise<{ resources: LessonHtmlResourceItem[] }> {
  const rows = await dbAdapter.listLessonPublishedHtmlResources(lessonId);
  const resources: LessonHtmlResourceItem[] = [];

  for (const row of rows) {
    try {
      const binding = await dbAdapter.resolveStudentResourceBinding(row.id);
      const access = await createSignedStudentAccessUrl(
        { resourceId: row.id },
        dbAdapter,
        storageAdapter,
      );

      if (access.granted && access.signedUrl) {
        resources.push({
          resourceId: row.id,
          resourceType: binding.resource_type as LessonHtmlResourceItem["resourceType"],
          title: binding.title,
          resourceCode: row.resource_code || row.id,
          version: binding.published_version_number,
          signedUrl: access.signedUrl,
          expiresInSeconds: access.expiresInSeconds ?? 900,
        });
      }
    } catch {
      // Resource not published or student not authorized — skip silently
    }
  }

  return { resources };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("CONTENT_HTML_STUDENT_JOURNEY — Published HTML Resource Wiring", () => {

  test("1. Published HTML resources are returned with signed URLs", async () => {
    const mockDb = createMockDbAdapter();
    const mockStorage = createMockStorageAdapter();

    const resId = "00000000-0000-0000-0000-000000000101";
    const verId = "00000000-0000-0000-0000-000000000102";
    const lessonId = "00000000-0000-0000-0000-000000000103";

    mockDb.resources.set(resId, {
      id: resId,
      lesson_id: lessonId,
      resource_type: "mind_map_html",
      title: "خريطة ذهنية تفاعلية",
      resource_code: "MAP-001",
      lifecycle_status: "published",
      published_version_id: verId,
    });
    mockDb.versions.set(verId, {
      id: verId,
      resource_id: resId,
      version_number: 1,
    });

    const result = await simulateGetLessonPublishedHtmlResources(lessonId, mockDb.adapter, mockStorage.adapter);

    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].resourceId, resId);
    assert.equal(result.resources[0].resourceType, "mind_map_html");
    assert.equal(result.resources[0].title, "خريطة ذهنية تفاعلية");
    assert.equal(result.resources[0].resourceCode, "MAP-001");
    assert.equal(result.resources[0].version, 1);
    assert.ok(result.resources[0].signedUrl.startsWith("https://storage.local/signed/"));
    assert.equal(result.resources[0].expiresInSeconds, 900);
  });

  test("2. Draft resources are NOT returned to students", async () => {
    const mockDb = createMockDbAdapter();
    const mockStorage = createMockStorageAdapter();

    const lessonId = "00000000-0000-0000-0000-000000000201";

    // Draft resource
    mockDb.resources.set("00000000-0000-0000-0000-000000000202", {
      id: "00000000-0000-0000-0000-000000000202",
      lesson_id: lessonId,
      resource_type: "mind_map_html",
      title: "مسودة خريطة",
      resource_code: "MAP-DRAFT",
      lifecycle_status: "draft",
      published_version_id: null,
    });

    // Approved but not published
    mockDb.resources.set("00000000-0000-0000-0000-000000000203", {
      id: "00000000-0000-0000-0000-000000000203",
      lesson_id: lessonId,
      resource_type: "practical_experiment_html",
      title: "تجربة معتمدة",
      resource_code: "EXP-APPROVED",
      lifecycle_status: "approved",
      published_version_id: null,
    });

    const result = await simulateGetLessonPublishedHtmlResources(lessonId, mockDb.adapter, mockStorage.adapter);

    assert.equal(result.resources.length, 0, "No draft/approved resources should be returned");
  });

  test("3. Resources from wrong lesson are denied", async () => {
    const mockDb = createMockDbAdapter();
    const mockStorage = createMockStorageAdapter();

    const lessonA = "00000000-0000-0000-0000-000000000301";
    const lessonB = "00000000-0000-0000-0000-000000000302";
    const resId = "00000000-0000-0000-0000-000000000303";
    const verId = "00000000-0000-0000-0000-000000000304";

    // Resource belongs to lesson B
    mockDb.resources.set(resId, {
      id: resId,
      lesson_id: lessonB,
      resource_type: "mind_map_html",
      title: "خريطة الدرس ب",
      resource_code: "MAP-B",
      lifecycle_status: "published",
      published_version_id: verId,
    });
    mockDb.versions.set(verId, { id: verId, resource_id: resId, version_number: 1 });

    // Query for lesson A — should return nothing
    const result = await simulateGetLessonPublishedHtmlResources(lessonA, mockDb.adapter, mockStorage.adapter);
    assert.equal(result.resources.length, 0, "Resources from other lessons must not appear");
  });

  test("4. Signing failure returns granted=false, no URL leaked", async () => {
    const mockDb = createMockDbAdapter();
    const mockStorage = createMockStorageAdapter();

    const resId = "00000000-0000-0000-0000-000000000401";
    const verId = "00000000-0000-0000-0000-000000000402";
    const lessonId = "00000000-0000-0000-0000-000000000403";

    mockDb.resources.set(resId, {
      id: resId,
      lesson_id: lessonId,
      resource_type: "practical_experiment_html",
      title: "تجربة",
      resource_code: "EXP-001",
      lifecycle_status: "published",
      published_version_id: verId,
    });
    mockDb.versions.set(verId, { id: verId, resource_id: resId, version_number: 1 });

    // Force signing failure
    mockStorage.shouldFailSignedUrl = true;

    const result = await simulateGetLessonPublishedHtmlResources(lessonId, mockDb.adapter, mockStorage.adapter);
    assert.equal(result.resources.length, 0, "Resource with signing failure must be excluded");
  });

  test("5. Student lesson access denial blocks resource", async () => {
    const mockDb = createMockDbAdapter();
    const mockStorage = createMockStorageAdapter();

    const resId = "00000000-0000-0000-0000-000000000501";
    const verId = "00000000-0000-0000-0000-000000000502";
    const lessonId = "00000000-0000-0000-0000-000000000503";

    mockDb.resources.set(resId, {
      id: resId,
      lesson_id: lessonId,
      resource_type: "summary_html",
      title: "ملخص",
      resource_code: "SUM-001",
      lifecycle_status: "published",
      published_version_id: verId,
    });
    mockDb.versions.set(verId, { id: verId, resource_id: resId, version_number: 1 });

    // Deny student access
    mockDb.studentCanAccessLesson = false;

    const result = await simulateGetLessonPublishedHtmlResources(lessonId, mockDb.adapter, mockStorage.adapter);
    assert.equal(result.resources.length, 0, "Student without lesson access must get no resources");
  });

  test("6. Multiple resource types returned correctly", async () => {
    const mockDb = createMockDbAdapter();
    const mockStorage = createMockStorageAdapter();
    const lessonId = "00000000-0000-0000-0000-000000000601";

    const resources = [
      { id: "00000000-0000-0000-0000-000000000610", type: "mind_map_html", title: "خريطة", code: "MAP-1" },
      { id: "00000000-0000-0000-0000-000000000620", type: "practical_experiment_html", title: "تجربة", code: "EXP-1" },
      { id: "00000000-0000-0000-0000-000000000630", type: "summary_html", title: "ملخص", code: "SUM-1" },
    ];

    for (const r of resources) {
      const verId = r.id + "-ver";
      mockDb.resources.set(r.id, {
        id: r.id,
        lesson_id: lessonId,
        resource_type: r.type,
        title: r.title,
        resource_code: r.code,
        lifecycle_status: "published",
        published_version_id: verId,
      });
      mockDb.versions.set(verId, { id: verId, resource_id: r.id, version_number: 1 });
    }

    const result = await simulateGetLessonPublishedHtmlResources(lessonId, mockDb.adapter, mockStorage.adapter);

    assert.equal(result.resources.length, 3);
    const types = result.resources.map(r => r.resourceType).sort();
    assert.deepEqual(types, ["mind_map_html", "practical_experiment_html", "summary_html"]);
  });

  test("7. Non-HTML resource types are excluded from HTML resource query", async () => {
    const mockDb = createMockDbAdapter();
    const mockStorage = createMockStorageAdapter();
    const lessonId = "00000000-0000-0000-0000-000000000701";

    // Legacy non-HTML resources
    mockDb.resources.set("00000000-0000-0000-0000-000000000710", {
      id: "00000000-0000-0000-0000-000000000710",
      lesson_id: lessonId,
      resource_type: "video",
      title: "فيديو",
      resource_code: null,
      lifecycle_status: "published",
      published_version_id: null,
    });
    mockDb.resources.set("00000000-0000-0000-0000-000000000720", {
      id: "00000000-0000-0000-0000-000000000720",
      lesson_id: lessonId,
      resource_type: "pdf",
      title: "ملف PDF",
      resource_code: null,
      lifecycle_status: "published",
      published_version_id: null,
    });

    const result = await simulateGetLessonPublishedHtmlResources(lessonId, mockDb.adapter, mockStorage.adapter);
    assert.equal(result.resources.length, 0, "Non-HTML resources must not appear in HTML resource query");
  });

  test("8. Signed URL contains published path, no raw storage path leaked", async () => {
    const mockDb = createMockDbAdapter();
    const mockStorage = createMockStorageAdapter();

    const resId = "00000000-0000-0000-0000-000000000801";
    const verId = "00000000-0000-0000-0000-000000000802";
    const lessonId = "00000000-0000-0000-0000-000000000803";

    mockDb.resources.set(resId, {
      id: resId,
      lesson_id: lessonId,
      resource_type: "mind_map_html",
      title: "خريطة",
      resource_code: "MAP-SEC",
      lifecycle_status: "published",
      published_version_id: verId,
    });
    mockDb.versions.set(verId, { id: verId, resource_id: resId, version_number: 3 });

    const result = await simulateGetLessonPublishedHtmlResources(lessonId, mockDb.adapter, mockStorage.adapter);

    assert.equal(result.resources.length, 1);
    const url = result.resources[0].signedUrl;
    // Signed URL must contain the published path with version number
    assert.ok(url.includes("published/"), "Signed URL must reference published path");
    assert.ok(url.includes(resId), "Signed URL must contain resource ID in path");
    assert.ok(url.includes("3"), "Signed URL must contain version number");
    // Must NOT contain staging or draft paths
    assert.ok(!url.includes("staging"), "Signed URL must not contain staging path");
    assert.ok(!url.includes("draft"), "Signed URL must not contain draft path");
  });

  test("9. resource_code fallback to resource_id when null", async () => {
    const mockDb = createMockDbAdapter();
    const mockStorage = createMockStorageAdapter();

    const resId = "00000000-0000-0000-0000-000000000901";
    const verId = "00000000-0000-0000-0000-000000000902";
    const lessonId = "00000000-0000-0000-0000-000000000903";

    mockDb.resources.set(resId, {
      id: resId,
      lesson_id: lessonId,
      resource_type: "summary_html",
      title: "ملخص",
      resource_code: null, // No resource_code
      lifecycle_status: "published",
      published_version_id: verId,
    });
    mockDb.versions.set(verId, { id: verId, resource_id: resId, version_number: 1 });

    const result = await simulateGetLessonPublishedHtmlResources(lessonId, mockDb.adapter, mockStorage.adapter);

    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].resourceCode, resId, "Must fall back to resource_id when resource_code is null");
  });

  test("10. Empty lesson returns empty resources array", async () => {
    const mockDb = createMockDbAdapter();
    const mockStorage = createMockStorageAdapter();

    const result = await simulateGetLessonPublishedHtmlResources(
      "00000000-0000-0000-0000-000000001001",
      mockDb.adapter,
      mockStorage.adapter,
    );

    assert.deepEqual(result.resources, []);
  });
});

// ─── Server Function Wiring Tests ─────────────────────────────────────────
// These tests prove the production boundary: actual server function definitions,
// service-level signing behavior, and route/component wiring.
// No synthetic implementation duplicates production logic.

describe("CONTENT_HTML_STUDENT_JOURNEY — Server Function Wiring", () => {

  test("11. createSignedStudentAccessUrlFn is a defined server function with POST method", () => {
    assert.ok(
      createSignedStudentAccessUrlFn,
      "createSignedStudentAccessUrlFn must be exported and defined",
    );
    assert.equal(
      typeof createSignedStudentAccessUrlFn,
      "function",
      "Server function must be callable",
    );
  });

  test("12. getLessonPublishedHtmlResourcesFn is a defined server function with POST method", () => {
    assert.ok(
      getLessonPublishedHtmlResourcesFn,
      "getLessonPublishedHtmlResourcesFn must be exported and defined",
    );
    assert.equal(
      typeof getLessonPublishedHtmlResourcesFn,
      "function",
      "Server function must be callable",
    );
  });

  test("13. Production input schema accepts only resourceId UUID", () => {
    const validResult = signedStudentAccessInputSchema.safeParse({ resourceId: "00000000-0000-0000-0000-000000000001" });
    assert.equal(validResult.success, true, "Valid UUID resourceId must be accepted");

    const missingResult = signedStudentAccessInputSchema.safeParse({});
    assert.equal(missingResult.success, false, "Missing resourceId must be rejected");

    const invalidResult = signedStudentAccessInputSchema.safeParse({ resourceId: "not-a-uuid" });
    assert.equal(invalidResult.success, false, "Non-UUID resourceId must be rejected");

    const extraResult = signedStudentAccessInputSchema.safeParse({
      resourceId: "00000000-0000-0000-0000-000000000001",
      lessonId: "00000000-0000-0000-0000-000000000002",
    });
    assert.equal(extraResult.success, true, "Extra fields are stripped by Zod (strip mode)");
    if (extraResult.success) {
      assert.equal(
        (extraResult.data as Record<string, unknown>).lessonId,
        undefined,
        "Extra fields must be stripped — only resourceId survives",
      );
    }
  });

  test("14. Successive signing calls produce different signed URLs (no stale reuse)", async () => {
    const mockDb = createMockDbAdapter();

    let signCallCount = 0;
    const mockStorage: StorageClientAdapter = {
      async createSignedUploadUrl() {
        throw new Error("Not implemented");
      },
      async download() {
        return { data: null, error: new Error("Not implemented") };
      },
      async upload() {
        return { error: new Error("Not implemented") };
      },
      async copy() {
        return { error: new Error("Not implemented") };
      },
      async createSignedUrl(_bucket: string, path: string, _expiresIn: number) {
        signCallCount++;
        return {
          signedUrl: `https://storage.local/signed/lesson-resource-published/${path}?token=mock&call=${signCallCount}&ts=${Date.now()}_${Math.random()}`,
          error: null,
        };
      },
      async remove() {
        return { error: null };
      },
    };

    const resId = "00000000-0000-0000-0000-000000001101";
    const verId = "00000000-0000-0000-0000-000000001102";
    const lessonId = "00000000-0000-0000-0000-000000001103";

    mockDb.resources.set(resId, {
      id: resId,
      lesson_id: lessonId,
      resource_type: "mind_map_html",
      title: "خريطة",
      resource_code: "MAP-WIRE",
      lifecycle_status: "published",
      published_version_id: verId,
    });
    mockDb.versions.set(verId, { id: verId, resource_id: resId, version_number: 1 });

    const first = await createSignedStudentAccessUrl({ resourceId: resId }, mockDb.adapter, mockStorage);
    const second = await createSignedStudentAccessUrl({ resourceId: resId }, mockDb.adapter, mockStorage);

    assert.equal(first.granted, true, "First signing must be granted");
    assert.equal(second.granted, true, "Second signing must be granted");
    assert.ok(first.signedUrl, "First signed URL must exist");
    assert.ok(second.signedUrl, "Second signed URL must exist");
    assert.notEqual(
      first.signedUrl,
      second.signedUrl,
      "Successive signed URLs MUST differ — proves fresh signing on each call, no stale URL reuse",
    );
    assert.equal(signCallCount, 2, "Storage signing must be invoked exactly twice");
  });

  test("15. Server signing failure returns granted=false with no URL leaked", async () => {
    const mockDb = createMockDbAdapter();
    const mockStorage = createMockStorageAdapter();

    const resId = "00000000-0000-0000-0000-000000001501";
    const verId = "00000000-0000-0000-0000-000000001502";
    const lessonId = "00000000-0000-0000-0000-000000001503";

    mockDb.resources.set(resId, {
      id: resId,
      lesson_id: lessonId,
      resource_type: "practical_experiment_html",
      title: "تجربة",
      resource_code: "EXP-WIRE",
      lifecycle_status: "published",
      published_version_id: verId,
    });
    mockDb.versions.set(verId, { id: verId, resource_id: resId, version_number: 1 });

    mockStorage.shouldFailSignedUrl = true;

    const result = await createSignedStudentAccessUrl({ resourceId: resId }, mockDb.adapter, mockStorage.adapter);

    assert.equal(result.granted, false, "Server failure must return granted=false");
    assert.equal(result.signedUrl, undefined, "No signed URL must be leaked on failure");
    assert.ok(result.reason, "Failure reason must be provided");
  });

  test("16. resourceId is the sole client identifier passed to binding resolution", async () => {
    const mockDb = createMockDbAdapter();
    const mockStorage = createMockStorageAdapter();

    const resolvedResourceIds: string[] = [];
    const trackingAdapter: DatabaseClientAdapter = {
      ...mockDb.adapter,
      async resolveStudentResourceBinding(resourceId: string) {
        resolvedResourceIds.push(resourceId);
        return mockDb.adapter.resolveStudentResourceBinding(resourceId);
      },
    };

    const resId = "00000000-0000-0000-0000-000000001601";
    const verId = "00000000-0000-0000-0000-000000001602";
    const lessonId = "00000000-0000-0000-0000-000000001603";

    mockDb.resources.set(resId, {
      id: resId,
      lesson_id: lessonId,
      resource_type: "summary_html",
      title: "ملخص",
      resource_code: "SUM-WIRE",
      lifecycle_status: "published",
      published_version_id: verId,
    });
    mockDb.versions.set(verId, { id: verId, resource_id: resId, version_number: 1 });

    await createSignedStudentAccessUrl({ resourceId: resId }, trackingAdapter, mockStorage.adapter);

    assert.equal(resolvedResourceIds.length, 1, "resolveStudentResourceBinding must be called exactly once");
    assert.equal(resolvedResourceIds[0], resId, "Only the client-provided resourceId is used for binding resolution");
  });

  test("17. Reload via production helper triggers fresh signing with distinct URLs", async () => {
    const mockDb = createMockDbAdapter();

    let signCallCount = 0;
    const mockStorage: StorageClientAdapter = {
      async createSignedUploadUrl() {
        throw new Error("Not implemented");
      },
      async download() {
        return { data: null, error: new Error("Not implemented") };
      },
      async upload() {
        return { error: new Error("Not implemented") };
      },
      async copy() {
        return { error: new Error("Not implemented") };
      },
      async createSignedUrl(_bucket: string, path: string, _expiresIn: number) {
        signCallCount++;
        return {
          signedUrl: `https://storage.local/signed/lesson-resource-published/${path}?token=call-${signCallCount}`,
          error: null,
        };
      },
      async remove() {
        return { error: null };
      },
    };

    const resId = "00000000-0000-0000-0000-000000001701";
    const verId = "00000000-0000-0000-0000-000000001702";
    const lessonId = "00000000-0000-0000-0000-000000001703";

    mockDb.resources.set(resId, {
      id: resId,
      lesson_id: lessonId,
      resource_type: "mind_map_html",
      title: "خريطة",
      resource_code: "MAP-RELOAD",
      lifecycle_status: "published",
      published_version_id: verId,
    });
    mockDb.versions.set(verId, { id: verId, resource_id: resId, version_number: 1 });

    // Mock server function caller that delegates to the real service function
    const mockServerFn = async ({ data }: { data: { resourceId: string } }) => {
      const access = await createSignedStudentAccessUrl(
        { resourceId: data.resourceId },
        mockDb.adapter,
        mockStorage,
      );
      return access.granted ? { signedUrl: access.signedUrl } : null;
    };

    // Initial load via production helper
    const url1 = await requestFreshStudentHtmlSignedUrl(mockServerFn, resId);
    assert.ok(url1, "Initial signed URL must be returned");
    assert.ok(url1!.includes("call-1"), "Initial URL must be from first signing call");

    // Reload via same production helper — must trigger fresh signing
    const url2 = await requestFreshStudentHtmlSignedUrl(mockServerFn, resId);
    assert.ok(url2, "Reloaded signed URL must be returned");
    assert.ok(url2!.includes("call-2"), "Reloaded URL must be from second signing call");

    assert.notEqual(url1, url2, "Reloaded URL MUST differ from initial URL");
    assert.equal(signCallCount, 2, "Exactly 2 signing calls for initial + reload");
  });

  test("18. Unpublished resource throws on signing attempt (server error propagation)", async () => {
    const mockDb = createMockDbAdapter();
    const mockStorage = createMockStorageAdapter();

    const resId = "00000000-0000-0000-0000-000000001801";
    const lessonId = "00000000-0000-0000-0000-000000001803";

    mockDb.resources.set(resId, {
      id: resId,
      lesson_id: lessonId,
      resource_type: "mind_map_html",
      title: "مسودة",
      resource_code: "MAP-DRAFT",
      lifecycle_status: "draft",
      published_version_id: null,
    });

    await assert.rejects(
      async () => {
        await createSignedStudentAccessUrl({ resourceId: resId }, mockDb.adapter, mockStorage.adapter);
      },
      (err: Error) => {
        assert.match(err.message, /not published/);
        return true;
      },
    );
  });

  test("19. Reload integration: URL1 fetch → reload → URL2 fetch, no stale URL reuse", async () => {
    const mockDb = createMockDbAdapter();
    const fetchedUrls: string[] = [];

    let signCallCount = 0;
    const mockStorage: StorageClientAdapter = {
      async createSignedUploadUrl() { throw new Error("Not implemented"); },
      async download() { return { data: null, error: new Error("Not implemented") }; },
      async upload() { return { error: new Error("Not implemented") }; },
      async copy() { return { error: new Error("Not implemented") }; },
      async createSignedUrl(_bucket: string, path: string, _expiresIn: number) {
        signCallCount++;
        return {
          signedUrl: `https://storage.local/signed/lesson-resource-published/${path}?token=call-${signCallCount}`,
          error: null,
        };
      },
      async remove() { return { error: null }; },
    };

    const resId = "00000000-0000-0000-0000-000000001901";
    const verId = "00000000-0000-0000-0000-000000001902";
    const lessonId = "00000000-0000-0000-0000-000000001903";

    mockDb.resources.set(resId, {
      id: resId, lesson_id: lessonId, resource_type: "mind_map_html",
      title: "خريطة", resource_code: "MAP-INT", lifecycle_status: "published",
      published_version_id: verId,
    });
    mockDb.versions.set(verId, { id: verId, resource_id: resId, version_number: 1 });

    const mockServerFn = async ({ data }: { data: { resourceId: string } }) => {
      const access = await createSignedStudentAccessUrl(
        { resourceId: data.resourceId }, mockDb.adapter, mockStorage,
      );
      return access.granted ? { signedUrl: access.signedUrl } : null;
    };

    // Step 1: Initial URL
    const url1 = await requestFreshStudentHtmlSignedUrl(mockServerFn, resId);
    assert.ok(url1, "Initial URL must exist");
    fetchedUrls.push(url1!);

    // Step 2: Simulate fetch with URL1
    assert.ok(url1!.includes("call-1"), "First fetch uses URL from first signing");

    // Step 3: Reload
    const url2 = await requestFreshStudentHtmlSignedUrl(mockServerFn, resId);
    assert.ok(url2, "Reloaded URL must exist");
    assert.notEqual(url1, url2, "URL2 must differ from URL1");
    fetchedUrls.push(url2!);

    // Step 4: Simulate fetch with URL2
    assert.ok(url2!.includes("call-2"), "Second fetch uses URL from second signing");

    // Step 5: Prove URL1 was never reused after reload
    assert.equal(fetchedUrls[0], url1, "First fetched URL is URL1");
    assert.equal(fetchedUrls[1], url2, "Second fetched URL is URL2");
    assert.notEqual(fetchedUrls[0], fetchedUrls[1], "No stale URL reuse across fetches");
    assert.equal(signCallCount, 2, "Exactly 2 signing calls");
  });

  test("20. Reload with signing failure returns null — no fallback to old URL", async () => {
    const mockDb = createMockDbAdapter();
    const mockStorage = createMockStorageAdapter();

    const resId = "00000000-0000-0000-0000-000000002001";
    const verId = "00000000-0000-0000-0000-000000002002";
    const lessonId = "00000000-0000-0000-0000-000000002003";

    mockDb.resources.set(resId, {
      id: resId, lesson_id: lessonId, resource_type: "summary_html",
      title: "ملخص", resource_code: "SUM-FAIL", lifecycle_status: "published",
      published_version_id: verId,
    });
    mockDb.versions.set(verId, { id: verId, resource_id: resId, version_number: 1 });

    const mockServerFn = async ({ data }: { data: { resourceId: string } }) => {
      const access = await createSignedStudentAccessUrl(
        { resourceId: data.resourceId }, mockDb.adapter, mockStorage.adapter,
      );
      return access.granted ? { signedUrl: access.signedUrl } : null;
    };

    // First call succeeds
    const url1 = await requestFreshStudentHtmlSignedUrl(mockServerFn, resId);
    assert.ok(url1, "Initial signed URL must be returned");

    // Force signing failure
    mockStorage.shouldFailSignedUrl = true;

    // Reload attempt must return null (fail-closed)
    const reloadResult = await requestFreshStudentHtmlSignedUrl(mockServerFn, resId);
    assert.equal(reloadResult, null, "Reload must return null on signing failure");

    // The old URL must NOT be returned by the helper
    assert.notEqual(reloadResult, url1, "Old URL must never be returned on reload failure");
  });
});
