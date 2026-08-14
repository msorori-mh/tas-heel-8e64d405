import { supabase } from "@/integrations/supabase/client";

/**
 * PAST_MINISTERIAL_EXAMS_STUDENT_EXPERIENCE_14D
 * Student read paths for ministerial exam models.
 *
 * Track isolation, subject access and answer secrecy are enforced server-side
 * (RLS + SECURITY DEFINER RPCs). Nothing here may fetch correct answers,
 * solutions, question_revisions or ministerial_exam_questions directly.
 */

export type MinisterialSubjectCard = {
  subject_id: string;
  subject_name: string;
  subject_code: string | null;
  models_count: number;
  latest_year: number | null;
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
};

export type MinisterialModelOverview = MinisterialModelRow & {
  subject_id: string;
  subject_name: string;
  track_name: string;
};

export type MinisterialSessionQuestion = {
  question_id: string;
  question_order: number;
  question_text: string;
  stimulus_text: string | null;
  options: Array<{ option_code: string; body: string }> | null;
  max_score: number | null;
};

export type MinisterialSessionState = {
  session: {
    id: string;
    status: "in_progress" | "submitted" | "expired";
    mode: string;
    started_at: string | null;
    expires_at: string | null;
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
  answers: Array<{ question_id: string; selected_index: number | null; answered_at: string | null }>;
  /** Always false in 14D — safe reveal path is a 14E deliverable. */
  reveal: boolean;
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
export async function startMinisterialSession(modelId: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_ministerial_exam_session", {
    _model_id: modelId,
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

export async function answerMinisterialQuestion(input: {
  sessionId: string;
  questionId: string;
  selectedIndex: number | null;
}): Promise<void> {
  const { error } = await supabase.rpc("answer_exam_question", {
    _session_id: input.sessionId,
    _question_id: input.questionId,
    _selected_index: input.selectedIndex,
  });
  if (error) throw error;
}

export function mapMinisterialError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? "");
  if (msg.includes("MINISTERIAL_MODEL_NOT_PUBLISHED")) return "هذا النموذج غير منشور.";
  if (msg.includes("MINISTERIAL_MODEL_HAS_NO_QUESTIONS")) return "هذا النموذج لا يحتوي على أسئلة بعد.";
  if (msg.includes("ministerial_model_not_available") || msg.includes("curriculum_or_grade_mismatch")) {
    return "هذا النموذج غير متاح لمسارك الدراسي.";
  }
  if (msg.includes("template_inactive")) return "هذا النموذج غير مفعّل حالياً.";
  if (msg.includes("model_not_found") || msg.includes("session_not_found")) return "العنصر المطلوب غير موجود.";
  if (msg.includes("forbidden") || msg.includes("42501")) return "ليس لديك صلاحية الوصول.";
  return "تعذّر إتمام العملية. حاول مرة أخرى.";
}
