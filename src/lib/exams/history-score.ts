export type HistoryScore = {
  score: number | null;
  total_points: number | null;
  correct_answers: number | null;
  total_questions: number;
  result_json?: unknown;
};

function summary(row: HistoryScore): Record<string, unknown> {
  return row.result_json && typeof row.result_json === "object"
    ? (row.result_json as Record<string, unknown>)
    : {};
}

export function historyPercentage(row: HistoryScore): number | null {
  const result = summary(row);
  if (result.self_review === true || result.manual_review_required === true) return null;
  if (typeof result.percentage === "number" && Number.isFinite(result.percentage)) {
    return result.percentage;
  }
  if (row.score !== null && row.total_points !== null && row.total_points > 0) {
    return (Number(row.score) / row.total_points) * 100;
  }
  if (row.correct_answers !== null && row.total_questions > 0) {
    return (row.correct_answers / row.total_questions) * 100;
  }
  return null;
}

export function historyScoreLabel(row: HistoryScore): string {
  const percent = historyPercentage(row);
  if (percent !== null) return `${Math.round(percent)}%`;
  return summary(row).self_review === true ? "مراجعة ذاتية" : "بانتظار التصحيح";
}

export function historyAnswerLabel(row: HistoryScore): string {
  const result = summary(row);
  if (historyPercentage(row) === null) return `${row.total_questions} سؤالًا`;
  const correct =
    typeof result.correct_count === "number" ? result.correct_count : row.correct_answers;
  return correct === null
    ? `${row.total_questions} سؤالًا`
    : `${correct} صحيح من ${row.total_questions}`;
}

export function historyStats(rows: HistoryScore[]) {
  const percentages = rows
    .map(historyPercentage)
    .filter((value): value is number => value !== null);
  return {
    count: rows.length,
    best: percentages.length ? Math.max(...percentages) : null,
    last: percentages[0] ?? null,
    avg: percentages.length
      ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length
      : null,
  };
}
