/**
 * QURAN_PRIMARY_PDF_MAPPING_AND_ARABIC_FIDELITY_RECOVERY_18C1
 *
 * Contract guards for the PDF-only lesson:
 *   - a primary resource is never listed under EXTRA_RESOURCES
 *   - title-only (placeholder) book content never overrides a primary PDF
 *   - a PDF-only lesson with no 04 row is STUDENT_READY
 *   - exactly one primary action
 */

import { describe, expect, it } from "vitest";

import {
  computeLessonCapabilities,
  computeLessonReadiness,
  isPlaceholderBookContent,
  visibleLessonCapabilities,
  type LessonCapabilityInput,
} from "@/lib/lessons/lesson-capabilities";

const LESSON_TITLE =
  "الفصل الأول - أولاً الحفظ والتفسير - الدرس الأول - سورة السجدة: مراجعة الآيات الكريمة والدلالات";

const PDF = {
  id: "pdf-1",
  resource_type: "pdf",
  title: LESSON_TITLE,
  url: "https://drive.google.com/file/d/1cb_MkmG-IwcCVcu__Am2RffiKvsXVBH1/view?usp=sharing",
  is_primary: true,
};

function baseInput(overrides: Partial<LessonCapabilityInput> = {}): LessonCapabilityInput {
  return {
    deliveryMode: "external_resource",
    lessonTitle: LESSON_TITLE,
    bookContent: null,
    primaryResource: null,
    resources: [PDF],
    simulationsCount: 0,
    htmlMindMapsCount: 0,
    htmlExperimentsCount: 0,
    htmlSummariesCount: 0,
    summaryText: null,
    explanationsCount: 0,
    questionsCount: 0,
    lessonExamCount: 0,
    enhancementsAccessible: true,
    ...overrides,
  };
}

describe("18C1 — primary PDF mapping", () => {
  it("flags title-only book content as a placeholder", () => {
    expect(isPlaceholderBookContent(LESSON_TITLE, LESSON_TITLE)).toBe(true);
    expect(isPlaceholderBookContent("   ", LESSON_TITLE)).toBe(true);
    expect(isPlaceholderBookContent("قال تعالى: ألم تنزيل الكتاب…", LESSON_TITLE)).toBe(false);
  });

  it("21B4E — a flagged PDF is no longer promoted to PRIMARY_CONTENT", () => {
    const caps = computeLessonCapabilities(baseInput());
    const primary = caps.find((c) => c.type === "PRIMARY_CONTENT")!;
    expect(primary.available).toBe(false);
    expect(primary.studentVisible).toBe(false);
    expect(primary.readinessIssue).toBe("LEGACY_ORIGINAL_PDF_ONLY");
  });

  it("never lists the primary resource under EXTRA_RESOURCES", () => {
    const caps = computeLessonCapabilities(baseInput());
    const extras = caps.find((c) => c.type === "EXTRA_RESOURCES")!;
    expect(extras.count).toBe(0);
    expect(extras.available).toBe(false);
  });

  it("21B4E — title-only book content + PDF still yields no student step", () => {
    const caps = computeLessonCapabilities(
      baseInput({ deliveryMode: "in_app_content", bookContent: LESSON_TITLE }),
    );
    const primary = caps.find((c) => c.type === "PRIMARY_CONTENT")!;
    expect(primary.source).toBe("none");
    expect(primary.readinessIssue).toBe("LEGACY_ORIGINAL_PDF_ONLY");
  });

  it("real book content still wins for in-app lessons", () => {
    const caps = computeLessonCapabilities(
      baseInput({
        deliveryMode: "in_app_content",
        bookContent: "نص الدرس الحقيقي من الكتاب المدرسي.",
        resources: [{ ...PDF, is_primary: false }],
      }),
    );
    const primary = caps.find((c) => c.type === "PRIMARY_CONTENT")!;
    expect(primary.source).toBe("book_content");
    const extras = caps.find((c) => c.type === "EXTRA_RESOURCES")!;
    expect(extras.count).toBe(1);
  });

  it("21B4E — a PDF-only lesson is NOT student ready (legacy content gap)", () => {
    const readiness = computeLessonReadiness(computeLessonCapabilities(baseInput()));
    expect(readiness.studentReady).toBe(false);
  });

  it("21B4E — exposes no primary action for a PDF-only lesson", () => {
    const visible = visibleLessonCapabilities(computeLessonCapabilities(baseInput()));
    expect(visible.filter((c) => c.type === "PRIMARY_CONTENT")).toHaveLength(0);
  });

  it("reports a data defect when only placeholder book content exists", () => {
    const caps = computeLessonCapabilities(
      baseInput({ deliveryMode: "in_app_content", bookContent: LESSON_TITLE, resources: [] }),
    );
    const primary = caps.find((c) => c.type === "PRIMARY_CONTENT")!;
    expect(primary.available).toBe(false);
    expect(primary.readinessIssue).toBe("BOOK_CONTENT_PLACEHOLDER");
  });
});
