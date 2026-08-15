/**
 * QUICK_REVIEW_ADMIN_READINESS_15A_A — static + pure-derivation guards.
 * No DB access: the readiness rule and coverage math must hold on their own,
 * and the module must never touch answers or student identities.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildCoverage,
  filterLessons,
  type AdminReviewLessonRow,
} from "../../src/lib/review/admin-review-coverage";

function row(over: Partial<AdminReviewLessonRow>): AdminReviewLessonRow {
  return {
    lessonId: "l1",
    lessonTitle: "درس",
    subjectId: "s1",
    subjectName: "رياضيات",
    gradeId: "g3",
    gradeName: "الثالث الثانوي",
    trackIds: ["t-sanaa"],
    trackNames: ["صنعاء"],
    unitId: "u1",
    unitTitle: "الوحدة الأولى",
    deliveryMode: "standard",
    hasSummary: true,
    readiness: "READY",
    summary: "ملخص",
    keyPoints: [],
    studyTip: null,
    ...over,
  };
}

const SRC = readFileSync("src/lib/review/admin-review-coverage.ts", "utf8");
const PAGE = readFileSync(
  "src/routes/_authenticated/admin.learning-insights.quick-review.tsx",
  "utf8",
);

describe("15A_A readiness derivation", () => {
  it("counts a unit lesson with a summary as READY", () => {
    const c = buildCoverage([row({})]);
    expect(c.summary.lessonsWithSummary).toBe(1);
    expect(c.summary.coveragePercentage).toBe(100);
  });

  it("counts a direct lesson (no unit) without collapsing it", () => {
    const c = buildCoverage([row({ unitId: null, unitTitle: null })]);
    expect(c.summary.directLessons).toBe(1);
  });

  it("treats a PDF lesson by summary only", () => {
    const c = buildCoverage([
      row({ lessonId: "p1", deliveryMode: "external_pdf" }),
      row({ lessonId: "p2", deliveryMode: "external_pdf", readiness: "NOT_READY", hasSummary: false }),
    ]);
    expect(c.summary.pdfLessons).toBe(2);
    expect(c.summary.pdfReady).toBe(1);
  });

  it("counts a shared subject once per track", () => {
    const c = buildCoverage([
      row({ trackIds: ["t-sanaa", "t-aden"], trackNames: ["صنعاء", "عدن"] }),
    ]);
    expect(c.byTrack.map((b) => b.id).sort()).toEqual(["t-aden", "t-sanaa"]);
    expect(c.bySubject).toHaveLength(1);
  });

  it("reports a subject with zero summaries as 0% coverage", () => {
    const c = buildCoverage([row({ readiness: "NOT_READY", hasSummary: false })]);
    expect(c.bySubject[0].coverage).toBe(0);
    expect(c.summary.lessonsWithoutSummary).toBe(1);
  });

  it("computes mixed readiness correctly", () => {
    const c = buildCoverage([
      row({ lessonId: "a" }),
      row({ lessonId: "b", readiness: "NOT_READY", hasSummary: false }),
      row({ lessonId: "c" }),
    ]);
    expect(c.summary.coveragePercentage).toBeCloseTo(66.7, 1);
  });

  it("stays correct above the 1000-row PostgREST cap", () => {
    const many = Array.from({ length: 2500 }, (_, i) =>
      row({ lessonId: `l${i}`, readiness: i % 2 === 0 ? "READY" : "NOT_READY" }),
    );
    const c = buildCoverage(many);
    expect(c.summary.totalLessons).toBe(2500);
    expect(c.summary.lessonsWithSummary).toBe(1250);
  });

  it("filters by grade, track, subject and readiness", () => {
    const rows = [
      row({ lessonId: "a", gradeId: "g1", subjectId: "s1" }),
      row({ lessonId: "b", gradeId: "g2", subjectId: "s2", trackIds: ["t-aden"], trackNames: ["عدن"] }),
      row({ lessonId: "c", readiness: "NOT_READY", hasSummary: false }),
    ];
    expect(filterLessons(rows, { gradeId: "g2" }).map((r) => r.lessonId)).toEqual(["b"]);
    expect(filterLessons(rows, { trackId: "t-aden" }).map((r) => r.lessonId)).toEqual(["b"]);
    expect(filterLessons(rows, { subjectId: "s1" }).map((r) => r.lessonId)).toEqual(["a", "c"]);
    expect(filterLessons(rows, { readiness: "NOT_READY" }).map((r) => r.lessonId)).toEqual(["c"]);
    expect(filterLessons(rows, { readiness: "ALL" })).toHaveLength(3);
  });
});

describe("15A_A safety guards", () => {
  it("reads no answer/grading data", () => {
    for (const forbidden of [
      "is_correct",
      "question_options",
      "question_revisions",
      "correct_answer",
      "exam_session_answers",
    ]) {
      expect(SRC).not.toContain(forbidden);
    }
  });

  it("never reads student identities", () => {
    expect(SRC).not.toContain("user_progress");
    expect(SRC).not.toContain("profiles");
  });

  it("paginates every read (B5 closed)", () => {
    expect(SRC).toContain("fetchAllPaged");
    expect(SRC).not.toMatch(/\.select\([^)]*\);\s*$/m);
  });

  it("requires full admin, not content staff", () => {
    expect(PAGE).toContain('useRequireAdminSection("full")');
  });

  it("adds no migration dependency", () => {
    expect(SRC).not.toContain("rpc(");
  });
});
