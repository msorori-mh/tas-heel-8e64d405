import assert from "node:assert/strict";
import test from "node:test";
import {
  canRetryAfterServerReconciliation,
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

test("ambiguous submission can retry only after server confirms in-progress", () => {
  assert.equal(
    canRetryAfterServerReconciliation({
      status: "success",
      data: { session: { status: "in_progress" } },
    }),
    true,
  );
  assert.equal(
    canRetryAfterServerReconciliation({
      status: "success",
      data: { session: { status: "submitted" } },
    }),
    false,
  );
  assert.equal(canRetryAfterServerReconciliation(undefined), false);
});

test("failed reconciliation stays locked even when stale cache says in-progress", () => {
  assert.equal(
    canRetryAfterServerReconciliation({
      status: "error",
      data: { session: { status: "in_progress" } },
      error: new TypeError("Failed to fetch"),
    }),
    false,
  );
});

test("network loss produces a safe, non-committal submission message", () => {
  const message = safeExamMutationMessage(new TypeError("Failed to fetch"), "submit");
  assert.match(message, /لم نتأكد/);
  assert.match(message, /حدّث الصفحة للتحقق/);
});
