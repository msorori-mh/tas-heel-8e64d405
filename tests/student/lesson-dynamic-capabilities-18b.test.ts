/**
 * LESSON_DYNAMIC_CAPABILITY_AND_STUDENT_UX_FIX_18B
 * The lesson page must be derived from real content, never from a fixed
 * seven-step journey. These tests lock that contract.
 */
import { describe, it, expect } from "vitest";
import {
  computeLessonCapabilities,
  computeLessonProgress,
  computeLessonReadiness,
  isValidResourceUrl,
  parseLessonTitle,
  visibleLessonCapabilities,
  type LessonCapabilityInput,
} from "@/lib/lessons/lesson-capabilities";

const EMPTY: LessonCapabilityInput = {
  deliveryMode: "in_app",
  bookContent: null,
  inlineContent: null,
  primaryResource: null,
  resources: [],
  simulationsCount: 0,
  htmlMindMapsCount: 0,
  htmlExperimentsCount: 0,
  htmlSummariesCount: 0,
  summaryText: null,
  explanationsCount: 0,
  questionsCount: 0,
  lessonExamCount: 0,
  hasLessonVideoFlag: false,
  enhancementsAccessible: true,
  progress: null,
};

describe("isValidResourceUrl", () => {
  it("rejects empty, whitespace and non-http values", () => {
    for (const v of [null, undefined, "", "   ", "not-a-url", "ftp://x/y"]) {
      expect(isValidResourceUrl(v)).toBe(false);
    }
  });

  it("accepts http(s) and managed internal refs", () => {
    expect(isValidResourceUrl("https://drive.google.com/file/d/abc")).toBe(true);
    expect(isValidResourceUrl("supabase-storage://lesson-media/a.pdf")).toBe(true);
    expect(isValidResourceUrl("lesson-internal://abc")).toBe(true);
    expect(isValidResourceUrl("supabase-storage://")).toBe(false);
  });
});

describe("computeLessonCapabilities", () => {
  it("shows no student cards for a lesson with no content at all", () => {
    const visible = visibleLessonCapabilities(computeLessonCapabilities(EMPTY));
    expect(visible).toHaveLength(0);
  });

  it("flags PRIMARY_CONTENT_MISSING for an empty lesson", () => {
    const readiness = computeLessonReadiness(computeLessonCapabilities(EMPTY));
    expect(readiness.studentReady).toBe(false);
    expect(readiness.reason).toBe("PRIMARY_CONTENT_MISSING");
  });

  it("renders exactly one primary entry point when book text and a resource coexist", () => {
    const capabilities = computeLessonCapabilities({
      ...EMPTY,
      bookContent: "نص الدرس",
      primaryResource: {
        id: "r1",
        resource_type: "pdf",
        title: "ملف",
        url: "https://example.com/a.pdf",
      },
    });
    const primaries = capabilities.filter((c) => c.type === "PRIMARY_CONTENT" && c.available);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].source).toBe("book_content");
  });

  it("serves an external PDF lesson as the primary card", () => {
    const capabilities = computeLessonCapabilities({
      ...EMPTY,
      deliveryMode: "external_resource",
      primaryResource: {
        id: "r1",
        resource_type: "pdf",
        title: "ملف",
        url: "https://drive.google.com/file/d/abc",
      },
    });
    // 21B4E — Content V3: a PDF-only lesson no longer serves the PDF as a
    // journey step; it fails closed and is reported as a legacy gap.
    const visible = visibleLessonCapabilities(capabilities);
    expect(visible.map((c) => c.type)).toEqual([]);
    const primary = capabilities.find((c) => c.type === "PRIMARY_CONTENT")!;
    expect(primary.readinessIssue).toBe("LEGACY_ORIGINAL_PDF_ONLY");
    expect(computeLessonReadiness(capabilities).studentReady).toBe(false);
  });

  it("treats a resource row with a blank url as invalid content", () => {
    const capabilities = computeLessonCapabilities({
      ...EMPTY,
      deliveryMode: "external_resource",
      primaryResource: { id: "r1", resource_type: "pdf", title: "ملف", url: "   " },
    });
    const readiness = computeLessonReadiness(capabilities);
    expect(readiness.studentReady).toBe(false);
    expect(readiness.reason).toBe("PRIMARY_RESOURCE_INVALID");
  });

  it("hides gated enhancements but keeps free extras for a student without access", () => {
    const input: LessonCapabilityInput = {
      ...EMPTY,
      bookContent: "نص",
      summaryText: "ملخص",
      questionsCount: 5,
      htmlMindMapsCount: 1,
      hasLessonVideoFlag: true,
      enhancementsAccessible: false,
    };
    const types = visibleLessonCapabilities(computeLessonCapabilities(input)).map((c) => c.type);
    // Free by design (same rule as the safe-extras RPC).
    expect(types).toContain("PRIMARY_CONTENT");
    expect(types).toContain("SUMMARY");
    expect(types).toContain("OFFICIAL_QUESTIONS");
    // Subscription-gated.
    expect(types).not.toContain("MINDMAP");
    expect(types).not.toContain("VIDEO");
  });

  it("shows a Quran-style lesson as read-only content plus summary", () => {
    const types = visibleLessonCapabilities(
      computeLessonCapabilities({ ...EMPTY, bookContent: "نص", summaryText: "ملخص" }),
    ).map((c) => c.type);
    expect(types).toEqual(["PRIMARY_CONTENT", "SUMMARY"]);
  });
});

describe("computeLessonProgress", () => {
  it("is zero, not NaN, when nothing trackable is available", () => {
    const progress = computeLessonProgress(computeLessonCapabilities(EMPTY));
    expect(progress.denominator).toBe(0);
    expect(progress.measurable).toBe(false);
    expect(progress.percent).toBe(0);
  });

  it("counts only trackable available capabilities in the denominator", () => {
    const capabilities = computeLessonCapabilities({
      ...EMPTY,
      bookContent: "نص",
      summaryText: "ملخص",
      questionsCount: 4,
      progress: { completed: true, quizScore: null },
    });
    const progress = computeLessonProgress(capabilities);
    expect(progress.denominator).toBeGreaterThan(0);
    expect(progress.denominator).toBeLessThanOrEqual(
      capabilities.filter((c) => c.available).length,
    );
    expect(progress.percent).toBeGreaterThan(0);
    expect(progress.percent).toBeLessThanOrEqual(100);
  });
});

describe("parseLessonTitle", () => {
  it("splits an imported hierarchical Quran title for display only", () => {
    const parts = parseLessonTitle("الفصل الأول - الحفظ والتفسير - سورة السجدة");
    expect(parts.main).toBe("سورة السجدة");
    expect(parts.context).toContain("الفصل الأول");
  });

  it("returns short titles unchanged", () => {
    const parts = parseLessonTitle("الدرس الأول");
    expect(parts.main).toBe("الدرس الأول");
    expect(parts.context).toBeNull();
  });

  it("never throws on empty input", () => {
    expect(parseLessonTitle(null).main).toBe("الدرس");
    expect(parseLessonTitle("   ").context).toBeNull();
  });
});
