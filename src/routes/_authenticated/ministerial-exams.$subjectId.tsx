import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { StateMessage } from "@/components/student/StudentNav";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import {
  fetchMinisterialModels,
  fetchMinisterialSubjects,
  formatDuration,
  roundLabel,
} from "@/lib/ministerial/ministerial-student-api";
import { ChevronLeft, Clock, ListChecks } from "lucide-react";

const searchSchema = z.object({
  track: fallback(z.enum(["sanaa", "aden"]).optional(), undefined),
});

export const Route = createFileRoute("/_authenticated/ministerial-exams/$subjectId")({
  validateSearch: zodValidator(searchSchema),
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

type MinisterialTrack = "sanaa" | "aden";

function SubjectMinisterialModels() {
  const { subjectId } = Route.useParams();
  const { track } = Route.useSearch();
  const selectedTrack: MinisterialTrack | null = track ?? null;

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

  const selectedTrackLabel = selectedTrack === "sanaa" ? "منهج صنعاء" : "منهج عدن";
  const filteredModels = selectedTrack
    ? (data ?? [])
        .filter((model) => model.track_code === selectedTrack)
        .sort((left, right) => right.academic_year - left.academic_year)
    : [];
  const modelsByYear = filteredModels.reduce<Map<number, typeof filteredModels>>(
    (groups, model) => {
      const yearModels = groups.get(model.academic_year) ?? [];
      yearModels.push(model);
      groups.set(model.academic_year, yearModels);
      return groups;
    },
    new Map(),
  );
  const yearGroups = [...modelsByYear.entries()].sort(([left], [right]) => right - left);

  return (
    <div className="space-y-4 pb-6" dir="rtl">
      <Breadcrumbs
        items={[
          {
            label: "النماذج الوزارية",
            to: "/ministerial-exams",
            search: selectedTrack ? { track: selectedTrack } : {},
          },
          { label: subject?.subject_name ?? "المادة" },
        ]}
      />

      <h1 className="text-lg font-bold text-foreground sm:text-xl">
        {subject?.subject_name ?? "المادة"} — النماذج الوزارية
      </h1>
      <p className="text-sm text-muted-foreground">
        {selectedTrack
          ? `نماذج ${selectedTrackLabel} فقط، مرتبة من السنة الأحدث إلى الأقدم.`
          : "اختر منهج الاختبارات أولاً حتى لا تختلط نماذج صنعاء وعدن."}
      </p>

      {!selectedTrack && (
        <section
          aria-labelledby="subject-track-choice-title"
          className="rounded-2xl border border-primary/15 bg-card p-4 shadow-sm"
        >
          <h2 id="subject-track-choice-title" className="text-sm font-bold text-foreground">
            اختر منهج الاختبارات
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            هذا الرابط لم يحدد منهجاً؛ اختر المسار قبل عرض النماذج.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link
              to="/ministerial-exams/$subjectId"
              params={{ subjectId }}
              search={{ track: "sanaa" }}
              className="flex min-h-11 items-center justify-between rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              نماذج منهج صنعاء
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              to="/ministerial-exams/$subjectId"
              params={{ subjectId }}
              search={{ track: "aden" }}
              className="flex min-h-11 items-center justify-between rounded-xl border border-secondary-foreground/20 bg-secondary/50 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-secondary-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              نماذج منهج عدن
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      )}

      {selectedTrack && (
        <div className="flex justify-start">
          <Link
            to="/ministerial-exams"
            search={{}}
            className="inline-flex min-h-10 items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            تغيير المنهج
          </Link>
        </div>
      )}

      {selectedTrack && isLoading && (
        <StateMessage variant="loading">جارٍ تحميل النماذج…</StateMessage>
      )}
      {selectedTrack && error && <StateMessage variant="error">تعذّر تحميل النماذج.</StateMessage>}

      {selectedTrack && !isLoading && !error && filteredModels.length === 0 && (
        <StateMessage>
          لا توجد نماذج وزارية منشورة لهذه المادة في {selectedTrackLabel}.
        </StateMessage>
      )}

      {selectedTrack && yearGroups.length > 0 && (
        <div className="space-y-5">
          {yearGroups.map(([year, models]) => (
            <section key={year} aria-labelledby={`ministerial-year-${year}`} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h2 id={`ministerial-year-${year}`} className="text-base font-bold text-foreground">
                  نماذج عام {year}
                </h2>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-foreground">
                  {models.length} نموذج
                </span>
              </div>
              <ul className="space-y-3">
                {models.map((m) => {
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
                              {roundLabel(m.round_code)}
                              {m.model_label ? ` — ${m.model_label}` : ""}
                            </span>
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                              {selectedTrackLabel}
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
                            {m.last_session_status === "submitted" && (
                              <span>محاولة سابقة مكتملة</span>
                            )}
                            {m.last_session_status === "in_progress" && (
                              <span>لديك محاولة جارية</span>
                            )}
                          </span>
                        </span>
                        <ChevronLeft
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
