/**
 * QUICK_REVIEW_ADMIN_READINESS_15A_A
 *
 * Admin-side readiness view over the SAME source of truth as the student
 * Quick Review (15A): lessons + lesson_summaries + subjects + units +
 * subject_curriculum_tracks. The facts RPC is security-invoker and full-admin-only.
 *
 * Readiness rule (identical to the student contract):
 *   READY  = the lesson has a usable summary (`hasUsableSummary`)
 *   NOT_READY = no summary row, or an empty/whitespace summary
 * PDF lessons follow the exact same rule: a PDF is never read and a summary
 * is never generated automatically.
 *
 * A5: the database returns all lightweight facts in one JSON aggregate, without
 * the PostgREST row cap or summary bodies. Preview is a separate, per-lesson read.
 */

import { supabase } from "@/integrations/supabase/client";
import { normalizeKeyPoints } from "./review-types";

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
        ({
          id: entry.id,
          name: entry.name,
          total: 0,
          ready: 0,
          notReady: 0,
          coverage: 0,
        } as CoverageBucket);
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

/** One authorized database aggregation; summary bodies are fetched only on preview. */
export async function fetchAdminReviewCoverage(): Promise<AdminReviewCoverage> {
  const client = supabase as unknown as {
    rpc(
      name: "admin_review_coverage_facts",
    ): Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await client.rpc("admin_review_coverage_facts");
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error("تعذر تحميل إحصاءات المراجعة مكتملة.");
  const rows = data.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.lessonId !== "string" ||
      typeof item.hasSummary !== "boolean" ||
      !Array.isArray(item.trackIds) ||
      !Array.isArray(item.trackNames)
    ) {
      throw new Error("بيانات إحصاءات المراجعة غير صالحة.");
    }
    return {
      ...item,
      readiness: item.hasSummary ? "READY" : "NOT_READY",
      summary: "",
      keyPoints: [],
      studyTip: null,
    } as AdminReviewLessonRow;
  });
  return buildCoverage(rows);
}

export async function fetchReviewSummaryPreview(lessonId: string) {
  const { data, error } = await supabase
    .from("lesson_summaries")
    .select("summary,key_points,study_tip")
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (error) throw error;
  return {
    summary: data?.summary ?? "",
    keyPoints: normalizeKeyPoints(data?.key_points),
    studyTip: data?.study_tip ?? null,
  };
}
