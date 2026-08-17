/**
 * 20C-B — editorial lifecycle rules (DRAFT → REVIEW → READY).
 */
import { describe, it, expect } from "vitest";
import {
  allowedTransitions,
  filterStudentCapabilitiesByLifecycle,
  lifecycleVisibleForStudent,
  rowsToLifecycleMap,
  type LessonLifecycleRow,
} from "./lesson-lifecycle";
import { applyLifecycleOverlay } from "./lesson-content-contract";

const row = (over: Partial<LessonLifecycleRow>): LessonLifecycleRow => ({
  capability: "tamkeenExplanation",
  status: "READY",
  ready_at: null,
  ready_snapshot: null,
  draft_updated_at: null,
  reviewed_at: null,
  ...over,
});

describe("lifecycle transitions", () => {
  it("follows DRAFT → REVIEW → READY and re-opens from READY", () => {
    expect(allowedTransitions(null)).toEqual(["DRAFT"]);
    expect(allowedTransitions("DRAFT")).toEqual(["REVIEW"]);
    expect(allowedTransitions("REVIEW")).toEqual(["READY", "DRAFT"]);
    expect(allowedTransitions("READY")).toEqual(["DRAFT"]);
  });
});

describe("student visibility", () => {
  it("hides never-approved drafts and keeps frozen READY snapshots live", () => {
    expect(lifecycleVisibleForStudent(undefined)).toBe(true); // legacy
    expect(lifecycleVisibleForStudent("READY")).toBe(true);
    expect(lifecycleVisibleForStudent({ status: "DRAFT" })).toBe(false);
    expect(lifecycleVisibleForStudent({ status: "REVIEW" })).toBe(false);
    expect(lifecycleVisibleForStudent({ status: "DRAFT", hasReady: true })).toBe(true);
  });

  it("maps rows with hasReady from ready_at or snapshot", () => {
    const map = rowsToLifecycleMap([
      row({ status: "DRAFT", ready_at: "2026-01-01T00:00:00Z" }),
      row({ capability: "mindMap", status: "DRAFT" }),
      row({ capability: "not_a_capability", status: "READY" }),
    ]);
    expect(map.tamkeenExplanation).toEqual({ status: "DRAFT", hasReady: true });
    expect(map.mindMap).toEqual({ status: "DRAFT", hasReady: false });
    expect(Object.keys(map)).toHaveLength(2);
  });
});

describe("student capability gate", () => {
  const caps = [{ type: "PRIMARY_CONTENT" }, { type: "EXPLANATION" }, { type: "MINDMAP" }];

  it("is a no-op for unmanaged (legacy) lessons", () => {
    expect(
      filterStudentCapabilitiesByLifecycle(caps, { managed: false, readyKeys: new Set() }),
    ).toHaveLength(3);
  });

  it("keeps only READY capabilities once the lesson is managed", () => {
    const out = filterStudentCapabilitiesByLifecycle(caps, {
      managed: true,
      readyKeys: new Set(["officialBookContent"]),
    });
    expect(out.map((c) => c.type)).toEqual(["PRIMARY_CONTENT"]);
  });
});

describe("admin overlay", () => {
  const base = {
    tamkeenExplanation: {
      key: "tamkeenExplanation",
      label: "شرح",
      icon: "x",
      present: true,
      status: "READY",
      studentVisible: true,
      sourceRef: "lesson_explanations",
      count: 1,
      updatedAt: null,
      readinessReason: null,
    },
  } as any;

  it("marks a new draft revision but keeps the approved version live", () => {
    const out = applyLifecycleOverlay(base, {
      tamkeenExplanation: { status: "DRAFT", hasReady: true },
    });
    expect(out.tamkeenExplanation.status).toBe("DRAFT");
    expect(out.tamkeenExplanation.studentVisible).toBe(true);
  });

  it("hides a never-approved draft", () => {
    const out = applyLifecycleOverlay(base, { tamkeenExplanation: { status: "DRAFT" } });
    expect(out.tamkeenExplanation.studentVisible).toBe(false);
    expect(out.tamkeenExplanation.readinessReason).toBe("DRAFT_NOT_PUBLISHED");
  });
});
