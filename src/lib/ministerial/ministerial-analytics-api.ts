import { supabase } from "@/integrations/supabase/client";

/**
 * PAST_MINISTERIAL_EXAMS_PERFORMANCE_ANALYTICS_14F
 * REPEATED_MINISTERIAL_QUESTIONS_14G
 *
 * Read-only client for the analytics RPCs. Scope (own data only,
 * subject + curriculum_track isolation) is enforced server-side by
 * SECURITY DEFINER functions. Nothing here may request correct answers,
 * solutions, question_revisions or ministerial_exam_questions directly.
 */

// The analytics RPCs live in a pending migration, so they are not part of the
// generated Database types yet.
const rpc = (name: string, args?: Record<string, unknown>) =>
  (supabase.rpc as unknown as (n: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>)(
    name,
    args,
  );

/** True when the RPC itself is missing (migration not applied yet). */
export function isRpcMissing(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "PGRST202" || /could not find the function/i.test(e.message ?? "");
}

export class AnalyticsUnavailableError extends Error {
  constructor() {
    super("analytics_rpc_unavailable");
    this.name = "AnalyticsUnavailableError";
  }
}

export type PerformanceSummary = {
  attempts_count: number;
  graded_attempts_count: number;
  pending_manual_count: number;
  avg_percentage: number | null;
  best_percentage: number | null;
  latest_percentage: number | null;
  improvement_percentage_points: number | null;
  avg_elapsed_seconds: number | null;
};

export type PerformanceByMode = {
  attempt_mode: "training" | "strict";
  attempts: number;
  avg_percentage: number | null;
  best_percentage: number | null;
};

export type PerformanceBySubject = {
  subject_id: string;
  subject_name: string;
  attempts: number;
  avg_percentage: number | null;
  best_percentage: number | null;
};

export type PerformanceByLesson = {
  lesson_id: string;
  lesson_title: string;
  asked: number;
  auto_graded: number;
  correct: number;
  wrong: number;
  blank: number;
  manual_pending: number;
  accuracy: number | null;
};

export type PerformancePatterns = {
  total_questions: number;
  blank_rate: number | null;
  wrong_rate: number | null;
  manual_pending_questions: number;
  unlinked_questions_count: number;
};

export type MinisterialPerformanceOverview = {
  summary: PerformanceSummary;
  by_mode: PerformanceByMode[];
  by_subject: PerformanceBySubject[];
  by_lesson: PerformanceByLesson[];
  weak_lessons: Array<{ lesson_id: string; lesson_title: string; asked: number; accuracy: number }>;
  patterns: PerformancePatterns;
};

export async function fetchMinisterialPerformance(): Promise<MinisterialPerformanceOverview> {
  const { data, error } = await rpc("get_ministerial_performance_overview");
  if (error) {
    if (isRpcMissing(error)) throw new AnalyticsUnavailableError();
    throw new Error(error.message);
  }
  return data as MinisterialPerformanceOverview;
}

export type RepeatedSubjectRow = {
  subject_id: string;
  subject_name: string;
  subject_code: string | null;
  repeated_questions_count: number;
  max_occurrences: number;
};

export type RepeatedOccurrence = {
  model_id: string;
  model_code: string;
  model_label: string | null;
  academic_year: number;
  round_code: string;
  published_revision_id: string;
};

export type RepeatedQuestionRow = {
  question_id: string;
  display_revision_id: string;
  question_text: string;
  stimulus_text: string | null;
  occurrence_count: number;
  years: number[] | null;
  occurrences: RepeatedOccurrence[] | null;
  latest_model_id: string | null;
  lesson_id: string | null;
  lesson_title: string | null;
};

export async function fetchRepeatedSubjects(): Promise<RepeatedSubjectRow[]> {
  const { data, error } = await rpc("list_repeated_ministerial_subjects");
  if (error) {
    if (isRpcMissing(error)) throw new AnalyticsUnavailableError();
    throw new Error(error.message);
  }
  return (data ?? []) as RepeatedSubjectRow[];
}

export async function fetchRepeatedQuestions(input: {
  subjectId: string;
  minOccurrences?: number;
  yearFrom?: number | null;
}): Promise<RepeatedQuestionRow[]> {
  const { data, error } = await rpc("list_repeated_ministerial_questions", {
    _subject_id: input.subjectId,
    _min_occurrences: input.minOccurrences ?? 2,
    _year_from: input.yearFrom ?? null,
  });
  if (error) {
    if (isRpcMissing(error)) throw new AnalyticsUnavailableError();
    throw new Error(error.message);
  }
  return (data ?? []) as RepeatedQuestionRow[];
}

export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value)}%`;
}

export function formatElapsed(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} دقيقة`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} ساعة` : `${h} س و${rest} د`;
}
