import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { StateMessage } from "@/components/student/StudentNav";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  fetchMinisterialSubjects,
  fetchMinisterialTrackModels,
  formatDuration,
  roundLabel,
} from "@/lib/ministerial/ministerial-student-api";
import {
  BarChart3,
  ChevronLeft,
  Clock,
  ListChecks,
  RefreshCw,
  Repeat2,
  ScrollText,
} from "lucide-react";

const searchSchema = z.object({
  track: fallback(z.enum(["sanaa", "aden"]).optional(), undefined),
});

type MinisterialTrack = "sanaa" | "aden";

const TRACK_OPTIONS: Array<{
  code: MinisterialTrack;
  title: string;
  description: string;
}> = [
  {
    code: "sanaa",
    title: "نماذج منهج صنعاء",
    description: "الاختبارات الوزارية السابقة الخاصة بمنهج صنعاء.",
  },
  {
    code: "aden",
    title: "نماذج منهج عدن",
    description: "الاختبارات الوزارية السابقة الخاصة بمنهج عدن.",
  },
];

export const Route = createFileRoute("/_authenticated/ministerial-exams/")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "نماذج الاختبارات الوزارية — تمكين" },
      {
        name: "description",
        content:
          "استعرض نماذج اختبارات صنعاء وعدن الوزارية السابقة وتدرّب عليها مهما كان مسارك الدراسي.",
      },
      { property: "og:title", content: "نماذج الاختبارات الوزارية — تمكين" },
      {
        property: "og:description",
        content: "نماذج وزارية سابقة مرتبة حسب المادة والسنة والدور.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MinisterialExamsIndex,
});

function MinisterialExamsIndex() {
  const { track } = Route.useSearch();
  const selectedTrack = track ?? null;
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["ministerial-subjects"],
    queryFn: fetchMinisterialSubjects,
    staleTime: 5 * 60 * 1000,
  });
  const {
    data: trackModelsData,
    isLoading: isTrackModelsLoading,
    isFetching: isTrackModelsFetching,
    error: trackModelsError,
    refetch: refetchTrackModels,
  } = useQuery({
    queryKey: ["ministerial-track-models", selectedTrack],
    queryFn: () => fetchMinisterialTrackModels(selectedTrack as MinisterialTrack),
    enabled: selectedTrack !== null,
    staleTime: 5 * 60 * 1000,
  });
  const subjects = data ?? [];
  const trackModels = selectedTrack
    ? (trackModelsData ?? [])
        .filter((model) => model.track_code === selectedTrack)
        .sort((left, right) => right.academic_year - left.academic_year)
    : [];
  const modelCountForTrack = (subject: (typeof subjects)[number], trackCode: MinisterialTrack) =>
    trackCode === "sanaa" ? subject.sanaa_models_count : subject.aden_models_count;
  const selectedTrackLabel = selectedTrack === "sanaa" ? "منهج صنعاء" : "منهج عدن";
  const selectedSubjectCount = new Set(trackModels.map((model) => model.subject_id)).size;
  const modelsByYear = trackModels.reduce<Map<number, typeof trackModels>>((groups, model) => {
    const yearModels = groups.get(model.academic_year) ?? [];
    yearModels.push(model);
    groups.set(model.academic_year, yearModels);
    return groups;
  }, new Map());
  const yearGroups = [...modelsByYear.entries()].sort(([left], [right]) => right - left);

  return (
    <div className="space-y-4 pb-6" dir="rtl">
      <Breadcrumbs items={[{ label: "نماذج الاختبارات الوزارية" }]} />

      <header className="rounded-2xl border border-primary/15 bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-hero-gradient">
            <ScrollText className="h-5 w-5 text-primary-foreground" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground sm:text-xl">
              {selectedTrack ? `نماذج ${selectedTrackLabel}` : "نماذج الاختبارات الوزارية"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedTrack
                ? "تصفح نماذج المسار مرتبة حسب السنوات، ثم اختر النموذج الذي تريد تطبيقه."
                : "اختر منهج صنعاء أو منهج عدن أولاً؛ كلاهما متاح لأي طالب ثالث ثانوي."}
            </p>
          </div>
        </div>

        {selectedTrack && !isTrackModelsLoading && !trackModelsError && trackModels.length > 0 && (
          <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4 text-center">
            <div>
              <dt className="text-[11px] text-muted-foreground">نماذج المسار</dt>
              <dd className="mt-0.5 text-base font-bold text-foreground">{trackModels.length}</dd>
            </div>
            <div className="border-r border-border">
              <dt className="text-[11px] text-muted-foreground">المواد المتاحة</dt>
              <dd className="mt-0.5 text-base font-bold text-foreground">{selectedSubjectCount}</dd>
            </div>
          </dl>
        )}
      </header>

      {!isLoading && !error && !selectedTrack && (
        <section aria-labelledby="ministerial-track-title" className="space-y-3">
          <div>
            <h2 id="ministerial-track-title" className="text-base font-bold text-foreground">
              اختر منهج الاختبارات
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              لن تختلط النماذج؛ ستظهر لك نماذج المنهج الذي تختاره فقط.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {TRACK_OPTIONS.map((option) => {
              const modelsCount = subjects.reduce(
                (total, subject) => total + modelCountForTrack(subject, option.code),
                0,
              );
              return (
                <li key={option.code}>
                  <Link
                    to="/ministerial-exams"
                    search={{ track: option.code }}
                    className={
                      option.code === "sanaa"
                        ? "group flex h-full min-h-32 items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-5 transition hover:border-primary/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        : "group flex h-full min-h-32 items-center justify-between gap-3 rounded-2xl border border-secondary-foreground/20 bg-secondary/50 p-5 transition hover:border-secondary-foreground/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    }
                  >
                    <span className="min-w-0">
                      <span className="block text-base font-bold text-foreground">
                        {option.title}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {option.description}
                      </span>
                      <span className="mt-3 inline-flex rounded-full bg-card px-2.5 py-1 text-xs font-bold text-foreground shadow-sm">
                        {modelsCount} نموذج متاح
                      </span>
                    </span>
                    <ChevronLeft
                      className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:text-primary"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
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

      {selectedTrack && (
        <nav className="grid gap-2 sm:grid-cols-2">
          <Link
            to="/ministerial-exams/performance"
            className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">محاولاتك ونتائجك</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                تابع درجاتك والدروس التي تحتاج مراجعة.
              </span>
            </span>
            <ChevronLeft
              className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary"
              aria-hidden
            />
          </Link>
          <Link
            to="/ministerial-exams/repeated"
            className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <Repeat2 className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">
                الأسئلة الأكثر تكراراً
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                راجع الأسئلة المتكررة في السنوات السابقة.
              </span>
            </span>
            <ChevronLeft
              className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary"
              aria-hidden
            />
          </Link>
        </nav>
      )}

      {!selectedTrack && isLoading && (
        <StateMessage variant="loading">جارٍ تحميل المناهج…</StateMessage>
      )}
      {!selectedTrack && error && (
        <StateMessage variant="error">
          <p>تعذّر تحميل النماذج الوزارية.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3 gap-1"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} aria-hidden />
            إعادة المحاولة
          </Button>
        </StateMessage>
      )}

      {!selectedTrack && !isLoading && !error && subjects.length === 0 && (
        <StateMessage>
          لا توجد نماذج وزارية منشورة لصفك الدراسي حالياً. ستظهر هنا بعد اعتماد أول نموذج.
        </StateMessage>
      )}

      {selectedTrack && isTrackModelsLoading && (
        <StateMessage variant="loading">جارٍ تحميل نماذج {selectedTrackLabel}…</StateMessage>
      )}

      {selectedTrack && trackModelsError && (
        <StateMessage variant="error">
          <p>تعذّر تحميل نماذج {selectedTrackLabel}.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3 gap-1"
            onClick={() => void refetchTrackModels()}
            disabled={isTrackModelsFetching}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isTrackModelsFetching ? "animate-spin" : ""}`}
              aria-hidden
            />
            إعادة المحاولة
          </Button>
        </StateMessage>
      )}

      {selectedTrack && !isTrackModelsLoading && !trackModelsError && trackModels.length === 0 && (
        <StateMessage>لا توجد نماذج منشورة في {selectedTrackLabel} حالياً.</StateMessage>
      )}

      {selectedTrack && !isTrackModelsLoading && !trackModelsError && yearGroups.length > 0 && (
        <div className="space-y-5">
          {yearGroups.map(([year, models]) => (
            <section
              key={year}
              aria-labelledby={`ministerial-track-year-${year}`}
              className="space-y-2"
            >
              <div className="flex items-center justify-between gap-3">
                <h2
                  id={`ministerial-track-year-${year}`}
                  className="text-base font-bold text-foreground"
                >
                  نماذج عام {year}
                </h2>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-foreground">
                  {models.length} نموذج
                </span>
              </div>

              <ul className="space-y-3">
                {models.map((model) => {
                  const duration = formatDuration(model.duration_seconds);
                  return (
                    <li key={model.model_id}>
                      <Link
                        to="/ministerial-exams/models/$modelId"
                        params={{ modelId: model.model_id }}
                        aria-label={`${model.subject_name}، نموذج عام ${model.academic_year}، ${selectedTrackLabel}`}
                        className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-foreground">{model.subject_name}</span>
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                              {selectedTrackLabel}
                            </span>
                          </span>
                          <span className="mt-1 block text-sm text-foreground">
                            {roundLabel(model.round_code)}
                            {model.model_label ? ` — ${model.model_label}` : ""}
                          </span>
                          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <ListChecks className="h-3.5 w-3.5" aria-hidden />
                              {model.question_count} سؤال
                            </span>
                            {duration && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" aria-hidden />
                                {duration}
                              </span>
                            )}
                            {model.last_session_status === "submitted" && (
                              <span>محاولة سابقة مكتملة</span>
                            )}
                            {model.last_session_status === "in_progress" && (
                              <span>لديك محاولة جارية</span>
                            )}
                          </span>
                        </span>
                        <ChevronLeft
                          className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary"
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
