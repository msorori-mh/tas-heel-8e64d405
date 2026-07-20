import assert from "node:assert/strict";
import test from "node:test";
import { mapStartExamError } from "./exam-start-errors.ts";

test("free-access start does not ask a student to subscribe", () => {
  const message = mapStartExamError({ message: "subscription_required" });
  assert.doesNotMatch(message, /اشتراك|دفع|محفظة/);
});

test("start_exam_session scope failures are safe and specific", () => {
  assert.match(mapStartExamError({ message: "grade_mismatch" }), /صفك الدراسي/);
  assert.match(mapStartExamError({ message: "curriculum_mismatch" }), /منهجك الحالي/);
});
