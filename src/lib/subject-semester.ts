export type Semester = 1 | 2;

export function semesterLabel(semester: Semester): string {
  return semester === 1 ? "الفصل الأول" : "الفصل الثاني";
}

export function buildSemesterMap(
  rows: { subject_id: string; semester: number | null }[],
): Map<string, (number | null)[]> {
  const map = new Map<string, (number | null)[]>();
  for (const row of rows) {
    if (!map.has(row.subject_id)) map.set(row.subject_id, []);
    map.get(row.subject_id)!.push(row.semester);
  }
  return map;
}

function childContentMatchesSemester(semesters: (number | null)[], semester: Semester): boolean {
  if (semesters.length === 0) return true;
  return semesters.some((s) => s === null || s === semester);
}

/**
 * Whether a subject should appear on /app for the selected semester.
 * Uses subject.semester plus units/lessons semesters; null semester on rows
 * means shared across both semesters (same rule as subject index page).
 */
export function isSubjectVisibleForSemester(
  subject: { id: string; semester: number | null },
  semester: Semester,
  unitSemesters: Map<string, (number | null)[]>,
  lessonSemesters: Map<string, (number | null)[]>,
): boolean {
  const unitVals = unitSemesters.get(subject.id) ?? [];
  const lessonVals = lessonSemesters.get(subject.id) ?? [];

  if (subject.semester !== null) {
    if (subject.semester === semester) return true;
    return (
      childContentMatchesSemester(unitVals, semester) ||
      childContentMatchesSemester(lessonVals, semester)
    );
  }

  if (unitVals.length === 0 && lessonVals.length === 0) return true;
  return (
    childContentMatchesSemester(unitVals, semester) ||
    childContentMatchesSemester(lessonVals, semester)
  );
}

export function resolveSemesterSearch(
  itemSemester: number | null | undefined,
  selectedSemester?: Semester,
): { semester: Semester } | undefined {
  if (itemSemester === 1 || itemSemester === 2) return { semester: itemSemester };
  if (selectedSemester) return { semester: selectedSemester };
  return undefined;
}
