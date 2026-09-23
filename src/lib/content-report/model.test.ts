import { describe, it, expect } from "vitest";
import {
  buildLessonCapabilityContract,
  applyLifecycleOverlay,
} from "@/lib/lessons/lesson-content-contract";
import { componentReportSummary, reportCells, reportSummary } from "./model";
const base = () =>
  buildLessonCapabilityContract({
    bookContents: [{ content: "<p>نص درس حقيقي</p>" }],
    explanations: [],
    resources: [],
    simulations: [],
    summaries: [],
    officialQuestionsCount: 0,
    assessmentsCount: 0,
    selfTestQuestionsCount: 0,
  });
describe("content completion truth", () => {
  it("excludes NA and optional from required denominator", () => {
    const cells = reportCells(base(), { mindMapHtml: "NA" }, {}, true);
    const s = reportSummary([
      { id: "1", title: "درس", semester: 1, updatedAt: "2026-09-15", cells },
    ]);
    expect(s.required).toBe(5);
    expect(s.published).toBe(1);
    expect(s.complete).toBe(0);
  });
  it("does not equate a draft or review with publication", () => {
    const contract = applyLifecycleOverlay(base(), { officialBookContent: { status: "REVIEW" } });
    const c = reportCells(contract, {}, { officialBookContent: "REVIEW" }, true)[0];
    expect(c.status).toBe("review");
    expect(c.uploaded).toBe(true);
  });
  it("retains readiness while whole lesson is hidden", () =>
    expect(reportCells(base(), {}, {}, false)[0].status).toBe("ready"));
  it("counts malformed uploaded rows as entered but needing correction", () => {
    const c = reportCells(base(), {}, {}, true, { tamkeenExplanationHtml: 1 }).find(
      (c) => c.key === "tamkeenExplanationHtml",
    )!;
    expect(c.status).toBe("invalid");
    expect(c.uploaded).toBe(true);
  });
  it("does not show 100 percent for an empty scope", () =>
    expect(reportSummary([]).percent(0)).toBeNull());
  it("keeps a missing optional experiment out of the gap count", () => {
    const c = reportCells(base(), {}, {}, true).find((c) => c.key === "labExperimentHtml")!;
    expect(c.status).toBe("missing");
    expect(c.required).toBe(false);
  });
});

describe("seven-component operational summaries", () => {
  it("reports upload and remaining counts per component without treating NA as a gap", () => {
    const first = reportCells(base(), { labExperimentHtml: "NA" }, {}, true);
    const second = reportCells(base(), {}, {}, true, {
      tamkeenExplanationHtml: 1,
      labExperimentHtml: 1,
    });
    const summaries = componentReportSummary([
      { id: "1", title: "الأول", semester: 1, updatedAt: "2026-09-15", cells: first },
      { id: "2", title: "الثاني", semester: 1, updatedAt: "2026-09-15", cells: second },
    ]);

    const book = summaries.find((item) => item.key === "officialBookContent")!;
    expect(book.applicable).toBe(2);
    expect(book.uploaded).toBe(2);
    expect(book.remainingUpload).toBe(0);
    expect(book.uploadPercent).toBe(100);

    const explanation = summaries.find((item) => item.key === "tamkeenExplanationHtml")!;
    expect(explanation.applicable).toBe(2);
    expect(explanation.uploaded).toBe(1);
    expect(explanation.remainingUpload).toBe(1);
    expect(explanation.invalid).toBe(1);

    const lab = summaries.find((item) => item.key === "labExperimentHtml")!;
    expect(lab.applicable).toBe(1);
    expect(lab.optional).toBe(1);
    expect(lab.notApplicable).toBe(1);
    expect(lab.uploaded).toBe(1);
    expect(lab.remainingUpload).toBe(0);
  });

  it("returns null percentages when no observed row makes a component applicable", () => {
    const summaries = componentReportSummary([]);
    expect(summaries).toHaveLength(7);
    expect(summaries.every((item) => item.uploadPercent === null)).toBe(true);
    expect(summaries.every((item) => item.publishPercent === null)).toBe(true);
  });
});
