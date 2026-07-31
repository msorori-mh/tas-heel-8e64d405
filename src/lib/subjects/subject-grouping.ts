/**
 * Subject grouping for the first-grade Yemen curriculum.
 *
 * Naming convention (set by the content team, see
 * docs/SUBJECT-GROUPING-GRADE-10-YEMEN-CONTENT-GUIDE.md):
 *   "<main subject> - <sub-section>"
 * e.g. "اللغة العربية - النحو والصرف".
 *
 * - The part before the separator is the main (parent) subject.
 * - The part after it is the sub-section.
 * - Names without a separator are ordinary subjects and open directly.
 *
 * Grouping is display-only: every section keeps its original subject.id and
 * navigates to the real subject page. No schema or data changes.
 */

/** Minimal shape the grouping logic needs. */
export type GroupableSubject = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
};

export type SubjectGroup<T extends GroupableSubject = GroupableSubject> = {
  /** Main category name (part before the separator, or the full name). */
  key: string;
  /** Display color/icon inherited from the lowest-sort_order member. */
  color: string | null;
  icon: string | null;
  /** Lowest sort_order inside the group — used to order groups. */
  sortOrder: number;
  /** Members sorted by sort_order. Each keeps its original subject.id. */
  subjects: T[];
  /** True when the group has more than one section (render as one card). */
  isGroup: boolean;
};

/** Dash characters accepted as category separators. */
const SEPARATOR_RUN = /\s*[-‐‑‒–—―−]+\s*/g;

/**
 * Normalizes the separator spelling inside a subject name: trims outer
 * whitespace, collapses inner whitespace, and unifies common dash variants
 * (with or without surrounding spaces) into a single " - " separator.
 *
 * Convention: subject names must not contain dashes for any purpose other
 * than the category separator (see the content guide), so every dash
 * variant is treated as a separator.
 */
export function normalizeSubjectNameSeparators(name: string): string {
  return (name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(SEPARATOR_RUN, " - ")
    .replace(/( - )+/g, " - ")
    .trim();
}

/** Main category: part before the separator, or the full name. */
export function getSubjectMainCategory(subjectName: string): string {
  const normalized = normalizeSubjectNameSeparators(subjectName);
  const idx = normalized.indexOf(" - ");
  return idx === -1 ? normalized : normalized.slice(0, idx).trim();
}

/** Sub-section: part after the first separator, or "" for ordinary subjects. */
export function getSubjectSubCategory(subjectName: string): string {
  const normalized = normalizeSubjectNameSeparators(subjectName);
  const idx = normalized.indexOf(" - ");
  return idx === -1 ? "" : normalized.slice(idx + 3).trim();
}

const bySortOrder = <T extends GroupableSubject>(a: T, b: T) => a.sort_order - b.sort_order;

/**
 * Groups subjects by their main category.
 * - One card per main category, no duplicates.
 * - Groups are ordered by the lowest sort_order inside each group.
 * - Members are ordered by sort_order and keep their original subject.id.
 * - Ordinary subjects (no separator) form single-member groups.
 */
export function groupSubjectsByMainCategory<T extends GroupableSubject>(
  subjects: readonly T[],
): SubjectGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const subject of subjects) {
    const key = getSubjectMainCategory(subject.name);
    const list = map.get(key);
    if (list) list.push(subject);
    else map.set(key, [subject]);
  }

  const groups: SubjectGroup<T>[] = [];
  for (const [key, members] of map) {
    const sorted = [...members].sort(bySortOrder);
    const first = sorted[0];
    groups.push({
      key,
      color: first.color,
      icon: first.icon,
      sortOrder: first.sort_order,
      subjects: sorted,
      isGroup: sorted.length > 1,
    });
  }
  return groups.sort((a, b) => a.sortOrder - b.sortOrder);
}
