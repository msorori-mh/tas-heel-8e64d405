import { describe, expect, it } from "vitest";
import {
  buildOverviewFacts,
  overviewAttentionRows,
  overviewBreakdown,
  overviewComponentSummary,
  overviewSummary,
  scopeOverviewFacts,
  type ContentOverviewCatalog,
  type OverviewLifecycleRow,
} from "./overview";

const catalog: ContentOverviewCatalog = {
  subjects: [
    { id: "chem", name: "الكيمياء", grade_id: "g12", curriculum_track_id: "aden" },
    { id: "bio", name: "الأحياء", grade_id: "g12", curriculum_track_id: null },
  ],
  grades: [{ id: "g12", name: "الثالث الثانوي" }],
  tracks: [
    { id: "aden", track_name: "عدن" },
    { id: "sanaa", track_name: "صنعاء" },
  ],
  links: [{ subject_id: "bio", curriculum_track_id: "sanaa" }],
};

const ready = (lesson_id: string, capability: string, applicability = "REQUIRED") =>
  ({ lesson_id, capability, status: "READY", applicability }) satisfies OverviewLifecycleRow;

describe("general content overview", () => {
  it("keeps unmanaged legacy lessons out of lifecycle gap denominators", () => {
    const facts = buildOverviewFacts(
      [
        {
          id: "iron",
          title: "الحديد",
          subject_id: "chem",
          semester: 1,
          updated_at: "2026-09-23",
        },
        {
          id: "cell",
          title: "الخلية",
          subject_id: "bio",
          semester: 2,
          updated_at: "2026-09-23",
        },
      ],
      [
        ready("iron", "officialBookContent"),
        ready("iron", "tamkeenExplanation"),
        {
          lesson_id: "iron",
          capability: "quickReview",
          status: "REVIEW",
          applicability: "REQUIRED",
        },
      ],
      [
        { lesson_id: "iron", managed: true, visible: false },
        { lesson_id: "cell", managed: false, visible: true },
      ],
    );

    const summary = overviewSummary(facts);
    expect(summary.totalLessons).toBe(2);
    expect(summary.managedLessons).toBe(1);
    expect(summary.unmanagedLessons).toBe(1);
    expect(summary.visibleLessons).toBe(1);
    expect(summary.requiredTotal).toBe(6);
    expect(summary.requiredReady).toBe(2);
    expect(summary.requiredReview).toBe(1);
    expect(summary.requiredMissing).toBe(3);
  });

  it("summarizes every canonical component without counting NA as applicable", () => {
    const facts = buildOverviewFacts(
      [
        {
          id: "iron",
          title: "الحديد",
          subject_id: "chem",
          semester: 1,
          updated_at: "2026-09-23",
        },
      ],
      [ready("iron", "officialBookContent"), ready("iron", "simulation", "NA")],
      [{ lesson_id: "iron", managed: true, visible: false }],
    );
    const components = overviewComponentSummary(facts);
    expect(components).toHaveLength(7);
    expect(components.find((item) => item.key === "officialBookContent")?.ready).toBe(1);
    expect(components.find((item) => item.key === "labExperimentHtml")?.applicable).toBe(0);
  });

  it("scopes by grade, track, semester and subject and supports drilldown groups", () => {
    const facts = buildOverviewFacts(
      [
        {
          id: "iron",
          title: "الحديد",
          subject_id: "chem",
          semester: 1,
          updated_at: "2026-09-23",
        },
        {
          id: "cell",
          title: "الخلية",
          subject_id: "bio",
          semester: 2,
          updated_at: "2026-09-23",
        },
      ],
      [],
      [
        { lesson_id: "iron", managed: false, visible: true },
        { lesson_id: "cell", managed: false, visible: true },
      ],
    );

    expect(scopeOverviewFacts(facts, catalog, { trackId: "aden" }).map((row) => row.id)).toEqual([
      "iron",
    ]);
    expect(
      scopeOverviewFacts(facts, catalog, { trackId: "sanaa", semester: "2" }).map((row) => row.id),
    ).toEqual(["cell"]);
    expect(overviewBreakdown(facts, catalog, "subject").map((row) => row.label)).toEqual([
      "الأحياء",
      "الكيمياء",
    ]);
  });

  it("orders lesson attention by the number of missing required capabilities", () => {
    const facts = buildOverviewFacts(
      [
        {
          id: "iron",
          title: "الحديد",
          subject_id: "chem",
          semester: 1,
          updated_at: "2026-09-23",
        },
      ],
      [ready("iron", "officialBookContent")],
      [{ lesson_id: "iron", managed: true, visible: false }],
    );
    const rows = overviewAttentionRows(facts, catalog);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("الحديد");
    expect(rows[0].requiredReady).toBe(1);
    expect(rows[0].missingLabels.length).toBeGreaterThan(0);
  });
});
