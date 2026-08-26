import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  filterStudentCapabilitiesByLifecycle,
  rowsToLifecycleMap,
} from "./lesson-lifecycle";

const migration = readFileSync(
  "supabase/migrations/20260826040000_independent_lesson_component_publishing.sql",
  "utf8",
);

describe("independent lesson component publishing", () => {
  it("keeps DRAFT and REVIEW components out of the student surface", () => {
    const capabilities = [
      { type: "PRIMARY_CONTENT" },
      { type: "SUMMARY" },
      { type: "OFFICIAL_QUESTIONS" },
    ];
    const visible = filterStudentCapabilitiesByLifecycle(capabilities, {
      managed: true,
      readyKeys: new Set(["officialBookContent"]),
    });
    expect(visible.map((item) => item.type)).toEqual(["PRIMARY_CONTENT"]);
  });

  it("preserves independent lifecycle state for each component", () => {
    const lifecycle = rowsToLifecycleMap([
      {
        capability: "officialBookContent",
        status: "READY",
        ready_at: "2026-08-26T00:00:00Z",
        ready_snapshot: null,
        draft_updated_at: null,
        reviewed_at: null,
      },
      {
        capability: "quickReview",
        status: "DRAFT",
        ready_at: null,
        ready_snapshot: null,
        draft_updated_at: "2026-08-26T00:00:00Z",
        reviewed_at: null,
      },
    ]);
    expect(lifecycle.officialBookContent?.status).toBe("READY");
    expect(lifecycle.quickReview?.status).toBe("DRAFT");
  });

  it("guards every canonical authored component and keeps READY explicit", () => {
    for (const capability of [
      "officialBookContent",
      "tamkeenExplanation",
      "quickReview",
      "mindMap",
      "simulation",
      "checkUnderstanding",
      "lessonAssessment",
    ]) {
      expect(migration).toContain(`'${capability}'`);
    }
    expect(migration).toContain("SET status = 'DRAFT'");
    expect(migration).not.toContain("SET status = 'READY'");
    expect(migration).toContain("status=READY");
  });

  it("makes mutation and lifecycle downgrade atomic at the database boundary", () => {
    expect(migration).toContain("AFTER INSERT OR UPDATE OR DELETE");
    expect(migration).toContain("PERFORM public.mark_lesson_component_draft");
    expect(migration).toContain("ON CONFLICT (lesson_id, capability) DO UPDATE");
    expect(migration).toContain("REVOKE ALL ON FUNCTION");
  });
});
