import { describe, it, expect } from "vitest";
import {
  buildLessonCapabilityContract,
  applyLifecycleOverlay,
} from "@/lib/lessons/lesson-content-contract";
import { reportCells, reportSummary } from "./model";
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
