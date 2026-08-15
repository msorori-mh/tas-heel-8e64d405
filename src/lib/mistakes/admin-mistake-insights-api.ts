import { supabase } from "@/integrations/supabase/client";
import { isRpcMissing, MistakesUnavailableError } from "@/lib/mistakes/my-mistakes-api";

/**
 * TAMKEEN_MY_MISTAKES_ADMIN_INSIGHTS_15B_A
 *
 * Read-only admin client over the SAME derived source of truth as the student
 * notebook. Aggregate output only: no student identities, no per-student
 * notebook, and never an answer key / is_correct flag / hidden solution.
 */

const rpc = (name: string, args?: Record<string, unknown>) =>
  (
    supabase.rpc as unknown as (
      n: string,
      a?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>
  )(name, args);

export type AdminMistakeScope = "ALL" | "ORDINARY" | "MINISTERIAL";

export type AdminMistakeSummary = {
  total_mistake_occurrences: number;
  unique_questions_with_mistakes: number;
  repeated_mistakes: number;
  total_evaluated_occurrences: number;
  blank_rate: number;
  mastered_later_rate: number;
};

export type AdminSubjectRow = {
  subject_id: string | null;
  subject_name: string | null;
  mistake_occurrences: number;
  blank_occurrences: number;
  evaluated_occurrences: number;
  unique_questions: number;
};

export type AdminLessonRow = {
  lesson_id: string | null;
  lesson_title: string | null;
  subject_id: string | null;
  subject_name: string | null;
  mistake_occurrences: number;
  blank_occurrences: number;
  evaluated_occurrences: number;
};

export type AdminFacetRow = {
  grade_id?: string | null;
  grade_name?: string | null;
  track_id?: string | null;
  track_name?: string | null;
  mistake_occurrences: number;
  evaluated_occurrences: number;
};

export type AdminTopQuestion = {
  question_id: string;
  question_code: string | null;
  question_preview: string | null;
  subject_id: string | null;
  subject_name: string | null;
  lesson_id: string | null;
  lesson_title: string | null;
  attempt_count: number;
  wrong_count: number;
  wrong_percentage: number;
  blank_count: number;
  blank_percentage: number;
  mistake_occurrences: number;
  mastered_later_count: number;
  mastered_later_percentage: number;
};

export type AdminMistakeInsights = {
  summary: AdminMistakeSummary;
  by_subject: AdminSubjectRow[];
  by_lesson: AdminLessonRow[];
  by_grade: AdminFacetRow[];
  by_track: AdminFacetRow[];
  top_questions: AdminTopQuestion[];
};

export type AdminMistakeFilters = {
  gradeId?: string | null;
  trackId?: string | null;
  subjectId?: string | null;
  lessonId?: string | null;
  scope?: AdminMistakeScope;
  from?: string | null;
  to?: string | null;
  limit?: number;
};

const EMPTY_SUMMARY: AdminMistakeSummary = {
  total_mistake_occurrences: 0,
  unique_questions_with_mistakes: 0,
  repeated_mistakes: 0,
  total_evaluated_occurrences: 0,
  blank_rate: 0,
  mastered_later_rate: 0,
};

export async function getAdminMistakeInsights(
  filters: AdminMistakeFilters = {},
): Promise<AdminMistakeInsights> {
  const { data, error } = await rpc("get_admin_mistake_insights", {
    _grade_id: filters.gradeId ?? null,
    _track_id: filters.trackId ?? null,
    _subject_id: filters.subjectId ?? null,
    _lesson_id: filters.lessonId ?? null,
    _attempt_scope: filters.scope ?? "ALL",
    _from: filters.from ?? null,
    _to: filters.to ?? null,
    _limit: filters.limit ?? 20,
  });
  if (error) {
    if (isRpcMissing(error)) throw new MistakesUnavailableError();
    throw new Error(error.message);
  }
  const payload = (data ?? {}) as Partial<AdminMistakeInsights>;
  return {
    summary: { ...EMPTY_SUMMARY, ...(payload.summary ?? {}) },
    by_subject: payload.by_subject ?? [],
    by_lesson: payload.by_lesson ?? [],
    by_grade: payload.by_grade ?? [],
    by_track: payload.by_track ?? [],
    top_questions: payload.top_questions ?? [],
  };
}

export const ADMIN_MISTAKE_SCOPE_LABEL: Record<AdminMistakeScope, string> = {
  ALL: "كل المحاولات",
  ORDINARY: "اختبارات عادية",
  MINISTERIAL: "نماذج وزارية",
};

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(1)}%`;
}
