import { arabicCount, DAY_FORMS } from "@/lib/i18n/arabic-count";
export type ExamSchedule = {
  id: string;
  curriculum_track_id: string;
  grade_id: string | null;
  semester: number | null;
  exam_kind: "ministerial" | "semester_final" | "midterm";
  title: string;
  starts_on: string;
  ends_on: string | null;
  is_published: boolean;
};
export const EXAM_KIND_LABEL = {
  ministerial: "اختبار وزاري",
  semester_final: "نهاية الفصل",
  midterm: "اختبار نصفي",
};
export function adenToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Aden",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function daysBetween(today: string, start: string): number {
  return Math.round(
    (Date.parse(`${start}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
  );
}
export function pickUpcomingExam(
  rows: readonly ExamSchedule[],
  {
    trackId,
    gradeId,
    today,
    semester,
  }: {
    trackId: string | null | undefined;
    gradeId: string | null | undefined;
    today: string;
    semester?: 1 | 2;
  },
): ExamSchedule | null {
  if (!trackId) return null;
  const priority = { ministerial: 0, semester_final: 1, midterm: 2 };
  return (
    rows
      .filter(
        (row) =>
          row.is_published &&
          row.curriculum_track_id === trackId &&
          (row.grade_id === null || row.grade_id === gradeId) &&
          (!semester || row.semester === null || row.semester === semester) &&
          (row.ends_on ?? row.starts_on) >= today,
      )
      .sort(
        (a, b) =>
          a.starts_on.localeCompare(b.starts_on) ||
          Number(a.grade_id === null) - Number(b.grade_id === null) ||
          priority[a.exam_kind] - priority[b.exam_kind] ||
          a.id.localeCompare(b.id),
      )[0] ?? null
  );
}
export function examCountdownLabel(exam: ExamSchedule, today: string): string {
  const days = daysBetween(today, exam.starts_on);
  return days <= 0
    ? `${exam.title} جارية — بالتوفيق`
    : `باقي ${arabicCount(days, DAY_FORMS)} على ${exam.title}`;
}
export function schedulesOverlap(a: ExamSchedule, b: ExamSchedule): boolean {
  return (
    a.id !== b.id &&
    b.is_published &&
    a.curriculum_track_id === b.curriculum_track_id &&
    (a.grade_id === null || b.grade_id === null || a.grade_id === b.grade_id) &&
    a.exam_kind === b.exam_kind &&
    (a.semester === null || b.semester === null || a.semester === b.semester) &&
    a.starts_on <= (b.ends_on ?? b.starts_on) &&
    b.starts_on <= (a.ends_on ?? a.starts_on)
  );
}
