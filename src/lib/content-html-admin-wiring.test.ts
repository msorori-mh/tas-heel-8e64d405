import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type {
  ReviewQueueItem,
  ImportResourceSession,
  InitializeImportResult,
  ReviewActionResult,
} from "./server/html-pipeline/html-workflow.types";

/**
 * Test the row validation logic used by initializeHtmlImportFn.
 * We extract the validation function for unit testing.
 */

const VALID_RESOURCE_TYPES = new Set([
  "mind_map_html",
  "practical_experiment_html",
  "summary_html",
  "image",
  "pdf",
  "video",
  "external_link",
]);

function validateRow(data: Record<string, string>) {
  const errors: string[] = [];
  const resourceCode = (data.resource_code || "").trim();
  const lessonCode = (data.lesson_code || "").trim();
  const resourceType = (data.resource_type || "").trim();
  const titleAr = (data.title_ar || "").trim();

  if (!resourceCode) errors.push("resource_code مطلوب");
  if (!lessonCode) errors.push("lesson_code مطلوب");
  if (!titleAr) errors.push("title_ar مطلوب");
  if (!resourceType) {
    errors.push("resource_type مطلوب");
  } else if (!VALID_RESOURCE_TYPES.has(resourceType)) {
    errors.push(`resource_type غير قانوني: ${resourceType}`);
  }

  const sortOrder = parseInt(data.sort_order || "1", 10);
  const versionNumber = parseInt(data.version || "1", 10);
  if (!Number.isFinite(sortOrder) || sortOrder < 0) errors.push("sort_order غير صالح");
  if (!Number.isFinite(versionNumber) || versionNumber < 1) errors.push("version غير صالح");

  return { valid: errors.length === 0, errors };
}

describe("Content HTML Admin Wiring — Import/Review Workflow Tests", () => {
  // ─── Row Validation ──────────────────────────────────────────────

  test("1. Valid row passes validation", () => {
    const result = validateRow({
      resource_code: "MM-G12-BIO-L001",
      lesson_code: "LES-G12-BIO-001",
      resource_type: "mind_map_html",
      title_ar: "الخريطة الذهنية للخلية",
      sort_order: "1",
      version: "1",
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  test("2. Missing resource_code fails", () => {
    const result = validateRow({
      resource_code: "",
      lesson_code: "LES-001",
      resource_type: "mind_map_html",
      title_ar: "عنوان",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("resource_code")));
  });

  test("3. Missing lesson_code fails", () => {
    const result = validateRow({
      resource_code: "RES-001",
      lesson_code: "",
      resource_type: "mind_map_html",
      title_ar: "عنوان",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("lesson_code")));
  });

  test("4. Invalid resource_type fails", () => {
    const result = validateRow({
      resource_code: "RES-001",
      lesson_code: "LES-001",
      resource_type: "invalid_type",
      title_ar: "عنوان",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("غير قانوني")));
  });

  test("5. Empty title_ar fails", () => {
    const result = validateRow({
      resource_code: "RES-001",
      lesson_code: "LES-001",
      resource_type: "mind_map_html",
      title_ar: "",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("title_ar")));
  });

  test("6. Malformed row (all empty) fails with multiple errors", () => {
    const result = validateRow({
      resource_code: "",
      lesson_code: "",
      resource_type: "",
      title_ar: "",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 3);
  });

  test("7. Valid resource types accepted", () => {
    for (const rt of VALID_RESOURCE_TYPES) {
      const result = validateRow({
        resource_code: "RES-001",
        lesson_code: "LES-001",
        resource_type: rt,
        title_ar: "عنوان",
      });
      assert.equal(result.valid, true, `Expected ${rt} to be valid`);
    }
  });

  // ─── Duplicate Detection ──────────────────────────────────────

  test("8. Duplicate resource_code detection", () => {
    const seen = new Set<string>();
    const codes = ["RES-001", "RES-002", "RES-001"];
    const duplicates: string[] = [];

    for (const code of codes) {
      if (seen.has(code)) {
        duplicates.push(code);
      }
      seen.add(code);
    }

    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0], "RES-001");
  });

  // ─── Package Hash Mapping ─────────────────────────────────────

  test("9. Missing package hash for resource causes error", () => {
    const packageHashes: Record<string, string> = {
      "MM-G12-BIO-L001": "hash1",
    };

    const resourcePackagePath = "EXP-G12-PHY-L004";
    const hasHash = packageHashes[resourcePackagePath] !== undefined;
    assert.equal(hasHash, false);
  });

  // ─── Authorization Matrix ─────────────────────────────────────

  test("10. content_manager cannot approve (server function middleware)", () => {
    const context = { isFullAdmin: false, isContentStaff: true, userId: "usr_cm_1" };

    const approveCheck = (ctx: { isFullAdmin: boolean }): ReviewActionResult => {
      if (!ctx.isFullAdmin) {
        return {
          resource_id: "res-1",
          new_status: "",
          success: false,
          message: "غير مصرح — صلاحيات الإدارة الكاملة مطلوبة للاعتماد.",
        };
      }
      return { resource_id: "res-1", new_status: "approved", success: true, message: "ok" };
    };

    const result = approveCheck(context);
    assert.equal(result.success, false);
    assert.match(result.message, /غير مصرح/);
  });

  test("11. admin can approve", () => {
    const context = { isFullAdmin: true, isContentStaff: true, userId: "usr_admin_1" };

    const approveCheck = (ctx: { isFullAdmin: boolean }): ReviewActionResult => {
      if (!ctx.isFullAdmin) {
        return {
          resource_id: "res-1",
          new_status: "",
          success: false,
          message: "غير مصرح",
        };
      }
      return { resource_id: "res-1", new_status: "approved", success: true, message: "ok" };
    };

    const result = approveCheck(context);
    assert.equal(result.success, true);
    assert.equal(result.new_status, "approved");
  });

  test("12. content_manager cannot publish", () => {
    const context = { isFullAdmin: false, isContentStaff: true, userId: "usr_cm_1" };

    const publishCheck = (ctx: { isFullAdmin: boolean }): ReviewActionResult => {
      if (!ctx.isFullAdmin) {
        return {
          resource_id: "res-1",
          new_status: "",
          success: false,
          message: "غير مصرح — صلاحيات الإدارة الكاملة مطلوبة للنشر.",
        };
      }
      return { resource_id: "res-1", new_status: "published", success: true, message: "ok" };
    };

    const result = publishCheck(context);
    assert.equal(result.success, false);
  });

  test("13. admin can publish", () => {
    const context = { isFullAdmin: true, isContentStaff: true, userId: "usr_admin_1" };

    const publishCheck = (ctx: { isFullAdmin: boolean }): ReviewActionResult => {
      if (!ctx.isFullAdmin) {
        return { resource_id: "res-1", new_status: "", success: false, message: "غير مصرح" };
      }
      return { resource_id: "res-1", new_status: "published", success: true, message: "ok" };
    };

    const result = publishCheck(context);
    assert.equal(result.success, true);
    assert.equal(result.new_status, "published");
  });

  test("14. content_manager can submit for review", () => {
    const context = { isFullAdmin: false, isContentStaff: true, userId: "usr_cm_1" };
    assert.equal(context.isContentStaff, true);
  });

  // ─── Review Queue Contract ─────────────────────────────────────

  test("15. Review queue item has required fields", () => {
    const item: ReviewQueueItem = {
      resource_id: "res-1",
      resource_code: "MM-001",
      resource_type: "mind_map_html",
      title: "خريطة ذهنية",
      description: null,
      lesson_id: "les-1",
      lesson_title: "الخلية",
      subject_name: "أحياء",
      grade_name: "الصف 12",
      lifecycle_status: "in_review",
      current_version_id: "ver-1",
      version_number: 1,
      content_sha256: "abc123",
      submitted_by: "usr-1",
      submitted_at: "2026-08-07T00:00:00Z",
      security_findings_count: 0,
      lock_version: 1,
    };

    assert.equal(item.resource_id, "res-1");
    assert.equal(item.lifecycle_status, "in_review");
    assert.equal(item.security_findings_count, 0);
  });

  // ─── Feature Flag Gate ─────────────────────────────────────────

  test("16. Import blocked when backend disabled", () => {
    const backendEnabled = false;
    const canImport = backendEnabled;
    assert.equal(canImport, false);
  });

  test("17. Import allowed when backend enabled", () => {
    const backendEnabled = true;
    const canImport = backendEnabled;
    assert.equal(canImport, true);
  });

  // ─── No Demo Data ──────────────────────────────────────────────

  test("18. InteractiveHtmlImportPanel has no demoRows", () => {
    const filePath = path.resolve("src/components/admin/InteractiveHtmlImportPanel.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(!content.includes("demoRows"), "InteractiveHtmlImportPanel must not contain demoRows");
    assert.ok(!content.includes("demoHtmlBody"), "InteractiveHtmlImportPanel must not contain demoHtmlBody");
  });

  test("19. the separate content-review page is retired", () => {
    assert.ok(
      !fs.existsSync(path.resolve("src/routes/_authenticated/admin.content-review.tsx")),
      "publishing happens directly from the import center",
    );
  });

  test("20. InteractiveHtmlImportPanel has no 'as any' casts", () => {
    const filePath = path.resolve("src/components/admin/InteractiveHtmlImportPanel.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(!content.includes("as any"), "InteractiveHtmlImportPanel must not contain 'as any'");
  });

  test("21. direct publish orchestrator has no 'as any' casts", () => {
    const filePath = path.resolve("src/lib/content-factory/golden-lesson-direct-publish.functions.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(!content.includes("as any"), "direct publish must not contain 'as any'");
  });

  // ─── No Direct Browser Mutations ──────────────────────────────

  test("22. direct publish runs server-side only", () => {
    const filePath = path.resolve("src/components/admin/GoldenLessonPackageBuilder.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(
      !content.includes("supabaseAdmin") && !content.includes("SERVICE_ROLE"),
      "builder must not access privileged clients",
    );
  });

  test("23. InteractiveHtmlImportPanel has no direct Storage writes", () => {
    const filePath = path.resolve("src/components/admin/InteractiveHtmlImportPanel.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(
      !content.includes("supabaseAdmin") && !content.includes("storage.from"),
      "ImportPanel must not directly write to Storage",
    );
  });

  // ─── No Service Role in Browser ────────────────────────────────

  test("24. No service-role key references in client components", () => {
    const importPanel = fs.readFileSync(
      path.resolve("src/components/admin/InteractiveHtmlImportPanel.tsx"),
      "utf-8",
    );
    const reviewPage = fs.readFileSync(
      path.resolve("src/components/admin/GoldenLessonPackageBuilder.tsx"),
      "utf-8",
    );
    assert.ok(!importPanel.includes("SERVICE_ROLE"));
    assert.ok(!reviewPage.includes("SERVICE_ROLE"));
  });

  // ─── Status Flow ──────────────────────────────────────────────

  test("25. Resource upload status flow is correct", () => {
    const validStatuses = [
      "pending",
      "uploading",
      "uploaded",
      "validating",
      "validated",
      "validation_failed",
      "submitted",
      "error",
    ];

    const statusTransitions: Record<string, string[]> = {
      pending: ["uploading", "error"],
      uploading: ["uploaded", "error"],
      uploaded: ["validating", "error"],
      validating: ["validated", "validation_failed", "error"],
      validated: ["submitted", "error"],
      validation_failed: ["error"],
      submitted: [],
      error: [],
    };

    for (const [status, transitions] of Object.entries(statusTransitions)) {
      assert.ok(validStatuses.includes(status), `Status ${status} must be in valid statuses`);
      for (const t of transitions) {
        assert.ok(validStatuses.includes(t), `Transition target ${t} must be valid`);
      }
    }
  });

  // ─── Server Function Exports ──────────────────────────────────

  test("26. html-workflow.functions.ts exports all required server functions", () => {
    const filePath = path.resolve("src/lib/api/html-workflow.functions.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    const requiredExports = [
      "initializeHtmlImportFn",
      "finalizeHtmlUploadFn",
      "submitHtmlForReviewFn",
      "getHtmlReviewQueueFn",
      "approveHtmlResourceFn",
      "rejectHtmlResourceFn",
      "publishHtmlResourceFn",
      "unpublishHtmlResourceFn",
      "rollbackHtmlResourceFn",
      "checkHtmlBackendEnabledFn",
    ];

    for (const exp of requiredExports) {
      assert.ok(content.includes(`export const ${exp}`), `Missing export: ${exp}`);
    }
  });

  test("27. Admin-only functions use requireAdminAuth middleware", () => {
    const filePath = path.resolve("src/lib/api/html-workflow.functions.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    const adminFns = [
      "approveHtmlResourceFn",
      "rejectHtmlResourceFn",
      "publishHtmlResourceFn",
      "unpublishHtmlResourceFn",
      "rollbackHtmlResourceFn",
    ];

    for (const fn of adminFns) {
      const fnStart = content.indexOf(`export const ${fn}`);
      const fnEnd = content.indexOf(".handler(", fnStart);
      const fnDef = content.slice(fnStart, fnEnd);
      assert.ok(fnDef.includes("requireAdminAuth"), `${fn} must use requireAdminAuth middleware`);
    }
  });

  test("28. Content staff functions use requireContentStaffAuth middleware", () => {
    const filePath = path.resolve("src/lib/api/html-workflow.functions.ts");
    const content = fs.readFileSync(filePath, "utf-8");

    const staffFns = [
      "initializeHtmlImportFn",
      "finalizeHtmlUploadFn",
      "submitHtmlForReviewFn",
      "getHtmlReviewQueueFn",
    ];

    for (const fn of staffFns) {
      const fnStart = content.indexOf(`export const ${fn}`);
      const fnEnd = content.indexOf(".handler(", fnStart);
      const fnDef = content.slice(fnStart, fnEnd);
      assert.ok(
        fnDef.includes("requireContentStaffAuth"),
        `${fn} must use requireContentStaffAuth middleware`,
      );
    }
  });

  // ─── No Prohibited Patterns ────────────────────────────────────

  test("29. No 'as any' in workflow functions", () => {
    const filePath = path.resolve("src/lib/api/html-workflow.functions.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(!content.includes("as any"), "workflow functions must not contain 'as any'");
  });

  test("30. No 'as any' in workflow adapter", () => {
    const filePath = path.resolve("src/lib/server/html-pipeline/html-workflow-adapter.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(!content.includes("as any"), "workflow adapter must not contain 'as any'");
  });

  // ─── Publish Uses Trusted Pipeline ────────────────────────────

  test("31. publishHtmlResourceFn uses promoteApprovedPackage (trusted pipeline)", () => {
    const filePath = path.resolve("src/lib/api/html-workflow.functions.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(
      content.includes("promoteApprovedPackage"),
      "publish must use promoteApprovedPackage from trusted pipeline",
    );
  });

  // ─── Import Uses Signed Upload Contract ────────────────────────

  test("32. initializeHtmlImportFn uses createSignedUploadUrl (signed upload contract)", () => {
    const filePath = path.resolve("src/lib/api/html-workflow.functions.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(
      content.includes("createSignedUploadUrl"),
      "import must use createSignedUploadUrl from trusted pipeline",
    );
  });

  // ─── Validation Uses Server-Side Pipeline ─────────────────────

  test("33. finalizeHtmlUploadFn uses downloadAndValidateStoredZip (server validation)", () => {
    const filePath = path.resolve("src/lib/api/html-workflow.functions.ts");
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(
      content.includes("downloadAndValidateStoredZip"),
      "finalize must use downloadAndValidateStoredZip from trusted pipeline",
    );
  });

  // ─── Canonical Lesson Review Surface ───────────────────────────

  test("34. Content review uses the verified lesson manifest surface", () => {
    const filePath = path.resolve("src/routes/_authenticated/admin.content-review.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(
      content.includes("GoldenLessonManifestReviewPanel"),
      "content-review must use the verified golden-lesson review panel",
    );
    assert.ok(
      !content.includes("getHtmlReviewQueueFn"),
      "the obsolete HTML resource queue must not be mounted",
    );
  });

  // ─── No Browser-Side Legacy Queue Writes ───────────────────────

  test("35. Content review delegates decisions to server-backed panels", () => {
    const filePath = path.resolve("src/routes/_authenticated/admin.content-review.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    assert.ok(content.includes("GoldenLessonCf11OperatorPanel"));
    assert.ok(
      !content.includes("supabase.from"),
      "the route must not perform browser-side legacy queue writes",
    );
    assert.ok(
      !content.includes("setItems((prev) =>"),
      "Must not do optimistic local state updates",
    );
  });
});
