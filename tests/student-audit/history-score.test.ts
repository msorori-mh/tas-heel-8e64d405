import { describe, expect, it } from "vitest";
import {
  historyAnswerLabel,
  historyPercentage,
  historyScoreLabel,
  historyStats,
  type HistoryScore,
} from "@/lib/exams/history-score";
const row: HistoryScore = { score: 8, total_points: 10, correct_answers: 8, total_questions: 10 };
describe("student history grading", () => {
  it("excludes ungraded attempts from averages without excluding actual zero marks", () => {
    const self = { ...row, score: null, correct_answers: null, result_json: { self_review: true } };
    expect(historyPercentage(self)).toBeNull();
    expect(historyScoreLabel(self)).toBe("مراجعة ذاتية");
    expect(historyStats([self, row, { ...row, score: 0, correct_answers: 0 }])).toEqual({
      count: 3,
      best: 80,
      last: 80,
      avg: 40,
    });
  });
  it("does not invent a grade or a correct count for manual and empty attempts", () => {
    const manual = { ...row, score: null, correct_answers: null };
    expect(historyScoreLabel(manual)).toBe("بانتظار التصحيح");
    expect(historyAnswerLabel(manual)).toBe("10 سؤالًا");
    expect(historyStats([manual])).toEqual({ count: 1, best: null, last: null, avg: null });
    expect(historyStats([]).avg).toBeNull();
  });
  it("uses authoritative ministerial correct counts and excludes partial grading", () => {
    expect(
      historyAnswerLabel({
        ...row,
        correct_answers: null,
        result_json: { correct_count: 8, percentage: 80 },
      }),
    ).toBe("8 صحيح من 10");
    expect(historyPercentage({ ...row, result_json: { manual_review_required: true } })).toBeNull();
  });
});
