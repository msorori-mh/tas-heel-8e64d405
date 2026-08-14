import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StateMessage } from "@/components/student/StudentNav";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import {
  fetchMinisterialModels,
  formatDuration,
  roundLabel,
} from "@/lib/ministerial/ministerial-student-api";
import { ChevronLeft, Clock, ListChecks } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ministerial-exams/$subjectId")({
  head: () => ({
    meta: [
      { title: "نماذج المادة الوزارية — تمكين" },
      {
        name: "description",
        content: "قائمة النماذج الوزارية المنشورة لهذه المادة حسب السنة والدور.",
      },
      { property: "og:title", content: "نماذج المادة الوزارية — تمكين" },
      { property: "og:description", content: "النماذج الوزارية المتاحة لمسارك الدراسي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SubjectMinisterialModels,
});

function SubjectMinisterialModels() {
  const { subjectId } = Route.useParams();

  const { data: subject } = useQuery({
    queryKey: ["ministerial-subject-name", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id,name")
        .eq("id", subjectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["ministerial-models", subjectId],
    queryFn: () => fetchMinisterialModels(subjectId),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-4 pb-6" dir="rtl">
      <Breadcrumbs
        items={[
          { label: "النماذج الوزارية", to: "/ministerial-exams" },
          { label: subject?.name ?? "المادة" },
        ]}
      />

      <h1 className="text-lg font-bold text-foreground sm:text-xl">
        {subject?.name ?? "المادة"} — النماذج الوزارية
      </h1>

      {isLoading && <StateMessage variant="loading">جارٍ تحميل النماذج…</StateMessage>}
      {error && <StateMessage variant="error">تعذّر تحميل النماذج.</StateMessage>}

      {!isLoading && !error && (data?.length ?? 0) === 0 && (
        <StateMessage>لا توجد نماذج وزارية منشورة لهذه المادة حالياً.</StateMessage>
      )}

      <ul className="space-y-3">
        {(data ?? []).map((m) => {
          const duration = formatDuration(m.duration_seconds);
          return (
            <li key={m.model_id}>
              <Link
                to="/ministerial-exams/models/$modelId"
                params={{ modelId: m.model_id }}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-foreground">
                    {m.academic_year} — {roundLabel(m.round_code)}
                    {m.model_label ? ` — ${m.model_label}` : ""}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <ListChecks className="h-3.5 w-3.5" aria-hidden />
                      {m.question_count} سؤال
                    </span>
                    {duration && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden />
                        {duration}
                      </span>
                    )}
                    {m.last_session_status === "submitted" && <span>محاولة سابقة مكتملة</span>}
                    {m.last_session_status === "in_progress" && <span>لديك محاولة جارية</span>}
                  </span>
                </span>
                <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
