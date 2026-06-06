import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/grades/$gradeId/subjects")({
  component: SubjectsPage,
});

type Subject = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  curriculum_track_id: string | null;
};

function SubjectsPage() {
  const { gradeId } = Route.useParams();
  const { profile } = useAuth();
  const myTrack = profile?.curriculum_track_id ?? null;

  const { data: grade } = useQuery({
    queryKey: ["grade", gradeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("grades")
        .select("id,name")
        .eq("id", gradeId)
        .maybeSingle();
      return data;
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["subjects", gradeId, myTrack],
    queryFn: async (): Promise<Subject[]> => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id,name,icon,color,sort_order,curriculum_track_id")
        .eq("grade_id", gradeId)
        .order("sort_order");
      if (error) throw error;
      const rows = (data ?? []) as Subject[];
      return rows.filter(
        (s) => s.curriculum_track_id === null || s.curriculum_track_id === myTrack,
      );
    },
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">
          مواد {grade?.name ?? "الصف"}
        </h1>
        <Link to="/grades" className="text-sm text-muted-foreground hover:text-primary">
          ← كل الصفوف
        </Link>
      </div>

      {isLoading && <StateMessage variant="loading">جارٍ تحميل المواد…</StateMessage>}
      {error && <StateMessage variant="error">تعذّر تحميل المواد.</StateMessage>}
      {!isLoading && !error && (!data || data.length === 0) && (
        <StateMessage>لم تُضاف مواد لهذا الصف بعد.</StateMessage>
      )}

      {data && data.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((s) => (
            <li key={s.id}>
              <Link
                to="/subjects/$subjectId/lessons"
                params={{ subjectId: s.id }}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: s.color ?? "hsl(var(--primary))" }}
                    aria-hidden
                  >
                    📚
                  </span>
                  <div className="font-bold text-card-foreground">{s.name}</div>
                </div>
                <ChevronLeft className="h-5 w-5 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
