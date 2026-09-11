import { describe, expect, it } from "vitest";
import {
  schoolChoiceFromProfile,
  schoolProfilePatch,
  schoolSearchKey,
  selectSchool,
} from "../../src/lib/schools/school-choice";
import { createSchoolDirectoryApi } from "../../src/lib/schools/directory-api";

const school = {
  id: "school-1",
  name: "مدرسة النور ١",
  governorate_id: "gov-1",
  district: "مديرية أولى",
  locality: "حي أول",
};
describe("school choice", () => {
  it("requires selection or an explicit proposal instead of saving search text", () => {
    expect(() =>
      schoolProfilePatch({ ...schoolChoiceFromProfile(), school_name: "النور" }, "gov-1"),
    ).toThrow("لم أجد مدرستي");
  });
  it("saves the selected stable identity and its display metadata", () => {
    expect(schoolProfilePatch(selectSchool(school), "gov-1")).toEqual({
      school_id: "school-1",
      school_name: school.name,
      school_district: school.district,
      school_locality: school.locality,
    });
  });
  it("accepts a complete proposal without needing approval first", () => {
    expect(
      schoolProfilePatch({ ...selectSchool(school), mode: "proposal", school_id: null }, "gov-1")
        .school_id,
    ).toBeNull();
  });
  it("requires location on new proposals", () => {
    expect(() =>
      schoolProfilePatch(schoolChoiceFromProfile({ school_name: "النور" }), "gov-1"),
    ).toThrow("المديرية");
    expect(() =>
      schoolProfilePatch(
        schoolChoiceFromProfile({ school_name: "النور", school_district: "معين" }),
        "gov-1",
      ),
    ).toThrow("الحي");
  });
  it("allows an unchanged legacy proposal while editing other profile fields", () => {
    const old = { school_name: "النور", governorate_id: "gov-1" };
    expect(schoolProfilePatch(schoolChoiceFromProfile(old), "gov-1", old).school_name).toBe(
      "النور",
    );
    expect(() => schoolProfilePatch(schoolChoiceFromProfile(old), "gov-2", old)).toThrow(
      "المديرية",
    );
  });
  it("does not silently accept a renamed legacy school without location", () => {
    const old = { school_name: "النور", governorate_id: "gov-1" };
    expect(() =>
      schoolProfilePatch({ ...schoolChoiceFromProfile(old), school_name: "الأمل" }, "gov-1", old),
    ).toThrow("المديرية");
  });
  it("normalizes Arabic search variants without dropping school numbers", () => {
    expect(schoolSearchKey(" مَدْرَسةُ   الأمل ١ ")).toBe(schoolSearchKey("مدرسة الامل 1"));
    expect(schoolSearchKey("النور ١")).not.toBe(schoolSearchKey("النور ٢"));
    expect(schoolSearchKey("النور (۱۲)")).toBe("النور (12)");
  });
  it("requires governorate and bounds names", () => {
    expect(() => schoolProfilePatch(selectSchool(school), "")).toThrow("المحافظة");
    expect(() =>
      schoolProfilePatch({ ...selectSchool(school), school_name: "أ" }, "gov-1"),
    ).toThrow("حرفين");
  });
  it("sends exact reviewed snapshot and handles concurrent edits as a retryable review", async () => {
    const calls: unknown[] = [];
    const api = createSchoolDirectoryApi({
      rpc: async (...args: unknown[]) => {
        calls.push(args);
        return { data: null, error: { message: "SCHOOL_REVIEW_STALE" } };
      },
    });
    const row = {
      kind: "student" as const,
      user_id: "u",
      full_name: "طالب",
      governorate_name: "محافظة",
      school_id: null,
      school_name: "النور",
      governorate_id: "gov-1",
      school_district: null,
      school_locality: null,
    };
    await expect(api.review(row, school)).rejects.toThrow("تغيّرت البيانات");
    expect(calls[0]).toEqual([
      "admin_review_school_profile",
      {
        p_kind: "student",
        p_user_id: "u",
        p_expected: {
          school_id: null,
          school_name: "النور",
          governorate_id: "gov-1",
          school_district: null,
          school_locality: null,
        },
        p_school: school,
      },
    ]);
  });
});
