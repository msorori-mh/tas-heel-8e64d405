/**
 * 21B4E — Content V3: the original textbook PDF is not part of the lesson
 * journey. Curriculum books live at subject level (21B/21B4D) and stay there.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import {
  buildLessonCapabilityContract,
  computeLessonReadinessLevels,
  studentVisibleContract,
  STUDENT_CAPABILITY_ORDER,
  FINAL_LESSON_CAPABILITIES,
  LEGACY_REFERENCE_CAPABILITIES,
  LESSON_PDF_LEGACY_COMPATIBILITY,
  type LessonContentContractInput,
} from "@/lib/lessons/lesson-content-contract";
import {
  computeLessonCapabilities,
  computeLessonProgress,
  visibleLessonCapabilities,
} from "@/lib/lessons/lesson-capabilities";

const read = (p: string) => readFileSync(p, "utf8");

const base: LessonContentContractInput = {
  lessonTitle: "الدرس الأول",
  deliveryMode: "in_app",
  bookContents: [{ content: "<p>محتوى الكتاب الرسمي المنسّق للدرس الأول.</p>" }],
  explanations: [{ updated_at: null }],
  resources: [
    {
      id: "pdf-1",
      resource_type: "pdf",
      title: "نسخة الكتاب",
      url: "https://example.com/book.pdf",
      is_primary: true,
    },
  ],
  simulations: [],
  summaries: [{ summary: "ملخص الدرس" }],
  questionsCount: 6,
  assessmentsCount: 1,
  lessonExamCount: 0,
  enhancementsAccessible: true,
};

describe("21B4E capability contract", () => {
  it("1. originalBookPdf is absent from the final capability list & order", () => {
    expect(FINAL_LESSON_CAPABILITIES).not.toContain("originalBookPdf");
    expect(STUDENT_CAPABILITY_ORDER).not.toContain("originalBookPdf");
    expect(LEGACY_REFERENCE_CAPABILITIES).toContain("originalBookPdf");
    expect(LESSON_PDF_LEGACY_COMPATIBILITY).toBe(false);
  });

  it("2. no original-PDF step is rendered in the student lesson UI", () => {
    const page = read("src/routes/_authenticated/lessons.$lessonId.tsx");
    expect(page).not.toContain("نسخة الكتاب الأصلية");
    expect(page).not.toContain("showOriginalBookPdf");
    expect(page).not.toContain("originalPdfGateOpen");
  });

  it("9./10. officialBookContent first, assessment last among content steps", () => {
    expect(STUDENT_CAPABILITY_ORDER[0]).toBe("officialBookContent");
    const content = STUDENT_CAPABILITY_ORDER.filter((k) => k !== "studentPerformance");
    expect(content[content.length - 1]).toBe("lessonAssessment");
  });

  it("11. only capabilities backed by real content are student visible", () => {
    const contract = buildLessonCapabilityContract(base);
    const keys = studentVisibleContract(contract).map((c) => c.key);
    expect(keys).not.toContain("originalBookPdf");
    expect(keys).not.toContain("mindMap"); // no mind map content in this fixture
    expect(keys).toContain("officialBookContent");
  });

  it("4. readiness never depends on originalBookPdf", () => {
    const contract = buildLessonCapabilityContract(base);
    expect(contract.originalBookPdf.present).toBe(true);
    const readiness = computeLessonReadinessLevels(contract);
    expect(readiness.missing).not.toContain("originalBookPdf");
    expect(readiness.bookReady).toBe(true);

    const withoutPdf = buildLessonCapabilityContract({ ...base, resources: [] });
    const r2 = computeLessonReadinessLevels(withoutPdf);
    // 5. its absence changes nothing
    expect(r2.bookReady).toBe(readiness.bookReady);
    expect(r2.learningReady).toBe(readiness.learningReady);
    expect(r2.assessmentReady).toBe(readiness.assessmentReady);
    expect(r2.fullyReady).toBe(readiness.fullyReady);
  });
});

describe("21B4E progress", () => {
  const capInput = {
    deliveryMode: "in_app",
    lessonTitle: "الدرس الأول",
    bookContent: "<p>محتوى الكتاب الرسمي المنسّق.</p>",
    primaryResource: null,
    resources: [
      {
        id: "pdf-1",
        resource_type: "pdf",
        title: "نسخة الكتاب",
        url: "https://example.com/book.pdf",
        is_primary: true,
      },
    ],
    simulationsCount: 0,
    htmlMindMapsCount: 0,
    htmlExperimentsCount: 0,
    htmlSummariesCount: 0,
    summaryText: "ملخص",
    explanationsCount: 1,
    questionsCount: 5,
    lessonExamCount: 0,
    enhancementsAccessible: true,
    progress: null,
  };

  it("3. the original PDF never enters the progress denominator", () => {
    const caps = computeLessonCapabilities(capInput as never);
    const visible = visibleLessonCapabilities(caps);
    expect(visible.some((c) => c.label.includes("الكتاب الأصلية"))).toBe(false);
    const before = computeLessonProgress(caps);
    const withoutPdf = computeLessonProgress(
      computeLessonCapabilities({ ...capInput, resources: [] } as never),
    );
    expect(before.denominator).toBe(withoutPdf.denominator);
  });

  it("legacy PDF-only lesson fails closed instead of silently serving the PDF", () => {
    const caps = computeLessonCapabilities({
      ...capInput,
      bookContent: null,
      summaryText: null,
      explanationsCount: 0,
      questionsCount: 0,
    } as never);
    const primary = caps.find((c) => c.type === "PRIMARY_CONTENT")!;
    expect(primary.studentVisible).toBe(false);
    expect(primary.readinessIssue).toBe("LEGACY_ORIGINAL_PDF_ONLY");
  });

  it("8. non-primary supporting resources are not removed", () => {
    const caps = computeLessonCapabilities({
      ...capInput,
      resources: [
        {
          id: "vid-1",
          resource_type: "video",
          title: "شرح مساعد",
          url: "https://example.com/v",
          is_primary: false,
        },
      ],
    } as never);
    expect(caps.some((c) => c.type === "VIDEO" && c.available)).toBe(true);
  });
});

describe("21B4E preservation & regressions", () => {
  it("6. subject-level textbook entry remains available (21B4D)", () => {
    const sheet = read("src/components/textbooks/SubjectTextbooksSheet.tsx");
    expect(sheet).toContain("كتب المنهج");
    expect(sheet).toContain("فتح الكتاب");
    expect(sheet).toContain("محفوظ للاستخدام دون إنترنت");
    expect(read("src/components/home/SubjectGroupsGrid.tsx")).toContain("SubjectTextbooksSheet");
  });

  it("7. legacy lesson_resources data is only read, never deleted", () => {
    const contract = read("src/lib/lessons/lesson-content-contract.ts");
    expect(contract).toContain("originalBookPdf"); // key preserved for admin/legacy
    const page = read("src/routes/_authenticated/lessons.$lessonId.tsx");
    expect(page).not.toContain('.from("lesson_resources").delete()');
  });

  it("12. hidden capabilities are filtered out, not labelled غير متوفر", () => {
    const contract = buildLessonCapabilityContract(base);
    const visible = studentVisibleContract(contract);
    expect(visible.every((c) => c.status === "READY")).toBe(true);
  });

  it("13./14. 18B + 20C contracts still hold", () => {
    const caps = read("src/lib/lessons/lesson-capabilities.ts");
    expect(caps).toContain("visibleLessonCapabilities");
    const contract = read("src/lib/lessons/lesson-content-contract.ts");
    expect(contract).toContain("applyLifecycleOverlay");
    expect(contract).toContain("isLifecycleStudentVisible");
  });

  it("15. 21B4B / 21B4C / 21B4D sources untouched", () => {
    expect(read("mobile/www/index.html")).toContain("openTextbook({ textbookId: textbookId })");
    expect(read("src/lib/offline/local-textbook-registry.ts")).toContain("REGISTRY_PATH");
    expect(read("src/lib/auth/native-oauth.ts")).toContain("auth/mobile-callback");
  });
});
