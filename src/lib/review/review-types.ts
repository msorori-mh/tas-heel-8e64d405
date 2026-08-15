/**
 * Tamkeen ReviewItem contract (15A).
 * Derived from the existing schema — no new table, no new column:
 *   lessons + lesson_summaries + user_progress + subjects/units.
 * Supports both content shapes: Subject → Unit → Lesson and Subject → Lesson.
 * Never carries answers, question payloads or grading data.
 */

export type ReviewItem = {
  lessonId: string;
  lessonTitle: string;
  subjectId: string;
  subjectName: string;
  /** null for direct lessons (no fake unit is ever synthesized). */
  unitId: string | null;
  unitTitle: string | null;
  summary: string;
  keyPoints: string[];
  studyTip: string | null;
  isCompleted: boolean;
  /** "standard" | "external_pdf" … mirrors lessons.delivery_mode */
  deliveryMode: string;
  semester: number | null;
  order: number;
};

export type ReviewGroup = {
  id: string;
  name: string;
  icon: string | null;
  count: number;
};

export type ReviewIndex = {
  items: ReviewItem[];
  groups: ReviewGroup[];
  total: number;
  completed: number;
};

/** Pure derivation of filter chips + counters from already-scoped items. */
export function buildReviewIndex(
  items: ReviewItem[],
  subjects: { id: string; name: string; icon?: string | null }[],
): ReviewIndex {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.subjectId, (counts.get(item.subjectId) ?? 0) + 1);
  }
  const groups: ReviewGroup[] = subjects
    .map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.icon ?? null,
      count: counts.get(s.id) ?? 0,
    }))
    .filter((g) => g.count > 0);

  return {
    items,
    groups,
    total: items.length,
    completed: items.filter((i) => i.isCompleted).length,
  };
}

export function filterReviewItems(
  items: ReviewItem[],
  subjectId: string | null,
): ReviewItem[] {
  if (!subjectId) return items;
  return items.filter((i) => i.subjectId === subjectId);
}

/** A lesson without a usable summary must never produce an empty review card. */
export function hasUsableSummary(summary: string | null | undefined): boolean {
  return typeof summary === "string" && summary.trim().length > 0;
}

export function normalizeKeyPoints(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
}
