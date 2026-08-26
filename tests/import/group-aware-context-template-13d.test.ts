/**
 * GROUP_AWARE_CONTEXT_TEMPLATE_13D — template 01 (المواد) group-aware planner.
 *
 * UI/generator-only phase: no migration, no DB writes.
 */
import { describe, expect, it } from "vitest";
import {
  planSubjectTemplateRows,
  allocateGroupCode,
} from "@/lib/content-codes/subject-template-plan";
import { isTcs2Code, isLegacyTcs1Code, parseTcs2Code } from "@/lib/content-codes/tcs2";

const ISLAMIC_BRANCHES = ["الإيمان", "الفقه", "الحديث", "السيرة النبوية"];

function groupPlan(overrides: Partial<Parameters<typeof planSubjectTemplateRows>[0]> = {}) {
  return planSubjectTemplateRows({
    mode: "group",
    gradeSlug: "grade-10",
    trackCodes: ["sanaa", "aden"],
    groupName: "التربية الإسلامية",
    branchNames: ISLAMIC_BRANCHES,
    existingSubjectCodes: [],
    existingGroupCodes: [],
    ...overrides,
  });
}

describe("13D — group mode (operational example)", () => {
  it("emits exactly one row per branch", () => {
    const plan = groupPlan();
    expect(plan.rows).toHaveLength(ISLAMIC_BRANCHES.length);
    expect(plan.rows.map((r) => r.name)).toEqual(ISLAMIC_BRANCHES);
  });

  it("uses ONE group_code for every branch", () => {
    const plan = groupPlan();
    const groupCodes = new Set(plan.rows.map((r) => r.group_code));
    expect(groupCodes.size).toBe(1);
    expect(plan.groupCode).toBe("grp-g10-01");
    expect([...groupCodes][0]).toBe(plan.groupCode);
    expect(new Set(plan.rows.map((r) => r.group_name))).toEqual(new Set(["التربية الإسلامية"]));
  });

  it("allocates a unique, independent subject_code per branch", () => {
    const plan = groupPlan();
    const codes = plan.rows.map((r) => r.subject_code!);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(["sub-g10-001", "sub-g10-002", "sub-g10-003", "sub-g10-004"]);
    for (const code of codes) expect(isTcs2Code(code, "subject")).toBe(true);
  });

  it("writes the selected tracks into track_codes and grade from the grade picker", () => {
    const plan = groupPlan();
    for (const row of plan.rows) {
      expect(row.track_codes).toBe("sanaa|aden");
      expect(row.grade_slug).toBe("grade-10");
    }
  });

  it("emits TCS-2 codes only — never legacy TCS-1", () => {
    const plan = groupPlan();
    for (const code of plan.allocatedCodes) {
      expect(isLegacyTcs1Code(code)).toBe(false);
      const parsed = parseTcs2Code(code);
      expect(parsed).not.toBeNull();
      expect(parsed!.trackCode).toBeUndefined();
      expect(["subject", "group"]).toContain(parsed!.kind);
    }
  });

  it("continues numbering after existing codes and never reuses them", () => {
    const plan = groupPlan({
      existingSubjectCodes: ["sub-g10-001", "sub-g10-002"],
      existingGroupCodes: ["grp-g10-01"],
    });
    expect(plan.groupCode).toBe("grp-g10-02");
    expect(plan.rows.map((r) => r.subject_code)).toEqual([
      "sub-g10-003",
      "sub-g10-004",
      "sub-g10-005",
      "sub-g10-006",
    ]);
  });

  it("rejects a missing group name, empty branches and duplicates", () => {
    expect(() => groupPlan({ groupName: "  " })).toThrow(/اسم مجموعة/);
    expect(() => groupPlan({ branchNames: [] })).toThrow(/فرع واحد/);
    expect(() => groupPlan({ branchNames: ["الفقه", "الفقه"] })).toThrow(/مكرر/);
    expect(() => groupPlan({ trackCodes: [] })).toThrow(/مسار/);
    expect(() => groupPlan({ trackCodes: ["taiz"] })).toThrow(/غير معروف/);
  });
});

describe("13D — single mode is unaffected", () => {
  const single = planSubjectTemplateRows({
    mode: "single",
    gradeSlug: "grade-12",
    trackCodes: ["aden"],
    rowCount: 3,
    existingSubjectCodes: ["sub-g12-001"],
    existingGroupCodes: ["grp-g12-01"],
  });

  it("keeps row count from the picker and adds no group columns", () => {
    expect(single.rows).toHaveLength(3);
    expect(single.groupCode).toBeNull();
    for (const row of single.rows) {
      expect(row.group_code).toBeUndefined();
      expect(row.group_name).toBeUndefined();
      expect(row.track_codes).toBe("aden");
    }
    expect(single.prefilledColumns).toEqual(["subject_code", "grade_slug", "track_codes"]);
  });

  it("allocates sequential TCS-2 subject codes", () => {
    expect(single.rows.map((r) => r.subject_code)).toEqual([
      "sub-g12-002",
      "sub-g12-003",
      "sub-g12-004",
    ]);
  });
});

describe("13D — group code allocator", () => {
  it("is grade-scoped and TCS-2 shaped", () => {
    expect(allocateGroupCode([], "grade-11")).toBe("grp-g11-01");
    expect(allocateGroupCode(["grp-g11-01", "grp-g12-05"], "grade-11")).toBe("grp-g11-02");
    expect(isTcs2Code(allocateGroupCode([], "grade-12"), "group")).toBe(true);
  });
});
