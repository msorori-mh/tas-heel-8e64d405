import assert from "node:assert/strict";
import test from "node:test";
import {
  createSingleFlightGuard,
  redactExamAnswers,
  safeExamMutationMessage,
} from "./exam-client-safety.ts";

test("does not expose answers or explanations before reveal", () => {
  const questions = [{ id: "q1", correct_index: 2, explanation: "secret" }];
  const safe = redactExamAnswers(questions, false);
  assert.equal(safe[0].correct_index, null);
  assert.equal(safe[0].explanation, null);
  assert.equal(questions[0].correct_index, 2, "must not mutate query cache");
});

test("reveals answers only when the server explicitly permits it", () => {
  const safe = redactExamAnswers([{ correct_index: 1, explanation: "because" }], true);
  assert.equal(safe[0].correct_index, 1);
  assert.equal(safe[0].explanation, "because");
});

test("single-flight guard prevents double result submission", () => {
  const guard = createSingleFlightGuard();
  assert.equal(guard.enter(), true);
  assert.equal(guard.enter(), false);
  guard.leave();
  assert.equal(guard.enter(), true);
});

test("network loss produces a safe, non-committal submission message", () => {
  const message = safeExamMutationMessage(new TypeError("Failed to fetch"), "submit");
  assert.match(message, /لم نتأكد/);
  assert.match(message, /لن ترسل الواجهة طلبين متزامنين/);
});
