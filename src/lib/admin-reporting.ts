export type SafeExamSession = {
  id: string;
  score: number;
  total_points: number;
  submitted_at: string | null;
  started_at: string;
  template: {
    title: string;
    subject: { name: string } | null;
  } | null;
};

export type SubjectActivity = {
  name: string;
  sessions: number;
};

export function scorePercentage(score: number, totalPoints: number): number | null {
  if (!Number.isFinite(score) || !Number.isFinite(totalPoints) || totalPoints <= 0) return null;
  return Math.round((score / totalPoints) * 100);
}

export function averageExamPercentage(sessions: readonly SafeExamSession[]): number | null {
  const percentages = sessions
    .map((session) => scorePercentage(session.score, session.total_points))
    .filter((value): value is number => value !== null);

  if (percentages.length === 0) return null;
  return Math.round(percentages.reduce((total, value) => total + value, 0) / percentages.length);
}

export function mostActiveSubjects(
  sessions: readonly SafeExamSession[],
  limit = 5,
): SubjectActivity[] {
  const counts = new Map<string, number>();

  for (const session of sessions) {
    const name = session.template?.subject?.name?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, sessions: count }))
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name, "ar"))
    .slice(0, Math.max(0, limit));
}
