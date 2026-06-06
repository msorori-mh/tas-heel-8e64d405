import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/grades")({
  component: GradesPage,
});

type Grade = { id: string; name: string; category: string; sort_order: number };

function GradesPage() {
  const { profile } = useAuth();
  const myGradeId = profile?.grade_uuid ?? (profile?.grade_id as string | null) ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: ["grades"],
    queryFn: async (): Promise<Grade[]> => {
      const { data, error } = await supabase
        .from("grades")
        .select("id,name,category,sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Grade[];
    },
  });

  if (isLoading) return <StateMessage variant="loading">جارٍ تحميل الصفوف…</StateMessage>;
  if (error) return <StateMessage variant="error">تعذّر تحميل الصفوف. حاول مجدداً.</StateMessage>;
  if (!data || data.length === 0)
    return <StateMessage>لا توجد صفوف متاحة حالياً.</StateMessage>;

  const sorted = [...data].sort((a, b) => {
    if (myGradeId && a.id === myGradeId) return -1;
    if (myGradeId && b.id === myGradeId) return 1;
    return a.sort_order - b.sort_order;
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">اختر صفك</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {sorted.map((g) => {
          const mine = g.id === myGradeId;
          return (
            <li key={g.id}>
              <Link
                to="/grades/$gradeId/subjects"
                params={{ gradeId: g.id }}
                className={`flex items-center justify-between rounded-xl border bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover ${
                  mine ? "border-primary ring-2 ring-primary/30" : "border-border"
                }`}
              >
                <div>
                  <div className="font-bold text-card-foreground">{g.name}</div>
                  {mine && (
                    <div className="mt-1 text-xs text-primary">صفك الحالي</div>
                  )}
                </div>
                <ChevronLeft className="h-5 w-5 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
