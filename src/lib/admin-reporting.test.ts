import assert from "node:assert/strict";
import test from "node:test";
import {
  averageExamPercentage,
  mostActiveSubjects,
  scorePercentage,
  type SafeExamSession,
} from "./admin-reporting.ts";

const session = (
  id: string,
  subject: string | null,
  score: number,
  totalPoints: number,
): SafeExamSession => ({
  id,
  score,
  total_points: totalPoints,
  submitted_at: "2026-07-20T10:00:00.000Z",
  started_at: "2026-07-20T09:00:00.000Z",
  template: {
    title: `اختبار ${id}`,
    subject: subject ? { name: subject } : null,
  },
});

test("computes percentages without division by zero", () => {
  assert.equal(scorePercentage(8, 10), 80);
  assert.equal(scorePercentage(0, 0), null);
});

test("averages only sessions with valid total points", () => {
  assert.equal(
    averageExamPercentage([session("1", "رياضيات", 8, 10), session("2", "علوم", 9, 10)]),
    85,
  );
  assert.equal(averageExamPercentage([session("3", null, 0, 0)]), null);
});

test("aggregates activity without student identifiers", () => {
  const result = mostActiveSubjects([
    session("1", "رياضيات", 8, 10),
    session("2", "علوم", 7, 10),
    session("3", "رياضيات", 9, 10),
  ]);

  assert.deepEqual(result, [
    { name: "رياضيات", sessions: 2 },
    { name: "علوم", sessions: 1 },
  ]);
});
