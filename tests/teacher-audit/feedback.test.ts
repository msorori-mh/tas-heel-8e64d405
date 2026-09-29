import { expect, it } from "vitest";
import {
  countLabel,
  durationLabel,
  teacherError,
  validateTeacherProfile,
  shuffledOptions,
} from "../../apps/teacher-academy/src/lib/teacher-feedback";
it("shows the actual duration and Arabic number forms", () => {
  expect(durationLabel(45)).toBe("45 دقيقة");
  expect(durationLabel(125)).toBe("ساعتان و5 دقائق");
  expect(countLabel(3, "lesson")).toBe("3 دروس");
});
it("validates names and phone numbers against existing server limits", () => {
  expect(validateTeacherProfile("هناء أحمد", "+967 777123456", "math", "gov")).toBeNull();
  for (const phone of ["hello world", "+++++++", "123456", "+12345678901234567890"])
    expect(validateTeacherProfile("هناء أحمد", phone, "math", "gov")).toContain("رقم هاتف");
  expect(validateTeacherProfile("هن", "777123456", "math", "gov")).toContain("اسمًا");
});
it("translates assessment limits and hides raw backend errors", () => {
  expect(teacherError(new Error("ASSESSMENT_COOLDOWN"))).toContain("15 دقيقة");
  expect(teacherError(new Error("select * from private_table failed"))).not.toContain(
    "private_table",
  );
});
it("shuffles presentation while retaining every original option ID exactly once", () => {
  for (let n = 0; n < 10; n++) expect(shuffledOptions().sort()).toEqual(["a", "b", "c", "d"]);
});
