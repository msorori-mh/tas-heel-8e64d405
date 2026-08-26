import { supabase } from "@/integrations/supabase/client";

/**
 * PAST_MINISTERIAL_EXAMS_STUDENT_EXPERIENCE_14D
 * Student read paths for ministerial exam models.
 *
 * Grade access, Sanaa/Aden model attribution and answer secrecy are enforced server-side
 * (RLS + SECURITY DEFINER RPCs). Nothing here may fetch correct answers,
 * solutions, question_revisions or ministerial_exam_questions directly.
 */

export type MinisterialSubjectCard = {
  subject_id: string;
  subject_name: string;
  subject_code: string | null;
  models_count: number;
  latest_year: number | null;
  sanaa_models_count: number;
  aden_models_count: number;
};

export type MinisterialModelRow = {
  model_id: string;
  model_code: string;
  model_label: string | null;
  academic_year: number;
  round_code: string;
  variant_code: string | null;
  question_count: number;
  duration_seconds: number | null;
  last_session_id: string | null;
  last_session_status: string | null;
  track_code: "sanaa" | "aden";
  track_name: string;
};

export type MinisterialModelOverview = MinisterialModelRow & {
  subject_id: string;
  subject_name: string;
  track_name: string;
};

export type MinisterialAttemptMode = "training" | "strict";

export type MinisterialSessionQuestion = {
  session_question_id: string;
  question_id: string;
  question_order: number;
  question_text: string;
  stimulus_text: string | null;
  options: Array<{ option_code: string; body: string }> | null;
  max_score: number | null;
};

export type MinisterialSessionAnswer = {
  question_id: string;
  session_question_id: string;
  selected_option_code: string | null;
  answered_at: string | null;
  revealed_at: string | null;
};

export type MinisterialSessionState = {
  session: {
    id: string;
    status: "in_progress" | "submitted" | "expired";
    mode: string;
    attempt_mode: MinisterialAttemptMode;
    grading_status: string | null;
    is_final: boolean;
    started_at: string | null;
    expires_at: string | null;
    server_now: string;
    total_questions: number | null;
  };
  model: {
    model_id: string;
    model_code: string;
    model_label: string | null;
    academic_year: number;
    round_code: string;
    subject_id: string;
    subject_name: string;
  } | null;
  questions: MinisterialSessionQuestion[];
  answers: MinisterialSessionAnswer[];
  /** Always false: the answer key is never part of an open session payload. */
  reveal: boolean;
};

export type MinisterialRevealResult = {
  /** Server verdict for a revealed training answer. */
  verdict: "correct" | "wrong" | "manual_review";
  correct_option_code: string | null;
  explanation: string | null;
  model_answer?: string | null;
  lesson_id?: string | null;
  lesson_title?: string | null;
};

export type MinisterialResultSummary = {
  session_id: string;
  attempt_mode: MinisterialAttemptMode | null;
  answered: number;
  correct_count: number | null;
  wrong_count: number | null;
  blank_count: number;
  manual_count: number;
  score: number | null;
  total_points: number;
  total_questions: number | null;
  percentage: number | null;
  elapsed_seconds: number;
  manual_review_required: boolean;
  is_final: boolean;
};

export type MinisterialResultQuestion = {
  session_question_id: string;
  question_order: number;
  question_text: string;
  stimulus_text: string | null;
  options: Array<{ option_code: string; body: string }> | null;
  max_score: number | null;
  selected_option_code: string | null;
  status: "correct" | "wrong" | "blank" | "manual_review";
  correct_option_code: string | null;
  explanation: string | null;
  lesson_id: string | null;
};

export type MinisterialSessionResult = {
  session: {
    id: string;
    status: string;
    attempt_mode: MinisterialAttemptMode | null;
    grading_status: string | null;
    is_final: boolean;
    started_at: string | null;
    completed_at: string | null;
  };
  model: {
    model_id: string;
    model_code: string;
    model_label: string | null;
    academic_year: number;
    round_code: string;
    subject_id: string;
    subject_name: string;
  } | null;
  summary: MinisterialResultSummary;
  questions: MinisterialResultQuestion[];
};

export type MinisterialAttemptRow = {
  session_id: string;
  model_id: string;
  model_code: string;
  model_label: string | null;
  academic_year: number;
  round_code: string;
  subject_id: string;
  subject_name: string;
  attempt_mode: MinisterialAttemptMode | null;
  status: string;
  grading_status: string | null;
  is_final: boolean;
  score: number | null;
  total_points: number | null;
  percentage: number | null;
  elapsed_seconds: number | null;
  started_at: string | null;
  completed_at: string | null;
};

export const ROUND_LABELS: Record<string, string> = {
  r1: "الدور الأول",
  r2: "الدور الثاني",
  r3: "الدور الثالث",
  makeup: "الدور التكميلي",
};

export function roundLabel(code: string | null | undefined): string {
  if (!code) return "";
  return ROUND_LABELS[code] ?? code;
}

export function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} دقيقة`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} ساعة` : `${h} ساعة و${m} دقيقة`;
}

export function modelTitle(model: {
  academic_year: number;
  round_code: string;
  model_label?: string | null;
}): string {
  const parts = [String(model.academic_year), roundLabel(model.round_code)];
  if (model.model_label) parts.push(model.model_label);
  return parts.filter(Boolean).join(" — ");
}

export async function fetchMinisterialSubjects(): Promise<MinisterialSubjectCard[]> {
  const { data, error } = await supabase.rpc("list_ministerial_subjects");
  if (error) throw error;
  return (data ?? []) as MinisterialSubjectCard[];
}

export async function fetchMinisterialModels(subjectId: string): Promise<MinisterialModelRow[]> {
  const { data, error } = await supabase.rpc("list_ministerial_models", { _subject_id: subjectId });
  if (error) throw error;
  return (data ?? []) as MinisterialModelRow[];
}

export async function fetchMinisterialModelOverview(
  modelId: string,
): Promise<MinisterialModelOverview> {
  const { data, error } = await supabase.rpc("get_ministerial_model_overview", {
    _model_id: modelId,
  });
  if (error) throw error;
  return data as unknown as MinisterialModelOverview;
}

/** RPC-ONLY session creation. Never use the generic ministry template creator. */
export async function startMinisterialSession(
  modelId: string,
  mode: MinisterialAttemptMode = "training",
): Promise<string> {
  const { data, error } = await supabase.rpc("create_ministerial_exam_session", {
    _model_id: modelId,
    _mode: mode,
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function fetchMinisterialSessionState(
  sessionId: string,
): Promise<MinisterialSessionState> {
  const { data, error } = await supabase.rpc("get_ministerial_session_state", {
    _session_id: sessionId,
  });
  if (error) throw error;
  return data as unknown as MinisterialSessionState;
}

/** Answers are stored by pinned option_code, never by display position. */
export async function answerMinisterialQuestion(input: {
  sessionId: string;
  sessionQuestionId: string;
  optionCode: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc("answer_ministerial_exam_question", {
    _session_id: input.sessionId,
    _session_question_id: input.sessionQuestionId,
    _option_code: input.optionCode as string,
  });
  if (error) throw error;
}

/** Training only: server decides, and the answer is locked afterwards. */
export async function revealMinisterialAnswer(input: {
  sessionId: string;
  sessionQuestionId: string;
}): Promise<MinisterialRevealResult> {
  const { data, error } = await supabase.rpc("reveal_ministerial_training_answer", {
    _session_id: input.sessionId,
    _session_question_id: input.sessionQuestionId,
  });
  if (error) throw error;
  return data as unknown as MinisterialRevealResult;
}

/** Idempotent: repeated calls return the stored result. */
export async function submitMinisterialSession(
  sessionId: string,
): Promise<MinisterialResultSummary> {
  const { data, error } = await supabase.rpc("submit_ministerial_exam_session", {
    _session_id: sessionId,
  });
  if (error) throw error;
  return data as unknown as MinisterialResultSummary;
}

export async function fetchMinisterialSessionResult(
  sessionId: string,
): Promise<MinisterialSessionResult> {
  const { data, error } = await supabase.rpc("get_ministerial_session_result", {
    _session_id: sessionId,
  });
  if (error) throw error;
  return data as unknown as MinisterialSessionResult;
}

export async function fetchMinisterialAttempts(modelId?: string): Promise<MinisterialAttemptRow[]> {
  const { data, error } = await supabase.rpc("list_ministerial_attempts", {
    _model_id: modelId ?? undefined,
  });
  if (error) throw error;
  return (data ?? []) as MinisterialAttemptRow[];
}

export function formatElapsed(seconds: number | null | undefined): string {
  const safe = Math.max(0, Math.floor(seconds ?? 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function mapMinisterialError(err: unknown): string {
  const msg =
    err instanceof Error ? err.message : String((err as { message?: string })?.message ?? "");
  if (msg.includes("MINISTERIAL_MODEL_NOT_PUBLISHED")) return "هذا النموذج غير منشور.";
  if (msg.includes("MINISTERIAL_MODEL_HAS_NO_QUESTIONS"))
    return "هذا النموذج لا يحتوي على أسئلة بعد.";
  if (
    msg.includes("ministerial_model_not_available") ||
    msg.includes("curriculum_or_grade_mismatch")
  ) {
    return "هذا النموذج غير متاح لصفك الدراسي أو لم يعد منشوراً.";
  }
  if (msg.includes("ANSWER_ALREADY_REVEALED_LOCKED")) return "تم كشف الإجابة، ولا يمكن تغييرها.";
  if (msg.includes("ANSWER_REQUIRED_BEFORE_REVEAL")) return "اختر إجابة أولاً قبل كشف الحل.";
  if (msg.includes("REVEAL_NOT_ALLOWED_IN_STRICT")) return "كشف الحل غير متاح في وضع المحاكاة.";
  if (msg.includes("SESSION_NOT_COMPLETED")) return "لم تُسلَّم هذه المحاولة بعد.";
  if (msg.includes("SESSION_EXPIRED") || msg.includes("session_not_in_progress")) {
    return "انتهت هذه الجلسة ولا يمكن تعديل الإجابات.";
  }
  if (msg.includes("INVALID_OPTION_CODE")) return "خيار غير صالح.";
  if (msg.includes("template_inactive")) return "هذا النموذج غير مفعّل حالياً.";
  if (msg.includes("model_not_found") || msg.includes("session_not_found"))
    return "العنصر المطلوب غير موجود.";
  if (msg.includes("forbidden") || msg.includes("42501")) return "ليس لديك صلاحية الوصول.";
  return "تعذّر إتمام العملية. حاول مرة أخرى.";
}
