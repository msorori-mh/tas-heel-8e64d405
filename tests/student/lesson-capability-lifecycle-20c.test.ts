/**
 * TAMKEEN_YOUSUF_LESSON_CONTENT_WORKFLOW_20C — contract-level lifecycle tests.
 * A / B / C / D / E / H / I / J from the 20C test matrix.
 */
import { describe, expect, it } from "vitest";
import {
  buildLessonCapabilityContract,
  computeLessonReadinessLevels,
  studentVisibleContract,
  STUDENT_CAPABILITY_ORDER,
  type LessonContentContractInput,
} from "@/lib/lessons/lesson-content-contract";

const base: LessonContentContractInput = {
  lessonTitle: "الدرس الأول",
  bookContents: [{ content: "نص الكتاب الرسمي الكامل للدرس", updated_at: "2026-08-01" }],
  explanations: [{ updated_at: "2026-08-01" }],
  resources: [],
  simulations: [],
  summaries: [{ summary: "ملخص سريع للدرس", updated_at: "2026-08-01" }],
  questionsCount: 5,
  assessmentsCount: 1,
  lessonExamCount: 0,
};

describe("20C lifecycle overlay", () => {
  it("A — DRAFT capability is hidden from the student", () => {
    const c = buildLessonCapabilityContract({
      ...base,
      lifecycle: { officialBookContent: "DRAFT" },
    });
    expect(c.officialBookContent.studentVisible).toBe(false);
    expect(c.officialBookContent.status).toBe("DRAFT");
    expect(studentVisibleContract(c).map((x) => x.key)).not.toContain("officialBookContent");
  });

  it("B — REVIEW capability is hidden from the student", () => {
    const c = buildLessonCapabilityContract({
      ...base,
      lifecycle: { tamkeenExplanation: "REVIEW" },
    });
    expect(c.tamkeenExplanation.studentVisible).toBe(false);
    expect(studentVisibleContract(c).map((x) => x.key)).not.toContain("tamkeenExplanation");
  });

  it("C — READY capability stays visible", () => {
    const c = buildLessonCapabilityContract({
      ...base,
      lifecycle: { officialBookContent: "READY", quickReview: "READY" },
    });
    expect(c.officialBookContent.studentVisible).toBe(true);
    expect(studentVisibleContract(c).map((x) => x.key)).toContain("quickReview");
  });

  it("D — a new draft over a READY capability never hides the approved version", () => {
    // the workspace keeps serving the frozen READY snapshot: the student-facing
    // contract is built from the READY snapshot, so status stays READY.
    const student = buildLessonCapabilityContract({ ...base, lifecycle: { quickReview: "READY" } });
    const admin = buildLessonCapabilityContract({ ...base, lifecycle: { quickReview: "DRAFT" } });
    expect(student.quickReview.studentVisible).toBe(true);
    expect(admin.quickReview.studentVisible).toBe(false);
  });

  it("E/F — reject back to draft is still hidden, admin preview still sees content present", () => {
    const c = buildLessonCapabilityContract({ ...base, lifecycle: { quickReview: "DRAFT" } });
    expect(c.quickReview.present).toBe(true);
    expect(c.quickReview.studentVisible).toBe(false);
  });

  it("readiness ignores present-but-not-READY content", () => {
    const c = buildLessonCapabilityContract({ ...base, lifecycle: { quickReview: "DRAFT" } });
    const r = computeLessonReadinessLevels(c);
    expect(r.learningReady).toBe(false);
    expect(r.fullyReady).toBe(false);
  });

  it("H — capability order preserved", () => {
    expect(STUDENT_CAPABILITY_ORDER[0]).toBe("officialBookContent");
    // 21B4E — originalBookPdf left the student journey entirely.
    expect(STUDENT_CAPABILITY_ORDER).not.toContain("originalBookPdf");
    expect(STUDENT_CAPABILITY_ORDER[STUDENT_CAPABILITY_ORDER.length - 1]).toBe(
      "studentPerformance",
    );
    const c = buildLessonCapabilityContract(base);
    const keys = studentVisibleContract(c).map((x) => x.key);
    const idx = keys.map((k) => STUDENT_CAPABILITY_ORDER.indexOf(k));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it("I/J — legacy content with no lifecycle row keeps its current visibility", () => {
    const c = buildLessonCapabilityContract(base); // no lifecycle map at all
    expect(c.officialBookContent.studentVisible).toBe(true);
    expect(c.tamkeenExplanation.studentVisible).toBe(true);
    expect(c.checkUnderstanding.studentVisible).toBe(true);
  });
});
