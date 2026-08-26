/**
 * 20C-B — editorial lifecycle rules (DRAFT → REVIEW → READY).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
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
  test("follows DRAFT → REVIEW → READY and re-opens from READY", () => {
    assert.deepEqual(allowedTransitions(null), ["DRAFT"]);
    assert.deepEqual(allowedTransitions("DRAFT"), ["REVIEW"]);
    assert.deepEqual(allowedTransitions("REVIEW"), ["READY", "DRAFT"]);
    assert.deepEqual(allowedTransitions("READY"), ["DRAFT"]);
  });
});

describe("student visibility", () => {
  test("hides DRAFT/REVIEW, including rows with a frozen snapshot", () => {
    assert.equal(lifecycleVisibleForStudent(undefined), true); // legacy
    assert.equal(lifecycleVisibleForStudent("READY"), true);
    assert.equal(lifecycleVisibleForStudent({ status: "DRAFT" }), false);
    assert.equal(lifecycleVisibleForStudent({ status: "REVIEW" }), false);
    assert.equal(lifecycleVisibleForStudent({ status: "DRAFT", hasReady: true }), false);
    assert.equal(lifecycleVisibleForStudent({ status: "REVIEW", hasReady: true }), false);
  });

  test("maps rows with hasReady from ready_at or snapshot", () => {
    const map = rowsToLifecycleMap([
      row({ status: "DRAFT", ready_at: "2026-01-01T00:00:00Z" }),
      row({ capability: "mindMap", status: "DRAFT" }),
      row({ capability: "not_a_capability", status: "READY" }),
    ]);
    assert.deepEqual(map.tamkeenExplanation, { status: "DRAFT", hasReady: true });
    assert.deepEqual(map.mindMap, { status: "DRAFT", hasReady: false });
    assert.equal(Object.keys(map).length, 2);
  });
});

describe("student capability gate", () => {
  const caps = [{ type: "PRIMARY_CONTENT" }, { type: "EXPLANATION" }, { type: "MINDMAP" }];

  test("is a no-op for unmanaged (legacy) lessons", () => {
    assert.equal(
      filterStudentCapabilitiesByLifecycle(caps, { managed: false, readyKeys: new Set() }).length,
      3,
    );
  });

  test("keeps only READY capabilities once the lesson is managed", () => {
    const out = filterStudentCapabilitiesByLifecycle(caps, {
      managed: true,
      readyKeys: new Set(["officialBookContent"]),
    });
    assert.deepEqual(
      out.map((c) => c.type),
      ["PRIMARY_CONTENT"],
    );
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

  test("marks a new draft revision and keeps it hidden", () => {
    const out = applyLifecycleOverlay(base, {
      tamkeenExplanation: { status: "DRAFT", hasReady: true },
    });
    assert.equal(out.tamkeenExplanation.status, "DRAFT");
    assert.equal(out.tamkeenExplanation.studentVisible, false);
  });

  test("hides a never-approved draft", () => {
    const out = applyLifecycleOverlay(base, { tamkeenExplanation: { status: "DRAFT" } });
    assert.equal(out.tamkeenExplanation.studentVisible, false);
    assert.equal(out.tamkeenExplanation.readinessReason, "DRAFT_NOT_PUBLISHED");
  });
});
