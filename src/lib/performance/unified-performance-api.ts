import { supabase } from "@/integrations/supabase/client";

/**
 * TAMKEEN_UNIFIED_PERFORMANCE_DUAL_SURFACE_15C
 *
 * Read-only client for the unified performance read model. Every metric is
 * defined once in SQL (14F score semantics + 15B mistake semantics); this
 * module NEVER computes a metric, never sends a user id, and never reads
 * exam_session_* / question_revisions / question_targets / question_options
 * directly.
 */

const rpc = (name: string, args?: Record<string, unknown>) =>
  (
    supabase.rpc as unknown as (
      n: string,
      a?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>
  )(name, args);

/** True when the RPC itself is missing (pending migration not applied yet). */
export function isRpcMissing(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "PGRST202" || /could not find the function/i.test(e.message ?? "");
}

export class PerformanceUnavailableError extends Error {
  constructor() {
    super("unified_performance_rpc_unavailable");
    this.name = "PerformanceUnavailableError";
  }
}

export type AttemptType =
  | "ALL"
  | "ORDINARY"
  | "MINISTERIAL"
  | "MINISTERIAL_TRAINING"
  | "MINISTERIAL_STRICT";

export const ATTEMPT_TYPE_LABEL: Record<AttemptType, string> = {
  ALL: "كل المحاولات",
  ORDINARY: "اختبارات عادية",
  MINISTERIAL: "نماذج وزارية",
  MINISTERIAL_TRAINING: "وزاري — تدريب",
  MINISTERIAL_STRICT: "وزاري — محاكاة",
};

export type StudentSummary = {
  attempts_count: number;
  graded_attempts_count: number;
  pending_manual_count: number;
  avg_percentage: number | null;
  best_percentage: number | null;
  latest_percentage: number | null;
  improvement_percentage_points: number | null;
  avg_elapsed_seconds: number | null;
};

export type StudentProgress = {
  total_lessons: number;
  completed_lessons: number;
  completion_percentage: number | null;
};

export type AttemptTypeRow = {
  attempt_type: string;
  attempts: number;
  avg_percentage: number | null;
  best_percentage: number | null;
};

export type StudentSubjectRow = {
  subject_id: string;
  subject_name: string | null;
  attempts: number;
  avg_percentage: number | null;
  best_percentage: number | null;
  lesson_completion_percentage: number | null;
  total_lessons: number;
  completed_lessons: number;
  evaluated_questions: number;
  accuracy: number | null;
  wrong_rate: number | null;
  blank_rate: number | null;
};

export type StudentLessonRow = {
  lesson_id: string;
  lesson_title: string | null;
  subject_id: string | null;
  asked: number;
  auto_graded: number;
  correct: number;
  wrong: number;
  blank: number;
  manual_pending: number;
  accuracy: number | null;
  completion_state: "COMPLETED" | "NOT_COMPLETED";
};

export type HighlightLesson = {
  lesson_id: string;
  lesson_title: string | null;
  asked: number;
  accuracy: number | null;
};

export type HighlightSubject = {
  subject_id: string;
  subject_name: string | null;
  accuracy: number | null;
};

export type MistakePatterns = {
  unique_mistakes: number;
  repeated_mistakes: number;
  blank_questions: number;
  mastered_later: number;
  wrong_rate: number | null;
  blank_rate: number | null;
  unlinked_questions: number;
};

export type StudentUnifiedPerformance = {
  attempt_type: AttemptType;
  summary: StudentSummary;
  progress: StudentProgress;
  assessment_breakdown: AttemptTypeRow[];
  by_subject: StudentSubjectRow[];
  by_lesson: StudentLessonRow[];
  strengths: { lessons: HighlightLesson[]; subjects: HighlightSubject[] };
  weaknesses: { lessons: HighlightLesson[]; subjects: HighlightSubject[] };
  mistake_patterns: MistakePatterns;
};

/** Single network call for the whole /performance page (weak-network first). */
export async function fetchStudentUnifiedPerformance(
  attemptType: AttemptType = "ALL",
): Promise<StudentUnifiedPerformance> {
  const { data, error } = await rpc("get_student_unified_performance", {
    _attempt_type: attemptType,
    _limit: 50,
  });
  if (error) {
    if (isRpcMissing(error)) throw new PerformanceUnavailableError();
    throw new Error(error.message);
  }
  return data as StudentUnifiedPerformance;
}

// ---------------------------------------------------------------- admin ----

export type AdminGroupRow = {
  attempt_type?: string;
  grade_id?: string | null;
  grade_name?: string | null;
  track_id?: string | null;
  track_name?: string | null;
  attempts?: number;
  students_count: number;
  avg_percentage: number | null;
};

export type AdminSubjectRow = {
  subject_id: string;
  subject_name: string | null;
  students_count: number;
  attempts: number;
  avg_percentage: number | null;
  completion_percentage: number | null;
  wrong_rate: number | null;
  blank_rate: number | null;
};

export type AdminLessonRow = {
  lesson_id: string;
  lesson_title: string | null;
  subject_id: string | null;
  students_count: number;
  evaluated_questions: number;
  accuracy: number | null;
  wrong_rate: number | null;
  blank_rate: number | null;
};

export type AdminUnifiedPerformance = {
  attempt_type: AttemptType;
  privacy_min_group_size: number;
  summary: {
    attempts_count: number;
    graded_attempts_count: number;
    pending_manual_count: number;
    avg_percentage: number | null;
    best_percentage: number | null;
    avg_elapsed_seconds: number | null;
    completion_percentage: number | null;
    wrong_rate: number | null;
    blank_rate: number | null;
    mastered_later_rate: number | null;
    repeated_mistake_rate: number | null;
  };
  by_attempt_type: AdminGroupRow[];
  by_grade: AdminGroupRow[];
  by_track: AdminGroupRow[];
  by_subject: AdminSubjectRow[];
  by_lesson: AdminLessonRow[];
  weakest_subjects: {
    subject_id: string;
    subject_name: string | null;
    avg_percentage: number | null;
    wrong_rate: number | null;
  }[];
  weakest_lessons: {
    lesson_id: string;
    lesson_title: string | null;
    accuracy: number | null;
    students_count: number;
  }[];
  highest_blank_rate: {
    lesson_id: string;
    lesson_title: string | null;
    blank_rate: number | null;
    students_count: number;
  }[];
  highest_repeated_mistake_rate: {
    lesson_id: string;
    lesson_title: string | null;
    repeated_mistake_rate: number | null;
    students_count: number;
  }[];
  strongest_improvement_areas: {
    subject_id: string | null;
    subject_name: string | null;
    students_count: number;
    improvement_percentage_points: number | null;
  }[];
};

export type AdminPerformanceArgs = {
  gradeId?: string | null;
  trackId?: string | null;
  subjectId?: string | null;
  lessonId?: string | null;
  attemptType?: AttemptType;
  from?: string | null;
  to?: string | null;
  limit?: number;
};

export async function fetchAdminUnifiedPerformance(
  args: AdminPerformanceArgs = {},
): Promise<AdminUnifiedPerformance> {
  const { data, error } = await rpc("get_admin_unified_performance", {
    _grade_id: args.gradeId ?? null,
    _track_id: args.trackId ?? null,
    _subject_id: args.subjectId ?? null,
    _lesson_id: args.lessonId ?? null,
    _attempt_type: args.attemptType ?? "ALL",
    _from: args.from ?? null,
    _to: args.to ?? null,
    _limit: args.limit ?? 20,
  });
  if (error) {
    if (isRpcMissing(error)) throw new PerformanceUnavailableError();
    throw new Error(error.message);
  }
  return data as AdminUnifiedPerformance;
}

// ------------------------------------------------------------ formatting ---

export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toFixed(1)}%`;
}

export function formatElapsed(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m <= 0) return `${s} ث`;
  return `${m} د ${s} ث`;
}

export function attemptTypeLabel(value: string): string {
  return ATTEMPT_TYPE_LABEL[value as AttemptType] ?? value;
}
