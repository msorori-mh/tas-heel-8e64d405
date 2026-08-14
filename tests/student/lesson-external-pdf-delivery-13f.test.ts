/**
 * LESSON_EXTERNAL_PDF_DELIVERY_13F — delivery helpers + wiring guards.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

import {
  classifyExternalResource,
  extractDriveFileId,
  isDriveUrl,
  isExternalDelivery,
  normalizeDeliveryMode,
  toDrivePreviewUrl,
  toExternalOpenUrl,
} from "@/lib/lessons/lesson-delivery";
import { RESOURCE_METADATA_ALLOWLIST } from "@/lib/import/import-contract";

const DRIVE_VIEW = "https://drive.google.com/file/d/1AbC_dEf-123/view?usp=sharing";

describe("delivery mode", () => {
  it("defaults to in_app_content", () => {
    expect(normalizeDeliveryMode(undefined)).toBe("in_app_content");
    expect(normalizeDeliveryMode("nonsense")).toBe("in_app_content");
    expect(isExternalDelivery(null)).toBe(false);
  });

  it("recognises external delivery", () => {
    expect(isExternalDelivery("external_resource")).toBe(true);
  });
});

describe("google drive normalisation", () => {
  it("detects drive urls", () => {
    expect(isDriveUrl(DRIVE_VIEW)).toBe(true);
    expect(isDriveUrl("https://example.com/a.pdf")).toBe(false);
    expect(isDriveUrl("javascript:alert(1)")).toBe(false);
    expect(isDriveUrl("")).toBe(false);
  });

  it("extracts the file id from both shapes", () => {
    expect(extractDriveFileId(DRIVE_VIEW)).toBe("1AbC_dEf-123");
    expect(extractDriveFileId("https://drive.google.com/open?id=XYZ789")).toBe("XYZ789");
    expect(extractDriveFileId("https://example.com/file/d/x/view")).toBeNull();
  });

  it("builds preview and open urls", () => {
    expect(toDrivePreviewUrl(DRIVE_VIEW)).toBe(
      "https://drive.google.com/file/d/1AbC_dEf-123/preview",
    );
    expect(toDrivePreviewUrl("https://example.com/a.pdf")).toBeNull();
    expect(toExternalOpenUrl(DRIVE_VIEW)).toBe(
      "https://drive.google.com/file/d/1AbC_dEf-123/view",
    );
    expect(toExternalOpenUrl("https://example.com/a.pdf")).toBe("https://example.com/a.pdf");
    expect(toExternalOpenUrl("not a url")).toBeNull();
  });
});

describe("resource classification", () => {
  it("classifies by url and type", () => {
    expect(classifyExternalResource("pdf", DRIVE_VIEW)).toBe("drive_pdf");
    expect(classifyExternalResource("link", "https://x.dev/a.pdf")).toBe("pdf");
    expect(classifyExternalResource("video", "https://youtu.be/abc")).toBe("video");
    expect(classifyExternalResource("link", "https://x.dev/page")).toBe("link");
  });
});

describe("import + UI wiring", () => {
  it("template 06 metadata allowlist carries is_primary", () => {
    expect(RESOURCE_METADATA_ALLOWLIST).toContain("is_primary");
  });

  it("the pending migration derives delivery_mode instead of duplicating urls", () => {
    const sql = readFileSync(
      "supabase/migrations-pending/20260815010000_lesson_external_pdf_delivery_13f.sql",
      "utf8",
    );
    expect(sql).toContain("lessons_delivery_mode_chk");
    expect(sql).toContain("lesson_resources_one_primary_per_lesson");
    expect(sql).toContain("sync_lesson_delivery_mode");
    expect(sql).toContain("admin_set_primary_lesson_resource");
    expect(sql).not.toMatch(/ALTER TABLE public\.lessons[\s\S]{0,80}external_url/);
  });

  it("the student lesson page renders the external launcher", () => {
    const page = readFileSync("src/routes/_authenticated/lessons.$lessonId.tsx", "utf8");
    expect(page).toContain("ExternalLessonDelivery");
    expect(page).toContain("lesson-primary-resource");
    expect(page).toContain("isExternalDelivery");
  });
});
