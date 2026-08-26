import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
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
    assert.deepEqual(
      visible.map((item) => item.type),
      ["PRIMARY_CONTENT"],
    );
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
    assert.equal(
      (lifecycle.officialBookContent as { status: string }).status,
      "READY",
    );
    assert.equal((lifecycle.quickReview as { status: string }).status, "DRAFT");
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
      assert.ok(migration.includes(`'${capability}'`));
    }
    assert.ok(migration.includes("SET status = 'DRAFT'"));
    assert.ok(!migration.includes("SET status = 'READY'"));
    assert.ok(migration.includes("status=READY"));
  });

  it("makes mutation and lifecycle downgrade atomic at the database boundary", () => {
    assert.ok(migration.includes("AFTER INSERT OR UPDATE OR DELETE"));
    assert.ok(migration.includes("PERFORM public.mark_lesson_component_draft"));
    assert.ok(migration.includes("ON CONFLICT (lesson_id, capability) DO UPDATE"));
    assert.ok(migration.includes("REVOKE ALL ON FUNCTION"));
  });
});

// CI event marker: independent component publication contract.
