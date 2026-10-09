import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
export type ExamMode = "training" | "strict" | "ministry";
type ExamStatus = "submitted" | "expired";

export type HistoryRow = {
  id: string;
  template_id: string;
  mode: ExamMode;
  status: ExamStatus | "in_progress";
  started_at: string;
  submitted_at: string | null;
  total_questions: number;
  correct_answers: number | null;
  ministerial_model_id: string | null;
  result_json: unknown;
  score: number | null;
  total_points: number | null;
  exam_templates: { title: string | null } | null;
};

export function useExamHistory() {
  const { user } = useAuth();
  const query = useQuery({
    enabled: !!user?.id,
    queryKey: ["exam-history", user?.id],
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await supabase
        .from("exam_sessions")
        .select(
          "id, template_id, mode, status, started_at, submitted_at, total_questions, correct_answers, score, total_points, ministerial_model_id, result_json, exam_templates(title)",
        )
        .eq("user_id", user!.id)
        .in("status", ["submitted", "expired"])
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as HistoryRow[];
    },
  });

  return query;
}
