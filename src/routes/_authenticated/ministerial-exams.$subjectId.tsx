import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { StateMessage } from "@/components/student/StudentNav";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import {
  fetchMinisterialModels,
  fetchMinisterialSubjects,
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
      { property: "og:description", content: "نماذج صنعاء وعدن الوزارية المتاحة للتدريب." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SubjectMinisterialModels,
});

type TrackFilter = "all" | "sanaa" | "aden";

function SubjectMinisterialModels() {
  const { subjectId } = Route.useParams();
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("all");

  const { data: subject } = useQuery({
    queryKey: ["ministerial-subject-name", subjectId],
    queryFn: async () => {
      const subjects = await fetchMinisterialSubjects();
      return subjects.find((item) => item.subject_id === subjectId) ?? null;
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["ministerial-models", subjectId],
    queryFn: () => fetchMinisterialModels(subjectId),
    staleTime: 5 * 60 * 1000,
  });

  const filteredModels = (data ?? []).filter(
    (model) => trackFilter === "all" || model.track_code === trackFilter,
  );

  return (
    <div className="space-y-4 pb-6" dir="rtl">
      <Breadcrumbs
        items={[
          { label: "النماذج الوزارية", to: "/ministerial-exams" },
          { label: subject?.subject_name ?? "المادة" },
        ]}
      />

      <h1 className="text-lg font-bold text-foreground sm:text-xl">
        {subject?.subject_name ?? "المادة"} — النماذج الوزارية
      </h1>
      <p className="text-sm text-muted-foreground">
        جميع نماذج صنعاء وعدن متاحة لك؛ استخدم المرشح لعرض أحد المسارين أو كليهما.
      </p>

      <div className="flex flex-wrap gap-2" role="group" aria-label="تصفية النماذج حسب المسار">
        {(
          [
            ["all", "الكل"],
            ["sanaa", "صنعاء"],
            ["aden", "عدن"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTrackFilter(value)}
            aria-pressed={trackFilter === value}
            className={
              trackFilter === value
                ? "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                : "rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:border-primary/40"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && <StateMessage variant="loading">جارٍ تحميل النماذج…</StateMessage>}
      {error && <StateMessage variant="error">تعذّر تحميل النماذج.</StateMessage>}

      {!isLoading && !error && filteredModels.length === 0 && (
        <StateMessage>لا توجد نماذج وزارية منشورة ضمن الاختيار الحالي.</StateMessage>
      )}

      <ul className="space-y-3">
        {filteredModels.map((m) => {
          const duration = formatDuration(m.duration_seconds);
          return (
            <li key={m.model_id}>
              <Link
                to="/ministerial-exams/models/$modelId"
                params={{ modelId: m.model_id }}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                    <span>
                      {m.academic_year} — {roundLabel(m.round_code)}
                      {m.model_label ? ` — ${m.model_label}` : ""}
                    </span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                      {m.track_name}
                    </span>
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
