/**
 * QUICK_REVIEW_ADMIN_READINESS_15A_A
 *
 * Admin-side readiness view over the SAME source of truth as the student
 * Quick Review (15A): lessons + lesson_summaries + subjects + units +
 * subject_curriculum_tracks. No new table, no new column, no migration.
 *
 * Readiness rule (identical to the student contract):
 *   READY  = the lesson has a usable summary (`hasUsableSummary`)
 *   NOT_READY = no summary row, or an empty/whitespace summary
 * PDF lessons follow the exact same rule: a PDF is never read and a summary
 * is never generated automatically.
 *
 * B5: every read is paginated with an explicit `.range()` loop, so the
 * PostgREST 1000-row cap can never silently truncate the coverage numbers.
 */

import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaged } from "./review-paging";
import { hasUsableSummary, normalizeKeyPoints } from "./review-types";

const ID_CHUNK = 100;

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export type ReadinessStatus = "READY" | "NOT_READY";

export type AdminReviewLessonRow = {
  lessonId: string;
  lessonTitle: string;
  subjectId: string;
  subjectName: string;
  gradeId: string | null;
  gradeName: string | null;
  trackIds: string[];
  trackNames: string[];
  /** null for direct lessons (Subject → Lesson, no unit). */
  unitId: string | null;
  unitTitle: string | null;
  deliveryMode: string;
  hasSummary: boolean;
  readiness: ReadinessStatus;
  /** Preview payload — same shape the student focus reader renders. */
  summary: string;
  keyPoints: string[];
  studyTip: string | null;
};

export type CoverageBucket = {
  id: string;
  name: string;
  total: number;
  ready: number;
  notReady: number;
  coverage: number;
};

export type AdminReviewCoverage = {
  summary: {
    totalLessons: number;
    lessonsWithSummary: number;
    lessonsWithoutSummary: number;
    coveragePercentage: number;
    pdfLessons: number;
    pdfReady: number;
    directLessons: number;
  };
  byGrade: CoverageBucket[];
  byTrack: CoverageBucket[];
  bySubject: CoverageBucket[];
  lessons: AdminReviewLessonRow[];
};

export type AdminReviewFilters = {
  gradeId?: string | null;
  trackId?: string | null;
  subjectId?: string | null;
  readiness?: ReadinessStatus | "ALL";
};

function percentage(ready: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((ready / total) * 1000) / 10;
}

function bucketize(
  rows: AdminReviewLessonRow[],
  key: (row: AdminReviewLessonRow) => { id: string; name: string }[],
): CoverageBucket[] {
  const map = new Map<string, CoverageBucket>();
  for (const row of rows) {
    for (const entry of key(row)) {
      const current =
        map.get(entry.id) ??
        ({ id: entry.id, name: entry.name, total: 0, ready: 0, notReady: 0, coverage: 0 } as CoverageBucket);
      current.total += 1;
      if (row.readiness === "READY") current.ready += 1;
      else current.notReady += 1;
      map.set(entry.id, current);
    }
  }
  return Array.from(map.values())
    .map((b) => ({ ...b, coverage: percentage(b.ready, b.total) }))
    .sort((a, b) => a.coverage - b.coverage || b.total - a.total);
}

/** Pure derivation — unit-testable without any client. */
export function buildCoverage(rows: AdminReviewLessonRow[]): AdminReviewCoverage {
  const ready = rows.filter((r) => r.readiness === "READY").length;
  const pdf = rows.filter((r) => r.deliveryMode !== "standard");
  return {
    summary: {
      totalLessons: rows.length,
      lessonsWithSummary: ready,
      lessonsWithoutSummary: rows.length - ready,
      coveragePercentage: percentage(ready, rows.length),
      pdfLessons: pdf.length,
      pdfReady: pdf.filter((r) => r.readiness === "READY").length,
      directLessons: rows.filter((r) => r.unitId === null).length,
    },
    byGrade: bucketize(rows, (r) =>
      r.gradeId ? [{ id: r.gradeId, name: r.gradeName ?? "—" }] : [],
    ),
    byTrack: bucketize(rows, (r) =>
      r.trackIds.map((id, i) => ({ id, name: r.trackNames[i] ?? "—" })),
    ),
    bySubject: bucketize(rows, (r) => [{ id: r.subjectId, name: r.subjectName }]),
    lessons: rows,
  };
}

/** Pure client-side filtering over the already-fetched rows. */
export function filterLessons(
  rows: AdminReviewLessonRow[],
  filters: AdminReviewFilters,
): AdminReviewLessonRow[] {
  return rows.filter((row) => {
    if (filters.gradeId && row.gradeId !== filters.gradeId) return false;
    if (filters.trackId && !row.trackIds.includes(filters.trackId)) return false;
    if (filters.subjectId && row.subjectId !== filters.subjectId) return false;
    if (filters.readiness && filters.readiness !== "ALL" && row.readiness !== filters.readiness)
      return false;
    return true;
  });
}

type SubjectRow = {
  id: string;
  name: string;
  grade_id: string | null;
};

type LessonRow = {
  id: string;
  title: string;
  subject_id: string;
  unit_id: string | null;
  sort_order: number | null;
  delivery_mode: string;
};

/**
 * Fetches every lesson visible to the caller plus its summary state.
 * RLS decides visibility — this module never re-implements access rules.
 */
export async function fetchAdminReviewCoverage(): Promise<AdminReviewCoverage> {
  const [subjects, grades, tracks] = await Promise.all([
    fetchAllPaged<SubjectRow>((from, to) =>
      supabase.from("subjects").select("id,name,grade_id").order("id").range(from, to),
    ),
    fetchAllPaged<{ id: string; name: string }>((from, to) =>
      supabase.from("grades").select("id,name").order("id").range(from, to),
    ),
    fetchAllPaged<{ id: string; track_name: string }>((from, to) =>
      supabase.from("curriculum_tracks").select("id,track_name").order("id").range(from, to),
    ),
  ]);

  if (subjects.length === 0) return buildCoverage([]);

  const gradeName = new Map(grades.map((g) => [g.id, g.name]));
  const trackName = new Map(tracks.map((t) => [t.id, t.track_name]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  // Subject ↔ track availability (TCS-2 / shared subjects: one subject, many tracks).
  const subjectTracks = new Map<string, string[]>();
  const links = await fetchAllPaged<{ subject_id: string; curriculum_track_id: string }>(
    (from, to) =>
      supabase
        .from("subject_curriculum_tracks")
        .select("subject_id,curriculum_track_id")
        .order("subject_id")
        .range(from, to),
  );
  for (const link of links) {
    const list = subjectTracks.get(link.subject_id) ?? [];
    list.push(link.curriculum_track_id);
    subjectTracks.set(link.subject_id, list);
  }

  const lessons: LessonRow[] = [];
  for (const ids of chunk(
    subjects.map((s) => s.id),
    10,
  )) {
    const rows = await fetchAllPaged<LessonRow>((from, to) =>
      supabase
        .from("lessons")
        .select("id,title,subject_id,unit_id,sort_order,delivery_mode")
        .in("subject_id", ids)
        .order("subject_id")
        .order("sort_order")
        .order("title")
        .range(from, to),
    );
    lessons.push(...rows);
  }
  if (lessons.length === 0) return buildCoverage([]);

  const lessonIds = lessons.map((l) => l.id);

  type SummaryRow = {
    lesson_id: string;
    summary: string | null;
    key_points: unknown;
    study_tip: string | null;
  };
  const summaries: SummaryRow[] = [];
  for (const ids of chunk(lessonIds, ID_CHUNK)) {
    const rows = await fetchAllPaged<SummaryRow>((from, to) =>
      supabase
        .from("lesson_summaries")
        .select("lesson_id,summary,key_points,study_tip")
        .in("lesson_id", ids)
        .order("lesson_id")
        .range(from, to),
    );
    summaries.push(...rows);
  }
  const summaryByLesson = new Map(summaries.map((s) => [s.lesson_id, s]));

  const unitIds = Array.from(
    new Set(lessons.map((l) => l.unit_id).filter((v): v is string => !!v)),
  );
  const unitTitle = new Map<string, string>();
  for (const ids of chunk(unitIds, ID_CHUNK)) {
    const rows = await fetchAllPaged<{ id: string; title: string }>((from, to) =>
      supabase.from("units").select("id,title").in("id", ids).order("id").range(from, to),
    );
    for (const u of rows) unitTitle.set(u.id, u.title);
  }

  const rows: AdminReviewLessonRow[] = lessons.map((lesson) => {
    const subject = subjectById.get(lesson.subject_id);
    const summaryRow = summaryByLesson.get(lesson.id);
    const ready = !!summaryRow && hasUsableSummary(summaryRow.summary);
    const trackIds = subjectTracks.get(lesson.subject_id) ?? [];
    return {
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      subjectId: lesson.subject_id,
      subjectName: subject?.name ?? "—",
      gradeId: subject?.grade_id ?? null,
      gradeName: subject?.grade_id ? (gradeName.get(subject.grade_id) ?? null) : null,
      trackIds,
      trackNames: trackIds.map((id) => trackName.get(id) ?? "—"),
      unitId: lesson.unit_id,
      unitTitle: lesson.unit_id ? (unitTitle.get(lesson.unit_id) ?? null) : null,
      deliveryMode: lesson.delivery_mode,
      hasSummary: ready,
      readiness: ready ? "READY" : "NOT_READY",
      summary: (summaryRow?.summary ?? "").trim(),
      keyPoints: normalizeKeyPoints(summaryRow?.key_points),
      studyTip: summaryRow?.study_tip ?? null,
    };
  });

  return buildCoverage(rows);
}
