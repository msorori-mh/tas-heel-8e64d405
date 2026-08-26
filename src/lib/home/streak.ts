/** Count consecutive calendar days with activity, starting from today (or yesterday if today empty). */
export function computeStudyStreak(activityDates: string[]): number {
  if (activityDates.length === 0) return 0;

  const days = new Set(
    activityDates.map((iso) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }),
  );

  const today = new Date();
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let streak = 0;

  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  // Allow starting from yesterday if no activity today yet
  if (!days.has(key(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (days.has(key(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}
