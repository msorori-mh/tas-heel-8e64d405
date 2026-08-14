import { describe, expect, it } from "vitest";
import {
  CONTENT_CODE_SCHEME_VERSION,
  Tcs1Error,
  allocateTcs1Codes,
  buildLessonCode,
  buildQuestionCode,
  buildSubjectCode,
  buildUnitCode,
  isTcs1Code,
  nextAllocatedNumber,
  parseTcs1Code,
} from "@/lib/content-codes/tcs1";
import { TCS1_GRADES, TCS1_TRACKS } from "@/lib/content-codes/tcs1-master-data";

const scope = { gradeSlug: "grade-10", trackCode: "aden" };

describe("TCS-1 scheme", () => {
  it("is versioned", () => {
    expect(CONTENT_CODE_SCHEME_VERSION).toBe("TCS-1");
  });

  it("builds zero-padded codes", () => {
    expect(buildSubjectCode(scope, 3)).toBe("sub-g10-aden-003");
    expect(buildUnitCode(scope, 3, 2)).toBe("unit-g10-aden-003-02");
    expect(buildLessonCode(scope, 3, 4)).toBe("lesson-g10-aden-003-004");
    expect(buildQuestionCode(scope, 3, 7)).toBe("q-g10-aden-003-00007");
  });

  it("keeps the lesson code independent of the unit", () => {
    expect(buildLessonCode(scope, 3, 4)).not.toContain("unit");
  });

  it("keeps the question code independent of the lesson", () => {
    expect(buildQuestionCode(scope, 3, 7)).not.toContain("lesson");
  });

  it("rejects grades and tracks outside master data", () => {
    expect(() => buildSubjectCode({ gradeSlug: "grade-99", trackCode: "aden" }, 1)).toThrow(Tcs1Error);
    expect(() => buildSubjectCode({ gradeSlug: "grade-10", trackCode: "taiz" }, 1)).toThrow(Tcs1Error);
  });

  it("only accepts real master data values", () => {
    for (const g of TCS1_GRADES) {
      for (const t of TCS1_TRACKS) {
        expect(isTcs1Code(buildSubjectCode({ gradeSlug: g.gradeSlug, trackCode: t.trackCode }, 1), "subject")).toBe(true);
      }
    }
  });

  it("round-trips through the parser", () => {
    const parsed = parseTcs1Code("lesson-g11-sanaa-012-105");
    expect(parsed).toMatchObject({
      kind: "lesson",
      gradeSlug: "grade-11",
      trackCode: "sanaa",
      numbers: [12, 105],
    });
  });

  it("rejects malformed codes", () => {
    for (const bad of ["sub-g10-aden-3", "SUB-G10-ADEN-003 x", "arabic-g10-nahw", "", "unit-g10-aden-003"]) {
      expect(isTcs1Code(bad)).toBe(false);
    }
  });

  it("allocates after the highest existing number, scoped", () => {
    const existing = ["sub-g10-aden-001", "sub-g10-aden-007", "sub-g10-sanaa-030", "legacy-code"];
    expect(nextAllocatedNumber(existing, "subject", scope)).toBe(8);
    expect(allocateTcs1Codes({ existingCodes: existing, kind: "subject", scope, count: 2 })).toEqual([
      "sub-g10-aden-008",
      "sub-g10-aden-009",
    ]);
  });

  it("never reuses a code within a parent scope", () => {
    const existing = ["unit-g10-aden-003-01", "unit-g10-aden-004-09"];
    const codes = allocateTcs1Codes({
      existingCodes: existing,
      kind: "unit",
      scope,
      fixed: [3],
      count: 2,
    });
    expect(codes).toEqual(["unit-g10-aden-003-02", "unit-g10-aden-003-03"]);
    expect(codes.some((c) => existing.includes(c))).toBe(false);
  });

  it("fails closed on numeric overflow instead of emitting a bad code", () => {
    expect(() =>
      allocateTcs1Codes({ existingCodes: ["sub-g10-aden-999"], kind: "subject", scope, count: 1 }),
    ).toThrow(Tcs1Error);
  });
});
