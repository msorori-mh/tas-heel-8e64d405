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

  it("uses the flagged PDF as PRIMARY_CONTENT even without an explicit primary row", () => {
    const caps = computeLessonCapabilities(baseInput());
    const primary = caps.find((c) => c.type === "PRIMARY_CONTENT")!;
    expect(primary.available).toBe(true);
    expect(primary.source).toBe("primary_resource");
  });

  it("never lists the primary resource under EXTRA_RESOURCES", () => {
    const caps = computeLessonCapabilities(baseInput());
    const extras = caps.find((c) => c.type === "EXTRA_RESOURCES")!;
    expect(extras.count).toBe(0);
    expect(extras.available).toBe(false);
  });

  it("title-only book content cannot override the primary PDF", () => {
    const caps = computeLessonCapabilities(
      baseInput({ deliveryMode: "in_app_content", bookContent: LESSON_TITLE }),
    );
    const primary = caps.find((c) => c.type === "PRIMARY_CONTENT")!;
    expect(primary.source).toBe("primary_resource");
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

  it("a PDF-only lesson without any 04 row is student ready", () => {
    const readiness = computeLessonReadiness(computeLessonCapabilities(baseInput()));
    expect(readiness.studentReady).toBe(true);
  });

  it("exposes exactly one primary action", () => {
    const visible = visibleLessonCapabilities(computeLessonCapabilities(baseInput()));
    expect(visible.filter((c) => c.type === "PRIMARY_CONTENT")).toHaveLength(1);
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
