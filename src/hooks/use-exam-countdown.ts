import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useConnectivity } from "@/hooks/use-connectivity";
import { supabase } from "@/integrations/supabase/client";
import { adenToday, pickUpcomingExam } from "@/lib/exams/exam-countdown";
export function useExamCountdown() {
  const { profile } = useAuth();
  const online = useConnectivity();
  const trackId = profile?.curriculum_track_id ?? null;
  const gradeId = profile?.grade_uuid ?? null;
  const [today, setToday] = useState(() => adenToday());
  useEffect(() => {
    const refresh = () => setToday(adenToday());
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const query = useQuery({
    queryKey: ["exam-countdown", trackId, gradeId],
    enabled: online && !!trackId,
    staleTime: 45 * 60 * 1000,
    refetchInterval: 45 * 60 * 1000,
    queryFn: async () => {
      const from = new Date(`${adenToday()}T00:00:00Z`);
      from.setUTCDate(from.getUTCDate() - 60);
      const { data, error } = await supabase
        .from("exam_schedule")
        .select(
          "id,curriculum_track_id,grade_id,semester,exam_kind,title,starts_on,ends_on,is_published",
        )
        .eq("curriculum_track_id", trackId!)
        .eq("is_published", true)
        .gte("starts_on", from.toISOString().slice(0, 10))
        .or(gradeId ? `grade_id.is.null,grade_id.eq.${gradeId}` : "grade_id.is.null")
        .order("starts_on")
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
  // No persistence of schedules: hide offline rather than expose a stale/unpublished date.
  return {
    today,
    exam:
      online && !query.error
        ? pickUpcomingExam(query.data ?? [], { trackId, gradeId, today })
        : null,
  };
}
